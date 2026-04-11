import type { Player, Mood, ConditionState, InjuryState } from '../types/player';
import type { RNG } from '../core/rng';
import { GROWTH_CONSTANTS } from './constants';

/** Update daily condition (morning phase) */
export function updateDailyCondition(player: Player, rng: RNG): ConditionState {
  const { condition, mentalState } = player;
  const fatigue = condition.fatigue;
  const confidence = mentalState.confidence;
  const flags = mentalState.flags;

  // Base mood weights: excellent:5%, good:25%, normal:45%, poor:20%, terrible:5%
  let weights = { excellent: 5, good: 25, normal: 45, poor: 20, terrible: 5 };

  // Adjust for fatigue
  if (fatigue > 70) {
    weights.excellent = Math.max(0, weights.excellent - 20);
    weights.good = Math.max(0, weights.good - 20);
    weights.poor += 20;
    weights.terrible += 20;
  }

  // Adjust for confidence
  if (confidence > 70) {
    weights.excellent += 10;
    weights.good += 10;
    weights.poor = Math.max(0, weights.poor - 10);
    weights.terrible = Math.max(0, weights.terrible - 10);
  }

  // Adjust for mental flags
  if (flags.includes('slump')) {
    weights.excellent = 0;
    weights.terrible += 15;
    weights.poor += 10;
    weights.good = Math.max(0, weights.good - 10);
    weights.normal = Math.max(0, weights.normal - 15);
  }

  if (flags.includes('in_the_zone')) {
    weights.excellent += 30;
    weights.good += 10;
    weights.poor = Math.max(0, weights.poor - 20);
    weights.terrible = Math.max(0, weights.terrible - 20);
    weights.normal = Math.max(0, weights.normal - 20);
  }

  // Pick mood based on weights
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const roll = rng.next() * total;

  let cumulative = 0;
  let mood: Mood = 'normal';
  for (const [m, w] of Object.entries(weights)) {
    cumulative += w;
    if (roll <= cumulative) {
      mood = m as Mood;
      break;
    }
  }

  return {
    ...condition,
    mood,
  };
}

/** Apply fatigue from training/game */
export function applyFatigue(condition: ConditionState, load: number): ConditionState {
  const newFatigue = Math.min(GROWTH_CONSTANTS.FATIGUE_MAX, Math.max(0, condition.fatigue + load));
  return { ...condition, fatigue: newFatigue };
}

/** Natural fatigue recovery */
export function recoverFatigue(condition: ConditionState, isRest: boolean): ConditionState {
  const recovery = isRest
    ? GROWTH_CONSTANTS.FATIGUE_REST_RECOVERY
    : GROWTH_CONSTANTS.FATIGUE_NATURAL_RECOVERY;

  // No recovery if injured
  if (condition.injury !== null) {
    return condition;
  }

  const newFatigue = Math.max(0, condition.fatigue - recovery);
  return { ...condition, fatigue: newFatigue };
}

/** Roll for injury */
export function rollInjury(player: Player, load: number, rng: RNG): InjuryState | null {
  // If already injured, no new injury
  if (player.condition.injury !== null) return null;

  const fatigue = player.condition.fatigue;
  const flags = player.mentalState.flags;

  let rate = GROWTH_CONSTANTS.INJURY_BASE_RATE;

  if (fatigue > 80) rate *= 3.0;
  else if (fatigue > 60) rate *= 1.5;

  if (flags.includes('injury_anxiety')) rate *= 1.5;

  if (!rng.chance(rate)) return null;

  // Determine severity: minor:70%, moderate:25%, severe:5%
  const sevRoll = rng.next();
  let severity: 'minor' | 'moderate' | 'severe';
  if (sevRoll < 0.70) severity = 'minor';
  else if (sevRoll < 0.95) severity = 'moderate';
  else severity = 'severe';

  const durations = GROWTH_CONSTANTS.INJURY_DURATION[severity];
  const remainingDays = rng.intBetween(durations.min, durations.max);

  const injuryTypes = {
    minor: ['筋肉疲労', '足首の捻挫', '肩の張り', '腰の張り'],
    moderate: ['肉離れ', '足首捻挫', '肩関節炎', '肘の痛み'],
    severe: ['骨折', '靭帯損傷', '手術が必要な怪我'],
  };

  return {
    type: rng.pick(injuryTypes[severity]),
    severity,
    remainingDays,
    startDate: { year: 0, month: 0, day: 0 }, // Will be set by caller
  };
}

/** Advance injury recovery by 1 day. Returns null if healed. */
export function advanceInjury(injury: InjuryState): InjuryState | null {
  const remaining = injury.remainingDays - 1;
  if (remaining <= 0) return null;
  return { ...injury, remainingDays: remaining };
}
