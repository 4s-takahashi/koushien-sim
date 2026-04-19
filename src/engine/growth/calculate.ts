import type { Player, PlayerStats, Mood, Grade, GrowthType, TraitId } from '../types/player';
import type { PracticeMenu, StatTarget } from '../types/calendar';
import type { RNG } from '../core/rng';
import { GROWTH_CONSTANTS } from './constants';
import { ceilingPenalty as sharedCeilingPenalty, getMoodMultiplier } from '../shared/stat-utils';
import { getMotivation, getPracticeEfficiencyMultiplier } from './motivation';

export interface GrowthModifiers {
  growthRate: number;
  growthType: GrowthType;
  grade: Grade;
  mood: Mood;
  fatigue: number;
  motivation: number;
  traits: TraitId[];
  seasonMultiplier: number;
}

function gradeMultiplier(grade: Grade, growthType: GrowthType): number {
  const table: Record<GrowthType, [number, number, number]> = {
    early:  [1.5, 1.0, 0.6],
    normal: [1.0, 1.1, 0.9],
    late:   [0.6, 1.0, 1.4],
    genius: [1.2, 1.2, 1.0],
  };
  return table[growthType][grade - 1];
}

function moodMultiplier(mood: Mood): number {
  return getMoodMultiplier(mood);
}

function fatigueMultiplier(fatigue: number): number {
  if (fatigue < 30) return 1.0;
  if (fatigue < 60) return 0.9;
  if (fatigue < 80) return 0.7;
  return 0.4;
}

function traitMultiplier(traits: TraitId[]): number {
  let mult = 1.0;
  if (traits.includes('hard_worker')) mult *= 1.15;
  if (traits.includes('natural_talent')) mult *= 0.95;
  if (traits.includes('slacker')) {
    mult *= 0.8;
    // Additional penalty if slacker is in poor mood (handled separately via mood mult)
  }
  return mult;
}

function ceilingPenalty(current: number, ceiling: number): number {
  return sharedCeilingPenalty(current, ceiling);
}

/** Get current stat value by target path */
function getStatValue(stats: PlayerStats, target: StatTarget): number {
  const parts = target.split('.');
  if (parts[0] === 'base') {
    return stats.base[parts[1] as keyof typeof stats.base];
  }
  if (parts[0] === 'batting') {
    return stats.batting[parts[1] as keyof typeof stats.batting];
  }
  if (parts[0] === 'pitching' && stats.pitching) {
    return stats.pitching[parts[1] as keyof Pick<typeof stats.pitching, 'velocity' | 'control' | 'pitchStamina'>] ?? 0;
  }
  return 0;
}

/** Get ceiling value by target path */
function getCeilingValue(ceiling: PlayerStats, target: StatTarget): number {
  return getStatValue(ceiling, target);
}

/** Apply stat delta to PlayerStats, returning new PlayerStats */
function applyStatDelta(stats: PlayerStats, target: StatTarget, delta: number): PlayerStats {
  const parts = target.split('.');
  if (parts[0] === 'base') {
    return {
      ...stats,
      base: { ...stats.base, [parts[1]]: stats.base[parts[1] as keyof typeof stats.base] + delta },
    };
  }
  if (parts[0] === 'batting') {
    return {
      ...stats,
      batting: { ...stats.batting, [parts[1]]: stats.batting[parts[1] as keyof typeof stats.batting] + delta },
    };
  }
  if (parts[0] === 'pitching' && stats.pitching) {
    return {
      ...stats,
      pitching: {
        ...stats.pitching,
        [parts[1]]: (stats.pitching[parts[1] as keyof Pick<typeof stats.pitching, 'velocity' | 'control' | 'pitchStamina'>] ?? 0) + delta,
      },
    };
  }
  return stats;
}

export function calculateStatGain(
  current: number,
  ceiling: number,
  baseGain: number,
  modifiers: GrowthModifiers,
  rng: RNG
): number {
  const variance = GROWTH_CONSTANTS.RANDOM_VARIANCE_MIN +
    rng.next() * (GROWTH_CONSTANTS.RANDOM_VARIANCE_MAX - GROWTH_CONSTANTS.RANDOM_VARIANCE_MIN);

  const gain = baseGain
    * modifiers.growthRate
    * gradeMultiplier(modifiers.grade, modifiers.growthType)
    * moodMultiplier(modifiers.mood)
    * fatigueMultiplier(modifiers.fatigue)
    * traitMultiplier(modifiers.traits)
    * modifiers.seasonMultiplier
    * ceilingPenalty(current, ceiling)
    * variance;

  return gain;
}

export function clampStats(stats: PlayerStats): PlayerStats {
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
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
    pitching: stats.pitching ? {
      velocity: clamp(stats.pitching.velocity, c.VELOCITY_MIN, c.VELOCITY_MAX),
      control: clamp(stats.pitching.control, c.STAT_MIN, c.STAT_MAX),
      pitchStamina: clamp(stats.pitching.pitchStamina, c.STAT_MIN, c.STAT_MAX),
      pitches: Object.fromEntries(
        Object.entries(stats.pitching.pitches).map(([k, v]) => [k, clamp(v ?? 1, c.PITCH_LEVEL_MIN, c.PITCH_LEVEL_MAX)])
      ),
    } : null,
  };
}

/** Apply 1 day of practice growth to a player */
export function applyDailyGrowth(player: Player, menu: PracticeMenu, rng: RNG, seasonMultiplier: number = 1.0): { player: Player; statChanges: { target: StatTarget; delta: number }[] } {
  const grade = Math.min(3, Math.max(1, (new Date().getFullYear() - player.enrollmentYear + 1))) as Grade;

  // Compute actual grade from enrollmentYear and context - but since we don't have currentYear here,
  // we'll use a helper approach: grade is stored implicitly by enrollmentYear
  // For now, calculate based on the player's mentalState (which is updated elsewhere)
  // We'll pass currentYear through the seasonMultiplier context

  // モチベーション補正 (Phase 11-A3 2026-04-19): ±20% on growth rate
  const motivationMult = getPracticeEfficiencyMultiplier(getMotivation(player));

  const modifiers: GrowthModifiers = {
    growthRate: player.potential.growthRate,
    growthType: player.potential.growthType,
    grade: grade as Grade,
    mood: player.condition.mood,
    fatigue: player.condition.fatigue,
    motivation: player.mentalState.confidence,
    traits: player.traits,
    seasonMultiplier: seasonMultiplier * motivationMult,
  };

  let newStats = { ...player.stats };
  const statChanges: { target: StatTarget; delta: number }[] = [];

  for (const effect of menu.statEffects) {
    // Skip pitching effects for non-pitchers
    if (effect.target.startsWith('pitching.') && !player.stats.pitching) continue;

    const current = getStatValue(newStats, effect.target);
    const ceiling = getCeilingValue(player.potential.ceiling, effect.target);

    const gain = calculateStatGain(current, ceiling, effect.baseGain, modifiers, rng);

    if (gain > 0.001) {
      newStats = applyStatDelta(newStats, effect.target, gain);
      statChanges.push({ target: effect.target, delta: gain });
    }
  }

  newStats = clampStats(newStats);

  return {
    player: { ...player, stats: newStats },
    statChanges,
  };
}
