'use client';
/**
 * Phase 12-A: スコアボードの表示タイミング制御フック
 *
 * イニングラベルが変わった時にスコアボードをスライドイン → 2秒表示 → スライドアウト
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export type ScoreboardPhase =
  | 'hidden'       // 非表示
  | 'sliding_in'   // スライドイン中 (400ms)
  | 'visible'      // 表示中 (~2000ms)
  | 'sliding_out'; // スライドアウト中 (300ms)

export interface ScoreboardVisibilityState {
  phase: ScoreboardPhase;
}

export interface UseScoreboardVisibilityReturn {
  phase: ScoreboardPhase;
  triggerShow: () => void;
  forceHide: () => void;
}

/**
 * スコアボードの表示タイミングを制御するフック
 *
 * @param inningLabel 現在のイニングラベル（"1回表" など）。変化を検出して表示をトリガー
 * @param autoHideMs  表示後に自動非表示するまでの時間（デフォルト 2000ms）
 * @param changeDelayMs  イニング変化検出から表示開始までの遅延（v0.35.0: CHANGE 帯の後に出すため、デフォルト 1500ms）
 */
export function useScoreboardVisibility(
  inningLabel: string,
  autoHideMs = 2000,
  changeDelayMs = 1500,
): UseScoreboardVisibilityReturn {
  const [phase, setPhase] = useState<ScoreboardPhase>('hidden');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevInningLabel = useRef<string>(inningLabel);
  // 初回マウント時の表示を防ぐフラグ
  const isMounted = useRef(false);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /**
   * スライドイン → 表示 → スライドアウト → 非表示 のシーケンスを実行
   */
  const runShowSequence = useCallback(() => {
    clearTimers();

    // prefers-reduced-motion 対応: アニメーションなしで即表示→即非表示
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      setPhase('visible');
      timerRef.current = setTimeout(() => {
        setPhase('hidden');
      }, autoHideMs);
      return;
    }

    // 400ms スライドイン
    setPhase('sliding_in');

    timerRef.current = setTimeout(() => {
      // 表示フェーズへ
      setPhase('visible');

      timerRef.current = setTimeout(() => {
        // 300ms スライドアウト
        setPhase('sliding_out');

        timerRef.current = setTimeout(() => {
          setPhase('hidden');
        }, 300);
      }, autoHideMs);
    }, 400);
  }, [autoHideMs, clearTimers]);

  // イニングラベルが変わったら表示シーケンスを開始
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      prevInningLabel.current = inningLabel;
      // 初回は 500ms 遅延してから最初のイニングを表示
      timerRef.current = setTimeout(() => {
        runShowSequence();
      }, 500);
      return;
    }

    if (prevInningLabel.current !== inningLabel) {
      prevInningLabel.current = inningLabel;
      // v0.35.0: CHANGE 帯の後に表示するため、従来より大きめの遅延（デフォルト 1500ms）
      timerRef.current = setTimeout(() => {
        runShowSequence();
      }, changeDelayMs);
    }

    return () => {
      clearTimers();
    };
  }, [inningLabel, runShowSequence, clearTimers, changeDelayMs]);

  // アンマウント時にタイマーをクリア
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  /** 手動でスコアボードを表示する（タップして再表示など） */
  const triggerShow = useCallback(() => {
    runShowSequence();
  }, [runShowSequence]);

  /** 手動でスコアボードを即時非表示にする */
  const forceHide = useCallback(() => {
    clearTimers();
    setPhase('hidden');
  }, [clearTimers]);

  return { phase, triggerShow, forceHide };
}
