/**
 * Phase 12-C: field-coordinates のユニットテスト
 */

import { describe, it, expect } from 'vitest';
import {
  fieldToCanvas,
  canvasToField,
  hitDirectionToField,
  FIELD_POSITIONS,
  FIELD_SCALE,
} from '../../../src/ui/match-visual/field-coordinates';

describe('fieldToCanvas', () => {
  const W = 450;
  const H = 450;

  it('ホームプレート (0, 0) → Canvas 中央下（85%の高さ）', () => {
    const result = fieldToCanvas(FIELD_POSITIONS.home, W, H);
    expect(result.cx).toBeCloseTo(W / 2);
    expect(result.cy).toBeCloseTo(H * 0.85);
  });

  it('一塁 (90, 0) → ホームより右', () => {
    const home = fieldToCanvas(FIELD_POSITIONS.home, W, H);
    const first = fieldToCanvas(FIELD_POSITIONS.first, W, H);
    expect(first.cx).toBeGreaterThan(home.cx);
    expect(first.cy).toBeCloseTo(home.cy); // 同じ高さ（Y=0）
  });

  it('三塁 (-90, 0) → ホームより左', () => {
    const home = fieldToCanvas(FIELD_POSITIONS.home, W, H);
    const third = fieldToCanvas(FIELD_POSITIONS.third, W, H);
    expect(third.cx).toBeLessThan(home.cx);
  });

  it('センター (0, 250) → ホームより上（Canvas では cy が小さい）', () => {
    const home = fieldToCanvas(FIELD_POSITIONS.home, W, H);
    const cf = fieldToCanvas(FIELD_POSITIONS.centerField, W, H);
    expect(cf.cy).toBeLessThan(home.cy);
  });

  it('一塁と三塁は cx に関して対称', () => {
    const home = fieldToCanvas(FIELD_POSITIONS.home, W, H);
    const first = fieldToCanvas(FIELD_POSITIONS.first, W, H);
    const third = fieldToCanvas(FIELD_POSITIONS.third, W, H);
    const diffFirst = first.cx - home.cx;
    const diffThird = home.cx - third.cx;
    expect(diffFirst).toBeCloseTo(diffThird, 1);
  });

  it('FIELD_SCALE * 90 = 90px（一塁までの距離）', () => {
    const home = fieldToCanvas(FIELD_POSITIONS.home, W, H);
    const first = fieldToCanvas(FIELD_POSITIONS.first, W, H);
    expect(first.cx - home.cx).toBeCloseTo(90 * FIELD_SCALE, 1);
  });
});

describe('canvasToField (逆変換)', () => {
  const W = 450;
  const H = 450;

  it('Canvas 中央 → ホームプレート付近', () => {
    const homeCanvas = fieldToCanvas(FIELD_POSITIONS.home, W, H);
    const back = canvasToField(homeCanvas, W, H);
    expect(back.x).toBeCloseTo(0);
    expect(back.y).toBeCloseTo(0);
  });

  it('往復変換で元の値に戻る（一塁）', () => {
    const orig = FIELD_POSITIONS.first;
    const canvas = fieldToCanvas(orig, W, H);
    const back = canvasToField(canvas, W, H);
    expect(back.x).toBeCloseTo(orig.x, 1);
    expect(back.y).toBeCloseTo(orig.y, 1);
  });

  it('往復変換で元の値に戻る（センター）', () => {
    const orig = FIELD_POSITIONS.centerField;
    const canvas = fieldToCanvas(orig, W, H);
    const back = canvasToField(canvas, W, H);
    expect(back.x).toBeCloseTo(orig.x, 1);
    expect(back.y).toBeCloseTo(orig.y, 1);
  });
});

describe('hitDirectionToField', () => {
  it('センター方向 (45°) → x≈0', () => {
    const result = hitDirectionToField(45, 100);
    expect(result.x).toBeCloseTo(0, 1);
    expect(result.y).toBeGreaterThan(0);
  });

  it('左翼ライン方向 (0°) → x < 0（左方向）', () => {
    const result = hitDirectionToField(0, 100);
    expect(result.x).toBeLessThan(0);
  });

  it('右翼ライン方向 (90°) → x > 0（右方向）', () => {
    const result = hitDirectionToField(90, 100);
    expect(result.x).toBeGreaterThan(0);
  });

  it('センター 200 feet → 距離が正しい', () => {
    const result = hitDirectionToField(45, 200);
    const dist = Math.sqrt(result.x ** 2 + result.y ** 2);
    expect(dist).toBeCloseTo(200, 0);
  });
});

describe('FIELD_POSITIONS の整合性', () => {
  it('マウンドはホームの前（y > 0）', () => {
    expect(FIELD_POSITIONS.pitcher.y).toBeGreaterThan(FIELD_POSITIONS.home.y);
  });

  it('キャッチャーはホームの後ろ（y < 0）', () => {
    expect(FIELD_POSITIONS.catcher.y).toBeLessThan(FIELD_POSITIONS.home.y);
  });

  it('二塁はホームの前（y > 0）', () => {
    expect(FIELD_POSITIONS.second.y).toBeGreaterThan(0);
  });

  it('一塁は右（x > 0）、三塁は左（x < 0）', () => {
    expect(FIELD_POSITIONS.first.x).toBeGreaterThan(0);
    expect(FIELD_POSITIONS.third.x).toBeLessThan(0);
  });

  it('ライトは右（x > 0）、レフトは左（x < 0）', () => {
    expect(FIELD_POSITIONS.rightField.x).toBeGreaterThan(0);
    expect(FIELD_POSITIONS.leftField.x).toBeLessThan(0);
  });
});
