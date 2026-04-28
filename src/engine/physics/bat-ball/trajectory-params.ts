/**
 * engine/physics/bat-ball/trajectory-params.ts
 * Phase R2-2: Step B — 中間潜在量 → 4軸打球パラメータ（V3 §4.4）
 *
 * Layer 4 Trajectory への入力となる物理量を生成する。
 * exitVelocity / launchAngle / sprayAngle / spin の 4 軸を中間潜在量から派生。
 *
 * V3 §4.4 完全準拠: 物理シミュレーション精密度向上・係数チューニング
 */

import type { SwingLatentState, BatBallContext, BallTrajectoryParams } from '../types';
import type { RNG } from '../../core/rng';

// ============================================================
// 公式・定数（V3 §4.4 準拠）
// ============================================================

/** exitVelocity の値域 (km/h) */
export const EXIT_VELOCITY_MIN = 30;
export const EXIT_VELOCITY_MAX = 180;

/** exitVelocity ベースレンジ (km/h) — barrelRate 0 で 70, 1 で 150 */
export const EXIT_VELOCITY_BASE = 70;
export const EXIT_VELOCITY_RANGE = 80;

/** launchAngle の値域 (度) */
export const LAUNCH_ANGLE_MIN = -30;
export const LAUNCH_ANGLE_MAX = 80;

/**
 * launchAngle 中心 (barrelRate=0.5 で 0°相当)
 * baseAngle = BASE + BARREL_SCALE * (barrelRate - 0.5)
 * barrelRate=0   → -5 + 50*(-0.5) = -30°
 * barrelRate=0.5 → -5 + 50*0      =  -5°
 * barrelRate=1   → -5 + 50*0.5    = +20°
 */
export const LAUNCH_ANGLE_BASE = -5;
export const LAUNCH_ANGLE_BARREL_SCALE = 50; // (barrel-0.5)*50

/** pitch row→launchAngle 補正係数（高めはフライ、低めはゴロ） */
export const LAUNCH_ANGLE_LOCATION_FACTOR = 5;

/** timing→launchAngle 補正（早打ちはフライ気味）
 * timingWindow * 8: +1（遅すぎ）で +8°（フライ気味）、-1（早すぎ）で -8°（ゴロ気味）
 */
export const LAUNCH_ANGLE_TIMING_FACTOR = 8;

/** sprayAngle ベース 45°（センター）からの swingIntent シフト幅 (度) */
export const SPRAY_BASE_CENTER = 45;
export const SPRAY_INTENT_RANGE = 30;

/** sprayAngle に対する timing シフト (度) — 遅=流し側、早=引っ張り側
 * timingShift = -timingWindow * 12
 * timingWindow=+1（遅い）→ -12°（流し側）
 * timingWindow=-1（早い）→ +12°（引っ張り側）
 */
export const SPRAY_TIMING_SHIFT = -12;

/** バックスピン基準値 (rpm) */
export const BACKSPIN_BASE = 1500;
export const BACKSPIN_BARREL_FACTOR = 1500; // barrelRate * 1500
export const BACKSPIN_GROUNDER_VALUE = -500; // launchAngle <= 10 のときの値

/** サイドスピン (rpm) — swingIntent * 1000 */
export const SIDESPIN_INTENT_FACTOR = 1000;

// ============================================================
// 公開関数
// ============================================================

/**
 * 中間潜在量 → 4軸打球パラメータ（V3 §4.4）
 *
 * 公式（V3 §4.4 より）:
 *
 * exitVelocity:
 *   base = 70 + 80 * barrelRate
 *   adjustment = (1 - decisionPressure * 0.1)
 *   noise = gaussian(0, 4 * (1 - contactQuality * 0.5))
 *   exitVelocity = clamp(base * adjustment + noise, 30, 180)
 *
 * launchAngle:
 *   baseAngle = -5 + 50 * (barrelRate - 0.5)   // -30° 〜 +20°
 *   locationEffect = (2 - pitch.row) * 5        // 高め(row=0)→+10°, 低め(row=4)→-10°
 *   timingEffect = timingWindow * 8             // 遅打ち→フライ気味
 *   noise = gaussian(0, 6 * (1 - contactQuality * 0.4))
 *   launchAngle = clamp(baseAngle + locationEffect + timingEffect + noise, -30, 80)
 *
 * sprayAngle:
 *   baseSpray = 45 + swingIntent * 30           // -1→15°, 0→45°, +1→75°
 *   timingShift = -timingWindow * 12            // 遅=流し側、早=引っ張り側
 *   noise = gaussian(0, 10 * (1 - technique/200))
 *   sprayAngle = baseSpray + timingShift + noise （ファウル方向への振れも許容）
 *
 * spin:
 *   back = launchAngle > 10 ? 1500 + barrelRate*1500 + gaussian(0, 200)
 *                           : -500 + gaussian(0, 300)
 *   side = swingIntent * 1000 + gaussian(0, 400)
 *
 * @param latent 中間潜在量 5 軸
 * @param ctx 元の入力コンテキスト（pitch.row や technique 等の参照用）
 * @param rng ガウシアンノイズ用 RNG
 */
export function computeBallTrajectoryParams(
  latent: SwingLatentState,
  ctx: BatBallContext,
  rng: RNG,
): BallTrajectoryParams {
  const exitVelocity = computeExitVelocity(latent, rng);
  const launchAngle = computeLaunchAngle(latent, ctx, rng);
  const sprayAngle = computeSprayAngle(latent, ctx, rng);
  const spin = computeSpin(latent, launchAngle, rng);

  return {
    exitVelocity,
    launchAngle,
    sprayAngle,
    spin,
  };
}

// ============================================================
// 各軸の個別計算（テスト容易化のため公開）
// ============================================================

/**
 * 打球初速 (km/h) — V3 §4.4
 *
 * base = 70 + 80 * barrelRate          // barrelRate=0 → 70km/h, =1 → 150km/h
 * adjustment = (1 - decisionPressure * 0.1)  // pressure=1 で 10% 減速
 * noise = gaussian(0, 4*(1-contactQuality*0.5))  // contactQuality 高いほどブレ小
 * exitVelocity = clamp(base*adjustment + noise, 30, 180)
 */
export function computeExitVelocity(latent: SwingLatentState, rng: RNG): number {
  const base = EXIT_VELOCITY_BASE + EXIT_VELOCITY_RANGE * latent.barrelRate;
  const adjustment = 1 - latent.decisionPressure * 0.1;
  const noiseStdDev = 4 * (1 - latent.contactQuality * 0.5);
  const noise = rng.gaussian(0, noiseStdDev);

  return clamp(base * adjustment + noise, EXIT_VELOCITY_MIN, EXIT_VELOCITY_MAX);
}

/**
 * 打球角度 (度) — V3 §4.4
 *
 * baseAngle = -5 + 50 * (barrelRate - 0.5)    // -30°〜+20° の幅で揺れる中心
 * locationEffect = (2 - row) * 5              // 高め(row=0)→+10°, 低め(row=4)→-10°
 * timingEffect = timingWindow * 8             // 遅打ち→フライ気味 (+8°), 早打ち→ゴロ気味 (-8°)
 * noise = gaussian(0, 6*(1-contactQuality*0.4))
 * launchAngle = clamp(baseAngle + locationEffect + timingEffect + noise, -30, 80)
 */
export function computeLaunchAngle(
  latent: SwingLatentState,
  ctx: BatBallContext,
  rng: RNG,
): number {
  // barrelRate=0 → -30°, barrelRate=0.5 → -5°, barrelRate=1 → +20°
  const baseAngle = LAUNCH_ANGLE_BASE + LAUNCH_ANGLE_BARREL_SCALE * (latent.barrelRate - 0.5);

  // pitch row: 0=高め, 4=低め → (2-row)*5: 高め→+10°, 低め→-10°
  const locationEffect = (2 - ctx.pitchActualLocation.row) * LAUNCH_ANGLE_LOCATION_FACTOR;

  // timingWindow: +1（遅すぎ）→ +8°（フライ気味）、-1（早すぎ）→ -8°（ゴロ気味）
  const timingEffect = latent.timingWindow * LAUNCH_ANGLE_TIMING_FACTOR;

  // contactQuality 高いほどブレ小（芯で捉えると角度が安定）
  const noiseStdDev = 6 * (1 - latent.contactQuality * 0.4);
  const noise = rng.gaussian(0, noiseStdDev);

  return clamp(
    baseAngle + locationEffect + timingEffect + noise,
    LAUNCH_ANGLE_MIN,
    LAUNCH_ANGLE_MAX,
  );
}

/**
 * 水平角度 (度) — V3 §4.4
 * sprayAngle の値域は ファウル方向への振れも許容（-10〜+100 程度）
 *
 * baseSpray = 45 + swingIntent * 30   // -1→15°(流し), 0→45°(センター), +1→75°(引っ張り)
 * timingShift = -timingWindow * 12    // 遅=流し側(-12°), 早=引っ張り側(+12°)
 * noise = gaussian(0, 10*(1-technique/200))  // technique 高ほど分散小
 */
export function computeSprayAngle(
  latent: SwingLatentState,
  ctx: BatBallContext,
  rng: RNG,
): number {
  const baseSpray = SPRAY_BASE_CENTER + latent.swingIntent * SPRAY_INTENT_RANGE;
  const timingShift = SPRAY_TIMING_SHIFT * latent.timingWindow;

  // technique: 0→ stdDev=10, 100→ stdDev=5, 200→ stdDev=0 (理論上)
  const noiseStdDev = 10 * (1 - ctx.batter.technique / 200);
  const noise = rng.gaussian(0, noiseStdDev);

  // ファウル方向 (-10〜+100) を許容、極端値もそのまま返す
  return baseSpray + timingShift + noise;
}

/**
 * スピン (rpm) — V3 §4.4
 *
 * back:
 *   launchAngle > 10（フライ・ライナー系）: 1500 + barrelRate*1500 + gaussian(0, 200)
 *   それ以外（ゴロ・低弾道）: -500 + gaussian(0, 300)
 *
 * side:
 *   swingIntent * 1000 + gaussian(0, 400)
 *   引っ張り(+1) → +1000rpm (右回転)、流し(-1) → -1000rpm (左回転)
 */
export function computeSpin(
  latent: SwingLatentState,
  launchAngle: number,
  rng: RNG,
): { back: number; side: number } {
  const back =
    launchAngle > 10
      ? BACKSPIN_BASE + latent.barrelRate * BACKSPIN_BARREL_FACTOR + rng.gaussian(0, 200)
      : BACKSPIN_GROUNDER_VALUE + rng.gaussian(0, 300);

  const side = latent.swingIntent * SIDESPIN_INTENT_FACTOR + rng.gaussian(0, 400);

  return { back, side };
}

// ============================================================
// 内部ヘルパー
// ============================================================

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
