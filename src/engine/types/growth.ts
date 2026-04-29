/**
 * growth.ts — 成長システム型定義
 * Phase S1-C C3 (2026-04-29)
 */

import type { GameDate } from './calendar';

// ============================================================
// GrowthEvent — 選手成長イベント
// ============================================================

/**
 * 成長イベントの種別:
 * - pitch_acquired: 投手が新変化球習得
 * - opposite_field: 流し打ち得意化
 * - breakthrough:   一般的な「調子が良くなった」突破口
 * - injury_recover: 怪我から復帰（心理的不安残り）
 * - mental_shift:   心境変化「プレッシャーに強くなった」
 */
export type GrowthEventType =
  | 'pitch_acquired'
  | 'opposite_field'
  | 'breakthrough'
  | 'injury_recover'
  | 'mental_shift';

/**
 * 成長イベントによる能力変化エフェクト
 */
export interface GrowthEffect {
  /** 変化する能力パス（例: 'pitching.velocity', 'batting.contact'） */
  statPath: string;
  /** 変化量 */
  delta: number;
}

/**
 * GrowthEvent — 選手成長イベント本体
 */
export interface GrowthEvent {
  /** ユニーク ID */
  id: string;
  /** 対象選手 ID */
  playerId: string;
  /** 発生日 */
  date: GameDate;
  /** イベント種別 */
  type: GrowthEventType;
  /** 説明文（表示用） */
  description: string;
  /** 内部効果（Stats/Tacticsへの変化） */
  effects: GrowthEffect[];
  /** 自校ニュース投稿済みか */
  postedToNews?: boolean;
}
