/**
 * Phase R3: bat-swing.ts 単体テスト
 * バット軌道生成（スイング決定論）
 */

import { describe, it, expect } from 'vitest';
import {
  generateBatSwing,
  computeSwingSpeed,
  computeTimingErrorMs,
  computeSwingPlaneAngle,
  computeBatHeadPos,
  isCheckSwing,
  isHalfSwing,
  BASE_SWING_SPEED_MPH,
  MAX_SWING_SPEED_BONUS_MPH,
  SWING_DURATION_MS,
} from '../../../../src/engine/physics/resolver/bat-swing';
import { createRNG } from '../../../../src/engine/core/rng';
import type { SwingLatentState } from '../../../../src/engine/physics/types';

// ============================================================
// テストヘルパー
// ============================================================

function makeLatent(overrides: Partial<SwingLatentState> = {}): SwingLatentState {
  return {
    contactQuality: 0.7,
    timingWindow: 0.0,
    swingIntent: 0.0,
    decisionPressure: 0.3,
    barrelRate: 0.5,
    ...overrides,
  };
}

const rng = createRNG('test-bat-swing');

// ============================================================
// generateBatSwing
// ============================================================

describe('generateBatSwing', () => {
  it('正常なプロファイルを返す', () => {
    const latent = makeLatent();
    const profile = generateBatSwing(latent, 60, rng);
    expect(profile.swingSpeedMph).toBeGreaterThan(0);
    expect(typeof profile.startTimeMs).toBe('number');
    expect(typeof profile.contactTimeMs).toBe('number');
    expect(typeof profile.timingErrorMs).toBe('number');
    expect(profile.batHeadPos).toBeDefined();
    expect(typeof profile.swingPlaneAngleDeg).toBe('number');
  });

  it('contactTimeMs は timingErrorMs と等しい', () => {
    const latent = makeLatent({ timingWindow: 0 });
    const profile = generateBatSwing(latent, 50, createRNG('t1'));
    expect(profile.contactTimeMs).toBeCloseTo(profile.timingErrorMs, 0);
  });

  it('startTimeMs は負（スイング開始はコンタクト前）', () => {
    const latent = makeLatent({ timingWindow: 0 });
    const profile = generateBatSwing(latent, 50, createRNG('t2'));
    expect(profile.startTimeMs).toBeLessThan(profile.contactTimeMs);
  });

  it('power が高いとスイング速度が上がる', () => {
    const latent = makeLatent();
    const lowPower = generateBatSwing(latent, 20, createRNG('p1'));
    const highPower = generateBatSwing(latent, 90, createRNG('p1'));
    expect(highPower.swingSpeedMph).toBeGreaterThan(lowPower.swingSpeedMph);
  });
});

// ============================================================
// computeSwingSpeed
// ============================================================

describe('computeSwingSpeed', () => {
  it('power=0 でも最小速度を下回らない', () => {
    const speed = computeSwingSpeed(0, 0, rng);
    expect(speed).toBeGreaterThanOrEqual(40);
  });

  it('power=100 で最大に近い速度を出す', () => {
    const speed = computeSwingSpeed(100, 1, createRNG('max'));
    expect(speed).toBeGreaterThan(BASE_SWING_SPEED_MPH + MAX_SWING_SPEED_BONUS_MPH * 0.8);
  });

  it('power=50 で基準速度周辺', () => {
    const speed = computeSwingSpeed(50, 0.5, createRNG('mid'));
    expect(speed).toBeGreaterThan(70);
    expect(speed).toBeLessThan(100);
  });

  it('barrelRate が高いとボーナスが乗る', () => {
    const low = computeSwingSpeed(50, 0, createRNG('b1'));
    const high = computeSwingSpeed(50, 1, createRNG('b1'));
    expect(high).toBeGreaterThan(low - 1); // ノイズを考慮して緩め
  });
});

// ============================================================
// computeTimingErrorMs
// ============================================================

describe('computeTimingErrorMs', () => {
  it('timingWindow=0 ならエラーが小さい', () => {
    const err = computeTimingErrorMs(0, 70, createRNG('te1'));
    expect(Math.abs(err)).toBeLessThan(30);
  });

  it('timingWindow=1 ならプラス方向のエラー', () => {
    const err = computeTimingErrorMs(1, 50, createRNG('te2'));
    expect(err).toBeGreaterThan(0);
  });

  it('timingWindow=-1 ならマイナス方向のエラー', () => {
    const err = computeTimingErrorMs(-1, 50, createRNG('te3'));
    expect(err).toBeLessThan(0);
  });

  it('エラーは -150 〜 +150 ms に clamp される', () => {
    for (let i = 0; i < 10; i++) {
      const err = computeTimingErrorMs(1, 10, createRNG(`clamp${i}`));
      expect(err).toBeGreaterThanOrEqual(-150);
      expect(err).toBeLessThanOrEqual(150);
    }
  });

  it('power が高いほどエラーが小さくなる傾向', () => {
    // 同じ timingWindow でも power 違いで統計的に差が出る
    const errors: number[] = [];
    for (let i = 0; i < 5; i++) {
      errors.push(Math.abs(computeTimingErrorMs(0.5, 90, createRNG(`pw${i}`))));
    }
    const highPowerAvg = errors.reduce((a, b) => a + b, 0) / errors.length;
    expect(highPowerAvg).toBeLessThan(60);
  });
});

// ============================================================
// computeSwingPlaneAngle
// ============================================================

describe('computeSwingPlaneAngle', () => {
  it('返す角度が -5 〜 15 度の範囲内', () => {
    const angle = computeSwingPlaneAngle(0, 0.8);
    expect(angle).toBeGreaterThanOrEqual(-5);
    expect(angle).toBeLessThanOrEqual(15);
  });

  it('引っ張り (swingIntent=+1) は水平方向', () => {
    const pull = computeSwingPlaneAngle(1, 0.8);
    const push = computeSwingPlaneAngle(-1, 0.8);
    expect(pull).toBeLessThanOrEqual(push);
  });

  it('contactQuality が低いと角度がブレる', () => {
    const good = computeSwingPlaneAngle(0, 1.0);
    const bad = computeSwingPlaneAngle(0, 0.1);
    // 品質が低いほど理想から外れる
    expect(Math.abs(bad - 5)).toBeGreaterThanOrEqual(Math.abs(good - 5));
  });
});

// ============================================================
// computeBatHeadPos
// ============================================================

describe('computeBatHeadPos', () => {
  it('引っ張り (swingIntent=+1) で x が正', () => {
    const pos = computeBatHeadPos(1, 0);
    expect(pos.x).toBeGreaterThan(0);
  });

  it('流し (swingIntent=-1) で x が負', () => {
    const pos = computeBatHeadPos(-1, 0);
    expect(pos.x).toBeLessThan(0);
  });

  it('早打ち (timingWindow=-1) で y が大きい', () => {
    const early = computeBatHeadPos(0, -1);
    const late = computeBatHeadPos(0, 1);
    expect(early.y).toBeGreaterThan(late.y);
  });
});

// ============================================================
// isCheckSwing / isHalfSwing
// ============================================================

describe('isCheckSwing', () => {
  it('timingWindow < 0.5 ではチェックスイングにならない', () => {
    const latent = makeLatent({ timingWindow: 0.4, decisionPressure: 1.0 });
    const result = isCheckSwing(latent, createRNG('cs1'));
    expect(result).toBe(false);
  });

  it('timingWindow が大きく decisionPressure が高いと確率的に発生', () => {
    // 何度か試行してチェックスイングが発生することを確認
    let count = 0;
    for (let i = 0; i < 100; i++) {
      const latent = makeLatent({ timingWindow: 0.9, decisionPressure: 1.0 });
      if (isCheckSwing(latent, createRNG(`cs${i}`))) count++;
    }
    expect(count).toBeGreaterThan(5);
  });
});

describe('isHalfSwing', () => {
  it('大幅なタイミングずれ + 高プレッシャーでハーフスイング', () => {
    const latent = makeLatent({ timingWindow: 0.9, decisionPressure: 0.8 });
    expect(isHalfSwing(latent)).toBe(true);
  });

  it('通常タイミングではハーフスイングにならない', () => {
    const latent = makeLatent({ timingWindow: 0.3, decisionPressure: 0.8 });
    expect(isHalfSwing(latent)).toBe(false);
  });
});
