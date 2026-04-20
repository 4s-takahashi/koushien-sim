/**
 * src/engine/psyche/types.ts
 *
 * Phase 7-B: 心理システム基盤の型定義
 *
 * MonologuePattern: 条件×選手特性×采配の組み合わせで選ばれる定型文テンプレート
 * MentalEffect: モノローグが生成された際に付随する数値補正
 */

import type { TraitId } from '../types/player';

// ============================================================
// 役割
// ============================================================

export type MonologueRole = 'batter' | 'pitcher' | 'catcher' | 'runner' | 'fielder';

// ============================================================
// 状況条件
// ============================================================

export interface SituationCondition {
  half?: 'top' | 'bottom' | 'any';
  inning?: { min?: number; max?: number };
  outs?: 0 | 1 | 2 | 'any';
  runnersOn?: 'none' | 'some' | 'scoring' | 'bases_loaded' | 'any';
  scoreDiff?: { role: 'leading' | 'tied' | 'trailing' | 'any'; by?: number };
  /** 大舞台（isKoshien）かどうか */
  isKoshien?: boolean;
}

// ============================================================
// カウント条件
// ============================================================

export interface CountCondition {
  balls?: number;
  strikes?: number;
}

// ============================================================
// 采配条件
// ============================================================

export type OrderConditionType =
  | 'aggressive'
  | 'passive'
  | 'detailed_focus'
  | 'brush_back'
  | 'fastball_heavy'
  | 'breaking_heavy'
  | 'outside_focus'
  | 'inside_focus'
  | 'any';

export interface OrderCondition {
  type: OrderConditionType;
  /** 詳細な焦点エリア（任意） */
  focusArea?: string;
}

// ============================================================
// メンタル補正
// ============================================================

export interface MentalEffect {
  /** ミート補正 (例: 1.05 = +5%) */
  contactMultiplier?: number;
  /** パワー補正 */
  powerMultiplier?: number;
  /** 制球補正 */
  controlMultiplier?: number;
  /** 球速補正 (km/h 加算) */
  velocityBonus?: number;
  /** 選球眼補正 */
  eyeMultiplier?: number;
  /** 指示を無効化するか */
  ignoreOrder?: boolean;
  /** 盗塁試みやすさ補正 */
  stealAttemptMultiplier?: number;
  /** エラー率補正 */
  errorRateMultiplier?: number;
  /** 打者集中乱れフラグ */
  batterFocusDisrupt?: boolean;
  /** 要約テキスト (UI 表示用) */
  summary?: string;
}

// ============================================================
// モノローグパターン
// ============================================================

export interface MonologuePattern {
  id: string;
  role: MonologueRole;

  // マッチ条件
  situation: SituationCondition;
  traitMatch?: TraitId[];
  /** 特性否定 — いずれかの特性を持っていたら除外 */
  traitExclude?: TraitId[];
  orderMatch?: OrderCondition;
  countCondition?: CountCondition;

  /** スタミナ条件 (0-100, この値未満で発火) */
  staminaBelow?: number;
  /** スタミナ条件 (0-100, この値以上で発火) */
  staminaAbove?: number;

  // 出力
  text: string;
  mentalEffect: MentalEffect;

  // 出現重み 1-100
  weight: number;
}

// ============================================================
// モノローグエントリ（UI + PitchLog 用の軽量型）
// ============================================================

export interface MonologueEntry {
  role: MonologueRole;
  text: string;
  /** 効果サマリー (例: "ミート+8%") — UI 表示用 */
  effectSummary?: string;
}

// ============================================================
// generatePitchMonologues の引数
// ============================================================

export interface PitchContext {
  inning: number;
  half: 'top' | 'bottom';
  outs: number;
  balls: number;
  strikes: number;
  /** 塁に走者がいるか */
  runnersOn: 'none' | 'some' | 'scoring' | 'bases_loaded';
  scoreDiff: number; // バッティングチームから見た得点差（正=リード、負=ビハインド）
  isKoshien: boolean;
  /** 打者の特性 */
  batterTraits: TraitId[];
  /** 投手の特性 */
  pitcherTraits: TraitId[];
  /** 投手スタミナ 0-100 */
  pitcherStamina: number;
  /** 投手の連続三振数 */
  consecutiveStrikeouts?: number;
  /** 打者の連続凡退数 */
  consecutiveRetired?: number;
  /** 現在の監督采配タイプ (null = none) */
  orderType: OrderConditionType | null;
  /** 詳細采配のフォーカスエリア */
  orderFocusArea?: string;
}

// ============================================================
// generatePitchMonologues の戻り値
// ============================================================

export interface PitchMonologues {
  batter: MonologueEntry | null;
  pitcher: MonologueEntry | null;
  catcher: MonologueEntry | null;
}
