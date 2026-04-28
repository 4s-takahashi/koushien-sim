/**
 * engine/physics/bat-ball/perceived-quality.ts
 * Phase R2-3: 投球の打者認知抽象品質パラメータ生成（V3 §3.2）
 *
 * 投球の3D軌道は持たないが、打者認知に効く抽象指標を連続値で計算する。
 * これが Layer 3 Step A の入力の一部になる。
 *
 * V3 §3.2 完全準拠: 球種別ブレイク量・見かけ球速バイアス・緩急差・終盤変化・打ちにくさ
 */

import type { PerceivedPitchQuality } from '../types';
import type { PitcherParams } from '../../match/types';

// ============================================================
// 入力コンテキスト
// ============================================================

/**
 * computePerceivedPitchQuality への入力
 * 投球品質を打者目線の抽象品質に変換するのに必要な情報をまとめる。
 */
export interface PerceivedPitchInput {
  /** 投球の物理球速 (km/h) */
  readonly pitchVelocity: number;
  /** 投球種別（'fastball' | 'slider' | 'curveball' | 'changeup' | 'fork' | 'splitter' | 'cutter' | 'sinker' 等） */
  readonly pitchType: string;
  /** 球種ごとの変化レベル 1-7 (1=直線、7=大きく変化) */
  readonly pitchBreakLevel: number;
  /** ストライクゾーン上の実際の到達点（5x5 グリッド + ノイズ） */
  readonly pitchActualLocation: { row: number; col: number };
  /** 投手能力 */
  readonly pitcher: PitcherParams;
  /** 直前球の球速 (km/h)。打席1球目は null */
  readonly previousPitchVelocity: number | null;
  /** 直前球の球種。打席1球目は null */
  readonly previousPitchType: string | null;
  /** 投手の残スタミナ (0-100) */
  readonly pitcherStaminaPct: number;
  /** 投手の試合中の自信 (0-100) */
  readonly pitcherConfidence: number;
}

// ============================================================
// 公式・定数（V3 §3.2 準拠）
// ============================================================

/** 球種ごとの「ブレイク強度」基礎値 (0-1) — 直線系は低、変化球系は高 */
export const PITCH_TYPE_BREAK_BASE: Readonly<Record<string, number>> = {
  fastball: 0.05,
  straight: 0.05,
  cutter: 0.30,
  sinker: 0.40,
  slider: 0.55,
  splitter: 0.65,
  fork: 0.70,
  curveball: 0.75,
  changeup: 0.45,
};

/** 球種ごとの「終盤変化（手元での落ち・伸び）」基礎値 (0-1) */
export const PITCH_TYPE_LATE_MOVEMENT: Readonly<Record<string, number>> = {
  fastball: 0.10,
  straight: 0.10,
  cutter: 0.25,
  sinker: 0.35,
  slider: 0.30,
  splitter: 0.65,
  fork: 0.70,
  curveball: 0.20,
  changeup: 0.55,
};

/**
 * 球種ごとの「見かけの圧」係数
 * fastball は physical velocity 通りに見えるが、
 * 投手のフォームや球質次第で +/-数km/h ほど見かけが変わる
 */
export const PITCH_TYPE_PERCEIVED_VELOCITY_BIAS: Readonly<Record<string, number>> = {
  fastball: 1.0,
  straight: 1.0,
  cutter: 0.98,
  sinker: 0.97,
  slider: 0.93,
  splitter: 0.85,
  fork: 0.85,
  curveball: 0.80,
  changeup: 0.65,
};

/** 緩急差を「強く感じる」か判定するしきい値 (km/h) — 25km/h で上限 1.0 */
export const VELOCITY_CHANGE_THRESHOLD_KMH = 25;

// ============================================================
// 公開関数
// ============================================================

/**
 * 投球の打者認知抽象品質を計算する（V3 §3.2）
 *
 * 計算方針:
 * - perceivedVelocity = pitchVelocity * PITCH_TYPE_PERCEIVED_VELOCITY_BIAS
 *   + confidence 起因の威圧（additive km/h オフセット）
 *   + コース補正（高めはやや早く感じる +最大 3km/h）
 * - velocityChangeImpact = clamp(|prev - cur| / 25, 0, 1)
 *   prev=null（初球）は 0
 * - breakSharpness = clamp(BREAK_BASE * (breakLevel/7) * controlFactor, 0, 1)
 *   control 高い投手ほど変化が鋭く見える（制球よく変化させる）
 * - lateMovement = clamp(LATE_BASE * staminaFactor, 0, 1)
 *   ※ スタミナ切れだと球が止まって終盤変化が薄れる（< 30 で低下）
 * - difficulty = clamp(0.4*break + 0.3*late + 0.2*velocityChangeImpact
 *                     + 0.1*locationDifficulty, 0, 1)
 *
 * @param input 入力コンテキスト
 * @returns PerceivedPitchQuality (5 軸の連続値、すべて 0-1 か km/h)
 */
export function computePerceivedPitchQuality(
  input: PerceivedPitchInput,
): PerceivedPitchQuality {
  const breakBase = PITCH_TYPE_BREAK_BASE[input.pitchType] ?? 0.3;
  const lateBase = PITCH_TYPE_LATE_MOVEMENT[input.pitchType] ?? 0.2;
  const perceivedBias = PITCH_TYPE_PERCEIVED_VELOCITY_BIAS[input.pitchType] ?? 0.95;

  // ──────────────────────────────────────────────────
  // perceivedVelocity — 見かけ球速感 (km/h)
  // confidence が高いと投手フォームに威圧感が増し +最大 4km/h
  // 高め（row=0）は打者目線で速く見える +最大 3km/h（row=2基準）
  // ──────────────────────────────────────────────────
  const confidenceBoost = (input.pitcherConfidence - 50) * 0.08; // -4 〜 +4 km/h
  // row: 0=高め, 4=低め。高め → +3km/h, 低め → -3km/h
  const locationVelocityBoost = (2 - input.pitchActualLocation.row) * 1.5; // -3 〜 +3 km/h
  const perceivedVelocity =
    input.pitchVelocity * perceivedBias + confidenceBoost + locationVelocityBoost;

  // ──────────────────────────────────────────────────
  // velocityChangeImpact — 緩急差 (0-1)
  // |前球球速 - 現球速| / 25 でクランプ
  // ──────────────────────────────────────────────────
  const velocityChangeImpact =
    input.previousPitchVelocity != null
      ? clamp01(
          Math.abs(input.previousPitchVelocity - input.pitchVelocity) /
            VELOCITY_CHANGE_THRESHOLD_KMH,
        )
      : 0;

  // ──────────────────────────────────────────────────
  // breakSharpness — ブレイク強度 (0-1)
  // BREAK_BASE * (breakLevel/7) * controlFactor
  // controlFactor: 制球高いほど変化が鋭く感じる（0.8〜1.2 の範囲）
  // ──────────────────────────────────────────────────
  const controlFactor = 0.8 + (input.pitcher.control / 100) * 0.4; // 0.80〜1.20
  const breakSharpness = clamp01(
    breakBase * (input.pitchBreakLevel / 7) * controlFactor,
  );

  // ──────────────────────────────────────────────────
  // lateMovement — 終盤変化 (0-1)
  // スタミナ 30% 未満で変化が薄れる（0.7倍）
  // スタミナ 30-60% で微減（線形補間）
  // スタミナ 60% 以上はフル発揮
  // ──────────────────────────────────────────────────
  const staminaFactor = computeStaminaFactor(input.pitcherStaminaPct);
  const lateMovement = clamp01(lateBase * staminaFactor);

  // ──────────────────────────────────────────────────
  // difficulty — 打ちにくさ総合 (0-1)
  // コース難度: ストライクゾーン端（row/col が 0 or 4）ほど打ちにくい
  // rowDist/colDist は 0〜2 → (dist1+dist2)/4 で 0〜1 スケール
  // ──────────────────────────────────────────────────
  const rowDist = Math.abs(input.pitchActualLocation.row - 2);
  const colDist = Math.abs(input.pitchActualLocation.col - 2);
  const locationDifficulty = clamp01((rowDist + colDist) / 4);

  const difficulty = clamp01(
    0.4 * breakSharpness +
    0.3 * lateMovement +
    0.2 * velocityChangeImpact +
    0.1 * locationDifficulty,
  );

  return {
    perceivedVelocity,
    velocityChangeImpact,
    breakSharpness,
    lateMovement,
    difficulty,
  };
}

// ============================================================
// 内部ヘルパー
// ============================================================

/**
 * スタミナに応じた終盤変化スケール係数
 * - 60% 以上: 1.0（フル発揮）
 * - 30-60%: 1.0 → 0.7 に線形低下
 * - 30% 未満: 0.7（球が止まり変化が薄れる）
 */
function computeStaminaFactor(staminaPct: number): number {
  if (staminaPct >= 60) return 1.0;
  if (staminaPct < 30) return 0.7;
  // 30〜60% の線形補間
  return 0.7 + ((staminaPct - 30) / 30) * 0.3;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
