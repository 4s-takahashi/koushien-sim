/**
 * catcher-target-location.test.ts — キャッチャー要求位置生成テスト
 *
 * 設計書 Section 6.1 のテストケースを実装。
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { generateCatcherRequest } from '@/engine/match/pitch/catcher-target-location';
import type { CatcherRequestContext } from '@/engine/match/pitch/catcher-target-location';

// ============================================================
// テストヘルパー
// ============================================================

function makeCtx(overrides: Partial<CatcherRequestContext> = {}): CatcherRequestContext {
  return {
    catcherProfile: { personality: 'cautious', leadershipScore: 50, callingAccuracy: 50 },
    catcherFielding: 50,
    catcherMental: 50,
    pitcherControl: 60,
    pitcherStamina: 80,
    count: { balls: 0, strikes: 0 },
    ...overrides,
  };
}

function countManagerOrderApplied(
  ctx: CatcherRequestContext,
  trials: number,
  seed = 'test',
): number {
  let count = 0;
  for (let i = 0; i < trials; i++) {
    const rng = createRNG(`${seed}-${i}`);
    const result = generateCatcherRequest(ctx, rng);
    if (result.isManagerOrderApplied) count++;
  }
  return count;
}

// ============================================================
// テスト
// ============================================================

describe('generateCatcherRequest', () => {
  it('戻り値に requestLocation, isManagerOrderApplied, requestQuality が含まれる', () => {
    const ctx = makeCtx();
    const rng = createRNG('basic-test');
    const result = generateCatcherRequest(ctx, rng);

    expect(result.requestLocation).toBeDefined();
    expect(typeof result.requestLocation.row).toBe('number');
    expect(typeof result.requestLocation.col).toBe('number');
    expect(typeof result.isManagerOrderApplied).toBe('boolean');
    expect(typeof result.requestQuality).toBe('number');
  });

  it('requestLocation の row/col は 5×5グリッド内 (0-4)', () => {
    const ctx = makeCtx();
    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`grid-test-${i}`);
      const result = generateCatcherRequest(ctx, rng);
      expect(result.requestLocation.row).toBeGreaterThanOrEqual(0);
      expect(result.requestLocation.row).toBeLessThanOrEqual(4);
      expect(result.requestLocation.col).toBeGreaterThanOrEqual(0);
      expect(result.requestLocation.col).toBeLessThanOrEqual(4);
    }
  });

  it('callingAccuracy=100 のキャッチャーは requestQuality が高い (>= 0.7)', () => {
    const ctx = makeCtx({
      catcherProfile: { personality: 'analytical', leadershipScore: 80, callingAccuracy: 100 },
      catcherMental: 100,
      pitcherControl: 100,
    });
    const rng = createRNG('high-quality-test');
    const result = generateCatcherRequest(ctx, rng);
    expect(result.requestQuality).toBeGreaterThanOrEqual(0.7);
  });

  it('callingAccuracy=100 のキャッチャーはゾーン内コースを多く要求する (>= 60%)', () => {
    const ctx = makeCtx({
      catcherProfile: { personality: 'analytical', leadershipScore: 80, callingAccuracy: 100 },
      catcherMental: 80,
      pitcherControl: 80,
    });
    let zoneCount = 0;
    const trials = 500;
    for (let i = 0; i < trials; i++) {
      const rng = createRNG(`zone-test-${i}`);
      const result = generateCatcherRequest(ctx, rng);
      const { row, col } = result.requestLocation;
      if (row >= 1 && row <= 3 && col >= 1 && col <= 3) {
        zoneCount++;
      }
    }
    expect(zoneCount / trials).toBeGreaterThan(0.60);
  });

  it('managerOrder がある場合、complianceRate=1.0 で必ず isManagerOrderApplied=true', () => {
    const ctx = makeCtx({
      managerOrder: { type: 'catcher_detailed', focusArea: 'outside', callingStyle: 'attack' },
      managerComplianceRate: 1.0,
    });
    const count = countManagerOrderApplied(ctx, 50, 'compliance-100');
    expect(count).toBe(50);
  });

  it('managerOrder がある場合、complianceRate=0 で isManagerOrderApplied=false', () => {
    const ctx = makeCtx({
      managerOrder: { type: 'catcher_detailed', focusArea: 'outside' },
      managerComplianceRate: 0,
    });
    const count = countManagerOrderApplied(ctx, 50, 'compliance-0');
    expect(count).toBe(0);
  });

  it('managerOrder がない場合は isManagerOrderApplied=false', () => {
    const ctx = makeCtx();
    const rng = createRNG('no-order-test');
    const result = generateCatcherRequest(ctx, rng);
    expect(result.isManagerOrderApplied).toBe(false);
  });

  it('focusArea=outside の監督指示は col=3 を要求する（compliance=1.0）', () => {
    const ctx = makeCtx({
      catcherProfile: { personality: 'cautious', leadershipScore: 50, callingAccuracy: 80 },
      managerOrder: { type: 'catcher_detailed', focusArea: 'outside', callingStyle: 'attack' },
      managerComplianceRate: 1.0,
    });
    let outsideCount = 0;
    const trials = 200;
    for (let i = 0; i < trials; i++) {
      const rng = createRNG(`outside-test-${i}`);
      const result = generateCatcherRequest(ctx, rng);
      if (result.isManagerOrderApplied && result.requestLocation.col === 3) {
        outsideCount++;
      }
    }
    // compliance=1.0 かつ focusArea=outside → 大半が col=3 になるはず
    expect(outsideCount / trials).toBeGreaterThan(0.5);
  });

  it('requestQuality は 0-1 の範囲内', () => {
    const ctx = makeCtx();
    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`quality-range-${i}`);
      const result = generateCatcherRequest(ctx, rng);
      expect(result.requestQuality).toBeGreaterThanOrEqual(0);
      expect(result.requestQuality).toBeLessThanOrEqual(1);
    }
  });

  it('pitcherControl が低い場合は requestQuality が低下する', () => {
    const highControlCtx = makeCtx({ pitcherControl: 100, catcherMental: 80,
      catcherProfile: { personality: 'analytical', leadershipScore: 80, callingAccuracy: 80 } });
    const lowControlCtx = makeCtx({ pitcherControl: 10, catcherMental: 80,
      catcherProfile: { personality: 'analytical', leadershipScore: 80, callingAccuracy: 80 } });

    let highTotal = 0;
    let lowTotal = 0;
    const trials = 100;
    for (let i = 0; i < trials; i++) {
      const rng = createRNG(`control-quality-${i}`);
      highTotal += generateCatcherRequest(highControlCtx, rng).requestQuality;
      const rng2 = createRNG(`control-quality-${i}`);
      lowTotal += generateCatcherRequest(lowControlCtx, rng2).requestQuality;
    }
    expect(highTotal / trials).toBeGreaterThan(lowTotal / trials);
  });
});
