import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { applyControlError } from '@/engine/match/pitch/control-error';
import type { PitchLocation } from '@/engine/match/types';

describe('applyControlError', () => {
  it('コントロール100で誤差がほぼ0（狙いどおりの着弾）', () => {
    const target: PitchLocation = { row: 2, col: 2 };
    let sameCount = 0;
    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`ctrl100-${i}`);
      const actual = applyControlError(target, 100, rng);
      if (actual.row === target.row && actual.col === target.col) sameCount++;
    }
    // コントロール=100では誤差=0 → 常に同じ
    expect(sameCount).toBe(100);
  });

  it('コントロール20で誤差が大きくブレる', () => {
    const target: PitchLocation = { row: 2, col: 2 };
    let diffCount = 0;
    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`ctrl20-${i}`);
      const actual = applyControlError(target, 20, rng);
      if (actual.row !== target.row || actual.col !== target.col) diffCount++;
    }
    // コントロール20でほとんどの球がブレる（70%以上期待）
    expect(diffCount).toBeGreaterThan(60);
  });

  it('着弾コースは常に 0-4 の範囲内', () => {
    const target: PitchLocation = { row: 2, col: 2 };
    for (let i = 0; i < 200; i++) {
      const rng = createRNG(`range-check-${i}`);
      const actual = applyControlError(target, 0, rng); // 最悪コントロール
      expect(actual.row).toBeGreaterThanOrEqual(0);
      expect(actual.row).toBeLessThanOrEqual(4);
      expect(actual.col).toBeGreaterThanOrEqual(0);
      expect(actual.col).toBeLessThanOrEqual(4);
    }
  });

  it('コントロール50で中程度のブレ', () => {
    const target: PitchLocation = { row: 2, col: 2 };
    let diffCount = 0;
    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`ctrl50-${i}`);
      const actual = applyControlError(target, 50, rng);
      if (actual.row !== target.row || actual.col !== target.col) diffCount++;
    }
    // コントロール50では半数前後がブレる想定
    expect(diffCount).toBeGreaterThan(20);
    expect(diffCount).toBeLessThan(85);
  });
});
