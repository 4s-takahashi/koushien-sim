/**
 * Phase R2-3: PerceivedPitchQuality の単体テスト（V3 §3.2）
 *
 * 投球の打者認知抽象品質パラメータが、入力に応じて妥当な値を返すか検証する。
 */

import { describe, it, expect } from 'vitest';
import {
  computePerceivedPitchQuality,
  PITCH_TYPE_BREAK_BASE,
  PITCH_TYPE_LATE_MOVEMENT,
  PITCH_TYPE_PERCEIVED_VELOCITY_BIAS,
  type PerceivedPitchInput,
} from '../../../../src/engine/physics/bat-ball/perceived-quality';
import type { PitcherParams } from '../../../../src/engine/match/types';

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

function makeInput(overrides: Partial<PerceivedPitchInput> = {}): PerceivedPitchInput {
  return {
    pitchVelocity: 140,
    pitchType: 'fastball',
    pitchBreakLevel: 1,
    pitchActualLocation: { row: 2, col: 2 }, // ど真ん中
    pitcher: makePitcher(),
    previousPitchVelocity: null,
    previousPitchType: null,
    pitcherStaminaPct: 80,
    pitcherConfidence: 50,
    ...overrides,
  };
}

describe('computePerceivedPitchQuality (V3 §3.2)', () => {
  describe('基本動作', () => {
    it('PerceivedPitchQuality を返す（5 軸すべて存在）', () => {
      const result = computePerceivedPitchQuality(makeInput());
      expect(result).toHaveProperty('perceivedVelocity');
      expect(result).toHaveProperty('velocityChangeImpact');
      expect(result).toHaveProperty('breakSharpness');
      expect(result).toHaveProperty('lateMovement');
      expect(result).toHaveProperty('difficulty');
    });

    it('値域: velocityChangeImpact / breakSharpness / lateMovement / difficulty は 0-1', () => {
      const result = computePerceivedPitchQuality(makeInput());
      expect(result.velocityChangeImpact).toBeGreaterThanOrEqual(0);
      expect(result.velocityChangeImpact).toBeLessThanOrEqual(1);
      expect(result.breakSharpness).toBeGreaterThanOrEqual(0);
      expect(result.breakSharpness).toBeLessThanOrEqual(1);
      expect(result.lateMovement).toBeGreaterThanOrEqual(0);
      expect(result.lateMovement).toBeLessThanOrEqual(1);
      expect(result.difficulty).toBeGreaterThanOrEqual(0);
      expect(result.difficulty).toBeLessThanOrEqual(1);
    });
  });

  describe('perceivedVelocity (見かけ球速)', () => {
    it('fastball は実速度に近い (bias=1.0)', () => {
      const result = computePerceivedPitchQuality(makeInput({ pitchType: 'fastball', pitchVelocity: 140 }));
      // ±5km/h 程度の補正のみ
      expect(Math.abs(result.perceivedVelocity - 140)).toBeLessThan(10);
    });

    it('curveball は実速度より見かけ遅い (bias=0.80)', () => {
      const result = computePerceivedPitchQuality(makeInput({ pitchType: 'curveball', pitchVelocity: 120 }));
      expect(result.perceivedVelocity).toBeLessThan(120);
    });

    it('changeup は実速度より大幅に見かけ遅い (bias=0.65)', () => {
      const result = computePerceivedPitchQuality(makeInput({ pitchType: 'changeup', pitchVelocity: 130 }));
      expect(result.perceivedVelocity).toBeLessThan(110);
    });

    it('投手 confidence が高いと見かけ速度が上がる', () => {
      const low = computePerceivedPitchQuality(makeInput({ pitcherConfidence: 0 }));
      const high = computePerceivedPitchQuality(makeInput({ pitcherConfidence: 100 }));
      expect(high.perceivedVelocity).toBeGreaterThan(low.perceivedVelocity);
    });
  });

  describe('velocityChangeImpact (緩急差)', () => {
    it('初球（previousPitchVelocity=null）は 0', () => {
      const result = computePerceivedPitchQuality(makeInput({ previousPitchVelocity: null }));
      expect(result.velocityChangeImpact).toBe(0);
    });

    it('同じ球速の連投は 0 に近い', () => {
      const result = computePerceivedPitchQuality(makeInput({ previousPitchVelocity: 140, pitchVelocity: 140 }));
      expect(result.velocityChangeImpact).toBeLessThan(0.05);
    });

    it('25km/h 以上の緩急差は 1.0 (上限)', () => {
      const result = computePerceivedPitchQuality(makeInput({ previousPitchVelocity: 145, pitchVelocity: 110 }));
      expect(result.velocityChangeImpact).toBe(1);
    });

    it('10km/h の緩急差で 0.4 (10/25)', () => {
      const result = computePerceivedPitchQuality(makeInput({ previousPitchVelocity: 140, pitchVelocity: 130 }));
      expect(result.velocityChangeImpact).toBeCloseTo(0.4, 1);
    });
  });

  describe('breakSharpness (ブレイク強度)', () => {
    it('fastball は break 低 (PITCH_TYPE_BREAK_BASE.fastball=0.05)', () => {
      const result = computePerceivedPitchQuality(makeInput({ pitchType: 'fastball', pitchBreakLevel: 7 }));
      expect(result.breakSharpness).toBeLessThan(0.15);
    });

    it('curveball は break 高 (PITCH_TYPE_BREAK_BASE.curveball=0.75)', () => {
      const result = computePerceivedPitchQuality(makeInput({ pitchType: 'curveball', pitchBreakLevel: 7 }));
      expect(result.breakSharpness).toBeGreaterThan(0.5);
    });

    it('pitchBreakLevel が高いほど break 強度が上がる', () => {
      const low = computePerceivedPitchQuality(makeInput({ pitchType: 'curveball', pitchBreakLevel: 1 }));
      const high = computePerceivedPitchQuality(makeInput({ pitchType: 'curveball', pitchBreakLevel: 7 }));
      expect(high.breakSharpness).toBeGreaterThan(low.breakSharpness);
    });

    it('未知の球種でもデフォルト値 0.3 ベースで動作', () => {
      const result = computePerceivedPitchQuality(makeInput({ pitchType: 'knuckleball-not-defined' }));
      expect(result.breakSharpness).toBeGreaterThanOrEqual(0);
      expect(result.breakSharpness).toBeLessThanOrEqual(1);
    });
  });

  describe('lateMovement (終盤変化)', () => {
    it('fork は late 高 (PITCH_TYPE_LATE_MOVEMENT.fork=0.70)', () => {
      const result = computePerceivedPitchQuality(makeInput({ pitchType: 'fork', pitcherStaminaPct: 100 }));
      expect(result.lateMovement).toBeGreaterThan(0.5);
    });

    it('fastball は late 低 (0.10)', () => {
      const result = computePerceivedPitchQuality(makeInput({ pitchType: 'fastball', pitcherStaminaPct: 100 }));
      expect(result.lateMovement).toBeLessThan(0.2);
    });

    it('スタミナ 30% 未満で late 低下', () => {
      const fresh = computePerceivedPitchQuality(makeInput({ pitchType: 'fork', pitcherStaminaPct: 100 }));
      const tired = computePerceivedPitchQuality(makeInput({ pitchType: 'fork', pitcherStaminaPct: 20 }));
      expect(tired.lateMovement).toBeLessThan(fresh.lateMovement);
    });
  });

  describe('difficulty (打ちにくさ総合)', () => {
    it('ど真ん中 fastball は difficulty 低', () => {
      const result = computePerceivedPitchQuality(makeInput({
        pitchType: 'fastball',
        pitchBreakLevel: 1,
        pitchActualLocation: { row: 2, col: 2 },
      }));
      expect(result.difficulty).toBeLessThan(0.3);
    });

    it('ストライクゾーン端は difficulty 上昇', () => {
      const center = computePerceivedPitchQuality(makeInput({ pitchActualLocation: { row: 2, col: 2 } }));
      const corner = computePerceivedPitchQuality(makeInput({ pitchActualLocation: { row: 0, col: 0 } }));
      expect(corner.difficulty).toBeGreaterThan(center.difficulty);
    });

    it('変化球 + 緩急 + 端コース は difficulty 高', () => {
      const result = computePerceivedPitchQuality(makeInput({
        pitchType: 'fork',
        pitchBreakLevel: 7,
        previousPitchVelocity: 145,
        pitchVelocity: 115,
        pitchActualLocation: { row: 4, col: 0 },
      }));
      expect(result.difficulty).toBeGreaterThan(0.5);
    });
  });

  describe('定数の整合性', () => {
    it('PITCH_TYPE_BREAK_BASE の全値が 0-1', () => {
      for (const [name, val] of Object.entries(PITCH_TYPE_BREAK_BASE)) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    });

    it('PITCH_TYPE_LATE_MOVEMENT の全値が 0-1', () => {
      for (const [name, val] of Object.entries(PITCH_TYPE_LATE_MOVEMENT)) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    });

    it('PITCH_TYPE_PERCEIVED_VELOCITY_BIAS の全値が 0.5-1.1', () => {
      for (const [name, val] of Object.entries(PITCH_TYPE_PERCEIVED_VELOCITY_BIAS)) {
        expect(val).toBeGreaterThan(0.5);
        expect(val).toBeLessThanOrEqual(1.1);
      }
    });
  });
});
