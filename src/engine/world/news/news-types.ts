/**
 * news-types — 世界ニュースの型定義
 *
 * advanceWorldDay() で生成される WorldNewsItem の詳細型。
 * WorldNewsItem (world-ticker.ts) の型を拡張する形で定義。
 */

import type { GameDate } from '../../types/calendar';

// ============================================================
// ニュース種別
// ============================================================

export type NewsType =
  | 'tournament_result'   // 大会結果
  | 'upset'               // 番狂わせ
  | 'no_hitter'           // ノーヒットノーラン
  | 'record'              // 記録達成
  | 'draft'               // ドラフト関連
  | 'injury'              // 選手負傷
  | 'scout_prospect'      // 注目中学生
  | 'ob_activity'         // OB活躍
  | 'season_start'        // シーズン開始
  | 'season_end'          // シーズン終了
  | 'enrollment'          // 新入生情報
  | 'graduation';         // 卒業・引退

export type NewsImportance = 'high' | 'medium' | 'low';

// ============================================================
// ニュース本体
// ============================================================

export interface NewsItem {
  id: string;
  type: NewsType;
  date: GameDate;
  headline: string;
  detail: string;
  involvedSchoolIds: string[];
  involvedPlayerIds: string[];
  importance: NewsImportance;
}

// ============================================================
// ニュースカテゴリ別のコンテキスト
// ============================================================

/** 番狂わせニュースのコンテキスト */
export interface UpsetNewsContext {
  winnerSchoolId: string;
  winnerSchoolName: string;
  winnerReputation: number;
  loserSchoolId: string;
  loserSchoolName: string;
  loserReputation: number;
  scoreDiff: number;
}

/** 注目中学生ニュースのコンテキスト */
export interface ProspectNewsContext {
  playerId: string;
  playerName: string;
  grade: 1 | 2 | 3;
  prefecture: string;
  qualityTier: 'S' | 'A';
  overall: number;
}

/** ドラフトニュースのコンテキスト */
export interface DraftNewsContext {
  playerId: string;
  playerName: string;
  schoolName: string;
  proTeam: string;
  round: number;
}

/** OB活躍ニュースのコンテキスト */
export interface OBActivityContext {
  personId: string;
  personName: string;
  schoolName: string;
  currentTeam: string;
  achievement: string;
}
