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
  /**
   * Phase 12-G: プレイシーケンス（内野ゴロ等の複合アニメーション）
   * undefined = シーケンスなし
   */
  playSequenceState?: PlaySequenceState;
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

// ===== Phase 12-G: プレイシーケンス（内野ゴロ等の複合アニメーション）=====

/**
 * アニメーションフェーズの種類
 *
 * 各フェーズは t=0..1 の進行度で制御する
 */
export type PlayPhaseKind =
  | 'groundRoll'   // ボールがゴロで内野に転がる
  | 'fielderMove'  // 内野手がボールに向かって移動
  | 'throw'        // 内野手から一塁へ送球
  | 'batterRun'    // バッターが本塁→一塁へ走塁
  | 'result';      // アウト/セーフ判定フラッシュ

export interface PlayPhase {
  kind: PlayPhaseKind;
  /** フェーズ開始時刻（ms、シーケンス内相対時刻） */
  startMs: number;
  /** フェーズ終了時刻（ms、シーケンス内相対時刻） */
  endMs: number;
  /** フェーズ固有データ */
  data: PlayPhaseData;
}

export type PlayPhaseData =
  | { kind: 'groundRoll';  from: FieldPoint; to: FieldPoint }
  | { kind: 'fielderMove'; from: FieldPoint; to: FieldPoint; fielderPosKey: string }
  | { kind: 'throw';       from: FieldPoint; to: FieldPoint }
  | { kind: 'batterRun';   from: FieldPoint; to: FieldPoint }
  | { kind: 'result';      text: string; isOut: boolean };

/** プレイシーケンス定義 */
export interface PlaySequence {
  phases: PlayPhase[];
  totalMs: number;
}

/** プレイシーケンスの現在状態（描画用） */
export interface PlaySequenceState {
  /** 現在アクティブなフェーズとその進行度 */
  activePhases: {
    phase: PlayPhase;
    /** フェーズ内の進行度 (0-1) */
    t: number;
  }[];
  /** 現在のボール位置 */
  ballPosition?: FieldPoint;
  /** 動的フィールダー位置（posKey=ポジション名, pos=現在位置） */
  animatedFielder?: { posKey: string; pos: FieldPoint };
  /** バッター走者位置 */
  batterRunnerPos?: FieldPoint;
  /** 判定テキスト */
  resultText?: { text: string; isOut: boolean };
  /** シーケンス全体の進行度 (0-1) */
  totalProgress: number;
}

/**
 * Phase 12-G: 打球の着弾方向からどのポジションの選手が捕球するか判定
 */
function getFielderForGroundBall(direction: number): {
  posKey: string;
  fieldPos: FieldPoint;
} {
  // direction: 0=LF, 45=CF, 90=RF
  // 内野ゴロの場合は 3B/SS/2B/1B のいずれか
  if (direction < 25) {
    return { posKey: 'third', fieldPos: FIELD_POSITIONS.thirdBase };
  } else if (direction < 45) {
    return { posKey: 'shortstop', fieldPos: FIELD_POSITIONS.shortstop };
  } else if (direction < 70) {
    return { posKey: 'second', fieldPos: FIELD_POSITIONS.secondBase };
  } else {
    return { posKey: 'first', fieldPos: FIELD_POSITIONS.firstBase };
  }
}

/**
 * Phase 12-G: 内野ゴロのプレイシーケンスを構築
 *
 * @param contact バットコンタクト情報
 * @param isOut アウトかどうか
 */
export function buildGroundOutSequence(
  contact: BatContactForAnimation,
  isOut: boolean,
): PlaySequence {
  const { direction } = contact;

  // ゴロの着弾位置（短距離）
  const adjustedDeg = direction - 45;
  const rad = (adjustedDeg * Math.PI) / 180;
  const groundDist = 60; // 内野手の前で止まる
  const ballLandPos: FieldPoint = {
    x: Math.sin(rad) * groundDist,
    y: Math.cos(rad) * groundDist,
  };

  // 捕球する内野手
  const { posKey, fieldPos } = getFielderForGroundBall(direction);

  // 一塁手の位置
  const firstBase: FieldPoint = FIELD_POSITIONS.first;
  const firstBasePlayer: FieldPoint = FIELD_POSITIONS.firstBase;

  // バッター走者の開始位置（ホームプレート）
  const home: FieldPoint = FIELD_POSITIONS.home;

  // タイムライン（ms）
  const T = {
    rollStart:     0,
    rollEnd:       400,
    fielderStart:  100,   // ゴロと同時に動き出す
    fielderEnd:    500,
    throwStart:    550,
    throwEnd:      900,
    batterStart:   400,   // ゴロが転がり始めたら走る
    batterEnd:    1300,
    resultStart:   950,
    resultEnd:    1500,
  };

  const phases: PlayPhase[] = [
    {
      kind: 'groundRoll',
      startMs: T.rollStart,
      endMs: T.rollEnd,
      data: { kind: 'groundRoll', from: home, to: ballLandPos },
    },
    {
      kind: 'fielderMove',
      startMs: T.fielderStart,
      endMs: T.fielderEnd,
      data: { kind: 'fielderMove', from: fieldPos, to: ballLandPos, fielderPosKey: posKey },
    },
    {
      kind: 'throw',
      startMs: T.throwStart,
      endMs: T.throwEnd,
      data: { kind: 'throw', from: ballLandPos, to: firstBasePlayer },
    },
    {
      kind: 'batterRun',
      startMs: T.batterStart,
      endMs: T.batterEnd,
      data: { kind: 'batterRun', from: home, to: firstBase },
    },
    {
      kind: 'result',
      startMs: T.resultStart,
      endMs: T.resultEnd,
      data: { kind: 'result', text: isOut ? 'アウト！' : 'セーフ！', isOut },
    },
  ];

  return {
    phases,
    totalMs: T.resultEnd,
  };
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
  // Phase 12-G: ホームランは場外（フェンス外）まで飛ぶよう距離を大幅に伸ばす
  const isHomeRun = contactType === 'fly_ball' && distance >= 350;
  const scaledDist = isHomeRun
    ? distance * 2.8   // フェンスを超えてキャンバス外まで
    : distance * 0.8;
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
  const isHomeRunType = contactType === 'fly_ball' && distance >= 350;
  const trajType: BallTrajectory['type'] =
    isHomeRunType ? 'home_run' :
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
  /**
   * Phase 12-G: プレイシーケンス（内野ゴロ等）を起動する
   */
  triggerPlaySequence: (sequence: PlaySequence) => void;
  resetBall: () => void;
}

export function useBallAnimation(): UseBallAnimationReturn {
  const [ballState, setBallState] = useState<BallAnimationState | null>(null);
  const rafRef = useRef<number | null>(null);
  const homeRunRafRef = useRef<number | null>(null);
  const seqRafRef = useRef<number | null>(null);

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

  // プレイシーケンスを停止
  const stopPlaySequence = useCallback(() => {
    if (seqRafRef.current !== null) {
      cancelAnimationFrame(seqRafRef.current);
      seqRafRef.current = null;
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

  /**
   * Phase 12-G: プレイシーケンスアニメーション（内野ゴロ等）
   */
  const triggerPlaySequence = useCallback(
    (sequence: PlaySequence) => {
      stopPlaySequence();
      if (shouldReduceMotion()) return;

      const startMs = performance.now();

      const animateSeq = (now: number) => {
        const elapsed = now - startMs;
        const totalProgress = Math.min(elapsed / sequence.totalMs, 1);

        // 各フェーズの進行度を計算
        const activePhases: PlaySequenceState['activePhases'] = [];
        let ballPos: FieldPoint | undefined;
        let animatedFielder: PlaySequenceState['animatedFielder'];
        let batterRunnerPos: FieldPoint | undefined;
        let resultText: PlaySequenceState['resultText'];

        for (const phase of sequence.phases) {
          if (elapsed < phase.startMs) continue;
          const phaseElapsed = elapsed - phase.startMs;
          const phaseDur = phase.endMs - phase.startMs;
          const t = Math.min(phaseElapsed / phaseDur, 1);

          activePhases.push({ phase, t });

          const d = phase.data;
          switch (d.kind) {
            case 'groundRoll': {
              // ゴロ: ホーム → 内野手方向 (低弧線)
              const et = easeOut(t);
              ballPos = {
                x: lerp(d.from.x, d.to.x, et),
                y: lerp(d.from.y, d.to.y, et),
              };
              break;
            }
            case 'fielderMove': {
              // 内野手移動
              const et = easeOut(t);
              const fielderPos: FieldPoint = {
                x: lerp(d.from.x, d.to.x, et),
                y: lerp(d.from.y, d.to.y, et),
              };
              animatedFielder = { posKey: d.fielderPosKey, pos: fielderPos };
              // t=0.9 以降はボールをキャッチ
              if (t >= 0.9) {
                ballPos = fielderPos;
              }
              break;
            }
            case 'throw': {
              // 送球: 軽い放物線
              const et = easeOut(t);
              const bx = lerp(d.from.x, d.to.x, et);
              const by = lerp(d.from.y, d.to.y, et);
              // 軽い弧
              const arc = Math.sin(Math.PI * t) * 20;
              ballPos = { x: bx, y: by + arc };
              break;
            }
            case 'batterRun': {
              // バッター走塁: ホーム → 一塁
              const et = easeOut(t);
              batterRunnerPos = {
                x: lerp(d.from.x, d.to.x, et),
                y: lerp(d.from.y, d.to.y, et),
              };
              break;
            }
            case 'result': {
              resultText = { text: d.text, isOut: d.isOut };
              break;
            }
          }
        }

        // ballState を更新
        const seqState: PlaySequenceState = {
          activePhases,
          ballPosition: ballPos,
          animatedFielder,
          batterRunnerPos,
          resultText,
          totalProgress,
        };

        setBallState((prev) => {
          const base = prev ?? {
            currentPosition: { x: 0, y: 0 },
            heightNorm: 0,
            isAnimating: totalProgress < 1,
          };
          return {
            ...base,
            currentPosition: ballPos ?? base.currentPosition,
            heightNorm: 0,
            isAnimating: totalProgress < 1,
            playSequenceState: seqState,
          };
        });

        if (totalProgress < 1) {
          seqRafRef.current = requestAnimationFrame(animateSeq);
        } else {
          seqRafRef.current = null;
          // シーケンス終了後に状態をクリア
          setTimeout(() => {
            setBallState((prev) =>
              prev ? { ...prev, playSequenceState: undefined, isAnimating: false } : null,
            );
          }, 300);
        }
      };

      seqRafRef.current = requestAnimationFrame(animateSeq);
    },
    [stopPlaySequence],
  );

  const resetBall = useCallback(() => {
    stopAnimation();
    stopHomeRunEffect();
    stopPlaySequence();
    setBallState(null);
  }, [stopAnimation, stopHomeRunEffect, stopPlaySequence]);

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
      stopPlaySequence();
    };
  }, [stopAnimation, stopHomeRunEffect, stopPlaySequence]);

  return {
    ballState,
    triggerPitchAnimation,
    triggerHitAnimation,
    triggerHomeRunEffect,
    triggerPlaySequence,
    resetBall,
  };
}
