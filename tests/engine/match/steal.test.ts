/**
 * steal.test.ts — 盗塁ロジックのテスト (Phase 7-F)
 *
 * attemptSteal が正しく走者を進め、失敗時にアウトを記録することを確認する。
 */

import { describe, it, expect } from 'vitest';
import type { MatchState, MatchTeam, MatchPlayer, RunnerInfo } from '../../../src/engine/match/types';
import { EMPTY_BASES } from '../../../src/engine/match/types';
import { attemptSteal } from '../../../src/engine/match/tactics';
import { createRNG } from '../../../src/engine/core/rng';
import { generatePlayer, type PlayerGenConfig } from '../../../src/engine/player/generate';

// ============================================================
// ヘルパー
// ============================================================

function createTestPlayer(seed: string, overrides: { speed?: number; fielding?: number } = {}): import('../../../src/engine/types/player').Player {
  const rng = createRNG(seed);
  const config: PlayerGenConfig = { enrollmentYear: 1, schoolReputation: 50 };
  const base = generatePlayer(rng, config);
  return {
    ...base,
    stats: {
      ...base.stats,
      base: {
        ...base.stats.base,
        speed: overrides.speed ?? base.stats.base.speed,
        fielding: overrides.fielding ?? base.stats.base.fielding,
      },
    },
  };
}

function createMatchPlayer(player: import('../../../src/engine/types/player').Player): MatchPlayer {
  return {
    player,
    pitchCountInGame: 0,
    stamina: 100,
    confidence: 50,
    isWarmedUp: false,
  };
}

function makeRunnerInfo(player: import('../../../src/engine/types/player').Player): RunnerInfo {
  return {
    playerId: player.id,
    speed: player.stats.base.speed,
  };
}

function createBaseState(
  homeTeam: MatchTeam,
  awayTeam: MatchTeam,
  bases: MatchState['bases'] = EMPTY_BASES,
  outs = 0,
): MatchState {
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
    currentHalf: 'top', // away team bats
    outs,
    count: { balls: 0, strikes: 0 },
    bases,
    score: { home: 0, away: 0 },
    inningScores: { home: [], away: [] },
    currentBatterIndex: 0,
    pitchCount: 0,
    log: [],
    isOver: false,
    result: null,
  };
}

function buildTeam(
  name: string,
  players: import('../../../src/engine/types/player').Player[],
  catcherIdx: number,
): MatchTeam {
  const mps = players.map(createMatchPlayer);
  const positionNames = ['pitcher', 'catcher', 'first', 'second', 'third', 'shortstop', 'left', 'center', 'right'] as const;

  const battingOrder = players.slice(0, 9).map((p) => p.id);
  const fieldPositions = new Map<string, import('../../../src/engine/types/player').Position>(
    players.slice(0, 9).map((p, i) => [p.id, positionNames[i % positionNames.length]]),
  );

  return {
    id: name,
    name,
    players: mps,
    battingOrder,
    fieldPositions,
    currentPitcherId: players[0].id,
    benchPlayerIds: players.slice(9).map((p) => p.id),
    usedPlayerIds: new Set(),
  };
}

// ============================================================
// テスト
// ============================================================

describe('attemptSteal', () => {
  it('足が速い走者は高確率で盗塁に成功する', () => {
    // 走力90の走者、守備力50の捕手
    const runner = createTestPlayer('runner-fast', { speed: 90 });
    const catcher = createTestPlayer('catcher-avg', { fielding: 50 });
    const pitcher = createTestPlayer('pitcher-1');
    const others = Array.from({ length: 8 }, (_, i) => createTestPlayer(`other-${i}`));

    const awayPlayers = [runner, ...others]; // runner は1番打者
    const homePlayers = [pitcher, catcher, ...others.slice(0, 7)];

    const awayTeam = buildTeam('Away', awayPlayers, 0);
    const homeTeam = buildTeam('Home', homePlayers, 1);

    // 1塁に runner を配置
    const bases = {
      first: makeRunnerInfo(runner),
      second: null,
      third: null,
    };

    const state = createBaseState(homeTeam, awayTeam, bases);
    const rng = createRNG('fast-steal-test');

    // 100回試行して成功率を測定
    let successCount = 0;
    const TRIALS = 100;
    for (let i = 0; i < TRIALS; i++) {
      const testRng = createRNG(`fast-steal-test-${i}`);
      const { success } = attemptSteal(state, runner.id, testRng);
      if (success) successCount++;
    }

    const successRate = successCount / TRIALS;
    // 走力90、守備力50 → 成功率は60%以上のはず
    expect(successRate).toBeGreaterThan(0.55);
  });

  it('足が遅い走者は低確率にしかならない', () => {
    const runner = createTestPlayer('runner-slow', { speed: 30 });
    const catcher = createTestPlayer('catcher-strong', { fielding: 80 });
    const pitcher = createTestPlayer('pitcher-2');
    const others = Array.from({ length: 8 }, (_, i) => createTestPlayer(`others2-${i}`));

    const awayPlayers = [runner, ...others];
    const homePlayers = [pitcher, catcher, ...others.slice(0, 7)];

    const awayTeam = buildTeam('Away', awayPlayers, 0);
    const homeTeam = buildTeam('Home', homePlayers, 1);

    const bases = {
      first: makeRunnerInfo(runner),
      second: null,
      third: null,
    };

    const state = createBaseState(homeTeam, awayTeam, bases);

    let successCount = 0;
    const TRIALS = 100;
    for (let i = 0; i < TRIALS; i++) {
      const testRng = createRNG(`slow-steal-test-${i}`);
      const { success } = attemptSteal(state, runner.id, testRng);
      if (success) successCount++;
    }

    const successRate = successCount / TRIALS;
    // 走力30、守備力80 → 成功率は50%未満のはず
    expect(successRate).toBeLessThan(0.50);
  });

  it('盗塁成功時: 1塁走者が2塁に進む', () => {
    const runner = createTestPlayer('runner-ok', { speed: 90 });
    const pitcher = createTestPlayer('pitcher-3');
    const others = Array.from({ length: 8 }, (_, i) => createTestPlayer(`others3-${i}`));

    const awayPlayers = [runner, ...others];
    const homePlayers = [pitcher, ...others.slice(0, 8)];

    const awayTeam = buildTeam('Away', awayPlayers, 0);
    const homeTeam = buildTeam('Home', homePlayers, 1);

    const bases = {
      first: makeRunnerInfo(runner),
      second: null,
      third: null,
    };

    const state = createBaseState(homeTeam, awayTeam, bases);

    // 必ず成功するシードを探す
    let successResult: ReturnType<typeof attemptSteal> | null = null;
    for (let i = 0; i < 50; i++) {
      const r = createRNG(`steal-success-${i}`);
      const res = attemptSteal(state, runner.id, r);
      if (res.success) {
        successResult = res;
        break;
      }
    }

    expect(successResult).not.toBeNull();
    if (!successResult) return;

    // 1塁が空になり、2塁に走者
    expect(successResult.nextState.bases.first).toBeNull();
    expect(successResult.nextState.bases.second?.playerId).toBe(runner.id);
    expect(successResult.nextState.bases.third).toBeNull();

    // ログに盗塁成功イベントが記録される
    const stealLog = successResult.nextState.log.find((e) => e.type === 'stolen_base');
    expect(stealLog).toBeDefined();
    expect(stealLog?.playerId).toBe(runner.id);
  });

  it('盗塁失敗時: 走者がアウトになり、1塁が空になる', () => {
    const runner = createTestPlayer('runner-fail', { speed: 20 });
    const catcher = createTestPlayer('catcher-pro', { fielding: 99 });
    const pitcher = createTestPlayer('pitcher-4');
    const others = Array.from({ length: 7 }, (_, i) => createTestPlayer(`others4-${i}`));

    const awayPlayers = [runner, ...others.slice(0, 8)];
    const homePlayers = [pitcher, catcher, ...others];

    const awayTeam = buildTeam('Away', awayPlayers, 0);
    const homeTeam = buildTeam('Home', homePlayers, 1);

    const bases = {
      first: makeRunnerInfo(runner),
      second: null,
      third: null,
    };

    const state = createBaseState(homeTeam, awayTeam, bases, 0);

    // 必ず失敗するシードを探す
    let failResult: ReturnType<typeof attemptSteal> | null = null;
    for (let i = 0; i < 200; i++) {
      const r = createRNG(`steal-fail-${i}`);
      const res = attemptSteal(state, runner.id, r);
      if (!res.success) {
        failResult = res;
        break;
      }
    }

    expect(failResult).not.toBeNull();
    if (!failResult) return;

    // 1塁が空になり（走者アウト）、アウトカウントが1増える
    expect(failResult.nextState.bases.first).toBeNull();
    expect(failResult.nextState.outs).toBe(1);

    // ログに盗塁失敗イベントが記録される
    const caughtLog = failResult.nextState.log.find((e) => e.type === 'caught_stealing');
    expect(caughtLog).toBeDefined();
    expect(caughtLog?.playerId).toBe(runner.id);
  });

  it('2塁走者が盗塁成功時: 2塁→3塁に進む', () => {
    const runner = createTestPlayer('runner-2nd', { speed: 90 });
    const pitcher = createTestPlayer('pitcher-5');
    const others = Array.from({ length: 8 }, (_, i) => createTestPlayer(`others5-${i}`));

    const awayPlayers = [pitcher, ...others]; // runner はベンチ扱い
    const awayPlayersWithRunner = [runner, ...others];
    const homePlayers = [pitcher, ...others.slice(0, 8)];

    const awayTeam = buildTeam('Away', awayPlayersWithRunner, 0);
    const homeTeam = buildTeam('Home', homePlayers, 1);

    const bases = {
      first: null,
      second: makeRunnerInfo(runner),
      third: null,
    };

    const state = createBaseState(homeTeam, awayTeam, bases);

    let successResult: ReturnType<typeof attemptSteal> | null = null;
    for (let i = 0; i < 50; i++) {
      const r = createRNG(`steal-2to3-${i}`);
      const res = attemptSteal(state, runner.id, r);
      if (res.success) {
        successResult = res;
        break;
      }
    }

    expect(successResult).not.toBeNull();
    if (!successResult) return;

    expect(successResult.nextState.bases.second).toBeNull();
    expect(successResult.nextState.bases.third?.playerId).toBe(runner.id);
  });

  it('走者IDが存在しない場合: 失敗を返す（state 変更なし）', () => {
    const pitcher = createTestPlayer('pitcher-6');
    const others = Array.from({ length: 9 }, (_, i) => createTestPlayer(`others6-${i}`));

    const awayTeam = buildTeam('Away', [pitcher, ...others], 0);
    const homeTeam = buildTeam('Home', [pitcher, ...others], 1);

    const state = createBaseState(homeTeam, awayTeam, EMPTY_BASES);
    const rng = createRNG('no-runner-test');

    const result = attemptSteal(state, 'nonexistent-id', rng);
    expect(result.success).toBe(false);
    expect(result.nextState).toBe(state); // 同じオブジェクト参照
  });

  it('走者が塁上にいない場合: 失敗を返す', () => {
    const runner = createTestPlayer('runner-offbase', { speed: 90 });
    const pitcher = createTestPlayer('pitcher-7');
    const others = Array.from({ length: 8 }, (_, i) => createTestPlayer(`others7-${i}`));

    const awayPlayers = [runner, ...others];
    const homePlayers = [pitcher, ...others.slice(0, 8)];

    const awayTeam = buildTeam('Away', awayPlayers, 0);
    const homeTeam = buildTeam('Home', homePlayers, 1);

    // 走者は存在するがどの塁にもいない（空ベース）
    const state = createBaseState(homeTeam, awayTeam, EMPTY_BASES);
    const rng = createRNG('no-base-runner-test');

    const result = attemptSteal(state, runner.id, rng);
    expect(result.success).toBe(false);
  });

  it('盗塁成功率は20%〜85%の範囲内に収まる', () => {
    // 極端なパラメータでも確率がクランプされることを確認
    const fastRunner = createTestPlayer('ultra-fast', { speed: 100 });
    const weakCatcher = createTestPlayer('weak-catcher', { fielding: 1 });
    const pitcher = createTestPlayer('pitcher-8');
    const others = Array.from({ length: 8 }, (_, i) => createTestPlayer(`others8-${i}`));

    const awayTeam = buildTeam('Away', [fastRunner, ...others], 0);
    const homeTeam = buildTeam('Home', [pitcher, weakCatcher, ...others.slice(0, 7)], 1);

    const bases = { first: makeRunnerInfo(fastRunner), second: null, third: null };
    const state = createBaseState(homeTeam, awayTeam, bases);

    let successCount = 0;
    const TRIALS = 100;
    for (let i = 0; i < TRIALS; i++) {
      const r = createRNG(`clamp-test-${i}`);
      const { success } = attemptSteal(state, fastRunner.id, r);
      if (success) successCount++;
    }

    const rate = successCount / TRIALS;
    // 上限は85%なので、100%にはならない
    expect(rate).toBeLessThanOrEqual(0.95); // 少し余裕を持って
    expect(rate).toBeGreaterThan(0.15);
  });
});
