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
    // v0.37.0: direction はフェアなら 0-90、ファールなら -30〜-2 または 92〜120
    if (result.isFoul) {
      expect(
        (result.direction >= -30 && result.direction <= -2) ||
        (result.direction >= 92 && result.direction <= 120),
      ).toBe(true);
    } else {
      expect(result.direction).toBeGreaterThanOrEqual(0);
      expect(result.direction).toBeLessThanOrEqual(90);
    }
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

  it('フェア時は方向が 0-90 度、ファール時は -30〜-2 または 92〜120 の範囲内', () => {
    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`direction-range-${i}`);
      const result = generateBatContact(makeBatter(), fastball, centerZone, rng);
      if (result.isFoul) {
        expect(
          (result.direction >= -30 && result.direction <= -2) ||
          (result.direction >= 92 && result.direction <= 120),
        ).toBe(true);
      } else {
        expect(result.direction).toBeGreaterThanOrEqual(0);
        expect(result.direction).toBeLessThanOrEqual(90);
      }
    }
  });

  it('v0.37.0: 右打者はインコースで引っ張り方向（レフト寄り）', () => {
    const batter = makeBatter({ battingSide: 'right', technique: 80 });
    const innerZone: PitchLocation = { row: 2, col: 1 }; // インコース
    let leftPull = 0;
    for (let i = 0; i < 200; i++) {
      const rng = createRNG(`pull-right-${i}`);
      const r = generateBatContact(batter, fastball, innerZone, rng);
      if (!r.isFoul && r.direction < 45) leftPull++;
    }
    // 引っ張り方向 (direction < 45 = レフト側) が多めに出ることを期待
    expect(leftPull).toBeGreaterThan(100);
  });

  it('v0.37.0: 左打者はインコースで引っ張り方向（ライト寄り）', () => {
    const batter = makeBatter({ battingSide: 'left', technique: 80 });
    const innerZone: PitchLocation = { row: 2, col: 1 }; // 左打者にとってのインコース
    let rightPull = 0;
    for (let i = 0; i < 200; i++) {
      const rng = createRNG(`pull-left-${i}`);
      const r = generateBatContact(batter, fastball, innerZone, rng);
      if (!r.isFoul && r.direction > 45) rightPull++;
    }
    expect(rightPull).toBeGreaterThan(100);
  });

  it('v0.37.0: アウトコースの速球は流し方向に行きやすい（右打者）', () => {
    const batter = makeBatter({ battingSide: 'right', technique: 60 });
    const outerZone: PitchLocation = { row: 2, col: 3 };
    let pushOpp = 0;
    for (let i = 0; i < 200; i++) {
      const rng = createRNG(`push-right-${i}`);
      const r = generateBatContact(batter, fastball, outerZone, rng);
      if (!r.isFoul && r.direction > 50) pushOpp++;
    }
    // 流し方向（direction > 50 = ライト側）が多めに出る
    expect(pushOpp).toBeGreaterThan(80);
  });

  it('v0.37.0: チェンジアップで詰まりやすい（早打ち）', () => {
    // 早打ちが増えると isFoul が出やすい＋direction が引っ張りに偏る
    const batter = makeBatter();
    const slowPitch: PitchSelection = { type: 'changeup', velocity: 100, breakLevel: 3 };
    let earlyCount = 0;
    let totalFoul = 0;
    for (let i = 0; i < 300; i++) {
      const rng = createRNG(`changeup-${i}`);
      const r = generateBatContact(batter, slowPitch, centerZone, rng);
      if (r.isFoul) totalFoul++;
      // 右打者で direction < 30 (引っ張り) かつ weak/normal → 早打ち疑い
      if (!r.isFoul && r.direction < 30 && (r.speed === 'weak' || r.speed === 'normal')) {
        earlyCount++;
      }
    }
    // 少なくとも何件かは早打ちサイン (方向偏り) が出る
    expect(earlyCount + totalFoul).toBeGreaterThan(30);
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
