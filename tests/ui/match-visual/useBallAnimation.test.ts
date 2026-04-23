/**
 * Phase 12-D: useBallAnimation のユニットテスト
 */

import { describe, it, expect } from 'vitest';
import {
  pitchSpeedToDuration,
  computeTrajectory,
  bezier2,
} from '../../../src/ui/match-visual/useBallAnimation';
import type { BatContactForAnimation } from '../../../src/ui/match-visual/useBallAnimation';

describe('pitchSpeedToDuration', () => {
  // v0.35.0: 球速による差を拡大（550ms - 130ms の範囲）
  it('160km/h → 200ms 以下（速い球は短い時間）', () => {
    // 計算式: 550 - ((160-80)/90)*420 ≈ 177ms
    expect(pitchSpeedToDuration(160)).toBeLessThanOrEqual(200);
  });

  it('80km/h → 550ms（遅い球は長い時間）', () => {
    expect(pitchSpeedToDuration(80)).toBeCloseTo(550, -1);
  });

  it('150km/h → 80km/h より短い', () => {
    expect(pitchSpeedToDuration(150)).toBeLessThan(pitchSpeedToDuration(80));
  });

  it('速度が高いほど時間が短い（単調減少）', () => {
    const d80 = pitchSpeedToDuration(80);
    const d120 = pitchSpeedToDuration(120);
    const d150 = pitchSpeedToDuration(150);
    expect(d120).toBeLessThan(d80);
    expect(d150).toBeLessThan(d120);
  });

  it('範囲外（200km/h）→ 範囲内にクランプされる', () => {
    const d170 = pitchSpeedToDuration(170);
    const d200 = pitchSpeedToDuration(200);
    expect(d200).toBeCloseTo(d170);
  });

  it('範囲外（50km/h）→ 範囲内にクランプされる', () => {
    const d80 = pitchSpeedToDuration(80);
    const d50 = pitchSpeedToDuration(50);
    expect(d50).toBeCloseTo(d80);
  });

  it('すべての結果が 100ms 〜 600ms の範囲内', () => {
    for (let v = 60; v <= 200; v += 10) {
      const d = pitchSpeedToDuration(v);
      expect(d).toBeGreaterThanOrEqual(100);
      expect(d).toBeLessThanOrEqual(600);
    }
  });
});

describe('bezier2', () => {
  it('t=0 → 始点', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 50, y: 100 };
    const p2 = { x: 100, y: 0 };
    const result = bezier2(p0, p1, p2, 0);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(0);
  });

  it('t=1 → 終点', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 50, y: 100 };
    const p2 = { x: 100, y: 0 };
    const result = bezier2(p0, p1, p2, 1);
    expect(result.x).toBeCloseTo(100);
    expect(result.y).toBeCloseTo(0);
  });

  it('t=0.5 → コントロールポイント近く（放物線の頂点付近）', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 0, y: 100 }; // 真上
    const p2 = { x: 0, y: 0 };
    const result = bezier2(p0, p1, p2, 0.5);
    // B(0.5) = (1-0.5)^2 * p0 + 2*(1-0.5)*0.5 * p1 + 0.5^2 * p2
    //        = 0.25 * 0 + 0.5 * 100 + 0.25 * 0 = 50
    expect(result.y).toBeCloseTo(50);
  });

  it('始点と終点が同じ場合、全 t で同じ位置', () => {
    const p = { x: 5, y: 10 };
    const p1 = { x: 5, y: 50 };
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const result = bezier2(p, p1, p, t);
      // x は始点=終点=5 なので常に 5
      expect(result.x).toBeCloseTo(5);
    }
  });

  it('連続性: t が増加するにつれ x も増加（始点→終点へ直線）', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 50, y: 0 };
    const p2 = { x: 100, y: 0 };
    const results = [0, 0.25, 0.5, 0.75, 1].map((t) => bezier2(p0, p1, p2, t).x);
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeGreaterThan(results[i - 1]!);
    }
  });
});

describe('computeTrajectory', () => {
  const groundBall: BatContactForAnimation = {
    contactType: 'ground_ball',
    direction: 45,
    speed: 'normal',
    distance: 80,
  };

  const flyBall: BatContactForAnimation = {
    contactType: 'fly_ball',
    direction: 45,
    speed: 'hard',
    distance: 300,
  };

  const homeRun: BatContactForAnimation = {
    contactType: 'fly_ball',
    direction: 45,
    speed: 'bullet',
    distance: 400,
  };

  it('ゴロ → peakHeightNorm が低い (< 0.2)', () => {
    const traj = computeTrajectory(groundBall);
    expect(traj.peakHeightNorm).toBeLessThan(0.2);
  });

  it('フライ → peakHeightNorm が高い (> 0.5)', () => {
    const traj = computeTrajectory(flyBall);
    expect(traj.peakHeightNorm).toBeGreaterThan(0.5);
  });

  it('ゴロ → type は grounder', () => {
    expect(computeTrajectory(groundBall).type).toBe('grounder');
  });

  it('フライ (300feet) → type は fly', () => {
    expect(computeTrajectory(flyBall).type).toBe('fly');
  });

  it('ホームラン (400feet) → type は home_run', () => {
    expect(computeTrajectory(homeRun).type).toBe('home_run');
  });

  it('startPos は常に (0, 0)（ホームプレート）', () => {
    const traj = computeTrajectory(flyBall);
    expect(traj.startPos.x).toBeCloseTo(0);
    expect(traj.startPos.y).toBeCloseTo(0);
  });

  it('センター方向 (45°) → endPos.x ≈ 0', () => {
    const traj = computeTrajectory(flyBall);
    expect(Math.abs(traj.endPos.x)).toBeLessThan(5);
  });

  it('速い打球 → 遅い打球より durationMs が短い', () => {
    const slow: BatContactForAnimation = { ...groundBall, speed: 'weak' };
    const fast: BatContactForAnimation = { ...groundBall, speed: 'bullet' };
    expect(computeTrajectory(fast).durationMs).toBeLessThan(computeTrajectory(slow).durationMs);
  });

  it('ライン方向が異なると endPos.x の符号が変わる', () => {
    const left: BatContactForAnimation = { ...flyBall, direction: 0 };  // レフト
    const right: BatContactForAnimation = { ...flyBall, direction: 90 }; // ライト
    const leftTraj = computeTrajectory(left);
    const rightTraj = computeTrajectory(right);
    expect(leftTraj.endPos.x).toBeLessThan(0);
    expect(rightTraj.endPos.x).toBeGreaterThan(0);
  });
});
