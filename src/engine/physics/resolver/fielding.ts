/**
 * engine/physics/resolver/fielding.ts — 守備処理
 *
 * Phase R3 §6.1 (fielding-resolver) + §6.2 (throw-resolver) 相当。
 * 打球に対する野手到達・捕球判定と、捕球後の送球先選択・送球時間計算を行う。
 *
 * 依存: engine/physics/types.ts, field-geometry.ts, movement.ts
 * 循環参照: なし
 */

import type {
  BallTrajectoryParams,
  BallFlight,
  FieldingResult,
  ThrowResult,
  BaseId,
  FieldPosition,
} from '../types';
import type { Position } from '../../types/player';
import type { RNG } from '../../core/rng';
import {
  STANDARD_FIELDER_POSITIONS,
  distanceFt,
  HOME_POS,
  getBasePos,
  isInfieldArea,
  isOutfieldArea,
} from '../field-geometry';
import {
  makeFielderProfile,
  makeThrowProfile,
  simulateMovement,
  simulateThrow,
  timeToTraverseFt,
} from '../movement';
import { simulateBounces } from '../trajectory';

// ============================================================
// 定数
// ============================================================

/** クリーン捕球の基本成功率（fielding stat 50 基準） */
export const BASE_CATCH_SUCCESS_RATE = 0.92;

/** エラー率の基本値 */
export const BASE_ERROR_RATE = 0.04;

/** ボブル率の基本値 */
export const BASE_BOBBLE_RATE = 0.06;

/** 送球後処理時間 (ms) — 捕球→送球準備 */
export const BASE_HANDLE_TIME_MS = 600;

/** 野手デフォルトの fielding stat */
export const DEFAULT_FIELDING_STAT = 60;

/** 野手デフォルトの arm stat */
export const DEFAULT_ARM_STAT = 60;

/** 野手デフォルトの speed stat */
export const DEFAULT_SPEED_STAT = 60;

// ============================================================
// 野手能力パラメータ（テスト・デフォルト用）
// ============================================================

export interface FielderAbility {
  readonly speedStat: number;   // 0-100
  readonly fieldingStat: number; // 0-100
  readonly armStat: number;     // 0-100
}

export const DEFAULT_FIELDER_ABILITY: FielderAbility = {
  speedStat: DEFAULT_SPEED_STAT,
  fieldingStat: DEFAULT_FIELDING_STAT,
  armStat: DEFAULT_ARM_STAT,
};

// ============================================================
// メイン: fielding-resolver
// ============================================================

/**
 * 打球に対する守備処理を解決する
 *
 * @param trajectory - 打球パラメータ
 * @param flight     - 打球軌道
 * @param abilities  - 各守備位置の能力 (省略時はデフォルト値を使用)
 * @param rng        - 乱数生成器
 * @returns FieldingResult
 */
export function resolveFielding(
  trajectory: BallTrajectoryParams,
  flight: BallFlight,
  abilities: ReadonlyMap<Position, FielderAbility> = new Map(),
  rng: RNG,
): FieldingResult {
  // 1. 最寄り野手と到達時刻を算出
  const primary = selectPrimaryFielder(flight, abilities);

  // 2. 捕球判定
  const ability = abilities.get(primary.position) ?? DEFAULT_FIELDER_ABILITY;
  const catchAttempt = resolveCatchAttempt(
    trajectory,
    flight,
    ability,
    primary.arrivalTimeMs,
    rng,
  );

  // 3. バウンド点列（ゴロの場合）
  const bouncePoints = trajectory.launchAngle <= 10
    ? simulateBounces(flight, trajectory).map(b => ({ pos: b.pos, t: b.t }))
    : undefined;

  return {
    primaryFielder: {
      id: `fielder_${primary.position}`,
      position: primary.position,
      arrivalTimeMs: primary.arrivalTimeMs,
      arrivalPos: primary.arrivalPos,
    },
    catchAttempt,
    bouncePoints,
  };
}

// ============================================================
// 主担当野手の選択
// ============================================================

interface FielderETA {
  position: Position;
  arrivalTimeMs: number;
  arrivalPos: FieldPosition;
}

/**
 * 着弾点に最速で到達できる野手を選択する
 */
export function selectPrimaryFielder(
  flight: BallFlight,
  abilities: ReadonlyMap<Position, FielderAbility>,
): FielderETA {
  const landingPoint = flight.landingPoint;

  let best: FielderETA | null = null;

  for (const [pos, fielderPos] of STANDARD_FIELDER_POSITIONS) {
    const ability = abilities.get(pos) ?? DEFAULT_FIELDER_ABILITY;
    const profile = makeFielderProfile(ability.speedStat);
    const movement = simulateMovement(fielderPos, landingPoint, profile);

    if (best === null || movement.etaMs < best.arrivalTimeMs) {
      best = {
        position: pos,
        arrivalTimeMs: movement.etaMs,
        arrivalPos: landingPoint,
      };
    }
  }

  // フォールバック（通常は到達しない）
  return best ?? {
    position: 'shortstop',
    arrivalTimeMs: 2000,
    arrivalPos: landingPoint,
  };
}

// ============================================================
// 捕球判定
// ============================================================

/**
 * 捕球試みの成否を判定する
 */
export function resolveCatchAttempt(
  trajectory: BallTrajectoryParams,
  flight: BallFlight,
  ability: FielderAbility,
  arrivalTimeMs: number,
  rng: RNG,
): FieldingResult['catchAttempt'] {
  // 到達の余裕（負だと間に合わない）
  const timeMargin = flight.hangTimeMs - arrivalTimeMs;

  // 間に合わない場合
  if (timeMargin < -200) {
    return {
      success: false,
      error: true,
      bobble: false,
      handleTimeMs: BASE_HANDLE_TIME_MS * 1.5,
    };
  }

  // fielding stat が高いほど成功率上昇
  const fieldingBonus = (ability.fieldingStat - 50) / 100 * 0.08;
  // 打球速度が速いほど難しい
  const velocityPenalty = Math.max(0, (trajectory.exitVelocity - 120) / 200);
  // 打球角度が急なほど難しい（ライナー性）
  const linerPenalty = trajectory.launchAngle >= 10 && trajectory.launchAngle <= 20
    ? 0.05
    : 0;

  const catchRate = Math.min(0.99, Math.max(0.5,
    BASE_CATCH_SUCCESS_RATE + fieldingBonus - velocityPenalty - linerPenalty,
  ));
  const errorRate = Math.max(0.01, BASE_ERROR_RATE - fieldingBonus * 0.5);
  const bobbleRate = Math.max(0.01, BASE_BOBBLE_RATE - fieldingBonus * 0.5);

  const roll = rng.next();

  if (roll < errorRate) {
    return { success: false, error: true, bobble: false, handleTimeMs: BASE_HANDLE_TIME_MS * 2 };
  }
  if (roll < errorRate + bobbleRate) {
    return { success: false, error: false, bobble: true, handleTimeMs: BASE_HANDLE_TIME_MS * 1.5 };
  }
  if (roll < catchRate) {
    return { success: true, error: false, bobble: false, handleTimeMs: computeHandleTime(ability) };
  }

  // ぎりぎり間に合わないケース
  return { success: false, error: false, bobble: false, handleTimeMs: BASE_HANDLE_TIME_MS * 1.3 };
}

/**
 * 捕球→送球準備時間を計算する (ms)
 */
export function computeHandleTime(ability: FielderAbility): number {
  const bonus = (ability.fieldingStat - 50) / 100 * 200;
  return Math.max(400, BASE_HANDLE_TIME_MS - bonus);
}

// ============================================================
// throw-resolver
// ============================================================

/**
 * 捕球後の送球処理を解決する
 *
 * @param fieldingResult - 守備処理結果
 * @param bases          - 現在の塁状況
 * @param outs           - アウトカウント
 * @param abilities      - 野手能力マップ
 * @param rng            - 乱数生成器
 * @returns ThrowResult
 */
export function resolveThrow(
  fieldingResult: FieldingResult,
  bases: { first: boolean; second: boolean; third: boolean },
  outs: number,
  abilities: ReadonlyMap<Position, FielderAbility> = new Map(),
  rng: RNG,
): ThrowResult {
  const { primaryFielder, catchAttempt } = fieldingResult;

  // エラー/ボブルの場合は送球しないか、精度が落ちる
  if (!catchAttempt.success && !catchAttempt.bobble) {
    return noThrowResult(fieldingResult.catchAttempt.handleTimeMs);
  }

  // 送球先決定
  const toBase = selectThrowTarget(
    primaryFielder.arrivalPos,
    bases,
    outs,
    primaryFielder.position,
  );

  if (toBase === null) {
    return noThrowResult(fieldingResult.catchAttempt.handleTimeMs);
  }

  // 送球実行
  const ability = abilities.get(primaryFielder.position) ?? DEFAULT_FIELDER_ABILITY;
  const throwProfile = makeThrowProfile(
    catchAttempt.bobble ? ability.armStat * 0.7 : ability.armStat,
    ability.fieldingStat,
  );

  // ポスチャー補正（エラー後やボブル後は劣化）
  const actualQuality = catchAttempt.bobble
    ? throwProfile.throwQuality * 0.7
    : throwProfile.throwQuality;

  const toPos = getBasePos(toBase as BaseId);
  const releaseMs = primaryFielder.arrivalTimeMs + catchAttempt.handleTimeMs;
  const throwTimes = simulateThrow(primaryFielder.arrivalPos, toPos, throwProfile, releaseMs);

  // 品質ノイズ
  const qualityNoise = rng.gaussian(0, 0.05);
  const finalQuality = Math.max(0, Math.min(1, actualQuality + qualityNoise));

  return {
    willThrow: true,
    toBase: toBase as BaseId,
    releaseTimeMs: throwTimes.releaseTimeMs,
    arrivalTimeMs: throwTimes.arrivalTimeMs,
    throwQuality: finalQuality,
  };
}

/**
 * 送球なし結果を生成する
 */
function noThrowResult(handleTimeMs: number): ThrowResult {
  return {
    willThrow: false,
    toBase: 'first',
    releaseTimeMs: handleTimeMs,
    arrivalTimeMs: handleTimeMs + 9999,
    throwQuality: 0,
  };
}

/**
 * 送球先を選択する
 * フォースアウト > 任意タッチアウト > 見送り
 */
export function selectThrowTarget(
  fielderPos: FieldPosition,
  bases: { first: boolean; second: boolean; third: boolean },
  outs: number,
  fielderPosition: Position,
): BaseId | null {
  const isInfield = isInfieldArea(fielderPos) || isOutfieldArea(fielderPos) === false;

  // 外野手の場合
  if (['left', 'center', 'right'].includes(fielderPosition)) {
    // 外野からは三塁・二塁・本塁への送球が多い
    if (bases.second && outs < 2) return 'third';
    if (bases.first && outs < 2) return 'second';
    return 'first'; // デフォルト
  }

  // 内野手: 一塁への送球が基本
  // フォースアウトを優先
  if (!bases.first) return 'first'; // 一塁が空いている→打者走者をフォースアウト
  if (bases.first && !bases.second) return 'second'; // 1塁走者をフォースアウト
  if (bases.first && bases.second && !bases.third) return 'third'; // 2塁走者をフォースアウト
  if (bases.first && bases.second && bases.third) return 'home'; // 全塁埋まり→本塁フォース

  return 'first';
}

// ============================================================
// 距離ベース送球時間の公開計算
// ============================================================

/**
 * 指定位置から指定塁への送球到達時間 (ms) を計算する
 */
export function computeThrowArrivalMs(
  fromPos: FieldPosition,
  toBase: BaseId,
  armStat: number,
  startTimeMs: number,
): number {
  const throwProfile = makeThrowProfile(armStat);
  const toPos = getBasePos(toBase);
  const result = simulateThrow(fromPos, toPos, throwProfile, startTimeMs);
  return result.arrivalTimeMs;
}

/**
 * 走者の塁到達時間を計算する (ms)
 */
export function computeRunnerArrivalMs(
  fromBase: BaseId,
  toBase: BaseId,
  speedStat: number,
  startTimeMs: number,
): number {
  const fromPos = getBasePos(fromBase);
  const toPos = getBasePos(toBase);
  const dist = distanceFt(fromPos, toPos);
  const profile = {
    topSpeedFtPerSec: 18 + (speedStat / 100) * 12,
    accelerationFtPerSec2: 12,
    reactionTimeMs: 0,
  };
  return startTimeMs + timeToTraverseFt(dist, profile);
}
