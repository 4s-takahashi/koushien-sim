/**
 * engine/physics/resolver/bat-swing.ts — バット軌道生成（スイング決定論）
 *
 * Phase R3 §6.1 相当のサブモジュール。
 * 打者パラメータ・タイミングエラーからバットスイングの軌道プロファイルを決定論的に生成する。
 *
 * 依存: types.ts (参照のみ)、resolver/types.ts
 * 循環参照: なし
 */

import type { SwingLatentState } from '../types';
import type { BatSwingProfile } from './types';
import type { RNG } from '../../core/rng';

// ============================================================
// 定数
// ============================================================

/** 標準スイング速度 (mph) — 打者能力 50 基準 */
export const BASE_SWING_SPEED_MPH = 70;

/** 最大スイング速度ボーナス (mph) — 能力 100 時の上乗せ */
export const MAX_SWING_SPEED_BONUS_MPH = 25;

/** スイング開始から最接近点までの標準時間 (ms) */
export const SWING_DURATION_MS = 150;

/** タイミングエラーの標準偏差 (ms) — 能力 50 の打者 */
export const TIMING_ERROR_STDDEV_MS = 30;

/** アッパースイングの最大角度 (度) */
export const MAX_UPPERCUT_ANGLE_DEG = 15;

/** レベルスイングの基準角度 (度) */
export const LEVEL_SWING_ANGLE_DEG = 5;

// ============================================================
// バットスイングプロファイル生成
// ============================================================

/**
 * バットスイングプロファイルを生成する
 *
 * @param latent - SwingLatentState (bat-ball/latent-state の出力)
 * @param power  - 打者の power stat (0-100)
 * @param rng    - 乱数生成器
 * @returns バットスイングプロファイル
 */
export function generateBatSwing(
  latent: SwingLatentState,
  power: number,
  rng: RNG,
): BatSwingProfile {
  // スイング速度: power stat に比例
  const swingSpeedMph = computeSwingSpeed(power, latent.barrelRate, rng);

  // タイミングエラー: timingWindow から ms 単位に変換
  // timingWindow: -1(早打ち) 〜 +1(遅打ち)、0=ジャスト
  const timingErrorMs = computeTimingErrorMs(latent.timingWindow, power, rng);

  // スイング開始時刻
  const startTimeMs = -(SWING_DURATION_MS + timingErrorMs);
  const contactTimeMs = timingErrorMs;

  // スイング軌道角度（swingIntent: -1=流し、+1=引っ張り）
  const swingPlaneAngleDeg = computeSwingPlaneAngle(latent.swingIntent, latent.contactQuality);

  // バットヘッド位置（コンタクト時の近似座標）
  const batHeadPos = computeBatHeadPos(latent.swingIntent, latent.timingWindow);

  return {
    startTimeMs,
    contactTimeMs,
    timingErrorMs,
    swingSpeedMph,
    batHeadPos,
    swingPlaneAngleDeg,
  };
}

// ============================================================
// 個別計算関数（テスト可能な純粋関数として公開）
// ============================================================

/**
 * スイング速度を計算する (mph)
 * power が高く、barrelRate が高いほど速い
 */
export function computeSwingSpeed(
  power: number,
  barrelRate: number,
  rng: RNG,
): number {
  const clamped = Math.max(0, Math.min(100, power));
  const base = BASE_SWING_SPEED_MPH + MAX_SWING_SPEED_BONUS_MPH * (clamped / 100);
  // barrelRate で上乗せ（良い当たりのコンディション）
  const bonus = barrelRate * 5;
  // 小さなランダム揺らぎ
  const noise = rng.gaussian(0, 2);
  return Math.max(40, base + bonus + noise);
}

/**
 * タイミングエラーを ms 単位で計算する
 * timingWindow: -1〜+1 の連続値 → ms 換算
 */
export function computeTimingErrorMs(
  timingWindow: number,
  power: number,
  rng: RNG,
): number {
  // 能力が高いほどタイミングエラーが小さい（標準偏差が小さくなる）
  const stddev = TIMING_ERROR_STDDEV_MS * (1 - (power / 100) * 0.5);
  // timingWindow は既にエラーの方向を示している
  const deterministic = timingWindow * stddev * 2;
  // わずかなランダム成分
  const noise = rng.gaussian(0, stddev * 0.2);
  // clamp: -150ms 〜 +150ms
  return Math.max(-150, Math.min(150, deterministic + noise));
}

/**
 * スイング軌道角度を計算する (度)
 * swingIntent > 0 (引っ張り): より水平〜ダウン
 * swingIntent < 0 (流し):  アッパー気味
 */
export function computeSwingPlaneAngle(
  swingIntent: number,
  contactQuality: number,
): number {
  // 基準はレベルスイング
  const base = LEVEL_SWING_ANGLE_DEG;
  // 引っ張り方向はやや水平に、流しはアッパー気味
  const intentAdjust = -swingIntent * 5;
  // 接触品質が良いほど理想的な軌道
  const qualityAdjust = (1 - contactQuality) * 3;
  return Math.max(-5, Math.min(MAX_UPPERCUT_ANGLE_DEG, base + intentAdjust + qualityAdjust));
}

/**
 * バットヘッドのコンタクト時近似座標を計算する
 * スイング意図と接触タイミングから推定
 */
export function computeBatHeadPos(
  swingIntent: number,
  timingWindow: number,
): { x: number; y: number } {
  // 引っ張り (+intent) → x 正方向 (右打者なら引っ張り=左方向)
  // 流し (-intent) → x 負方向
  // 早打ち (-timing) → y 前方（y 大きい）
  const x = swingIntent * 1.5;
  const y = 2 - timingWindow * 1.5;
  return { x, y };
}

// ============================================================
// スイング判断補助
// ============================================================

/**
 * チェックスイング判定
 * decisionPressure が高く、timingWindow が大きい（遅打ち）場合
 */
export function isCheckSwing(
  latent: SwingLatentState,
  rng: RNG,
): boolean {
  if (latent.timingWindow < 0.5) return false;
  // decisionPressure が高いと止めやすい
  const checkProb = latent.decisionPressure * 0.3 * (latent.timingWindow - 0.5) * 2;
  return rng.chance(checkProb);
}

/**
 * スイング見送り（ハーフスイング）判定
 * タイミングが大幅にずれていて、decisionPressure が高い場合
 */
export function isHalfSwing(
  latent: SwingLatentState,
): boolean {
  return Math.abs(latent.timingWindow) > 0.85 && latent.decisionPressure > 0.7;
}
