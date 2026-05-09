/**
 * catcher-target-location.ts — キャッチャー要求位置生成
 *
 * v0.48 Phase 3: 1球ごとにキャッチャーが要求するコース（PitchLocation）を生成する。
 * 監督指示への従否も計算し、結果を CatcherRequestResult として返す。
 *
 * 設計書: SPEC_v0.48_BATTERY_AND_FIELDING.md Section 3.1
 *
 * 純粋関数: Math.random() 不使用。乱数は RNG を引数で受け取る。
 */

import type { PitchLocation } from '../types';
import type { RNG } from '../../core/rng';
import type { CatcherProfile } from '../../types/player';
import type { CatcherDetailedOrder } from '../types';

// ============================================================
// 型定義
// ============================================================

/**
 * キャッチャーの 1 球あたり要求位置コンテキスト
 */
export interface CatcherRequestContext {
  /** キャッチャープロフィール（未設定時はデフォルトを使用） */
  catcherProfile?: CatcherProfile;
  /** キャッチャー実効 fielding 0-100 */
  catcherFielding: number;
  /** キャッチャー実効 mental 0-100 */
  catcherMental: number;
  /** 投手の現在コントロール 0-100 */
  pitcherControl: number;
  /** 投手スタミナ 0-100 */
  pitcherStamina: number;
  /** カウント */
  count: { balls: number; strikes: number };
  /** 監督の詳細指示（省略可） */
  managerOrder?: CatcherDetailedOrder;
  /** 監督指示コンプライアンス率（省略時 = 0.90） */
  managerComplianceRate?: number;
}

/**
 * キャッチャーの要求生成結果
 */
export interface CatcherRequestResult {
  /** キャッチャーが要求するコース（5×5グリッド） */
  requestLocation: PitchLocation;
  /**
   * 監督指示が反映されたか
   * true = 監督の意図通りのコースを要求
   * false = キャッチャー独自の判断
   */
  isManagerOrderApplied: boolean;
  /**
   * 要求の質スコア 0-1
   * 1.0 = キャッチャーが最適なコースを要求
   * 0.5 = 能力制限で妥協したコース
   */
  requestQuality: number;
}

// ============================================================
// 内部定数
// ============================================================

/** callingAccuracy の「高精度」閾値 */
const HIGH_ACCURACY_THRESHOLD = 70;
/** callingAccuracy の「低精度」閾値 */
const LOW_ACCURACY_THRESHOLD = 40;

/** デフォルトコンプライアンス率 */
const DEFAULT_COMPLIANCE_RATE = 0.90;

// ============================================================
// 内部ヘルパー
// ============================================================

/**
 * 5×5 グリッドのストライクゾーン内（row 1-3, col 1-3）からランダムなコースを選ぶ
 */
function pickStrikeZoneLocation(rng: RNG): PitchLocation {
  return {
    row: rng.intBetween(1, 3),
    col: rng.intBetween(1, 3),
  };
}

/**
 * ゾーン外コースを選ぶ（外周: row 0/4 or col 0/4）
 */
function pickBallZoneLocation(rng: RNG): PitchLocation {
  const r = rng.next();
  if (r < 0.5) {
    return { row: rng.chance(0.5) ? 0 : 4, col: rng.intBetween(1, 3) };
  } else if (r < 0.75) {
    return { row: rng.intBetween(1, 3), col: rng.chance(0.5) ? 0 : 4 };
  } else {
    return { row: rng.chance(0.5) ? 0 : 4, col: rng.chance(0.5) ? 0 : 4 };
  }
}

/**
 * 監督指示の focusArea から推奨コース列（col）を返す
 * outside → col 3, inside → col 1, any/未指定 → null
 */
function focusAreaToPreferredCol(focusArea: 'outside' | 'inside' | 'any' | undefined): number | null {
  if (focusArea === 'outside') return 3;
  if (focusArea === 'inside') return 1;
  return null;
}

/**
 * 監督指示の callingStyle から推奨ゾーン内狙い率補正を返す
 */
function callingStyleToZoneBias(
  style: 'attack' | 'careful' | 'mixed' | undefined,
): number {
  if (style === 'attack') return 0.15;
  if (style === 'careful') return -0.10;
  return 0;
}

// ============================================================
// メイン関数
// ============================================================

/**
 * キャッチャーの 1 球あたり要求位置を生成する
 *
 * ロジック:
 * 1. callingAccuracy によりベースコースを決定
 *    - 高精度(>=70): ストライクゾーン内の最適座標（カウント・監督指示反映）
 *    - 中精度(40-70): ±1マスの誤差あり
 *    - 低精度(<40): ランダム成分が大きい
 * 2. managerOrder がある場合:
 *    - complianceRate(default=0.90) で指示に従うか判定
 *    - 従わない場合はキャッチャー独自の要求に戻る
 * 3. requestQuality の計算:
 *    = (callingAccuracy / 100) × 0.6 + (catcherMental / 100) × 0.4
 *    × pitcherControl の制限も考慮
 *
 * 純粋関数: Math.random() 不使用。RNG を引数で受け取る。
 */
export function generateCatcherRequest(
  ctx: CatcherRequestContext,
  rng: RNG,
): CatcherRequestResult {
  const callingAccuracy = ctx.catcherProfile?.callingAccuracy ?? 50;
  const complianceRate = ctx.managerComplianceRate ?? DEFAULT_COMPLIANCE_RATE;

  // ── Step 1: キャッチャー独自の要求コース決定 ──
  const baseRequest = buildBaseRequest(ctx, callingAccuracy, rng.derive('catcher-base'));

  // ── Step 2: 監督指示の反映 ──
  let finalLocation: PitchLocation;
  let isManagerOrderApplied = false;

  if (ctx.managerOrder) {
    const complied = rng.derive('catcher-compliance').chance(complianceRate);
    if (complied) {
      finalLocation = applyManagerOrderToLocation(
        baseRequest,
        ctx.managerOrder,
        ctx.count,
        rng.derive('catcher-manager-order'),
      );
      isManagerOrderApplied = true;
    } else {
      finalLocation = baseRequest;
      isManagerOrderApplied = false;
    }
  } else {
    finalLocation = baseRequest;
    isManagerOrderApplied = false;
  }

  // ── Step 3: requestQuality の計算 ──
  // callingAccuracy × 0.6 + mental × 0.4、投手 control で上限補正
  const rawQuality =
    (callingAccuracy / 100) * 0.6 +
    (ctx.catcherMental / 100) * 0.4;
  // 投手のコントロールが低ければ要求の実効質も下がる（最大80%まで）
  const controlFactor = Math.min(1.0, 0.4 + (ctx.pitcherControl / 100) * 0.6);
  const requestQuality = Math.max(0, Math.min(1, rawQuality * controlFactor));

  return {
    requestLocation: finalLocation,
    isManagerOrderApplied,
    requestQuality,
  };
}

// ============================================================
// 内部: ベースリクエスト生成
// ============================================================

function buildBaseRequest(
  ctx: CatcherRequestContext,
  callingAccuracy: number,
  rng: RNG,
): PitchLocation {
  const { count } = ctx;

  if (callingAccuracy >= HIGH_ACCURACY_THRESHOLD) {
    // 高精度: ストライクゾーン内の有効なコースを要求
    // 追い込まれカウントでは低めゾーン外をボール球として活用
    const useZone = count.balls < 3 || rng.chance(0.85);
    if (useZone) {
      // カウントに応じた最適エリア
      if (count.strikes === 2) {
        // 2ストライク: ゾーン際（低め外角）
        return { row: 3, col: 3 };
      } else if (count.balls === 3) {
        // スリーボール: ゾーン内ストライクを要求
        return { row: rng.intBetween(2, 3), col: rng.intBetween(1, 3) };
      } else {
        // 通常: ゾーン内をランダムに
        return pickStrikeZoneLocation(rng);
      }
    } else {
      // ボール球で勝負（高精度なら意図的に）
      return pickBallZoneLocation(rng);
    }
  } else if (callingAccuracy >= LOW_ACCURACY_THRESHOLD) {
    // 中精度: ±1 マスの誤差あり
    const base = pickStrikeZoneLocation(rng);
    // ±1 マスのブレを追加（確率 30%）
    if (rng.chance(0.30)) {
      const rowOffset = rng.intBetween(-1, 1);
      const colOffset = rng.intBetween(-1, 1);
      return {
        row: Math.max(0, Math.min(4, base.row + rowOffset)),
        col: Math.max(0, Math.min(4, base.col + colOffset)),
      };
    }
    return base;
  } else {
    // 低精度: ランダム性が高い（ゾーン外に構えてしまうことも）
    if (rng.chance(0.60)) {
      return pickStrikeZoneLocation(rng);
    } else {
      return pickBallZoneLocation(rng);
    }
  }
}

// ============================================================
// 内部: 監督指示をコースに反映
// ============================================================

function applyManagerOrderToLocation(
  base: PitchLocation,
  order: CatcherDetailedOrder,
  count: { balls: number; strikes: number },
  rng: RNG,
): PitchLocation {
  let { row, col } = base;

  // focusArea の反映（コース指定）
  const preferredCol = focusAreaToPreferredCol(order.focusArea);
  if (preferredCol !== null) {
    col = preferredCol;
    // row はゾーン内に収める
    row = Math.max(1, Math.min(3, row));
  }

  // callingStyle の反映（ゾーン内 or 外を決定）
  const zoneBias = callingStyleToZoneBias(order.callingStyle);
  const zoneTargetRate = 0.65 + zoneBias + (count.balls === 3 ? 0.20 : 0);
  const useZone = rng.chance(Math.min(0.95, Math.max(0.1, zoneTargetRate)));

  if (useZone) {
    // ゾーン内に収める
    row = Math.max(1, Math.min(3, row));
    col = preferredCol !== null ? preferredCol : Math.max(1, Math.min(3, col));
  } else {
    // attack で積極的な場合はゾーン際ボール球
    if (order.callingStyle === 'attack') {
      row = rng.chance(0.5) ? 0 : 4;
    } else {
      row = Math.max(0, Math.min(4, row));
    }
  }

  // aggressiveness の反映
  if (order.aggressiveness === 'aggressive') {
    // より攻めたコース（内角/ゾーン際）
    row = Math.max(1, Math.min(3, row));
  } else if (order.aggressiveness === 'passive') {
    // より慎重なコース（ゾーン中央寄り）
    if (row === 0) row = 1;
    if (row === 4) row = 3;
    if (col === 0) col = 1;
    if (col === 4) col = 3;
  }

  return { row, col };
}
