/**
 * batch-growth — Tier 2 (Standard) 用バッチ成長計算
 *
 * 1選手あたり1回の計算で全能力を一括更新する。
 * 計算式:
 *   dailyGain = growthRate × gradeMultiplier × seasonMultiplier × 0.3
 *   各能力 += dailyGain × emphasisWeight × random(0.8, 1.2)
 *   ceilingPenalty を適用
 *
 * Phase 1/2 の applyDailyGrowth() と統計的に近似する（±20%以内）。
 */

import type { Player, PlayerStats, Grade, GrowthType } from '../types/player';
import type { RNG } from '../core/rng';
import type { CoachStyle } from '../world/person-blueprint';
import { ceilingPenalty } from '../world/growth-curve';
import { GROWTH_CONSTANTS } from './constants';

// ============================================================
// 定数
// ============================================================

const BATCH_BASE_MULTIPLIER = 0.3;

/** practiceEmphasis に応じた能力別重みテーブル */
const EMPHASIS_WEIGHTS: Record<
  CoachStyle['practiceEmphasis'],
  { batting: number; pitching: number; base: number }
> = {
  batting:  { batting: 1.4, pitching: 0.6, base: 1.0 },
  pitching: { batting: 0.6, pitching: 1.4, base: 1.0 },
  defense:  { batting: 0.8, pitching: 0.8, base: 1.4 },
  balanced: { batting: 1.0, pitching: 1.0, base: 1.0 },
};

// ============================================================
// ヘルパー
// ============================================================

function gradeMultiplier(grade: Grade, growthType: GrowthType): number {
  const table: Record<GrowthType, [number, number, number]> = {
    early:  [1.5, 1.0, 0.6],
    normal: [1.0, 1.1, 0.9],
    late:   [0.6, 1.0, 1.4],
    genius: [1.2, 1.2, 1.0],
  };
  return table[growthType][grade - 1];
}

function computeGrade(player: Player, currentYear: number): Grade {
  const diff = currentYear - player.enrollmentYear + 1;
  return Math.min(3, Math.max(1, diff)) as Grade;
}

function applyGainToStats(
  stats: PlayerStats,
  ceiling: PlayerStats,
  dailyGain: number,
  weights: { batting: number; pitching: number; base: number },
  rng: RNG,
): PlayerStats {
  const c = GROWTH_CONSTANTS;

  function randomVar(): number {
    return 0.8 + rng.next() * 0.4; // random(0.8, 1.2)
  }

  function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }

  function gain(current: number, ceil: number, weight: number): number {
    return dailyGain * weight * ceilingPenalty(current, ceil) * randomVar();
  }

  const bw = weights.base;
  const batw = weights.batting;
  const pitw = weights.pitching;

  const newBase = {
    stamina:     clamp(stats.base.stamina     + gain(stats.base.stamina,     ceiling.base.stamina,     bw),   c.STAT_MIN, c.STAT_MAX),
    speed:       clamp(stats.base.speed       + gain(stats.base.speed,       ceiling.base.speed,       bw),   c.STAT_MIN, c.STAT_MAX),
    armStrength: clamp(stats.base.armStrength + gain(stats.base.armStrength, ceiling.base.armStrength, bw),   c.STAT_MIN, c.STAT_MAX),
    fielding:    clamp(stats.base.fielding    + gain(stats.base.fielding,    ceiling.base.fielding,    bw),   c.STAT_MIN, c.STAT_MAX),
    focus:       clamp(stats.base.focus       + gain(stats.base.focus,       ceiling.base.focus,       bw),   c.STAT_MIN, c.STAT_MAX),
    mental:      clamp(stats.base.mental      + gain(stats.base.mental,      ceiling.base.mental,      bw),   c.STAT_MIN, c.STAT_MAX),
  };

  const newBatting = {
    contact:   clamp(stats.batting.contact   + gain(stats.batting.contact,   ceiling.batting.contact,   batw), c.STAT_MIN, c.STAT_MAX),
    power:     clamp(stats.batting.power     + gain(stats.batting.power,     ceiling.batting.power,     batw), c.STAT_MIN, c.STAT_MAX),
    eye:       clamp(stats.batting.eye       + gain(stats.batting.eye,       ceiling.batting.eye,       batw), c.STAT_MIN, c.STAT_MAX),
    technique: clamp(stats.batting.technique + gain(stats.batting.technique, ceiling.batting.technique, batw), c.STAT_MIN, c.STAT_MAX),
  };

  let newPitching = stats.pitching;
  if (stats.pitching && ceiling.pitching) {
    newPitching = {
      velocity:     clamp(stats.pitching.velocity     + gain(stats.pitching.velocity,     ceiling.pitching.velocity,     pitw), c.VELOCITY_MIN, c.VELOCITY_MAX),
      control:      clamp(stats.pitching.control      + gain(stats.pitching.control,      ceiling.pitching.control,      pitw), c.STAT_MIN, c.STAT_MAX),
      pitchStamina: clamp(stats.pitching.pitchStamina + gain(stats.pitching.pitchStamina, ceiling.pitching.pitchStamina, pitw), c.STAT_MIN, c.STAT_MAX),
      pitches: stats.pitching.pitches,
    };
  }

  return { base: newBase, batting: newBatting, pitching: newPitching };
}

// ============================================================
// 公開 API
// ============================================================

/**
 * Tier 2 (Standard) の1日分バッチ成長。
 * 1選手あたり1回の計算で全能力を更新する。
 *
 * @param player          対象選手
 * @param currentYear     現在の年度（学年計算に使用）
 * @param emphasis        コーチの練習重点
 * @param seasonMultiplier 季節倍率（合宿中は 1.5）
 * @param rng             乱数生成器
 */
export function applyBatchGrowth(
  player: Player,
  currentYear: number,
  emphasis: CoachStyle['practiceEmphasis'],
  seasonMultiplier: number,
  rng: RNG,
): Player {
  // 怪我中の選手は成長しない
  if (player.condition.injury !== null) {
    return player;
  }

  const grade = computeGrade(player, currentYear);
  const gradeMult = gradeMultiplier(grade, player.potential.growthType);
  const dailyGain = player.potential.growthRate * gradeMult * seasonMultiplier * BATCH_BASE_MULTIPLIER;

  const weights = EMPHASIS_WEIGHTS[emphasis];
  const newStats = applyGainToStats(
    player.stats,
    player.potential.ceiling,
    dailyGain,
    weights,
    rng,
  );

  return { ...player, stats: newStats };
}
