/**
 * battery-error.ts — ワイルドピッチ・パスボール判定
 *
 * v0.48 Phase 1: WP/PB の発生判定と走者進塁数を返す純粋関数。
 * Math.random() は使用しない。乱数は RNG を引数で受け取る。
 */

import type { PitchLocation } from '../../match/types';
import type { RNG } from '../../core/rng';

// ============================================================
// 型定義
// ============================================================

export type BatteryErrorType = 'wild_pitch' | 'passed_ball';

export interface BatteryErrorContext {
  /** 投球の実際着弾コース（制球誤差適用後） */
  actualLocation: PitchLocation;
  /** 投球アウトカム（'ball' のときのみ WP/PB 判定） */
  outcome: 'ball' | 'called_strike' | 'swinging_strike' | 'foul' | 'foul_bunt' | 'in_play';
  /** 投手の実効コントロール 0-100 */
  pitcherEffectiveControl: number;
  /** キャッチャーの fielding 0-100 */
  catcherFielding: number;
  /** キャッチャーの agility（base.speed で代替） 0-100 */
  catcherAgility: number;
  /** ランナーの有無（WP/PBの意味がある場合のみ発生させる） */
  hasRunners: boolean;
  /** 球種（変化球は捕球ミスしやすい） */
  pitchType: string;
}

export interface BatteryErrorResult {
  /** エラーが発生したか */
  occurred: boolean;
  /** エラー種別（occurred=false のとき undefined） */
  type?: BatteryErrorType;
  /**
   * 走者進塁数（通常 1 塁ずつ）
   * occurred=true かつ hasRunners=true のとき 1
   */
  advanceBases: number;
}

// ============================================================
// 定数
// ============================================================

/** WP 計算の分母: (50 - control) / WP_DIVISOR */
const WP_DIVISOR = 500;

/** PB 計算の分母: (50 - fielding) / PB_DIVISOR */
const PB_DIVISOR = 1000;

/** 変化球種別の捕球難易度補正 */
const BREAKING_BALL_WP_BONUS: Record<string, number> = {
  fork: 0.010,
  forkball: 0.010,
  splitter: 0.008,
  curve: 0.007,
  curveball: 0.007,
  slider: 0.005,
};

const BREAKING_BALL_PB_BONUS: Record<string, number> = {
  fork: 0.008,
  forkball: 0.008,
  splitter: 0.007,
  curve: 0.005,
  curveball: 0.005,
  slider: 0.003,
};

// ============================================================
// メイン判定関数
// ============================================================

/**
 * ワイルドピッチ・パスボール発生を判定する
 *
 * 発生確率の計算:
 *   WP発生条件: outcome === 'ball'
 *   wpBaseRate = max(0, (50 - pitcherEffectiveControl) / 500)
 *     = control=30 → 0.04 (4%)
 *     = control=50 → 0.00 (基準: control>=50 では WP はほぼ起きない)
 *   変化球補正: fork/curve/slider → +0.005〜+0.010
 *
 *   PB発生条件: outcome === 'ball' かつ WP でなかった場合
 *   pbBaseRate = max(0, (50 - catcherFielding) / 1000)
 *     = fielding=30 → 0.02 (2%)
 *     = fielding=70 → 0.00
 *   変化球補正: +0.003〜+0.008
 *
 * 純粋関数: Math.random() 不使用。RNG を引数で受け取る。
 */
export function judgeBatteryError(
  ctx: BatteryErrorContext,
  rng: RNG,
): BatteryErrorResult {
  // ボール球以外は WP/PB 判定なし
  if (ctx.outcome !== 'ball') {
    return { occurred: false, advanceBases: 0 };
  }

  const pitchTypeLower = ctx.pitchType.toLowerCase();

  // ── ワイルドピッチ判定 ──
  const wpBase = Math.max(0, (50 - ctx.pitcherEffectiveControl) / WP_DIVISOR);
  const wpBreakingBonus = BREAKING_BALL_WP_BONUS[pitchTypeLower] ?? 0;
  const wpRate = wpBase + wpBreakingBonus;

  const wpRng = rng.derive('battery-error-wp');
  if (wpRate > 0 && wpRng.chance(wpRate)) {
    return {
      occurred: true,
      type: 'wild_pitch',
      advanceBases: ctx.hasRunners ? 1 : 0,
    };
  }

  // ── パスボール判定（WP でなかった場合のみ） ──
  const pbBase = Math.max(0, (50 - ctx.catcherFielding) / PB_DIVISOR);
  const pbBreakingBonus = BREAKING_BALL_PB_BONUS[pitchTypeLower] ?? 0;
  const pbRate = pbBase + pbBreakingBonus;

  const pbRng = rng.derive('battery-error-pb');
  if (pbRate > 0 && pbRng.chance(pbRate)) {
    return {
      occurred: true,
      type: 'passed_ball',
      advanceBases: ctx.hasRunners ? 1 : 0,
    };
  }

  return { occurred: false, advanceBases: 0 };
}
