/**
 * Phase R2-ACP: 計算精密化検証テスト（V3 §3.2 / §4.3 / §4.4）
 *
 * 骨格実装（仮置き）から精密化実装への移行後の期待値・挙動を検証する追加テスト。
 * 既存 75 件テストを補完し、V3 仕様書の要件をより厳密に検証する。
 */

import { describe, it, expect } from 'vitest';
import {
  computePerceivedPitchQuality,
  type PerceivedPitchInput,
} from '../../../../src/engine/physics/bat-ball/perceived-quality';
import {
  computeContactQuality,
  computeTimingWindow,
  computeSwingIntent,
  computeDecisionPressure,
  computeBarrelRate,
} from '../../../../src/engine/physics/bat-ball/latent-state';
import {
  computeExitVelocity,
  computeLaunchAngle,
  computeSprayAngle,
  computeSpin,
} from '../../../../src/engine/physics/bat-ball/trajectory-params';
import { createRNG } from '../../../../src/engine/core/rng';
import type { BatBallContext, BatterParams, PitcherParams, SwingLatentState } from '../../../../src/engine/physics/types';

// ============================================================
// テスト用ファクトリー
// ============================================================

function makePitcher(overrides: Partial<PitcherParams> = {}): PitcherParams {
  return {
    velocity: 130, control: 50, pitchStamina: 80, pitches: { fastball: 80 },
    mental: 50, focus: 50, pitchCountInGame: 0, stamina: 80, mood: 'normal', confidence: 50,
    ...overrides,
  };
}

function makePerceivedInput(overrides: Partial<PerceivedPitchInput> = {}): PerceivedPitchInput {
  return {
    pitchVelocity: 140,
    pitchType: 'fastball',
    pitchBreakLevel: 1,
    pitchActualLocation: { row: 2, col: 2 },
    pitcher: makePitcher(),
    previousPitchVelocity: null,
    previousPitchType: null,
    pitcherStaminaPct: 80,
    pitcherConfidence: 50,
    ...overrides,
  };
}

function makeBatter(overrides: Partial<BatterParams> = {}): BatterParams {
  return {
    contact: 50, power: 50, eye: 50, technique: 50, speed: 50,
    mental: 50, focus: 50, battingSide: 'right', confidence: 50, mood: 'normal',
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
    inning: 5, scoreDiff: 0, outs: 0,
    bases: { first: null, second: null, third: null },
    isKeyMoment: false,
    orderFocusArea: 'none',
    orderAggressiveness: 'normal',
    batterTraits: [],
    batterMood: 0,
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

// ============================================================
// §3.2 PerceivedPitchQuality 精密化検証
// ============================================================

describe('perceived-quality 精密化 (V3 §3.2 ACP)', () => {
  describe('perceivedVelocity — 見かけ球速 コース補正', () => {
    it('高め（row=0）は低め（row=4）より見かけが速い', () => {
      const high = computePerceivedPitchQuality(makePerceivedInput({
        pitchActualLocation: { row: 0, col: 2 },
      }));
      const low = computePerceivedPitchQuality(makePerceivedInput({
        pitchActualLocation: { row: 4, col: 2 },
      }));
      expect(high.perceivedVelocity).toBeGreaterThan(low.perceivedVelocity);
    });

    it('confidence=100 と confidence=0 で見かけ球速に有意な差', () => {
      const c100 = computePerceivedPitchQuality(makePerceivedInput({ pitcherConfidence: 100 }));
      const c0 = computePerceivedPitchQuality(makePerceivedInput({ pitcherConfidence: 0 }));
      // 100 * 1.0 の fastball、confidence差 100 → 期待 8km/h 差
      expect(c100.perceivedVelocity - c0.perceivedVelocity).toBeGreaterThan(4);
      expect(c100.perceivedVelocity - c0.perceivedVelocity).toBeLessThan(15);
    });
  });

  describe('velocityChangeImpact — 精密公式検証', () => {
    it('閾値 25km/h で 1.0 に達する', () => {
      const result = computePerceivedPitchQuality(makePerceivedInput({
        previousPitchVelocity: 140,
        pitchVelocity: 115,
      }));
      expect(result.velocityChangeImpact).toBeCloseTo(1.0, 5);
    });

    it('12.5km/h の差で 0.5', () => {
      const result = computePerceivedPitchQuality(makePerceivedInput({
        previousPitchVelocity: 140,
        pitchVelocity: 127.5,
      }));
      expect(result.velocityChangeImpact).toBeCloseTo(0.5, 5);
    });

    it('差が 25km/h を超えても 1.0 に収まる（クランプ）', () => {
      const result = computePerceivedPitchQuality(makePerceivedInput({
        previousPitchVelocity: 155,
        pitchVelocity: 100,
      }));
      expect(result.velocityChangeImpact).toBe(1.0);
    });
  });

  describe('breakSharpness — control 係数', () => {
    it('control 高い投手ほど同球種で breakSharpness が高い', () => {
      const highControl = computePerceivedPitchQuality(makePerceivedInput({
        pitchType: 'slider',
        pitchBreakLevel: 5,
        pitcher: makePitcher({ control: 90 }),
      }));
      const lowControl = computePerceivedPitchQuality(makePerceivedInput({
        pitchType: 'slider',
        pitchBreakLevel: 5,
        pitcher: makePitcher({ control: 10 }),
      }));
      expect(highControl.breakSharpness).toBeGreaterThan(lowControl.breakSharpness);
    });
  });

  describe('lateMovement — スタミナ段階的低下', () => {
    it('stamina 60% 以上でフル発揮（100% と同値）', () => {
      const full = computePerceivedPitchQuality(makePerceivedInput({
        pitchType: 'fork', pitcherStaminaPct: 100,
      }));
      const partial = computePerceivedPitchQuality(makePerceivedInput({
        pitchType: 'fork', pitcherStaminaPct: 60,
      }));
      expect(full.lateMovement).toBeCloseTo(partial.lateMovement, 5);
    });

    it('stamina 45% (30-60%) は 60% と 20% の間の値', () => {
      const fresh = computePerceivedPitchQuality(makePerceivedInput({
        pitchType: 'fork', pitcherStaminaPct: 100,
      }));
      const mid = computePerceivedPitchQuality(makePerceivedInput({
        pitchType: 'fork', pitcherStaminaPct: 45,
      }));
      const tired = computePerceivedPitchQuality(makePerceivedInput({
        pitchType: 'fork', pitcherStaminaPct: 20,
      }));
      expect(mid.lateMovement).toBeLessThan(fresh.lateMovement);
      expect(mid.lateMovement).toBeGreaterThan(tired.lateMovement);
    });
  });
});

// ============================================================
// §4.3 contactQuality 精密化検証
// ============================================================

describe('contactQuality 精密化 (V3 §4.3 ACP)', () => {
  describe('ballOnBat（芯ズレ）効果', () => {
    it('ballOnBat=1.0 は ballOnBat=0.0 より contactQuality が高い（期待値）', () => {
      let highSum = 0;
      let lowSum = 0;
      for (let i = 0; i < 100; i++) {
        highSum += computeContactQuality(makeContext({ ballOnBat: 1.0 }), createRNG(`bo-h-${i}`));
        lowSum += computeContactQuality(makeContext({ ballOnBat: 0.0 }), createRNG(`bo-l-${i}`));
      }
      expect(highSum / 100).toBeGreaterThan(lowSum / 100);
    });

    it('ballOnBat=0.5 が中間値を取る（期待値）', () => {
      let highSum = 0;
      let midSum = 0;
      let lowSum = 0;
      for (let i = 0; i < 100; i++) {
        highSum += computeContactQuality(makeContext({ ballOnBat: 1.0 }), createRNG(`bo-h-${i}`));
        midSum += computeContactQuality(makeContext({ ballOnBat: 0.5 }), createRNG(`bo-m-${i}`));
        lowSum += computeContactQuality(makeContext({ ballOnBat: 0.0 }), createRNG(`bo-l-${i}`));
      }
      expect(midSum / 100).toBeLessThan(highSum / 100);
      expect(midSum / 100).toBeGreaterThan(lowSum / 100);
    });
  });
});

// ============================================================
// §4.3 decisionPressure 精密化検証
// ============================================================

describe('decisionPressure 精密化 (V3 §4.3 ACP)', () => {
  describe('2アウトのプレッシャー効果', () => {
    it('2 アウトは 0 アウトよりプレッシャー高め', () => {
      const twoOuts = computeDecisionPressure(makeContext({
        outs: 2,
        isKeyMoment: false,
      }));
      const zeroOuts = computeDecisionPressure(makeContext({
        outs: 0,
        isKeyMoment: false,
      }));
      expect(twoOuts).toBeGreaterThan(zeroOuts);
    });
  });

  describe('接戦終盤の判定', () => {
    it('7回以降 + 点差2以内はプレッシャー上昇', () => {
      const closeLate = computeDecisionPressure(makeContext({
        inning: 8,
        scoreDiff: 1,
      }));
      const earlyBlowout = computeDecisionPressure(makeContext({
        inning: 3,
        scoreDiff: 5,
      }));
      expect(closeLate).toBeGreaterThan(earlyBlowout);
    });

    it('6回は closeGameLateInning 対象外', () => {
      const inning6 = computeDecisionPressure(makeContext({
        inning: 6,
        scoreDiff: 0,
      }));
      const inning7 = computeDecisionPressure(makeContext({
        inning: 7,
        scoreDiff: 0,
      }));
      expect(inning7).toBeGreaterThan(inning6);
    });
  });

  describe('mood の段階的影響', () => {
    it('mood=-0.5 は mood=0 より高圧', () => {
      const badMood = computeDecisionPressure(makeContext({ batterMood: -0.5 }));
      const neutral = computeDecisionPressure(makeContext({ batterMood: 0 }));
      expect(badMood).toBeGreaterThan(neutral);
    });

    it('mood のスケールが mood 値に単調比例', () => {
      const p1 = computeDecisionPressure(makeContext({ batterMood: -1 }));
      const p2 = computeDecisionPressure(makeContext({ batterMood: 0 }));
      const p3 = computeDecisionPressure(makeContext({ batterMood: 1 }));
      expect(p1).toBeGreaterThan(p2);
      expect(p2).toBeGreaterThan(p3);
    });
  });
});

// ============================================================
// §4.4 launchAngle 精密化検証
// ============================================================

describe('launchAngle 精密化 (V3 §4.4 ACP)', () => {
  describe('barrelRate と発射角の関係', () => {
    it('barrelRate=0 → 期待値 -30° 付近', () => {
      let sum = 0;
      for (let i = 0; i < 100; i++) {
        sum += computeLaunchAngle(
          makeLatent({ barrelRate: 0, contactQuality: 0.5 }),
          makeContext(),
          createRNG(`la-br0-${i}`),
        );
      }
      const mean = sum / 100;
      // barrelRate=0: baseAngle = -5 + 50*(0-0.5) = -30, locationEffect=(2-2)*5=0, timingEffect=0
      expect(mean).toBeGreaterThan(-35);
      expect(mean).toBeLessThan(-20);
    });

    it('barrelRate=1 → 期待値 +20° 付近', () => {
      let sum = 0;
      for (let i = 0; i < 100; i++) {
        sum += computeLaunchAngle(
          makeLatent({ barrelRate: 1, contactQuality: 0.9 }),
          makeContext(),
          createRNG(`la-br1-${i}`),
        );
      }
      const mean = sum / 100;
      // barrelRate=1: baseAngle = -5 + 50*(1-0.5) = +20
      expect(mean).toBeGreaterThan(12);
      expect(mean).toBeLessThan(28);
    });
  });

  describe('タイミング窓と発射角', () => {
    it('timingWindow=+1（遅）は timingWindow=-1（早）より発射角が高い', () => {
      const meanFor = (tw: number): number => {
        let sum = 0;
        for (let i = 0; i < 50; i++) {
          sum += computeLaunchAngle(
            makeLatent({ barrelRate: 0.5, timingWindow: tw }),
            makeContext(),
            createRNG(`la-tw2-${tw}-${i}`),
          );
        }
        return sum / 50;
      };
      // timingWindow=+1 → +8°, timingWindow=-1 → -8°
      const diff = meanFor(1) - meanFor(-1);
      expect(diff).toBeGreaterThan(10);
    });
  });
});

// ============================================================
// §4.4 sprayAngle 精密化検証
// ============================================================

describe('sprayAngle 精密化 (V3 §4.4 ACP)', () => {
  describe('swingIntent による方向制御', () => {
    it('swingIntent=+1 → 期待値 75° (45 + 30) 付近', () => {
      let sum = 0;
      for (let i = 0; i < 50; i++) {
        sum += computeSprayAngle(
          makeLatent({ swingIntent: 1, timingWindow: 0 }),
          makeContext({ batter: makeBatter({ technique: 99 }) }),
          createRNG(`sa-p1-${i}`),
        );
      }
      const mean = sum / 50;
      expect(mean).toBeGreaterThan(68);
      expect(mean).toBeLessThan(82);
    });

    it('swingIntent=-1 → 期待値 15° (45 - 30) 付近', () => {
      let sum = 0;
      for (let i = 0; i < 50; i++) {
        sum += computeSprayAngle(
          makeLatent({ swingIntent: -1, timingWindow: 0 }),
          makeContext({ batter: makeBatter({ technique: 99 }) }),
          createRNG(`sa-m1-${i}`),
        );
      }
      const mean = sum / 50;
      expect(mean).toBeGreaterThan(8);
      expect(mean).toBeLessThan(22);
    });
  });

  describe('timingShift — 遅=流し、早=引っ張り', () => {
    it('timingWindow=+1（遅）: センター基準から -12° 方向（流し）にずれる', () => {
      const lateSum = Array.from({ length: 50 }, (_, i) =>
        computeSprayAngle(
          makeLatent({ swingIntent: 0, timingWindow: 1 }),
          makeContext({ batter: makeBatter({ technique: 99 }) }),
          createRNG(`sa-late-${i}`),
        )).reduce((a, b) => a + b, 0) / 50;

      const earlySum = Array.from({ length: 50 }, (_, i) =>
        computeSprayAngle(
          makeLatent({ swingIntent: 0, timingWindow: -1 }),
          makeContext({ batter: makeBatter({ technique: 99 }) }),
          createRNG(`sa-early-${i}`),
        )).reduce((a, b) => a + b, 0) / 50;

      // 遅い(+1) → 流し方向(小)、早い(-1) → 引っ張り方向(大)
      expect(lateSum).toBeLessThan(earlySum);
      // 差は約 24° ( = -(-12) - 12 = 24 )
      expect(earlySum - lateSum).toBeGreaterThan(15);
    });
  });
});

// ============================================================
// §4.4 spin 精密化検証
// ============================================================

describe('spin 精密化 (V3 §4.4 ACP)', () => {
  describe('barrelRate による backspin 強化', () => {
    it('フライ系: barrelRate 高ほどバックスピン強い', () => {
      const meanFor = (br: number): number => {
        let sum = 0;
        for (let i = 0; i < 50; i++) {
          sum += computeSpin(makeLatent({ barrelRate: br }), 20, createRNG(`spin-br-${br}-${i}`)).back;
        }
        return sum / 50;
      };
      expect(meanFor(1.0)).toBeGreaterThan(meanFor(0.5));
      expect(meanFor(0.5)).toBeGreaterThan(meanFor(0.0));
    });
  });

  describe('swingIntent による sidespin', () => {
    it('引っ張り(+1)と流し(-1)で sideSpin の符号が反転傾向', () => {
      const pullMean = Array.from({ length: 50 }, (_, i) =>
        computeSpin(makeLatent({ swingIntent: 1 }), 20, createRNG(`ss-pull-${i}`)).side
      ).reduce((a, b) => a + b, 0) / 50;

      const oppMean = Array.from({ length: 50 }, (_, i) =>
        computeSpin(makeLatent({ swingIntent: -1 }), 20, createRNG(`ss-opp-${i}`)).side
      ).reduce((a, b) => a + b, 0) / 50;

      expect(pullMean).toBeGreaterThan(0);
      expect(oppMean).toBeLessThan(0);
    });
  });
});

// ============================================================
// exitVelocity 精密化検証
// ============================================================

describe('exitVelocity 精密化 (V3 §4.4 ACP)', () => {
  describe('barrelRate と打球初速の精密対応', () => {
    it('barrelRate=0 の期待値が 70 ± 5 km/h の範囲', () => {
      let sum = 0;
      for (let i = 0; i < 100; i++) {
        sum += computeExitVelocity(
          makeLatent({ barrelRate: 0, decisionPressure: 0, contactQuality: 0.5 }),
          createRNG(`ev-prec-0-${i}`),
        );
      }
      const mean = sum / 100;
      // barrelRate=0: base=70, adjustment=1.0, noise~0 → 期待値 70 付近
      expect(mean).toBeGreaterThan(65);
      expect(mean).toBeLessThan(75);
    });

    it('barrelRate=1 の期待値が 150 ± 5 km/h の範囲', () => {
      let sum = 0;
      for (let i = 0; i < 100; i++) {
        sum += computeExitVelocity(
          makeLatent({ barrelRate: 1, decisionPressure: 0, contactQuality: 0.9 }),
          createRNG(`ev-prec-1-${i}`),
        );
      }
      const mean = sum / 100;
      // barrelRate=1: base=150, adjustment=1.0, noise小 → 期待値 150 付近
      expect(mean).toBeGreaterThan(145);
      expect(mean).toBeLessThan(155);
    });

    it('decisionPressure=1 で約 10% の速度低下', () => {
      const meanLow = Array.from({ length: 100 }, (_, i) =>
        computeExitVelocity(makeLatent({ barrelRate: 0.7, decisionPressure: 0 }), createRNG(`ev-dp0-${i}`))
      ).reduce((a, b) => a + b, 0) / 100;

      const meanHigh = Array.from({ length: 100 }, (_, i) =>
        computeExitVelocity(makeLatent({ barrelRate: 0.7, decisionPressure: 1 }), createRNG(`ev-dp1-${i}`))
      ).reduce((a, b) => a + b, 0) / 100;

      // pressure=1 で adjustment=0.9 → 約 10% 低下
      const ratio = meanHigh / meanLow;
      expect(ratio).toBeGreaterThan(0.85);
      expect(ratio).toBeLessThan(0.95);
    });
  });
});

// ============================================================
// 統合: swingType と打球方向の一貫性
// ============================================================

describe('統合: スイングタイプ → 打球方向の一貫性 (ACP)', () => {
  it('右打者 pull → swingIntent 正 → sprayAngle 大 (引っ張り)', () => {
    // pull swingType → swingIntent > 0 → sprayAngle > 45
    const intent = computeSwingIntent(makeContext({
      batterSwingType: 'pull',
      batter: makeBatter({ battingSide: 'right' }),
    }));
    expect(intent).toBeGreaterThan(0);

    const meanSpray = Array.from({ length: 50 }, (_, i) =>
      computeSprayAngle(
        makeLatent({ swingIntent: intent, timingWindow: 0 }),
        makeContext(),
        createRNG(`integ-pull-${i}`),
      )
    ).reduce((a, b) => a + b, 0) / 50;
    expect(meanSpray).toBeGreaterThan(45);
  });

  it('左打者 pull → swingIntent 負（方向反転）→ sprayAngle 小（流し方向）', () => {
    const intent = computeSwingIntent(makeContext({
      batterSwingType: 'pull',
      batter: makeBatter({ battingSide: 'left' }),
    }));
    expect(intent).toBeLessThan(0); // 左打者は方向反転

    const meanSpray = Array.from({ length: 50 }, (_, i) =>
      computeSprayAngle(
        makeLatent({ swingIntent: intent, timingWindow: 0 }),
        makeContext(),
        createRNG(`integ-left-pull-${i}`),
      )
    ).reduce((a, b) => a + b, 0) / 50;
    expect(meanSpray).toBeLessThan(45);
  });
});
