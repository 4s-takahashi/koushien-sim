/**
 * Pitch pixel scatter regression test
 *
 * 投球マーカーがサブセル散布（ピクセルレベルのばらつき）を持つことを検証する。
 *
 * バグ修正前: 同じグリッドセル（例: センターストライク row=2, col=2）への投球は
 *   常に同一ピクセル位置に描画されていた（25種類の固定点のみ）。
 *
 * バグ修正後: rowExact / colExact の連続座標を使うことで、
 *   同じグリッドセル内でもピクセルレベルのばらつきが生じる。
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { applyControlError } from '@/engine/match/pitch/control-error';
import { pitchLocationToUV } from '@/ui/match-visual/pitch-marker-types';

/** UV座標 → SVGピクセル座標（StrikeZone.tsx の uvToSvg と同一式） */
function uvToSvgPixel(uvX: number, uvY: number): { px: number; py: number } {
  const DRAW = { left: 20, right: 280, top: 10, bottom: 250 };
  return {
    px: DRAW.left + uvX * (DRAW.right - DRAW.left),
    py: DRAW.top + uvY * (DRAW.bottom - DRAW.top),
  };
}

describe('pitch pixel scatter — center strike (row=2, col=2)', () => {
  it('100球のセンターストライク投球でピクセル位置のユニーク数が50以上', () => {
    const target = { row: 2, col: 2 };
    // コントロール 70: 実際のゲームで想定される中程度の制球力
    const control = 70;

    const pixelSet = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`pixel-scatter-center-${i}`);
      const loc = applyControlError(target, control, rng);

      // rowExact / colExact を使って UV 座標を計算
      const uv = pitchLocationToUV(loc.row, loc.col, loc.rowExact, loc.colExact);

      // SVG ピクセル座標に変換（小数点以下2桁で丸める）
      const { px, py } = uvToSvgPixel(uv.x, uv.y);
      const key = `${px.toFixed(2)},${py.toFixed(2)}`;
      pixelSet.add(key);
    }

    // 修正後: ピクセルレベルの散布があるため 50 以上のユニーク位置が存在すること
    expect(pixelSet.size).toBeGreaterThanOrEqual(50);
  });

  it('rowExact / colExact がない場合（後方互換）は25種類の固定点のみ', () => {
    // 旧データ（rowExact なし）の後方互換性確認
    const pixelSet = new Set<string>();

    for (let row = 0; row <= 4; row++) {
      for (let col = 0; col <= 4; col++) {
        const uv = pitchLocationToUV(row, col); // rowExact/colExact なし
        const { px, py } = uvToSvgPixel(uv.x, uv.y);
        pixelSet.add(`${px.toFixed(2)},${py.toFixed(2)}`);
      }
    }

    // 5×5 グリッド = 25 種類の固定点
    expect(pixelSet.size).toBe(25);
  });

  it('コントロール100の投手は高制球でもわずかな散布がある（0誤差で全て同じ）', () => {
    const target = { row: 2, col: 2 };
    const control = 100; // 完璧な制球力

    const pixelSet = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`pixel-scatter-perfect-${i}`);
      const loc = applyControlError(target, control, rng);

      const uv = pitchLocationToUV(loc.row, loc.col, loc.rowExact, loc.colExact);
      const { px, py } = uvToSvgPixel(uv.x, uv.y);
      pixelSet.add(`${px.toFixed(2)},${py.toFixed(2)}`);
    }

    // コントロール100: stddev = 0 → 全て同じ点
    expect(pixelSet.size).toBe(1);
  });

  it('ボールゾーン（row=0, col=2）への投球でもピクセルレベルのばらつきが生じる', () => {
    const target = { row: 0, col: 2 }; // 高めボール球
    const control = 60;

    const pixelSet = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`pixel-scatter-ball-${i}`);
      const loc = applyControlError(target, control, rng);

      const uv = pitchLocationToUV(loc.row, loc.col, loc.rowExact, loc.colExact);
      const { px, py } = uvToSvgPixel(uv.x, uv.y);
      pixelSet.add(`${px.toFixed(2)},${py.toFixed(2)}`);
    }

    // ボールゾーンでも散布があること（25以上）
    expect(pixelSet.size).toBeGreaterThanOrEqual(25);
  });

  it('pitchLocationToUV: rowExact=2.3 は整数2より右に、rowExact=1.8 は整数2より左にプロットされる', () => {
    // 連続座標の補間方向が正しいことを確認
    const uvCenter = pitchLocationToUV(2, 2, 2.0, 2.0);
    const uvSlightlyRight = pitchLocationToUV(2, 2, 2.0, 2.3);
    const uvSlightlyLeft = pitchLocationToUV(2, 2, 2.0, 1.8);

    // colExact が大きいほど x（UV）が大きい（外角方向）
    expect(uvSlightlyRight.x).toBeGreaterThan(uvCenter.x);
    expect(uvSlightlyLeft.x).toBeLessThan(uvCenter.x);

    // rowExact が大きいほど y（UV）が大きい（低め方向）
    const uvCenterRow = pitchLocationToUV(2, 2, 2.0, 2.0);
    const uvSlightlyLow = pitchLocationToUV(2, 2, 2.3, 2.0);
    const uvSlightlyHigh = pitchLocationToUV(2, 2, 1.8, 2.0);
    expect(uvSlightlyLow.y).toBeGreaterThan(uvCenterRow.y);
    expect(uvSlightlyHigh.y).toBeLessThan(uvCenterRow.y);
  });
});
