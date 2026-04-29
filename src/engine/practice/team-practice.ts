/**
 * team-practice.ts — チーム全体練習プラン (Phase S1-B B3)
 *
 * 3スロット練習プランの操作・適用ロジック。
 * 各スロットの効果は 1/3 ずつ加算される。
 */

import type { TeamPracticePlan, TeamPracticeSlot, PracticeMenuId, StatEffect } from '../types/calendar';
import { PRACTICE_MENUS } from '../../data/practice-menus';

// ============================================================
// デフォルトプラン
// ============================================================

/** デフォルトの3スロットプラン（全スロットを batting_basic に設定） */
export const DEFAULT_TEAM_PRACTICE_PLAN: TeamPracticePlan = {
  slots: [
    { menuId: 'batting_basic' },
    { menuId: 'batting_basic' },
    { menuId: 'batting_basic' },
  ],
};

// ============================================================
// プラン操作ヘルパー
// ============================================================

/**
 * TeamPracticePlan を生成する
 */
export function createTeamPracticePlan(
  slot0: PracticeMenuId,
  slot1: PracticeMenuId,
  slot2: PracticeMenuId
): TeamPracticePlan {
  return {
    slots: [
      { menuId: slot0 },
      { menuId: slot1 },
      { menuId: slot2 },
    ],
  };
}

/**
 * 既存の単一メニューIDから TeamPracticePlan に変換する
 * （後方互換: practiceMenu → teamPracticePlan のマイグレーション用）
 */
export function menuIdToPlan(menuId: PracticeMenuId): TeamPracticePlan {
  return createTeamPracticePlan(menuId, menuId, menuId);
}

/**
 * TeamPracticePlan の合算 StatEffect を計算する。
 * 各スロットの効果を 1/3 ずつ加算して返す。
 * 同一 target が複数スロットに登場した場合も正しく合算される。
 */
export function computePlanStatEffects(plan: TeamPracticePlan): StatEffect[] {
  const effectMap = new Map<string, number>();

  for (const slot of plan.slots) {
    const menu = PRACTICE_MENUS.find((m) => m.id === slot.menuId);
    if (!menu) continue;

    for (const effect of menu.statEffects) {
      const prev = effectMap.get(effect.target) ?? 0;
      // Each slot contributes 1/3 of its base gain
      effectMap.set(effect.target, prev + effect.baseGain / 3);
    }
  }

  return Array.from(effectMap.entries()).map(([target, baseGain]) => ({
    target: target as StatEffect['target'],
    baseGain,
  }));
}

/**
 * TeamPracticePlan から合算疲労負荷を計算する。
 * 各スロットの fatigueLoad を 1/3 ずつ加算。
 */
export function computePlanFatigueLoad(plan: TeamPracticePlan): number {
  let total = 0;
  for (const slot of plan.slots) {
    const menu = PRACTICE_MENUS.find((m) => m.id === slot.menuId);
    if (menu) {
      total += menu.fatigueLoad / 3;
    }
  }
  return total;
}

/**
 * TeamPracticePlan の表示ラベル（3スロットのメニュー名を / で連結）
 */
export function getPlanLabel(plan: TeamPracticePlan): string {
  return plan.slots
    .map((slot) => {
      const menu = PRACTICE_MENUS.find((m) => m.id === slot.menuId);
      return menu?.name ?? slot.menuId;
    })
    .join(' / ');
}

/**
 * TeamPracticePlan から代表する単一 PracticeMenuId を返す。
 * （後方互換: 既存 advanceDay の第一引数用）
 * 最初のスロットのメニューIDを返す。
 */
export function getPrimaryMenuId(plan: TeamPracticePlan): PracticeMenuId {
  return plan.slots[0].menuId;
}
