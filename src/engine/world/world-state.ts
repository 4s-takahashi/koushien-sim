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

  /**
   * 選手ごとの個別練習メニュー (Phase 11-A1 2026-04-19 Issue #4)。
   * key=playerId / value=PracticeMenuId。未指定の選手はチーム共通メニューに従う。
   * UI: Team画面のドロップダウンで選択可能。
   */
  individualPracticeMenus?: Record<string, import('../types/calendar').PracticeMenuId>;

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

  // --- インタラクティブ試合（Phase 10-C） ---
  /**
   * インタラクティブ試合が待機中の場合にセット。
   * world-ticker が試合日を検知してここに登録し、日付進行を一時停止する。
   * プレイヤーが試合を完了したら null にリセットして日付進行を再開する。
   */
  pendingInteractiveMatch?: PendingInteractiveMatch | null;

  /**
   * 試合中断状態 (Issue #8 2026-04-19 PR #6)。
   * プレイヤーが試合中にホームに戻った場合、ここに現在の試合状態を退避する。
   * null でない場合、ホーム画面に「試合再開」バナーが出る。
   */
  pausedInteractiveMatch?: PausedInteractiveMatch | null;
}

/**
 * 中断された試合のスナップショット (Issue #8)。
 * pendingInteractiveMatch とは別フィールド: pending は「これから始まる」、
 * paused は「途中で中断された」という意味。
 */
export interface PausedInteractiveMatch {
  /** 試合状態 (serializable: Map は配列に変換済み) */
  matchStateJson: string;
  /** 進行ログ */
  narrationJson: string;
  /** 投球ログ */
  pitchLogJson: string;
  /** pending 情報 (元の対戦設定) */
  pending: PendingInteractiveMatch;
  /** 中断した日時 */
  pausedAt: string; // ISO 8601
}

/**
 * インタラクティブ試合の待機情報
 */
export interface PendingInteractiveMatch {
  /** 対戦相手の学校 ID */
  opponentSchoolId: string;
  /** 試合ラウンド番号 */
  round: number;
  /** 大会 ID */
  tournamentId: string;
  /** 先攻/後攻（プレイヤー視点） */
  playerSide: 'home' | 'away';
  /** 試合日 */
  matchDate: GameDate;
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
