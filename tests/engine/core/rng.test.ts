import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';

describe('RNG', () => {
  it('同じシードから同じ結果を生成する', () => {
    const rng1 = createRNG('test-seed');
    const rng2 = createRNG('test-seed');
    expect(rng1.next()).toBe(rng2.next());
    expect(rng1.next()).toBe(rng2.next());
  });

  it('異なるシードから異なる結果を生成する', () => {
    const rng1 = createRNG('seed-a');
    const rng2 = createRNG('seed-b');
    expect(rng1.next()).not.toBe(rng2.next());
  });

  it('intBetween が指定範囲内の整数を返す', () => {
    const rng = createRNG('int-test');
    for (let i = 0; i < 100; i++) {
      const val = rng.intBetween(1, 10);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(10);
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  it('pick が配列から要素を選ぶ', () => {
    const rng = createRNG('pick-test');
    const arr = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 20; i++) {
      const val = rng.pick(arr);
      expect(arr).toContain(val);
    }
  });

  it('pickN が指定数の重複なし要素を返す', () => {
    const rng = createRNG('pickn-test');
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const picked = rng.pickN(arr, 5);
    expect(picked).toHaveLength(5);
    expect(new Set(picked).size).toBe(5);
    for (const v of picked) {
      expect(arr).toContain(v);
    }
  });

  it('gaussian がおおよそ指定平均付近の値を返す', () => {
    const rng = createRNG('gauss-test');
    const values = Array.from({ length: 1000 }, () => rng.gaussian(50, 10));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(45);
    expect(mean).toBeLessThan(55);
  });

  it('chance が確率に応じた頻度で true を返す', () => {
    const rng = createRNG('chance-test');
    let trueCount = 0;
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      if (rng.chance(0.3)) trueCount++;
    }
    const ratio = trueCount / trials;
    expect(ratio).toBeGreaterThan(0.25);
    expect(ratio).toBeLessThan(0.35);
  });

  it('derive が再現可能なサブRNGを生成する', () => {
    const rng1 = createRNG('parent');
    const rng2 = createRNG('parent');
    const sub1 = rng1.derive('child');
    const sub2 = rng2.derive('child');
    expect(sub1.next()).toBe(sub2.next());
  });
});
