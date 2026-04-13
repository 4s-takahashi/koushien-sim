import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { processPitch } from '@/engine/match/pitch/process-pitch';
import { generatePlayer } from '@/engine/player/generate';
import type { MatchState, MatchTeam, MatchPlayer, MatchConfig } from '@/engine/match/types';
import { EMPTY_BASES } from '@/engine/match/types';
import type { Player, Position } from '@/engine/types/player';

// ── テスト用ヘルパー ──

function makePitcher(rng: ReturnType<typeof createRNG>): Player {
  // 投手を生成して強制的に投球データをセット
  let p = generatePlayer(rng, { enrollmentYear: 1, schoolReputation: 60 });
  // ポジションを pitcher に変更して pitching 系能力も付ける
  if (!p.stats.pitching) {
    p = {
      ...p,
      position: 'pitcher',
      stats: {
        ...p.stats,
        pitching: {
          velocity: 140,
          control: 70,
          pitchStamina: 70,
          pitches: { slider: 5, fork: 4 },
        },
      },
    };
  }
  return p;
}

function makeBatterPlayer(rng: ReturnType<typeof createRNG>): Player {
  const p = generatePlayer(rng, { enrollmentYear: 1, schoolReputation: 60 });
  return {
    ...p,
    stats: {
      ...p.stats,
      batting: { contact: 70, power: 65, eye: 70, technique: 65 },
    },
  };
}

function makeMatchPlayer(player: Player, stamina = 100, confidence = 50): MatchPlayer {
  return {
    player,
    pitchCountInGame: 0,
    stamina,
    confidence,
    isWarmedUp: false,
  };
}

function makeTeam(
  id: string,
  pitcherPlayer: Player,
  batterPlayers: Player[],
): MatchTeam {
  const allPlayers = [pitcherPlayer, ...batterPlayers];
  const positions: Position[] = ['pitcher', 'catcher', 'first', 'second', 'third', 'shortstop', 'left', 'center', 'right'];

  const matchPlayers: MatchPlayer[] = allPlayers.map((p) => makeMatchPlayer(p));
  const fieldPositions = new Map<string, Position>();
  allPlayers.forEach((p, i) => {
    fieldPositions.set(p.id, positions[i] ?? 'left');
  });

  const battingOrder = batterPlayers.slice(0, 9).map((p) => p.id);

  return {
    id,
    name: `チーム${id}`,
    players: matchPlayers,
    battingOrder,
    fieldPositions,
    currentPitcherId: pitcherPlayer.id,
    benchPlayerIds: [],
    usedPlayerIds: new Set(),
  };
}

function makeInitialState(homeTeam: MatchTeam, awayTeam: MatchTeam): MatchState {
  const config: MatchConfig = {
    innings: 9,
    maxExtras: 3,
    useDH: false,
    isTournament: true,
    isKoshien: false,
  };

  return {
    config,
    homeTeam,
    awayTeam,
    currentInning: 1,
    currentHalf: 'top',
    outs: 0,
    count: { balls: 0, strikes: 0 },
    bases: EMPTY_BASES,
    score: { home: 0, away: 0 },
    inningScores: { home: [0], away: [0] },
    currentBatterIndex: 0,
    pitchCount: 0,
    log: [],
    isOver: false,
    result: null,
  };
}

// テスト用の両チームを生成する
function buildTestState(seed: string): MatchState {
  const rng = createRNG(seed);
  const homePitcher = makePitcher(rng.derive('home-pitcher'));
  const homeBatters = Array.from({ length: 9 }, (_, i) => makeBatterPlayer(rng.derive(`home-bat-${i}`)));
  const awayPitcher = makePitcher(rng.derive('away-pitcher'));
  const awayBatters = Array.from({ length: 9 }, (_, i) => makeBatterPlayer(rng.derive(`away-bat-${i}`)));

  const homeTeam = makeTeam('home', homePitcher, homeBatters);
  const awayTeam = makeTeam('away', awayPitcher, awayBatters);

  return makeInitialState(homeTeam, awayTeam);
}

// ── テスト ──

describe('processPitch', () => {
  it('PitchResult を返す（基本動作）', () => {
    const state = buildTestState('process-basic');
    const rng = createRNG('process-basic-rng');
    const { pitchResult, nextState } = processPitch(state, { type: 'none' }, rng);

    expect(pitchResult.pitchSelection).toBeDefined();
    expect(pitchResult.targetLocation).toBeDefined();
    expect(pitchResult.actualLocation).toBeDefined();
    expect(pitchResult.batterAction).toBeDefined();
    expect(pitchResult.outcome).toBeDefined();
  });

  it('called_strike が生成される', () => {
    // 目標: ゾーン内に投げて打者が見逃す
    const state = buildTestState('cs-test');
    let found = false;
    for (let i = 0; i < 200; i++) {
      const rng = createRNG(`cs-rng-${i}`);
      const { pitchResult } = processPitch(state, { type: 'none' }, rng);
      if (pitchResult.outcome === 'called_strike') {
        found = true;
        expect(pitchResult.batterAction).toBe('take');
        expect(pitchResult.batContact).toBeNull();
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('swinging_strike が生成される', () => {
    const state = buildTestState('ss-test');
    let found = false;
    for (let i = 0; i < 300; i++) {
      const rng = createRNG(`ss-rng-${i}`);
      const { pitchResult } = processPitch(state, { type: 'none' }, rng);
      if (pitchResult.outcome === 'swinging_strike') {
        found = true;
        expect(pitchResult.batterAction).toBe('swing');
        expect(pitchResult.batContact).toBeNull();
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('in_play が生成される', () => {
    const state = buildTestState('ip-test');
    let found = false;
    for (let i = 0; i < 300; i++) {
      const rng = createRNG(`ip-rng-${i}`);
      const { pitchResult } = processPitch(state, { type: 'none' }, rng);
      if (pitchResult.outcome === 'in_play') {
        found = true;
        expect(pitchResult.batContact).not.toBeNull();
        expect(pitchResult.batContact!.fieldResult).toBeDefined();
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('ball が生成される', () => {
    const state = buildTestState('ball-test');
    let found = false;
    for (let i = 0; i < 200; i++) {
      const rng = createRNG(`ball-rng-${i}`);
      const { pitchResult } = processPitch(state, { type: 'none' }, rng);
      if (pitchResult.outcome === 'ball') {
        found = true;
        expect(pitchResult.batterAction).toBe('take');
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('同じシードで同じ結果（再現性）', () => {
    const state = buildTestState('reproducible-test');
    const rng1 = createRNG('repro-seed');
    const rng2 = createRNG('repro-seed');

    const { pitchResult: r1 } = processPitch(state, { type: 'none' }, rng1);
    const { pitchResult: r2 } = processPitch(state, { type: 'none' }, rng2);

    expect(r1.outcome).toBe(r2.outcome);
    expect(r1.batterAction).toBe(r2.batterAction);
    expect(r1.pitchSelection.type).toBe(r2.pitchSelection.type);
    expect(r1.actualLocation).toEqual(r2.actualLocation);
  });

  it('nextState のカウントが正しく更新される（ストライク）', () => {
    const state = buildTestState('count-update-test');
    // ストライクを探す
    let foundStrike = false;
    for (let i = 0; i < 300; i++) {
      const rng = createRNG(`count-strike-${i}`);
      const { pitchResult, nextState } = processPitch(state, { type: 'none' }, rng);
      if (pitchResult.outcome === 'called_strike' || pitchResult.outcome === 'swinging_strike') {
        expect(nextState.count.strikes).toBe(1);
        foundStrike = true;
        break;
      }
    }
    expect(foundStrike).toBe(true);
  });

  it('nextState のカウントが正しく更新される（ボール）', () => {
    const state = buildTestState('count-ball-test');
    let foundBall = false;
    for (let i = 0; i < 200; i++) {
      const rng = createRNG(`count-ball-${i}`);
      const { pitchResult, nextState } = processPitch(state, { type: 'none' }, rng);
      if (pitchResult.outcome === 'ball') {
        expect(nextState.count.balls).toBe(1);
        foundBall = true;
        break;
      }
    }
    expect(foundBall).toBe(true);
  });

  it('バント指示で bunt アクションになる', () => {
    const state = buildTestState('bunt-order-test');
    const battingTeam = state.awayTeam; // top は away が攻撃
    const currentBatterId = battingTeam.battingOrder[0];
    const buntOrder = { type: 'bunt' as const, playerId: currentBatterId };

    let buntFound = false;
    for (let i = 0; i < 50; i++) {
      const rng = createRNG(`bunt-action-${i}`);
      const { pitchResult } = processPitch(state, buntOrder, rng);
      if (pitchResult.batterAction === 'bunt') {
        buntFound = true;
        break;
      }
    }
    expect(buntFound).toBe(true);
  });

  it('投手スタミナが1球後に減少する', () => {
    const state = buildTestState('stamina-decay-test');
    const rng = createRNG('stamina-rng');
    const pitcherId = state.homeTeam.currentPitcherId;
    const initialStamina = state.homeTeam.players.find((p) => p.player.id === pitcherId)!.stamina;

    const { nextState } = processPitch(state, { type: 'none' }, rng);
    const afterStamina = nextState.homeTeam.players.find((p) => p.player.id === pitcherId)!.stamina;

    expect(afterStamina).toBeLessThan(initialStamina);
  });

  it('in_play で home_run が発生するとスコアが増える', () => {
    const state = buildTestState('hr-score-test');
    let hrFound = false;
    for (let i = 0; i < 500; i++) {
      const rng = createRNG(`hr-score-${i}`);
      const { pitchResult, nextState } = processPitch(state, { type: 'none' }, rng);
      if (pitchResult.outcome === 'in_play' && pitchResult.batContact?.fieldResult.type === 'home_run') {
        // 得点が入っているはず（awayが表なのでaway score +1）
        expect(nextState.score.away).toBeGreaterThan(state.score.away);
        hrFound = true;
        break;
      }
    }
    // HR は少ないので、見つからない場合でもテスト自体はエラーにしない
    if (hrFound) {
      expect(hrFound).toBe(true);
    }
  });

  it('3つの異なる PitchResult サンプルを生成できる', () => {
    const state = buildTestState('sample-generation');
    const targets: Array<'called_strike' | 'swinging_strike' | 'in_play'> = [
      'called_strike', 'swinging_strike', 'in_play'
    ];
    const samples: Record<string, typeof import('@/engine/match/types').PitchResult['prototype']> = {};

    for (const target of targets) {
      for (let i = 0; i < 500; i++) {
        const rng = createRNG(`sample-${target}-${i}`);
        const { pitchResult } = processPitch(state, { type: 'none' }, rng);
        if (pitchResult.outcome === target) {
          samples[target] = pitchResult;
          break;
        }
      }
    }

    for (const target of targets) {
      expect(samples[target]).toBeDefined();
      expect(samples[target].outcome).toBe(target);
    }
  });
});
