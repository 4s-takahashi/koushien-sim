/**
 * manager-style-effects.ts — 監督戦術スタイルの効果定義
 *
 * Phase 11-A2 (2026-04-19)
 *
 * スタイル別の確率・係数補正値を一元管理する。
 * 各スタイルの効果:
 *   aggressive:  長打係数+5%、CPU バント確率-10%、CPU 盗塁確率-10%（強振志向）
 *   balanced:    補正なし（デフォルト）
 *   defensive:   エラー率-10%、CPU 送りバント+10%
 *   small_ball:  CPU 送りバント+25%、盗塁成功率判定+5%
 */

import type { ManagerStyle } from '../types/team';

// ============================================================
// スタイル効果の型定義
// ============================================================

export interface StyleEffects {
  /** 長打飛距離の乗数（1.05 = +5%）。aggressive のみ > 1.0 */
  longHitMultiplier: number;
  /** CPU バント確率への加算（小数）。small_ball は +0.25、defensive は +0.10、aggressive は -0.10 */
  cpuBuntBias: number;
  /** CPU 盗塁確率への加算（小数）。aggressive は -0.10 */
  cpuStealBias: number;
  /** エラー率の乗数（0.9 = -10%）。defensive のみ < 1.0 */
  errorRateMultiplier: number;
  /** 盗塁成功率への加算（小数）。small_ball は +0.05 */
  stealSuccessBonus: number;
}

// ============================================================
// スタイル別効果テーブル
// ============================================================

const STYLE_EFFECTS: Record<ManagerStyle, StyleEffects> = {
  aggressive: {
    longHitMultiplier: 1.05,
    cpuBuntBias: -0.10,
    cpuStealBias: -0.10,
    errorRateMultiplier: 1.0,
    stealSuccessBonus: 0,
  },
  balanced: {
    longHitMultiplier: 1.0,
    cpuBuntBias: 0,
    cpuStealBias: 0,
    errorRateMultiplier: 1.0,
    stealSuccessBonus: 0,
  },
  defensive: {
    longHitMultiplier: 1.0,
    cpuBuntBias: 0.10,
    cpuStealBias: 0,
    errorRateMultiplier: 0.9,
    stealSuccessBonus: 0,
  },
  small_ball: {
    longHitMultiplier: 1.0,
    cpuBuntBias: 0.25,
    cpuStealBias: 0,
    errorRateMultiplier: 1.0,
    stealSuccessBonus: 0.05,
  },
};

/** balanced のデフォルト効果（style が未設定の場合に使用） */
const BALANCED_EFFECTS: StyleEffects = STYLE_EFFECTS.balanced;

// ============================================================
// 公開 API
// ============================================================

/**
 * 指定したスタイルの効果を返す。
 * style が未設定（undefined）の場合は balanced と同等。
 */
export function getStyleEffects(style: ManagerStyle | undefined): StyleEffects {
  if (!style) return BALANCED_EFFECTS;
  return STYLE_EFFECTS[style] ?? BALANCED_EFFECTS;
}
