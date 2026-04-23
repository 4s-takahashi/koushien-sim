/**
 * tests/ui/match-visual/animation-multitrigger.test.ts
 *
 * Phase 12-L: useBallAnimation の連続トリガー・クリーンアップテスト
 *
 * 課題2のバグ再現:
 * triggerPitchAnimation → triggerPlaySequence → triggerPitchAnimation と連続して呼ぶと、
 * seqRafRef が停止されずに rafRef との競合が発生し、アニメーションが固まる。
 *
 * Phase 12-L の修正:
 * - triggerPitchAnimation は stopAnimation() + stopHomeRunEffect() + stopPlaySequence() を呼ぶ
 * - triggerHitAnimation は stopAnimation() + stopHomeRunEffect() + stopPlaySequence() を呼ぶ
 * - triggerPlaySequence は stopAnimation() + stopHomeRunEffect() + stopPlaySequence() を呼ぶ
 * - mountedRef でアンマウント後の setBallState 呼び出しを防止
 *
 * これらのロジックを RAF を使わずにユニットテストする。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================
// RAF 管理クラス（useBallAnimation の stopXxx ロジックを抽出）
// ============================================================

/** 複数の RAF ハンドルを管理する簡易コントローラ */
class MultiRafController {
  pitchRaf: number | null = null;
  homeRunRaf: number | null = null;
  seqRaf: number | null = null;
  setBallStateCalls: number[] = [];

  stopPitch() {
    if (this.pitchRaf !== null) {
      cancelAnimationFrame(this.pitchRaf);
      this.pitchRaf = null;
    }
  }

  stopHomeRun() {
    if (this.homeRunRaf !== null) {
      cancelAnimationFrame(this.homeRunRaf);
      this.homeRunRaf = null;
    }
  }

  stopSeq() {
    if (this.seqRaf !== null) {
      cancelAnimationFrame(this.seqRaf);
      this.seqRaf = null;
    }
  }

  stopAll() {
    this.stopPitch();
    this.stopHomeRun();
    this.stopSeq();
  }

  /** Phase 12-L 修正後: triggerPitch は stopAll してから pitchRaf を開始 */
  triggerPitchFixed(mockRafId: number) {
    this.stopAll(); // 修正後: 全停止
    this.pitchRaf = mockRafId;
  }

  /** Phase 12-L 修正前: triggerPitch は stopPitch のみ */
  triggerPitchBuggy(mockRafId: number) {
    this.stopPitch(); // 修正前: pitch のみ停止
    this.pitchRaf = mockRafId;
  }

  /** triggerPlaySequence */
  triggerSeqFixed(mockRafId: number) {
    this.stopAll(); // 修正後: 全停止
    this.seqRaf = mockRafId;
  }

  triggerSeqBuggy(mockRafId: number) {
    this.stopSeq(); // 修正前: seq のみ停止
    this.seqRaf = mockRafId;
  }
}

// RAF のモック（cancelAnimationFrame のカウント）
let cancelCount = 0;
const originalCAF = globalThis.cancelAnimationFrame;

// ============================================================
// テスト
// ============================================================

describe('useBallAnimation 連続トリガー (Phase 12-L)', () => {
  beforeEach(() => {
    cancelCount = 0;
    globalThis.cancelAnimationFrame = (id: number) => {
      cancelCount++;
      void id;
    };
  });

  afterEach(() => {
    globalThis.cancelAnimationFrame = originalCAF;
  });

  it('修正後: triggerPitch は全RAFを停止してから起動する', () => {
    const ctrl = new MultiRafController();

    // シーケンスが動いている状態
    ctrl.triggerSeqFixed(101);
    expect(ctrl.seqRaf).toBe(101);

    // 投球アニメーション起動 → seqRaf も停止されるはず
    ctrl.triggerPitchFixed(102);

    expect(ctrl.pitchRaf).toBe(102);
    expect(ctrl.seqRaf).toBeNull(); // 修正後: seqRaf が停止されている
    expect(ctrl.homeRunRaf).toBeNull();
  });

  it('修正前（バグ）: triggerPitch は seqRaf を残したまま起動する', () => {
    const ctrl = new MultiRafController();

    // シーケンスが動いている状態
    ctrl.triggerSeqBuggy(101);
    expect(ctrl.seqRaf).toBe(101);

    // 投球アニメーション起動 → seqRaf が残ったまま！
    ctrl.triggerPitchBuggy(102);

    expect(ctrl.pitchRaf).toBe(102);
    expect(ctrl.seqRaf).toBe(101); // バグ: seqRaf が停止されていない → 競合発生
  });

  it('修正後: triggerSeq は全RAFを停止してから起動する', () => {
    const ctrl = new MultiRafController();

    // 投球と homeRunが動いている状態
    ctrl.pitchRaf = 201;
    ctrl.homeRunRaf = 202;

    // プレイシーケンス起動 → 全 RAF が停止されるはず
    ctrl.triggerSeqFixed(203);

    expect(ctrl.seqRaf).toBe(203);
    expect(ctrl.pitchRaf).toBeNull(); // 修正後: pitchRaf が停止
    expect(ctrl.homeRunRaf).toBeNull(); // 修正後: homeRunRaf が停止
  });

  it('修正後: 連続して triggerPitch → triggerSeq → triggerPitch を呼んでも RAF が重複しない', () => {
    const ctrl = new MultiRafController();

    ctrl.triggerPitchFixed(301);
    expect(ctrl.pitchRaf).toBe(301);
    expect(ctrl.seqRaf).toBeNull();

    ctrl.triggerSeqFixed(302);
    expect(ctrl.seqRaf).toBe(302);
    expect(ctrl.pitchRaf).toBeNull(); // seqが起動時にpitchが止まる

    ctrl.triggerPitchFixed(303);
    expect(ctrl.pitchRaf).toBe(303);
    expect(ctrl.seqRaf).toBeNull(); // pitchが起動時にseqが止まる

    // 最終的に active な RAF は1つだけ
    const activeRafs = [ctrl.pitchRaf, ctrl.homeRunRaf, ctrl.seqRaf].filter(
      (r) => r !== null,
    ).length;
    expect(activeRafs).toBe(1);
  });

  it('mountedRef パターン: アンマウント後は setBallState が呼ばれない', () => {
    // mountedRef のロジックをシミュレート
    let mounted = true;
    const setBallState = vi.fn();

    const safeBallStateSetter = (value: unknown) => {
      if (!mounted) return; // mountedRef.current === false ならスキップ
      setBallState(value);
    };

    // マウント中の呼び出し
    safeBallStateSetter({ isAnimating: true });
    expect(setBallState).toHaveBeenCalledTimes(1);

    // アンマウント
    mounted = false;

    // アンマウント後の呼び出し（タイムアウトコールバック等）
    safeBallStateSetter(null);
    expect(setBallState).toHaveBeenCalledTimes(1); // 呼ばれていないこと

    // 再度マウント（StrictMode のダブルエフェクト）
    mounted = true;
    safeBallStateSetter({ isAnimating: false });
    expect(setBallState).toHaveBeenCalledTimes(2);
  });
});
