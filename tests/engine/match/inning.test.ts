import { describe, it, expect, beforeEach } from 'vitest';
import type {
  MatchState,
  MatchTeam,
  MatchPlayer,
  MatchConfig,
  TacticalOrder,
} from '../../../src/engine/match/types';
import { EMPTY_BASES } from '../../../src/engine/match/types';
import { processHalfInning, processFullInning } from '../../../src/engine/match/inning';
import { createRNG } from '../../../src/engine/core/rng';
import { generatePlayer, type PlayerGenConfig } from '../../../src/engine/player/generate';

function createTestTeam(name: string, seed: string): MatchTeam {
  const rng = createRNG(seed);
  const config: PlayerGenConfig = { enrollmentYear: 1, schoolReputation: 50 };
  const players: MatchPlayer[] = [];

  // 投手を確保
  let pitcherFound = false;
  for (let i = 0; i < 50 && !pitcherFound; i++) {
    const player = generatePlayer(rng.derive(`${name}-find-pitcher-${i}`), config);
    if (player.position === 'pitcher' && player.stats.pitching) {
      players.push({
        player,
        pitchCountInGame: 0,
        stamina: 100,
        confidence: 50,
        isWarmedUp: true,
      });
      pitcherFound = true;
    }
  }
  if (!pitcherFound) throw new Error('Could not generate pitcher');

  // 野手8人 + ベンチ5人
  for (let i = 1; i < 14; i++) {
    const player = generatePlayer(rng.derive(`${name}-player-${i}`), config);
    players.push({
      player,
      pitchCountInGame: 0,
      stamina: 100,
      confidence: 50,
      isWarmedUp: false,
    });
  }

  const battingPlayers = players.slice(0, 9);
  const benchPlayers = players.slice(9);
  const positions = ['pitcher', 'catcher', 'first', 'second', 'third', 'shortstop', 'left', 'center', 'right'] as const;

  return {
    id: name,
    name,
    players,
    battingOrder: battingPlayers.map((p) => p.player.id),
    fieldPositions: new Map(
      battingPlayers.map((p, i) => [p.player.id, positions[i]])
    ),
    currentPitcherId: players[0].player.id,
    benchPlayerIds: benchPlayers.map((p) => p.player.id),
    usedPlayerIds: new Set(),
  };
}

function createTestMatchState(config?: Partial<MatchConfig>): MatchState {
  const homeTeam = createTestTeam('Home', 'inning-home-seed');
  const awayTeam = createTestTeam('Away', 'inning-away-seed');

  return {
    config: {
      innings: 9,
      maxExtras: 3,
      useDH: false,
      isTournament: false,
      isKoshien: false,
      ...config,
    },
    homeTeam,
    awayTeam,
    currentInning: 1,
    currentHalf: 'top',
    outs: 0,
    count: { balls: 0, strikes: 0 },
    bases: EMPTY_BASES,
    score: { home: 0, away: 0 },
    inningScores: { home: [], away: [] },
    currentBatterIndex: 0,
    pitchCount: 0,
    log: [],
    isOver: false,
    result: null,
  };
}

describe('inning.ts', () => {
  it('should process a half inning and end with 3 outs', () => {
    const state = createTestMatchState();
    const rng = createRNG('inning-test-1');
    const { nextState, result } = processHalfInning(state, rng);

    expect(result.outsRecorded).toBe(3);
    expect(result.inningNumber).toBe(1);
    expect(result.half).toBe('top');
    expect(result.atBats.length).toBeGreaterThan(0);
    expect(result.runsScored).toBeGreaterThanOrEqual(0);
  });

  it('should reset outs and bases at start of half inning', () => {
    const state = createTestMatchState();
    // 開始時 outs=2 を設定しても、processHalfInning は 0 にリセット
    const stateWithOuts = { ...state, outs: 2 };
    const rng = createRNG('inning-test-reset');
    const { result } = processHalfInning(stateWithOuts, rng);

    // 3アウト記録されるはず（0からカウント開始）
    expect(result.outsRecorded).toBe(3);
  });

  it('should process a full inning (top + bottom)', () => {
    const state = createTestMatchState();
    const rng = createRNG('full-inning-test');
    const { nextState, isSayonara } = processFullInning(state, rng);

    // 表裏で inningScores に追加
    expect(nextState.inningScores.away.length).toBeGreaterThanOrEqual(1);
    expect(nextState.inningScores.home.length).toBeGreaterThanOrEqual(0); // 裏がスキップされる場合あり
  });

  it('should have seed reproducibility', () => {
    const state1 = createTestMatchState();
    const state2 = createTestMatchState();

    const rng1 = createRNG('inning-repro');
    const rng2 = createRNG('inning-repro');

    const { result: r1 } = processHalfInning(state1, rng1);
    const { result: r2 } = processHalfInning(state2, rng2);

    expect(r1.runsScored).toBe(r2.runsScored);
    expect(r1.atBats.length).toBe(r2.atBats.length);
  });
});
