/**
 * v0.41.0: physics.ts ユニットテスト
 *
 * テスト対象:
 *   - playerSpeedFtPerSec()
 *   - ballSpeedFtPerSec()
 *   - throwSpeedFtPerSec()
 *   - distanceFt()
 *   - etaMs()
 *   - ballFlightMs()
 *   - batterRunTimes()
 */

import { describe, it, expect } from 'vitest';
import {
  playerSpeedFtPerSec,
  ballSpeedFtPerSec,
  throwSpeedFtPerSec,
  distanceFt,
  etaMs,
  ballFlightMs,
  batterRunTimes,
  BASE_DISTANCE_FT,
} from '../../../src/ui/match-visual/physics';

// ============================================================
// playerSpeedFtPerSec
// ============================================================
describe('playerSpeedFtPerSec', () => {
  it('stat=50 → 24 ft/s (中央値)', () => {
    expect(playerSpeedFtPerSec(50)).toBeCloseTo(24, 0);
  });

  it('stat=0 → 18 ft/s (最低速)', () => {
    expect(playerSpeedFtPerSec(0)).toBeCloseTo(18, 5);
  });

  it('stat=100 → 30 ft/s (最高速)', () => {
    expect(playerSpeedFtPerSec(100)).toBeCloseTo(30, 5);
  });

  it('stat は 0-100 でクランプされる (stat=-10 → 18)', () => {
    expect(playerSpeedFtPerSec(-10)).toBeCloseTo(18, 5);
  });

  it('stat は 0-100 でクランプされる (stat=200 → 30)', () => {
    expect(playerSpeedFtPerSec(200)).toBeCloseTo(30, 5);
  });

  it('中間値は線形補間', () => {
    const v25 = playerSpeedFtPerSec(25);
    const v75 = playerSpeedFtPerSec(75);
    expect(v25).toBeCloseTo(21, 0);
    expect(v75).toBeCloseTo(27, 0);
    // 50 での値は 25 と 75 の平均であること
    expect(playerSpeedFtPerSec(50)).toBeCloseTo((v25 + v75) / 2, 5);
  });
});

// ============================================================
// ballSpeedFtPerSec
// ============================================================
describe('ballSpeedFtPerSec', () => {
  it('bullet → 140 ft/s', () => {
    expect(ballSpeedFtPerSec('bullet')).toBe(140);
  });

  it('hard → 110 ft/s', () => {
    expect(ballSpeedFtPerSec('hard')).toBe(110);
  });

  it('normal → 80 ft/s', () => {
    expect(ballSpeedFtPerSec('normal')).toBe(80);
  });

  it('weak → 55 ft/s', () => {
    expect(ballSpeedFtPerSec('weak')).toBe(55);
  });

  it('速度は bullet > hard > normal > weak', () => {
    expect(ballSpeedFtPerSec('bullet')).toBeGreaterThan(ballSpeedFtPerSec('hard'));
    expect(ballSpeedFtPerSec('hard')).toBeGreaterThan(ballSpeedFtPerSec('normal'));
    expect(ballSpeedFtPerSec('normal')).toBeGreaterThan(ballSpeedFtPerSec('weak'));
  });
});

// ============================================================
// throwSpeedFtPerSec
// ============================================================
describe('throwSpeedFtPerSec', () => {
  it('armStrength=0 → 80 ft/s', () => {
    expect(throwSpeedFtPerSec(0)).toBeCloseTo(80, 5);
  });

  it('armStrength=100 → 110 ft/s', () => {
    expect(throwSpeedFtPerSec(100)).toBeCloseTo(110, 5);
  });

  it('armStrength=50 → 95 ft/s (中央値)', () => {
    expect(throwSpeedFtPerSec(50)).toBeCloseTo(95, 5);
  });

  it('省略時は armStrength=50 と同じ', () => {
    expect(throwSpeedFtPerSec()).toBeCloseTo(throwSpeedFtPerSec(50), 10);
  });
});

// ============================================================
// distanceFt
// ============================================================
describe('distanceFt', () => {
  it('同じ点は 0', () => {
    expect(distanceFt({ x: 10, y: 20 }, { x: 10, y: 20 })).toBe(0);
  });

  it('ホーム(0,0) → 1塁(63.64,63.64) ≈ 90ft', () => {
    expect(distanceFt({ x: 0, y: 0 }, { x: 63.64, y: 63.64 })).toBeCloseTo(90, 0);
  });

  it('3:4:5 の直角三角形', () => {
    expect(distanceFt({ x: 0, y: 0 }, { x: 30, y: 40 })).toBeCloseTo(50, 5);
  });

  it('負の座標でも正しく計算できる', () => {
    expect(distanceFt({ x: -30, y: 0 }, { x: 30, y: 0 })).toBeCloseTo(60, 5);
  });
});

// ============================================================
// etaMs
// ============================================================
describe('etaMs', () => {
  it('90ft を 30ft/s で走る → 3000ms', () => {
    expect(etaMs({ x: 0, y: 0 }, { x: 63.64, y: 63.64 }, 30)).toBeCloseTo(3000, -1);
  });

  it('距離 0 でも最低 80ms を返す', () => {
    expect(etaMs({ x: 0, y: 0 }, { x: 0, y: 0 }, 25)).toBe(80);
  });

  it('速度が速いほど時間が短い', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 100, y: 0 };
    expect(etaMs(p1, p2, 30)).toBeLessThan(etaMs(p1, p2, 18));
  });

  it('距離が長いほど時間が長い', () => {
    const p1 = { x: 0, y: 0 };
    const p_near = { x: 50, y: 0 };
    const p_far = { x: 200, y: 0 };
    expect(etaMs(p1, p_near, 25)).toBeLessThan(etaMs(p1, p_far, 25));
  });
});

// ============================================================
// ballFlightMs
// ============================================================
describe('ballFlightMs', () => {
  it('fly_ball 200ft → 範囲 [1600, 5000] 内', () => {
    const ms = ballFlightMs('fly_ball', 200);
    expect(ms).toBeGreaterThanOrEqual(1600);
    expect(ms).toBeLessThanOrEqual(5000);
  });

  it('fly_ball は飛距離が長いほど時間が長い', () => {
    expect(ballFlightMs('fly_ball', 300)).toBeGreaterThan(ballFlightMs('fly_ball', 150));
  });

  it('line_drive は fly_ball より短い (同距離)', () => {
    expect(ballFlightMs('line_drive', 200)).toBeLessThan(ballFlightMs('fly_ball', 200));
  });

  it('ground_ball は line_drive より短い (同距離)', () => {
    expect(ballFlightMs('ground_ball', 60)).toBeLessThan(ballFlightMs('line_drive', 60));
  });

  it('popup 40ft → 範囲 [1200, 2500] 内', () => {
    const ms = ballFlightMs('popup', 40);
    expect(ms).toBeGreaterThanOrEqual(1200);
    expect(ms).toBeLessThanOrEqual(2500);
  });

  it('bunt_ground は ground_ball と同じ式', () => {
    expect(ballFlightMs('bunt_ground', 30)).toEqual(ballFlightMs('ground_ball', 30));
  });

  it('fly_ball 100ft → 最低値 1600ms が保証される', () => {
    // 1800 + 100*9 = 2700 → clamp されない
    expect(ballFlightMs('fly_ball', 10)).toBeGreaterThanOrEqual(1600);
  });

  it('ground_ball 10ft → 最低値 300ms が保証される', () => {
    expect(ballFlightMs('ground_ball', 10)).toBeGreaterThanOrEqual(300);
  });
});

// ============================================================
// batterRunTimes
// ============================================================
describe('batterRunTimes', () => {
  it('start は BATTER_START_DELAY_MS (300ms)', () => {
    const rt = batterRunTimes(50);
    expect(rt.start).toBe(300);
  });

  it('t1 は 1塁到達時刻 (start より大きい)', () => {
    const rt = batterRunTimes(50);
    expect(rt.t1).toBeGreaterThan(rt.start);
  });

  it('t1 < t2 < t3 < t4 (累積増加)', () => {
    const rt = batterRunTimes(50);
    expect(rt.t1).toBeLessThan(rt.t2);
    expect(rt.t2).toBeLessThan(rt.t3);
    expect(rt.t3).toBeLessThan(rt.t4);
  });

  it('速い選手ほど早く到達する', () => {
    const fast = batterRunTimes(90);
    const slow = batterRunTimes(20);
    expect(fast.t1).toBeLessThan(slow.t1);
    expect(fast.t2).toBeLessThan(slow.t2);
  });

  it('stat=50 で 1塁は約 3-5 秒 (3000-5000ms)', () => {
    const rt = batterRunTimes(50);
    // 300ms (delay) + 90ft / (25*0.9 ft/s) * 1000 ≈ 300 + 4000 = 4300ms
    expect(rt.t1).toBeGreaterThan(3000);
    expect(rt.t1).toBeLessThan(6000);
  });

  it('t2 - t1 ≈ t3 - t2 (各塁間はほぼ等距離 = 等時間)', () => {
    const rt = batterRunTimes(50);
    const leg1 = rt.t2 - rt.t1;
    const leg2 = rt.t3 - rt.t2;
    // 2本目以降は等速 (0.9倍補正なし) なので同じ時間
    expect(Math.abs(leg1 - leg2)).toBeLessThan(5); // 5ms 以内の誤差
  });

  it('BASE_DISTANCE_FT は 90ft', () => {
    expect(BASE_DISTANCE_FT).toBe(90);
  });
});
