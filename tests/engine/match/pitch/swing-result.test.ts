import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { calculateSwingResult } from '@/engine/match/pitch/swing-result';
import type { BatterParams, Count, PitchLocation, PitchSelection } from '@/engine/match/types';

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
const edgeZone: PitchLocation = { row: 1, col: 1 };
const outsideZone: PitchLocation = { row: 0, col: 0 };
const fastball: PitchSelection = { type: 'fastball', velocity: 130 };
const hotFork: PitchSelection = { type: 'fork', velocity: 120, breakLevel: 7 };
const zeroCount: Count = { balls: 0, strikes: 0 };
const twoStrikes: Count = { balls: 0, strikes: 2 };

describe('calculateSwingResult', () => {
  it('contact高ければ接触率が高い（空振り少ない）', () => {
    const batter = makeBatter({ contact: 100 });
    let strikeCount = 0;
    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`contact100-${i}`);
      const result = calculateSwingResult(batter, fastball, centerZone, zeroCount, rng);
      if (result.outcome === 'swinging_strike') strikeCount++;
    }
    // contact=100 で空振り少なめ（20%以下期待）
    expect(strikeCount).toBeLessThan(25);
  });

  it('contact低ければ空振り率が高い', () => {
    const batter = makeBatter({ contact: 10 });
    let strikeCount = 0;
    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`contact10-${i}`);
      const result = calculateSwingResult(batter, fastball, centerZone, zeroCount, rng);
      if (result.outcome === 'swinging_strike') strikeCount++;
    }
    expect(strikeCount).toBeGreaterThan(40);
  });

  it('キレのある変化球（fork lv7）で空振り率UP', () => {
    const batter = makeBatter({ contact: 70 });
    let strikeWithFork = 0;
    let strikeWithFastball = 0;
    for (let i = 0; i < 100; i++) {
      const rng1 = createRNG(`fork-swing-${i}`);
      const rng2 = createRNG(`fb-swing-${i}`);
      const r1 = calculateSwingResult(batter, hotFork, centerZone, zeroCount, rng1);
      const r2 = calculateSwingResult(batter, fastball, centerZone, zeroCount, rng2);
      if (r1.outcome === 'swinging_strike') strikeWithFork++;
      if (r2.outcome === 'swinging_strike') strikeWithFastball++;
    }
    expect(strikeWithFork).toBeGreaterThan(strikeWithFastball);
  });

  it('2ストライクでファウル率UP（フェア打球減）', () => {
    const batter = makeBatter({ contact: 80, technique: 80 });
    let foulWith2S = 0;
    let foulWith0S = 0;
    for (let i = 0; i < 200; i++) {
      const rng1 = createRNG(`2s-foul-${i}`);
      const rng2 = createRNG(`0s-foul-${i}`);
      const r1 = calculateSwingResult(batter, fastball, centerZone, twoStrikes, rng1);
      const r2 = calculateSwingResult(batter, fastball, centerZone, zeroCount, rng2);
      if (r1.outcome === 'foul') foulWith2S++;
      if (r2.outcome === 'foul') foulWith0S++;
    }
    expect(foulWith2S).toBeGreaterThan(foulWith0S);
  });

  it('in_play の場合は batContact が付与される', () => {
    const batter = makeBatter({ contact: 100, technique: 100 });
    let foundInPlay = false;
    for (let i = 0; i < 200; i++) {
      const rng = createRNG(`in-play-check-${i}`);
      const result = calculateSwingResult(batter, fastball, centerZone, zeroCount, rng);
      if (result.outcome === 'in_play') {
        expect(result.contact).toBeDefined();
        expect(result.contact!.contactType).toBeDefined();
        expect(result.contact!.direction).toBeGreaterThanOrEqual(0);
        expect(result.contact!.direction).toBeLessThanOrEqual(90);
        foundInPlay = true;
        break;
      }
    }
    expect(foundInPlay).toBe(true);
  });

  it('ゾーン外の球は接触率が低い', () => {
    const batter = makeBatter({ contact: 80 });
    let strikeOutside = 0;
    let strikeCenter = 0;
    for (let i = 0; i < 100; i++) {
      const rng1 = createRNG(`outside-sw-${i}`);
      const rng2 = createRNG(`center-sw-${i}`);
      const r1 = calculateSwingResult(batter, fastball, outsideZone, zeroCount, rng1);
      const r2 = calculateSwingResult(batter, fastball, centerZone, zeroCount, rng2);
      if (r1.outcome === 'swinging_strike') strikeOutside++;
      if (r2.outcome === 'swinging_strike') strikeCenter++;
    }
    expect(strikeOutside).toBeGreaterThan(strikeCenter);
  });
});
