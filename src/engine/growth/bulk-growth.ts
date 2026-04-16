/**
 * bulk-growth — Tier 3 (Minimal) 用週次バッチ成長計算
 *
 * 日曜日（週1回）にチーム全体の全選手を一括更新する。
 * 計算式:
 *   weeklyGain = growthRate × gradeMultiplier × seasonMultiplier × 2.0
 *   各能力 += weeklyGain × emphasisWeight × random(0.7, 1.3)
 *
 * 統計的に Tier 1 の7日分と近似するよう係数を調整済み。
 */

import type { Player, PlayerStats, Grade, GrowthType } from '../types/player';
import type { RNG } from '../core/rng';
import type { CoachStyle } from '../world/person-blueprint';
import { ceilingPenalty } from '../world/growth-curve';
import { GROWTH_CONSTANTS } from './constants';

// ============================================================
// 定数
// ============================================================

const BULK_BASE_MULTIPLIER = 2.0;

/** practiceEmphasis に応じた能力別重みテーブル（batch-growth と同一） */
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

function applyWeeklyGainToStats(
  stats: PlayerStats,
  ceiling: PlayerStats,
  weeklyGain: number,
  weights: { batting: number; pitching: number; base: number },
  rng: RNG,
): PlayerStats {
  const c = GROWTH_CONSTANTS;

  function randomVar(): number {
    return 0.7 + rng.next() * 0.6; // random(0.7, 1.3)
  }

  function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }

  function gain(current: number, ceil: number, weight: number): number {
    return weeklyGain * weight * ceilingPenalty(current, ceil) * randomVar();
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
 * Tier 3 (Minimal) の週次一括成長。
 * チーム全選手を一度に処理する。
 *
 * @param players         対象選手リスト
 * @param currentYear     現在の年度（学年計算に使用）
 * @param emphasis        コーチの練習重点
 * @param seasonMultiplier 季節倍率（合宿中は 1.5）
 * @param rng             乱数生成器
 */
export function applyBulkGrowth(
  players: Player[],
  currentYear: number,
  emphasis: CoachStyle['practiceEmphasis'],
  seasonMultiplier: number,
  rng: RNG,
): Player[] {
  const weights = EMPHASIS_WEIGHTS[emphasis];

  return players.map((player) => {
    // 怪我中の選手は成長しない
    if (player.condition.injury !== null) {
      return player;
    }

    const grade = computeGrade(player, currentYear);
    const gradeMult = gradeMultiplier(grade, player.potential.growthType);
    const weeklyGain = player.potential.growthRate * gradeMult * seasonMultiplier * BULK_BASE_MULTIPLIER;

    const playerRng = rng.derive(player.id);
    const newStats = applyWeeklyGainToStats(
      player.stats,
      player.potential.ceiling,
      weeklyGain,
      weights,
      playerRng,
    );

    return { ...player, stats: newStats };
  });
}
