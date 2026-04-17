/**
 * practice-game — 練習試合・紅白戦の型定義
 *
 * 大会期間外に実施できる練習試合（対外校）と紅白戦（自校分割）を表す。
 */

import type { GameDate } from './calendar';

// ============================================================
// 練習試合種別
// ============================================================

/** 練習試合の種別 */
export type PracticeGameType = 'scrimmage' | 'intra_squad';

// ============================================================
// 予約（スケジュール）
// ============================================================

/**
 * ScheduledPracticeGame — ユーザーが予約した練習試合。
 *
 * `scheduledDate` の日が到来すると world-ticker が自動実行し、
 * `practiceGameHistory` に結果を追記して一覧から削除する。
 */
export interface ScheduledPracticeGame {
  /** 一意ID（"practice-{type}-{year}-{month}-{day}"）  */
  id: string;
  /** 試合種別 */
  type: PracticeGameType;
  /** 実施予定日 */
  scheduledDate: GameDate;
  /**
   * 対戦相手の学校ID。
   * - scrimmage: 対戦校の ID
   * - intra_squad: null（自チーム内紅白戦）
   */
  opponentSchoolId: string | null;
}

// ============================================================
// 結果レコード
// ============================================================

/**
 * PracticeGameRecord — 実施済み練習試合の結果。
 * `practiceGameHistory` に蓄積される。
 */
export interface PracticeGameRecord {
  /** 一意ID（scheduledPracticeGame と同じ ID） */
  id: string;
  /** 試合種別 */
  type: PracticeGameType;
  /** 実施日 */
  date: GameDate;
  /** 対戦相手学校ID（intra_squad は null） */
  opponentSchoolId: string | null;
  /** 対戦相手学校名（表示用。null の場合は「紅白戦」） */
  opponentSchoolName: string | null;
  /** 勝敗結果 */
  result: 'win' | 'loss' | 'draw';
  /** 最終スコア（自チーム視点） */
  finalScore: { player: number; opponent: number };
  /** ハイライト文字列配列（最大5件） */
  highlights: string[];
  /** MVP 選手ID（null = 判定なし） */
  mvpPlayerId: string | null;
  /**
   * 疲労増分。
   * scrimmage: 8〜15
   * intra_squad: 3〜8
   */
  fatigueDelta: number;
}

// ============================================================
// エラー型
// ============================================================

/** 練習試合スケジュール失敗の理由 */
export type ScheduleError =
  | 'tournament_active'    // 大会期間中
  | 'date_conflict'        // 同日に既に予約あり
  | 'date_too_far'         // 7日先より遠い
  | 'date_past'            // 過去日
  | 'opponent_not_found'   // 相手校が見つからない
  | 'max_scheduled';       // 予約上限（3件）に達している
