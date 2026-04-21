/**
 * player-history.ts — 選手イベント履歴・練習履歴型定義 (Phase 11.5-E)
 */

import type { GameDate } from './calendar';
import type { PracticeMenuId } from './calendar';

export type PlayerEventType =
  | 'enrollment'
  | 'practice_match'
  | 'tournament_play'
  | 'tournament_win'
  | 'koshien_qualify'
  | 'great_hit'
  | 'great_pitch'
  | 'injury'
  | 'recovery'
  | 'rest'
  | 'growth_spurt'
  | 'slump'
  | 'graduation'
  | 'evaluator_noted';

export interface PlayerEvent {
  type: PlayerEventType;
  date: GameDate;
  text: string;
  importance: 'high' | 'medium' | 'low';
}

export interface PracticeHistoryEntry {
  date: GameDate;
  menuId: PracticeMenuId;
  menuLabel: string;
  fatigueAfter: number;
  motivationAfter: number;
}
