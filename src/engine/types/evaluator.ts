/**
 * evaluator.ts — 評価者システム型定義 (Phase 11.5-C)
 */

import type { GameDate } from './calendar';

/** 評価者ランク（SSS = 超一流 ～ F = 評価外） */
export type EvaluatorRank = 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** 評価者種別 */
export type EvaluatorType = 'media' | 'critic' | 'scout';

/** 評価者の注目フォーカス */
export type EvaluatorFocus =
  | 'pitcher_overall'
  | 'pitcher_velocity'
  | 'pitcher_control'
  | 'batter_overall'
  | 'batter_power'
  | 'batter_contact'
  | 'defense_fielding'
  | 'speed_running'
  | 'mental_focus'
  | 'koshien_record'
  | 'battery_pair'
  | 'breaking_ball'
  | 'stamina';

/** 評価バイアス設定 */
export interface EvaluatorBias {
  /** 全体バイアス -2〜+2（得点換算: ×10点） */
  generalBias: number;
  /** 成長タイプバイアス */
  growthTypeBias?: Partial<Record<string, number>>;
  /** ポジションバイアス */
  positionBias?: Partial<Record<string, number>>;
  /**
   * 閾値ボーナス: 特定能力値をこの値以上持つ選手に bonus 点を加算
   */
  thresholdBonuses?: Array<{ stat: string; threshold: number; bonus: number }>;
}

/** 評価者データ */
export interface Evaluator {
  id: string;
  name: string;
  type: EvaluatorType;
  affiliation: string;
  focus: EvaluatorFocus;
  bias: EvaluatorBias;
  description: string;
}

/** 評価者による選手のランク評価 */
export interface EvaluatorPlayerRank {
  evaluatorId: string;
  playerId: string;
  rank: EvaluatorRank;
  updatedDate: GameDate;
  comment?: string;
}

/** 評価者システム全体の状態 */
export interface EvaluatorState {
  evaluators: Evaluator[];
  rankings: EvaluatorPlayerRank[];
  lastBatchDate?: GameDate;
}
