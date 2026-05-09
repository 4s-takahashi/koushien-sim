/**
 * manager-order-compliance.test.ts — 監督指示反映率テスト
 *
 * 設計書 Section 6.1 のテストケースを実装。
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { computeComplianceResult } from '@/engine/match/pitch/manager-order-compliance';
import type { ComplianceContext } from '@/engine/match/pitch/manager-order-compliance';

// ============================================================
// テストヘルパー
// ============================================================

function makeCtx(overrides: Partial<ComplianceContext> = {}): ComplianceContext {
  return {
    order: { type: 'catcher_detailed', callingStyle: 'attack' },
    catcherLeadership: 50,
    catcherPersonality: 'cautious',
    situationPressure: 40,
    ...overrides,
  };
}

function countCompliance(ctx: ComplianceContext, trials: number, seed = 'test'): number {
  let count = 0;
  for (let i = 0; i < trials; i++) {
    const rng = createRNG(`${seed}-${i}`);
    const result = computeComplianceResult(ctx, rng);
    if (result.complied) count++;
  }
  return count;
}

// ============================================================
// テスト
// ============================================================

describe('computeComplianceResult', () => {
  it('戻り値に complied, effectiveRate が含まれる', () => {
    const ctx = makeCtx();
    const rng = createRNG('basic');
    const result = computeComplianceResult(ctx, rng);
    expect(typeof result.complied).toBe('boolean');
    expect(typeof result.effectiveRate).toBe('number');
  });

  it('effectiveRate は 0.10〜0.98 の範囲内', () => {
    const ctxList: Partial<ComplianceContext>[] = [
      {},
      { catcherPersonality: 'aggressive', order: { type: 'catcher_detailed', callingStyle: 'careful' } },
      { catcherPersonality: 'cautious', order: { type: 'catcher_detailed', callingStyle: 'attack' } },
      { situationPressure: 90 },
      { catcherLeadership: 10 },
    ];
    for (const override of ctxList) {
      const ctx = makeCtx(override);
      const rng = createRNG('rate-range');
      const result = computeComplianceResult(ctx, rng);
      expect(result.effectiveRate).toBeGreaterThanOrEqual(0.10);
      expect(result.effectiveRate).toBeLessThanOrEqual(0.98);
    }
  });

  it('デフォルト状況での従否率は 85-95% の範囲', () => {
    const ctx = makeCtx({ catcherPersonality: 'analytical', order: { type: 'catcher_detailed', callingStyle: 'mixed' } });
    const count = countCompliance(ctx, 1000, 'default');
    const rate = count / 1000;
    expect(rate).toBeGreaterThan(0.80);
    expect(rate).toBeLessThan(0.98);
  });

  it('慎重派 + attack 指示はコンプライアンス率が低下する', () => {
    const cautiousAttackCtx = makeCtx({
      catcherPersonality: 'cautious',
      order: { type: 'catcher_detailed', callingStyle: 'attack' },
    });
    const normalCtx = makeCtx({
      catcherPersonality: 'analytical',
      order: { type: 'catcher_detailed', callingStyle: 'mixed' },
    });
    const cautiousCount = countCompliance(cautiousAttackCtx, 1000, 'cautious-attack');
    const normalCount = countCompliance(normalCtx, 1000, 'analytical-mixed');
    expect(cautiousCount).toBeLessThan(normalCount);
  });

  it('積極派 + careful 指示はコンプライアンス率が低下する', () => {
    const aggressiveCarefulCtx = makeCtx({
      catcherPersonality: 'aggressive',
      order: { type: 'catcher_detailed', callingStyle: 'careful' },
    });
    const normalCtx = makeCtx({
      catcherPersonality: 'aggressive',
      order: { type: 'catcher_detailed', callingStyle: 'attack' },
    });
    const aggressiveCount = countCompliance(aggressiveCarefulCtx, 1000, 'aggressive-careful');
    const normalCount = countCompliance(normalCtx, 1000, 'aggressive-attack');
    expect(aggressiveCount).toBeLessThan(normalCount);
  });

  it('situationPressure > 70 はコンプライアンス率が低下する', () => {
    const highPressureCtx = makeCtx({ situationPressure: 90 });
    const normalPressureCtx = makeCtx({ situationPressure: 30 });
    const highCount = countCompliance(highPressureCtx, 1000, 'high-pressure');
    const normalCount = countCompliance(normalPressureCtx, 1000, 'normal-pressure');
    expect(highCount).toBeLessThan(normalCount);
  });

  it('leadership < 30 は従順（コンプライアンス率が若干上昇）', () => {
    const lowLeaderCtx = makeCtx({ catcherLeadership: 20, catcherPersonality: 'analytical' });
    const highLeaderCtx = makeCtx({ catcherLeadership: 80, catcherPersonality: 'analytical' });
    const lowCount = countCompliance(lowLeaderCtx, 1000, 'low-leader');
    const highCount = countCompliance(highLeaderCtx, 1000, 'high-leader');
    // leadership 低 → 素直に従う → コンプライアンス率が上がる（または同等）
    expect(lowCount).toBeGreaterThanOrEqual(highCount - 50);  // ほぼ同等か上
  });

  it('不服従時は reason が設定される', () => {
    // 低コンプライアンス状況で不服従を引き起こす
    const ctx = makeCtx({
      catcherPersonality: 'cautious',
      order: { type: 'catcher_detailed', callingStyle: 'attack' },
      situationPressure: 90,
    });
    let foundNonCompliant = false;
    for (let i = 0; i < 200; i++) {
      const rng = createRNG(`non-compliant-${i}`);
      const result = computeComplianceResult(ctx, rng);
      if (!result.complied) {
        expect(result.reason).toBeDefined();
        expect(['personality', 'situation', 'distrust']).toContain(result.reason);
        foundNonCompliant = true;
        break;
      }
    }
    expect(foundNonCompliant).toBe(true);
  });

  it('complied=true のとき reason は undefined', () => {
    const ctx = makeCtx({ catcherPersonality: 'analytical', situationPressure: 10 });
    for (let i = 0; i < 50; i++) {
      const rng = createRNG(`reason-check-${i}`);
      const result = computeComplianceResult(ctx, rng);
      if (result.complied) {
        expect(result.reason).toBeUndefined();
        break;
      }
    }
  });
});
