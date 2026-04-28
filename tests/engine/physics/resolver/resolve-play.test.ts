/**
 * Phase R3: resolvePlay 統合テスト
 * resolvePlay() のエンドツーエンド動作を検証
 */

import { describe, it, expect } from 'vitest';
import { resolvePlay } from '../../../../src/engine/physics/resolver/index';
import { createRNG } from '../../../../src/engine/core/rng';
import type { BallTrajectoryParams, SwingLatentState, BaseState } from '../../../../src/engine/physics/types';
import type { ResolvePlayInput } from '../../../../src/engine/physics/resolver/types';

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

function makeLatent(overrides: Partial<SwingLatentState> = {}): SwingLatentState {
  return {
    contactQuality: 0.8,
    timingWindow: 0.0,
    swingIntent: 0.0,
    decisionPressure: 0.2,
    barrelRate: 0.5,
    ...overrides,
  };
}

function makeEmptyBases(): BaseState {
  return { first: null, second: null, third: null };
}

function makeInput(overrides: Partial<ResolvePlayInput> = {}): ResolvePlayInput {
  return {
    batterSpeedStat: 65,
    batterId: 'batter1',
    runners: [],
    outs: 0,
    rngSeed: 'test-resolve-play',
    ...overrides,
  };
}

// ============================================================
// 基本動作テスト
// ============================================================

describe('resolvePlay - 基本動作', () => {
  it('PlayResolution を返す', () => {
    const traj = makeTrajectory();
    const latent = makeLatent();
    const result = resolvePlay(traj, latent, makeEmptyBases(), makeInput());
    expect(result).toBeDefined();
    expect(result.trajectory).toBeDefined();
    expect(result.flight).toBeDefined();
    expect(result.timeline).toBeDefined();
    expect(result.fieldResult).toBeDefined();
    expect(result.detailedHitType).toBeDefined();
    expect(typeof result.rbiCount).toBe('number');
    expect(result.baseStateAfter).toBeDefined();
  });

  it('timeline は play_end で終わる', () => {
    const result = resolvePlay(makeTrajectory(), makeLatent(), makeEmptyBases(), makeInput());
    const events = result.timeline.events;
    expect(events[events.length - 1].kind).toBe('play_end');
  });

  it('timeline の events は時刻昇順', () => {
    const result = resolvePlay(makeTrajectory(), makeLatent(), makeEmptyBases(), makeInput());
    const events = result.timeline.events;
    for (let i = 1; i < events.length; i++) {
      expect(events[i].t).toBeGreaterThanOrEqual(events[i - 1].t);
    }
  });

  it('detailedHitType は有効な 21 種の一つ', () => {
    const valid21 = new Set([
      'first_line_grounder', 'right_side_grounder', 'left_side_grounder', 'third_line_grounder',
      'comebacker', 'infield_liner', 'high_infield_fly', 'over_infield_hit',
      'right_gap_hit', 'up_the_middle_hit', 'left_gap_hit',
      'shallow_fly', 'medium_fly', 'deep_fly',
      'line_drive_hit', 'wall_ball', 'line_drive_hr', 'high_arc_hr',
      'fence_close_call', 'foul_fly', 'check_swing_dribbler',
    ]);
    const result = resolvePlay(makeTrajectory(), makeLatent(), makeEmptyBases(), makeInput());
    expect(valid21.has(result.detailedHitType)).toBe(true);
  });

  it('latentState を含む', () => {
    const latent = makeLatent();
    const result = resolvePlay(makeTrajectory(), latent, makeEmptyBases(), makeInput());
    expect(result.latentState).toBeDefined();
  });

  it('rbiCount は非負整数', () => {
    const result = resolvePlay(makeTrajectory(), makeLatent(), makeEmptyBases(), makeInput());
    expect(result.rbiCount).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.rbiCount)).toBe(true);
  });
});

// ============================================================
// シナリオ別テスト
// ============================================================

describe('resolvePlay - ホームラン', () => {
  it('フェンス越え → HR 系の detailedHitType', () => {
    const traj = makeTrajectory({ exitVelocity: 180, launchAngle: 40, sprayAngle: 45 });
    const latent = makeLatent({ contactQuality: 1.0, barrelRate: 1.0, timingWindow: 0 });
    const result = resolvePlay(traj, latent, makeEmptyBases(), makeInput({ rngSeed: 'hr-test' }));
    expect(['high_arc_hr', 'line_drive_hr', 'fence_close_call']).toContain(result.detailedHitType);
  });

  it('走者一塁で HR → rbiCount >= 2', () => {
    const traj = makeTrajectory({ exitVelocity: 180, launchAngle: 40, sprayAngle: 45 });
    const latent = makeLatent({ contactQuality: 1.0, barrelRate: 1.0, timingWindow: 0 });
    const bases: BaseState = { first: { playerId: 'r1', speed: 70 }, second: null, third: null };
    const input = makeInput({ rngSeed: 'hr-test-2' });
    const result = resolvePlay(traj, latent, bases, input);
    if (['high_arc_hr', 'line_drive_hr'].includes(result.detailedHitType)) {
      expect(result.rbiCount).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('resolvePlay - ゴロ', () => {
  it('ゴロは grounder 系 detailedHitType', () => {
    const traj = makeTrajectory({ exitVelocity: 110, launchAngle: 5, sprayAngle: 25 });
    const latent = makeLatent({ contactQuality: 0.7, timingWindow: 0 });
    const result = resolvePlay(traj, latent, makeEmptyBases(), makeInput({ rngSeed: 'grounder-test' }));
    const grounderTypes = ['right_side_grounder', 'left_side_grounder', 'first_line_grounder',
      'third_line_grounder', 'comebacker', 'check_swing_dribbler'];
    expect(grounderTypes).toContain(result.detailedHitType);
  });
});

describe('resolvePlay - ファウル', () => {
  it('ファウル軌道 → foul_fly', () => {
    const traj = makeTrajectory({ launchAngle: 30, sprayAngle: -5 }); // ファウルsprayAngle
    const latent = makeLatent({ contactQuality: 0.5 });
    const result = resolvePlay(traj, latent, makeEmptyBases(), makeInput({ rngSeed: 'foul-test' }));
    expect(result.detailedHitType).toBe('foul_fly');
    expect(result.rbiCount).toBe(0);
    expect(result.baseStateAfter).toEqual(makeEmptyBases());
  });
});

// ============================================================
// RNG 再現性テスト
// ============================================================

describe('resolvePlay - 再現性', () => {
  it('同じ seed で同じ結果', () => {
    const traj = makeTrajectory();
    const latent = makeLatent();
    const input = makeInput({ rngSeed: 'reproducibility-test' });
    const r1 = resolvePlay(traj, latent, makeEmptyBases(), input);
    const r2 = resolvePlay(traj, latent, makeEmptyBases(), input);
    expect(r1.detailedHitType).toBe(r2.detailedHitType);
    expect(r1.rbiCount).toBe(r2.rbiCount);
    expect(r1.fieldResult.type).toBe(r2.fieldResult.type);
  });

  it('異なる seed で異なる結果が出ることがある', () => {
    const traj = makeTrajectory();
    const latent = makeLatent({ contactQuality: 0.5, timingWindow: 0.3 }); // 不安定な品質
    const results = Array.from({ length: 20 }, (_, i) =>
      resolvePlay(traj, latent, makeEmptyBases(), makeInput({ rngSeed: `seed-${i}` }))
    );
    const types = new Set(results.map(r => r.detailedHitType));
    // 複数の異なる分類が出ることを確認
    expect(types.size).toBeGreaterThan(1);
  });
});

// ============================================================
// 塁状態テスト
// ============================================================

describe('resolvePlay - 塁状態', () => {
  it('baseStateAfter は BaseState 形式', () => {
    const result = resolvePlay(makeTrajectory(), makeLatent(), makeEmptyBases(), makeInput());
    const { baseStateAfter } = result;
    expect('first' in baseStateAfter).toBe(true);
    expect('second' in baseStateAfter).toBe(true);
    expect('third' in baseStateAfter).toBe(true);
  });

  it('満塁で HR → 全塁空に', () => {
    const traj = makeTrajectory({ exitVelocity: 180, launchAngle: 40, sprayAngle: 45 });
    const latent = makeLatent({ contactQuality: 1.0, barrelRate: 1.0, timingWindow: 0 });
    const bases: BaseState = {
      first: { playerId: 'r1', speed: 70 },
      second: { playerId: 'r2', speed: 75 },
      third: { playerId: 'r3', speed: 80 },
    };
    const result = resolvePlay(traj, latent, bases, makeInput({ rngSeed: 'grand-slam' }));
    if (['high_arc_hr', 'line_drive_hr'].includes(result.detailedHitType)) {
      expect(result.baseStateAfter.first).toBeNull();
      expect(result.baseStateAfter.second).toBeNull();
      expect(result.baseStateAfter.third).toBeNull();
    }
  });
});

// ============================================================
// fieldResult 後方互換性テスト
// ============================================================

describe('resolvePlay - fieldResult 後方互換', () => {
  it('fieldResult.type は有効な FieldResultType', () => {
    const validTypes = new Set(['out', 'single', 'double', 'triple', 'home_run',
      'error', 'fielders_choice', 'double_play', 'sacrifice', 'sacrifice_fly']);
    const result = resolvePlay(makeTrajectory(), makeLatent(), makeEmptyBases(), makeInput());
    expect(validTypes.has(result.fieldResult.type)).toBe(true);
  });

  it('fieldResult.fielder は有効な Position', () => {
    const validPositions = new Set(['pitcher', 'catcher', 'first', 'second', 'third',
      'shortstop', 'left', 'center', 'right']);
    const result = resolvePlay(makeTrajectory(), makeLatent(), makeEmptyBases(), makeInput());
    expect(validPositions.has(result.fieldResult.fielder)).toBe(true);
  });

  it('fieldResult.isError は boolean', () => {
    const result = resolvePlay(makeTrajectory(), makeLatent(), makeEmptyBases(), makeInput());
    expect(typeof result.fieldResult.isError).toBe('boolean');
  });
});
