/**
 * engine/physics/trajectory.ts — Layer 4: Ball Trajectory
 *
 * Phase R1-4: 解析式ベースの打球軌道計算
 *
 * モデル:
 *   - 二次関数（重力 g=32.174 ft/s²）+ 距離依存抗力減衰係数
 *   - スピンによる補正（バックスピン → 滞空時間延長、サイドスピン → 横ブレ）
 *   - O(1) で解決（数値積分なし）
 *
 * ⚠️ 本ファイルは Phase R1-4 のスタブ実装。
 *    最終実装は ACP（Claude Code）に委譲予定。
 *    インタフェース（関数シグネチャ）と単純版の動作は固める。
 */

import type {
  BallTrajectoryParams,
  BallFlight,
  FieldPosition,
  FieldPosition3D,
} from './types';
import { sprayAngleToDirection, distanceFt, isFoulSprayAngle, HOME_POS } from './field-geometry';

// ============================================================
// 物理定数
// ============================================================

/** 重力加速度 (ft/s²) */
export const GRAVITY_FT_PER_SEC2 = 32.174;

/** km/h → ft/s 変換 */
export const KMH_TO_FT_PER_SEC = 0.911344;

/**
 * 空気抵抗の減衰係数（簡易版）— 飛距離に対する縮小率
 * R8-3: 0.0005 → 0.0012（高校野球は木製バット使用+球場小さめで飛距離短め）
 * 旧: v0 = 136 ft/s → dist = 136^2 * sin(30°) / 32.174 * (1 - 0.0005*136) = 250ft
 * 新: v0 = 136 ft/s → dist ≈ 250ft * (1 - 0.0012*136) = 250 * 0.837 = 209ft
 */
export const AIR_DRAG_COEFFICIENT = 0.0012; // R8-3: 0.0005 → 0.0012

/** バックスピンによる滞空時間延長係数 — rpm あたりの効果 */
export const BACKSPIN_HANG_FACTOR = 0.0001;

// ============================================================
// 主要計算関数
// ============================================================

/**
 * 4 軸打球パラメータから着弾点・滞空時間・最高点を計算
 *
 * 簡易物理モデル:
 *   range_no_drag = (v0² * sin(2*launchAngle)) / g
 *   drag_factor = 1 - airDrag * v0
 *   range = range_no_drag * drag_factor * (1 + backspin_lift)
 *   apex = (v0 * sin(launchAngle))² / (2*g)
 *   hangTime = 2 * v0 * sin(launchAngle) / g * (1 + backspin_factor)
 */
export function simulateTrajectory(params: BallTrajectoryParams): BallFlight {
  const v0FtPerSec = params.exitVelocity * KMH_TO_FT_PER_SEC;
  const angleRad = (params.launchAngle * Math.PI) / 180;

  const sinA = Math.sin(angleRad);
  const cosA = Math.cos(angleRad);
  const vy0 = v0FtPerSec * sinA;
  const vh0 = v0FtPerSec * cosA;  // 水平成分

  // 空気抵抗減衰
  const dragFactor = Math.max(0.4, 1 - AIR_DRAG_COEFFICIENT * v0FtPerSec);
  // バックスピンによる滞空延長（バックスピンは正の値）
  const backspinFactor = 1 + Math.max(0, params.spin.back) * BACKSPIN_HANG_FACTOR;

  // 滞空時間（geometry: 投げ上げから着地まで）
  const hangTimeSec = (2 * vy0) / GRAVITY_FT_PER_SEC2 * backspinFactor;
  const hangTimeMs = Math.max(0, hangTimeSec * 1000);

  // 飛距離 (ft)
  const rangeRaw = (v0FtPerSec * v0FtPerSec * Math.sin(2 * angleRad)) / GRAVITY_FT_PER_SEC2;
  const distanceFt = Math.max(0, rangeRaw * dragFactor * backspinFactor);

  // 最高到達点
  const apexFt = Math.max(0, (vy0 * vy0) / (2 * GRAVITY_FT_PER_SEC2));
  const apexTimeMs = (vy0 / GRAVITY_FT_PER_SEC2) * 1000;

  // 着弾点（sprayAngle で方向決定）
  const direction = sprayAngleToDirection(params.sprayAngle);
  const landingPoint: FieldPosition = {
    x: direction.x * distanceFt,
    y: direction.y * distanceFt,
  };

  // 任意時刻の位置を返す関数
  const positionAt = (tMs: number): FieldPosition3D => {
    if (tMs <= 0) return { x: 0, y: 0, z: 3 }; // ホームベース上の打点高さ
    if (tMs >= hangTimeMs) {
      return { x: landingPoint.x, y: landingPoint.y, z: 0 };
    }
    const tSec = tMs / 1000;
    const horizontalDist = vh0 * tSec * dragFactor;
    const z = vy0 * tSec - 0.5 * GRAVITY_FT_PER_SEC2 * tSec * tSec;
    return {
      x: direction.x * horizontalDist,
      y: direction.y * horizontalDist,
      z: Math.max(0, z),
    };
  };

  return {
    landingPoint,
    hangTimeMs,
    apexFt,
    apexTimeMs,
    distanceFt,
    positionAt,
    isFoul: isFoulSprayAngle(params.sprayAngle),
  };
}

// ============================================================
// バウンド計算
// ============================================================

/**
 * バウンドエネルギー減衰係数
 * バウンドのたびに残エネルギーがこの倍率で減る
 */
export const BOUNCE_ENERGY_DECAY = 0.5;

/**
 * 着弾後のバウンド点列を計算（ゴロ用）
 * 着弾エネルギーから始めて、減衰しつつ N 回バウンド
 */
export function simulateBounces(
  flight: BallFlight,
  params: BallTrajectoryParams,
  maxBounces = 5,
): Array<{ pos: FieldPosition; t: number; energyRemaining: number }> {
  const result: Array<{ pos: FieldPosition; t: number; energyRemaining: number }> = [];
  if (params.launchAngle > 25) return result; // フライ・ライナーはバウンド計算不要

  const direction = sprayAngleToDirection(params.sprayAngle);
  const v0FtPerSec = params.exitVelocity * KMH_TO_FT_PER_SEC;
  const horizontalSpeed = v0FtPerSec * Math.cos((params.launchAngle * Math.PI) / 180);

  let curT = flight.hangTimeMs;
  let curPos = flight.landingPoint;
  let curEnergy = 1.0;

  for (let i = 0; i < maxBounces; i++) {
    curEnergy *= BOUNCE_ENERGY_DECAY;
    if (curEnergy < 0.05) break;

    // 各バウンド間の飛距離 (ft) — エネルギーに比例
    const bounceRange = horizontalSpeed * Math.sqrt(curEnergy) * 0.3;
    const bounceTime = (bounceRange / horizontalSpeed) * 1000;

    curPos = {
      x: curPos.x + direction.x * bounceRange,
      y: curPos.y + direction.y * bounceRange,
    };
    curT += bounceTime;

    result.push({ pos: curPos, t: curT, energyRemaining: curEnergy });
  }

  return result;
}
