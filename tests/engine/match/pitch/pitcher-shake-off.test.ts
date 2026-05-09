/**
 * pitcher-shake-off.test.ts — ピッチャー首振り判定テスト
 *
 * 設計書 Section 6.1 のテストケースを実装。
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { decidePitcherShakeOff } from '@/engine/match/pitch/pitcher-shake-off';
import type { ShakeOffContext } from '@/engine/match/pitch/pitcher-shake-off';

// ============================================================
// テストヘルパー
// ============================================================

function makeCtx(overrides: Partial<ShakeOffContext> = {}): ShakeOffContext {
  return {
    catcherRequest: { row: 2, col: 2 },
    pitcherMental: 60,
    pitcherExperience: 30,
    batteryTrust: 60,
    pitcherTraits: [],
    ...overrides,
  };
}

function countShakeOffs(ctx: ShakeOffContext, trials: number, seed = 'test'): number {
  let count = 0;
  for (let i = 0; i < trials; i++) {
    const rng = createRNG(`${seed}-${i}`);
    const result = decidePitcherShakeOff(ctx, rng);
    if (result.isShakeOff) count++;
  }
  return count;
}

// ============================================================
// テスト
// ============================================================

describe('decidePitcherShakeOff', () => {
  it('首を縦に振った場合、targetLocation は catcherRequest と同一', () => {
    const ctx = makeCtx({ batteryTrust: 100 });
    // batteryTrust=100 → 首振り率が最低に近い → 多くは首縦
    let foundNodding = false;
    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`nod-test-${i}`);
      const result = decidePitcherShakeOff(ctx, rng);
      if (!result.isShakeOff) {
        expect(result.targetLocation).toEqual(ctx.catcherRequest);
        foundNodding = true;
        break;
      }
    }
    expect(foundNodding).toBe(true);
  });

  it('首を振った場合、targetLocation は catcherRequest と異なる（大半のケース）', () => {
    // stubborn + low batteryTrust → 首振りが多発
    const ctx = makeCtx({ pitcherTraits: ['stubborn'], batteryTrust: 20, pitcherMental: 30 });
    let differentCount = 0;
    let shakeOffCount = 0;
    const trials = 200;
    for (let i = 0; i < trials; i++) {
      const rng = createRNG(`shake-test-${i}`);
      const result = decidePitcherShakeOff(ctx, rng);
      if (result.isShakeOff) {
        shakeOffCount++;
        const req = ctx.catcherRequest;
        if (result.targetLocation.row !== req.row || result.targetLocation.col !== req.col) {
          differentCount++;
        }
      }
    }
    // 首振り時は targetLocation が異なるはず（一部同じになることもありうる）
    if (shakeOffCount > 0) {
      expect(differentCount / shakeOffCount).toBeGreaterThan(0.7);
    }
  });

  it('batteryTrust=100 のバッテリーは首振り率が低い (< 10%)', () => {
    const ctx = makeCtx({ batteryTrust: 100 });
    const count = countShakeOffs(ctx, 1000, 'trust-100');
    expect(count / 1000).toBeLessThan(0.10);
  });

  it('stubborn 特性の投手は首振り率が高い (> 20%)', () => {
    const ctx = makeCtx({ pitcherTraits: ['stubborn'], batteryTrust: 50 });
    const count = countShakeOffs(ctx, 1000, 'stubborn');
    expect(count / 1000).toBeGreaterThan(0.20);
  });

  it('batteryTrust=10 は首振り率が高い (> 20%)', () => {
    const ctx = makeCtx({ batteryTrust: 10 });
    const count = countShakeOffs(ctx, 1000, 'low-trust');
    expect(count / 1000).toBeGreaterThan(0.20);
  });

  it('pitcherMental < 40 は首振り率が上昇する', () => {
    const normalCtx = makeCtx({ pitcherMental: 70, batteryTrust: 50 });
    const lowMentalCtx = makeCtx({ pitcherMental: 30, batteryTrust: 50 });
    const normalCount = countShakeOffs(normalCtx, 1000, 'mental-normal');
    const lowCount = countShakeOffs(lowMentalCtx, 1000, 'mental-low');
    expect(lowCount).toBeGreaterThan(normalCount);
  });

  it('pitcherExperience > 80 は首振り率が上昇する', () => {
    const freshCtx = makeCtx({ pitcherExperience: 20, batteryTrust: 60 });
    const tiredCtx = makeCtx({ pitcherExperience: 100, batteryTrust: 60 });
    const freshCount = countShakeOffs(freshCtx, 1000, 'fresh');
    const tiredCount = countShakeOffs(tiredCtx, 1000, 'tired');
    expect(tiredCount).toBeGreaterThan(freshCount);
  });

  it('targetLocation は 5×5グリッド内 (0-4) に収まる', () => {
    const ctx = makeCtx({ pitcherTraits: ['stubborn'], batteryTrust: 10 });
    for (let i = 0; i < 200; i++) {
      const rng = createRNG(`bounds-test-${i}`);
      const result = decidePitcherShakeOff(ctx, rng);
      expect(result.targetLocation.row).toBeGreaterThanOrEqual(0);
      expect(result.targetLocation.row).toBeLessThanOrEqual(4);
      expect(result.targetLocation.col).toBeGreaterThanOrEqual(0);
      expect(result.targetLocation.col).toBeLessThanOrEqual(4);
    }
  });

  it('isShakeOff と targetLocation の組み合わせが一貫している', () => {
    const ctx = makeCtx();
    for (let i = 0; i < 50; i++) {
      const rng = createRNG(`consistency-${i}`);
      const result = decidePitcherShakeOff(ctx, rng);
      expect(typeof result.isShakeOff).toBe('boolean');
      expect(result.targetLocation).toBeDefined();
      if (!result.isShakeOff) {
        expect(result.targetLocation).toEqual(ctx.catcherRequest);
      }
    }
  });
});
