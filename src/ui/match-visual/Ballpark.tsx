'use client';
/**
 * Phase 12-C/E: グラウンド鳥瞰 React コンポーネント
 *
 * Canvas 2D でグラウンドを描画し、左上に MatchHUD をオーバーレイする
 * ResizeObserver でレスポンシブ対応（正方形を維持）
 *
 * Phase 12-E 追加:
 * - homeRunProgress を BallparkRenderState に渡す
 * - FPS 30 上限（非アニメーション時はスキップ）
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  renderBallpark,
  buildBallparkRenderState,
  invalidateBackgroundCache,
} from './BallparkCanvas';
import { MatchHUD } from './MatchHUD';
import type { MatchViewState } from '../projectors/view-state-types';
import type { BallAnimationState } from './useBallAnimation';
import styles from './Ballpark.module.css';

interface BallparkProps {
  view: MatchViewState;
  playerSchoolId: string;
  ballAnimState?: BallAnimationState | null;
  /** スコアボードが表示中か（HUDを薄くする） */
  scoreboardVisible?: boolean;
  className?: string;
}

/**
 * デバイスピクセル比を考慮した Canvas サイズ設定
 */
function setCanvasSize(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
): void {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
  }
}

export function Ballpark({
  view,
  playerSchoolId,
  ballAnimState,
  scoreboardVisible = false,
  className,
}: BallparkProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSizeState] = useState({ w: 450, h: 450 });
  const animFrameRef = useRef<number | null>(null);
  // Phase 12-E: FPS throttle (目標 30fps = 33ms/frame)
  const lastDrawTimeRef = useRef<number>(0);
  const TARGET_FRAME_MS = 33; // ~30fps

  // ResizeObserver でコンテナサイズを監視
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleResize = (entries: ResizeObserverEntry[]) => {
      const entry = entries[0];
      if (!entry) return;
      // Phase 12-F: 実際の width/height 両方を取得し、短い方を採用して正方形を強制
      const w = Math.round(entry.contentRect.width);
      const h = Math.round(entry.contentRect.height);
      const size = Math.max(200, Math.min(w, h > 0 ? h : w));
      setCanvasSizeState({ w: size, h: size });
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);

    // 初期サイズを即設定
    const rect = container.getBoundingClientRect();
    const initialW = Math.round(rect.width);
    const initialH = Math.round(rect.height);
    if (initialW > 0) {
      const size = Math.max(200, Math.min(initialW, initialH > 0 ? initialH : initialW));
      setCanvasSizeState({ w: size, h: size });
    }

    return () => observer.disconnect();
  }, []);

  // Canvas サイズを更新（DPR対応）
  // Phase 12-E: サイズ変更時に背景キャッシュを無効化
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    invalidateBackgroundCache();
    setCanvasSize(canvas, canvasSize.w, canvasSize.h);
  }, [canvasSize]);

  // 描画関数
  const draw = useCallback((now?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderState = buildBallparkRenderState(
      view,
      playerSchoolId,
      ballAnimState?.currentPosition,
      ballAnimState?.heightNorm,
      ballAnimState?.homeRunProgress,
      ballAnimState?.playSequenceState,
    );

    renderBallpark(ctx, renderState, canvasSize.w, canvasSize.h);
    if (now !== undefined) lastDrawTimeRef.current = now;
  }, [view, playerSchoolId, ballAnimState, canvasSize]);

  // アニメーション中は RAF で描画（FPS 30 上限）、そうでなければ通常の effect で描画
  useEffect(() => {
    const isAnimating =
      ballAnimState?.isAnimating ||
      (ballAnimState?.homeRunProgress !== undefined &&
        ballAnimState.homeRunProgress > 0 &&
        ballAnimState.homeRunProgress < 1) ||
      (ballAnimState?.playSequenceState !== undefined &&
        ballAnimState.playSequenceState.totalProgress > 0 &&
        ballAnimState.playSequenceState.totalProgress < 1);

    if (isAnimating) {
      const loop = (now: number) => {
        // Phase 12-E: フレームスキップ（前フレームから TARGET_FRAME_MS 未満なら描画省略）
        if (now - lastDrawTimeRef.current >= TARGET_FRAME_MS) {
          draw(now);
        }
        animFrameRef.current = requestAnimationFrame(loop);
      };
      animFrameRef.current = requestAnimationFrame(loop);
      return () => {
        if (animFrameRef.current !== null) {
          cancelAnimationFrame(animFrameRef.current);
        }
      };
    } else {
      // 静止状態
      draw();
    }
  }, [ballAnimState?.isAnimating, ballAnimState?.homeRunProgress, draw]);

  // アンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={[styles.ballparkContainer, className].filter(Boolean).join(' ')}
      style={{ position: 'relative' }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: canvasSize.w, height: canvasSize.h, display: 'block' }}
        aria-label="グラウンド鳥瞰図"
        role="img"
      />
      {/* 左上 HUD オーバーレイ */}
      <MatchHUD view={view} scoreboardVisible={scoreboardVisible} />
    </div>
  );
}
