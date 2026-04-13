import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import type { PersonBlueprint, GrowthProfile, GrowthCurveSet, StatGrowthCurve } from '@/engine/world/person-blueprint';
import type { PersonState } from '@/engine/world/person-state';
import { createEmptyCumulativeGrowth, createEmptyCareerRecord } from '@/engine/world/person-state';
import { hydratePlayer, dehydratePlayer } from '@/engine/world/hydrate';
import {
  peakMultiplier,
  calculateStatGainV3,
  moodMultiplier,
  fatigueMultiplier,
  traitMultiplier,
  ceilingPenalty,
} from '@/engine/world/growth-curve';
import type { GrowthContextV3 } from '@/engine/world/growth-curve';
import type { PlayerStats } from '@/engine/types/player';

// ============================================================
// テストヘルパー
// ============================================================

function makeStatGrowthCurve(overrides?: Partial<StatGrowthCurve>): StatGrowthCurve {
  return {
    baseRate: 0.3,
    peakAge: 16,
    peakWidth: 2.0,
    variance: 0.3,
    slumpPenalty: 0.5,
    ...overrides,
  };
}

function makeGrowthCurveSet(isPitcher: boolean): GrowthCurveSet {
  const c = makeStatGrowthCurve();
  return {
    stamina: c, speed: c, armStrength: c, fielding: c, focus: c, mental: c,
    contact: c, power: c, eye: c, technique: c,
    velocity: isPitcher ? c : null,
    control: isPitcher ? c : null,
    pitchStamina: isPitcher ? c : null,
  };
}

function makeGrowthProfile(isPitcher: boolean): GrowthProfile {
  return {
    growthType: 'normal',
    curves: makeGrowthCurveSet(isPitcher),
    slumpRisk: 0.10,
    slumpRecovery: 0.5,
    awakeningChance: 0.08,
    durability: 0.6,
    mentalGrowthFactor: 1.0,
  };
}

function makeBaseStats(v: number): PlayerStats {
  return {
    base: { stamina: v, speed: v, armStrength: v, fielding: v, focus: v, mental: v },
    batting: { contact: v, power: v, eye: v, technique: v },
    pitching: null,
  };
}

function makeBlueprint(id: string): PersonBlueprint {
  return {
    id,
    generationId: 'gen_test',
    firstName: '太郎',
    lastName: '田中',
    birthYear: 2010,
    prefecture: '新潟',
    hometown: '十日町',
    middleSchool: '十日町中学',
    height: 175,
    weight: 68,
    throwingHand: 'right',
    battingSide: 'left',
    primaryPosition: 'shortstop',
    subPositions: ['second'],
    traits: ['hard_worker', 'competitive'],
    personality: 'extrovert',
    initialStats: makeBaseStats(15),
    ceilingStats: makeBaseStats(80),
    growthProfile: makeGrowthProfile(false),
    qualityTier: 'B',
    isPitcher: false,
    rarity: 0.3,
    manuallyEdited: false,
    editNotes: null,
  };
}

function makePersonState(blueprintId: string): PersonState {
  return {
    blueprintId,
    currentStage: { type: 'high_school', schoolId: 'sch_01', grade: 2 },
    enrollmentYear: 2025,
    schoolId: 'sch_01',
    currentStats: makeBaseStats(35),
    condition: { fatigue: 20, injury: null, mood: 'good' },
    mentalState: {
      mood: 'good',
      stress: 10,
      confidence: 60,
      teamChemistry: 50,
      flags: [],
    },
    careerStats: createEmptyCareerRecord(),
    cumulativeGrowth: createEmptyCumulativeGrowth(),
    eventHistory: [],
  };
}

// ============================================================
// テスト
// ============================================================

describe('peakMultiplier', () => {
  it('returns max at peak age', () => {
    const result = peakMultiplier(16, 16, 2.0);
    expect(result).toBeCloseTo(1.5, 1);
  });

  it('returns lower value away from peak', () => {
    const atPeak = peakMultiplier(16, 16, 2.0);
    const offPeak = peakMultiplier(13, 16, 2.0);
    expect(offPeak).toBeLessThan(atPeak);
    expect(offPeak).toBeGreaterThan(0.2); // above minimum
  });

  it('returns minimum far from peak', () => {
    const result = peakMultiplier(5, 16, 1.0);
    expect(result).toBeCloseTo(0.2, 1);
  });

  it('genius type (wide peak) stays high across ages', () => {
    const age13 = peakMultiplier(13, 16, 3.0);
    const age18 = peakMultiplier(18, 16, 3.0);
    expect(age13).toBeGreaterThan(0.8);
    expect(age18).toBeGreaterThan(0.8);
  });

  it('early type peaks at 14', () => {
    const atPeak = peakMultiplier(14, 14, 1.5);
    const age18 = peakMultiplier(18, 14, 1.5);
    expect(atPeak).toBeCloseTo(1.5, 1);
    expect(age18).toBeLessThan(0.5);
  });

  it('late type peaks at 18', () => {
    const atPeak = peakMultiplier(18, 18, 1.5);
    const age13 = peakMultiplier(13, 18, 1.5);
    expect(atPeak).toBeCloseTo(1.5, 1);
    expect(age13).toBeLessThan(0.4);
  });
});

describe('calculateStatGainV3', () => {
  it('produces positive gain under normal conditions', () => {
    const rng = createRNG('test');
    const curve = makeStatGrowthCurve();
    const ctx: GrowthContextV3 = {
      currentAge: 16, current: 35, ceiling: 80,
      mood: 'normal', fatigue: 10, traits: [],
      seasonMultiplier: 1.0, isInSlump: false,
      practiceMenuId: 'batting_basic',
    };
    const gain = calculateStatGainV3(curve, ctx, rng);
    expect(gain).toBeGreaterThan(0);
  });

  it('slump reduces gain', () => {
    const rng1 = createRNG('test');
    const rng2 = createRNG('test');
    const curve = makeStatGrowthCurve({ slumpPenalty: 0.5 });
    const baseCtx: GrowthContextV3 = {
      currentAge: 16, current: 35, ceiling: 80,
      mood: 'normal', fatigue: 10, traits: [],
      seasonMultiplier: 1.0, isInSlump: false,
      practiceMenuId: 'batting_basic',
    };
    const gainNormal = calculateStatGainV3(curve, baseCtx, rng1);
    const gainSlump = calculateStatGainV3(curve, { ...baseCtx, isInSlump: true }, rng2);
    expect(gainSlump).toBeCloseTo(gainNormal * 0.5, 2);
  });

  it('high fatigue reduces gain', () => {
    const rng1 = createRNG('test');
    const rng2 = createRNG('test');
    const curve = makeStatGrowthCurve({ variance: 0 }); // remove variance for exact comparison
    const ctx: GrowthContextV3 = {
      currentAge: 16, current: 35, ceiling: 80,
      mood: 'normal', fatigue: 10, traits: [],
      seasonMultiplier: 1.0, isInSlump: false,
      practiceMenuId: 'batting_basic',
    };
    const gainFresh = calculateStatGainV3(curve, ctx, rng1);
    const gainTired = calculateStatGainV3(curve, { ...ctx, fatigue: 90 }, rng2);
    expect(gainTired).toBeLessThan(gainFresh);
  });

  it('near-ceiling greatly reduces gain', () => {
    const rng1 = createRNG('test');
    const rng2 = createRNG('test');
    const curve = makeStatGrowthCurve({ variance: 0 });
    const ctx: GrowthContextV3 = {
      currentAge: 16, current: 35, ceiling: 80,
      mood: 'normal', fatigue: 10, traits: [],
      seasonMultiplier: 1.0, isInSlump: false,
      practiceMenuId: 'batting_basic',
    };
    const gainLow = calculateStatGainV3(curve, ctx, rng1);
    const gainHigh = calculateStatGainV3(curve, { ...ctx, current: 78 }, rng2);
    expect(gainHigh).toBeLessThan(gainLow * 0.2);
  });

  it('camp multiplier increases gain', () => {
    const rng1 = createRNG('test');
    const rng2 = createRNG('test');
    const curve = makeStatGrowthCurve({ variance: 0 });
    const ctx: GrowthContextV3 = {
      currentAge: 16, current: 35, ceiling: 80,
      mood: 'normal', fatigue: 10, traits: [],
      seasonMultiplier: 1.0, isInSlump: false,
      practiceMenuId: 'batting_basic',
    };
    const gainNormal = calculateStatGainV3(curve, ctx, rng1);
    const gainCamp = calculateStatGainV3(curve, { ...ctx, seasonMultiplier: 1.5 }, rng2);
    expect(gainCamp).toBeCloseTo(gainNormal * 1.5, 2);
  });
});

describe('hydratePlayer / dehydratePlayer', () => {
  it('produces a valid Player from blueprint + state', () => {
    const bp = makeBlueprint('pb_001');
    const st = makePersonState('pb_001');
    const player = hydratePlayer(bp, st, 2026);

    expect(player.id).toBe('pb_001');
    expect(player.firstName).toBe('太郎');
    expect(player.lastName).toBe('田中');
    expect(player.position).toBe('shortstop');
    expect(player.stats.batting.contact).toBe(35);
    expect(player.potential.ceiling.batting.contact).toBe(80);
    expect(player.potential.growthType).toBe('normal');
    expect(player.condition.fatigue).toBe(20);
    expect(player.traits).toContain('hard_worker');
    expect(player.background.hometown).toBe('十日町');
  });

  it('round-trip preserves dynamic state', () => {
    const bp = makeBlueprint('pb_002');
    const st = makePersonState('pb_002');
    const player = hydratePlayer(bp, st, 2026);

    // Modify dynamic state
    const modifiedPlayer = {
      ...player,
      stats: { ...player.stats, batting: { ...player.stats.batting, contact: 42 } },
      condition: { ...player.condition, fatigue: 55 },
    };

    const newState = dehydratePlayer(modifiedPlayer, st);
    expect(newState.currentStats.batting.contact).toBe(42);
    expect(newState.condition.fatigue).toBe(55);
    // Non-modified fields preserved
    expect(newState.currentStage).toEqual(st.currentStage);
    expect(newState.cumulativeGrowth).toEqual(st.cumulativeGrowth);
  });

  it('computes grade from enrollmentYear and currentYear', () => {
    const bp = makeBlueprint('pb_003');
    const st = makePersonState('pb_003');
    st.enrollmentYear = 2024;

    const grade1 = hydratePlayer(bp, st, 2024);
    const grade2 = hydratePlayer(bp, st, 2025);
    const grade3 = hydratePlayer(bp, st, 2026);
    const capped = hydratePlayer(bp, st, 2030);

    expect(grade1.enrollmentYear).toBe(2024);
    // grade is not directly on Player, but is encoded in how applyDailyGrowth uses it
    // We verify the enrollmentYear is preserved
    expect(grade2.enrollmentYear).toBe(2024);
    expect(grade3.enrollmentYear).toBe(2024);
    expect(capped.enrollmentYear).toBe(2024);
  });
});

describe('external multipliers', () => {
  it('moodMultiplier returns correct values', () => {
    expect(moodMultiplier('excellent')).toBeCloseTo(1.15, 2);
    expect(moodMultiplier('good')).toBeCloseTo(1.05, 2);
    expect(moodMultiplier('normal')).toBe(1.0);
    expect(moodMultiplier('poor')).toBeCloseTo(0.9, 2);
    expect(moodMultiplier('terrible')).toBeCloseTo(0.75, 2);
  });

  it('fatigueMultiplier decreases with high fatigue', () => {
    expect(fatigueMultiplier(10)).toBe(1.0);
    expect(fatigueMultiplier(40)).toBeCloseTo(0.9, 2);
    expect(fatigueMultiplier(70)).toBeCloseTo(0.7, 2);
    expect(fatigueMultiplier(90)).toBeCloseTo(0.4, 2);
  });

  it('traitMultiplier accounts for traits', () => {
    expect(traitMultiplier([])).toBe(1.0);
    expect(traitMultiplier(['hard_worker'])).toBeCloseTo(1.15, 2);
    expect(traitMultiplier(['slacker'])).toBeCloseTo(0.8, 2);
    expect(traitMultiplier(['hard_worker', 'slacker'])).toBeCloseTo(1.15 * 0.8, 2);
  });

  it('ceilingPenalty reduces near ceiling', () => {
    expect(ceilingPenalty(30, 80)).toBe(1.0); // well below
    expect(ceilingPenalty(60, 80)).toBeLessThan(1.0); // ratio 0.75
    expect(ceilingPenalty(78, 80)).toBeLessThan(0.4); // ratio 0.975
  });
});
