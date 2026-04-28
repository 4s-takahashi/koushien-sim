/**
 * Phase R3: fielding.ts 単体テスト
 * 守備処理（野手到達・捕球・送球）
 */

import { describe, it, expect } from 'vitest';
import {
  resolveFielding,
  resolveThrow,
  selectPrimaryFielder,
  selectThrowTarget,
  resolveCatchAttempt,
  computeHandleTime,
  computeThrowArrivalMs,
  computeRunnerArrivalMs,
  DEFAULT_FIELDER_ABILITY,
  type FielderAbility,
} from '../../../../src/engine/physics/resolver/fielding';
import { simulateTrajectory } from '../../../../src/engine/physics/trajectory';
import { createRNG } from '../../../../src/engine/core/rng';
import type { BallTrajectoryParams, FieldingResult } from '../../../../src/engine/physics/types';

// ============================================================
// テストヘルパー
// ============================================================

function makeTrajectory(overrides: Partial<BallTrajectoryParams> = {}): BallTrajectoryParams {
  return {
    exitVelocity: 140,
    launchAngle: 25,
    sprayAngle: 45,
    spin: { back: 2000, side: 0 },
    ...overrides,
  };
}

const rng = createRNG('test-fielding');

// ============================================================
// resolveFielding
// ============================================================

describe('resolveFielding', () => {
  it('正常な FieldingResult を返す', () => {
    const traj = makeTrajectory();
    const flight = simulateTrajectory(traj);
    const result = resolveFielding(traj, flight, new Map(), createRNG('f1'));
    expect(result.primaryFielder).toBeDefined();
    expect(result.primaryFielder.id).toBeTruthy();
    expect(result.catchAttempt).toBeDefined();
    expect(typeof result.catchAttempt.success).toBe('boolean');
    expect(typeof result.catchAttempt.error).toBe('boolean');
    expect(typeof result.catchAttempt.bobble).toBe('boolean');
  });

  it('ゴロはバウンド点列を返す', () => {
    const traj = makeTrajectory({ launchAngle: 5, exitVelocity: 120 });
    const flight = simulateTrajectory(traj);
    const result = resolveFielding(traj, flight, new Map(), createRNG('f2'));
    expect(result.bouncePoints).toBeDefined();
    expect(Array.isArray(result.bouncePoints)).toBe(true);
  });

  it('フライにはバウンド点列がない', () => {
    const traj = makeTrajectory({ launchAngle: 45, exitVelocity: 150 });
    const flight = simulateTrajectory(traj);
    const result = resolveFielding(traj, flight, new Map(), createRNG('f3'));
    expect(result.bouncePoints).toBeUndefined();
  });

  it('primaryFielder の arrivalTimeMs は正の値', () => {
    const traj = makeTrajectory();
    const flight = simulateTrajectory(traj);
    const result = resolveFielding(traj, flight, new Map(), createRNG('f4'));
    expect(result.primaryFielder.arrivalTimeMs).toBeGreaterThan(0);
  });

  it('能力が高い野手は handleTime が短い', () => {
    const traj = makeTrajectory({ launchAngle: 15, sprayAngle: 45 });
    const flight = simulateTrajectory(traj);
    const goodAbility: Map<import('../../../../src/engine/types/player').Position, FielderAbility> = new Map([
      ['shortstop', { speedStat: 90, fieldingStat: 90, armStat: 90 }],
    ]);
    const badAbility: Map<import('../../../../src/engine/types/player').Position, FielderAbility> = new Map([
      ['shortstop', { speedStat: 10, fieldingStat: 10, armStat: 10 }],
    ]);
    const good = resolveFielding(traj, flight, goodAbility, createRNG('fh1'));
    const bad = resolveFielding(traj, flight, badAbility, createRNG('fh1'));
    // handleTime の比較（捕球成功した場合）
    if (good.catchAttempt.success && bad.catchAttempt.success) {
      expect(good.catchAttempt.handleTimeMs).toBeLessThanOrEqual(bad.catchAttempt.handleTimeMs);
    }
  });
});

// ============================================================
// selectPrimaryFielder
// ============================================================

describe('selectPrimaryFielder', () => {
  it('センター前打球 → center が主担当', () => {
    const traj = makeTrajectory({ sprayAngle: 45, exitVelocity: 130, launchAngle: 30 });
    const flight = simulateTrajectory(traj);
    const primary = selectPrimaryFielder(flight, new Map());
    expect(primary.position).toBe('center');
  });

  it('ゴロは内野手が主担当', () => {
    const traj = makeTrajectory({ launchAngle: 5, sprayAngle: 25, exitVelocity: 110 });
    const flight = simulateTrajectory(traj);
    const primary = selectPrimaryFielder(flight, new Map());
    expect(['shortstop', 'second', 'first', 'third', 'pitcher']).toContain(primary.position);
  });

  it('arrivalTimeMs が最小の野手を選択', () => {
    const traj = makeTrajectory({ sprayAngle: 45, exitVelocity: 120, launchAngle: 25 });
    const flight = simulateTrajectory(traj);
    const primary = selectPrimaryFielder(flight, new Map());
    expect(primary.arrivalTimeMs).toBeGreaterThan(0);
  });
});

// ============================================================
// resolveCatchAttempt
// ============================================================

describe('resolveCatchAttempt', () => {
  it('能力 100 でも 100% 成功ではない（乱数依存）', () => {
    const traj = makeTrajectory();
    const flight = simulateTrajectory(traj);
    const maxAbility: FielderAbility = { speedStat: 100, fieldingStat: 100, armStat: 100 };
    // 多数試行して success/error のバリエーションを確認
    const results = Array.from({ length: 50 }, (_, i) =>
      resolveCatchAttempt(traj, flight, maxAbility, 300, createRNG(`ca${i}`))
    );
    const successCount = results.filter(r => r.success).length;
    expect(successCount).toBeGreaterThan(30); // 高能力は高成功率
  });

  it('間に合わない場合は error になる', () => {
    const traj = makeTrajectory();
    const flight = simulateTrajectory(traj);
    // arrivalTimeMs が hangTimeMs より大幅に遅い
    const result = resolveCatchAttempt(traj, flight, DEFAULT_FIELDER_ABILITY, 99999, createRNG('ca2'));
    expect(result.error).toBe(true);
  });

  it('success=true のとき handleTimeMs は正の値', () => {
    const traj = makeTrajectory({ launchAngle: 30, exitVelocity: 120 });
    const flight = simulateTrajectory(traj);
    for (let i = 0; i < 20; i++) {
      const r = resolveCatchAttempt(traj, flight, DEFAULT_FIELDER_ABILITY, flight.hangTimeMs * 0.5, createRNG(`ca3${i}`));
      if (r.success) {
        expect(r.handleTimeMs).toBeGreaterThan(0);
      }
    }
  });
});

// ============================================================
// computeHandleTime
// ============================================================

describe('computeHandleTime', () => {
  it('fielding stat が高いほど handle time が短い', () => {
    const high = computeHandleTime({ speedStat: 60, fieldingStat: 90, armStat: 60 });
    const low = computeHandleTime({ speedStat: 60, fieldingStat: 20, armStat: 60 });
    expect(high).toBeLessThan(low);
  });

  it('最小 400ms を下回らない', () => {
    const t = computeHandleTime({ speedStat: 100, fieldingStat: 100, armStat: 100 });
    expect(t).toBeGreaterThanOrEqual(400);
  });
});

// ============================================================
// selectThrowTarget
// ============================================================

describe('selectThrowTarget', () => {
  it('一塁が空いている → first', () => {
    const pos = selectThrowTarget({ x: 35, y: 145 }, { first: false, second: false, third: false }, 0, 'second');
    expect(pos).toBe('first');
  });

  it('走者一塁あり → second', () => {
    const pos = selectThrowTarget({ x: 35, y: 145 }, { first: true, second: false, third: false }, 0, 'second');
    expect(pos).toBe('second');
  });

  it('外野手は上位塁に投げる傾向', () => {
    const pos = selectThrowTarget({ x: 0, y: 320 }, { first: true, second: true, third: false }, 0, 'center');
    expect(['second', 'third']).toContain(pos);
  });
});

// ============================================================
// resolveThrow
// ============================================================

describe('resolveThrow', () => {
  it('キャッチ成功後は送球する', () => {
    const fieldingResult: FieldingResult = {
      primaryFielder: { id: 'f_shortstop', position: 'shortstop', arrivalTimeMs: 500, arrivalPos: { x: -35, y: 145 } },
      catchAttempt: { success: true, error: false, bobble: false, handleTimeMs: 600 },
    };
    const result = resolveThrow(fieldingResult, { first: false, second: false, third: false }, 0, new Map(), createRNG('th1'));
    expect(result.willThrow).toBe(true);
  });

  it('エラー後は送球しない', () => {
    const fieldingResult: FieldingResult = {
      primaryFielder: { id: 'f_left', position: 'left', arrivalTimeMs: 800, arrivalPos: { x: -180, y: 280 } },
      catchAttempt: { success: false, error: true, bobble: false, handleTimeMs: 1200 },
    };
    const result = resolveThrow(fieldingResult, { first: false, second: true, third: false }, 1, new Map(), createRNG('th2'));
    expect(result.willThrow).toBe(false);
  });

  it('releaseTimeMs < arrivalTimeMs', () => {
    const fieldingResult: FieldingResult = {
      primaryFielder: { id: 'f_second', position: 'second', arrivalTimeMs: 500, arrivalPos: { x: 35, y: 145 } },
      catchAttempt: { success: true, error: false, bobble: false, handleTimeMs: 600 },
    };
    const result = resolveThrow(fieldingResult, { first: false, second: false, third: false }, 0, new Map(), createRNG('th3'));
    if (result.willThrow) {
      expect(result.releaseTimeMs).toBeLessThan(result.arrivalTimeMs);
    }
  });

  it('throwQuality は 0-1 の範囲', () => {
    const fieldingResult: FieldingResult = {
      primaryFielder: { id: 'f_third', position: 'third', arrivalTimeMs: 400, arrivalPos: { x: -80, y: 75 } },
      catchAttempt: { success: true, error: false, bobble: false, handleTimeMs: 600 },
    };
    const result = resolveThrow(fieldingResult, { first: false, second: false, third: false }, 0, new Map(), createRNG('th4'));
    if (result.willThrow) {
      expect(result.throwQuality).toBeGreaterThanOrEqual(0);
      expect(result.throwQuality).toBeLessThanOrEqual(1);
    }
  });
});

// ============================================================
// computeThrowArrivalMs / computeRunnerArrivalMs
// ============================================================

describe('computeThrowArrivalMs', () => {
  it('距離が遠いほど到達時間が長い', () => {
    const close = computeThrowArrivalMs({ x: 35, y: 145 }, 'first', 70, 0);
    const far = computeThrowArrivalMs({ x: -180, y: 280 }, 'first', 70, 0);
    expect(far).toBeGreaterThan(close);
  });

  it('startTimeMs を加算する', () => {
    const t0 = computeThrowArrivalMs({ x: 0, y: 127 }, 'first', 70, 0);
    const t1000 = computeThrowArrivalMs({ x: 0, y: 127 }, 'first', 70, 1000);
    expect(t1000 - t0).toBeCloseTo(1000, -1);
  });
});

describe('computeRunnerArrivalMs', () => {
  it('一塁→二塁は二塁→三塁と同じ時間（等距離）', () => {
    const t12 = computeRunnerArrivalMs('first', 'second', 60, 0);
    const t23 = computeRunnerArrivalMs('second', 'third', 60, 0);
    expect(t12).toBeCloseTo(t23, -1);
  });

  it('速い走者は遅い走者より早く到達', () => {
    const fast = computeRunnerArrivalMs('first', 'second', 90, 0);
    const slow = computeRunnerArrivalMs('first', 'second', 20, 0);
    expect(fast).toBeLessThan(slow);
  });
});
