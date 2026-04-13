/**
 * world/ モジュール公開エントリポイント
 */

// 型
export type {
  PersonBlueprint,
  StatGrowthCurve,
  GrowthCurveSet,
  GrowthProfile,
  CoachStyle,
  SchoolBlueprint,
} from './person-blueprint';

export type {
  PersonState,
  PersonStage,
  CareerPath,
  PersonRetention,
  CumulativeGrowth,
  PersonEvent,
  GraduateSummary,
  GraduateArchive,
  PersonRegistryEntry,
  PersonRegistry,
} from './person-state';

export type {
  WorldState,
  HighSchool,
  SimulationTier,
  TeamSummary,
  YearResults,
  MiddleSchoolPlayer,
  SeasonPhase,
  SeasonState,
  WeeklyPlan,
  GameSettings,
} from './world-state';

export type {
  WorldDayResult,
  WorldNewsItem,
} from './world-ticker';

// 関数
export { hydratePlayer, dehydratePlayer } from './hydrate';
export { createEmptyCumulativeGrowth, createEmptyCareerRecord } from './person-state';
export {
  createEmptyYearResults,
  createDefaultWeeklyPlan,
  createInitialSeasonState,
} from './world-state';
export {
  peakMultiplier,
  calculateStatGainV3,
  moodMultiplier,
  fatigueMultiplier,
  traitMultiplier,
  ceilingPenalty,
} from './growth-curve';
export type { GrowthContextV3 } from './growth-curve';
export { advanceWorldDay } from './world-ticker';
