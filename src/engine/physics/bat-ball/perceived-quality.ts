/**
 * engine/physics/bat-ball/perceived-quality.ts
 * Phase R2-3: 投球の打者認知抽象品質パラメータ生成（V3 §3.2）
 *
 * 投球の3D軌道は持たないが、打者認知に効く抽象指標を連続値で計算する。
 * これが Layer 3 Step A の入力の一部になる。
 *
 * ⚠️ 案C 骨格: 型定義と関数シグネチャは固定。計算詳細は ACP (Claude Code) で実装。
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
// 公式・定数（仮置き、ACP で最終調整）
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
 * 投手のフォームや球質次第で +/-3km/h ほど見かけが変わる
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

/** 緩急差を「強く感じる」か判定するしきい値 (km/h) */
export const VELOCITY_CHANGE_THRESHOLD_KMH = 10;

// ============================================================
// 公開関数
// ============================================================

/**
 * 投球の打者認知抽象品質を計算する（V3 §3.2）
 *
 * 計算方針（ACP で詳細実装）:
 * - perceivedVelocity = pitchVelocity * PITCH_TYPE_PERCEIVED_VELOCITY_BIAS
 *   + pitcherForm 係数（confidence 起因の威圧）
 *   + コース補正（高めはやや早く感じる）
 * - velocityChangeImpact = clamp(|prev - cur| / 25, 0, 1)
 *   prev=null（初球）は 0
 * - breakSharpness = PITCH_TYPE_BREAK_BASE * (pitchBreakLevel / 7) * (1 + control 補正)
 * - lateMovement = PITCH_TYPE_LATE_MOVEMENT * (pitcherStaminaPct/100 はほぼ 1.0)
 *   ※ スタミナ切れだと逆に落ちなくなるので staminaPct < 30 でやや低下
 * - difficulty = sigmoid(0.4*break + 0.3*late + 0.2*velocityChangeImpact
 *                       + 0.1*locationDifficulty)
 *
 * @param input 入力コンテキスト
 * @returns PerceivedPitchQuality (5 軸の連続値、すべて 0-1 か km/h)
 */
export function computePerceivedPitchQuality(
  input: PerceivedPitchInput,
): PerceivedPitchQuality {
  // ▼▼▼ ACP-IMPLEMENT-HERE ▼▼▼
  // 詳細実装は ACP に委譲。下記はインタフェース確認用の最小骨格。

  const breakBase = PITCH_TYPE_BREAK_BASE[input.pitchType] ?? 0.3;
  const lateBase = PITCH_TYPE_LATE_MOVEMENT[input.pitchType] ?? 0.2;
  const perceivedBias = PITCH_TYPE_PERCEIVED_VELOCITY_BIAS[input.pitchType] ?? 0.95;

  // 見かけ球速（仮実装）
  const confidenceBoost = 1 + (input.pitcherConfidence - 50) * 0.001;
  const perceivedVelocity = input.pitchVelocity * perceivedBias * confidenceBoost;

  // 緩急差（仮実装）
  const velocityChangeImpact = input.previousPitchVelocity != null
    ? Math.min(1, Math.abs(input.previousPitchVelocity - input.pitchVelocity) / 25)
    : 0;

  // ブレイク強度（仮実装）
  const controlAdjust = (input.pitcher.control - 50) / 200; // -0.25 〜 +0.25
  const breakSharpness = clamp01(breakBase * (input.pitchBreakLevel / 7) * (1 + controlAdjust));

  // 終盤変化（仮実装）
  const staminaPenalty = input.pitcherStaminaPct < 30 ? 0.7 : 1.0;
  const lateMovement = clamp01(lateBase * staminaPenalty);

  // コース難度（仮実装）— ストライクゾーン端ほど打ちにくい
  const rowDist = Math.abs(input.pitchActualLocation.row - 2);
  const colDist = Math.abs(input.pitchActualLocation.col - 2);
  const locationDifficulty = clamp01((rowDist + colDist) / 4);

  // 打ちにくさ総合（仮実装）
  const rawDifficulty =
    0.4 * breakSharpness +
    0.3 * lateMovement +
    0.2 * velocityChangeImpact +
    0.1 * locationDifficulty;
  const difficulty = clamp01(rawDifficulty);

  // ▲▲▲ ACP-IMPLEMENT-HERE ▲▲▲

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

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
