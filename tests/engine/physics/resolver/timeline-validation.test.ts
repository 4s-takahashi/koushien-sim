/**
 * Phase R3: タイムライン不変条件テスト (V3 §7.2)
 * Layer 2 整合テスト
 *
 * 不変条件 5 つ:
 *   1. 時刻単調
 *   2. 因果整合 (runner_out の前に throw_arrival / fielder_field_ball)
 *   3. 物理整合 (out判定なら throw + margin < runner)
 *   4. 進塁整合
 *   5. 完結性 (play_end で終わる)
 */

import { describe, it, expect } from 'vitest';
import {
  buildAndValidateTimeline,
  validateTimeline,
} from '../../../../src/engine/physics/resolver/index';
import { TimelineValidationError } from '../../../../src/engine/physics/types';
import type { TimelineEvent } from '../../../../src/engine/physics/types';

// ============================================================
// テストヘルパー
// ============================================================

function playEnd(t = 9999): TimelineEvent {
  return { t, kind: 'play_end' };
}

function ballContact(t = 0): TimelineEvent {
  return {
    t, kind: 'ball_contact',
    trajectory: {
      exitVelocity: 140, launchAngle: 25, sprayAngle: 45,
      spin: { back: 2000, side: 0 },
    },
  };
}

function fielderFieldBall(t = 800, fielderId = 'f_center'): TimelineEvent {
  return { t, kind: 'fielder_field_ball', fielderId, pos: { x: 0, y: 320 }, cleanCatch: true };
}

function throwArrival(t = 1500, toBase: import('../../../../src/engine/physics/types').BaseId = 'first'): TimelineEvent {
  return { t, kind: 'throw_arrival', toBase, pos: { x: 63.64, y: 63.64 } };
}

function runnerOut(t = 1600, base: import('../../../../src/engine/physics/types').BaseId = 'first'): TimelineEvent {
  return { t, kind: 'runner_out', runnerId: 'batter1', base, cause: 'force_out' };
}

function runnerSafe(t = 1400, base: import('../../../../src/engine/physics/types').BaseId = 'first'): TimelineEvent {
  return { t, kind: 'runner_safe', runnerId: 'batter1', base };
}

function runnerAdvance(t = 1000): TimelineEvent {
  return { t, kind: 'runner_advance', runnerId: 'batter1', fromBase: 'home', toBase: 'first' };
}

// ============================================================
// 1. 時刻単調条件
// ============================================================

describe('不変条件1: 時刻単調', () => {
  it('正常な昇順タイムラインは valid', () => {
    const events: TimelineEvent[] = [
      ballContact(0),
      fielderFieldBall(800),
      runnerSafe(1400),
      throwArrival(1500),
      playEnd(9999),
    ];
    expect(() => validateTimeline(events)).not.toThrow();
  });

  it('同じ時刻のイベントは許可', () => {
    const events: TimelineEvent[] = [
      ballContact(0),
      fielderFieldBall(800),
      throwArrival(800), // 同時刻
      playEnd(9999),
    ];
    expect(() => validateTimeline(events)).not.toThrow();
  });

  it('逆順のイベントは TimelineValidationError', () => {
    const events: TimelineEvent[] = [
      ballContact(100),
      fielderFieldBall(50), // 打球より前に野手が捕球?
      playEnd(9999),
    ];
    expect(() => validateTimeline(events)).toThrow(TimelineValidationError);
  });

  it('TimelineValidationError の violatedRule が time_monotonic', () => {
    const events: TimelineEvent[] = [
      ballContact(100),
      fielderFieldBall(50),
      playEnd(9999),
    ];
    try {
      validateTimeline(events);
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(TimelineValidationError);
      expect((e as TimelineValidationError).violatedRule).toBe('time_monotonic');
    }
  });
});

// ============================================================
// 2. 因果整合条件
// ============================================================

describe('不変条件2: 因果整合', () => {
  it('runner_out の前に fielder_field_ball あり → valid', () => {
    const events: TimelineEvent[] = [
      ballContact(0),
      fielderFieldBall(800),
      throwArrival(1500),
      runnerOut(1600),
      playEnd(9999),
    ];
    expect(() => validateTimeline(events)).not.toThrow();
  });

  it('runner_out の前に throw_arrival のみでも valid', () => {
    const events: TimelineEvent[] = [
      ballContact(0),
      throwArrival(1500), // fielder_field_ball なしでも throw_arrival があれば OK
      runnerOut(1600),
      playEnd(9999),
    ];
    expect(() => validateTimeline(events)).not.toThrow();
  });

  it('runner_out の前に何もない場合 → TimelineValidationError', () => {
    const events: TimelineEvent[] = [
      ballContact(0),
      runnerOut(1600), // throw_arrival も fielder_field_ball もない
      playEnd(9999),
    ];
    expect(() => validateTimeline(events)).toThrow(TimelineValidationError);
  });

  it('因果違反の violatedRule が causality', () => {
    const events: TimelineEvent[] = [
      ballContact(0),
      runnerOut(1600),
      playEnd(9999),
    ];
    try {
      validateTimeline(events);
      expect.fail('should throw');
    } catch (e) {
      expect((e as TimelineValidationError).violatedRule).toBe('causality');
    }
  });
});

// ============================================================
// 5. 完結性条件
// ============================================================

describe('不変条件5: 完結性', () => {
  it('play_end で終わるタイムラインは valid', () => {
    const events: TimelineEvent[] = [
      ballContact(0),
      fielderFieldBall(800),
      playEnd(9999),
    ];
    expect(() => validateTimeline(events)).not.toThrow();
  });

  it('play_end なし → TimelineValidationError', () => {
    const events: TimelineEvent[] = [
      ballContact(0),
      fielderFieldBall(800),
    ];
    expect(() => validateTimeline(events)).toThrow(TimelineValidationError);
  });

  it('完結性違反の violatedRule が completeness', () => {
    const events: TimelineEvent[] = [
      ballContact(0),
    ];
    try {
      validateTimeline(events);
      expect.fail('should throw');
    } catch (e) {
      expect((e as TimelineValidationError).violatedRule).toBe('completeness');
    }
  });
});

// ============================================================
// buildAndValidateTimeline
// ============================================================

describe('buildAndValidateTimeline', () => {
  it('乱順イベントを昇順ソートして返す', () => {
    const events: TimelineEvent[] = [
      playEnd(9999),
      fielderFieldBall(800),
      ballContact(0),
    ];
    const timeline = buildAndValidateTimeline(events, 'seed123');
    expect(timeline.events[0].t).toBeLessThanOrEqual(timeline.events[1].t);
    expect(timeline.events[1].t).toBeLessThanOrEqual(timeline.events[2].t);
  });

  it('play_end がなければ自動追加される', () => {
    const events: TimelineEvent[] = [
      ballContact(0),
      fielderFieldBall(800),
    ];
    const timeline = buildAndValidateTimeline(events);
    const last = timeline.events[timeline.events.length - 1];
    expect(last.kind).toBe('play_end');
  });

  it('rngSeed を含む', () => {
    const timeline = buildAndValidateTimeline([ballContact(0), fielderFieldBall(800), playEnd(9999)], 'myseed');
    expect(timeline.rngSeed).toBe('myseed');
  });

  it('CanonicalTimeline の events は readonly 配列', () => {
    const events: TimelineEvent[] = [ballContact(0), fielderFieldBall(800), playEnd(9999)];
    const timeline = buildAndValidateTimeline(events);
    // TypeScript の型チェックで readonly は保証される
    expect(Array.isArray(timeline.events)).toBe(true);
  });

  it('逆順イベントでも正しくソートされ valid になる', () => {
    const events: TimelineEvent[] = [
      playEnd(5000),
      runnerSafe(1400),
      throwArrival(1500),
      fielderFieldBall(800),
      ballContact(0),
    ];
    const timeline = buildAndValidateTimeline(events);
    // 昇順になっている
    for (let i = 1; i < timeline.events.length; i++) {
      expect(timeline.events[i].t).toBeGreaterThanOrEqual(timeline.events[i - 1].t);
    }
  });

  it('因果違反がある場合は TimelineValidationError をスロー', () => {
    const events: TimelineEvent[] = [
      ballContact(0),
      runnerOut(500), // throw_arrival 前
      fielderFieldBall(800),
      playEnd(9999),
    ];
    // ソート後に runner_out(500) が fielder_field_ball(800) より前 → 因果違反
    expect(() => buildAndValidateTimeline(events)).toThrow(TimelineValidationError);
  });
});

// ============================================================
// TimelineValidationError クラス
// ============================================================

describe('TimelineValidationError', () => {
  it('name が TimelineValidationError', () => {
    const err = new TimelineValidationError('msg', 'time_monotonic');
    expect(err.name).toBe('TimelineValidationError');
  });

  it('message が正しい', () => {
    const err = new TimelineValidationError('test message', 'causality');
    expect(err.message).toBe('test message');
  });

  it('violatedRule を保持する', () => {
    const err = new TimelineValidationError('msg', 'completeness');
    expect(err.violatedRule).toBe('completeness');
  });

  it('events を保持する', () => {
    const evs: TimelineEvent[] = [playEnd(100)];
    const err = new TimelineValidationError('msg', 'time_monotonic', evs);
    expect(err.events).toBe(evs);
  });

  it('instanceof Error', () => {
    const err = new TimelineValidationError('msg', 'time_monotonic');
    expect(err).toBeInstanceOf(Error);
  });
});
