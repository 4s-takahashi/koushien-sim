/**
 * manager-staff.ts — マネージャー管理型定義 (Phase 11.5-F/G)
 * MANAGER-ADDENDUM.md の確定要件に基づく
 */

import type { GameDate } from './calendar';
import type { EvaluatorRank } from './evaluator';

export type ManagerRole = 'scout' | 'mental' | 'analytics' | 'pr';

export interface ManagerTrait {
  id: string;
  name: string;
  description: string;
  /** 視察精度ボーナス % */
  scoutingBonus?: number;
  /** モチベーション効果 */
  motivationBonus?: number;
  /** 経験値ボーナス率 */
  expBonus?: number;
}

export interface ManagerEventLog {
  date: GameDate;
  text: string;
  type: 'scouting' | 'levelup' | 'graduation' | 'join';
}

export interface Manager {
  id: string;
  firstName: string;
  lastName: string;
  /** 学年: 1〜3年 (3年で卒業) */
  grade: 1 | 2 | 3;
  rank: EvaluatorRank;
  /** レベル 1-100 */
  level: number;
  /** 経験値 (ランクアップで0リセット) */
  exp: number;
  role: ManagerRole;
  traits: ManagerTrait[];
  /** 入学年 (ゲーム内) */
  joinedYear: number;
  events: ManagerEventLog[];
}

export interface ScoutingEvaluation {
  label: string;
  text: string;
  /** デバッグ用: 実際に正しい評価かどうか */
  isAccurate: boolean;
}

export interface OpponentScoutingReport {
  targetSchoolId: string;
  scoutedAt: GameDate;
  scoutedByManagerId: string;
  teamAssessment: string[];
  playerAssessments: Record<string, PlayerScoutingData>;
  /** 内部管理: 精度 0-1 */
  accuracy: number;
  informationDepth: 'shallow' | 'medium' | 'deep';
}

export interface PlayerScoutingData {
  playerId: string;
  evaluations: ScoutingEvaluation[];
}

export interface ManagerStaff {
  /** 雇用中のマネージャー一覧 */
  members: Manager[];
  /** 視察済みスカウティングレポート (schoolId → report) */
  scoutingReports: Record<string, OpponentScoutingReport>;
  /** 最大雇用人数 (レピュテーションで変動) */
  maxMembers: number;
}
