/**
 * tests/engine/match/tactics-apply.test.ts
 *
 * applyPinchRun / applyDefensiveSub の単体テスト（Phase 10-A 微修正）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type {
  MatchState,
  MatchTeam,
  MatchPlayer,
  RunnerInfo,
} from '../../../src/engine/match/types';
import { EMPTY_BASES } from '../../../src/engine/match/types';
import {
  applyPinchRun,
  applyDefensiveSub,
} from '../../../src/engine/match/tactics';
import { createRNG } from '../../../src/engine/core/rng';
import { generatePlayer, type PlayerGenConfig } from '../../../src/engine/player/generate';

// ============================================================
// テストヘルパー
// ============================================================

function createTestTeam(name: string, seed: string): MatchTeam {
  const rng = createRNG(seed);
  const config: PlayerGenConfig = { enrollmentYear: 1, schoolReputation: 50 };
  const players: MatchPlayer[] = [];

  // 投手を探す
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
  if (!pitcherFound) throw new Error(`Could not generate pitcher for ${name}`);

  // 残りの選手
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
  const positions = [
    'pitcher', 'catcher', 'first', 'second', 'third',
    'shortstop', 'left', 'center', 'right',
  ] as const;

  return {
    id: name,
    name,
    players,
    battingOrder: battingPlayers.map((p) => p.player.id),
    fieldPositions: new Map(
      battingPlayers.map((p, i) => [p.player.id, positions[i]]),
    ),
    currentPitcherId: players[0].player.id,
    benchPlayerIds: benchPlayers.map((p) => p.player.id),
    usedPlayerIds: new Set(),
  };
}

function createBaseState(homeTeam: MatchTeam, awayTeam: MatchTeam): MatchState {
  return {
    config: {
      innings: 9,
      maxExtras: 3,
      useDH: false,
      isTournament: false,
      isKoshien: false,
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

// ============================================================
// applyPinchRun のテスト
// ============================================================

describe('applyPinchRun', () => {
  let homeTeam: MatchTeam;
  let awayTeam: MatchTeam;
  let baseState: MatchState;

  beforeEach(() => {
    homeTeam = createTestTeam('Home', 'pr-home-seed');
    awayTeam = createTestTeam('Away', 'pr-away-seed');
    baseState = createBaseState(homeTeam, awayTeam);
  });

  it('塁上の outPlayer を inPlayer で置き換える（1塁）', () => {
    const outPlayer = awayTeam.battingOrder[2];
    const inPlayer = awayTeam.benchPlayerIds[0];
    const runner: RunnerInfo = { playerId: outPlayer, speed: 50 };

    const stateWithRunner: MatchState = {
      ...baseState,
      currentHalf: 'top', // away攻撃
      bases: {
        first: runner,
        second: null,
        third: null,
      },
    };

    const next = applyPinchRun(stateWithRunner, outPlayer, inPlayer);

    expect(next.bases.first).not.toBeNull();
    expect(next.bases.first!.playerId).toBe(inPlayer);
    expect(next.bases.second).toBeNull();
    expect(next.bases.third).toBeNull();
  });

  it('2塁の走者を置き換える', () => {
    const outPlayer = awayTeam.battingOrder[3];
    const inPlayer = awayTeam.benchPlayerIds[1];
    const runner: RunnerInfo = { playerId: outPlayer, speed: 50 };

    const stateWithRunner: MatchState = {
      ...baseState,
      currentHalf: 'top',
      bases: {
        first: null,
        second: runner,
        third: null,
      },
    };

    const next = applyPinchRun(stateWithRunner, outPlayer, inPlayer);

    expect(next.bases.second).not.toBeNull();
    expect(next.bases.second!.playerId).toBe(inPlayer);
    expect(next.bases.first).toBeNull();
    expect(next.bases.third).toBeNull();
  });

  it('3塁の走者を置き換える', () => {
    const outPlayer = awayTeam.battingOrder[4];
    const inPlayer = awayTeam.benchPlayerIds[2];
    const runner: RunnerInfo = { playerId: outPlayer, speed: 50 };

    const stateWithRunner: MatchState = {
      ...baseState,
      currentHalf: 'top',
      bases: {
        first: null,
        second: null,
        third: runner,
      },
    };

    const next = applyPinchRun(stateWithRunner, outPlayer, inPlayer);

    expect(next.bases.third).not.toBeNull();
    expect(next.bases.third!.playerId).toBe(inPlayer);
  });

  it('inPlayer の speed が正しく設定される', () => {
    const outPlayer = awayTeam.battingOrder[2];
    const inPlayerMp = awayTeam.players.find(
      (p) => p.player.id === awayTeam.benchPlayerIds[0],
    )!;
    const inPlayerId = inPlayerMp.player.id;
    const expectedSpeed = inPlayerMp.player.stats.base.speed;

    const stateWithRunner: MatchState = {
      ...baseState,
      currentHalf: 'top',
      bases: {
        first: { playerId: outPlayer, speed: 30 },
        second: null,
        third: null,
      },
    };

    const next = applyPinchRun(stateWithRunner, outPlayer, inPlayerId);

    expect(next.bases.first!.speed).toBe(expectedSpeed);
  });

  it('outPlayer が usedPlayerIds に追加される', () => {
    const outPlayer = awayTeam.battingOrder[2];
    const inPlayer = awayTeam.benchPlayerIds[0];

    const stateWithRunner: MatchState = {
      ...baseState,
      currentHalf: 'top',
      bases: {
        first: { playerId: outPlayer, speed: 50 },
        second: null,
        third: null,
      },
    };

    const next = applyPinchRun(stateWithRunner, outPlayer, inPlayer);
    expect(next.awayTeam.usedPlayerIds.has(outPlayer)).toBe(true);
    expect(next.awayTeam.usedPlayerIds.has(inPlayer)).toBe(true);
  });

  it('inPlayer が benchPlayerIds から削除される', () => {
    const outPlayer = awayTeam.battingOrder[2];
    const inPlayer = awayTeam.benchPlayerIds[0];

    const stateWithRunner: MatchState = {
      ...baseState,
      currentHalf: 'top',
      bases: {
        first: { playerId: outPlayer, speed: 50 },
        second: null,
        third: null,
      },
    };

    const next = applyPinchRun(stateWithRunner, outPlayer, inPlayer);
    expect(next.awayTeam.benchPlayerIds).not.toContain(inPlayer);
  });

  it('ログに代走の記録が追加される', () => {
    const outPlayer = awayTeam.battingOrder[2];
    const inPlayer = awayTeam.benchPlayerIds[0];

    const stateWithRunner: MatchState = {
      ...baseState,
      currentHalf: 'top',
      bases: {
        first: { playerId: outPlayer, speed: 50 },
        second: null,
        third: null,
      },
    };

    const next = applyPinchRun(stateWithRunner, outPlayer, inPlayer);
    const lastLog = next.log[next.log.length - 1];
    expect(lastLog.type).toBe('substitution');
    expect(lastLog.description).toContain('Pinch run');
    expect(lastLog.description).toContain(outPlayer);
    expect(lastLog.description).toContain(inPlayer);
  });

  it('裏（home攻撃）では homeTeam の選手が置き換わる', () => {
    const outPlayer = homeTeam.battingOrder[2];
    const inPlayer = homeTeam.benchPlayerIds[0];
    const runner: RunnerInfo = { playerId: outPlayer, speed: 50 };

    const stateWithRunner: MatchState = {
      ...baseState,
      currentHalf: 'bottom', // home攻撃
      bases: {
        first: runner,
        second: null,
        third: null,
      },
    };

    const next = applyPinchRun(stateWithRunner, outPlayer, inPlayer);

    expect(next.bases.first!.playerId).toBe(inPlayer);
    expect(next.homeTeam.usedPlayerIds.has(outPlayer)).toBe(true);
    expect(next.homeTeam.benchPlayerIds).not.toContain(inPlayer);
    // awayTeam は変わらない
    expect(next.awayTeam.benchPlayerIds).toEqual(awayTeam.benchPlayerIds);
  });

  it('存在しない inPlayer の場合は state を変えない', () => {
    const outPlayer = awayTeam.battingOrder[2];

    const stateWithRunner: MatchState = {
      ...baseState,
      currentHalf: 'top',
      bases: {
        first: { playerId: outPlayer, speed: 50 },
        second: null,
        third: null,
      },
    };

    const next = applyPinchRun(stateWithRunner, outPlayer, 'nonexistent-player');
    // inPlayer が見つからないので変更なし
    expect(next.bases.first!.playerId).toBe(outPlayer);
  });

  it('塁上に outPlayer がいない場合は他の走者に影響しない', () => {
    const otherRunner = awayTeam.battingOrder[1];
    const outPlayer = awayTeam.battingOrder[2]; // 塁上にいない
    const inPlayer = awayTeam.benchPlayerIds[0];
    const runner: RunnerInfo = { playerId: otherRunner, speed: 50 };

    const stateWithRunner: MatchState = {
      ...baseState,
      currentHalf: 'top',
      bases: {
        first: runner,
        second: null,
        third: null,
      },
    };

    const next = applyPinchRun(stateWithRunner, outPlayer, inPlayer);
    // 1塁の走者は変わらない
    expect(next.bases.first!.playerId).toBe(otherRunner);
  });
});

// ============================================================
// applyDefensiveSub のテスト
// ============================================================

describe('applyDefensiveSub', () => {
  let homeTeam: MatchTeam;
  let awayTeam: MatchTeam;
  let baseState: MatchState;

  beforeEach(() => {
    homeTeam = createTestTeam('Home', 'ds-home-seed');
    awayTeam = createTestTeam('Away', 'ds-away-seed');
    baseState = createBaseState(homeTeam, awayTeam);
  });

  it('守備側の battingOrder が更新される（top = home守備）', () => {
    const outPlayer = homeTeam.battingOrder[1]; // catcher を交代
    const inPlayer = homeTeam.benchPlayerIds[0];

    const stateTop: MatchState = {
      ...baseState,
      currentHalf: 'top', // home守備
    };

    const next = applyDefensiveSub(stateTop, {
      type: 'defensive_sub',
      outPlayerId: outPlayer,
      inPlayerId: inPlayer,
      position: 'catcher',
    });

    expect(next.homeTeam.battingOrder).toContain(inPlayer);
    expect(next.homeTeam.battingOrder).not.toContain(outPlayer);
    // 同じ位置に入っていること
    const idx = homeTeam.battingOrder.indexOf(outPlayer);
    expect(next.homeTeam.battingOrder[idx]).toBe(inPlayer);
  });

  it('fieldPositions が正しく更新される', () => {
    const outPlayer = homeTeam.battingOrder[2]; // first
    const inPlayer = homeTeam.benchPlayerIds[0];

    const stateTop: MatchState = {
      ...baseState,
      currentHalf: 'top',
    };

    const next = applyDefensiveSub(stateTop, {
      type: 'defensive_sub',
      outPlayerId: outPlayer,
      inPlayerId: inPlayer,
      position: 'first',
    });

    expect(next.homeTeam.fieldPositions.has(outPlayer)).toBe(false);
    expect(next.homeTeam.fieldPositions.get(inPlayer)).toBe('first');
  });

  it('usedPlayerIds が更新される', () => {
    const outPlayer = homeTeam.battingOrder[3];
    const inPlayer = homeTeam.benchPlayerIds[1];

    const stateTop: MatchState = {
      ...baseState,
      currentHalf: 'top',
    };

    const next = applyDefensiveSub(stateTop, {
      type: 'defensive_sub',
      outPlayerId: outPlayer,
      inPlayerId: inPlayer,
      position: 'second',
    });

    expect(next.homeTeam.usedPlayerIds.has(outPlayer)).toBe(true);
    expect(next.homeTeam.usedPlayerIds.has(inPlayer)).toBe(true);
  });

  it('inPlayer が benchPlayerIds から削除される', () => {
    const outPlayer = homeTeam.battingOrder[4];
    const inPlayer = homeTeam.benchPlayerIds[0];

    const stateTop: MatchState = {
      ...baseState,
      currentHalf: 'top',
    };

    const next = applyDefensiveSub(stateTop, {
      type: 'defensive_sub',
      outPlayerId: outPlayer,
      inPlayerId: inPlayer,
      position: 'third',
    });

    expect(next.homeTeam.benchPlayerIds).not.toContain(inPlayer);
  });

  it('ログに守備交代の記録が追加される', () => {
    const outPlayer = homeTeam.battingOrder[5];
    const inPlayer = homeTeam.benchPlayerIds[0];

    const stateTop: MatchState = {
      ...baseState,
      currentHalf: 'top',
    };

    const next = applyDefensiveSub(stateTop, {
      type: 'defensive_sub',
      outPlayerId: outPlayer,
      inPlayerId: inPlayer,
      position: 'shortstop',
    });

    const lastLog = next.log[next.log.length - 1];
    expect(lastLog.type).toBe('substitution');
    expect(lastLog.description).toContain('Defensive sub');
    expect(lastLog.description).toContain(outPlayer);
    expect(lastLog.description).toContain(inPlayer);
    expect(lastLog.description).toContain('shortstop');
  });

  it('裏（bottom）では away チームが守備側になる', () => {
    const outPlayer = awayTeam.battingOrder[2];
    const inPlayer = awayTeam.benchPlayerIds[0];

    const stateBottom: MatchState = {
      ...baseState,
      currentHalf: 'bottom', // away守備
    };

    const next = applyDefensiveSub(stateBottom, {
      type: 'defensive_sub',
      outPlayerId: outPlayer,
      inPlayerId: inPlayer,
      position: 'left',
    });

    expect(next.awayTeam.battingOrder).toContain(inPlayer);
    expect(next.awayTeam.battingOrder).not.toContain(outPlayer);
    expect(next.awayTeam.fieldPositions.get(inPlayer)).toBe('left');
    // homeTeam は変わらない
    expect(next.homeTeam.battingOrder).toEqual(homeTeam.battingOrder);
  });

  it('outPlayerId が battingOrder にない場合は state を変えない', () => {
    const inPlayer = homeTeam.benchPlayerIds[0];

    const stateTop: MatchState = {
      ...baseState,
      currentHalf: 'top',
    };

    const next = applyDefensiveSub(stateTop, {
      type: 'defensive_sub',
      outPlayerId: 'nonexistent-player',
      inPlayerId: inPlayer,
      position: 'center',
    });

    // 変更なし
    expect(next.homeTeam.battingOrder).toEqual(homeTeam.battingOrder);
    expect(next.homeTeam.benchPlayerIds).toContain(inPlayer);
  });

  it('異なるポジションへの守備交代', () => {
    const outPlayer = homeTeam.battingOrder[8]; // right
    const inPlayer = homeTeam.benchPlayerIds[2];

    const stateTop: MatchState = {
      ...baseState,
      currentHalf: 'top',
    };

    const next = applyDefensiveSub(stateTop, {
      type: 'defensive_sub',
      outPlayerId: outPlayer,
      inPlayerId: inPlayer,
      position: 'right',
    });

    expect(next.homeTeam.fieldPositions.get(inPlayer)).toBe('right');
    expect(next.homeTeam.fieldPositions.has(outPlayer)).toBe(false);
  });
});
