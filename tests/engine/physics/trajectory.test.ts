/**
 * tests/engine/physics/trajectory.test.ts — Phase R1-4 単体テスト
 */

import { describe, expect, it } from 'vitest';
import { simulateTrajectory, simulateBounces, KMH_TO_FT_PER_SEC } from '../../../src/engine/physics/trajectory';
import type { BallTrajectoryParams } from '../../../src/engine/physics/types';

const baseParams: BallTrajectoryParams = {
  exitVelocity: 130, // km/h
  launchAngle: 25,
  sprayAngle: 45,    // CF
  spin: { back: 1500, side: 0 },
};

describe('trajectory: 物理整合性', () => {
  it('hangTime > 0', () => {
    const flight = simulateTrajectory(baseParams);
    expect(flight.hangTimeMs).toBeGreaterThan(0);
  });

  it('apex >= 0', () => {
    const flight = simulateTrajectory(baseParams);
    expect(flight.apexFt).toBeGreaterThanOrEqual(0);
  });

  it('distanceFt > 0', () => {
    const flight = simulateTrajectory(baseParams);
    expect(flight.distanceFt).toBeGreaterThan(0);
  });

  it('positionAt(0) は原点付近', () => {
    const flight = simulateTrajectory(baseParams);
    const pos = flight.positionAt(0);
    expect(pos.x).toBeCloseTo(0, 0);
    expect(pos.y).toBeCloseTo(0, 0);
  });

  it('positionAt(hangTime) は着弾点', () => {
    const flight = simulateTrajectory(baseParams);
    const pos = flight.positionAt(flight.hangTimeMs);
    expect(pos.z).toBeCloseTo(0, 0);
    expect(pos.x).toBeCloseTo(flight.landingPoint.x, 0);
    expect(pos.y).toBeCloseTo(flight.landingPoint.y, 0);
  });

  it('positionAt(apex) は最高到達点', () => {
    const flight = simulateTrajectory(baseParams);
    const pos = flight.positionAt(flight.apexTimeMs);
    expect(pos.z).toBeCloseTo(flight.apexFt, 0);
  });
});

describe('trajectory: 単調性（入力差→結果差）', () => {
  it('exitVelocity を上げると distance も増える', () => {
    const slow = simulateTrajectory({ ...baseParams, exitVelocity: 100 });
    const fast = simulateTrajectory({ ...baseParams, exitVelocity: 160 });
    expect(fast.distanceFt).toBeGreaterThan(slow.distanceFt);
  });

  it('launchAngle 0° は飛距離ほぼゼロ', () => {
    const flat = simulateTrajectory({ ...baseParams, launchAngle: 0 });
    expect(flat.distanceFt).toBeLessThan(20);
  });

  it('launchAngle 45° 付近で飛距離最大', () => {
    const at30 = simulateTrajectory({ ...baseParams, launchAngle: 30 });
    const at45 = simulateTrajectory({ ...baseParams, launchAngle: 45 });
    const at60 = simulateTrajectory({ ...baseParams, launchAngle: 60 });
    expect(at45.distanceFt).toBeGreaterThan(at30.distanceFt);
    expect(at45.distanceFt).toBeGreaterThan(at60.distanceFt);
  });

  it('hangTime: launchAngle が高いほど長い (0-90度の範囲で)', () => {
    const low = simulateTrajectory({ ...baseParams, launchAngle: 15 });
    const high = simulateTrajectory({ ...baseParams, launchAngle: 75 });
    expect(high.hangTimeMs).toBeGreaterThan(low.hangTimeMs);
  });

  it('バックスピン強いと滞空長くなる', () => {
    const noSpin = simulateTrajectory({ ...baseParams, spin: { back: 0, side: 0 } });
    const heavySpin = simulateTrajectory({ ...baseParams, spin: { back: 3000, side: 0 } });
    expect(heavySpin.hangTimeMs).toBeGreaterThan(noSpin.hangTimeMs);
  });
});

describe('trajectory: 着弾点の方向', () => {
  it('sprayAngle=45 (CF) → 着弾点は y軸上', () => {
    const flight = simulateTrajectory({ ...baseParams, sprayAngle: 45 });
    expect(flight.landingPoint.x).toBeCloseTo(0, 0);
    expect(flight.landingPoint.y).toBeGreaterThan(0);
  });

  it('sprayAngle<45 (右翼方向) → 着弾点 x>0', () => {
    const flight = simulateTrajectory({ ...baseParams, sprayAngle: 20 });
    expect(flight.landingPoint.x).toBeGreaterThan(0);
  });

  it('sprayAngle>45 (左翼方向) → 着弾点 x<0', () => {
    const flight = simulateTrajectory({ ...baseParams, sprayAngle: 70 });
    expect(flight.landingPoint.x).toBeLessThan(0);
  });

  it('ファウル sprayAngle で isFoul=true', () => {
    const flight = simulateTrajectory({ ...baseParams, sprayAngle: -10 });
    expect(flight.isFoul).toBe(true);
  });

  it('フェア sprayAngle で isFoul=false', () => {
    const flight = simulateTrajectory({ ...baseParams, sprayAngle: 30 });
    expect(flight.isFoul).toBe(false);
  });
});

describe('trajectory: 現実的な飛距離', () => {
  it('150km/h, 30° で 250ft 以上', () => {
    const flight = simulateTrajectory({
      exitVelocity: 150, launchAngle: 30, sprayAngle: 45,
      spin: { back: 2000, side: 0 },
    });
    expect(flight.distanceFt).toBeGreaterThan(250);
  });

  it('170km/h, 30° で 350ft 以上（HR圏）', () => {
    const flight = simulateTrajectory({
      exitVelocity: 170, launchAngle: 30, sprayAngle: 45,
      spin: { back: 2500, side: 0 },
    });
    expect(flight.distanceFt).toBeGreaterThan(350);
  });
});

describe('trajectory: バウンド計算', () => {
  it('ゴロ (launchAngle<25) はバウンド点を返す', () => {
    const flight = simulateTrajectory({ ...baseParams, launchAngle: 5 });
    const bounces = simulateBounces(flight, { ...baseParams, launchAngle: 5 });
    expect(bounces.length).toBeGreaterThan(0);
  });

  it('フライ (launchAngle>25) はバウンド点ゼロ', () => {
    const flight = simulateTrajectory({ ...baseParams, launchAngle: 40 });
    const bounces = simulateBounces(flight, { ...baseParams, launchAngle: 40 });
    expect(bounces.length).toBe(0);
  });

  it('バウンドエネルギーは減衰する（時間順で energy 減）', () => {
    const lowFlight = simulateTrajectory({ ...baseParams, launchAngle: 5 });
    const bounces = simulateBounces(lowFlight, { ...baseParams, launchAngle: 5 });
    if (bounces.length >= 2) {
      expect(bounces[1].energyRemaining).toBeLessThan(bounces[0].energyRemaining);
    }
  });
});
