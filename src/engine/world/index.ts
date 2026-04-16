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
  ScoutSearchFilter,
  ScoutReport,
  RecruitResult,
  ScoutState,
} from './world-state';

export type {
  WorldDayResult,
  WorldNewsItem,
} from './world-ticker';

// 関数
export { hydratePlayer, dehydratePlayer, convertToHighSchoolPlayer } from './hydrate';
export { createEmptyCumulativeGrowth, createEmptyCareerRecord } from './person-state';
export {
  createEmptyYearResults,
  createDefaultWeeklyPlan,
  createInitialSeasonState,
  createInitialScoutState,
} from './world-state';

// スカウトシステム
export {
  searchMiddleSchoolers,
  addToWatchList,
  removeFromWatchList,
  conductScoutVisit,
  recruitPlayer,
  runAISchoolScouting,
  computeMiddleSchoolOverall,
} from './scout/scout-system';

// ドラフト・進路システム
export type { DraftCandidate, DraftResult } from './career/draft-system';
export {
  identifyDraftCandidates,
  executeDraft,
  determineCareerPath,
  computePlayerOverall,
} from './career/draft-system';
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
export { createWorldState, gameStateToWorldState } from './create-world';
export { generateAISchools } from './school-generator';
export { updateSimulationTiers, applyTournamentFacing } from './tier-manager';
export { processYearTransition } from './year-transition';
