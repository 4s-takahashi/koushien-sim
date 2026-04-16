/**
 * hydratePlayer / dehydratePlayer — 静的 Blueprint + 動的 State ↔ Player 変換
 *
 * 既存の Phase 1/2 コードは全て Player 型で動作する。
 * この互換ブリッジを通すことで、DB 分離後も既存コードを一切変更せずに使える。
 *
 * convertToHighSchoolPlayer — MiddleSchoolPlayer → Player 変換（高校入学処理）
 */

import type {
  Player, PlayerStats, Grade, GrowthType,
  ConditionState, MentalState, CareerRecord,
} from '../types/player';
import type { PersonBlueprint } from './person-blueprint';
import type { PersonState } from './person-state';
import type { MiddleSchoolPlayer } from './world-state';
import type { FacilityLevel } from '../types/team';
import type { RNG } from '../core/rng';

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

// ============================================================
// MiddleSchoolPlayer → Player 変換
// ============================================================

/**
 * 中学3年生を高校1年生の Player に変換する。
 *
 * 重要: id はそのまま維持。PersonRegistry 上は stage が変わるだけ。
 * 能力値は中学時代の最終値をそのまま引き継ぐ。
 *
 * 変換ルール:
 * - id: そのまま
 * - stats: そのまま（中学最終値）
 * - potential.ceiling: 施設レベルで微調整（+0〜+2% / 施設レベル点）
 * - condition: リセット（fatigue=0, injury=null, mood='normal'）
 * - careerStats: リセット（高校通算は0から）
 * - mentalState: confidence は中学時代の推定値から引き継ぎ、stress はリセット
 */
export function convertToHighSchoolPlayer(
  ms: MiddleSchoolPlayer,
  enrollmentYear: number,
  facilities: FacilityLevel,
  rng: RNG,
): Player {
  // 施設レベルの平均（0-10スケール）
  const facilityAvg = (facilities.ground + facilities.bullpen + facilities.battingCage + facilities.gym) / 4;
  // 天井ブースト: 施設レベル × 0.02 = 最大 +20%
  const ceilingBoost = 1.0 + facilityAvg * 0.02;

  const currentStats = ms.currentStats;

  function boostCeilStat(v: number, max: number): number {
    return Math.min(max, Math.round(v * ceilingBoost));
  }

  const ceilingStats: PlayerStats = {
    base: {
      stamina:     boostCeilStat(currentStats.base.stamina     + rng.intBetween(30, 65), 100),
      speed:       boostCeilStat(currentStats.base.speed       + rng.intBetween(30, 65), 100),
      armStrength: boostCeilStat(currentStats.base.armStrength + rng.intBetween(30, 60), 100),
      fielding:    boostCeilStat(currentStats.base.fielding    + rng.intBetween(30, 60), 100),
      focus:       boostCeilStat(currentStats.base.focus       + rng.intBetween(30, 65), 100),
      mental:      boostCeilStat(currentStats.base.mental      + rng.intBetween(30, 65), 100),
    },
    batting: {
      contact:   boostCeilStat(currentStats.batting.contact   + rng.intBetween(30, 65), 100),
      power:     boostCeilStat(currentStats.batting.power     + rng.intBetween(20, 60), 100),
      eye:       boostCeilStat(currentStats.batting.eye       + rng.intBetween(30, 65), 100),
      technique: boostCeilStat(currentStats.batting.technique + rng.intBetween(30, 65), 100),
    },
    pitching: null, // 中学生はデフォルト非投手
  };

  // 成長タイプをランダムに決定
  const growthRoll = rng.next();
  const growthType: 'early' | 'normal' | 'late' | 'genius' =
    growthRoll < 0.20 ? 'early' :
    growthRoll < 0.75 ? 'normal' :
    growthRoll < 0.95 ? 'late' :
    'genius';

  const growthRateRanges: Record<string, [number, number]> = {
    early: [1.3, 1.8], normal: [0.8, 1.2], late: [0.5, 0.8], genius: [1.0, 1.5],
  };
  const [minRate, maxRate] = growthRateRanges[growthType];
  const growthRate = minRate + rng.next() * (maxRate - minRate);

  const condition: ConditionState = {
    fatigue: 0,
    injury: null,
    mood: 'normal',
  };

  const mentalState: MentalState = {
    mood: 'normal',
    stress: 0,
    confidence: rng.intBetween(40, 70),
    teamChemistry: rng.intBetween(40, 70),
    flags: [],
  };

  const careerStats: CareerRecord = {
    gamesPlayed: 0, atBats: 0, hits: 0, homeRuns: 0, rbis: 0,
    stolenBases: 0, gamesStarted: 0, inningsPitched: 0,
    wins: 0, losses: 0, strikeouts: 0, earnedRuns: 0,
  };

  return {
    id: ms.id,
    firstName: ms.firstName,
    lastName: ms.lastName,
    enrollmentYear,
    position: 'center', // デフォルトポジション（autoGenerateLineup で再配置）
    subPositions: [],
    battingSide: rng.next() < 0.3 ? 'left' : 'right',
    throwingHand: rng.next() < 0.1 ? 'left' : 'right',
    height: Math.round(rng.gaussian(170, 6)),
    weight: Math.round(rng.gaussian(62, 7)),
    stats: currentStats,
    potential: {
      ceiling: ceilingStats,
      growthRate,
      growthType,
    },
    condition,
    traits: [],
    mentalState,
    background: {
      hometown: ms.prefecture,
      middleSchool: ms.middleSchoolName,
    },
    careerStats,
  };
}
