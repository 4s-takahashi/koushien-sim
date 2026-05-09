/**
 * pitcher-shake-off.ts — ピッチャー首振り判定
 *
 * v0.48 Phase 3: キャッチャーの要求を投手が受け入れる（頷く）か首を振るかを決定する。
 * 首を振った場合、投手は独自の判断でターゲットコースを選ぶ。
 *
 * 設計書: SPEC_v0.48_BATTERY_AND_FIELDING.md Section 3.2
 *
 * 純粋関数: Math.random() 不使用。乱数は RNG を引数で受け取る。
 */

import type { PitchLocation } from '../types';
import type { RNG } from '../../core/rng';

// ============================================================
// 型定義
// ============================================================

export interface ShakeOffContext {
  /** キャッチャー要求コース */
  catcherRequest: PitchLocation;
  /** キャッチャー要求球種（省略可: 球種まで要求しない場合） */
  catcherRequestPitch?: string;
  /** 投手のメンタル 0-100 */
  pitcherMental: number;
  /** 投手の試合内投球数（経験値として使用） */
  pitcherExperience: number;
  /**
   * バッテリー信頼関係スコア 0-100
   * = (pitcher.mental + catcher.leadership) / 2 の近似
   */
  batteryTrust: number;
  /** 投手の特性（'stubborn' などを含む場合に首振り率を上げる） */
  pitcherTraits: readonly string[];
}

export interface ShakeOffResult {
  /** 首を振ったか */
  isShakeOff: boolean;
  /**
   * 採用された target コース
   * 首を縦に振った場合 = catcherRequest と同一
   * 首を振った場合 = 投手独自の判断
   */
  targetLocation: PitchLocation;
}

// ============================================================
// 定数
// ============================================================

/** 通常の首振り基本確率 */
const BASE_SHAKE_OFF_RATE = 0.10;

/** 首振り確率の上限 */
const MAX_SHAKE_OFF_RATE = 0.60;

/** 首振り確率の下限 */
const MIN_SHAKE_OFF_RATE = 0.02;

// ============================================================
// メイン関数
// ============================================================

/**
 * 投手の首振り判定を行う
 *
 * 首振り確率の計算式:
 *   baseShakeOffRate = 0.10
 *
 *   ボーナス/ペナルティ:
 *     batteryTrust >= 80: -0.05（信頼が厚いほど首を振らない）
 *     batteryTrust <= 30: +0.15（信頼が薄いと自己判断多）
 *     stubborn 特性: +0.20
 *     pitcherMental < 40: +0.10（精神的に不安定）
 *     pitcherExperience > 80球: +0.08（疲労で判断力低下）
 *
 *   shakeOffRate = clamp(base + bonus合計, 0.02, 0.60)
 *
 * 純粋関数: Math.random() 不使用。RNG を引数で受け取る。
 */
export function decidePitcherShakeOff(
  ctx: ShakeOffContext,
  rng: RNG,
): ShakeOffResult {
  const shakeOffRate = calcShakeOffRate(ctx);

  const isShakeOff = rng.derive('pitcher-shake-off').chance(shakeOffRate);

  if (!isShakeOff) {
    // 首を縦に振った: キャッチャーの要求に従う
    return {
      isShakeOff: false,
      targetLocation: ctx.catcherRequest,
    };
  }

  // 首を振った: 投手独自のターゲットを生成
  const targetLocation = buildIndependentTarget(ctx.catcherRequest, rng.derive('pitcher-shake-target'));

  return {
    isShakeOff: true,
    targetLocation,
  };
}

// ============================================================
// 内部: 首振り確率計算
// ============================================================

function calcShakeOffRate(ctx: ShakeOffContext): number {
  let rate = BASE_SHAKE_OFF_RATE;

  // batteryTrust による補正
  if (ctx.batteryTrust >= 80) {
    rate -= 0.05; // 信頼が厚い
  } else if (ctx.batteryTrust <= 30) {
    rate += 0.15; // 信頼が薄い
  }

  // stubborn 特性
  if (ctx.pitcherTraits.includes('stubborn')) {
    rate += 0.20;
  }

  // 精神的に不安定
  if (ctx.pitcherMental < 40) {
    rate += 0.10;
  }

  // 疲労による判断力低下（80球以上）
  if (ctx.pitcherExperience > 80) {
    rate += 0.08;
  }

  return Math.max(MIN_SHAKE_OFF_RATE, Math.min(MAX_SHAKE_OFF_RATE, rate));
}

// ============================================================
// 内部: 投手独自ターゲット生成
// ============================================================

/**
 * キャッチャーの要求とは異なる投手独自のターゲットを生成する。
 * 要求コースの隣接エリアか、全く異なるゾーンに投げる。
 */
function buildIndependentTarget(
  catcherRequest: PitchLocation,
  rng: RNG,
): PitchLocation {
  const r = rng.next();

  if (r < 0.5) {
    // 隣接コース（±1-2 マスのシフト）
    const rowShift = rng.intBetween(-1, 1);
    const colShift = rng.intBetween(-1, 1);
    // ゼロシフトを避ける（同じコースにならないように）
    const actualRowShift = rowShift === 0 && colShift === 0 ? 1 : rowShift;
    return {
      row: Math.max(0, Math.min(4, catcherRequest.row + actualRowShift)),
      col: Math.max(0, Math.min(4, catcherRequest.col + colShift)),
    };
  } else if (r < 0.75) {
    // ゾーン内の別のコース
    const row = rng.intBetween(1, 3);
    const col = rng.intBetween(1, 3);
    return { row, col };
  } else {
    // ボール球（外角/内角）
    return {
      row: rng.intBetween(1, 3),
      col: rng.chance(0.5) ? 0 : 4,
    };
  }
}
