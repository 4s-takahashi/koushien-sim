/**
 * Phase 12-A/B: pitch-marker-types のユニットテスト
 */

import { describe, it, expect } from 'vitest';
import {
  pitchLocationToUV,
  getBreakDirection,
  isFastballClass,
} from '../../../src/ui/match-visual/pitch-marker-types';

describe('pitchLocationToUV', () => {
  it('中央 (row=2, col=2) → (0.5, 0.5)', () => {
    const uv = pitchLocationToUV(2, 2);
    expect(uv.x).toBeCloseTo(0.5);
    expect(uv.y).toBeCloseTo(0.5);
  });

  it('左上 (row=0, col=0) → (0.05, 0.05)', () => {
    const uv = pitchLocationToUV(0, 0);
    expect(uv.x).toBeCloseTo(0.05);
    expect(uv.y).toBeCloseTo(0.05);
  });

  it('右下 (row=4, col=4) → (0.95, 0.95)', () => {
    const uv = pitchLocationToUV(4, 4);
    expect(uv.x).toBeCloseTo(0.95);
    expect(uv.y).toBeCloseTo(0.95);
  });

  it('高め内角 (row=1, col=1) → x < 0.5, y < 0.5', () => {
    const uv = pitchLocationToUV(1, 1);
    expect(uv.x).toBeLessThan(0.5);
    expect(uv.y).toBeLessThan(0.5);
  });

  it('低め外角 (row=3, col=3) → x > 0.5, y > 0.5', () => {
    const uv = pitchLocationToUV(3, 3);
    expect(uv.x).toBeGreaterThan(0.5);
    expect(uv.y).toBeGreaterThan(0.5);
  });

  it('範囲外の col → 0.5 フォールバック', () => {
    const uv = pitchLocationToUV(2, 10);
    expect(uv.x).toBeCloseTo(0.5);
  });
});

describe('getBreakDirection', () => {
  it('fastball → null を返す', () => {
    const dir = getBreakDirection('fastball', 'right');
    expect(dir).toBeNull();
  });

  it('右投げ スライダー → dx > 0（右方向）', () => {
    const dir = getBreakDirection('slider', 'right');
    expect(dir).not.toBeNull();
    expect(dir!.dx).toBeGreaterThan(0);
  });

  it('左投げ スライダー → dx < 0（左方向、右投げとは逆）', () => {
    const dirR = getBreakDirection('slider', 'right');
    const dirL = getBreakDirection('slider', 'left');
    expect(dirR).not.toBeNull();
    expect(dirL).not.toBeNull();
    expect(dirL!.dx).toBeLessThan(0);
    expect(dirL!.dx).toBeCloseTo(-dirR!.dx);
  });

  it('dy は左右で変わらない（縦方向の変化は同じ）', () => {
    const dirR = getBreakDirection('curveball', 'right');
    const dirL = getBreakDirection('curveball', 'left');
    expect(dirR).not.toBeNull();
    expect(dirL).not.toBeNull();
    expect(dirL!.dy).toBeCloseTo(dirR!.dy);
  });

  it('カーブ → dy > 0（下向き）', () => {
    const dir = getBreakDirection('curveball', 'right');
    expect(dir).not.toBeNull();
    expect(dir!.dy).toBeGreaterThan(0);
  });

  it('不明な球種 → null を返す', () => {
    const dir = getBreakDirection('unknown_pitch', 'right');
    expect(dir).toBeNull();
  });

  it('fork と splitter はどちらも null ではない', () => {
    expect(getBreakDirection('fork', 'right')).not.toBeNull();
    expect(getBreakDirection('splitter', 'right')).not.toBeNull();
  });
});

describe('isFastballClass', () => {
  it('fastball → true', () => {
    expect(isFastballClass('fastball')).toBe(true);
  });

  it('straight → true', () => {
    expect(isFastballClass('straight')).toBe(true);
  });

  it('slider → false', () => {
    expect(isFastballClass('slider')).toBe(false);
  });

  it('curveball → false', () => {
    expect(isFastballClass('curveball')).toBe(false);
  });
});
