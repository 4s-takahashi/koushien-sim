/**
 * engine/physics/bat-ball/index.ts
 * Phase R2: Bat-Ball Physics 公開 API
 *
 * 25 入力 → 中間潜在量 5 軸 → 4 軸打球パラメータ の二段構造（V3 §4）
 */

import type { SwingLatentState, BatBallContext, BallTrajectoryParams } from '../types';
import type { RNG } from '../../core/rng';
import { computeSwingLatentState } from './latent-state';
import { computeBallTrajectoryParams } from './trajectory-params';

// ============================================================
// 一括変換 API
// ============================================================

/**
 * Layer 3 全体の処理: 25 入力 → 4 軸打球パラメータ
 *
 * 内部で:
 *   1. computeSwingLatentState で中間潜在量を生成（Step A）
 *   2. computeBallTrajectoryParams で 4 軸打球パラメータに変換（Step B）
 *
 * @returns 4 軸打球パラメータ + 中間潜在量（デバッグ・テスト用）
 */
export function resolveBatBall(
  ctx: BatBallContext,
  rng: RNG,
): {
  latent: SwingLatentState;
  trajectory: BallTrajectoryParams;
} {
  // Step A: 25 入力 → 中間潜在量 5 軸
  const latent = computeSwingLatentState(ctx, rng);

  // Step B: 中間潜在量 → 4 軸打球パラメータ
  const trajectory = computeBallTrajectoryParams(latent, ctx, rng);

  return { latent, trajectory };
}

// ============================================================
// re-exports
// ============================================================

export {
  computeSwingLatentState,
  computeContactQuality,
  computeTimingWindow,
  computeSwingIntent,
  computeDecisionPressure,
  computeBarrelRate,
  SWING_TYPE_INTENT_BIAS,
  FOCUS_AREA_INTENT_BIAS,
} from './latent-state';

export {
  computeBallTrajectoryParams,
  computeExitVelocity,
  computeLaunchAngle,
  computeSprayAngle,
  computeSpin,
  EXIT_VELOCITY_MIN,
  EXIT_VELOCITY_MAX,
  EXIT_VELOCITY_BASE,
  EXIT_VELOCITY_RANGE,
  LAUNCH_ANGLE_MIN,
  LAUNCH_ANGLE_MAX,
} from './trajectory-params';

export {
  computePerceivedPitchQuality,
  PITCH_TYPE_BREAK_BASE,
  PITCH_TYPE_LATE_MOVEMENT,
  PITCH_TYPE_PERCEIVED_VELOCITY_BIAS,
} from './perceived-quality';

export type { PerceivedPitchInput } from './perceived-quality';
