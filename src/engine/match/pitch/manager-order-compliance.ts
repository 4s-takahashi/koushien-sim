/**
 * manager-order-compliance.ts — 監督指示反映率計算
 *
 * v0.48 Phase 3: 監督がサインを出した場合に、キャッチャーがそれを守るかどうかを判定する。
 * 既存の applyManagerOrder()（catcher-thinking.ts）と並存し、
 * 新設計では「反映したか否か」を明示的に記録してUI表示に使う。
 *
 * 設計書: SPEC_v0.48_BATTERY_AND_FIELDING.md Section 3.3
 *
 * 純粋関数: Math.random() 不使用。乱数は RNG を引数で受け取る。
 */

import type { CatcherDetailedOrder } from '../types';
import type { RNG } from '../../core/rng';

// ============================================================
// 型定義
// ============================================================

export interface ComplianceContext {
  /** 監督指示 */
  order: CatcherDetailedOrder;
  /** キャッチャーのリーダーシップ 0-100 */
  catcherLeadership: number;
  /** キャッチャーの性格 */
  catcherPersonality: 'aggressive' | 'cautious' | 'analytical';
  /** 状況プレッシャー 0-100 */
  situationPressure: number;
}

export interface ComplianceResult {
  /** 指示に従ったか */
  complied: boolean;
  /** 実効コンプライアンス率（0-1） */
  effectiveRate: number;
  /**
   * 不服従の理由（complied=false のとき）
   * 'personality': 性格的に従いたくない
   * 'situation': 状況判断で変えた
   * 'distrust': 監督への不信（leadershipが低い）
   */
  reason?: 'personality' | 'situation' | 'distrust';
}

// ============================================================
// 定数
// ============================================================

/** コンプライアンス基本率（設計書 SIGN_COMPLIANCE_BASE） */
const SIGN_COMPLIANCE_BASE = 0.90;

// ============================================================
// メイン関数
// ============================================================

/**
 * 監督指示への従否を判定する
 *
 * 従否率の計算:
 *   baseRate = 0.90
 *   慎重派 + attack指示 → -0.15（性格と合わない）
 *   積極派 + careful指示 → -0.10
 *   leadership < 30 → +0.05（指示に素直: リーダーシップが低い = 自分の考えを通さない）
 *   situationPressure > 70 → -0.10（プレッシャーで自己判断）
 *
 * 純粋関数: Math.random() 不使用。RNG を引数で受け取る。
 */
export function computeComplianceResult(
  ctx: ComplianceContext,
  rng: RNG,
): ComplianceResult {
  let rate = SIGN_COMPLIANCE_BASE;
  let personalityPenalty = 0;
  let situationPenalty = 0;
  let leadershipBonus = 0;

  // 性格と指示の不一致によるペナルティ
  if (ctx.catcherPersonality === 'cautious' && ctx.order.callingStyle === 'attack') {
    personalityPenalty = 0.15;
    rate -= personalityPenalty;
  } else if (ctx.catcherPersonality === 'aggressive' && ctx.order.callingStyle === 'careful') {
    personalityPenalty = 0.10;
    rate -= personalityPenalty;
  }

  // リーダーシップが低い = 指示に素直（自分の判断を通さない）
  if (ctx.catcherLeadership < 30) {
    leadershipBonus = 0.05;
    rate += leadershipBonus;
  }

  // プレッシャーによる自己判断
  if (ctx.situationPressure > 70) {
    situationPenalty = 0.10;
    rate -= situationPenalty;
  }

  // クランプ
  const effectiveRate = Math.max(0.10, Math.min(0.98, rate));

  // 従否判定
  const complied = rng.derive('manager-compliance').chance(effectiveRate);

  if (complied) {
    return { complied: true, effectiveRate };
  }

  // 不服従の理由を決定
  let reason: ComplianceResult['reason'];
  if (personalityPenalty >= 0.10) {
    reason = 'personality';
  } else if (situationPenalty > 0) {
    reason = 'situation';
  } else {
    reason = 'distrust';
  }

  return { complied: false, effectiveRate, reason };
}
