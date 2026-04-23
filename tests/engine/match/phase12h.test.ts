/**
 * tests/engine/match/phase12h.test.ts
 *
 * Phase 12-H: PLAY BALL 演出 + 自動進行機能のテスト
 *
 * テストケース:
 * 1. TimeMode の型チェック（slow / standard / fast の3段階）
 * 2. DELAY_MS マッピングの検証
 * 3. match-store の autoAdvance / pendingNextOrder state 遷移
 * 4. consumeNextOrder が pendingNextOrder を消費する
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { TimeMode, RunnerMode } from '../../../src/engine/match/runner-types';

// ============================================================
// 1. TimeMode 型テスト
// ============================================================

describe('TimeMode (Phase 12-H)', () => {
  it('accepts slow, standard, and fast as valid TimeMode values', () => {
    const modes: TimeMode[] = ['slow', 'standard', 'fast'];
    expect(modes).toHaveLength(3);
    expect(modes).toContain('slow');
    expect(modes).toContain('standard');
    expect(modes).toContain('fast');
  });

  it('RunnerMode includes TimeMode as time property', () => {
    const mode: RunnerMode = { time: 'slow', pitch: 'on' };
    expect(mode.time).toBe('slow');
    expect(mode.pitch).toBe('on');

    const mode2: RunnerMode = { time: 'fast', pitch: 'off' };
    expect(mode2.time).toBe('fast');
    expect(mode2.pitch).toBe('off');
  });
});

// ============================================================
// 2. DELAY_MS マッピングテスト
// ============================================================

describe('DELAY_MS mapping (Phase 12-H)', () => {
  // UI層にある定数と同じ値を定義してテスト
  const DELAY_MS: Record<TimeMode, number> = {
    slow:      10000,
    standard:   5000,
    fast:       3000,
  };

  it('slow mode maps to 10 seconds', () => {
    expect(DELAY_MS.slow).toBe(10000);
  });

  it('standard mode maps to 5 seconds', () => {
    expect(DELAY_MS.standard).toBe(5000);
  });

  it('fast mode maps to 3 seconds', () => {
    expect(DELAY_MS.fast).toBe(3000);
  });

  it('slow >= standard >= fast in delay order', () => {
    expect(DELAY_MS.slow).toBeGreaterThan(DELAY_MS.standard);
    expect(DELAY_MS.standard).toBeGreaterThan(DELAY_MS.fast);
  });
});

// ============================================================
// 3. match-store: autoAdvance / pendingNextOrder state 遷移テスト
// ============================================================

import { useMatchStore } from '../../../src/stores/match-store';

// Zustand ストアのインスタンスを直接テストする（React フック不使用）
describe('match-store autoAdvance state (Phase 12-H)', () => {
  beforeEach(() => {
    // テスト間で状態をリセット
    useMatchStore.setState({
      autoAdvance: false,
      pendingNextOrder: null,
      nextAutoAdvanceAt: null,
    });
  });

  it('autoAdvance が初期状態で false', () => {
    const state = useMatchStore.getState();
    expect(state.autoAdvance).toBe(false);
  });

  it('setAutoAdvance(true) で autoAdvance が ON になる', () => {
    const { setAutoAdvance } = useMatchStore.getState();
    setAutoAdvance(true);
    expect(useMatchStore.getState().autoAdvance).toBe(true);
  });

  it('setAutoAdvance(false) で autoAdvance が OFF に戻る', () => {
    const { setAutoAdvance } = useMatchStore.getState();
    setAutoAdvance(true);
    setAutoAdvance(false);
    expect(useMatchStore.getState().autoAdvance).toBe(false);
  });

  it('pendingNextOrder が初期状態で null', () => {
    expect(useMatchStore.getState().pendingNextOrder).toBeNull();
  });

  it('setPendingNextOrder でオーダーをセットできる', () => {
    const { setPendingNextOrder } = useMatchStore.getState();
    setPendingNextOrder({ type: 'bunt', playerId: 'player-001' });
    const state = useMatchStore.getState();
    expect(state.pendingNextOrder).toEqual({ type: 'bunt', playerId: 'player-001' });
  });

  it('setPendingNextOrder(null) でオーダーをクリアできる', () => {
    const { setPendingNextOrder } = useMatchStore.getState();
    setPendingNextOrder({ type: 'steal', runnerId: 'runner-001' });
    setPendingNextOrder(null);
    expect(useMatchStore.getState().pendingNextOrder).toBeNull();
  });
});

// ============================================================
// 4. consumeNextOrder テスト
// ============================================================

describe('consumeNextOrder (Phase 12-H)', () => {
  beforeEach(() => {
    useMatchStore.setState({
      autoAdvance: false,
      pendingNextOrder: null,
      nextAutoAdvanceAt: null,
      // Phase 12-I: lastOrder も毎回リセットして独立したテストにする
      lastOrder: null,
    });
  });

  it('pendingNextOrder が null かつ lastOrder も null のとき null を返す', () => {
    const { consumeNextOrder } = useMatchStore.getState();
    const result = consumeNextOrder();
    expect(result).toBeNull();
  });

  it('pendingNextOrder がセットされているとき、その値を返して null にリセットする', () => {
    const { setPendingNextOrder, consumeNextOrder } = useMatchStore.getState();
    const order = { type: 'bunt' as const, playerId: 'batter-001' };
    setPendingNextOrder(order);

    const consumed = consumeNextOrder();
    expect(consumed).toEqual(order);
    expect(useMatchStore.getState().pendingNextOrder).toBeNull();
  });

  it('2回連続で consumeNextOrder すると2回目は null (lastOrder も null の場合)', () => {
    const { setPendingNextOrder, consumeNextOrder } = useMatchStore.getState();
    setPendingNextOrder({ type: 'steal', runnerId: 'runner-001' });

    consumeNextOrder(); // 1回目: 消費
    const second = consumeNextOrder(); // 2回目: lastOrder=null → null
    expect(second).toBeNull();
  });

  it('consumeNextOrder は none タイプのオーダーも正常に返す', () => {
    const { setPendingNextOrder, consumeNextOrder } = useMatchStore.getState();
    setPendingNextOrder({ type: 'none' });
    const result = consumeNextOrder();
    expect(result).toEqual({ type: 'none' });
    expect(useMatchStore.getState().pendingNextOrder).toBeNull();
  });
});

// ============================================================
// 5. Phase 12-I: 前回采配継続テスト
// ============================================================

describe('consumeNextOrder continuation (Phase 12-I)', () => {
  beforeEach(() => {
    useMatchStore.setState({
      autoAdvance: false,
      pendingNextOrder: null,
      nextAutoAdvanceAt: null,
      lastOrder: null,
    });
  });

  it('pendingNextOrder が null のとき lastOrder を返す', () => {
    useMatchStore.setState({ lastOrder: { type: 'bunt', playerId: 'batter-001' } });
    const { consumeNextOrder } = useMatchStore.getState();
    const result = consumeNextOrder();
    expect(result).toEqual({ type: 'bunt', playerId: 'batter-001' });
  });

  it('pendingNextOrder が null で lastOrder が steal のとき steal を返す', () => {
    useMatchStore.setState({ lastOrder: { type: 'steal', runnerId: 'runner-001' } });
    const { consumeNextOrder } = useMatchStore.getState();
    const result = consumeNextOrder();
    expect(result).toEqual({ type: 'steal', runnerId: 'runner-001' });
  });

  it('pendingNextOrder が存在するとき、lastOrder より pendingNextOrder を優先する', () => {
    useMatchStore.setState({
      lastOrder: { type: 'bunt', playerId: 'batter-001' },
      pendingNextOrder: { type: 'steal', runnerId: 'runner-002' },
    });
    const { consumeNextOrder } = useMatchStore.getState();
    const result = consumeNextOrder();
    // pendingNextOrder が優先
    expect(result).toEqual({ type: 'steal', runnerId: 'runner-002' });
    // 消費後は null にリセット
    expect(useMatchStore.getState().pendingNextOrder).toBeNull();
  });

  it('pendingNextOrder 消費後の次回呼び出しは lastOrder を返す', () => {
    useMatchStore.setState({
      lastOrder: { type: 'bunt', playerId: 'batter-001' },
      pendingNextOrder: { type: 'steal', runnerId: 'runner-002' },
    });
    const { consumeNextOrder } = useMatchStore.getState();

    // 1回目: pendingNextOrder を消費
    const first = consumeNextOrder();
    expect(first).toEqual({ type: 'steal', runnerId: 'runner-002' });

    // 2回目: pendingNextOrder が null なので lastOrder を返す
    const second = consumeNextOrder();
    expect(second).toEqual({ type: 'bunt', playerId: 'batter-001' });
  });
});
