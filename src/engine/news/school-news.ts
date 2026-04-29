/**
 * school-news.ts — 自校ニュース自動生成ロジック
 * Phase S1-C C2 (2026-04-29)
 *
 * GrowthEvent やチーム状態の変化を自校ニュースとして変換する。
 */

import type { GameDate } from '../types/calendar';
import type { GrowthEvent, GrowthEventType } from '../types/growth';

// ============================================================
// 自校ニュース型
// ============================================================

/**
 * 自校ニュースのジャンル
 */
export type SchoolNewsGenre =
  | 'growth'       // 選手成長（変化球習得・流し打ち等）
  | 'record'       // 大会・試合記録更新
  | 'injury'       // 怪我・復帰
  | 'mental'       // 心境変化・モチベーション
  | 'general';     // その他

/**
 * 自校ニュースアイテム
 */
export interface SchoolNewsItem {
  id: string;
  date: GameDate;
  genre: SchoolNewsGenre;
  /** ジャンル別アイコン */
  icon: string;
  headline: string;
  detail?: string;
  /** 関連選手 ID */
  playerId?: string;
  /** 参照元イベント ID */
  sourceEventId?: string;
}

// ============================================================
// ジャンル別アイコン
// ============================================================

const GENRE_ICONS: Record<SchoolNewsGenre, string> = {
  growth:  '⭐',
  record:  '🏆',
  injury:  '🏥',
  mental:  '💪',
  general: '📰',
};

export function getGenreIcon(genre: SchoolNewsGenre): string {
  return GENRE_ICONS[genre];
}

// ============================================================
// GrowthEvent → SchoolNewsItem 変換
// ============================================================

/**
 * GrowthEventType から SchoolNewsGenre へのマッピング
 */
const GROWTH_EVENT_GENRE: Record<GrowthEventType, SchoolNewsGenre> = {
  pitch_acquired:  'growth',
  opposite_field:  'growth',
  breakthrough:    'growth',
  injury_recover:  'injury',
  mental_shift:    'mental',
};

/**
 * GrowthEvent を SchoolNewsItem に変換する。
 */
export function growthEventToSchoolNews(event: GrowthEvent): SchoolNewsItem {
  const genre = GROWTH_EVENT_GENRE[event.type] ?? 'general';
  return {
    id: `news-${event.id}`,
    date: event.date,
    genre,
    icon: GENRE_ICONS[genre],
    headline: event.description,
    playerId: event.playerId,
    sourceEventId: event.id,
  };
}

// ============================================================
// ニュースの日付ソート・制限
// ============================================================

/**
 * 日付を比較して降順（新しい順）でソートするための比較関数。
 */
function compareDateDesc(a: GameDate, b: GameDate): number {
  if (a.year !== b.year) return b.year - a.year;
  if (a.month !== b.month) return b.month - a.month;
  return b.day - a.day;
}

/**
 * ニュースを日付降順でソートし、最大 maxCount 件に絞る。
 */
export function sortAndLimitNews(items: SchoolNewsItem[], maxCount = 30): SchoolNewsItem[] {
  return [...items]
    .sort((a, b) => compareDateDesc(a.date, b.date))
    .slice(0, maxCount);
}

// ============================================================
// eventLog から自校ニュースリストを構築
// ============================================================

/**
 * WorldState.eventLog から自校ニュースリストを構築する。
 * GrowthEvent を SchoolNewsItem に変換し、日付降順で返す。
 *
 * @param eventLog 成長イベント履歴
 * @param maxCount 最大件数（デフォルト 30）
 */
export function buildSchoolNewsList(
  eventLog: GrowthEvent[],
  maxCount = 30,
): SchoolNewsItem[] {
  const items = eventLog.map(growthEventToSchoolNews);
  return sortAndLimitNews(items, maxCount);
}
