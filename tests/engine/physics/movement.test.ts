/**
 * tests/engine/physics/movement.test.ts — Phase R1-3 単体テスト
 */

import { describe, expect, it } from 'vitest';
import {
  speedStatToFtPerSec,
  armStatToFtPerSec,
  timeToTraverseFt,
  simulateMovement,
  makeRunnerProfile,
  makeFielderProfile,
  makeThrowProfile,
  simulateThrow,
  batterRunCumulativeTimes,
  SPEED_STAT_MIN_FT_PER_SEC,
  SPEED_STAT_MAX_FT_PER_SEC,
  ARM_STAT_MIN_FT_PER_SEC,
  ARM_STAT_MAX_FT_PER_SEC,
} from '../../../src/engine/physics/movement';

describe('movement: stat → 物理量変換', () => {
  it('speed=0 → 最低速', () => {
    expect(speedStatToFtPerSec(0)).toBe(SPEED_STAT_MIN_FT_PER_SEC);
  });

  it('speed=100 → 最高速', () => {
    expect(speedStatToFtPerSec(100)).toBe(SPEED_STAT_MAX_FT_PER_SEC);
  });

  it('speed=50 → 中間', () => {
    const mid = (SPEED_STAT_MIN_FT_PER_SEC + SPEED_STAT_MAX_FT_PER_SEC) / 2;
    expect(speedStatToFtPerSec(50)).toBeCloseTo(mid, 1);
  });

  it('speed clamp: <0 → 最低、>100 → 最高', () => {
    expect(speedStatToFtPerSec(-50)).toBe(SPEED_STAT_MIN_FT_PER_SEC);
    expect(speedStatToFtPerSec(150)).toBe(SPEED_STAT_MAX_FT_PER_SEC);
  });

  it('arm: stat 単調増加', () => {
    expect(armStatToFtPerSec(20)).toBeLessThan(armStatToFtPerSec(80));
  });

  it('arm: 範囲', () => {
    expect(armStatToFtPerSec(0)).toBe(ARM_STAT_MIN_FT_PER_SEC);
    expect(armStatToFtPerSec(100)).toBe(ARM_STAT_MAX_FT_PER_SEC);
  });
});

describe('movement: timeToTraverseFt', () => {
  const profile = makeRunnerProfile(50);

  it('距離 0 → 反応時間のみ', () => {
    expect(timeToTraverseFt(0, profile)).toBe(profile.reactionTimeMs);
  });

  it('距離が大きいほど時間も長い', () => {
    const t1 = timeToTraverseFt(50, profile);
    const t2 = timeToTraverseFt(100, profile);
    expect(t2).toBeGreaterThan(t1);
  });

  it('速い走者は同じ距離を短時間で', () => {
    const slow = makeRunnerProfile(20);
    const fast = makeRunnerProfile(80);
    expect(timeToTraverseFt(180, fast)).toBeLessThan(timeToTraverseFt(180, slow));
  });

  it('90ft は速い走者で 5 秒未満', () => {
    const fast = makeRunnerProfile(80);
    expect(timeToTraverseFt(90, fast)).toBeLessThan(5000);
  });

  it('90ft は遅い走者で 4 秒以上', () => {
    const slow = makeRunnerProfile(20);
    expect(timeToTraverseFt(90, slow)).toBeGreaterThan(4000);
  });
});

describe('movement: simulateMovement', () => {
  const profile = makeRunnerProfile(60);

  it('positionAt(0) は出発点近く（反応時間内）', () => {
    const m = simulateMovement({ x: 0, y: 0 }, { x: 100, y: 0 }, profile);
    expect(m.positionAt(0)).toEqual({ x: 0, y: 0 });
  });

  it('positionAt(eta) は到達点付近', () => {
    const m = simulateMovement({ x: 0, y: 0 }, { x: 90, y: 0 }, profile);
    const final = m.positionAt(m.etaMs);
    expect(final.x).toBeCloseTo(90, 0);
    expect(final.y).toBeCloseTo(0, 0);
  });

  it('positionAt は経路上を動く（線形補間に近い）', () => {
    const m = simulateMovement({ x: 0, y: 0 }, { x: 100, y: 0 }, profile);
    const halfTime = m.etaMs / 2;
    const halfPos = m.positionAt(halfTime);
    expect(halfPos.x).toBeGreaterThan(0);
    expect(halfPos.x).toBeLessThan(100);
    expect(halfPos.y).toBeCloseTo(0, 1);
  });

  it('eta 後は到達点に固定', () => {
    const m = simulateMovement({ x: 0, y: 0 }, { x: 90, y: 0 }, profile);
    expect(m.positionAt(m.etaMs + 1000)).toEqual({ x: 90, y: 0 });
  });
});

describe('movement: 送球', () => {
  it('送球時間: 距離が大きいほど長い', () => {
    const profile = makeThrowProfile(50);
    const t1 = simulateThrow({ x: 0, y: 0 }, { x: 90, y: 0 }, profile, 0);
    const t2 = simulateThrow({ x: 0, y: 0 }, { x: 270, y: 0 }, profile, 0);
    expect(t2.arrivalTimeMs).toBeGreaterThan(t1.arrivalTimeMs);
  });

  it('強肩は送球が速い', () => {
    const weak = makeThrowProfile(20);
    const strong = makeThrowProfile(90);
    const tWeak = simulateThrow({ x: 0, y: 200 }, HOME_POS_TEST, weak, 0);
    const tStrong = simulateThrow({ x: 0, y: 200 }, HOME_POS_TEST, strong, 0);
    expect(tStrong.arrivalTimeMs).toBeLessThan(tWeak.arrivalTimeMs);
  });

  it('リリース時刻 = 開始 + releaseDelay', () => {
    const profile = makeThrowProfile(60);
    const result = simulateThrow({ x: 0, y: 100 }, HOME_POS_TEST, profile, 1000);
    expect(result.releaseTimeMs).toBe(1000 + profile.releaseDelayMs);
  });
});

const HOME_POS_TEST = { x: 0, y: 0 };

describe('movement: 打者走者累積時刻', () => {
  it('1塁→2塁→3塁→本塁の順に時刻が長くなる', () => {
    const t = batterRunCumulativeTimes(50);
    expect(t.toFirst).toBeLessThan(t.toSecond);
    expect(t.toSecond).toBeLessThan(t.toThird);
    expect(t.toThird).toBeLessThan(t.toHome);
  });

  it('速い走者は全塁で時間短縮', () => {
    const slow = batterRunCumulativeTimes(20);
    const fast = batterRunCumulativeTimes(80);
    expect(fast.toFirst).toBeLessThan(slow.toFirst);
    expect(fast.toHome).toBeLessThan(slow.toHome);
  });

  it('1塁到達時間は現実的範囲（3.5-5.5秒）', () => {
    const t = batterRunCumulativeTimes(50);
    expect(t.toFirst).toBeGreaterThan(3500);
    expect(t.toFirst).toBeLessThan(5500);
  });
});
