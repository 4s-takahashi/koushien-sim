/**
 * engine/physics/bat-ball/latent-state.ts
 * Phase R2-1: Step A — 25入力 → 中間潜在量 5 軸（V3 §4.3）
 *
 * 入力変数を一度この5軸に圧縮してから 4 軸打球パラメータに変換する。
 * 各軸は独立にチューニング可能で、デバッグ・テストしやすい。
 *
 * V3 §4.3 完全準拠: 各軸の独立計算・心理効果・プレッシャー反映
 */

import type { SwingLatentState, BatBallContext, PerceivedPitchQuality } from '../types';
import type { RNG } from '../../core/rng';

// ============================================================
// 公式・定数（V3 §4.3 準拠）
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

/**
 * R7-1: order.aggressiveness → contactQuality 補正
 *
 * aggressive: 積極的に振りに行く → ミート集中が分散、タイミングばらつき増加 → -0.04
 * passive:    選球優先 → 好球必打で芯を捉えやすい → +0.03
 * normal:     補正なし
 */
export const AGGRESSIVENESS_CONTACT_BIAS: Readonly<Record<string, number>> = {
  aggressive: -0.04,
  normal:      0.0,
  passive:    +0.03,
};

/**
 * R7-1: order.aggressiveness → decisionPressure 補正
 *
 * aggressive: 振る決断が早い → プレッシャー低減 (-0.05)
 * passive:    見極めようとする → プレッシャー上昇 (+0.03)
 */
export const AGGRESSIVENESS_PRESSURE_BIAS: Readonly<Record<string, number>> = {
  aggressive: -0.05,
  normal:      0.0,
  passive:    +0.03,
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
 *     副: timingError, ballOnBat（芯ズレ）, perceivedPitch.difficulty
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
  const contactQuality = computeContactQuality(ctx, rng);
  const timingWindow = computeTimingWindow(ctx, rng);
  const swingIntent = computeSwingIntent(ctx);
  const decisionPressure = computeDecisionPressure(ctx);
  const barrelRate = computeBarrelRate(contactQuality, timingWindow, ctx);

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
 * V3 §4.3 contactQuality 公式（精密化）
 *
 * sigmoid(
 *   0.4 * contact/100
 *   + 0.3 * technique/100
 *   - 0.5 * |timingError|/100
 *   - 0.4 * difficulty
 *   + 0.2 * ballOnBat          // 芯ズレ補正（ballOnBat=1.0 で最高、0 で最低）
 *   + gaussian(0, 0.05)
 * )
 *
 * 上記 raw の合計範囲: -0.5 〜 +0.9 → sigmoid で約 0.38〜0.71
 * オフセット +0.3 を加えて sigmoid 中央を 0.65 付近に調整
 */
export function computeContactQuality(ctx: BatBallContext, rng: RNG): number {
  const contactStat = ctx.batter.contact / 100;
  const techniqueStat = ctx.batter.technique / 100;
  const timingPenalty = Math.abs(ctx.timingError) / 100;
  const difficulty = ctx.perceivedPitch.difficulty;

  // ballOnBat: 1.0=完全芯、0.0=完全外れ。芯ズレが大きいほど低下。
  // 0.5 をニュートラルとし、上下に ±0.15 補正（独立入力）
  const ballOnBatBonus = (ctx.ballOnBat - 0.5) * 0.3;

  // R7-1: orderAggressiveness → contactQuality 補正
  // passive: 好球必打で芯を捉えやすい、aggressive: 強振でミートが分散
  const aggressivenessBias = AGGRESSIVENESS_CONTACT_BIAS[ctx.orderAggressiveness] ?? 0;

  const raw =
    0.4 * contactStat +
    0.3 * techniqueStat -
    0.5 * timingPenalty -
    0.4 * difficulty +
    ballOnBatBonus +
    aggressivenessBias;

  const noise = rng.gaussian(0, CONTACT_QUALITY_NOISE_STDDEV);

  // sigmoid 中心を 0.3 オフセットで調整し、contact=50、difficulty=0.2、timingError=0
  // の標準状態で約 0.55〜0.65 程度の品質を生成
  return clamp01(sigmoid(raw + noise + 0.3));
}

/**
 * タイミング窓 -1〜+1 — 早すぎ(-)/遅すぎ(+)/ジャスト(0)
 * V3 §4.3 timingWindow 公式（精密化）
 *
 * baseWindow = timingError / 100
 * perturbation = velocityChangeImpact * 0.3 + lateMovement * 0.2
 * timingWindow = clamp(baseWindow + gaussian(0, (NOISE_BASE + perturbation) * (1 - contact/200)), -1, 1)
 *
 * contact=100 で揺れ係数 0.5x、contact=0 で 1.0x
 */
export function computeTimingWindow(ctx: BatBallContext, rng: RNG): number {
  const baseWindow = ctx.timingError / 100;
  const velImpact = ctx.perceivedPitch.velocityChangeImpact;
  const lateMov = ctx.perceivedPitch.lateMovement;

  // 変化球の終盤変化・緩急が打者タイミング精度を乱す
  const perturbation = velImpact * 0.3 + lateMov * 0.2;

  // contact が高い打者ほどタイミング揺れが縮小
  const contactReduction = 1 - ctx.batter.contact / 200; // 0.5 (contact=100) 〜 1.0 (contact=0)
  const noiseStdDev = (TIMING_WINDOW_NOISE_BASE + perturbation) * contactReduction;
  const noise = rng.gaussian(0, noiseStdDev);

  return clamp(baseWindow + noise, -1, 1);
}

/**
 * スイング意図 -1〜+1 — 流し(-)/普通(0)/引っ張り(+)
 * V3 §4.3 swingIntent 公式（精密化）
 *
 * baseIntent = swingTypeBias[swingType]         // -0.3/0/+0.3
 * locationBias = (2 - col) * 0.2               // 内角(col=0)→+0.4、外角(col=4)→-0.4
 * orderBias = focusAreaBias[focusArea]          // ±0.2
 * twoStrikeReduction = strikes>=2 ? 0.5 : 1.0  // 追い込まれたらバイアス縮小
 * handednessFlip = battingSide==='left' ? -1 : 1
 */
export function computeSwingIntent(ctx: BatBallContext): number {
  const baseIntent = SWING_TYPE_INTENT_BIAS[ctx.batterSwingType];

  // pitch col: 0=内角(打者から見て近い), 4=外角
  // 内角 → 引っ張り(+0.4)、外角 → 流し(-0.4)
  const locationBias = (2 - ctx.pitchActualLocation.col) * 0.2;

  const orderBias = FOCUS_AREA_INTENT_BIAS[ctx.orderFocusArea] ?? 0;

  const twoStrikeReduction =
    ctx.count.strikes >= 2 ? SWING_INTENT_REDUCTION_TWO_STRIKES : 1.0;

  // 左打者は引っ張り方向が逆（三塁方向）になるため反転
  const handednessFlip = ctx.batter.battingSide === 'left' ? -1 : 1;

  return clamp(
    (baseIntent + locationBias + orderBias) * twoStrikeReduction * handednessFlip,
    -1,
    1,
  );
}

/**
 * 判断プレッシャー 0-1 — 状況による緊張度
 * V3 §4.3 decisionPressure 公式（精密化）
 *
 * basePressure = keyMomentScore * 0.4 + closeGameLateInning * 0.25 + scoringPosition * 0.2
 *              + outsBonus * 0.1 + baselinePressure
 * mentalReduction = (mental - 50) / 50 * 0.25   // mental=50 で 0、99 で +0.245
 * moodAdjustment = -mood * 0.15                  // 負=悪い→上昇、正=良い→低下
 * decisionPressure = clamp(basePressure - mentalReduction + moodAdjustment, 0, 1)
 */
export const DECISION_PRESSURE_BASELINE = 0.3;

export function computeDecisionPressure(ctx: BatBallContext): number {
  const keyMomentScore = ctx.isKeyMoment ? 1 : 0;

  // 接戦終盤判定（7回以降かつ点差2以内）
  const closeGame = Math.abs(ctx.scoreDiff) <= 2 && ctx.inning >= 7;
  const closeGameLateInning = closeGame ? 1 : 0;

  // 得点圏ランナー（2塁または3塁に走者）
  const scoringPosition =
    ctx.bases.second != null || ctx.bases.third != null ? 1 : 0;

  // アウト数ボーナス（2アウトは状況プレッシャー追加）
  const outsBonus = ctx.outs === 2 ? 1 : 0;

  const situationPressure =
    keyMomentScore * 0.4 +
    closeGameLateInning * 0.25 +
    scoringPosition * 0.2 +
    outsBonus * 0.1;

  // メンタル能力: mental=50 で中立、高いほど軽減
  // (mental - 50) / 50 * 0.25 → mental=99 で約 +0.245 の軽減
  const mentalReduction = ((ctx.batter.mental - 50) / 50) * 0.25;

  // mood: -1〜+1。負=悪い=プレッシャー拡大、正=良い=低下
  const moodAdjustment = -ctx.batterMood * 0.15;

  // R7-1: orderAggressiveness → decisionPressure 補正
  // aggressive: 振ると決めているため迷いが減る → プレッシャー低減
  // passive:    見極め判断が増える → プレッシャー上昇
  const aggressivenessPressureBias = AGGRESSIVENESS_PRESSURE_BIAS[ctx.orderAggressiveness] ?? 0;

  return clamp01(
    DECISION_PRESSURE_BASELINE + situationPressure - mentalReduction + moodAdjustment + aggressivenessPressureBias,
  );
}

/**
 * バレル率 0-1 — 強い打球になる確率（contactQuality と power の複合）
 * V3 §4.3 barrelRate 公式
 *
 * centerness = 1 - |timingWindow|      // ジャストに近いほど 1.0
 * powerFactor = 0.5 + 0.5 * power/100 // power=0 で 0.5, power=100 で 1.0
 * barrelRate = contactQuality * (0.4 + 0.6 * centerness) * powerFactor
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
