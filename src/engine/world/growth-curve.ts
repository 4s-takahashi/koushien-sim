/**
 * growth-curve — StatGrowthCurve ベースの成長計算
 *
 * Phase 1/2 の gradeMultiplier() を peakMultiplier() に置き換え、
 * 能力値ごとの成長カーブを実現する。
 * 既存の calculateStatGain() は Tier 1 互換として維持。
 */

import type { RNG } from '../core/rng';
import type { Mood, TraitId } from '../types/player';
import type { PracticeMenuId } from '../types/calendar';
import type { StatGrowthCurve } from './person-blueprint';

// ============================================================
// ピーク倍率
// ============================================================

const PEAK_MAX = 1.5;
const PEAK_MIN = 0.2;

/**
 * ベルカーブ型のピーク倍率を計算する。
 *
 * @param currentAge  現在の年齢（中1=13, 高3=18）
 * @param peakAge     ピーク年齢
 * @param peakWidth   ピーク幅（小さいほど鋭い）
 * @returns           倍率 (PEAK_MIN – PEAK_MAX)
 */
export function peakMultiplier(
  currentAge: number,
  peakAge: number,
  peakWidth: number,
): number {
  const deviation = (currentAge - peakAge) / Math.max(peakWidth, 0.1);
  const bellCurve = Math.exp(-0.5 * deviation * deviation);
  return PEAK_MIN + (PEAK_MAX - PEAK_MIN) * bellCurve;
}

// ============================================================
// 外部修正子（既存の calculate.ts の関数を再利用可能にしたもの）
// ============================================================

export function moodMultiplier(mood: Mood): number {
  switch (mood) {
    case 'excellent': return 1.15;
    case 'good':      return 1.05;
    case 'normal':    return 1.0;
    case 'poor':      return 0.9;
    case 'terrible':  return 0.75;
  }
}

export function fatigueMultiplier(fatigue: number): number {
  if (fatigue < 30) return 1.0;
  if (fatigue < 60) return 0.9;
  if (fatigue < 80) return 0.7;
  return 0.4;
}

export function traitMultiplier(traits: readonly TraitId[]): number {
  let mult = 1.0;
  if (traits.includes('hard_worker'))    mult *= 1.15;
  if (traits.includes('natural_talent')) mult *= 0.95;
  if (traits.includes('slacker'))        mult *= 0.8;
  return mult;
}

/** 天井ペナルティ（stat-utils.ts と同一ロジック） */
export function ceilingPenalty(current: number, ceiling: number): number {
  if (ceiling <= 0) return 0;
  const ratio = current / ceiling;
  if (ratio < 0.5) return 1.0;
  if (ratio < 0.8) return 1.0 - (ratio - 0.5) * 0.5;
  if (ratio < 0.95) return 0.3;
  return 0.05;
}

// ============================================================
// V3 成長計算コンテキスト
// ============================================================

export interface GrowthContextV3 {
  currentAge: number;
  current: number;
  ceiling: number;
  mood: Mood;
  fatigue: number;
  traits: readonly TraitId[];
  seasonMultiplier: number;
  isInSlump: boolean;
  practiceMenuId: PracticeMenuId;
}

// ============================================================
// V3 成長量計算
// ============================================================

/**
 * StatGrowthCurve ベースの1日1能力値の成長量を計算する。
 *
 * 経路A（練習ベース）で使用。
 * 経路B（試合ベース）は applyMatchGrowthV3() で別途実装。
 */
export function calculateStatGainV3(
  curve: StatGrowthCurve,
  ctx: GrowthContextV3,
  rng: RNG,
): number {
  // 日次揺らぎ
  const varMin = 1.0 - curve.variance;
  const varMax = 1.0 + curve.variance;
  const dailyVariance = varMin + rng.next() * (varMax - varMin);

  // ピーク倍率
  const peak = peakMultiplier(ctx.currentAge, curve.peakAge, curve.peakWidth);

  // スランプペナルティ
  const slumpMult = ctx.isInSlump ? (1.0 - curve.slumpPenalty) : 1.0;

  // 練習メニュー適性
  const affinityMult = curve.practiceAffinity?.[ctx.practiceMenuId] ?? 1.0;

  const gain =
    curve.baseRate
    * peak
    * moodMultiplier(ctx.mood)
    * fatigueMultiplier(ctx.fatigue)
    * traitMultiplier(ctx.traits)
    * ctx.seasonMultiplier
    * ceilingPenalty(ctx.current, ctx.ceiling)
    * slumpMult
    * affinityMult
    * dailyVariance;

  return gain;
}
