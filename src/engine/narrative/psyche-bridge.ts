/**
 * src/engine/narrative/psyche-bridge.ts — NarrativeHook ↔ 心理システム接続
 *
 * Phase R6-5: NarrativeHook を既存心理システム（v0.21.0）に接続する。
 * Phase R7-2: NarrativeHook 購読インターフェース整備。
 *
 * 設計方針:
 * - 既存 psyche/types.ts の MentalEffect 型を再利用する
 * - NarrativeHook の psycheHint を MentalEffect に変換する
 * - 既存 generatePitchMonologues は変更しない（後方互換）
 * - NarrativeHook 購読を opt-in で追加する
 * - R7-2: 購読コールバック型を整備し、心理状態変化の発火タイミングを統一する
 */

import type { NarrativeHook, NarrativeHookKind, NarrativeHookSubscribeInput } from './types';
import type { MentalEffect } from '../psyche/types';

// ============================================================
// フック種別 → MentalEffect マッピング
// ============================================================

/**
 * NarrativeHookKind → MentalEffect のデフォルトマッピング
 *
 * 心理システムはこのマップを参照して補正値を決定する。
 * 細かい補正は applyNarrativeHookToPsyche() で追加可能。
 */
export const HOOK_MENTAL_EFFECT_MAP: Readonly<Record<NarrativeHookKind, MentalEffect>> = {
  // ─── ホームラン系（打者に大きなボーナス）────────────────
  liner_home_run: {
    powerMultiplier: 1.05,
    contactMultiplier: 1.03,
    summary: 'ライナーHR：気分最高！',
  },
  high_arc_home_run: {
    powerMultiplier: 1.05,
    contactMultiplier: 1.02,
    summary: '高弾道HR：乗っている！',
  },
  line_home_run: {
    powerMultiplier: 1.04,
    contactMultiplier: 1.02,
    summary: 'ライン際HR：際どい！',
  },

  // ─── 長打系 ──────────────────────────────────────────────
  wall_ball_hit: {
    powerMultiplier: 1.02,
    contactMultiplier: 1.01,
    summary: 'フェンス直撃：勢いがある',
  },
  extra_base_drive: {
    powerMultiplier: 1.02,
    summary: '長打：好調',
  },

  // ─── ポテンヒット系 ──────────────────────────────────────
  blooper_over_infield: {
    contactMultiplier: 1.01,
    summary: 'ポテンヒット：運も実力',
  },
  shallow_fly_drop: {
    contactMultiplier: 1.0,
    summary: '浅いフライ：際どい落球',
  },

  // ─── 強打系 ──────────────────────────────────────────────
  comebacker_hard: {
    contactMultiplier: 1.0,
    summary: 'P返し：強烈な当たり',
  },
  line_grounder: {
    contactMultiplier: 1.01,
    summary: 'ライン際ゴロ：鋭い打球',
  },
  center_clean_hit: {
    contactMultiplier: 1.01,
    eyeMultiplier: 1.01,
    summary: 'センター前：クリーンヒット',
  },
  through_infield: {
    contactMultiplier: 1.01,
    summary: '抜けるヒット',
  },

  // ─── 凡打系（投手側ボーナス）────────────────────────────
  infield_popup: {
    controlMultiplier: 1.02,
    summary: 'ポップフライ：制球成功',
  },
  weak_contact: {
    controlMultiplier: 1.03,
    velocityBonus: 1,
    summary: '当たり損ね：完璧な制球',
  },
  routine_grounder: {
    controlMultiplier: 1.01,
    summary: '平凡なゴロ',
  },
  routine_fly: {
    controlMultiplier: 1.01,
    summary: '平凡なフライ',
  },

  // ─── 特殊 ────────────────────────────────────────────────
  foul_fly_close: {
    summary: 'ファウルフライ',
  },
  hard_hit_ball: {
    contactMultiplier: 1.02,
    powerMultiplier: 1.01,
    summary: '強烈な当たり',
  },
} as const;

// ============================================================
// MentalEffect 算出
// ============================================================

/**
 * NarrativeHook から MentalEffect を算出する
 *
 * psycheHint の batterImpact / pitcherImpact を使って
 * HOOK_MENTAL_EFFECT_MAP の値を動的に調整する。
 *
 * @param hook    - NarrativeHook
 * @param role    - 'batter' | 'pitcher' — どちらへの効果か
 * @returns MentalEffect
 */
export function computeHookMentalEffect(
  hook: NarrativeHook,
  role: 'batter' | 'pitcher',
): MentalEffect {
  const base = HOOK_MENTAL_EFFECT_MAP[hook.kind];
  const impact = role === 'batter' ? hook.psycheHint.batterImpact : hook.psycheHint.pitcherImpact;

  // impact が 0 の場合はベースエフェクトをそのまま返す
  if (impact === 0) return base;

  // 絶対値の大きい impact ほど補正を強める（最大 ±0.05）
  const boost = Math.min(0.05, Math.abs(impact) * 0.05);
  const sign = impact > 0 ? 1 : -1;

  return {
    ...base,
    contactMultiplier: base.contactMultiplier !== undefined
      ? base.contactMultiplier + sign * boost
      : undefined,
    powerMultiplier: base.powerMultiplier !== undefined
      ? base.powerMultiplier + sign * boost
      : undefined,
    controlMultiplier: role === 'pitcher' && base.controlMultiplier !== undefined
      ? base.controlMultiplier + sign * boost
      : base.controlMultiplier,
  };
}

// ============================================================
// 心理システムへの購読適用
// ============================================================

/**
 * NarrativeHook を心理システムに適用する
 *
 * この関数は engine 内の打席処理から呼び出される。
 * 既存の generatePitchMonologues とは独立しており、
 * NarrativeHook による追加メンタル補正を MatchOverrides に反映する。
 *
 * @param hook           - NarrativeHook
 * @param currentOverrides - 既存の MatchOverrides（あれば）
 * @returns 更新された心理補正オブジェクト（既存互換型）
 */
export function applyNarrativeHookToPsyche(
  hook: NarrativeHook,
  currentOverrides?: {
    batterMental?: { contactBonus?: number; powerBonus?: number; eyeBonus?: number };
    pitcherMental?: { controlBonus?: number; velocityBonus?: number };
  },
): {
  batterMental: { contactBonus: number; powerBonus: number; eyeBonus: number };
  pitcherMental: { controlBonus: number; velocityBonus: number };
} {
  const batterEffect = computeHookMentalEffect(hook, 'batter');
  const pitcherEffect = computeHookMentalEffect(hook, 'pitcher');

  // 既存の補正値に加算（clamp は process-pitch.ts 側で行う）
  const prevBatter = currentOverrides?.batterMental ?? {};
  const prevPitcher = currentOverrides?.pitcherMental ?? {};

  // MentalEffect の multiplier は 1.0 基準なので (multiplier - 1.0) を加算
  const contactBonus = (prevBatter.contactBonus ?? 0)
    + ((batterEffect.contactMultiplier ?? 1.0) - 1.0);
  const powerBonus = (prevBatter.powerBonus ?? 0)
    + ((batterEffect.powerMultiplier ?? 1.0) - 1.0);
  const eyeBonus = (prevBatter.eyeBonus ?? 0)
    + ((batterEffect.eyeMultiplier ?? 1.0) - 1.0);

  const controlBonus = (prevPitcher.controlBonus ?? 0)
    + ((pitcherEffect.controlMultiplier ?? 1.0) - 1.0);
  const velocityBonus = (prevPitcher.velocityBonus ?? 0)
    + (pitcherEffect.velocityBonus ?? 0);

  return {
    batterMental: { contactBonus, powerBonus, eyeBonus },
    pitcherMental: { controlBonus, velocityBonus },
  };
}

// ============================================================
// R7-2: NarrativeHook 購読インターフェース
// ============================================================

/**
 * NarrativeHook 購読コールバック型
 *
 * 心理システムはこのコールバックを通じて NarrativeHook の通知を受け取る。
 * 打席終了後や特定イベント後に呼び出される。
 */
export type NarrativeHookSubscriber = (input: NarrativeHookSubscribeInput) => void;

/**
 * 簡易購読管理（シングルトン不要: 呼び出し側が配列を管理する設計）
 *
 * 使い方:
 * ```ts
 * const subscribers: NarrativeHookSubscriber[] = [];
 * subscribers.push((input) => applyNarrativeHookToPsyche(input.hook, ...));
 * notifyNarrativeHookSubscribers(subscribers, hook);
 * ```
 */
export function notifyNarrativeHookSubscribers(
  subscribers: ReadonlyArray<NarrativeHookSubscriber>,
  hook: NarrativeHook,
  options?: {
    suggestedBatterConfidenceDelta?: number;
    suggestedPitcherConfidenceDelta?: number;
  },
): void {
  const input: NarrativeHookSubscribeInput = {
    hook,
    suggestedBatterConfidenceDelta: options?.suggestedBatterConfidenceDelta,
    suggestedPitcherConfidenceDelta: options?.suggestedPitcherConfidenceDelta,
  };
  for (const subscriber of subscribers) {
    subscriber(input);
  }
}

/**
 * NarrativeHook の drama level から confidence 変化量を算出する
 *
 * @param hook     - NarrativeHook
 * @param role     - 'batter' | 'pitcher'
 * @returns confidence 変化量 (-10〜+10)
 */
export function computeConfidenceDelta(
  hook: NarrativeHook,
  role: 'batter' | 'pitcher',
): number {
  const impact = role === 'batter'
    ? hook.psycheHint.batterImpact
    : hook.psycheHint.pitcherImpact;

  // drama level による倍率: dramatic=2.0, high=1.5, medium=1.0, low=0.5
  const dramaMultiplier: Record<string, number> = {
    dramatic: 2.0,
    high:     1.5,
    medium:   1.0,
    low:      0.5,
  };
  const mult = dramaMultiplier[hook.dramaLevel] ?? 1.0;

  // impact(-1~+1) × drama × 5 → -10〜+10 の範囲
  return Math.max(-10, Math.min(10, impact * mult * 5));
}

/**
 * NarrativeHookSubscribeInput から打者・投手の confidence 変化を計算する
 *
 * @param input - NarrativeHookSubscribeInput
 * @returns { batter: number; pitcher: number } — confidence delta
 */
export function extractConfidenceDeltas(
  input: NarrativeHookSubscribeInput,
): { batter: number; pitcher: number } {
  const batter = input.suggestedBatterConfidenceDelta
    ?? computeConfidenceDelta(input.hook, 'batter');
  const pitcher = input.suggestedPitcherConfidenceDelta
    ?? computeConfidenceDelta(input.hook, 'pitcher');
  return { batter, pitcher };
}
