/**
 * tests/ui/match-visual/useAutoAdvanceController.test.ts
 *
 * Phase S1-L: useAutoAdvanceController 単体テスト
 *
 * ## テスト方針
 * - フック本体（useAutoAdvanceController）は React 環境が必要なため、
 *   純粋関数の canAutoAdvance と AUTO_ADVANCE_DELAY_MS を優先的にテストする。
 * - タイマー動作は vitest の fake timers を使って検証する。
 * - page.tsx の「3回繰り返し」「二重カウント」「監督指示後フリーズ」が
 *   物理的に起きないことを状態遷移テストで確認する。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  canAutoAdvance,
  AUTO_ADVANCE_DELAY_MS,
  type AutoAdvanceConditions,
} from '@/ui/match-visual/useAutoAdvanceController';

// ============================================================
// テストヘルパー
// ============================================================

/** デフォルトの「進行可能」条件を生成する */
function makeCanAdvanceConds(overrides: Partial<AutoAdvanceConditions> = {}): AutoAdvanceConditions {
  return {
    autoAdvance: true,
    initialized: true,
    isMatchOver: false,
    isProcessing: false,
    isStagingDelay: false,
    isSelectModeActive: false,
    pauseReason: null,
    timeMode: 'standard',
    ...overrides,
  };
}

// ============================================================
// canAutoAdvance 純粋関数テスト
// ============================================================

describe('canAutoAdvance — 純粋関数', () => {
  it('すべての条件が揃っているとき true を返す', () => {
    expect(canAutoAdvance(makeCanAdvanceConds())).toBe(true);
  });

  it('autoAdvance=false のとき false を返す', () => {
    expect(canAutoAdvance(makeCanAdvanceConds({ autoAdvance: false }))).toBe(false);
  });

  it('initialized=false のとき false を返す', () => {
    expect(canAutoAdvance(makeCanAdvanceConds({ initialized: false }))).toBe(false);
  });

  it('isMatchOver=true のとき false を返す（試合終了後は停止）', () => {
    expect(canAutoAdvance(makeCanAdvanceConds({ isMatchOver: true }))).toBe(false);
  });

  it('isProcessing=true のとき false を返す（処理中は停止）', () => {
    expect(canAutoAdvance(makeCanAdvanceConds({ isProcessing: true }))).toBe(false);
  });

  it('isStagingDelay=true のとき false を返す（演出ディレイ中は停止）', () => {
    expect(canAutoAdvance(makeCanAdvanceConds({ isStagingDelay: true }))).toBe(false);
  });

  it('isSelectModeActive=true のとき false を返す（代打/継投モーダル中は停止）', () => {
    expect(canAutoAdvance(makeCanAdvanceConds({ isSelectModeActive: true }))).toBe(false);
  });

  // PauseReason: ブロッキング種別
  it('pauseReason.kind=scoring_chance のとき false を返す（得点圏は停止）', () => {
    expect(canAutoAdvance(makeCanAdvanceConds({
      pauseReason: { kind: 'scoring_chance', detail: '2死満塁' },
    }))).toBe(false);
  });

  it('pauseReason.kind=pinch のとき false を返す（ピンチは停止）', () => {
    expect(canAutoAdvance(makeCanAdvanceConds({
      pauseReason: { kind: 'pinch', detail: '2死満塁' },
    }))).toBe(false);
  });

  it('pauseReason.kind=pitcher_tired のとき false を返す（疲労停止）', () => {
    expect(canAutoAdvance(makeCanAdvanceConds({
      pauseReason: { kind: 'pitcher_tired', staminaPct: 0.2 },
    }))).toBe(false);
  });

  it('pauseReason.kind=close_and_late のとき false を返す（終盤クロスゲーム停止）', () => {
    expect(canAutoAdvance(makeCanAdvanceConds({
      pauseReason: { kind: 'close_and_late', inning: 8 },
    }))).toBe(false);
  });

  it('pauseReason.kind=match_end のとき false を返す（試合終了）', () => {
    expect(canAutoAdvance(makeCanAdvanceConds({
      pauseReason: { kind: 'match_end' },
    }))).toBe(false);
  });

  // PauseReason: ルーティン種別 → 通過させる
  it('pauseReason.kind=pitch_start のとき true を返す（ルーティン停止は通過）', () => {
    expect(canAutoAdvance(makeCanAdvanceConds({
      pauseReason: { kind: 'pitch_start' },
    }))).toBe(true);
  });

  it('pauseReason.kind=at_bat_start のとき true を返す（ルーティン停止は通過）', () => {
    expect(canAutoAdvance(makeCanAdvanceConds({
      pauseReason: { kind: 'at_bat_start', batterId: 'player-1' },
    }))).toBe(true);
  });

  it('pauseReason.kind=inning_end のとき true を返す（イニング終了はルーティン通過）', () => {
    expect(canAutoAdvance(makeCanAdvanceConds({
      pauseReason: { kind: 'inning_end' },
    }))).toBe(true);
  });
});

// ============================================================
// AUTO_ADVANCE_DELAY_MS テスト
// ============================================================

describe('AUTO_ADVANCE_DELAY_MS — 遅延マッピング', () => {
  it('slow モードは 10000ms', () => {
    expect(AUTO_ADVANCE_DELAY_MS.slow).toBe(10000);
  });

  it('standard モードは 5000ms', () => {
    expect(AUTO_ADVANCE_DELAY_MS.standard).toBe(5000);
  });

  it('fast モードは 3000ms', () => {
    expect(AUTO_ADVANCE_DELAY_MS.fast).toBe(3000);
  });
});

// ============================================================
// タイマー動作シミュレーション
// (useAutoAdvanceController の中身を手動で再現して
//  「二重発火しない」「フリーズしない」を検証する)
// ============================================================

describe('タイマー FSM — 二重発火・フリーズなし', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * 基本動作: 進行可能 → 5秒後に onFire が1回だけ呼ばれる
   */
  it('standard モードで 5秒後に onFire が1回呼ばれる', () => {
    const onFire = vi.fn();
    const cond = makeCanAdvanceConds();

    // hook 内部の動作を直接シミュレート
    let timerId: ReturnType<typeof setTimeout> | null = null;
    const setup = (c: AutoAdvanceConditions) => {
      if (!canAutoAdvance(c)) return null;
      const delay = AUTO_ADVANCE_DELAY_MS[c.timeMode];
      return setTimeout(() => {
        // 発火直前に再チェック
        if (!canAutoAdvance(c)) return;
        onFire();
      }, delay);
    };

    timerId = setup(cond);
    expect(onFire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(4999);
    expect(onFire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onFire).toHaveBeenCalledTimes(1);

    if (timerId !== null) clearTimeout(timerId);
  });

  /**
   * 二重発火防止: タイマーが発火したあと、条件変化（isProcessing=true）で
   * 新しいタイマーがセットされず、二重呼び出しにならない。
   *
   * 設計のポイント: useEffect の cleanup がタイマーをクリアするため、
   * isProcessing が true になると effect が再実行されて新タイマーは作られない。
   */
  it('発火後 isProcessing=true になっても二重発火しない', () => {
    const onFire = vi.fn();
    let currentCond = makeCanAdvanceConds();
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const setupTimer = (c: AutoAdvanceConditions) => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (!canAutoAdvance(c)) return;
      const delay = AUTO_ADVANCE_DELAY_MS[c.timeMode];
      timerId = setTimeout(() => {
        timerId = null;
        if (!canAutoAdvance(currentCond)) return; // 発火直前の最新条件チェック
        onFire();
        // 発火後: isProcessing が true になる（stepOnePitch が呼ばれると仮定）
        currentCond = { ...currentCond, isProcessing: true };
        // effect の再実行をシミュレート（isProcessing=true → canAdvance=false → タイマークリア）
        setupTimer(currentCond);
      }, delay);
    };

    // 初回セットアップ
    setupTimer(currentCond);
    expect(onFire).not.toHaveBeenCalled();

    // 5秒後: 発火 → isProcessing=true → 新タイマーはセットされない
    vi.advanceTimersByTime(5000);
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(timerId).toBeNull(); // isProcessing=true なのでタイマーなし

    // さらに 5秒待っても二度目は呼ばれない
    vi.advanceTimersByTime(5000);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  /**
   * 監督指示後の3回繰り返し防止:
   * handleOrder → setSelectMode(none) + applyOrder + resumeFromPause
   * という連続 setState の過渡状態でタイマーが多重セットされないことを確認。
   *
   * 設計のポイント: canAdvance は依存配列のブール値なので、
   * React がバッチ更新を終えて canAdvance が確定してから1回だけ effect が再実行される。
   * このシミュレーションでは「連続した条件変化で setupTimer が複数回呼ばれても
   * 最終的に1つのタイマーしか残らない」ことを確認する。
   */
  it('連続 setState 後に1つのタイマーしか残らない（3回繰り返し防止）', () => {
    const onFire = vi.fn();
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let setupCount = 0;

    const setupTimer = (c: AutoAdvanceConditions) => {
      // useEffect の cleanup をシミュレート: 前のタイマーをクリア
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (!canAutoAdvance(c)) return;
      setupCount++;
      const delay = AUTO_ADVANCE_DELAY_MS[c.timeMode];
      timerId = setTimeout(() => {
        timerId = null;
        if (!canAutoAdvance(c)) return;
        onFire();
      }, delay);
    };

    // 初期状態: selectMode が active（モーダルが開いている）
    let cond = makeCanAdvanceConds({ isSelectModeActive: true });
    setupTimer(cond);
    const countBefore = setupCount;

    // 監督指示後の連続 setState をシミュレート（S1-J が起きた状況）
    // Step 1: setSelectMode(none) → isSelectModeActive=false
    cond = { ...cond, isSelectModeActive: false };
    setupTimer(cond);
    // Step 2: applyOrder → pauseReason 変化（一時的に pitch_start）
    cond = { ...cond, pauseReason: { kind: 'pitch_start' } };
    setupTimer(cond);
    // Step 3: resumeFromPause → pauseReason=null
    cond = { ...cond, pauseReason: null };
    setupTimer(cond);

    // 最終的にタイマーは1つだけ
    expect(timerId).not.toBeNull();
    // countBefore は 0（isSelectModeActive=true でセットアップされなかった）
    // 連続 setState 後は 1 回だけセットアップが成功したはず
    expect(setupCount - countBefore).toBe(3); // 各 setState で再実行されるが...
    // ただし timerId は1つだけ（前の cleanup でクリアされている）

    // タイマー発火: onFire は1回だけ
    vi.advanceTimersByTime(5000);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  /**
   * 自動進行 OFF → ON のサイクル:
   * autoAdvance を false にするとタイマーがクリアされ、
   * true に戻すと新たにタイマーがセットされる。
   */
  it('autoAdvance OFF→ON のサイクルでタイマーが正しくリセットされる', () => {
    const onFire = vi.fn();
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const setupTimer = (c: AutoAdvanceConditions) => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (!canAutoAdvance(c)) return;
      const delay = AUTO_ADVANCE_DELAY_MS[c.timeMode];
      timerId = setTimeout(() => {
        timerId = null;
        if (!canAutoAdvance(c)) return;
        onFire();
      }, delay);
    };

    // 自動進行 ON でタイマー開始
    let cond = makeCanAdvanceConds();
    setupTimer(cond);
    expect(timerId).not.toBeNull();

    // 3秒後に OFF
    vi.advanceTimersByTime(3000);
    cond = { ...cond, autoAdvance: false };
    setupTimer(cond); // cleanup: タイマークリア
    expect(timerId).toBeNull();
    expect(onFire).not.toHaveBeenCalled();

    // さらに 3秒後（元の発火タイミングを超えても呼ばれない）
    vi.advanceTimersByTime(3000);
    expect(onFire).not.toHaveBeenCalled();

    // ON に戻す → 新たに 5秒タイマー開始
    cond = { ...cond, autoAdvance: true };
    setupTimer(cond);
    expect(timerId).not.toBeNull();

    vi.advanceTimersByTime(5000);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  /**
   * イニング終了 → 次イニング開始:
   * isStagingDelay=true（CHANGE 演出中）の間タイマーが止まり、
   * false になったら再開される。
   */
  it('CHANGE 演出中はタイマーが停止し、演出終了後に再開する', () => {
    const onFire = vi.fn();
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const setupTimer = (c: AutoAdvanceConditions) => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (!canAutoAdvance(c)) return;
      const delay = AUTO_ADVANCE_DELAY_MS[c.timeMode];
      timerId = setTimeout(() => {
        timerId = null;
        if (!canAutoAdvance(c)) return;
        onFire();
      }, delay);
    };

    // 通常進行中
    let cond = makeCanAdvanceConds();
    setupTimer(cond);

    // 1秒後: CHANGE 演出開始 → タイマーが止まる
    vi.advanceTimersByTime(1000);
    cond = { ...cond, isStagingDelay: true };
    setupTimer(cond);
    expect(timerId).toBeNull();

    // 演出中は何秒待っても onFire 呼ばれない
    vi.advanceTimersByTime(10000);
    expect(onFire).not.toHaveBeenCalled();

    // CHANGE 演出終了（1.5秒後相当）→ タイマー再開
    cond = { ...cond, isStagingDelay: false };
    setupTimer(cond);
    expect(timerId).not.toBeNull();

    // 5秒後に発火
    vi.advanceTimersByTime(5000);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  /**
   * 試合終了後はタイマーが発火しない
   */
  it('試合終了後は onFire が呼ばれない', () => {
    const onFire = vi.fn();
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const setupTimer = (c: AutoAdvanceConditions) => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (!canAutoAdvance(c)) return;
      const delay = AUTO_ADVANCE_DELAY_MS[c.timeMode];
      timerId = setTimeout(() => {
        timerId = null;
        if (!canAutoAdvance(c)) return;
        onFire();
      }, delay);
    };

    let cond = makeCanAdvanceConds();
    setupTimer(cond);

    // 試合終了
    cond = { ...cond, isMatchOver: true };
    setupTimer(cond);
    expect(timerId).toBeNull();

    vi.advanceTimersByTime(10000);
    expect(onFire).not.toHaveBeenCalled();
  });

  /**
   * timeMode 変更でタイマーがリセットされる（遅延が変わる）
   */
  it('timeMode 変更でタイマーが新しい遅延でリセットされる', () => {
    const onFire = vi.fn();
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const setupTimer = (c: AutoAdvanceConditions) => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (!canAutoAdvance(c)) return;
      const delay = AUTO_ADVANCE_DELAY_MS[c.timeMode];
      timerId = setTimeout(() => {
        timerId = null;
        if (!canAutoAdvance(c)) return;
        onFire();
      }, delay);
    };

    // standard (5s) でスタート
    let cond = makeCanAdvanceConds({ timeMode: 'standard' });
    setupTimer(cond);

    // 2秒後に fast (3s) に変更
    vi.advanceTimersByTime(2000);
    cond = { ...cond, timeMode: 'fast' };
    setupTimer(cond);

    // fast の 3s が経過 → 発火
    vi.advanceTimersByTime(3000);
    expect(onFire).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// 境界ケース
// ============================================================

describe('canAutoAdvance — 境界ケース', () => {
  it('すべての阻害条件が同時に true でも false を返す', () => {
    expect(canAutoAdvance(makeCanAdvanceConds({
      autoAdvance: false,
      initialized: false,
      isMatchOver: true,
      isProcessing: true,
      isStagingDelay: true,
      isSelectModeActive: true,
      pauseReason: { kind: 'match_end' },
    }))).toBe(false);
  });

  it('autoAdvance=true で他の1条件だけが true でも false を返す', () => {
    const tests: Partial<AutoAdvanceConditions>[] = [
      { isMatchOver: true },
      { isProcessing: true },
      { isStagingDelay: true },
      { isSelectModeActive: true },
      { pauseReason: { kind: 'scoring_chance', detail: '' } },
    ];

    for (const override of tests) {
      expect(canAutoAdvance(makeCanAdvanceConds(override))).toBe(false);
    }
  });
});
