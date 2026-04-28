/**
 * Phase R2-2: BallTrajectoryParams (Step B) 単体テスト（V3 §4.4）
 *
 * 中間潜在量 → 4 軸打球パラメータ への変換が、
 * 各軸の入力に応じて妥当な値を返すかを検証。
 */

import { describe, it, expect } from 'vitest';
import {
  computeBallTrajectoryParams,
  computeExitVelocity,
  computeLaunchAngle,
  computeSprayAngle,
  computeSpin,
  EXIT_VELOCITY_MIN,
  EXIT_VELOCITY_MAX,
  LAUNCH_ANGLE_MIN,
  LAUNCH_ANGLE_MAX,
} from '../../../../src/engine/physics/bat-ball/trajectory-params';
import { resolveBatBall } from '../../../../src/engine/physics/bat-ball';
import { createRNG } from '../../../../src/engine/core/rng';
import type { SwingLatentState, BatBallContext, BatterParams, PitcherParams } from '../../../../src/engine/physics/types';

function makeBatter(overrides: Partial<BatterParams> = {}): BatterParams {
  return {
    contact: 50, power: 50, eye: 50, technique: 50, speed: 50,
    mental: 50, focus: 50, battingSide: 'right', confidence: 50, mood: 'normal',
    ...overrides,
  };
}

function makePitcher(): PitcherParams {
  return {
    velocity: 130, control: 50, pitchStamina: 80, pitches: { fastball: 80 },
    mental: 50, focus: 50, pitchCountInGame: 0, stamina: 80, mood: 'normal', confidence: 50,
  };
}

function makeContext(overrides: Partial<BatBallContext> = {}): BatBallContext {
  return {
    pitcher: makePitcher(),
    perceivedPitch: { perceivedVelocity: 140, velocityChangeImpact: 0, breakSharpness: 0.1, lateMovement: 0.1, difficulty: 0.2 },
    pitchVelocity: 140, pitchType: 'fastball', pitchBreakLevel: 1,
    pitchActualLocation: { row: 2, col: 2 },
    batter: makeBatter(),
    batterSwingType: 'spray',
    timingError: 0, ballOnBat: 1.0, previousPitchVelocity: null,
    count: { balls: 0, strikes: 0 },
    inning: 5, scoreDiff: 0, outs: 0,
    bases: { first: null, second: null, third: null },
    isKeyMoment: false,
    orderFocusArea: 'none', orderAggressiveness: 'normal',
    batterTraits: [], batterMood: 0,
    ...overrides,
  };
}

function makeLatent(overrides: Partial<SwingLatentState> = {}): SwingLatentState {
  return {
    contactQuality: 0.5,
    timingWindow: 0,
    swingIntent: 0,
    decisionPressure: 0.3,
    barrelRate: 0.5,
    ...overrides,
  };
}

describe('computeBallTrajectoryParams (V3 §4 Step B)', () => {
  it('4 軸すべて返す', () => {
    const rng = createRNG('tp-test');
    const result = computeBallTrajectoryParams(makeLatent(), makeContext(), rng);
    expect(result).toHaveProperty('exitVelocity');
    expect(result).toHaveProperty('launchAngle');
    expect(result).toHaveProperty('sprayAngle');
    expect(result).toHaveProperty('spin');
    expect(result.spin).toHaveProperty('back');
    expect(result.spin).toHaveProperty('side');
  });

  it('決定論的: 同じ seed で同じ結果', () => {
    const rng1 = createRNG('tp-deterministic');
    const rng2 = createRNG('tp-deterministic');
    const r1 = computeBallTrajectoryParams(makeLatent(), makeContext(), rng1);
    const r2 = computeBallTrajectoryParams(makeLatent(), makeContext(), rng2);
    expect(r1).toEqual(r2);
  });
});

describe('exitVelocity (V3 §4.4)', () => {
  it('値域: EXIT_VELOCITY_MIN〜EXIT_VELOCITY_MAX', () => {
    const rng = createRNG('ev-range');
    for (let i = 0; i < 20; i++) {
      const v = computeExitVelocity(makeLatent({ barrelRate: Math.random() }), rng);
      expect(v).toBeGreaterThanOrEqual(EXIT_VELOCITY_MIN);
      expect(v).toBeLessThanOrEqual(EXIT_VELOCITY_MAX);
    }
  });

  it('barrelRate=0 で 70 km/h 付近', () => {
    let sum = 0;
    for (let i = 0; i < 50; i++) {
      const rng = createRNG(`ev-low-${i}`);
      sum += computeExitVelocity(makeLatent({ barrelRate: 0, contactQuality: 0.5 }), rng);
    }
    expect(sum / 50).toBeGreaterThan(60);
    expect(sum / 50).toBeLessThan(80);
  });

  it('barrelRate=1 で 150 km/h 付近', () => {
    let sum = 0;
    for (let i = 0; i < 50; i++) {
      const rng = createRNG(`ev-high-${i}`);
      sum += computeExitVelocity(makeLatent({ barrelRate: 1, contactQuality: 0.5 }), rng);
    }
    expect(sum / 50).toBeGreaterThan(140);
    expect(sum / 50).toBeLessThan(160);
  });

  it('barrelRate に対して単調増加 (期待値)', () => {
    const meanFor = (br: number): number => {
      let sum = 0;
      for (let i = 0; i < 50; i++) {
        sum += computeExitVelocity(makeLatent({ barrelRate: br }), createRNG(`ev-mono-${br}-${i}`));
      }
      return sum / 50;
    };
    const v0 = meanFor(0.2);
    const v1 = meanFor(0.5);
    const v2 = meanFor(0.8);
    expect(v1).toBeGreaterThan(v0);
    expect(v2).toBeGreaterThan(v1);
  });

  it('decisionPressure 高は exitVelocity をわずかに低下', () => {
    const meanFor = (dp: number): number => {
      let sum = 0;
      for (let i = 0; i < 50; i++) {
        sum += computeExitVelocity(makeLatent({ barrelRate: 0.7, decisionPressure: dp }), createRNG(`ev-dp-${dp}-${i}`));
      }
      return sum / 50;
    };
    expect(meanFor(0.0)).toBeGreaterThan(meanFor(0.9));
  });
});

describe('launchAngle (V3 §4.4)', () => {
  it('値域: LAUNCH_ANGLE_MIN〜LAUNCH_ANGLE_MAX', () => {
    const rng = createRNG('la-range');
    for (let i = 0; i < 20; i++) {
      const v = computeLaunchAngle(makeLatent({ barrelRate: Math.random() }), makeContext(), rng);
      expect(v).toBeGreaterThanOrEqual(LAUNCH_ANGLE_MIN);
      expect(v).toBeLessThanOrEqual(LAUNCH_ANGLE_MAX);
    }
  });

  it('高めの球（row=0）はフライ寄り（angle 大）', () => {
    const meanFor = (row: number): number => {
      let sum = 0;
      for (let i = 0; i < 50; i++) {
        sum += computeLaunchAngle(
          makeLatent({ barrelRate: 0.5 }),
          makeContext({ pitchActualLocation: { row, col: 2 } }),
          createRNG(`la-row-${row}-${i}`),
        );
      }
      return sum / 50;
    };
    expect(meanFor(0)).toBeGreaterThan(meanFor(4));
  });

  it('barrelRate 0 と 1 で大きく差がつく', () => {
    const meanFor = (br: number): number => {
      let sum = 0;
      for (let i = 0; i < 50; i++) {
        sum += computeLaunchAngle(makeLatent({ barrelRate: br }), makeContext(), createRNG(`la-br-${br}-${i}`));
      }
      return sum / 50;
    };
    const diff = Math.abs(meanFor(1) - meanFor(0));
    expect(diff).toBeGreaterThan(20);
  });

  it('timingWindow が正（遅い）→ 早打ち→フライ気味の符号', () => {
    // V3: timingWindow * 8 をそのまま加算 → +1 で +8 度
    const meanFor = (tw: number): number => {
      let sum = 0;
      for (let i = 0; i < 50; i++) {
        sum += computeLaunchAngle(makeLatent({ barrelRate: 0.5, timingWindow: tw }), makeContext(), createRNG(`la-tw-${tw}-${i}`));
      }
      return sum / 50;
    };
    expect(meanFor(0.8)).toBeGreaterThan(meanFor(-0.8));
  });
});

describe('sprayAngle (V3 §4.4)', () => {
  it('swingIntent=0 + timingWindow=0 でセンター方向 (45°) 付近', () => {
    let sum = 0;
    for (let i = 0; i < 50; i++) {
      sum += computeSprayAngle(makeLatent({ swingIntent: 0, timingWindow: 0 }), makeContext(), createRNG(`sa-c-${i}`));
    }
    expect(sum / 50).toBeGreaterThan(40);
    expect(sum / 50).toBeLessThan(50);
  });

  it('swingIntent=+1 (引っ張り) で sprayAngle 大', () => {
    let sum = 0;
    for (let i = 0; i < 50; i++) {
      sum += computeSprayAngle(makeLatent({ swingIntent: 1, timingWindow: 0 }), makeContext(), createRNG(`sa-pull-${i}`));
    }
    expect(sum / 50).toBeGreaterThan(60);
  });

  it('swingIntent=-1 (流し) で sprayAngle 小', () => {
    let sum = 0;
    for (let i = 0; i < 50; i++) {
      sum += computeSprayAngle(makeLatent({ swingIntent: -1, timingWindow: 0 }), makeContext(), createRNG(`sa-opp-${i}`));
    }
    expect(sum / 50).toBeLessThan(30);
  });

  it('timingWindow=+1 (遅) で流し側にずれる（-12 シフト）', () => {
    const meanFor = (tw: number): number => {
      let sum = 0;
      for (let i = 0; i < 50; i++) {
        sum += computeSprayAngle(makeLatent({ swingIntent: 0, timingWindow: tw }), makeContext(), createRNG(`sa-tw-${tw}-${i}`));
      }
      return sum / 50;
    };
    expect(meanFor(1)).toBeLessThan(meanFor(-1));
  });

  it('technique 高は分散小', () => {
    const stdFor = (tec: number): number => {
      const arr: number[] = [];
      for (let i = 0; i < 100; i++) {
        arr.push(computeSprayAngle(makeLatent(), makeContext({ batter: makeBatter({ technique: tec }) }), createRNG(`sa-tec-${tec}-${i}`)));
      }
      const m = arr.reduce((a, b) => a + b, 0) / arr.length;
      return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
    };
    expect(stdFor(99)).toBeLessThan(stdFor(20));
  });
});

describe('spin (V3 §4.4)', () => {
  it('back/side が必ず数値', () => {
    const rng = createRNG('spin-basic');
    const s = computeSpin(makeLatent(), 20, rng);
    expect(typeof s.back).toBe('number');
    expect(typeof s.side).toBe('number');
  });

  it('launchAngle > 10 はバックスピン正値が期待', () => {
    let sum = 0;
    for (let i = 0; i < 50; i++) {
      sum += computeSpin(makeLatent({ barrelRate: 0.6 }), 25, createRNG(`spin-fly-${i}`)).back;
    }
    expect(sum / 50).toBeGreaterThan(1500);
  });

  it('launchAngle <= 10 (ゴロ) はバックスピン負値が期待', () => {
    let sum = 0;
    for (let i = 0; i < 50; i++) {
      sum += computeSpin(makeLatent(), 5, createRNG(`spin-gr-${i}`)).back;
    }
    expect(sum / 50).toBeLessThan(0);
  });

  it('swingIntent=+1 で sideSpin が正値傾向', () => {
    let sum = 0;
    for (let i = 0; i < 50; i++) {
      sum += computeSpin(makeLatent({ swingIntent: 1 }), 20, createRNG(`spin-int-${i}`)).side;
    }
    expect(sum / 50).toBeGreaterThan(500);
  });
});

describe('resolveBatBall (Step A + Step B 統合)', () => {
  it('latent と trajectory の両方を返す', () => {
    const rng = createRNG('integ-1');
    const result = resolveBatBall(makeContext(), rng);
    expect(result).toHaveProperty('latent');
    expect(result).toHaveProperty('trajectory');
  });

  it('決定論的: 同じ seed で同じ結果', () => {
    const r1 = resolveBatBall(makeContext(), createRNG('integ-det'));
    const r2 = resolveBatBall(makeContext(), createRNG('integ-det'));
    expect(r1).toEqual(r2);
  });

  it('入力差で結果差: power 99 vs power 30 の打者で exitVelocity 期待値が異なる', () => {
    let lowSum = 0;
    let highSum = 0;
    for (let i = 0; i < 100; i++) {
      lowSum += resolveBatBall(makeContext({ batter: makeBatter({ power: 30, contact: 60 }) }), createRNG(`integ-low-${i}`)).trajectory.exitVelocity;
      highSum += resolveBatBall(makeContext({ batter: makeBatter({ power: 99, contact: 60 }) }), createRNG(`integ-high-${i}`)).trajectory.exitVelocity;
    }
    expect(highSum / 100).toBeGreaterThan(lowSum / 100);
  });

  it('同じ打者が 100 回打つと exitVelocity が分散 (分散 > 0)', () => {
    const arr: number[] = [];
    for (let i = 0; i < 100; i++) {
      arr.push(resolveBatBall(makeContext(), createRNG(`integ-var-${i}`)).trajectory.exitVelocity);
    }
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
    expect(variance).toBeGreaterThan(1); // 1 km/h² 以上の分散
  });

  it('入力空間の高次元性: 隣接する微小入力差でも結果が変わる', () => {
    const a = resolveBatBall(
      makeContext({ batter: makeBatter({ power: 50 }) }),
      createRNG('hd-1'),
    );
    const b = resolveBatBall(
      makeContext({ batter: makeBatter({ power: 51 }) }),
      createRNG('hd-1'), // 同じ seed
    );
    // power が 1 異なるだけでも何かしら結果が変わる
    expect(a.trajectory).not.toEqual(b.trajectory);
  });
});
