import { describe, it, expect } from 'vitest';
import {
  computeVelocityChangeEffect,
  computeLocationShiftEffect,
  computeRepeatLocationEffect,
  computeHighMiddleBoost,
  computeContactRateAdjustment,
  appendPitchHistory,
  AT_BAT_HISTORY_MAX,
} from '@/engine/match/pitch/pitch-sequence';
import type { PitchHistoryEntry, PitchLocation, PitchSelection } from '@/engine/match/types';

function makeHistory(entries: Partial<PitchHistoryEntry>[]): PitchHistoryEntry[] {
  return entries.map((e, i) => ({
    pitchType: 'fastball',
    velocity: 140,
    location: { row: 2, col: 2 },
    batterAction: 'take',
    outcome: 'called_strike',
    ...e,
  }));
}

// ============================================================
// computeVelocityChangeEffect
// ============================================================

describe('computeVelocityChangeEffect', () => {
  it('履歴なしなら効果 0', () => {
    expect(computeVelocityChangeEffect(140, undefined)).toBe(0);
    expect(computeVelocityChangeEffect(140, [])).toBe(0);
  });

  it('Δv < 10km/h は効果 0', () => {
    const history = makeHistory([{ velocity: 135 }]);
    expect(computeVelocityChangeEffect(140, history)).toBe(0);
  });

  it('Δv = 10km/h で効果ゼロ、20km/h で ~0.04、30km/h 以上で 0.08 (飽和)', () => {
    expect(computeVelocityChangeEffect(150, makeHistory([{ velocity: 140 }]))).toBeCloseTo(0, 2);
    expect(computeVelocityChangeEffect(150, makeHistory([{ velocity: 130 }]))).toBeCloseTo(0.04, 2);
    expect(computeVelocityChangeEffect(150, makeHistory([{ velocity: 110 }]))).toBeCloseTo(0.08, 2);
    expect(computeVelocityChangeEffect(150, makeHistory([{ velocity: 100 }]))).toBeCloseTo(0.08, 2);
  });

  it('符号に依らず絶対値で評価（遅→速も速→遅も同じ）', () => {
    const slow2fast = computeVelocityChangeEffect(150, makeHistory([{ velocity: 120 }]));
    const fast2slow = computeVelocityChangeEffect(120, makeHistory([{ velocity: 150 }]));
    expect(slow2fast).toBeCloseTo(fast2slow, 3);
  });
});

// ============================================================
// computeLocationShiftEffect
// ============================================================

describe('computeLocationShiftEffect', () => {
  it('履歴なしなら効果 0', () => {
    expect(computeLocationShiftEffect({ row: 2, col: 2 }, undefined)).toBe(0);
  });

  it('同じコースは効果 0', () => {
    const history = makeHistory([{ location: { row: 2, col: 2 } }]);
    expect(computeLocationShiftEffect({ row: 2, col: 2 }, history)).toBe(0);
  });

  it('隣接コース (距離 1) は効果 0', () => {
    const history = makeHistory([{ location: { row: 2, col: 2 } }]);
    expect(computeLocationShiftEffect({ row: 2, col: 3 }, history)).toBe(0);
  });

  it('大きく離れたコースは 0.04 (飽和)', () => {
    // インコース → アウトコース
    const history = makeHistory([{ location: { row: 2, col: 0 } }]);
    const result = computeLocationShiftEffect({ row: 2, col: 4 }, history);
    expect(result).toBeCloseTo(0.04, 2);
  });

  it('斜め対角 (インコース低め → アウトコース高め)', () => {
    const history = makeHistory([{ location: { row: 4, col: 0 } }]);
    const result = computeLocationShiftEffect({ row: 0, col: 4 }, history);
    expect(result).toBeCloseTo(0.04, 2);
  });
});

// ============================================================
// computeRepeatLocationEffect
// ============================================================

describe('computeRepeatLocationEffect', () => {
  it('履歴が 2 未満なら効果 0', () => {
    expect(computeRepeatLocationEffect({ row: 2, col: 2 }, undefined)).toBe(0);
    expect(computeRepeatLocationEffect({ row: 2, col: 2 }, makeHistory([{}]))).toBe(0);
  });

  it('直近 2 球が同じコース + 現球も同じ = 目付け効果 0.15', () => {
    const history = makeHistory([
      { location: { row: 2, col: 2 } },
      { location: { row: 2, col: 2 } },
    ]);
    const result = computeRepeatLocationEffect({ row: 2, col: 2 }, history);
    expect(result).toBeCloseTo(0.15, 2);
  });

  it('直近 1 球のみ同じ = 軽い効果 0.08', () => {
    const history = makeHistory([
      { location: { row: 0, col: 0 } },
      { location: { row: 2, col: 2 } },
    ]);
    const result = computeRepeatLocationEffect({ row: 2, col: 2 }, history);
    expect(result).toBeCloseTo(0.08, 2);
  });

  it('バラバラに投げていれば効果 0', () => {
    const history = makeHistory([
      { location: { row: 0, col: 0 } },
      { location: { row: 4, col: 4 } },
    ]);
    expect(computeRepeatLocationEffect({ row: 2, col: 2 }, history)).toBe(0);
  });
});

// ============================================================
// computeHighMiddleBoost
// ============================================================

describe('computeHighMiddleBoost', () => {
  const slowPitch: PitchSelection = { type: 'changeup', velocity: 120, breakLevel: 3 };
  const fastPitch: PitchSelection = { type: 'fastball', velocity: 150 };

  it('高めゾーン (row <= 1, col 1-3) の遅い球は 0.18 ブースト', () => {
    const loc: PitchLocation = { row: 1, col: 2 };
    expect(computeHighMiddleBoost(loc, slowPitch)).toBeCloseTo(0.18, 2);
  });

  it('高めゾーンの速球 (150km/h) は効果が小さい', () => {
    const loc: PitchLocation = { row: 1, col: 2 };
    const result = computeHighMiddleBoost(loc, fastPitch);
    expect(result).toBeLessThan(0.1);
  });

  it('低めゾーン (row >= 3) は効果 0', () => {
    const loc: PitchLocation = { row: 3, col: 2 };
    expect(computeHighMiddleBoost(loc, slowPitch)).toBe(0);
  });

  it('真ん中ゾーン (row = 2) は効果 0', () => {
    const loc: PitchLocation = { row: 2, col: 2 };
    expect(computeHighMiddleBoost(loc, slowPitch)).toBe(0);
  });

  it('高めでもゾーン外 (col 0 or 4) は効果 0', () => {
    const locLeft: PitchLocation = { row: 1, col: 0 };
    const locRight: PitchLocation = { row: 1, col: 4 };
    expect(computeHighMiddleBoost(locLeft, slowPitch)).toBe(0);
    expect(computeHighMiddleBoost(locRight, slowPitch)).toBe(0);
  });
});

// ============================================================
// computeContactRateAdjustment
// ============================================================

describe('computeContactRateAdjustment', () => {
  it('履歴なしなら delta = 0', () => {
    const pitch: PitchSelection = { type: 'fastball', velocity: 140 };
    const result = computeContactRateAdjustment({ row: 2, col: 2 }, pitch, undefined);
    expect(result.delta).toBe(0);
  });

  it('大きな緩急 + コース変化は delta < 0（投手有利）', () => {
    const pitch: PitchSelection = { type: 'fastball', velocity: 150 };
    const history = makeHistory([
      { velocity: 110, location: { row: 2, col: 0 } },
    ]);
    const result = computeContactRateAdjustment({ row: 2, col: 4 }, pitch, history);
    // 緩急 (Δv=40, 0.08) + 出し入れ (距離=4, 0.04) で下がる = 合計 -0.12
    expect(result.delta).toBeLessThan(-0.08);
    expect(result.breakdown.velocityChange).toBeGreaterThan(0.05);
    expect(result.breakdown.locationShift).toBeGreaterThan(0.02);
  });

  it('同一コース連続は delta > 0（投手不利）', () => {
    const pitch: PitchSelection = { type: 'fastball', velocity: 140 };
    const history = makeHistory([
      { velocity: 140, location: { row: 2, col: 2 } },
      { velocity: 140, location: { row: 2, col: 2 } },
    ]);
    const result = computeContactRateAdjustment({ row: 2, col: 2 }, pitch, history);
    expect(result.delta).toBeGreaterThan(0.12);
    expect(result.breakdown.repeatLocation).toBeCloseTo(0.15, 2);
  });
});

// ============================================================
// appendPitchHistory
// ============================================================

describe('appendPitchHistory', () => {
  it('空の履歴に追加できる', () => {
    const entry = makeHistory([{}])[0];
    const result = appendPitchHistory(undefined, entry);
    expect(result.length).toBe(1);
  });

  it('AT_BAT_HISTORY_MAX を超えたらリングバッファで古いものを捨てる', () => {
    let history: PitchHistoryEntry[] = [];
    for (let i = 0; i < AT_BAT_HISTORY_MAX + 5; i++) {
      const entry = makeHistory([{ velocity: 100 + i }])[0];
      history = appendPitchHistory(history, entry);
    }
    expect(history.length).toBe(AT_BAT_HISTORY_MAX);
    // 古いものが捨てられて、最新が残っている
    expect(history[history.length - 1].velocity).toBe(100 + AT_BAT_HISTORY_MAX + 4);
  });
});
