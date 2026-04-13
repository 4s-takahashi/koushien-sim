/**
 * hydratePlayer / dehydratePlayer — 静的 Blueprint + 動的 State ↔ Player 変換
 *
 * 既存の Phase 1/2 コードは全て Player 型で動作する。
 * この互換ブリッジを通すことで、DB 分離後も既存コードを一切変更せずに使える。
 */

import type {
  Player, PlayerStats, Grade, GrowthType,
  ConditionState, MentalState, CareerRecord,
} from '../types/player';
import type { PersonBlueprint } from './person-blueprint';
import type { PersonState } from './person-state';

/**
 * PersonBlueprint（DB 静的） + PersonState（ランタイム動的） → Player 合成。
 *
 * Phase 1/2 の全関数（applyDailyGrowth, runGame, etc.）は
 * この返り値の Player 型で動作する。
 */
export function hydratePlayer(
  blueprint: PersonBlueprint,
  state: PersonState,
  currentYear: number,
): Player {
  // Grade は enrollmentYear と currentYear から動的に算出
  // （中学生の場合は enrollmentYear=0 なので呼び出し側で注意）
  const grade = state.enrollmentYear > 0
    ? Math.min(3, Math.max(1, currentYear - state.enrollmentYear + 1)) as Grade
    : 1 as Grade;

  return {
    id: blueprint.id,
    firstName: blueprint.firstName,
    lastName: blueprint.lastName,
    enrollmentYear: state.enrollmentYear,
    position: blueprint.primaryPosition,
    subPositions: blueprint.subPositions,
    battingSide: blueprint.battingSide,
    throwingHand: blueprint.throwingHand,
    height: blueprint.height,
    weight: blueprint.weight,
    stats: state.currentStats,
    potential: {
      ceiling: blueprint.ceilingStats,
      // 互換用: GrowthProfile の代表値を growthRate に写す
      growthRate: blueprint.growthProfile.curves.contact.baseRate,
      growthType: blueprint.growthProfile.growthType,
    },
    condition: state.condition,
    traits: blueprint.traits,
    mentalState: state.mentalState,
    background: {
      hometown: blueprint.hometown,
      middleSchool: blueprint.middleSchool,
    },
    careerStats: state.careerStats,
  };
}

/**
 * Player → PersonState の動的フィールドだけを抽出（セーブ / 同期用）。
 * Blueprint 側のフィールド（名前、身体情報等）は含まない。
 */
export function dehydratePlayer(player: Player, existingState: PersonState): PersonState {
  return {
    ...existingState,
    currentStats: player.stats,
    condition: player.condition,
    mentalState: player.mentalState,
    careerStats: player.careerStats,
  };
}
