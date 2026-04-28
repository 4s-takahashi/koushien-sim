/**
 * engine/physics/bat-ball/latent-state.ts
 * Phase R2-1: Step A — 25入力 → 中間潜在量 5 軸（V3 §4.3）
 *
 * 入力変数を一度この5軸に圧縮してから 4 軸打球パラメータに変換する。
 * 各軸は独立にチューニング可能で、デバッグ・テストしやすい。
 *
 * ⚠️ 案C 骨格: 型定義と関数シグネチャは固定。計算詳細・公式チューニングは ACP に委譲。
 */

import type { SwingLatentState, BatBallContext, PerceivedPitchQuality } from '../types';
import type { RNG } from '../../core/rng';

// ============================================================
// 公式・定数（仮置き、ACP で最終調整）
// ============================================================

/** swingType → swingIntent ベースバイアス */
export const SWING_TYPE_INTENT_BIAS: Readonly<Record<'pull' | 'spray' | 'opposite', number>> = {
  opposite: -0.3,  // 流し打ち
  spray: 0.0,      // 万能
  pull: 0.3,       // 引っ張り
};

/** order.focusArea → swingIntent / location 補正 */
export const FOCUS_AREA_INTENT_BIAS: Readonly<Record<string, number>> = {
  inside: 0.2,    // 内角狙い → 引っ張り
  outside: -0.2,  // 外角狙い → 流し
  low: 0.0,
  high: 0.0,
  middle: 0.0,
  none: 0.0,
};

/** ガウシアン揺らぎの標準偏差 */
export const CONTACT_QUALITY_NOISE_STDDEV = 0.05;
export const TIMING_WINDOW_NOISE_BASE = 0.05;
export const SWING_INTENT_REDUCTION_TWO_STRIKES = 0.5;

// ============================================================
// 公開関数
// ============================================================

/**
 * 25 入力（BatBallContext）→ 中間潜在量 5 軸（V3 §4.3）
 *
 * 各軸の主入力（V3 §4.3 より）:
 *
 * - contactQuality:
 *     主: batter.contact, batter.technique
 *     副: timingError, ballOnBat, perceivedPitch.difficulty
 *     公式: sigmoid(0.4*contact/100 + 0.3*technique/100 - 0.5*|timingError|/100
 *           - 0.4*difficulty + gaussian(0, 0.05))
 *
 * - timingWindow:
 *     主: timingError
 *     副: perceivedPitch.velocityChangeImpact, perceivedPitch.lateMovement, batter.contact
 *     公式: timingError/100 + gaussian(0, perturbation*(1-contact/200))
 *
 * - swingIntent:
 *     主: batter.battingSide, batter.swingType, order.focusArea
 *     副: pitch.actualLocation.col, count.strikes
 *     公式: (swingTypeBias + locationBias + orderBias) * twoStrikeReduction
 *
 * - decisionPressure:
 *     主: isKeyMoment, inning + score, batter.mental
 *     副: outs, baseState, mood
 *     公式: clamp(basePressure - mentalReduction*0.4 + moodAdjustment, 0, 1)
 *
 * - barrelRate:
 *     主: contactQuality, batter.power
 *     副: timingWindow, perceivedPitch.difficulty
 *     公式: contactQuality * (0.4 + 0.6*centerness) * (0.5 + 0.5*power/100)
 *
 * @param ctx 25入力コンテキスト
 * @param rng ガウシアンノイズ用 RNG
 * @returns SwingLatentState 5 軸潜在量
 */
export function computeSwingLatentState(
  ctx: BatBallContext,
  rng: RNG,
): SwingLatentState {
  // ▼▼▼ ACP-IMPLEMENT-HERE ▼▼▼
  // 詳細実装は ACP に委譲。下記は V3 §4.3 公式の最小実装。

  const contactQuality = computeContactQuality(ctx, rng);
  const timingWindow = computeTimingWindow(ctx, rng);
  const swingIntent = computeSwingIntent(ctx);
  const decisionPressure = computeDecisionPressure(ctx);
  const barrelRate = computeBarrelRate(contactQuality, timingWindow, ctx);

  // ▲▲▲ ACP-IMPLEMENT-HERE ▲▲▲

  return {
    contactQuality,
    timingWindow,
    swingIntent,
    decisionPressure,
    barrelRate,
  };
}

// ============================================================
// 各潜在量の個別計算（テスト容易化のため公開）
// ============================================================

/**
 * 接触品質 0-1 — どれだけ芯で捉えたか
 * V3 §4.3 contactQuality 公式
 */
export function computeContactQuality(ctx: BatBallContext, rng: RNG): number {
  const contactStat = ctx.batter.contact / 100;
  const techniqueStat = ctx.batter.technique / 100;
  const timingPenalty = Math.abs(ctx.timingError) / 100;
  const difficulty = ctx.perceivedPitch.difficulty;

  const raw =
    0.4 * contactStat +
    0.3 * techniqueStat -
    0.5 * timingPenalty -
    0.4 * difficulty;

  const noise = rng.gaussian(0, CONTACT_QUALITY_NOISE_STDDEV);
  // sigmoid 中心 0、傾き 1 で 0.5 中央に
  return clamp01(sigmoid(raw + noise + 0.5));
}

/**
 * タイミング窓 -1〜+1 — 早すぎ(-)/遅すぎ(+)/ジャスト(0)
 * V3 §4.3 timingWindow 公式
 */
export function computeTimingWindow(ctx: BatBallContext, rng: RNG): number {
  const baseWindow = ctx.timingError / 100;
  const velImpact = ctx.perceivedPitch.velocityChangeImpact;
  const lateMov = ctx.perceivedPitch.lateMovement;
  const perturbation = velImpact * 0.3 + lateMov * 0.2;

  const contactReduction = 1 - ctx.batter.contact / 200; // 0.5〜1.0
  const noise = rng.gaussian(0, TIMING_WINDOW_NOISE_BASE + perturbation * contactReduction);

  return clamp(baseWindow + noise, -1, 1);
}

/**
 * スイング意図 -1〜+1 — 流し(-)/普通(0)/引っ張り(+)
 * V3 §4.3 swingIntent 公式
 */
export function computeSwingIntent(ctx: BatBallContext): number {
  const baseIntent = SWING_TYPE_INTENT_BIAS[ctx.batterSwingType];
  // pitch col: 0=内, 4=外（投手視点）
  // 内角(0) → 引っ張り(+0.4), 外角(4) → 流し(-0.4) になるよう (col-2)*0.2 ではなく (2-col)*0.2
  // V3 §4.3 では (col - 2) * 0.2 = -0.4〜+0.4 だが、
  // col 値の意味（0=内 / 4=外）と整合させるため逆転
  const locationBias = (2 - ctx.pitchActualLocation.col) * 0.2;
  const orderBias = FOCUS_AREA_INTENT_BIAS[ctx.orderFocusArea] ?? 0;
  const twoStrikeReduction =
    ctx.count.strikes >= 2 ? SWING_INTENT_REDUCTION_TWO_STRIKES : 1.0;

  // 左打者は方向反転（右打者基準で実装、左打者は -1 倍）
  const handednessFlip = ctx.batter.battingSide === 'left' ? -1 : 1;

  return clamp(
    (baseIntent + locationBias + orderBias) * twoStrikeReduction * handednessFlip,
    -1,
    1,
  );
}

/**
 * 判断プレッシャー 0-1 — 状況による緊張度
 * V3 §4.3 decisionPressure 公式
 *
 * V3 §4.3 公式に「打席のベースラインプレッシャー」を加味:
 *   basePressure (固定 0.3) + 状況加算 - mental軽減 + mood補正
 * これにより mental=50 でも完全に 0 に張り付かず、状況差が観測可能。
 */
export const DECISION_PRESSURE_BASELINE = 0.3;

export function computeDecisionPressure(ctx: BatBallContext): number {
  const keyMomentScore = ctx.isKeyMoment ? 1 : 0;

  // 接戦終盤判定
  const closeGame = Math.abs(ctx.scoreDiff) <= 2 && ctx.inning >= 7;
  const closeGameLateInning = closeGame ? 1 : 0;

  // 得点圏ランナー
  const scoringPosition = ctx.bases.second != null || ctx.bases.third != null ? 1 : 0;

  const situationPressure =
    keyMomentScore * 0.4 +
    closeGameLateInning * 0.25 +
    scoringPosition * 0.2;

  // メンタル能力 — BatterParams.mental は存在する（既存型確認済）
  // mental=50 で 0 軽減、99 で大幅軽減、10 でわずか軽減
  const mentalReduction = ((ctx.batter.mental - 50) / 50) * 0.25;

  // mood は -1〜+1。負＝悪い＝プレッシャー拡大
  const moodAdjustment = -ctx.batterMood * 0.15;

  return clamp01(
    DECISION_PRESSURE_BASELINE + situationPressure - mentalReduction + moodAdjustment,
  );
}

/**
 * バレル率 0-1 — 強い打球になる確率（contactQuality と power の複合）
 * V3 §4.3 barrelRate 公式
 */
export function computeBarrelRate(
  contactQuality: number,
  timingWindow: number,
  ctx: BatBallContext,
): number {
  const centerness = 1 - Math.abs(timingWindow);
  const powerFactor = 0.5 + 0.5 * (ctx.batter.power / 100);

  return clamp01(contactQuality * (0.4 + 0.6 * centerness) * powerFactor);
}

// ============================================================
// 内部ヘルパー
// ============================================================

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}
