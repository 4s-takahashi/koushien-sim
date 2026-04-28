/**
 * engine/physics/resolver/contact.ts — バット・ボール接触判定
 *
 * Phase R3 §6.2 相当のサブモジュール。
 * バットスイングプロファイルと SwingLatentState を受け取り、
 * 接触の有無・品質・ファウル判定を決定する。
 *
 * 依存: resolver/bat-swing.ts, resolver/types.ts, engine/physics/types.ts
 * 循環参照: なし
 */

import type { SwingLatentState, BallTrajectoryParams } from '../types';
import type { BatSwingProfile, ContactDetail } from './types';
import type { RNG } from '../../core/rng';
import { isCheckSwing } from './bat-swing';

// ============================================================
// 定数
// ============================================================

/** コンタクト成立の最小品質しきい値 */
export const MIN_CONTACT_QUALITY = 0.05;

/** ファウルチップとみなすコンタクト品質の上限 */
export const FOUL_TIP_QUALITY_THRESHOLD = 0.15;

/** チェックスイングでのファウル確率 */
export const CHECK_SWING_FOUL_PROB = 0.4;

/** 当たり損ね（check swing dribbler）の contactQuality 上限 */
export const DRIBBLER_QUALITY_THRESHOLD = 0.2;

// ============================================================
// コンタクト判定メイン
// ============================================================

/**
 * バット・ボール接触を判定する
 *
 * @param latent - スイング潜在量
 * @param swing  - バットスイングプロファイル
 * @param rng    - 乱数生成器
 * @returns ContactDetail
 */
export function resolveContact(
  latent: SwingLatentState,
  swing: BatSwingProfile,
  rng: RNG,
): ContactDetail {
  // チェックスイング判定
  const isCheck = isCheckSwing(latent, rng);

  if (isCheck) {
    // チェックスイング: ファウルかミス
    const foul = rng.chance(CHECK_SWING_FOUL_PROB);
    return {
      didContact: foul,
      contactQuality: foul ? 0.1 : 0,
      isFoul: foul,
      isTip: false,
      isCheckSwing: true,
      contactTimeMs: swing.contactTimeMs,
    };
  }

  // タイミングエラーによるコンタクト品質の低下
  const timingPenalty = computeTimingPenalty(swing.timingErrorMs);

  // 接触品質計算
  const rawQuality = latent.contactQuality * timingPenalty;

  // ミス判定: 品質が閾値未満
  if (rawQuality < MIN_CONTACT_QUALITY) {
    return {
      didContact: false,
      contactQuality: 0,
      isFoul: false,
      isTip: false,
      isCheckSwing: false,
      contactTimeMs: swing.contactTimeMs,
    };
  }

  // ファウル判定
  const isFoul = computeIsFoul(latent, swing, rng);

  // ファウルチップ判定: 品質が低くて辛うじて接触
  const isTip = !isFoul && rawQuality < FOUL_TIP_QUALITY_THRESHOLD;

  return {
    didContact: true,
    contactQuality: rawQuality,
    isFoul,
    isTip,
    isCheckSwing: false,
    contactTimeMs: swing.contactTimeMs,
  };
}

// ============================================================
// 補助関数（テスト可能な純粋関数）
// ============================================================

/**
 * タイミングエラーからコンタクト品質ペナルティを計算する
 * |timingError| が大きいほどペナルティが大きい
 * @param timingErrorMs タイミングエラー (ms)
 * @returns ペナルティ係数 0-1 (1=ペナルティなし)
 */
export function computeTimingPenalty(timingErrorMs: number): number {
  const absError = Math.abs(timingErrorMs);
  // 0ms → 1.0, 50ms → 0.5, 100ms → 0.0
  return Math.max(0, 1 - absError / 100);
}

/**
 * ファウル判定を行う
 * timingWindow の極端なずれ、swingIntent の極端な偏りでファウルが増える
 */
export function computeIsFoul(
  latent: SwingLatentState,
  swing: BatSwingProfile,
  rng: RNG,
): boolean {
  // sprayAngle が 0-90 の範囲外になる確率を推定
  // 早打ち (timingWindow < -0.5) → 引っ張りすぎ → ファウルライン越え
  // 遅打ち (timingWindow > 0.5) → 詰まる → ファウル
  const timingFoulProb = computeTimingFoulProb(latent.timingWindow);
  // contactQuality が低い → ファウル確率上昇
  const qualityFoulProb = Math.max(0, (0.4 - latent.contactQuality) * 0.5);
  // スイング軌道の外れ具合
  const swingAngleFoulProb = Math.abs(swing.swingPlaneAngleDeg) > 10 ? 0.1 : 0;

  const totalFoulProb = Math.min(0.95, timingFoulProb + qualityFoulProb + swingAngleFoulProb);
  return rng.chance(totalFoulProb);
}

/**
 * タイミングからファウル確率を計算する
 */
export function computeTimingFoulProb(timingWindow: number): number {
  const absT = Math.abs(timingWindow);
  if (absT < 0.3) return 0.05; // ほぼジャスト: 低確率
  if (absT < 0.6) return 0.15;
  if (absT < 0.8) return 0.35;
  return 0.6; // 大幅ずれ: 高確率
}

// ============================================================
// ContactDetail から BallTrajectoryParams へのファウル理由判定
// ============================================================

/**
 * ContactDetail からファウル理由を推定する
 * types.ts の TimelineEvent foul reason に対応
 */
export function getFoulReason(
  contact: ContactDetail,
  latent: SwingLatentState,
): 'line' | 'tip' | 'late_swing' {
  if (contact.isTip) return 'tip';
  if (contact.isCheckSwing || latent.timingWindow > 0.5) return 'late_swing';
  return 'line';
}

/**
 * コンタクト品質が当たり損ねレベルか
 * (check_swing_dribbler 分類に使用)
 */
export function isDribblerContact(contact: ContactDetail): boolean {
  return contact.didContact && contact.contactQuality < DRIBBLER_QUALITY_THRESHOLD && !contact.isFoul;
}

// ============================================================
// ボールトラジェクトリの最終調整
// ============================================================

/**
 * ContactDetail に基づいて BallTrajectoryParams を補正する
 * 芯を外れた場合は exitVelocity を下げ、launchAngle をランダム化する
 */
export function adjustTrajectoryForContact(
  trajectory: BallTrajectoryParams,
  contact: ContactDetail,
): BallTrajectoryParams {
  if (!contact.didContact) return trajectory;

  const qualityFactor = Math.max(0.3, contact.contactQuality);
  const adjustedEv = trajectory.exitVelocity * qualityFactor;

  // 接触品質が低いと打球角度が不安定になる（調整量は最小限）
  const angleNoise = (1 - contact.contactQuality) * 5;
  const adjustedLa = trajectory.launchAngle + (angleNoise > 0 ? angleNoise * (contact.contactQuality < 0.5 ? -1 : 1) : 0);

  return {
    ...trajectory,
    exitVelocity: adjustedEv,
    launchAngle: Math.max(-20, Math.min(60, adjustedLa)),
  };
}
