import type { InjuryState } from './player';
import type { GameState } from './game-state';

/** ゲーム内日付 */
export interface GameDate {
  year: number;    // ゲーム内年（例: 1 = 初年度）
  month: number;   // 1-12
  day: number;     // 1-31
}

/** 日の種類 */
export type DayType =
  | 'school_day'
  | 'holiday'
  | 'tournament_day'
  | 'ceremony_day'
  | 'camp_day'
  | 'off_day';

/** 年間イベント（固定スケジュール） */
export interface ScheduledEvent {
  month: number;
  day: number;
  type: ScheduledEventType;
  name: string;
  duration?: number;
}

/** スケジュールイベント種別 */
export type ScheduledEventType =
  | 'enrollment_ceremony'
  | 'graduation_ceremony'
  | 'summer_tournament_start'
  | 'summer_tournament_end'
  | 'koshien_start'
  | 'koshien_end'
  | 'autumn_tournament_start'
  | 'autumn_tournament_end'
  | 'summer_camp_start'
  | 'summer_camp_end'
  | 'winter_camp_start'
  | 'winter_camp_end'
  | 'third_year_retirement'
  | 'new_team_formation'
  | 'off_season_start'
  | 'off_season_end';

/** 練習メニューID */
export type PracticeMenuId =
  | 'batting_basic'
  | 'batting_live'
  | 'pitching_basic'
  | 'pitching_bullpen'
  | 'fielding_drill'
  | 'running'
  | 'strength'
  | 'mental'
  | 'rest'
  // B4: 追加個別練習メニュー (Phase S1-B)
  | 'base_running'       // 走力強化（ベースランニング）
  | 'position_drill'     // 守備位置別反復（ポジション別）
  | 'pitch_study'        // 配球研究（投手向け）
  | 'pressure_mental'    // メンタルトレーニング（プレッシャー耐性）
  | 'flexibility'        // 柔軟性向上（ケガ予防）
  | 'video_analysis';    // 動画分析（バッティング/ピッチング動画レビュー）

/** 能力値のターゲット指定 */
export type StatTarget =
  | 'base.stamina'
  | 'base.speed'
  | 'base.armStrength'
  | 'base.fielding'
  | 'base.focus'
  | 'base.mental'
  | 'batting.contact'
  | 'batting.power'
  | 'batting.eye'
  | 'batting.technique'
  | 'pitching.velocity'
  | 'pitching.control'
  | 'pitching.pitchStamina';

/** 能力値への効果 */
export interface StatEffect {
  target: StatTarget;
  baseGain: number;
}

/** 練習メニュー定義 */
export interface PracticeMenu {
  id: PracticeMenuId;
  name: string;
  description: string;
  fatigueLoad: number;
  statEffects: StatEffect[];
  duration: 'half' | 'full';
}

/** チーム全体練習スロット (Phase S1-B B3) */
export interface TeamPracticeSlot {
  menuId: PracticeMenuId;
}

/**
 * チーム全体練習プラン (Phase S1-B B3)
 * 3つのスロットで構成。各スロットの効果は 1/3 ずつ加算。
 */
export interface TeamPracticePlan {
  slots: [TeamPracticeSlot, TeamPracticeSlot, TeamPracticeSlot];
}

/**
 * 練習成果フィードバック (Phase S1-B B6)
 * 選手詳細の「最近の成長」に表示する言葉表現ログ。
 */
export interface PracticeFeedback {
  date: GameDate;
  practiceType: string; // 例: 'バッティング'
  message: string;      // 例: 'ミート率があがったような気がする'
  delta: { stat: StatTarget; value: number }; // 内部用（表示しない）
}

/** 1日の処理結果（UI表示用のサマリ） */
export interface DayResult {
  date: GameDate;
  dayType: DayType;
  practiceApplied: PracticeMenuId | null;
  playerChanges: PlayerDayChange[];
  events: GameEvent[];
  injuries: { playerId: string; injury: InjuryState }[];
  recovered: string[];
}

/** processDay の返り値 */
export interface DayProcessResult {
  nextState: GameState;
  dayResult: DayResult;
}

/** 選手の1日の変化（UI表示用サマリ） */
export interface PlayerDayChange {
  playerId: string;
  statChanges: { target: StatTarget; delta: number }[];
  fatigueChange: number;
  moodBefore: import('./player').Mood;
  moodAfter: import('./player').Mood;
}

/** ゲーム内イベント（MVP最小版） */
export interface GameEvent {
  id: string;
  type: GameEventType;
  date: GameDate;
  description: string;
  involvedPlayerIds: string[];
}

/** イベント種別（MVP最小セット） */
export type GameEventType =
  | 'injury'
  | 'recovery'
  | 'mood_change'
  | 'growth_spurt'
  | 'slump_start'
  | 'slump_end'
  | 'new_pitch_learned'
  | 'enrollment'
  | 'graduation'
  | 'retirement'
  | 'practice_match';
