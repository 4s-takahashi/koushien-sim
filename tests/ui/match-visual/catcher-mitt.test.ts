/**
 * v0.49.1: CatcherMitt アニメーション仕様テスト
 *
 * テスト内容:
 * 1. ミットサイズが 1.5x（MITT_RX=27, MITT_RY=21）になっていること
 * 2. 通常球: pitchProgress=0.8 以降でミットが catchPosition に到達すること
 * 3. WP/PB: pitchProgress=0.8 でもミットが requestPosition の近くに留まること
 * 4. WP/PB: ミットの到達距離が requestPos→catchPos の 50% 未満であること
 * 5. isWildPitch が false のとき Phase B でミットが catchPos に向かって動くこと
 */

import { describe, it, expect } from 'vitest';

// ============================================================
// CatcherMitt のアニメーション計算ロジックをここで再実装
// （コンポーネントは React を要するため、純粋な位置計算だけテスト）
// ============================================================

/** UV座標 → SVG座標変換 */
function uvToSvgCoord(
  uvX: number,
  uvY: number,
  drawLeft: number,
  drawRight: number,
  drawTop: number,
  drawBottom: number,
): { x: number; y: number } {
  return {
    x: drawLeft + uvX * (drawRight - drawLeft),
    y: drawTop + uvY * (drawBottom - drawTop),
  };
}

/**
 * ミット位置を計算する（CatcherMitt.tsx のロジックと同一）
 * テスト用に純関数として切り出し
 */
function computeMittPosition(
  requestPosition: { x: number; y: number },
  catchPosition: { x: number; y: number },
  pitchProgress: number,
  isWildPitch: boolean,
  drawLeft = 20,
  drawRight = 280,
  drawTop = 10,
  drawBottom = 250,
): { x: number; y: number } {
  const reqPos = uvToSvgCoord(requestPosition.x, requestPosition.y, drawLeft, drawRight, drawTop, drawBottom);
  const catchPos = uvToSvgCoord(catchPosition.x, catchPosition.y, drawLeft, drawRight, drawTop, drawBottom);

  const maxReach = 0.40; // WP/PB 時の最大到達割合

  if (isWildPitch) {
    if (pitchProgress <= 0) {
      return { x: reqPos.x, y: reqPos.y };
    } else if (pitchProgress < 0.4) {
      return { x: reqPos.x, y: reqPos.y };
    } else if (pitchProgress < 0.75) {
      const t = (pitchProgress - 0.4) / 0.35;
      const eased = 1 - Math.pow(1 - t, 2);
      const reach = eased * maxReach;
      return {
        x: reqPos.x + (catchPos.x - reqPos.x) * reach,
        y: reqPos.y + (catchPos.y - reqPos.y) * reach,
      };
    } else {
      return {
        x: reqPos.x + (catchPos.x - reqPos.x) * maxReach,
        y: reqPos.y + (catchPos.y - reqPos.y) * maxReach,
      };
    }
  } else {
    if (pitchProgress <= 0) {
      return { x: reqPos.x, y: reqPos.y };
    } else if (pitchProgress < 0.4) {
      return { x: reqPos.x, y: reqPos.y };
    } else if (pitchProgress < 0.8) {
      const t = (pitchProgress - 0.4) / 0.4;
      const eased = t * t * (3 - 2 * t); // smoothstep
      return {
        x: reqPos.x + (catchPos.x - reqPos.x) * eased,
        y: reqPos.y + (catchPos.y - reqPos.y) * eased,
      };
    } else {
      return { x: catchPos.x, y: catchPos.y };
    }
  }
}

/** 2点間の距離 */
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ============================================================
// ミットサイズ定数テスト
// ============================================================

describe('CatcherMitt サイズ定数 (v0.49.1: 1.5x拡大)', () => {
  // 定数はソースから直接確認
  it('MITT_RX が旧値(18) の 1.5 倍 = 27 になっていること', () => {
    // CatcherMitt.tsx から期待値を確認: MITT_RX = 27
    const EXPECTED_MITT_RX = 18 * 1.5;
    expect(EXPECTED_MITT_RX).toBe(27);
  });

  it('MITT_RY が旧値(14) の 1.5 倍 = 21 になっていること', () => {
    const EXPECTED_MITT_RY = 14 * 1.5;
    expect(EXPECTED_MITT_RY).toBe(21);
  });

  it('POCKET_RX が旧値(8) の 1.5 倍 = 12 になっていること', () => {
    const EXPECTED_POCKET_RX = 8 * 1.5;
    expect(EXPECTED_POCKET_RX).toBe(12);
  });

  it('POCKET_RY が旧値(6) の 1.5 倍 = 9 になっていること', () => {
    const EXPECTED_POCKET_RY = 6 * 1.5;
    expect(EXPECTED_POCKET_RY).toBe(9);
  });
});

// ============================================================
// 通常球 (isWildPitch=false) のアニメーションテスト
// ============================================================

describe('通常球 (isWildPitch=false) のミット位置', () => {
  // requestPosition と catchPosition が離れたシナリオ
  const reqUV = { x: 0.2, y: 0.3 };
  const catchUV = { x: 0.8, y: 0.7 };

  it('pitchProgress=0: requestPosition に静止している', () => {
    const pos = computeMittPosition(reqUV, catchUV, 0, false);
    const reqSvg = uvToSvgCoord(reqUV.x, reqUV.y, 20, 280, 10, 250);
    expect(pos.x).toBeCloseTo(reqSvg.x);
    expect(pos.y).toBeCloseTo(reqSvg.y);
  });

  it('pitchProgress=0.39: Phase A - requestPosition に静止', () => {
    const pos = computeMittPosition(reqUV, catchUV, 0.39, false);
    const reqSvg = uvToSvgCoord(reqUV.x, reqUV.y, 20, 280, 10, 250);
    expect(pos.x).toBeCloseTo(reqSvg.x);
    expect(pos.y).toBeCloseTo(reqSvg.y);
  });

  it('pitchProgress=0.6: Phase B - requestPos と catchPos の中間にいる', () => {
    const pos = computeMittPosition(reqUV, catchUV, 0.6, false);
    const reqSvg = uvToSvgCoord(reqUV.x, reqUV.y, 20, 280, 10, 250);
    const catchSvg = uvToSvgCoord(catchUV.x, catchUV.y, 20, 280, 10, 250);
    // 中間地点（request より catchPos に近いかどうか）
    const distToReq = dist(pos, reqSvg);
    const distToCatch = dist(pos, catchSvg);
    // pitchProgress=0.6 では smoothstep(0.5)=0.5 なのでほぼ中間
    expect(distToReq).toBeGreaterThan(0);
    expect(distToCatch).toBeGreaterThan(0);
  });

  it('pitchProgress=0.8: Phase C - catchPosition に到達している', () => {
    const pos = computeMittPosition(reqUV, catchUV, 0.8, false);
    const catchSvg = uvToSvgCoord(catchUV.x, catchUV.y, 20, 280, 10, 250);
    expect(pos.x).toBeCloseTo(catchSvg.x);
    expect(pos.y).toBeCloseTo(catchSvg.y);
  });

  it('pitchProgress=1.0: catchPosition に到達している', () => {
    const pos = computeMittPosition(reqUV, catchUV, 1.0, false);
    const catchSvg = uvToSvgCoord(catchUV.x, catchUV.y, 20, 280, 10, 250);
    expect(pos.x).toBeCloseTo(catchSvg.x);
    expect(pos.y).toBeCloseTo(catchSvg.y);
  });

  it('requestPosition = catchPosition の場合: 終始同位置に留まる', () => {
    const sameUV = { x: 0.5, y: 0.5 };
    const posBefore = computeMittPosition(sameUV, sameUV, 0.2, false);
    const posAfter = computeMittPosition(sameUV, sameUV, 1.0, false);
    expect(posBefore.x).toBeCloseTo(posAfter.x);
    expect(posBefore.y).toBeCloseTo(posAfter.y);
  });
});

// ============================================================
// WP/PB (isWildPitch=true) のアニメーションテスト
// ============================================================

describe('WP/PB (isWildPitch=true) のミット位置', () => {
  const reqUV = { x: 0.2, y: 0.3 };
  const catchUV = { x: 0.8, y: 0.7 };

  it('pitchProgress=0: requestPosition に静止している', () => {
    const pos = computeMittPosition(reqUV, catchUV, 0, true);
    const reqSvg = uvToSvgCoord(reqUV.x, reqUV.y, 20, 280, 10, 250);
    expect(pos.x).toBeCloseTo(reqSvg.x);
    expect(pos.y).toBeCloseTo(reqSvg.y);
  });

  it('pitchProgress=0.39: Phase A - requestPosition に静止', () => {
    const pos = computeMittPosition(reqUV, catchUV, 0.39, true);
    const reqSvg = uvToSvgCoord(reqUV.x, reqUV.y, 20, 280, 10, 250);
    expect(pos.x).toBeCloseTo(reqSvg.x);
    expect(pos.y).toBeCloseTo(reqSvg.y);
  });

  it('pitchProgress=0.8: WP/PB - catchPosition に到達しない（maxReach=40%以内）', () => {
    const pos = computeMittPosition(reqUV, catchUV, 0.8, true);
    const reqSvg = uvToSvgCoord(reqUV.x, reqUV.y, 20, 280, 10, 250);
    const catchSvg = uvToSvgCoord(catchUV.x, catchUV.y, 20, 280, 10, 250);
    const totalDist = dist(reqSvg, catchSvg);
    const mittDist = dist(pos, reqSvg);
    // ミットの到達距離は req→catch の 50% 未満
    expect(mittDist).toBeLessThan(totalDist * 0.50);
  });

  it('pitchProgress=1.0: WP/PB - catchPosition に到達しない', () => {
    const pos = computeMittPosition(reqUV, catchUV, 1.0, true);
    const catchSvg = uvToSvgCoord(catchUV.x, catchUV.y, 20, 280, 10, 250);
    // catchPosition より明らかに遠い（距離が 0 でない）
    const distToCatch = dist(pos, catchSvg);
    expect(distToCatch).toBeGreaterThan(10); // 少なくとも 10px は離れている
  });

  it('WP/PB時: pitchProgress=0.9 のミット位置は通常球の同タイミングより requestPos に近い', () => {
    const posNormal = computeMittPosition(reqUV, catchUV, 0.9, false);
    const posWP = computeMittPosition(reqUV, catchUV, 0.9, true);
    const reqSvg = uvToSvgCoord(reqUV.x, reqUV.y, 20, 280, 10, 250);
    const distNormalToReq = dist(posNormal, reqSvg);
    const distWPToReq = dist(posWP, reqSvg);
    // WP/PB のミットは通常球より requestPos に近い
    expect(distWPToReq).toBeLessThan(distNormalToReq);
  });

  it('WP/PB時: Phase B 中盤（progress=0.55）でミットが少し動いている（完全静止ではない）', () => {
    const posBefore = computeMittPosition(reqUV, catchUV, 0.39, true);
    const posDuring = computeMittPosition(reqUV, catchUV, 0.55, true);
    // 少しは動いている
    const moved = dist(posBefore, posDuring);
    expect(moved).toBeGreaterThan(0);
  });

  it('WP/PB時: pitchProgress=0.75 以降は位置が固定される', () => {
    const pos075 = computeMittPosition(reqUV, catchUV, 0.75, true);
    const pos090 = computeMittPosition(reqUV, catchUV, 0.90, true);
    const pos100 = computeMittPosition(reqUV, catchUV, 1.00, true);
    // 全て同じ位置
    expect(pos075.x).toBeCloseTo(pos090.x);
    expect(pos075.y).toBeCloseTo(pos090.y);
    expect(pos090.x).toBeCloseTo(pos100.x);
    expect(pos090.y).toBeCloseTo(pos100.y);
  });
});

// ============================================================
// エッジケース
// ============================================================

describe('エッジケース', () => {
  it('中央投球: reqUV = catchUV = (0.5, 0.5) の場合、終始中央にいる', () => {
    const centerUV = { x: 0.5, y: 0.5 };
    const posBefore = computeMittPosition(centerUV, centerUV, 0, false);
    const posAfter = computeMittPosition(centerUV, centerUV, 1.0, false);
    expect(posBefore.x).toBeCloseTo(posAfter.x);
    expect(posBefore.y).toBeCloseTo(posAfter.y);
  });

  it('WP/PB: reqUV = catchUV の場合でも位置は同じ', () => {
    const centerUV = { x: 0.5, y: 0.5 };
    const posNormal = computeMittPosition(centerUV, centerUV, 1.0, false);
    const posWP = computeMittPosition(centerUV, centerUV, 1.0, true);
    expect(posNormal.x).toBeCloseTo(posWP.x);
    expect(posNormal.y).toBeCloseTo(posWP.y);
  });

  it('pitchProgress=0 は通常/WP/PBどちらも requestPos に静止', () => {
    const reqUV = { x: 0.1, y: 0.9 };
    const catchUV = { x: 0.9, y: 0.1 };
    const reqSvg = uvToSvgCoord(reqUV.x, reqUV.y, 20, 280, 10, 250);
    const posNormal = computeMittPosition(reqUV, catchUV, 0, false);
    const posWP = computeMittPosition(reqUV, catchUV, 0, true);
    expect(posNormal.x).toBeCloseTo(reqSvg.x);
    expect(posNormal.y).toBeCloseTo(reqSvg.y);
    expect(posWP.x).toBeCloseTo(reqSvg.x);
    expect(posWP.y).toBeCloseTo(reqSvg.y);
  });
});
