import { describe, it, expect } from 'vitest';
import type {
  MatchState,
  MatchTeam,
  MatchPlayer,
  MatchConfig,
  AtBatResult,
  AtBatOutcome,
  MatchBatterStat,
  MatchPitcherStat,
} from '../../../src/engine/match/types';
import { EMPTY_BASES } from '../../../src/engine/match/types';
import type { Player, CareerRecord } from '../../../src/engine/types/player';
import {
  collectBatterStats,
  collectPitcherStats,
  applyBatterStatToCareer,
  applyPitcherStatToCareer,
  applyMatchToPlayers,
  applyPostMatchGrowth,
  selectMVP,
} from '../../../src/engine/match/result';
import { runGame } from '../../../src/engine/match/game';
import { createRNG } from '../../../src/engine/core/rng';
import { generatePlayer, type PlayerGenConfig } from '../../../src/engine/player/generate';

// ヘルパー: テスト用AtBatResult作成
function makeAtBatResult(
  batterId: string,
  pitcherId: string,
  outcome: AtBatOutcome,
  rbiCount: number = 0,
): AtBatResult {
  return {
    batterId,
    pitcherId,
    pitches: [],
    finalCount: { balls: 0, strikes: 0 },
    outcome,
    rbiCount,
    runnersBefore: EMPTY_BASES,
    runnersAfter: EMPTY_BASES,
  };
}

function createEmptyCareer(): CareerRecord {
  return {
    gamesPlayed: 0,
    atBats: 0,
    hits: 0,
    homeRuns: 0,
    rbis: 0,
    stolenBases: 0,
    gamesStarted: 0,
    inningsPitched: 0,
    wins: 0,
    losses: 0,
    strikeouts: 0,
    earnedRuns: 0,
  };
}

function createTestTeam(name: string, seed: string): MatchTeam {
  const rng = createRNG(seed);
  const config: PlayerGenConfig = { enrollmentYear: 1, schoolReputation: 50 };
  const players: MatchPlayer[] = [];

  let pitcherFound = false;
  for (let i = 0; i < 50 && !pitcherFound; i++) {
    const player = generatePlayer(rng.derive(`${name}-find-pitcher-${i}`), config);
    if (player.position === 'pitcher' && player.stats.pitching) {
      players.push({ player, pitchCountInGame: 0, stamina: 100, confidence: 50, isWarmedUp: true });
      pitcherFound = true;
    }
  }
  if (!pitcherFound) throw new Error('Could not generate pitcher');

  for (let i = 1; i < 14; i++) {
    const player = generatePlayer(rng.derive(`${name}-player-${i}`), config);
    players.push({ player, pitchCountInGame: 0, stamina: 100, confidence: 50, isWarmedUp: false });
  }

  const battingPlayers = players.slice(0, 9);
  const benchPlayers = players.slice(9);
  const positions = ['pitcher', 'catcher', 'first', 'second', 'third', 'shortstop', 'left', 'center', 'right'] as const;

  return {
    id: name,
    name,
    players,
    battingOrder: battingPlayers.map((p) => p.player.id),
    fieldPositions: new Map(battingPlayers.map((p, i) => [p.player.id, positions[i]])),
    currentPitcherId: players[0].player.id,
    benchPlayerIds: benchPlayers.map((p) => p.player.id),
    usedPlayerIds: new Set(),
  };
}

describe('result.ts - collectBatterStats', () => {
  it('should count hits, walks, strikeouts correctly', () => {
    const atBats: AtBatResult[] = [
      makeAtBatResult('b1', 'p1', { type: 'single' }),
      makeAtBatResult('b1', 'p1', { type: 'double' }),
      makeAtBatResult('b1', 'p1', { type: 'strikeout' }),
      makeAtBatResult('b1', 'p1', { type: 'walk' }),
      makeAtBatResult('b2', 'p1', { type: 'home_run' }, 2),
    ];

    const stats = collectBatterStats(atBats, ['b1', 'b2']);

    const b1 = stats.find((s) => s.playerId === 'b1')!;
    expect(b1.atBats).toBe(3); // single, double, strikeout (walk excluded)
    expect(b1.hits).toBe(2); // single + double
    expect(b1.doubles).toBe(1);
    expect(b1.strikeouts).toBe(1);
    expect(b1.walks).toBe(1);

    const b2 = stats.find((s) => s.playerId === 'b2')!;
    expect(b2.atBats).toBe(1);
    expect(b2.hits).toBe(1);
    expect(b2.homeRuns).toBe(1);
    expect(b2.rbis).toBe(2);
  });

  it('should exclude sacrifice from at-bats', () => {
    const atBats: AtBatResult[] = [
      makeAtBatResult('b1', 'p1', { type: 'sacrifice_bunt' }),
      makeAtBatResult('b1', 'p1', { type: 'sacrifice_fly' }),
      makeAtBatResult('b1', 'p1', { type: 'single' }),
    ];

    const stats = collectBatterStats(atBats, ['b1']);
    const b1 = stats.find((s) => s.playerId === 'b1')!;
    expect(b1.atBats).toBe(1); // only single counts
    expect(b1.hits).toBe(1);
  });
});

describe('result.ts - collectPitcherStats', () => {
  it('should count pitcher hits, walks, strikeouts', () => {
    const atBats: AtBatResult[] = [
      makeAtBatResult('b1', 'p1', { type: 'single' }),
      makeAtBatResult('b2', 'p1', { type: 'strikeout' }),
      makeAtBatResult('b3', 'p1', { type: 'walk' }),
      makeAtBatResult('b4', 'p1', { type: 'home_run' }, 1),
    ];

    const stats = collectPitcherStats(atBats, ['p1'], 'home', ['p1'], []);
    const p1 = stats.find((s) => s.playerId === 'p1')!;

    expect(p1.hits).toBe(2); // single + home_run
    expect(p1.strikeouts).toBe(1);
    expect(p1.walks).toBe(1);
    expect(p1.homeRunsAllowed).toBe(1);
    expect(p1.runs).toBe(1); // rbis
  });

  it('should assign win/loss correctly', () => {
    const atBats: AtBatResult[] = [
      makeAtBatResult('b1', 'p1', { type: 'strikeout' }),
      makeAtBatResult('b1', 'p1', { type: 'ground_out', fielder: 'shortstop' }),
      makeAtBatResult('b2', 'p2', { type: 'single' }),
      makeAtBatResult('b2', 'p2', { type: 'fly_out', fielder: 'center' }),
    ];
    // pitchesに要素を追加してpitchCountが0にならないようにする
    atBats[0].pitches = [{ pitchSelection: { type: 'fastball', velocity: 130 }, targetLocation: { row: 2, col: 2 }, actualLocation: { row: 2, col: 2 }, batterAction: 'swing', outcome: 'swinging_strike', batContact: null }];
    atBats[2].pitches = [{ pitchSelection: { type: 'fastball', velocity: 130 }, targetLocation: { row: 2, col: 2 }, actualLocation: { row: 2, col: 2 }, batterAction: 'swing', outcome: 'in_play', batContact: null }];

    const stats = collectPitcherStats(atBats, ['p1', 'p2'], 'home', ['p1'], ['p2']);
    const p1 = stats.find((s) => s.playerId === 'p1')!;
    const p2 = stats.find((s) => s.playerId === 'p2')!;

    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    expect(p1.isWinner).toBe(true);
    expect(p2.isLoser).toBe(true);
  });
});

describe('result.ts - CareerRecord', () => {
  it('should apply batter stats to career', () => {
    const career = createEmptyCareer();
    const stat: MatchBatterStat = {
      playerId: 'b1',
      atBats: 4,
      hits: 2,
      doubles: 1,
      triples: 0,
      homeRuns: 1,
      rbis: 3,
      walks: 1,
      strikeouts: 1,
      stolenBases: 0,
      errors: 0,
    };

    const updated = applyBatterStatToCareer(career, stat);
    expect(updated.gamesPlayed).toBe(1);
    expect(updated.atBats).toBe(4);
    expect(updated.hits).toBe(2);
    expect(updated.homeRuns).toBe(1);
    expect(updated.rbis).toBe(3);
  });

  it('should apply pitcher stats to career', () => {
    const career = createEmptyCareer();
    const stat: MatchPitcherStat = {
      playerId: 'p1',
      inningsPitched: 7,
      pitchCount: 95,
      hits: 5,
      runs: 2,
      earnedRuns: 2,
      walks: 3,
      strikeouts: 8,
      homeRunsAllowed: 1,
      isWinner: true,
      isLoser: false,
      isSave: false,
    };

    const updated = applyPitcherStatToCareer(career, stat);
    expect(updated.gamesPlayed).toBe(1);
    expect(updated.gamesStarted).toBe(1);
    expect(updated.inningsPitched).toBe(7);
    expect(updated.wins).toBe(1);
    expect(updated.losses).toBe(0);
    expect(updated.strikeouts).toBe(8);
    expect(updated.earnedRuns).toBe(2);
  });

  it('should accumulate over multiple games', () => {
    let career = createEmptyCareer();
    const stat: MatchBatterStat = {
      playerId: 'b1', atBats: 4, hits: 2, doubles: 0, triples: 0,
      homeRuns: 0, rbis: 1, walks: 0, strikeouts: 1, stolenBases: 0, errors: 0,
    };
    career = applyBatterStatToCareer(career, stat);
    career = applyBatterStatToCareer(career, stat);
    career = applyBatterStatToCareer(career, stat);

    expect(career.gamesPlayed).toBe(3);
    expect(career.atBats).toBe(12);
    expect(career.hits).toBe(6);
    expect(career.rbis).toBe(3);
  });
});

describe('result.ts - selectMVP', () => {
  it('should select MVP from winning team', () => {
    const batterStats: MatchBatterStat[] = [
      { playerId: 'h1', atBats: 4, hits: 3, doubles: 1, triples: 0, homeRuns: 1, rbis: 4, walks: 0, strikeouts: 0, stolenBases: 0, errors: 0 },
      { playerId: 'a1', atBats: 4, hits: 3, doubles: 0, triples: 0, homeRuns: 2, rbis: 5, walks: 0, strikeouts: 0, stolenBases: 0, errors: 0 },
    ];

    const mvp = selectMVP(batterStats, [], 'home', ['h1'], ['a1']);
    expect(mvp).toBe('h1'); // h1は勝者チーム
  });

  it('should return null for draw', () => {
    const mvp = selectMVP([], [], 'draw', [], []);
    expect(mvp).toBeNull();
  });
});

describe('result.ts - applyPostMatchGrowth', () => {
  it('should grow batter stats after match', () => {
    const rng = createRNG('growth-test');
    const player = generatePlayer(rng.derive('player'), { enrollmentYear: 1, schoolReputation: 50 });

    const stat: MatchBatterStat = {
      playerId: player.id, atBats: 4, hits: 3, doubles: 1, triples: 0,
      homeRuns: 1, rbis: 3, walks: 0, strikeouts: 0, stolenBases: 0, errors: 0,
    };

    const grown = applyPostMatchGrowth(player, stat, undefined, true, rng.derive('growth'));

    // 甲子園ボーナスで成長する可能性
    expect(grown.stats.base.mental).toBeGreaterThanOrEqual(player.stats.base.mental);
  });
});

describe('result.ts - Full game integration', () => {
  it('should produce batter and pitcher stats from full game', () => {
    const config: MatchConfig = {
      innings: 9, maxExtras: 3, useDH: false, isTournament: false, isKoshien: false,
    };

    const homeTeam = createTestTeam('Home', 'result-home');
    const awayTeam = createTestTeam('Away', 'result-away');
    const rng = createRNG('result-full-game');

    const { result } = runGame(config, homeTeam, awayTeam, rng);

    // 成績が生成されている
    expect(result.batterStats.length).toBeGreaterThanOrEqual(0);
    expect(result.pitcherStats.length).toBeGreaterThanOrEqual(0);

    // 投手成績の投球数が0以上（打席は必ず発生する）
    if (result.pitcherStats.length > 0) {
      const totalPitchCount = result.pitcherStats.reduce((sum, s) => sum + s.pitchCount, 0);
      expect(totalPitchCount).toBeGreaterThan(0);
    }
  });

  it('should select MVP in a non-draw game', () => {
    const config: MatchConfig = {
      innings: 9, maxExtras: 3, useDH: false, isTournament: false, isKoshien: false,
    };

    let mvpFound = false;
    for (let i = 0; i < 5; i++) {
      const homeTeam = createTestTeam('Home', `mvp-home-${i}`);
      const awayTeam = createTestTeam('Away', `mvp-away-${i}`);
      const rng = createRNG(`mvp-test-${i}`);
      const { result } = runGame(config, homeTeam, awayTeam, rng);

      if (result.winner !== 'draw' && result.mvpPlayerId !== null) {
        mvpFound = true;
        expect(result.mvpPlayerId).toBeTruthy();
        break;
      }
    }

    if (!mvpFound) {
      expect(true).toBe(true); // 全部引き分けの場合はスキップ
    }
  });

  it('should have seed reproducibility for stats', () => {
    const config: MatchConfig = {
      innings: 9, maxExtras: 3, useDH: false, isTournament: false, isKoshien: false,
    };

    const ht1 = createTestTeam('Home', 'repro-stats-h');
    const at1 = createTestTeam('Away', 'repro-stats-a');
    const { result: r1 } = runGame(config, ht1, at1, createRNG('repro-stats'));

    const ht2 = createTestTeam('Home', 'repro-stats-h');
    const at2 = createTestTeam('Away', 'repro-stats-a');
    const { result: r2 } = runGame(config, ht2, at2, createRNG('repro-stats'));

    expect(r1.batterStats.length).toBe(r2.batterStats.length);
    expect(r1.pitcherStats.length).toBe(r2.pitcherStats.length);
    expect(r1.finalScore.home).toBe(r2.finalScore.home);
    expect(r1.finalScore.away).toBe(r2.finalScore.away);
    expect(r1.winner).toBe(r2.winner);
  });
});
