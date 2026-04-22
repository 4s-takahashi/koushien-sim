'use client';
/**
 * Phase 12-D/E: ボール・打球アニメーションフック
 *
 * requestAnimationFrame を使用して 60fps でボールを動かす
 * - 投球: マウンド → ホームプレート
 * - 打球: ホームプレート → 着弾点（ベジェ曲線）
 * - 影: 高さに応じてサイズ・透明度を変化
 *
 * Phase 12-E 追加:
 * - ホームランエフェクト進捗 (homeRunProgress) を返す
 * - triggerHomeRunEffect() でホームランパーティクルを起動
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { FieldPoint } from './field-coordinates';
import { FIELD_POSITIONS } from './field-coordinates';
import { pitchLocationToUV } from './pitch-marker-types';

// ===== 型定義 =====

/** 現在のボールアニメーション状態 */
export interface BallAnimationState {
  /** フィールド上の現在位置 */
  currentPosition: FieldPoint;
  /** 高さ正規化（0=地上, 1=最高点） */
  heightNorm: number;
  /** アニメーション中かどうか */
  isAnimating: boolean;
  /** 軌跡情報（打球の場合） */
  trajectory?: BallTrajectory;
  /**
   * Phase 12-E: ホームランエフェクト進捗（0-1）
   * undefined/0 = エフェクトなし
   */
  homeRunProgress?: number;
}

/** 打球軌跡 */
export interface BallTrajectory {
  startPos: FieldPoint;
  endPos: FieldPoint;
  /** ベジェ曲線のコントロールポイント */
  controlPoint: FieldPoint;
  /** 最大高さ正規化（0-1） */
  peakHeightNorm: number;
  /** アニメーション時間（ms） */
  durationMs: number;
  /** 打球種類 */
  type: 'fly' | 'grounder' | 'line_drive' | 'home_run';
}

/** 投球の視覚情報 */
export interface PitchResultVisual {
  actualLocation: { row: number; col: number };
  speedKmh: number;
  pitchType: string;
}

/** バットコンタクト情報（打球軌跡計算用） */
export interface BatContactForAnimation {
  contactType: 'ground_ball' | 'line_drive' | 'fly_ball' | 'popup' | 'bunt_ground';
  direction: number;    // 角度（0=LF, 45=CF, 90=RF）
  speed: 'weak' | 'normal' | 'hard' | 'bullet';
  distance: number;     // feet
}

// ===== ユーティリティ関数 =====

/** イーズイン（加速） */
function easeIn(t: number): number {
  return t * t;
}

/** イーズアウト（減速） */
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** 線形補間 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 2次ベジェ曲線 */
export function bezier2(
  p0: FieldPoint,
  p1: FieldPoint,
  p2: FieldPoint,
  t: number,
): FieldPoint {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

/**
 * 球速 (km/h) → アニメーション時間 (ms)
 *
 * 150km/h → ~200ms, 120km/h → ~350ms, 80km/h → ~450ms
 */
export function pitchSpeedToDuration(speedKmh: number): number {
  const clipped = Math.max(80, Math.min(170, speedKmh));
  return Math.round(450 - ((clipped - 80) / 90) * 250);
}

/**
 * エンジンのpitchLocation (5×5グリッド) → フィールド上の近似座標
 */
function pitchLocationToField(location: {
  row: number;
  col: number;
}): FieldPoint {
  // ホームプレート付近に投球が来る
  // col: 0=内角ボール〜4=外角ボール → x: -2 〜 2 feet
  // row: 0=高めボール〜4=低めボール → ホームプレート上（y≈0）
  const uv = pitchLocationToUV(location.row, location.col);
  return {
    x: (uv.x - 0.5) * 4, // ±2 feet
    y: 1, // ホームプレート直前
  };
}

/**
 * prefers-reduced-motion チェック
 */
function shouldReduceMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 打球軌跡を計算する
 */
export function computeTrajectory(contact: BatContactForAnimation): BallTrajectory {
  const { contactType, direction, speed, distance } = contact;

  // 角度をセンター=0基準に変換（エンジンは 0=LF, 45=CF, 90=RF）
  const adjustedDeg = direction - 45;
  const rad = (adjustedDeg * Math.PI) / 180;

  // 着弾点（実際の距離の 80% で簡略化）
  const scaledDist = distance * 0.8;
  const endPos: FieldPoint = {
    x: Math.sin(rad) * scaledDist,
    y: Math.cos(rad) * scaledDist,
  };

  // 打球種類に応じた高さと時間
  const peakHeightNorm =
    contactType === 'fly_ball' ? 0.8 :
    contactType === 'popup' ? 0.9 :
    contactType === 'line_drive' ? 0.35 :
    contactType === 'ground_ball' ? 0.08 :
    contactType === 'bunt_ground' ? 0.05 :
    0.4;

  // コントロールポイント（ベジェ曲線の頂点）
  const controlPoint: FieldPoint = {
    x: endPos.x * 0.4,
    y: endPos.y * 0.4 + (endPos.y * peakHeightNorm * 0.6),
  };

  // 速度に応じたアニメーション時間
  const durationMs =
    speed === 'bullet' ? 500 :
    speed === 'hard' ? 700 :
    speed === 'normal' ? 900 :
    1200;

  // ホームランの場合はタイプを変更
  const trajType: BallTrajectory['type'] =
    contactType === 'fly_ball' && distance >= 350 ? 'home_run' :
    contactType === 'fly_ball' ? 'fly' :
    contactType === 'ground_ball' || contactType === 'bunt_ground' ? 'grounder' :
    contactType === 'line_drive' ? 'line_drive' :
    'fly';

  return {
    startPos: { x: 0, y: 0 },
    endPos,
    controlPoint,
    peakHeightNorm,
    durationMs,
    type: trajType,
  };
}

// ===== メインフック =====

export interface UseBallAnimationReturn {
  ballState: BallAnimationState | null;
  triggerPitchAnimation: (pitch: PitchResultVisual) => void;
  triggerHitAnimation: (trajectory: BallTrajectory) => void;
  /**
   * Phase 12-E: ホームランエフェクトを起動する
   * （triggerHitAnimation の後、type='home_run' のときに呼び出す）
   */
  triggerHomeRunEffect: () => void;
  resetBall: () => void;
}

export function useBallAnimation(): UseBallAnimationReturn {
  const [ballState, setBallState] = useState<BallAnimationState | null>(null);
  const rafRef = useRef<number | null>(null);
  const homeRunRafRef = useRef<number | null>(null);

  // アニメーションループを停止
  const stopAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // ホームランエフェクトを停止
  const stopHomeRunEffect = useCallback(() => {
    if (homeRunRafRef.current !== null) {
      cancelAnimationFrame(homeRunRafRef.current);
      homeRunRafRef.current = null;
    }
  }, []);

  /**
   * 投球アニメーション（マウンド → ホームプレート）
   */
  const triggerPitchAnimation = useCallback(
    (pitch: PitchResultVisual) => {
      stopAnimation();

      // prefers-reduced-motion 対応
      if (shouldReduceMotion()) {
        const endPos = pitchLocationToField(pitch.actualLocation);
        setBallState({ currentPosition: endPos, heightNorm: 0, isAnimating: false });
        return;
      }

      const startTime = performance.now();
      const duration = pitchSpeedToDuration(pitch.speedKmh);
      const startPos = { ...FIELD_POSITIONS.pitcher };
      const endPos = pitchLocationToField(pitch.actualLocation);

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        const eased = easeIn(t);

        const pos: FieldPoint = {
          x: lerp(startPos.x, endPos.x, eased),
          y: lerp(startPos.y, endPos.y, eased),
        };

        // 投球の微妙な弧（高さは最大15%）
        const heightNorm = Math.sin(eased * Math.PI) * 0.15;

        setBallState({ currentPosition: pos, heightNorm, isAnimating: t < 1 });

        if (t < 1) {
          rafRef.current = requestAnimationFrame(animate);
        } else {
          rafRef.current = null;
        }
      };

      rafRef.current = requestAnimationFrame(animate);
    },
    [stopAnimation],
  );

  /**
   * 打球アニメーション（ホームプレート → 着弾点、ベジェ曲線）
   */
  const triggerHitAnimation = useCallback(
    (trajectory: BallTrajectory) => {
      stopAnimation();

      // prefers-reduced-motion 対応
      if (shouldReduceMotion()) {
        setBallState({
          currentPosition: trajectory.endPos,
          heightNorm: 0,
          isAnimating: false,
          trajectory,
        });
        return;
      }

      const startTime = performance.now();

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / trajectory.durationMs, 1);
        const eased = trajectory.type === 'grounder' ? t : easeOut(t);

        // ベジェ曲線で位置を計算
        const pos = bezier2(
          trajectory.startPos,
          trajectory.controlPoint,
          trajectory.endPos,
          eased,
        );

        // 高さは sin 曲線
        const heightNorm = Math.sin(eased * Math.PI) * trajectory.peakHeightNorm;

        setBallState({
          currentPosition: pos,
          heightNorm,
          isAnimating: t < 1,
          trajectory,
        });

        if (t < 1) {
          rafRef.current = requestAnimationFrame(animate);
        } else {
          rafRef.current = null;
          // 着弾 300ms 後にボールを非表示
          setTimeout(() => setBallState(null), 300);
        }
      };

      rafRef.current = requestAnimationFrame(animate);
    },
    [stopAnimation],
  );

  const resetBall = useCallback(() => {
    stopAnimation();
    stopHomeRunEffect();
    setBallState(null);
  }, [stopAnimation, stopHomeRunEffect]);

  /**
   * Phase 12-E: ホームランパーティクルエフェクト（1.4秒）
   */
  const triggerHomeRunEffect = useCallback(() => {
    stopHomeRunEffect();
    if (shouldReduceMotion()) return;

    const startTime = performance.now();
    const DURATION = 1400; // ms

    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / DURATION, 1);
      setBallState((prev) =>
        prev ? { ...prev, homeRunProgress: progress } : null,
      );
      if (progress < 1) {
        homeRunRafRef.current = requestAnimationFrame(animate);
      } else {
        homeRunRafRef.current = null;
        // エフェクト終了後にホームランフラグをクリア
        setBallState((prev) =>
          prev ? { ...prev, homeRunProgress: 0 } : null,
        );
      }
    };

    homeRunRafRef.current = requestAnimationFrame(animate);
  }, [stopHomeRunEffect]);

  // アンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      stopAnimation();
      stopHomeRunEffect();
    };
  }, [stopAnimation, stopHomeRunEffect]);

  return { ballState, triggerPitchAnimation, triggerHitAnimation, triggerHomeRunEffect, resetBall };
}
