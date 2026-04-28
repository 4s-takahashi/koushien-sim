/**
 * Phase R2-1: SwingLatentState (Step A) 単体テスト（V3 §4.3）
 *
 * 25 入力 → 中間潜在量 5 軸 への変換が独立にチューニング可能で、
 * 各軸が期待通りの入力に反応するかを検証。
 */

import { describe, it, expect } from 'vitest';
import {
  computeSwingLatentState,
  computeContactQuality,
  computeTimingWindow,
  computeSwingIntent,
  computeDecisionPressure,
  computeBarrelRate,
} from '../../../../src/engine/physics/bat-ball/latent-state';
import { createRNG } from '../../../../src/engine/core/rng';
import type { BatBallContext, BatterParams, PitcherParams } from '../../../../src/engine/physics/types';

function makeBatter(overrides: Partial<BatterParams> = {}): BatterParams {
  return {
    contact: 50,
    power: 50,
    eye: 50,
    technique: 50,
    speed: 50,
    mental: 50,
    focus: 50,
    battingSide: 'right',
    confidence: 50,
    mood: 'normal',
    ...overrides,
  };
}

function makePitcher(overrides: Partial<PitcherParams> = {}): PitcherParams {
  return {
    velocity: 130,
    control: 50,
    pitchStamina: 80,
    pitches: { fastball: 80 },
    mental: 50,
    focus: 50,
    pitchCountInGame: 0,
    stamina: 80,
    mood: 'normal',
    confidence: 50,
    ...overrides,
  };
}

function makeContext(overrides: Partial<BatBallContext> = {}): BatBallContext {
  return {
    pitcher: makePitcher(),
    perceivedPitch: {
      perceivedVelocity: 140,
      velocityChangeImpact: 0,
      breakSharpness: 0.1,
      lateMovement: 0.1,
      difficulty: 0.2,
    },
    pitchVelocity: 140,
    pitchType: 'fastball',
    pitchBreakLevel: 1,
    pitchActualLocation: { row: 2, col: 2 },
    batter: makeBatter(),
    batterSwingType: 'spray',
    timingError: 0,
    ballOnBat: 1.0,
    previousPitchVelocity: null,
    count: { balls: 0, strikes: 0 },
    inning: 5,
    scoreDiff: 0,
    outs: 0,
    bases: { first: null, second: null, third: null },
    isKeyMoment: false,
    orderFocusArea: 'none',
    orderAggressiveness: 'normal',
    batterTraits: [],
    batterMood: 0,
    ...overrides,
  };
}

describe('computeSwingLatentState (V3 §4 Step A)', () => {
  it('5 軸すべて返す', () => {
    const rng = createRNG('latent-test');
    const result = computeSwingLatentState(makeContext(), rng);
    expect(result).toHaveProperty('contactQuality');
    expect(result).toHaveProperty('timingWindow');
    expect(result).toHaveProperty('swingIntent');
    expect(result).toHaveProperty('decisionPressure');
    expect(result).toHaveProperty('barrelRate');
  });

  it('決定論的: 同じ seed なら同じ結果', () => {
    const rng1 = createRNG('latent-deterministic');
    const rng2 = createRNG('latent-deterministic');
    const r1 = computeSwingLatentState(makeContext(), rng1);
    const r2 = computeSwingLatentState(makeContext(), rng2);
    expect(r1).toEqual(r2);
  });
});

describe('contactQuality (V3 §4.3)', () => {
  it('値域: 0-1', () => {
    const rng = createRNG('cq-range');
    for (let i = 0; i < 10; i++) {
      const v = computeContactQuality(makeContext(), rng);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('contact stat が高いほど contactQuality が高い (期待値)', () => {
    let lowSum = 0;
    let highSum = 0;
    for (let i = 0; i < 50; i++) {
      const rngLow = createRNG(`cq-low-${i}`);
      const rngHigh = createRNG(`cq-high-${i}`);
      lowSum += computeContactQuality(makeContext({ batter: makeBatter({ contact: 20 }) }), rngLow);
      highSum += computeContactQuality(makeContext({ batter: makeBatter({ contact: 95 }) }), rngHigh);
    }
    expect(highSum / 50).toBeGreaterThan(lowSum / 50);
  });

  it('timingError が大きいほど contactQuality が低い (期待値)', () => {
    let perfectSum = 0;
    let offSum = 0;
    for (let i = 0; i < 50; i++) {
      const rng1 = createRNG(`cq-pf-${i}`);
      const rng2 = createRNG(`cq-off-${i}`);
      perfectSum += computeContactQuality(makeContext({ timingError: 0 }), rng1);
      offSum += computeContactQuality(makeContext({ timingError: 100 }), rng2);
    }
    expect(perfectSum / 50).toBeGreaterThan(offSum / 50);
  });

  it('difficulty が高いほど contactQuality が低い (期待値)', () => {
    let easySum = 0;
    let hardSum = 0;
    for (let i = 0; i < 50; i++) {
      const rngE = createRNG(`cq-easy-${i}`);
      const rngH = createRNG(`cq-hard-${i}`);
      easySum += computeContactQuality(
        makeContext({ perceivedPitch: { perceivedVelocity: 130, velocityChangeImpact: 0, breakSharpness: 0, lateMovement: 0, difficulty: 0 } }),
        rngE,
      );
      hardSum += computeContactQuality(
        makeContext({ perceivedPitch: { perceivedVelocity: 130, velocityChangeImpact: 1, breakSharpness: 0.9, lateMovement: 0.9, difficulty: 0.9 } }),
        rngH,
      );
    }
    expect(easySum / 50).toBeGreaterThan(hardSum / 50);
  });
});

describe('timingWindow (V3 §4.3)', () => {
  it('値域: -1〜+1', () => {
    const rng = createRNG('tw-range');
    for (let i = 0; i < 10; i++) {
      const v = computeTimingWindow(makeContext(), rng);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('timingError=0 なら期待値 0 付近', () => {
    let sum = 0;
    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`tw-zero-${i}`);
      sum += computeTimingWindow(makeContext({ timingError: 0 }), rng);
    }
    expect(Math.abs(sum / 100)).toBeLessThan(0.1);
  });

  it('timingError=+50 なら正の値が期待値', () => {
    let sum = 0;
    for (let i = 0; i < 50; i++) {
      const rng = createRNG(`tw-pos-${i}`);
      sum += computeTimingWindow(makeContext({ timingError: 50 }), rng);
    }
    expect(sum / 50).toBeGreaterThan(0.2);
  });

  it('contact 高い打者は揺れが小さい', () => {
    const computeStdDev = (contact: number): number => {
      const values: number[] = [];
      for (let i = 0; i < 500; i++) {
        const rng = createRNG(`tw-stddev-${contact}-${i}`);
        values.push(computeTimingWindow(makeContext({
          batter: makeBatter({ contact }),
          // 揺れを最大化する難球で contact による減衰効果を顕著に
          perceivedPitch: { perceivedVelocity: 140, velocityChangeImpact: 1, breakSharpness: 0.9, lateMovement: 0.9, difficulty: 0.5 },
        }), rng));
      }
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    };
    // contact=99 と contact=10 で揺れに差があるはず（ノイズ係数 0.5x vs 0.95x）
    expect(computeStdDev(99)).toBeLessThan(computeStdDev(10));
  });
});

describe('swingIntent (V3 §4.3)', () => {
  it('値域: -1〜+1', () => {
    const v = computeSwingIntent(makeContext({ batterSwingType: 'pull' }));
    expect(v).toBeGreaterThanOrEqual(-1);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('swingType=pull は + 寄り (引っ張り)', () => {
    const v = computeSwingIntent(makeContext({ batterSwingType: 'pull' }));
    expect(v).toBeGreaterThan(0);
  });

  it('swingType=opposite は - 寄り (流し)', () => {
    const v = computeSwingIntent(makeContext({ batterSwingType: 'opposite' }));
    expect(v).toBeLessThan(0);
  });

  it('左打者は方向反転（pull でも -）', () => {
    const right = computeSwingIntent(makeContext({
      batterSwingType: 'pull',
      batter: makeBatter({ battingSide: 'right' }),
    }));
    const left = computeSwingIntent(makeContext({
      batterSwingType: 'pull',
      batter: makeBatter({ battingSide: 'left' }),
    }));
    // 右の値と左の値は逆符号
    expect(Math.sign(right) * Math.sign(left)).toBe(-1);
  });

  it('2 ストライクで意図が中央寄せ (絶対値が縮小)', () => {
    const noStrikes = computeSwingIntent(makeContext({
      batterSwingType: 'pull',
      count: { balls: 0, strikes: 0 },
    }));
    const twoStrikes = computeSwingIntent(makeContext({
      batterSwingType: 'pull',
      count: { balls: 0, strikes: 2 },
    }));
    expect(Math.abs(twoStrikes)).toBeLessThan(Math.abs(noStrikes));
  });

  it('orderFocusArea=inside は引っ張り側に補正', () => {
    const none = computeSwingIntent(makeContext({ batterSwingType: 'spray', orderFocusArea: 'none' }));
    const inside = computeSwingIntent(makeContext({ batterSwingType: 'spray', orderFocusArea: 'inside' }));
    expect(inside).toBeGreaterThan(none);
  });
});

describe('decisionPressure (V3 §4.3)', () => {
  it('値域: 0-1', () => {
    const v = computeDecisionPressure(makeContext());
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('isKeyMoment=true でプレッシャー上昇', () => {
    const calm = computeDecisionPressure(makeContext({ isKeyMoment: false }));
    const key = computeDecisionPressure(makeContext({ isKeyMoment: true }));
    expect(key).toBeGreaterThan(calm);
  });

  it('得点圏ランナーありでプレッシャー上昇', () => {
    const empty = computeDecisionPressure(makeContext());
    const scoring = computeDecisionPressure(makeContext({
      bases: { first: null, second: { playerId: 'r1', speed: 50 }, third: null },
    }));
    expect(scoring).toBeGreaterThan(empty);
  });

  it('mental が高いとプレッシャー軽減', () => {
    const weak = computeDecisionPressure(makeContext({
      isKeyMoment: true,
      batter: makeBatter({ mental: 10 }),
    }));
    const strong = computeDecisionPressure(makeContext({
      isKeyMoment: true,
      batter: makeBatter({ mental: 99 }),
    }));
    expect(strong).toBeLessThan(weak);
  });

  it('mood が悪い (-1) とプレッシャー上昇', () => {
    const good = computeDecisionPressure(makeContext({ batterMood: 1 }));
    const bad = computeDecisionPressure(makeContext({ batterMood: -1 }));
    expect(bad).toBeGreaterThan(good);
  });
});

describe('barrelRate (V3 §4.3)', () => {
  it('値域: 0-1', () => {
    const v = computeBarrelRate(0.5, 0, makeContext());
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('contactQuality 高 + power 高 + ジャストタイミングで barrel 高', () => {
    const v = computeBarrelRate(0.95, 0, makeContext({ batter: makeBatter({ power: 99 }) }));
    expect(v).toBeGreaterThan(0.7);
  });

  it('contactQuality 低では barrel 低', () => {
    const v = computeBarrelRate(0.1, 0, makeContext({ batter: makeBatter({ power: 99 }) }));
    expect(v).toBeLessThan(0.2);
  });

  it('timingWindow が ±1 の極端だと barrel 低下 (centerness 効果)', () => {
    const center = computeBarrelRate(0.8, 0, makeContext({ batter: makeBatter({ power: 60 }) }));
    const off = computeBarrelRate(0.8, 1, makeContext({ batter: makeBatter({ power: 60 }) }));
    expect(off).toBeLessThan(center);
  });
});

describe('独立性 — 各潜在量が独立にチューニング可能 (V3 §4.5)', () => {
  it('contact stat の変化が contactQuality 期待値に影響、swingIntent には影響しない', () => {
    // 平均で比較（ノイズあり）
    const meanCQ = (contact: number): number => {
      let sum = 0;
      for (let i = 0; i < 100; i++) {
        sum += computeContactQuality(
          makeContext({ batter: makeBatter({ contact }) }),
          createRNG(`indep-cq-${contact}-${i}`),
        );
      }
      return sum / 100;
    };
    const cqLow = meanCQ(10);
    const cqHigh = meanCQ(99);
    expect(cqHigh - cqLow).toBeGreaterThan(0.05);

    // swingIntent はノイズなしの純関数なので等値判定
    const intentLow = computeSwingIntent(makeContext({ batter: makeBatter({ contact: 10 }) }));
    const intentHigh = computeSwingIntent(makeContext({ batter: makeBatter({ contact: 99 }) }));
    expect(intentLow).toBe(intentHigh);
  });

  it('swingType の変化が swingIntent に影響、contactQuality には影響しない（同 RNG seed なら）', () => {
    const rngA = createRNG('indep-st-1');
    const rngB = createRNG('indep-st-1');
    const pullCtx = makeContext({ batterSwingType: 'pull' });
    const oppCtx = makeContext({ batterSwingType: 'opposite' });

    expect(computeContactQuality(pullCtx, rngA)).toEqual(computeContactQuality(oppCtx, rngB));
    expect(computeSwingIntent(pullCtx)).not.toEqual(computeSwingIntent(oppCtx));
  });
});
