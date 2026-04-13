import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { generateBatContact } from '@/engine/match/pitch/bat-contact';
import type { BatterParams, PitchLocation, PitchSelection } from '@/engine/match/types';

function makeBatter(overrides: Partial<BatterParams> = {}): BatterParams {
  return {
    contact: 70,
    power: 60,
    eye: 70,
    technique: 60,
    speed: 60,
    mental: 60,
    focus: 60,
    battingSide: 'right',
    confidence: 50,
    mood: 'normal',
    ...overrides,
  };
}

const centerZone: PitchLocation = { row: 2, col: 2 };
const lowZone: PitchLocation = { row: 3, col: 2 };
const highZone: PitchLocation = { row: 1, col: 2 };
const fastball: PitchSelection = { type: 'fastball', velocity: 140 };

describe('generateBatContact', () => {
  it('返り値が必要なフィールドを持つ', () => {
    const rng = createRNG('bat-contact-basic');
    const result = generateBatContact(makeBatter(), fastball, centerZone, rng);
    expect(result.contactType).toBeDefined();
    expect(result.direction).toBeGreaterThanOrEqual(0);
    expect(result.direction).toBeLessThanOrEqual(90);
    expect(result.speed).toBeDefined();
    expect(result.distance).toBeGreaterThan(0);
  });

  it('パワーが高いほど fly_ball 率が上がる', () => {
    const highPower = makeBatter({ power: 100 });
    const lowPower = makeBatter({ power: 10 });
    let flyHigh = 0;
    let flyLow = 0;
    for (let i = 0; i < 200; i++) {
      const rng1 = createRNG(`power100-${i}`);
      const rng2 = createRNG(`power10-${i}`);
      const r1 = generateBatContact(highPower, fastball, centerZone, rng1);
      const r2 = generateBatContact(lowPower, fastball, centerZone, rng2);
      if (r1.contactType === 'fly_ball') flyHigh++;
      if (r2.contactType === 'fly_ball') flyLow++;
    }
    expect(flyHigh).toBeGreaterThan(flyLow);
  });

  it('低めの球は ground_ball 率が上がる', () => {
    const batter = makeBatter({ power: 50 });
    let groundLow = 0;
    let groundCenter = 0;
    for (let i = 0; i < 200; i++) {
      const rng1 = createRNG(`low-gb-${i}`);
      const rng2 = createRNG(`center-gb-${i}`);
      const r1 = generateBatContact(batter, fastball, lowZone, rng1);
      const r2 = generateBatContact(batter, fastball, centerZone, rng2);
      if (r1.contactType === 'ground_ball') groundLow++;
      if (r2.contactType === 'ground_ball') groundCenter++;
    }
    expect(groundLow).toBeGreaterThan(groundCenter);
  });

  it('高めの球は fly_ball 率が上がる', () => {
    const batter = makeBatter({ power: 50 });
    let flyHigh = 0;
    let flyCenter = 0;
    for (let i = 0; i < 200; i++) {
      const rng1 = createRNG(`high-fb-${i}`);
      const rng2 = createRNG(`center-fb-${i}`);
      const r1 = generateBatContact(batter, fastball, highZone, rng1);
      const r2 = generateBatContact(batter, fastball, centerZone, rng2);
      if (r1.contactType === 'fly_ball') flyHigh++;
      if (r2.contactType === 'fly_ball') flyCenter++;
    }
    expect(flyHigh).toBeGreaterThan(flyCenter);
  });

  it('方向は 0-90 度の範囲内', () => {
    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`direction-range-${i}`);
      const result = generateBatContact(makeBatter(), fastball, centerZone, rng);
      expect(result.direction).toBeGreaterThanOrEqual(0);
      expect(result.direction).toBeLessThanOrEqual(90);
    }
  });

  it('速度が 4 種のいずれかである', () => {
    const validSpeeds = new Set(['weak', 'normal', 'hard', 'bullet']);
    for (let i = 0; i < 50; i++) {
      const rng = createRNG(`speed-type-${i}`);
      const result = generateBatContact(makeBatter(), fastball, centerZone, rng);
      expect(validSpeeds.has(result.speed)).toBe(true);
    }
  });
});
