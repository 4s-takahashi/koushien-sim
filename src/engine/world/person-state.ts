/**
 * PersonState — 人物のランタイム動的状態
 *
 * PersonBlueprint（静的設計図）と対になる。
 * ゲームの進行で常に変化するデータをここに保持する。
 */

import type {
  PlayerStats, ConditionState, MentalState,
  CareerRecord, Mood, GrowthType, TraitId,
} from '../types/player';
import type { GameDate, GameEventType } from '../types/calendar';

// ============================================================
// ライフステージ
// ============================================================

export type PersonStage =
  | { type: 'middle_school'; grade: 1 | 2 | 3 }
  | { type: 'high_school'; schoolId: string; grade: 1 | 2 | 3 }
  | { type: 'graduated'; year: number; path: CareerPath }
  | { type: 'pro'; team: string; yearsActive: number }
  | { type: 'retired' };

export type CareerPath =
  | { type: 'pro'; team: string; pickRound: number }
  | { type: 'university'; school: string; hasScholarship: boolean }
  | { type: 'corporate'; company: string }
  | { type: 'retire' };

// ============================================================
// 保持レベル
// ============================================================

export type PersonRetention = 'full' | 'tracked' | 'archived' | 'forgotten';

// ============================================================
// 累積成長トラッキング
// ============================================================

/** 累積成長量（デバッグ・検証用） */
export interface CumulativeGrowth {
  /** 各能力値の累積成長量 ("batting.contact" → 12.5) */
  statGains: Record<string, number>;
  /** 成長日数 */
  totalDays: number;
  /** 試合経験日数 */
  matchDays: number;
  /** スランプ日数 */
  slumpDays: number;
}

// ============================================================
// PersonState 本体
// ============================================================

export interface PersonState {
  /** PersonBlueprint.id への参照 */
  blueprintId: string;

  // --- 所属 ---
  currentStage: PersonStage;
  /** 高校入学年度（中学生は 0） */
  enrollmentYear: number;
  /** 所属高校ID（中学生・卒業生は null） */
  schoolId: string | null;

  // --- 能力（動的） ---
  currentStats: PlayerStats;

  // --- コンディション（動的） ---
  condition: ConditionState;
  mentalState: MentalState;

  // --- 通算成績（動的） ---
  careerStats: CareerRecord;

  // --- 一時休養フラグ (2026-04-19 Issue #5) ---
  /** 残り休養日数つきオーバーライド。null = 通常練習 */
  restOverride?: { remainingDays: number; setOn: GameDate } | null;

  // --- 成長トラッキング ---
  cumulativeGrowth: CumulativeGrowth;

  // --- イベント履歴（直近1年分） ---
  eventHistory: PersonEvent[];
}

/** 人物に起きたイベント */
export interface PersonEvent {
  type: GameEventType;
  date: GameDate;
  description: string;
}

// ============================================================
// 卒業生の軽量レコード
// ============================================================

export interface GraduateSummary {
  personId: string;
  name: string;
  finalStats: PlayerStats;
  finalOverall: number;
  schoolId: string;
  schoolName: string;
  graduationYear: number;
  careerPath: CareerPath;
  achievements: string[];
}

export interface GraduateArchive {
  personId: string;
  name: string;
  graduationYear: number;
  schoolName: string;
  overallRank: 'S' | 'A' | 'B' | 'C' | 'D';
  careerPathType: 'pro' | 'university' | 'corporate' | 'retire';
  bestAchievement: string | null;
}

// ============================================================
// PersonRegistry
// ============================================================

export interface PersonRegistryEntry {
  personId: string;
  retention: PersonRetention;
  stage: PersonStage;
  /** retention='full' の場合のみ */
  state?: PersonState;
  /** retention='tracked' の場合のみ */
  graduateSummary?: GraduateSummary;
  /** retention='archived' の場合のみ */
  archive?: GraduateArchive;
}

export interface PersonRegistry {
  entries: Map<string, PersonRegistryEntry>;
}

// ============================================================
// 初期値ファクトリ
// ============================================================

export function createEmptyCumulativeGrowth(): CumulativeGrowth {
  return {
    statGains: {},
    totalDays: 0,
    matchDays: 0,
    slumpDays: 0,
  };
}

export function createEmptyCareerRecord(): CareerRecord {
  return {
    gamesPlayed: 0,
    atBats: 0,
    hits: 0,
    homeRuns: 0,
    rbis: 0,
    stolenBases: 0,
    gamesStarted: 0,
    inningsPitched: 0,
    wins: 0,
    losses: 0,
    strikeouts: 0,
    earnedRuns: 0,
  };
}
