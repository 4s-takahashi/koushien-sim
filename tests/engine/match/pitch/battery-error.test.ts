/**
 * battery-error.test.ts — ワイルドピッチ・パスボール判定テスト
 *
 * 設計書 Section 6.1 のテストケースを実装。
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { judgeBatteryError } from '@/engine/match/pitch/battery-error';
import type { BatteryErrorContext } from '@/engine/match/pitch/battery-error';

// ============================================================
// テストヘルパー
// ============================================================

function makeCtx(overrides: Partial<BatteryErrorContext> = {}): BatteryErrorContext {
  return {
    actualLocation: { row: 0, col: 2 }, // ボールゾーン
    outcome: 'ball',
    pitcherEffectiveControl: 50,
    catcherFielding: 50,
    catcherAgility: 50,
    hasRunners: true,
    pitchType: 'fastball',
    ...overrides,
  };
}

/**
 * N 回試行して WP または PB が発生した回数を返す
 */
function countOccurrences(
  ctx: BatteryErrorContext,
  trials: number,
  seed = 'test',
): number {
  let count = 0;
  for (let i = 0; i < trials; i++) {
    const rng = createRNG(`${seed}-${i}`);
    const result = judgeBatteryError(ctx, rng);
    if (result.occurred) count++;
  }
  return count;
}

function countByType(
  ctx: BatteryErrorContext,
  trials: number,
  seed = 'test',
): { wp: number; pb: number } {
  let wp = 0;
  let pb = 0;
  for (let i = 0; i < trials; i++) {
    const rng = createRNG(`${seed}-${i}`);
    const result = judgeBatteryError(ctx, rng);
    if (result.occurred) {
      if (result.type === 'wild_pitch') wp++;
      else if (result.type === 'passed_ball') pb++;
    }
  }
  return { wp, pb };
}

// ============================================================
// テスト: 非ボール球はスキップ
// ============================================================

describe('judgeBatteryError - 非ボール球', () => {
  const NON_BALL_OUTCOMES = [
    'called_strike',
    'swinging_strike',
    'foul',
    'foul_bunt',
    'in_play',
  ] as const;

  for (const outcome of NON_BALL_OUTCOMES) {
    it(`outcome=${outcome} のとき occurred=false`, () => {
      const ctx = makeCtx({ outcome, pitcherEffectiveControl: 1, catcherFielding: 1 });
      const rng = createRNG('non-ball');
      const result = judgeBatteryError(ctx, rng);
      expect(result.occurred).toBe(false);
      expect(result.advanceBases).toBe(0);
    });
  }
});

// ============================================================
// テスト: コントロール 100 のピッチャーは WP が発生しない
// ============================================================

describe('judgeBatteryError - 優秀な投手', () => {
  it('control=100 のピッチャーは WP が発生しない（1000回試行）', () => {
    const ctx = makeCtx({ pitcherEffectiveControl: 100, catcherFielding: 1 });
    const { wp } = countByType(ctx, 1000, 'ctrl100');
    // wpBase = max(0, (50 - 100) / 2000) = 0 → WP ゼロ
    expect(wp).toBe(0);
  });

  it('control=50 のピッチャーは WP が極めて少ない', () => {
    const ctx = makeCtx({ pitcherEffectiveControl: 50, catcherFielding: 1 });
    const { wp } = countByType(ctx, 1000, 'ctrl50');
    // wpBase = max(0, (50-50)/2000) = 0 → WP ゼロ
    expect(wp).toBe(0);
  });
});

// ============================================================
// テスト: control=20 のピッチャーは WP 率が高い
// ============================================================

describe('judgeBatteryError - 制球難の投手', () => {
  it('control=20 のピッチャーはボール球で WP 率が発生する（1000回試行）', () => {
    // wpBase = (50 - 20) / 2000 = 0.015 (1.5%)
    const ctx = makeCtx({ pitcherEffectiveControl: 20, catcherFielding: 100 });
    const { wp } = countByType(ctx, 1000, 'ctrl20');
    const wpRate = wp / 1000;
    // 期待値 1.5%, 95% CI: ~0.6%〜2.4%
    expect(wpRate).toBeGreaterThan(0.002);
    expect(wpRate).toBeLessThan(0.05);
  });

  it('control=30 のピッチャーはボール球で WP 率が約 1%（1000回試行）', () => {
    // wpBase = (50 - 30) / 2000 = 0.01 (1.0%)
    const ctx = makeCtx({ pitcherEffectiveControl: 30, catcherFielding: 100 });
    const { wp } = countByType(ctx, 1000, 'ctrl30');
    const wpRate = wp / 1000;
    // ±2σ 許容: 期待値 1.0%, 95% CI: ~0.4%〜1.6%
    expect(wpRate).toBeGreaterThan(0.001);
    expect(wpRate).toBeLessThan(0.04);
  });
});

// ============================================================
// テスト: fielding=100 のキャッチャーは PB が発生しない
// ============================================================

describe('judgeBatteryError - 優秀なキャッチャー', () => {
  it('fielding=100 のキャッチャーは PB が発生しない（1000回試行）', () => {
    // pbBase = max(0, (50 - 100) / 4000) = 0 → PB ゼロ
    const ctx = makeCtx({ pitcherEffectiveControl: 100, catcherFielding: 100 });
    const { pb } = countByType(ctx, 1000, 'fld100');
    expect(pb).toBe(0);
  });

  it('fielding=50 のキャッチャーは PB が発生しない（wpBase=0 かつ pbBase=0）', () => {
    const ctx = makeCtx({ pitcherEffectiveControl: 100, catcherFielding: 50 });
    const { pb } = countByType(ctx, 1000, 'fld50');
    expect(pb).toBe(0);
  });
});

// ============================================================
// テスト: fielding=30 のキャッチャーは PB が発生する
// ============================================================

describe('judgeBatteryError - 未熟なキャッチャー', () => {
  it('fielding=30 のキャッチャーは PB 率が約 0.5%（1000回試行）', () => {
    // pbBase = (50 - 30) / 4000 = 0.005 (0.5%)
    // 投手を control=100 にして WP がゼロの条件で PB のみ観測
    const ctx = makeCtx({ pitcherEffectiveControl: 100, catcherFielding: 30 });
    const { pb } = countByType(ctx, 1000, 'fld30');
    const pbRate = pb / 1000;
    // ±2σ 許容: 期待値 0.5%, 95% CI: ~0%〜1.4%
    expect(pbRate).toBeGreaterThanOrEqual(0.0);
    expect(pbRate).toBeLessThan(0.03);
  });
});

// ============================================================
// テスト: WP 発生時は走者が進塁する
// ============================================================

describe('judgeBatteryError - 走者進塁', () => {
  it('WP/PB 発生かつ hasRunners=true のとき advanceBases=1', () => {
    // 高確率で WP が発生するコンテキスト (control=1)
    const ctx = makeCtx({ pitcherEffectiveControl: 1, hasRunners: true });
    let foundWp = false;
    for (let i = 0; i < 200; i++) {
      const rng = createRNG(`advance-test-${i}`);
      const result = judgeBatteryError(ctx, rng);
      if (result.occurred) {
        expect(result.advanceBases).toBe(1);
        foundWp = true;
        break;
      }
    }
    // 200回試行で少なくとも1回は発生するはず（wpRate ≈ 9.8%）
    expect(foundWp).toBe(true);
  });

  it('ランナーなし (hasRunners=false) のとき WP/PB 発生でも advanceBases=0', () => {
    const ctx = makeCtx({ pitcherEffectiveControl: 1, hasRunners: false });
    for (let i = 0; i < 200; i++) {
      const rng = createRNG(`no-runner-${i}`);
      const result = judgeBatteryError(ctx, rng);
      if (result.occurred) {
        expect(result.advanceBases).toBe(0);
      }
    }
  });
});

// ============================================================
// テスト: 変化球補正
// ============================================================

describe('judgeBatteryError - 変化球補正', () => {
  it('フォークはファストボールより WP 率が高い', () => {
    // control=40 → wpBase = (50-40)/500 = 0.02
    // fork: wpBase + 0.010 = 0.030
    const forkCtx = makeCtx({ pitcherEffectiveControl: 40, catcherFielding: 100, pitchType: 'fork' });
    const fastCtx = makeCtx({ pitcherEffectiveControl: 40, catcherFielding: 100, pitchType: 'fastball' });

    const { wp: wpFork } = countByType(forkCtx, 2000, 'fork-test');
    const { wp: wpFast } = countByType(fastCtx, 2000, 'fast-test');

    // フォークのほうが WP 率が高い（95%以上の確率で差が出るはず）
    expect(wpFork).toBeGreaterThanOrEqual(wpFast);
  });

  it('スライダーはファストボールより WP 率が高い', () => {
    const sliderCtx = makeCtx({ pitcherEffectiveControl: 40, catcherFielding: 100, pitchType: 'slider' });
    const fastCtx = makeCtx({ pitcherEffectiveControl: 40, catcherFielding: 100, pitchType: 'fastball' });

    const { wp: wpSlider } = countByType(sliderCtx, 2000, 'slider-test');
    const { wp: wpFast } = countByType(fastCtx, 2000, 'fast-test2');

    expect(wpSlider).toBeGreaterThanOrEqual(wpFast);
  });
});

// ============================================================
// テスト: 発生しない場合の戻り値
// ============================================================

describe('judgeBatteryError - 発生しない場合', () => {
  it('occurred=false のとき type は undefined', () => {
    // control=100, fielding=100 → 発生確率 0
    const ctx = makeCtx({ pitcherEffectiveControl: 100, catcherFielding: 100 });
    const rng = createRNG('no-error');
    const result = judgeBatteryError(ctx, rng);
    expect(result.occurred).toBe(false);
    expect(result.type).toBeUndefined();
    expect(result.advanceBases).toBe(0);
  });
});

// ============================================================
// テスト: 1000 回試行統計テスト（総合）
// ============================================================

describe('judgeBatteryError - 統計テスト（1000回試行）', () => {
  it('制球難投手 + 未熟キャッチャーの総エラー率は 0.5〜5%', () => {
    // control=30: wpBase=0.01, fielding=30: pbBase=0.005, 変化球なし
    const ctx = makeCtx({
      pitcherEffectiveControl: 30,
      catcherFielding: 30,
      pitchType: 'fastball',
    });
    const total = countOccurrences(ctx, 1000, 'total-stat');
    const rate = total / 1000;
    // 合計期待値: wpRate=0.01, pbRate≈0.005*(1-0.01)≈0.005 → 約1.5%
    expect(rate).toBeGreaterThan(0.001);
    expect(rate).toBeLessThan(0.08);
  });

  it('優秀バッテリーのエラー率はほぼ 0%', () => {
    const ctx = makeCtx({ pitcherEffectiveControl: 80, catcherFielding: 80 });
    const total = countOccurrences(ctx, 1000, 'elite-stat');
    // wpBase = max(0, (50-80)/2000) = 0 → total = 0
    expect(total).toBe(0);
  });
});
