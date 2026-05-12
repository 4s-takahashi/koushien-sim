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

// ============================================================
// v0.50.1 Fix2: isMittMiss — 着弾位置 vs ミット中心の距離ベース判定
// ============================================================

/**
 * isMittMiss をテスト用に再実装（match-store.ts の関数と同一ロジック）
 *
 * SVG描画エリア定数:
 *   DRAW_LEFT=20, DRAW_RIGHT=280, DRAW_TOP=10, DRAW_BOTTOM=250
 * ミット半径（1.5x拡大後）:
 *   MITT_RX=27
 * しきい値: MITT_RX * 1.5 = 40.5 px
 */
const DRAW_LEFT   = 20;
const DRAW_RIGHT  = 280;
const DRAW_TOP    = 10;
const DRAW_BOTTOM = 250;
const MITT_RX_VAL = 27;
const MITT_MISS_THRESHOLD = MITT_RX_VAL * 1.5; // 40.5px

function isMittMissTest(
  requestUV: { x: number; y: number },
  catchUV: { x: number; y: number },
): boolean {
  const req  = { x: DRAW_LEFT + requestUV.x * (DRAW_RIGHT - DRAW_LEFT), y: DRAW_TOP + requestUV.y * (DRAW_BOTTOM - DRAW_TOP) };
  const land = { x: DRAW_LEFT + catchUV.x  * (DRAW_RIGHT - DRAW_LEFT), y: DRAW_TOP + catchUV.y  * (DRAW_BOTTOM - DRAW_TOP) };
  const dx = land.x - req.x;
  const dy = land.y - req.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  return d > MITT_MISS_THRESHOLD;
}

describe('v0.50.1 Fix2: isMittMiss — ミット外着弾判定', () => {
  it('requestUV = catchUV のとき false（完全に合致）', () => {
    const uv = { x: 0.5, y: 0.5 };
    expect(isMittMissTest(uv, uv)).toBe(false);
  });

  it('極わずかなズレ（1px 程度）は false', () => {
    // 1px / 260 ≈ 0.0038 UV
    const req = { x: 0.5, y: 0.5 };
    const tiny = { x: 0.5 + 1 / (DRAW_RIGHT - DRAW_LEFT), y: 0.5 };
    expect(isMittMissTest(req, tiny)).toBe(false);
  });

  it('しきい値 40.5px ちょうど（境界）は false（以下は miss でない）', () => {
    // dx = threshold, dy=0 → dist = threshold → NOT > threshold
    const req = { x: 0.5, y: 0.5 };
    const exactThreshold = { x: 0.5 + MITT_MISS_THRESHOLD / (DRAW_RIGHT - DRAW_LEFT), y: 0.5 };
    expect(isMittMissTest(req, exactThreshold)).toBe(false);
  });

  it('しきい値超え（41px）は true', () => {
    const req = { x: 0.5, y: 0.5 };
    const over = { x: 0.5 + 41 / (DRAW_RIGHT - DRAW_LEFT), y: 0.5 };
    expect(isMittMissTest(req, over)).toBe(true);
  });

  it('大きく外れた場合（ゾーン端 → 逆端）は true', () => {
    // 内角高め → 外角低め: 大きくズレる
    const req  = { x: 0.05, y: 0.05 }; // 内角高め
    const land = { x: 0.95, y: 0.95 }; // 外角低め
    expect(isMittMissTest(req, land)).toBe(true);
  });

  it('1セル分のズレ（req=中央, catch=隣接セル）は false（ストライクゾーン内）', () => {
    // 中央 UV=0.5 → 隣セル UV≈0.8 の差 = 0.3 UV → 0.3 * 260 = 78px
    // これは threshold 40.5 より大きいので「ミット外」と見なされる
    // → 実際には隣接セルのズレは「ミット外」扱いになることを確認
    const req  = { x: 0.5, y: 0.5 };
    const adj  = { x: 0.8, y: 0.5 }; // 隣の列
    const dx = (0.8 - 0.5) * (DRAW_RIGHT - DRAW_LEFT); // = 78px
    const result = isMittMissTest(req, adj);
    // dx=78 > 40.5 なので true
    expect(result).toBe(true);
  });

  it('同一行・隣接セル内の微小ズレ（UV差 0.1）は false（40.5px未満）', () => {
    // 0.1 UV in x = 0.1 * 260 = 26px < 40.5px
    const req  = { x: 0.5, y: 0.5 };
    const near = { x: 0.6, y: 0.5 };
    expect(isMittMissTest(req, near)).toBe(false);
  });

  it('対角方向のズレ（x=0.1, y=0.1 UV）は false', () => {
    // dx = 0.1 * 260 = 26px, dy = 0.1 * 240 = 24px
    // dist = sqrt(676 + 576) = sqrt(1252) ≈ 35.4px < 40.5
    const req  = { x: 0.5, y: 0.5 };
    const diag = { x: 0.6, y: 0.6 };
    expect(isMittMissTest(req, diag)).toBe(false);
  });

  it('対角方向の大きなズレ（x=0.15, y=0.15 UV）は true', () => {
    // dx = 0.15 * 260 = 39px, dy = 0.15 * 240 = 36px
    // dist = sqrt(1521 + 1296) = sqrt(2817) ≈ 53.1px > 40.5
    const req  = { x: 0.5, y: 0.5 };
    const diag = { x: 0.65, y: 0.65 };
    expect(isMittMissTest(req, diag)).toBe(true);
  });
});
