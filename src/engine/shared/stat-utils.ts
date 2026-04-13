import type { PlayerStats } from '../types/player';
import { GROWTH_CONSTANTS } from '../growth/constants';

/**
 * 能力値が天井に近づくほどペナルティを掛ける
 */
export function ceilingPenalty(current: number, ceiling: number): number {
  if (ceiling <= 0) return 0;
  const ratio = current / ceiling;
  if (ratio < 0.5) return 1.0;
  if (ratio < 0.8) return 1.0 - (ratio - 0.5) * 0.5;
  if (ratio < 0.95) return 0.3;
  return 0.05;
}

/**
 * 全能力値を有効範囲にクランプ
 */
export function clampStats(stats: PlayerStats): PlayerStats {
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));
  const c = GROWTH_CONSTANTS;

  return {
    base: {
      stamina: clamp(stats.base.stamina, c.STAT_MIN, c.STAT_MAX),
      speed: clamp(stats.base.speed, c.STAT_MIN, c.STAT_MAX),
      armStrength: clamp(stats.base.armStrength, c.STAT_MIN, c.STAT_MAX),
      fielding: clamp(stats.base.fielding, c.STAT_MIN, c.STAT_MAX),
      focus: clamp(stats.base.focus, c.STAT_MIN, c.STAT_MAX),
      mental: clamp(stats.base.mental, c.STAT_MIN, c.STAT_MAX),
    },
    batting: {
      contact: clamp(stats.batting.contact, c.STAT_MIN, c.STAT_MAX),
      power: clamp(stats.batting.power, c.STAT_MIN, c.STAT_MAX),
      eye: clamp(stats.batting.eye, c.STAT_MIN, c.STAT_MAX),
      technique: clamp(stats.batting.technique, c.STAT_MIN, c.STAT_MAX),
    },
    pitching: stats.pitching
      ? {
          velocity: clamp(
            stats.pitching.velocity,
            c.VELOCITY_MIN,
            c.VELOCITY_MAX
          ),
          control: clamp(stats.pitching.control, c.STAT_MIN, c.STAT_MAX),
          pitchStamina: clamp(
            stats.pitching.pitchStamina,
            c.STAT_MIN,
            c.STAT_MAX
          ),
          pitches: stats.pitching.pitches,
        }
      : null,
  };
}

/**
 * Mood倍率を取得
 */
export function getMoodMultiplier(mood: import('../types/player').Mood): number {
  switch (mood) {
    case 'excellent':
      return 1.15;
    case 'good':
      return 1.05;
    case 'normal':
      return 1.0;
    case 'poor':
      return 0.9;
    case 'terrible':
      return 0.75;
  }
}

/**
 * 自信レベルから倍率を取得 (0-100 → 0.85-1.15)
 */
export function getConfidenceMultiplier(confidence: number): number {
  return 0.85 + (confidence / 100) * 0.3;
}
