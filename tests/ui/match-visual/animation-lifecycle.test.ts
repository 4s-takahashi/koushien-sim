/**
 * tests/ui/match-visual/animation-lifecycle.test.ts
 *
 * Phase 12-K: Ballpark.tsx アニメーションライフサイクルのロジックテスト
 *
 * テスト対象:
 * 1. visibilitychange で RAF ループが停止 → 復帰時に再起動するロジック
 * 2. ResizeObserver 発火時のループ二重起動防止ガード
 * 3. rehydrate 後の初回描画が正しく動くこと（isAnimating フラグ変化）
 *
 * 注: Ballpark.tsx は React コンポーネントであり、ブラウザ API (requestAnimationFrame,
 *     ResizeObserver, document) に依存するため、ロジックを純粋関数として切り出して
 *     ここではユニットテストする。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================
// isAnimating 判定ロジック（Ballpark.tsx から抽出）
// ============================================================

type BallAnimStateSubset = {
  isAnimating?: boolean;
  homeRunProgress?: number;
  playSequenceState?: { totalProgress: number };
};

function computeIsAnimating(state: BallAnimStateSubset | null | undefined): boolean {
  if (!state) return false;
  return !!(
    state.isAnimating ||
    (state.homeRunProgress !== undefined &&
      state.homeRunProgress > 0 &&
      state.homeRunProgress < 1) ||
    (state.playSequenceState !== undefined &&
      state.playSequenceState.totalProgress > 0 &&
      state.playSequenceState.totalProgress < 1)
  );
}

// ============================================================
// アニメーションループ管理ロジック（Ballpark.tsx から抽出）
// ============================================================

interface LoopController {
  isRunning: boolean;
  frameId: number | null;
  start: (drawFn: (now: number) => void) => void;
  stop: () => void;
}

function createLoopController(): LoopController {
  const ctrl: LoopController = {
    isRunning: false,
    frameId: null,
    start(drawFn) {
      if (ctrl.isRunning) return; // 二重起動防止
      ctrl.isRunning = true;
      const loop = (now: number) => {
        drawFn(now);
        ctrl.frameId = requestAnimationFrame(loop);
      };
      ctrl.frameId = requestAnimationFrame(loop);
    },
    stop() {
      if (ctrl.frameId !== null) {
        cancelAnimationFrame(ctrl.frameId);
        ctrl.frameId = null;
      }
      ctrl.isRunning = false;
    },
  };
  return ctrl;
}

// ============================================================
// テスト用 mock
// ============================================================

let rafCallbacks: Array<(now: number) => void> = [];
let rafIdCounter = 0;

function mockRequestAnimationFrame(cb: (now: number) => void): number {
  const id = ++rafIdCounter;
  rafCallbacks.push(cb);
  return id;
}

function mockCancelAnimationFrame(_id: number): void {
  rafCallbacks = [];
}

function flushRAF(now: number): void {
  const callbacks = [...rafCallbacks];
  rafCallbacks = [];
  for (const cb of callbacks) {
    cb(now);
  }
}

// ============================================================
// テスト
// ============================================================

describe('isAnimating 判定ロジック', () => {
  it('null/undefined は false を返す', () => {
    expect(computeIsAnimating(null)).toBe(false);
    expect(computeIsAnimating(undefined)).toBe(false);
  });

  it('isAnimating=true は true を返す', () => {
    expect(computeIsAnimating({ isAnimating: true })).toBe(true);
  });

  it('isAnimating=false は false を返す', () => {
    expect(computeIsAnimating({ isAnimating: false })).toBe(false);
  });

  it('homeRunProgress が 0..1 の範囲内は true', () => {
    expect(computeIsAnimating({ homeRunProgress: 0.5 })).toBe(true);
  });

  it('homeRunProgress が 0 は false', () => {
    expect(computeIsAnimating({ homeRunProgress: 0 })).toBe(false);
  });

  it('homeRunProgress が 1 は false（完了）', () => {
    expect(computeIsAnimating({ homeRunProgress: 1 })).toBe(false);
  });

  it('playSequenceState.totalProgress が 0..1 の範囲内は true', () => {
    expect(computeIsAnimating({ playSequenceState: { totalProgress: 0.5 } })).toBe(true);
  });

  it('playSequenceState.totalProgress が 0 は false', () => {
    expect(computeIsAnimating({ playSequenceState: { totalProgress: 0 } })).toBe(false);
  });

  it('playSequenceState.totalProgress が 1 は false（完了）', () => {
    expect(computeIsAnimating({ playSequenceState: { totalProgress: 1 } })).toBe(false);
  });
});

describe('アニメーションループ制御: 二重起動防止', () => {
  beforeEach(() => {
    rafCallbacks = [];
    rafIdCounter = 0;
    vi.stubGlobal('requestAnimationFrame', mockRequestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', mockCancelAnimationFrame);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rafCallbacks = [];
  });

  it('start() を2回呼んでもループが2重起動しない', () => {
    const ctrl = createLoopController();
    const drawFn = vi.fn();

    ctrl.start(drawFn);
    ctrl.start(drawFn); // 2回目は無視されるべき

    expect(ctrl.isRunning).toBe(true);
    // 1フレームだけ進める
    flushRAF(16);
    // drawFn が1回だけ呼ばれる（2重ループなら2回になる）
    expect(drawFn).toHaveBeenCalledTimes(1);
    ctrl.stop();
  });

  it('stop() でループが正常に停止する', () => {
    const ctrl = createLoopController();
    const drawFn = vi.fn();

    ctrl.start(drawFn);
    expect(ctrl.isRunning).toBe(true);

    ctrl.stop();
    expect(ctrl.isRunning).toBe(false);
    expect(ctrl.frameId).toBeNull();
  });

  it('stop() 後に start() で再起動できる', () => {
    const ctrl = createLoopController();
    const drawFn = vi.fn();

    ctrl.start(drawFn);
    ctrl.stop();

    // 再起動
    ctrl.start(drawFn);
    expect(ctrl.isRunning).toBe(true);

    flushRAF(16);
    expect(drawFn).toHaveBeenCalledTimes(1);
    ctrl.stop();
  });

  it('isRunning フラグが stop 後に false になる', () => {
    const ctrl = createLoopController();
    const drawFn = vi.fn();

    ctrl.start(drawFn);
    expect(ctrl.isRunning).toBe(true);
    ctrl.stop();
    expect(ctrl.isRunning).toBe(false);
  });
});

describe('visibilitychange: タブ非表示→表示時の再起動ロジック', () => {
  beforeEach(() => {
    rafCallbacks = [];
    rafIdCounter = 0;
    vi.stubGlobal('requestAnimationFrame', mockRequestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', mockCancelAnimationFrame);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rafCallbacks = [];
  });

  it('アニメーション中にループが停止していた場合、復帰時に再起動する', () => {
    const ctrl = createLoopController();
    const drawFn = vi.fn();

    // ループを起動してから停止させる（タブ非表示でRAFが止まった状態を模倣）
    ctrl.start(drawFn);
    ctrl.stop(); // ループ停止

    const animState: BallAnimStateSubset = { isAnimating: true };
    const isAnimating = computeIsAnimating(animState);

    // visibilitychange ロジック: タブ復帰時
    if (isAnimating && !ctrl.isRunning) {
      ctrl.start(drawFn);
    }

    expect(ctrl.isRunning).toBe(true);
    flushRAF(16);
    expect(drawFn).toHaveBeenCalledTimes(1);
    ctrl.stop();
  });

  it('非アニメーション状態でのタブ復帰では draw() だけ呼ぶ', () => {
    const ctrl = createLoopController();
    const drawFn = vi.fn();

    const animState: BallAnimStateSubset = { isAnimating: false };
    const isAnimating = computeIsAnimating(animState);

    // タブ復帰ロジック
    if (isAnimating && !ctrl.isRunning) {
      ctrl.start(drawFn);
    } else if (!isAnimating) {
      drawFn(performance.now()); // 静止描画
    }

    expect(ctrl.isRunning).toBe(false);
    expect(drawFn).toHaveBeenCalledTimes(1);
  });

  it('ループが既に動いている場合は再起動しない', () => {
    const ctrl = createLoopController();
    const drawFn = vi.fn();

    ctrl.start(drawFn); // ループ起動中
    const runningBefore = ctrl.isRunning;

    const animState: BallAnimStateSubset = { isAnimating: true };
    const isAnimating = computeIsAnimating(animState);

    // タブ復帰ロジック（ループが既に動いている場合）
    if (isAnimating && !ctrl.isRunning) {
      ctrl.start(drawFn); // この start() は呼ばれない
    }

    expect(runningBefore).toBe(true);
    expect(ctrl.isRunning).toBe(true);
    // フレーム数が増えても drawFn の呼び出しは1フレーム分のみ（二重起動しない）
    flushRAF(16);
    expect(drawFn).toHaveBeenCalledTimes(1);
    ctrl.stop();
  });
});

describe('rehydrate 後の初回描画（isAnimating フラグ変化）', () => {
  it('isAnimating が false → true に変化したとき、新しいループを起動できる', () => {
    const ctrl = createLoopController();
    const drawFn = vi.fn();

    // 初期状態: アニメーションなし（rehydrate 直後）
    let prevAnimating = computeIsAnimating({ isAnimating: false });
    expect(prevAnimating).toBe(false);
    expect(ctrl.isRunning).toBe(false);

    // アニメーション開始（pitchLog 更新などにより）
    const newAnimating = computeIsAnimating({ isAnimating: true });
    if (newAnimating && !ctrl.isRunning) {
      ctrl.start(drawFn);
    }

    expect(newAnimating).toBe(true);
    expect(ctrl.isRunning).toBe(true);
    ctrl.stop();
  });

  it('rehydrate 後に isAnimating=false のまま静止描画が呼ばれる', () => {
    const drawCalled = { count: 0 };
    const drawFn = () => { drawCalled.count++; };
    const ctrl = createLoopController();

    // rehydrate 後: isAnimating=false → 静止描画
    const animating = computeIsAnimating({ isAnimating: false });
    if (!animating) {
      drawFn(); // 静止描画
    } else {
      ctrl.start(drawFn);
    }

    expect(drawCalled.count).toBe(1);
    expect(ctrl.isRunning).toBe(false);
  });
});
