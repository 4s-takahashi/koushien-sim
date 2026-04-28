/**
 * engine/physics/movement.ts — Layer 2: Player Movement
 *
 * 野手・走者・送球の到達時刻を解析式で計算する。
 * モデル: 反応時間 → 等加速度で目標方向に直進 → 最高速で巡航
 *
 * 全関数は純粋関数（副作用なし）。
 */

import type { FieldPosition, MovementProfile, MovementResult, ThrowProfile } from './types';
import { distanceFt } from './field-geometry';

// ============================================================
// 定数
// ============================================================

/** 走力 stat (0-100) → 最高速 (ft/s) のマッピング */
export const SPEED_STAT_MIN_FT_PER_SEC = 18;
export const SPEED_STAT_MAX_FT_PER_SEC = 30;

/** 加速度のデフォルト (ft/s²) — 標準的な走者 */
export const DEFAULT_ACCELERATION_FT_PER_SEC2 = 12;

/** 反応時間の標準値 (ms) — 野手は短く、走者は判断含むので長め */
export const FIELDER_DEFAULT_REACTION_MS = 200;
export const RUNNER_DEFAULT_REACTION_MS = 300;

/** 送球速度: 肩 stat (0-100) → ft/s */
export const ARM_STAT_MIN_FT_PER_SEC = 80;
export const ARM_STAT_MAX_FT_PER_SEC = 110;

/** 送球リリース時間のデフォルト (ms) */
export const DEFAULT_THROW_RELEASE_MS = 800;

// ============================================================
// stat → 物理量変換
// ============================================================

/**
 * 走力 stat (0-100) を最高速度 (ft/s) に変換
 */
export function speedStatToFtPerSec(speedStat: number): number {
  const clamped = Math.max(0, Math.min(100, speedStat));
  return SPEED_STAT_MIN_FT_PER_SEC + (SPEED_STAT_MAX_FT_PER_SEC - SPEED_STAT_MIN_FT_PER_SEC) * (clamped / 100);
}

/**
 * 肩 stat (0-100) を送球速度 (ft/s) に変換
 */
export function armStatToFtPerSec(armStat: number): number {
  const clamped = Math.max(0, Math.min(100, armStat));
  return ARM_STAT_MIN_FT_PER_SEC + (ARM_STAT_MAX_FT_PER_SEC - ARM_STAT_MIN_FT_PER_SEC) * (clamped / 100);
}

// ============================================================
// 等加速度モデルでの到達時刻計算
// ============================================================

/**
 * 反応時間 + 等加速度 + 最高速で目標距離 d (ft) を移動するのに要する時間 (ms)
 *
 * フェーズ:
 *   1. 反応時間: t_react ms 待機（移動なし）
 *   2. 加速期: 0 → topSpeed まで等加速度 a で加速
 *      加速期距離: d_accel = topSpeed² / (2*a)
 *      加速期時間: t_accel = topSpeed / a
 *   3. 巡航期: topSpeed で残り距離を進む
 */
export function timeToTraverseFt(distance: number, profile: MovementProfile): number {
  const { topSpeedFtPerSec: vMax, accelerationFtPerSec2: a, reactionTimeMs: tReact } = profile;
  if (distance <= 0) return tReact;

  // 加速期で頂上速度に達するまでの距離
  const accelDistance = (vMax * vMax) / (2 * a);
  const accelTimeSec = vMax / a;

  if (distance <= accelDistance) {
    // 加速期間中に到達
    const tToReachSec = Math.sqrt((2 * distance) / a);
    return tReact + tToReachSec * 1000;
  }

  // 加速期 + 巡航期
  const cruiseDistance = distance - accelDistance;
  const cruiseTimeSec = cruiseDistance / vMax;
  return tReact + (accelTimeSec + cruiseTimeSec) * 1000;
}

/**
 * 移動結果（時刻 t における位置を返す関数付き）
 */
export function simulateMovement(
  from: FieldPosition,
  to: FieldPosition,
  profile: MovementProfile,
): MovementResult {
  const distance = distanceFt(from, to);
  const etaMs = timeToTraverseFt(distance, profile);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dirX = distance > 0 ? dx / distance : 0;
  const dirY = distance > 0 ? dy / distance : 0;

  const positionAt = (tMs: number): FieldPosition => {
    if (tMs <= profile.reactionTimeMs) return from;
    const tEffective = (tMs - profile.reactionTimeMs) / 1000; // sec
    const a = profile.accelerationFtPerSec2;
    const vMax = profile.topSpeedFtPerSec;
    const accelTimeSec = vMax / a;

    let traveledFt: number;
    if (tEffective <= accelTimeSec) {
      // 加速期
      traveledFt = 0.5 * a * tEffective * tEffective;
    } else {
      // 巡航期
      const accelDistance = 0.5 * a * accelTimeSec * accelTimeSec;
      traveledFt = accelDistance + vMax * (tEffective - accelTimeSec);
    }

    if (traveledFt >= distance) {
      return to; // 到達済み
    }

    return {
      x: from.x + dirX * traveledFt,
      y: from.y + dirY * traveledFt,
    };
  };

  return { etaMs, distanceFt: distance, positionAt };
}

// ============================================================
// 走者プロファイル生成
// ============================================================

export function makeRunnerProfile(speedStat: number, reactionTimeMs = RUNNER_DEFAULT_REACTION_MS): MovementProfile {
  return {
    topSpeedFtPerSec: speedStatToFtPerSec(speedStat),
    accelerationFtPerSec2: DEFAULT_ACCELERATION_FT_PER_SEC2,
    reactionTimeMs,
  };
}

export function makeFielderProfile(speedStat: number, reactionTimeMs = FIELDER_DEFAULT_REACTION_MS): MovementProfile {
  return {
    topSpeedFtPerSec: speedStatToFtPerSec(speedStat),
    accelerationFtPerSec2: DEFAULT_ACCELERATION_FT_PER_SEC2,
    reactionTimeMs,
  };
}

// ============================================================
// 送球
// ============================================================

/**
 * 送球の到達時間 (ms) — 直線距離 / 送球速度
 * 簡易: 体勢補正は throwQuality に集約、ここでは純粋な物理時間のみ
 */
export function timeToThrowFt(distance: number, throwSpeedFtPerSec: number): number {
  if (throwSpeedFtPerSec <= 0) return Infinity;
  return (distance / throwSpeedFtPerSec) * 1000;
}

/**
 * 送球プロファイル生成
 */
export function makeThrowProfile(armStat: number, fieldingStat = 50): ThrowProfile {
  // throwQuality は arm + fielding の合成、暴投率と相関
  const throwQuality = Math.max(0, Math.min(1, (armStat * 0.6 + fieldingStat * 0.4) / 100));
  return {
    throwSpeedFtPerSec: armStatToFtPerSec(armStat),
    throwQuality,
    releaseDelayMs: DEFAULT_THROW_RELEASE_MS - (fieldingStat / 100) * 200,
  };
}

/**
 * 送球結果: from → to の到達時刻 + リリース時刻
 */
export function simulateThrow(
  from: FieldPosition,
  to: FieldPosition,
  profile: ThrowProfile,
  startTimeMs: number,
): { releaseTimeMs: number; arrivalTimeMs: number; distanceFt: number } {
  const distance = distanceFt(from, to);
  const releaseTimeMs = startTimeMs + profile.releaseDelayMs;
  const flightMs = timeToThrowFt(distance, profile.throwSpeedFtPerSec);
  const arrivalTimeMs = releaseTimeMs + flightMs;
  return { releaseTimeMs, arrivalTimeMs, distanceFt: distance };
}

// ============================================================
// 累積塁到達時刻テーブル（打者走者用）
// ============================================================

/**
 * 打者走者が一塁・二塁・三塁・本塁に到達する累積時刻 (ms)
 * 90 ft × 4 を物理モデルで計算
 */
export function batterRunCumulativeTimes(speedStat: number): {
  toFirst: number;
  toSecond: number;
  toThird: number;
  toHome: number;
} {
  const profile = makeRunnerProfile(speedStat);
  // 各塁までの累積距離: 90, 180, 270, 360 ft
  return {
    toFirst: timeToTraverseFt(90, profile),
    toSecond: timeToTraverseFt(180, profile),
    toThird: timeToTraverseFt(270, profile),
    toHome: timeToTraverseFt(360, profile),
  };
}
