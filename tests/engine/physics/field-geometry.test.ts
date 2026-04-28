/**
 * tests/engine/physics/field-geometry.test.ts — Phase R1-2 単体テスト
 */

import { describe, expect, it } from 'vitest';
import {
  distanceFt,
  sprayAngleToDirection,
  positionToSprayAngle,
  isInFairTerritory,
  isFoulSprayAngle,
  isOverFence,
  getFenceDistance,
  getNearestFieldingPosition,
  isInfieldArea,
  isOutfieldArea,
  HOME_POS,
  FIRST_BASE_POS,
  SECOND_BASE_POS,
  THIRD_BASE_POS,
  STANDARD_FIELD_LANDMARKS,
  BASE_DISTANCE_FT,
} from '../../../src/engine/physics/field-geometry';

describe('field-geometry: 距離計算', () => {
  it('同じ点同士は距離 0', () => {
    expect(distanceFt(HOME_POS, HOME_POS)).toBe(0);
  });

  it('1 塁までの距離は 90ft', () => {
    expect(distanceFt(HOME_POS, FIRST_BASE_POS)).toBeCloseTo(BASE_DISTANCE_FT, 1);
  });

  it('2 塁までの直線距離は 90 * sqrt(2)', () => {
    expect(distanceFt(HOME_POS, SECOND_BASE_POS)).toBeCloseTo(BASE_DISTANCE_FT * Math.sqrt(2), 1);
  });

  it('1 塁から 2 塁までも 90ft', () => {
    expect(distanceFt(FIRST_BASE_POS, SECOND_BASE_POS)).toBeCloseTo(BASE_DISTANCE_FT, 1);
  });

  it('1 塁から 3 塁までは 90 * sqrt(2)', () => {
    expect(distanceFt(FIRST_BASE_POS, THIRD_BASE_POS)).toBeCloseTo(BASE_DISTANCE_FT * Math.sqrt(2), 1);
  });
});

describe('field-geometry: sprayAngle ↔ direction 変換', () => {
  it('sprayAngle=45 (CF) → (0, 1)', () => {
    const dir = sprayAngleToDirection(45);
    expect(dir.x).toBeCloseTo(0, 5);
    expect(dir.y).toBeCloseTo(1, 5);
  });

  it('sprayAngle=0 (右翼線) → 右側', () => {
    const dir = sprayAngleToDirection(0);
    expect(dir.x).toBeGreaterThan(0);
    expect(dir.y).toBeCloseTo(dir.x, 3); // 45 度ライン
  });

  it('sprayAngle=90 (左翼線) → 左側', () => {
    const dir = sprayAngleToDirection(90);
    expect(dir.x).toBeLessThan(0);
    expect(dir.y).toBeCloseTo(-dir.x, 3); // 45 度ライン
  });

  it('positionToSprayAngle: CF 座標 → 45', () => {
    expect(positionToSprayAngle({ x: 0, y: 100 })).toBeCloseTo(45, 1);
  });

  it('双方向変換: sprayAngle → pos → sprayAngle で一致 (距離一定)', () => {
    for (const angle of [10, 30, 45, 60, 80]) {
      const dir = sprayAngleToDirection(angle);
      const pos = { x: dir.x * 100, y: dir.y * 100 };
      expect(positionToSprayAngle(pos)).toBeCloseTo(angle, 1);
    }
  });
});

describe('field-geometry: フェア/ファウル判定', () => {
  it('CF 100ft はフェア', () => {
    expect(isInFairTerritory({ x: 0, y: 100 })).toBe(true);
  });

  it('y < 0 はファウル', () => {
    expect(isInFairTerritory({ x: 0, y: -10 })).toBe(false);
  });

  it('y > |x| 領域はフェア', () => {
    expect(isInFairTerritory({ x: 30, y: 50 })).toBe(true);
  });

  it('y < |x| 領域はファウル', () => {
    expect(isInFairTerritory({ x: 100, y: 50 })).toBe(false);
  });

  it('sprayAngle 0-90 内はフェア角度', () => {
    expect(isFoulSprayAngle(45)).toBe(false);
    expect(isFoulSprayAngle(0)).toBe(false);
    expect(isFoulSprayAngle(90)).toBe(false);
  });

  it('sprayAngle 範囲外はファウル', () => {
    expect(isFoulSprayAngle(-5)).toBe(true);
    expect(isFoulSprayAngle(95)).toBe(true);
  });
});

describe('field-geometry: フェンス判定', () => {
  it('両翼フェンス距離は 325ft', () => {
    expect(getFenceDistance(0)).toBeCloseTo(325, 0);
    expect(getFenceDistance(90)).toBeCloseTo(325, 0);
  });

  it('CF フェンス距離は 400ft', () => {
    expect(getFenceDistance(45)).toBeCloseTo(400, 0);
  });

  it('CF 405ft はフェンス越え', () => {
    expect(isOverFence({ x: 0, y: 405 })).toBe(true);
  });

  it('CF 350ft はフェンス内', () => {
    expect(isOverFence({ x: 0, y: 350 })).toBe(false);
  });

  it('右翼線 320ft はフェンス内', () => {
    const dir = sprayAngleToDirection(0);
    expect(isOverFence({ x: dir.x * 320, y: dir.y * 320 })).toBe(false);
  });
});

describe('field-geometry: 領域判定', () => {
  it('内野範囲: CF 80ft', () => {
    expect(isInfieldArea({ x: 0, y: 80 })).toBe(true);
    expect(isOutfieldArea({ x: 0, y: 80 })).toBe(false);
  });

  it('外野範囲: CF 200ft', () => {
    expect(isInfieldArea({ x: 0, y: 200 })).toBe(false);
    expect(isOutfieldArea({ x: 0, y: 200 })).toBe(true);
  });

  it('フェンス越え: 外野範囲ではない', () => {
    expect(isOutfieldArea({ x: 0, y: 410 })).toBe(false);
  });
});

describe('field-geometry: 守備位置決定', () => {
  it('CF 280ft の最寄りはセンター', () => {
    expect(getNearestFieldingPosition({ x: 0, y: 280 })).toBe('center');
  });

  it('右翼方向は ライト', () => {
    expect(getNearestFieldingPosition({ x: 150, y: 250 })).toBe('right');
  });

  it('三遊間方向は ショート or 三塁', () => {
    const result = getNearestFieldingPosition({ x: -50, y: 130 });
    expect(['shortstop', 'third']).toContain(result);
  });
});

describe('field-geometry: ランドマーク統合', () => {
  it('STANDARD_FIELD_LANDMARKS が完備', () => {
    expect(STANDARD_FIELD_LANDMARKS.home).toEqual(HOME_POS);
    expect(STANDARD_FIELD_LANDMARKS.standardFielderPositions.size).toBe(9);
    expect(STANDARD_FIELD_LANDMARKS.outfieldFence.length).toBeGreaterThan(0);
  });
});
