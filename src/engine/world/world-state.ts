/**
 * WorldState — ゲーム世界全体の状態
 *
 * GameState（Phase 1/2）の上位概念。
 * 自校だけでなく、全高校・全中学生・全人物を包含する。
 */

import type { GameDate, PracticeMenuId } from '../types/calendar';
import type { Manager, FacilityLevel, Lineup } from '../types/team';
import type { Player, PlayerStats, Position } from '../types/player';
import type { PersonRegistry } from './person-state';
import type { CoachStyle, SchoolBlueprint } from './person-blueprint';
import type { TournamentBracket } from './tournament-bracket';
import type { ScheduledPracticeGame, PracticeGameRecord } from '../types/practice-game';

// ============================================================
// 計算粒度
// ============================================================

export type SimulationTier = 'full' | 'standard' | 'minimal';

// ============================================================
// 高校
// ============================================================

/**
 * HighSchool — 自校も他校も同じ型。
 * 既存の Team と互換のフィールドを持ち、team/ モジュールの関数がそのまま使える。
 */
export interface HighSchool {
  // --- Team 互換フィールド ---
  id: string;
  name: string;
  prefecture: string;
  reputation: number;
  players: Player[];
  lineup: Lineup | null;
  facilities: FacilityLevel;

  // --- HighSchool 固有 ---
  simulationTier: SimulationTier;
  coachStyle: CoachStyle;
  yearResults: YearResults;

  // --- パフォーマンス用キャッシュ ---
  _summary: TeamSummary | null;
}

export interface TeamSummary {
  id: string;
  name: string;
  strength: number;          // チーム総合力 0–100
  aceStrength: number;       // エースの能力 0–100
  battingStrength: number;   // 打線の能力 0–100
  defenseStrength: number;   // 守備の能力 0–100
}

export interface YearResults {
  summerBestRound: number;
  autumnBestRound: number;
  koshienAppearance: boolean;
  koshienBestRound: number;
  proPlayersDrafted: number;
}

// ============================================================
// 中学生
// ============================================================

/**
 * MiddleSchoolPlayer — ランタイム上の中学生。
 * PersonBlueprint + PersonState から合成される。
 * 高校入学時に hydratePlayer() で Player に変換される。
 */
export interface MiddleSchoolPlayer {
  /** PersonBlueprint.id と同一 */
  id: string;
  firstName: string;
  lastName: string;
  middleSchoolGrade: 1 | 2 | 3;
  middleSchoolName: string;
  prefecture: string;
  currentStats: import('../types/player').PlayerStats;
  /** 進学先 高校ID（中3の秋以降に決定） */
  targetSchoolId: string | null;
  /** スカウト済み高校ID */
  scoutedBy: string[];
}

// ============================================================
// シーズン
// ============================================================

export type SeasonPhase =
  | 'spring_practice'
  | 'summer_tournament'
  | 'koshien'
  | 'post_summer'
  | 'autumn_tournament'
  | 'off_season'
  | 'pre_season';

export interface SeasonState {
  phase: SeasonPhase;
  currentTournamentId: string | null;
  yearResults: YearResults;
}

// ============================================================
// 週次練習計画
// ============================================================

export interface WeeklyPlan {
  monday: PracticeMenuId;
  tuesday: PracticeMenuId;
  wednesday: PracticeMenuId;
  thursday: PracticeMenuId;
  friday: PracticeMenuId;
  saturday: PracticeMenuId;
  sunday: PracticeMenuId;
}

// ============================================================
// スカウト関連型
// ============================================================

export interface ScoutSearchFilter {
  grade?: 1 | 2 | 3;
  position?: Position;
  minReputation?: number;
  qualityTier?: 'S' | 'A' | 'B' | 'C' | 'D';
  prefecture?: string;
}

export interface ScoutReport {
  playerId: string;
  observedStats: Partial<PlayerStats>;
  confidence: number;           // 0-1
  scoutComment: string;
  estimatedQuality: 'S' | 'A' | 'B' | 'C' | 'D';
}

export interface RecruitResult {
  playerId: string;
  success: boolean;
  reason: string;
  attemptDate: GameDate;
}

export interface ScoutState {
  watchList: string[];
  scoutReports: Map<string, ScoutReport>;
  recruitAttempts: Map<string, RecruitResult>;
  monthlyScoutBudget: number;   // 月あたり視察可能回数（3-5）
  usedScoutThisMonth: number;
}

// ============================================================
// WorldState 本体
// ============================================================

export interface WorldState {
  version: string;
  seed: string;
  currentDate: GameDate;

  // --- プレイヤー情報 ---
  playerSchoolId: string;
  manager: Manager;
  settings: GameSettings;
  weeklyPlan: WeeklyPlan;

  // --- 世界の実体 ---
  prefecture: string;
  schools: HighSchool[];
  middleSchoolPool: MiddleSchoolPlayer[];
  personRegistry: PersonRegistry;

  // --- 大会 ---
  /** 現在進行中のトーナメント（大会期間外は null、未対応 WorldState は undefined） */
  activeTournament?: TournamentBracket | null;
  /** 過去の大会履歴（最大10件） */
  tournamentHistory?: TournamentBracket[];

  // --- 年間進行 ---
  seasonState: SeasonState;

  // --- スカウト状態 ---
  scoutState: ScoutState;

  // --- 練習試合 ---
  /** 予約済み練習試合・紅白戦（最大3件） */
  scheduledPracticeGames?: ScheduledPracticeGame[];
  /** 練習試合・紅白戦の実施履歴（最大30件） */
  practiceGameHistory?: PracticeGameRecord[];
}

export interface GameSettings {
  autoAdvanceSpeed: 'slow' | 'normal' | 'fast';
  showDetailedGrowth: boolean;
}

// ============================================================
// 初期値ファクトリ
// ============================================================

export function createEmptyYearResults(): YearResults {
  return {
    summerBestRound: 0,
    autumnBestRound: 0,
    koshienAppearance: false,
    koshienBestRound: 0,
    proPlayersDrafted: 0,
  };
}

export function createDefaultWeeklyPlan(): WeeklyPlan {
  return {
    monday: 'batting_basic',
    tuesday: 'pitching_basic',
    wednesday: 'fielding_drill',
    thursday: 'batting_live',
    friday: 'running',
    saturday: 'strength',
    sunday: 'rest',
  };
}

export function createInitialSeasonState(): SeasonState {
  return {
    phase: 'spring_practice',
    currentTournamentId: null,
    yearResults: createEmptyYearResults(),
  };
}

export function createInitialScoutState(): ScoutState {
  return {
    watchList: [],
    scoutReports: new Map(),
    recruitAttempts: new Map(),
    monthlyScoutBudget: 4,
    usedScoutThisMonth: 0,
  };
}
