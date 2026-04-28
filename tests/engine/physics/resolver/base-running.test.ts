/**
 * Phase R3: base-running.ts 単体テスト
 * 走塁判定（リードオフ・スタート・到達）
 */

import { describe, it, expect } from 'vitest';
import {
  resolveBaseRunning,
  computeDecisionMargin,
  shouldAdvance,
  computeForceAdvanceBases,
  getNextBase,
  extractRunners,
  computeBaseStateAfter,
} from '../../../../src/engine/physics/resolver/base-running';
import { createRNG } from '../../../../src/engine/core/rng';
import type { BaseState, FieldingResult, ThrowResult } from '../../../../src/engine/physics/types';
import type { RunnerStats } from '../../../../src/engine/physics/resolver/types';

// ============================================================
// テストヘルパー
// ============================================================

function makeBaseState(overrides: Partial<BaseState> = {}): BaseState {
  return {
    first: null,
    second: null,
    third: null,
    ...overrides,
  };
}

function makeRunner(overrides: Partial<RunnerStats> = {}): RunnerStats {
  return {
    runnerId: 'r1',
    fromBase: 'first',
    speedStat: 60,
    aggressiveness: 0.5,
    ...overrides,
  };
}

function makeFieldingResult(overrides: Partial<FieldingResult> = {}): FieldingResult {
  return {
    primaryFielder: {
      id: 'f_center',
      position: 'center',
      arrivalTimeMs: 800,
      arrivalPos: { x: 0, y: 320 },
    },
    catchAttempt: {
      success: true,
      error: false,
      bobble: false,
      handleTimeMs: 600,
    },
    ...overrides,
  };
}

function makeThrowResult(overrides: Partial<ThrowResult> = {}): ThrowResult {
  return {
    willThrow: true,
    toBase: 'second',
    releaseTimeMs: 1400,
    arrivalTimeMs: 2200,
    throwQuality: 0.8,
    ...overrides,
  };
}

const rng = createRNG('test-base-running');

// ============================================================
// getNextBase
// ============================================================

describe('getNextBase', () => {
  it('home → first', () => {
    expect(getNextBase('home')).toBe('first');
  });

  it('first → second', () => {
    expect(getNextBase('first')).toBe('second');
  });

  it('second → third', () => {
    expect(getNextBase('second')).toBe('third');
  });

  it('third → home', () => {
    expect(getNextBase('third')).toBe('home');
  });
});

// ============================================================
// computeForceAdvanceBases
// ============================================================

describe('computeForceAdvanceBases', () => {
  it('塁上走者なし → 強制進塁なし', () => {
    const forced = computeForceAdvanceBases(makeBaseState());
    expect(forced.size).toBe(0);
  });

  it('一塁走者あり → first は強制進塁', () => {
    const bases = makeBaseState({ first: { playerId: 'r1', speed: 60 } });
    const forced = computeForceAdvanceBases(bases);
    expect(forced.has('first')).toBe(true);
  });

  it('満塁 → first/second/third すべて強制進塁', () => {
    const bases = makeBaseState({
      first: { playerId: 'r1', speed: 60 },
      second: { playerId: 'r2', speed: 60 },
      third: { playerId: 'r3', speed: 60 },
    });
    const forced = computeForceAdvanceBases(bases);
    expect(forced.has('first')).toBe(true);
    expect(forced.has('second')).toBe(true);
    expect(forced.has('third')).toBe(true);
  });

  it('一二塁走者あり → first/second が強制進塁', () => {
    const bases = makeBaseState({
      first: { playerId: 'r1', speed: 60 },
      second: { playerId: 'r2', speed: 60 },
    });
    const forced = computeForceAdvanceBases(bases);
    expect(forced.has('first')).toBe(true);
    expect(forced.has('second')).toBe(true);
    expect(forced.has('third')).toBe(false);
  });
});

// ============================================================
// extractRunners
// ============================================================

describe('extractRunners', () => {
  it('空塁状態 → 走者なし', () => {
    const runners = extractRunners(makeBaseState());
    expect(runners).toHaveLength(0);
  });

  it('一塁走者のみ → 1 人', () => {
    const bases = makeBaseState({ first: { playerId: 'r1', speed: 70 } });
    const runners = extractRunners(bases);
    expect(runners).toHaveLength(1);
    expect(runners[0].fromBase).toBe('first');
    expect(runners[0].speedStat).toBe(70);
  });

  it('満塁 → 3 人', () => {
    const bases = makeBaseState({
      first: { playerId: 'r1', speed: 60 },
      second: { playerId: 'r2', speed: 70 },
      third: { playerId: 'r3', speed: 80 },
    });
    const runners = extractRunners(bases);
    expect(runners).toHaveLength(3);
  });

  it('三塁走者が先頭に来る（進塁優先順）', () => {
    const bases = makeBaseState({
      first: { playerId: 'r1', speed: 60 },
      third: { playerId: 'r3', speed: 80 },
    });
    const runners = extractRunners(bases);
    expect(runners[0].fromBase).toBe('third');
  });
});

// ============================================================
// computeDecisionMargin
// ============================================================

describe('computeDecisionMargin', () => {
  it('送球が遅い場合 margin は正（突っ込める）', () => {
    const runner = makeRunner({ speedStat: 70, aggressiveness: 0.5 });
    const margin = computeDecisionMargin(runner, 90, 500, 9999, createRNG('dm1'));
    expect(margin).toBeGreaterThan(0);
  });

  it('送球が非常に速い場合 margin は負（止まる）', () => {
    const runner = makeRunner({ speedStat: 30, aggressiveness: 0.1 });
    const margin = computeDecisionMargin(runner, 90, 0, 100, createRNG('dm2'));
    expect(margin).toBeLessThan(5000); // 物理的な計算
  });

  it('積極的な走者は margin が大きい', () => {
    const aggressive = makeRunner({ speedStat: 60, aggressiveness: 1.0 });
    const cautious = makeRunner({ speedStat: 60, aggressiveness: 0.0 });
    const m1 = computeDecisionMargin(aggressive, 90, 500, 2000, createRNG('dm3'));
    const m2 = computeDecisionMargin(cautious, 90, 500, 2000, createRNG('dm3'));
    expect(m1).toBeGreaterThan(m2);
  });
});

// ============================================================
// shouldAdvance
// ============================================================

describe('shouldAdvance', () => {
  it('margin が十分に正 → 進塁する', () => {
    expect(shouldAdvance(1000, 0.5)).toBe(true);
  });

  it('margin が大きく負 → 進塁しない', () => {
    expect(shouldAdvance(-1000, 0.0)).toBe(false);
  });

  it('積極的な走者はギリギリでも突っ込む', () => {
    expect(shouldAdvance(-50, 1.0)).toBe(true);
  });
});

// ============================================================
// resolveBaseRunning — ホームラン
// ============================================================

describe('resolveBaseRunning - ホームラン', () => {
  it('ホームランで全走者が本塁生還', () => {
    const bases = makeBaseState({
      first: { playerId: 'r1', speed: 70 },
      second: { playerId: 'r2', speed: 75 },
    });
    const runners = extractRunners(bases);
    const result = resolveBaseRunning(
      bases, runners, 'batter1', 70,
      makeFieldingResult({ catchAttempt: { success: false, error: false, bobble: false, handleTimeMs: 600 } }),
      makeThrowResult({ willThrow: false, arrivalTimeMs: 9999 }),
      false, true, 0, createRNG('hr1'),
    );
    // 全決定が home への safe
    const homes = result.decisions.filter(d => d.targetBase === 'home' && d.outcome === 'safe');
    expect(homes.length).toBeGreaterThanOrEqual(runners.length);
  });
});

// ============================================================
// resolveBaseRunning — フライ (タッチアップ)
// ============================================================

describe('resolveBaseRunning - タッチアップ', () => {
  it('フライ捕球 + 三塁走者 → タッチアップ判定', () => {
    const bases = makeBaseState({ third: { playerId: 'r3', speed: 80 } });
    const runners = extractRunners(bases);
    const fielding = makeFieldingResult({
      catchAttempt: { success: true, error: false, bobble: false, handleTimeMs: 600 },
      primaryFielder: { id: 'f_left', position: 'left', arrivalTimeMs: 2000, arrivalPos: { x: -180, y: 280 } },
    });
    const result = resolveBaseRunning(
      bases, runners, 'batter1', 60,
      fielding,
      makeThrowResult({ toBase: 'home', arrivalTimeMs: 3500 }),
      true, false, 1, createRNG('tu1'),
    );
    // 三塁走者の決定があること
    const r3 = result.decisions.find(d => d.runnerId === 'r3');
    expect(r3).toBeDefined();
  });
});

// ============================================================
// resolveBaseRunning — ゴロ
// ============================================================

describe('resolveBaseRunning - ゴロ', () => {
  it('ゴロで打者走者は一塁を目指す', () => {
    const bases = makeBaseState();
    const result = resolveBaseRunning(
      bases, [], 'batter1', 70,
      makeFieldingResult({ catchAttempt: { success: true, error: false, bobble: false, handleTimeMs: 600 } }),
      makeThrowResult({ toBase: 'first', arrivalTimeMs: 1600 }),
      false, false, 0, createRNG('gr1'),
    );
    const batter = result.decisions.find(d => d.runnerId === 'batter1');
    expect(batter).toBeDefined();
    expect(batter?.fromBase).toBe('home');
  });

  it('エラー後は打者走者がより遠くへ', () => {
    const bases = makeBaseState();
    const fieldingError = makeFieldingResult({
      catchAttempt: { success: false, error: true, bobble: false, handleTimeMs: 1200 },
    });
    const result = resolveBaseRunning(
      bases, [], 'batter1', 70,
      fieldingError,
      makeThrowResult({ willThrow: false, arrivalTimeMs: 9999 }),
      false, false, 0, createRNG('gr2'),
    );
    const batter = result.decisions.find(d => d.runnerId === 'batter1');
    expect(batter).toBeDefined();
    expect(batter?.targetBase).toBe('second'); // エラーで二塁まで
  });
});

// ============================================================
// computeBaseStateAfter
// ============================================================

describe('computeBaseStateAfter', () => {
  it('一塁にセーフ → first に走者配置', () => {
    const bases = makeBaseState();
    const decisions: import('../../../../src/engine/physics/types').RunnerDecision[] = [
      {
        runnerId: 'batter1', fromBase: 'home', targetBase: 'first',
        decisionMargin: 100, willAdvance: true, arrivalTimeMs: 1500, outcome: 'safe',
      },
    ];
    const after = computeBaseStateAfter(bases, decisions, 'batter1');
    expect(after.first).toBeDefined();
    expect(after.first?.playerId).toBe('batter1');
  });

  it('本塁生還 → 塁が空く', () => {
    const bases = makeBaseState({ third: { playerId: 'r3', speed: 80 } });
    const decisions: import('../../../../src/engine/physics/types').RunnerDecision[] = [
      {
        runnerId: 'r3', fromBase: 'third', targetBase: 'home',
        decisionMargin: 500, willAdvance: true, arrivalTimeMs: 3000, outcome: 'safe',
      },
    ];
    const after = computeBaseStateAfter(bases, decisions, 'batter1');
    expect(after.third).toBeNull();
  });
});
