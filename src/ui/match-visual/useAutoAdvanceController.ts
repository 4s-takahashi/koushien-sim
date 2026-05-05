/**
 * useAutoAdvanceController.ts — 試合自動進行タイマー管理フック
 *
 * Phase S1-L: 自動進行タイマーを page.tsx から完全に切り離し、単一オーナー設計に変更。
 *
 * ## 設計原則
 *
 * ### 根本原因（S1-D ～ S1-K の繰り返し修正の本質）
 * 従来コードは page.tsx の setInterval ポーリング + autoAdvanceCooldownUntilRef の
 * 組み合わせで「二重発火」「3回カウント」「フリーズ」を各 patch で個別に直していた。
 * しかし本質的な問題は:
 *   1. タイマー所有権が分散: ref（タイマーID）と React 状態（nextAutoAdvanceAt）が
 *      別々に管理され、100ms tick が両方を触る競合が生じる
 *   2. React state 更新の非同期性: handleOrder → setSelectMode + applyOrder +
 *      resumeFromPause の 3 回 React setState が異なる tick で反映される隙に
 *      ポーリングが「通過可能」と誤判定してタイマーを多重セット
 *   3. クールダウン値はあくまで「症状の緩和」であり、根本的な競合は残存する
 *
 * ### 解決策: 単一オーナー FSM
 * このフックがタイマーに関するすべての責務を持つ：
 *   - setTimeout / clearTimeout を呼ぶのはこのフックだけ
 *   - 「通過可能か」の判定を _単一の同期チェック_ で行う
 *   - React state は「カウントダウン表示用 nextFireAt」だけを保持
 *   - 外部から「進行可否」の条件を受け取り、条件が変化したら effect が再実行される
 *
 * ### FSM 状態
 * ```
 * IDLE ─(enabled + can_advance)──► COUNTING
 *      ◄─(disabled / cannot_advance)── COUNTING
 * COUNTING ─(timer fires + guard OK)──► EXECUTING  (外部 onFire コールバック)
 *          ─(guard NG at fire)──────► IDLE  (即座に再評価)
 * EXECUTING は onFire 呼び出し後即 IDLE に戻る（次サイクルは外部から再呼び出し）
 * ```
 *
 * ### なぜ cooldown が不要になるか
 * - useEffect の依存配列で `canAdvance` が変化したときだけ effect が再実行される
 * - タイマーは effect の cleanup で必ず clearTimeout される（二重セット物理的不可能）
 * - React state バッチ更新後（flushSync ではなく自然なバッチ）で canAdvance が
 *   安定してから次の effect が走るため、「途中状態でガード通過」が起きない
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { TimeMode } from '../../engine/match/runner-types';
import type { PauseReason } from '../../engine/match/runner-types';

// ============================================================
// 定数
// ============================================================

/** TimeMode → 自動進行遅延 (ms) */
export const AUTO_ADVANCE_DELAY_MS: Record<TimeMode, number> = {
  slow:     10000,
  standard:  5000,
  fast:      3000,
};

// ============================================================
// 型定義
// ============================================================

/**
 * useAutoAdvanceController に渡す進行条件パラメータ。
 * これらのいずれかが変化すると effect が再実行され、
 * タイマーが安全にリセット/クリアされる。
 */
export interface AutoAdvanceConditions {
  /** 自動進行機能が ON かどうか */
  autoAdvance: boolean;
  /** 初期化完了かどうか */
  initialized: boolean;
  /** 試合終了かどうか */
  isMatchOver: boolean;
  /** 処理中かどうか（stepOnePitch 実行中） */
  isProcessing: boolean;
  /** 演出ディレイ中かどうか（CHANGE/三振演出） */
  isStagingDelay: boolean;
  /** 選択モードが非 none（代打/継投モーダルが開いている） */
  isSelectModeActive: boolean;
  /** 停止理由（null = 停止不要） */
  pauseReason: PauseReason | null;
  /** 時間モード（遅延 ms を決定する） */
  timeMode: TimeMode;
}

export interface AutoAdvanceControllerResult {
  /** タイマー発火まで残り ms（null = タイマー未稼働） */
  remainingMs: number | null;
  /** 今すぐ進める（タイマーをキャンセルして即座に onFire） */
  fireNow: () => void;
}

// ============================================================
// 自動進行を止めるべき PauseReason の判定
// ============================================================

/** 自動進行を「止める」PauseReason の kind セット */
const BLOCKING_PAUSE_KINDS = new Set([
  'scoring_chance',
  'pinch',
  'pitcher_tired',
  'close_and_late',
  'match_end',
]);

/**
 * 指定の PauseReason が自動進行を止めるべきかを判定する。
 * pitch_start / at_bat_start / inning_end は「ルーティン停止」として通過させる。
 */
function isBlockingPause(pauseReason: PauseReason | null): boolean {
  if (pauseReason === null) return false;
  return BLOCKING_PAUSE_KINDS.has(pauseReason.kind);
}

/**
 * AutoAdvanceConditions から「自動進行可能か」を判定する純粋関数。
 * テスト可能にするために export する。
 */
export function canAutoAdvance(cond: AutoAdvanceConditions): boolean {
  if (!cond.autoAdvance) return false;
  if (!cond.initialized) return false;
  if (cond.isMatchOver) return false;
  if (cond.isProcessing) return false;
  if (cond.isStagingDelay) return false;
  if (cond.isSelectModeActive) return false;
  if (isBlockingPause(cond.pauseReason)) return false;
  return true;
}

// ============================================================
// フック本体
// ============================================================

/**
 * 自動進行タイマーの単一オーナーフック。
 *
 * @param conditions 進行条件（依存値として使用）
 * @param onFire タイマー発火時に呼ばれるコールバック（pitchStep を実行する）
 * @returns カウントダウン残り ms と fireNow ハンドラ
 */
export function useAutoAdvanceController(
  conditions: AutoAdvanceConditions,
  onFire: () => void,
): AutoAdvanceControllerResult {
  // タイマーの次回発火時刻（Date.now() ベース）。表示用。
  const [nextFireAt, setNextFireAt] = useState<number | null>(null);

  // 最新の onFire コールバックを ref で保持（クロージャ問題を避ける）
  const onFireRef = useRef(onFire);
  onFireRef.current = onFire;

  // conditions を ref にも保持しておく（timer コールバック内で最新値を参照するため）
  const conditionsRef = useRef(conditions);
  conditionsRef.current = conditions;

  // カウントダウン表示用の再描画 tick
  const [, setDisplayTick] = useState(0);

  // 2026-05-05 v0.46.6 全面書き直し:
  // setTimeout ベースを廃止 → setInterval (100ms) で時刻ベース監視に変更。
  // - fireAtRef で「次に発火すべき絶対時刻」を保持
  // - 100ms ごとに canAutoAdvance(latest) と Date.now() を見て判断
  // - setTimeout の React StrictMode 二重マウント / cleanup race condition を完全回避
  // - restartTick / watchdog / 複雑な useEffect 依存配列がすべて不要に
  const fireAtRef = useRef<number | null>(null);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const latestCond = conditionsRef.current;
      const canNow = canAutoAdvance(latestCond);

      if (!canNow) {
        // 進行不可 → fireAt をクリア
        if (fireAtRef.current !== null) {
          fireAtRef.current = null;
          setNextFireAt(null);
        }
        return;
      }

      // 進行可能
      if (fireAtRef.current === null) {
        // 新規セット
        const delayMs = AUTO_ADVANCE_DELAY_MS[latestCond.timeMode];
        const newFireAt = Date.now() + delayMs;
        fireAtRef.current = newFireAt;
        setNextFireAt(newFireAt);
        return;
      }

      // 時刻チェック
      if (Date.now() >= fireAtRef.current) {
        // 発火
        fireAtRef.current = null;
        setNextFireAt(null);
        onFireRef.current();
      } else {
        // カウントダウン再描画用の tick
        setDisplayTick((t) => (t + 1) % 1000);
      }
    }, 100);

    return () => clearInterval(intervalId);
  }, []);

  // 今すぐ進める
  const fireNow = useCallback(() => {
    // 即座に進行
    fireAtRef.current = null;
    setNextFireAt(null);

    // 最新の条件で進行可能かを再チェック
    if (!canAutoAdvance(conditionsRef.current)) return;
    onFireRef.current();
  }, []);

  const remainingMs =
    nextFireAt !== null ? Math.max(0, nextFireAt - Date.now()) : null;

  return { remainingMs, fireNow };
}
