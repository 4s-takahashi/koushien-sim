import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { decideBatterAction } from '@/engine/match/pitch/batter-action';
import type { BatterParams, Count, PitchLocation, PitchSelection, TacticalOrder } from '@/engine/match/types';

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

const zoneLocation: PitchLocation = { row: 2, col: 2 }; // ストライクゾーン内
const ballLocation: PitchLocation = { row: 0, col: 0 }; // ボールゾーン
const fastball: PitchSelection = { type: 'fastball', velocity: 140 };
const forkball: PitchSelection = { type: 'fork', velocity: 125, breakLevel: 6 };
const noOrder: TacticalOrder = { type: 'none' };
const zeroCount: Count = { balls: 0, strikes: 0 };
const twoStrikes: Count = { balls: 0, strikes: 2 };

describe('decideBatterAction', () => {
  it('バント指示があれば必ず bunt を返す', () => {
    const rng = createRNG('bunt-test');
    const buntOrder: TacticalOrder = { type: 'bunt', playerId: 'p1' };
    const action = decideBatterAction(makeBatter(), fastball, zoneLocation, zeroCount, buntOrder, rng);
    expect(action).toBe('bunt');
  });

  it('ゾーン内を見逃した場合は take', () => {
    // contact=1 → 見逃し率が非常に高い
    const batter = makeBatter({ contact: 1 });
    let takeCount = 0;
    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`take-zone-${i}`);
      const action = decideBatterAction(batter, fastball, zoneLocation, { balls: 0, strikes: 0 }, noOrder, rng);
      if (action === 'take') takeCount++;
    }
    // contact=1、0ストライクでは見逃しが多い
    expect(takeCount).toBeGreaterThan(30);
  });

  it('ゾーン内を打つ場合は swing', () => {
    // contact=100 → ほぼ振る
    const batter = makeBatter({ contact: 100 });
    let swingCount = 0;
    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`swing-zone-${i}`);
      const action = decideBatterAction(batter, fastball, zoneLocation, twoStrikes, noOrder, rng);
      if (action === 'swing') swingCount++;
    }
    expect(swingCount).toBeGreaterThan(85);
  });

  it('ボール球を見極めやすい（eye=100）', () => {
    const batter = makeBatter({ eye: 100 });
    let takeCount = 0;
    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`eye-100-${i}`);
      const action = decideBatterAction(batter, fastball, ballLocation, zeroCount, noOrder, rng);
      if (action === 'take') takeCount++;
    }
    // eye=100: ボール球振る確率=0%
    expect(takeCount).toBe(100);
  });

  it('ボール球を振りやすい（eye=0）', () => {
    const batter = makeBatter({ eye: 0 });
    let swingCount = 0;
    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`eye-0-${i}`);
      const action = decideBatterAction(batter, fastball, ballLocation, zeroCount, noOrder, rng);
      if (action === 'swing') swingCount++;
    }
    // eye=0: ボール球振る確率=50%
    expect(swingCount).toBeGreaterThan(35);
    expect(swingCount).toBeLessThan(65);
  });

  it('追い込まれるとボール球を振りやすくなる', () => {
    const batter = makeBatter({ eye: 80 });
    let swingWith2S = 0;
    let swingWith0S = 0;
    for (let i = 0; i < 100; i++) {
      const rng1 = createRNG(`chase-2s-${i}`);
      const rng2 = createRNG(`chase-0s-${i}`);
      const action2S = decideBatterAction(batter, fastball, ballLocation, twoStrikes, noOrder, rng1);
      const action0S = decideBatterAction(batter, fastball, ballLocation, zeroCount, noOrder, rng2);
      if (action2S === 'swing') swingWith2S++;
      if (action0S === 'swing') swingWith0S++;
    }
    expect(swingWith2S).toBeGreaterThan(swingWith0S);
  });

  it('キレのある変化球はボール球を振りやすくする', () => {
    const batter = makeBatter({ eye: 80 });
    let swingFork = 0;
    let swingFastball = 0;
    for (let i = 0; i < 100; i++) {
      const rng1 = createRNG(`fork-chase-${i}`);
      const rng2 = createRNG(`fb-chase-${i}`);
      const actionFork = decideBatterAction(batter, forkball, ballLocation, zeroCount, noOrder, rng1);
      const actionFB = decideBatterAction(batter, fastball, ballLocation, zeroCount, noOrder, rng2);
      if (actionFork === 'swing') swingFork++;
      if (actionFB === 'swing') swingFastball++;
    }
    expect(swingFork).toBeGreaterThan(swingFastball);
  });
});
