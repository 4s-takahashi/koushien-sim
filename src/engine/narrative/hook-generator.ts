/**
 * src/engine/narrative/hook-generator.ts — NarrativeHook 生成器
 *
 * Phase R6: 21種打球分類から NarrativeHook を生成する。
 *
 * 設計方針:
 * - 純粋関数（副作用なし・乱数なし）
 * - DetailedHitType + PlayResolution の一部プロパティから決定論的に生成
 * - src/engine/physics/* は参照のみ（編集禁止）
 */

import type { DetailedHitType, BallTrajectoryParams, BallFlight } from '../physics/types';
import type {
  NarrativeHook,
  NarrativeHookKind,
  NarrativeDramaLevel,
  HomeRunDisplayFlag,
} from './types';
import {
  DETAILED_HIT_TYPE_LABEL,
  DETAILED_HIT_TYPE_SHORT,
  DETAILED_HIT_TYPE_CATEGORY,
} from './types';

// ============================================================
// メイン API
// ============================================================

/**
 * 21種打球分類から NarrativeHook を生成する
 *
 * @param detailedHitType - 21種打球分類
 * @param trajectory      - 4軸打球パラメータ（演出強度算出用）
 * @param flight          - 打球軌道（飛距離・滞空時間）
 * @returns NarrativeHook
 */
export function generateNarrativeHook(
  detailedHitType: DetailedHitType,
  trajectory: BallTrajectoryParams,
  flight: BallFlight,
): NarrativeHook {
  const kind = mapHitTypeToKind(detailedHitType, trajectory, flight);
  const dramaLevel = computeDramaLevel(detailedHitType, trajectory, flight);
  const homeRunFlag = computeHomeRunFlag(detailedHitType, trajectory);
  const commentaryText = buildCommentaryText(detailedHitType, trajectory, flight);
  const psycheHint = computePsycheHint(detailedHitType, trajectory);

  return {
    kind,
    detailedHitType,
    dramaLevel,
    homeRunFlag,
    commentaryText,
    shortLabel: DETAILED_HIT_TYPE_SHORT[detailedHitType],
    category: DETAILED_HIT_TYPE_CATEGORY[detailedHitType],
    psycheHint,
  };
}

// ============================================================
// DetailedHitType → NarrativeHookKind マッピング
// ============================================================

/**
 * 21種打球分類を NarrativeHookKind に変換する
 */
function mapHitTypeToKind(
  hitType: DetailedHitType,
  trajectory: BallTrajectoryParams,
  _flight: BallFlight,
): NarrativeHookKind {
  switch (hitType) {
    // ─── ホームラン系 ────────────────────────────────────────
    case 'line_drive_hr':
      return 'liner_home_run';
    case 'high_arc_hr':
      return 'high_arc_home_run';
    case 'fence_close_call':
      // ライン際はHR/ヒットどちらでもあり得るが演出は同じ
      return 'line_home_run';

    // ─── フェンス直撃 ────────────────────────────────────────
    case 'wall_ball':
      return 'wall_ball_hit';

    // ─── ポテンヒット系 ──────────────────────────────────────
    case 'over_infield_hit':
      return 'blooper_over_infield';
    case 'shallow_fly':
      // 浅いフライはポテン落ちの可能性あり（実際の落ちはflight/timelineで確認）
      // ここでは分類として shallow_fly → shallow_fly_drop の可能性をフラグ
      return 'shallow_fly_drop';

    // ─── ライン際ゴロ ────────────────────────────────────────
    case 'first_line_grounder':
    case 'third_line_grounder':
      return 'line_grounder';

    // ─── センター前・抜けるヒット ────────────────────────────
    case 'up_the_middle_hit':
      return 'center_clean_hit';

    case 'right_gap_hit':
    case 'left_gap_hit':
      return 'through_infield';

    // ─── ピッチャー返し ──────────────────────────────────────
    case 'comebacker':
      return 'comebacker_hard';

    // ─── 内野フライ・ポップ ──────────────────────────────────
    case 'high_infield_fly':
      return 'infield_popup';

    // ─── 当たり損ね ──────────────────────────────────────────
    case 'check_swing_dribbler':
      return 'weak_contact';

    // ─── 平凡なゴロ ──────────────────────────────────────────
    case 'right_side_grounder':
    case 'left_side_grounder':
      return 'routine_grounder';

    // ─── 平凡なフライ ────────────────────────────────────────
    case 'medium_fly':
    case 'deep_fly':
      return 'routine_fly';

    // ─── ライナー・ヒット ────────────────────────────────────
    case 'line_drive_hit':
    case 'infield_liner':
      // 高exitVelocityなら hard_hit_ball、通常は routine
      return trajectory.exitVelocity >= 140 ? 'hard_hit_ball' : 'routine_fly';

    // ─── ファウルフライ ──────────────────────────────────────
    case 'foul_fly':
      return 'foul_fly_close';

    default: {
      // exhaustive check
      const _never: never = hitType;
      return 'routine_fly';
    }
  }
}

// ============================================================
// 演出強度の算出
// ============================================================

/**
 * 演出強度を算出する
 *
 * 基本ルール:
 * - rare 系: high 以上
 * - HR 系: dramatic
 * - フェンス直撃 / ポテン: high
 * - 主要ヒット (gap hits): medium
 * - 凡打系: low
 */
function computeDramaLevel(
  hitType: DetailedHitType,
  trajectory: BallTrajectoryParams,
  _flight: BallFlight,
): NarrativeDramaLevel {
  switch (hitType) {
    // ─── dramatic ────────────────────────────────────────────
    case 'line_drive_hr':
    case 'high_arc_hr':
    case 'fence_close_call':
      return 'dramatic';

    // ─── high ────────────────────────────────────────────────
    case 'wall_ball':
    case 'over_infield_hit':
      return 'high';

    // ─── medium ──────────────────────────────────────────────
    case 'up_the_middle_hit':
    case 'right_gap_hit':
    case 'left_gap_hit':
    case 'line_drive_hit':
    case 'first_line_grounder':
    case 'third_line_grounder':
    case 'comebacker':
    case 'deep_fly':
      return 'medium';

    case 'infield_liner':
      // 鋭い内野ライナーは中強度
      return trajectory.exitVelocity >= 140 ? 'high' : 'medium';

    // ─── low ─────────────────────────────────────────────────
    case 'right_side_grounder':
    case 'left_side_grounder':
    case 'shallow_fly':
    case 'medium_fly':
    case 'high_infield_fly':
    case 'check_swing_dribbler':
    case 'foul_fly':
      return 'low';

    default:
      return 'low';
  }
}

// ============================================================
// HR 演出フラグの算出（R6-2）
// ============================================================

/**
 * ホームラン系の演出フラグを計算する（R6-2 要件）
 * HR 以外は undefined を返す
 */
function computeHomeRunFlag(
  hitType: DetailedHitType,
  trajectory: BallTrajectoryParams,
): HomeRunDisplayFlag | undefined {
  if (hitType !== 'line_drive_hr' && hitType !== 'high_arc_hr' && hitType !== 'fence_close_call') {
    return undefined;
  }

  const la = trajectory.launchAngle;

  return {
    isLineDrive: hitType === 'line_drive_hr' || (hitType === 'high_arc_hr' && la < 28),
    isHighArc:   hitType === 'high_arc_hr' || (hitType === 'line_drive_hr' && la >= 28),
    isCloseLine:  hitType === 'fence_close_call',
  };
}

// ============================================================
// 実況テキスト生成（R6-1）
// ============================================================

/**
 * 21種から実況テキストを生成する（固定テンプレート版）
 * R7 でより詳細な投球種・カウント依存テンプレートに拡張される。
 */
function buildCommentaryText(
  hitType: DetailedHitType,
  trajectory: BallTrajectoryParams,
  flight: BallFlight,
): string {
  const label = DETAILED_HIT_TYPE_LABEL[hitType];
  const ev = Math.round(trajectory.exitVelocity);
  const distM = Math.round(flight.distanceFt * 0.3048);  // feet → meters

  switch (hitType) {
    // ─── ホームラン ─────────────────────────────────────────
    case 'line_drive_hr':
      return `ライナー性の打球がそのままスタンドへ！矢のようなホームラン！（打球速度 ${ev}km/h）`;
    case 'high_arc_hr':
      return `大きなアーチを描いてスタンドへ！${distM}メートル級の高弾道ホームラン！`;
    case 'fence_close_call':
      return `ライン際へ！フェア！スタンドへ消えていく際どいホームラン！`;

    // ─── フェンス直撃（R6-4）────────────────────────────────
    case 'wall_ball':
      return `フェンス直撃！跳ね返りを狙うランナーが回る！（飛距離 ${distM}m）`;

    // ─── ポテンヒット（R6-3）────────────────────────────────
    case 'over_infield_hit':
      return `ポテンヒット！内野手の頭を越えて外野前に落ちる！`;
    case 'shallow_fly':
      return `浅いフライ！外野手が前進するが…落ちるのか？`;

    // ─── 強打 ────────────────────────────────────────────────
    case 'line_drive_hit':
      return `ライナー！鋭い打球が外野を抜けていく！`;
    case 'infield_liner':
      return `内野ライナー！${ev}km/h の鋭い打球！`;
    case 'comebacker':
      return `ピッチャー返し！投手の正面へ！`;

    // ─── ゴロ ────────────────────────────────────────────────
    case 'first_line_grounder':
      return `一塁線を破るゴロ！ライン際を転がる！`;
    case 'right_side_grounder':
      return `二遊間を抜けるゴロ！`;
    case 'left_side_grounder':
      return `三遊間への鋭いゴロ！`;
    case 'third_line_grounder':
      return `三塁線を破るゴロ！`;

    // ─── ヒット ──────────────────────────────────────────────
    case 'right_gap_hit':
      return `一二塁間を抜けるクリーンヒット！`;
    case 'up_the_middle_hit':
      return `センター前へクリーンヒット！`;
    case 'left_gap_hit':
      return `三遊間を破るヒット！`;

    // ─── フライ ──────────────────────────────────────────────
    case 'high_infield_fly':
      return `高い内野フライ！インフィールドフライ！`;
    case 'medium_fly':
      return `センターへ中距離フライ！`;
    case 'deep_fly':
      return `深いフライ！外野手が後退する！`;

    // ─── 特殊 ────────────────────────────────────────────────
    case 'foul_fly':
      return `ファウルフライ！際どいコースへの打球！`;
    case 'check_swing_dribbler':
      return `当たり損ね！投手前へのゆっくりした打球！`;

    default:
      return `${label}！`;
  }
}

// ============================================================
// 心理システムへの影響ヒント（R6-5）
// ============================================================

/**
 * 21種から心理システムへの影響ヒントを算出する
 *
 * 返値は -1.0〜+1.0 の正規化スコア:
 * - 打者: +1.0 = 最高の成功体験（HR）、-1.0 = 最悪の失敗（当たり損ね）
 * - 投手: +1.0 = 最高の結果（打者をアウト）、-1.0 = 最悪（HRを打たれる）
 */
function computePsycheHint(
  hitType: DetailedHitType,
  _trajectory: BallTrajectoryParams,
): { readonly batterImpact: number; readonly pitcherImpact: number } {
  switch (hitType) {
    // ─── 打者に大きな好影響 ──────────────────────────────────
    case 'line_drive_hr':   return { batterImpact: +1.0, pitcherImpact: -1.0 };
    case 'high_arc_hr':     return { batterImpact: +1.0, pitcherImpact: -1.0 };
    case 'fence_close_call': return { batterImpact: +0.9, pitcherImpact: -0.9 };
    case 'wall_ball':       return { batterImpact: +0.7, pitcherImpact: -0.7 };
    case 'deep_fly':        return { batterImpact: +0.4, pitcherImpact: -0.3 };

    // ─── 打者に好影響 ────────────────────────────────────────
    case 'over_infield_hit': return { batterImpact: +0.5, pitcherImpact: -0.4 };
    case 'line_drive_hit':   return { batterImpact: +0.5, pitcherImpact: -0.4 };
    case 'right_gap_hit':    return { batterImpact: +0.4, pitcherImpact: -0.3 };
    case 'up_the_middle_hit': return { batterImpact: +0.3, pitcherImpact: -0.3 };
    case 'left_gap_hit':     return { batterImpact: +0.4, pitcherImpact: -0.3 };
    case 'first_line_grounder': return { batterImpact: +0.2, pitcherImpact: -0.1 };
    case 'third_line_grounder': return { batterImpact: +0.2, pitcherImpact: -0.1 };
    case 'infield_liner':    return { batterImpact: +0.2, pitcherImpact: -0.1 };

    // ─── 中立 ────────────────────────────────────────────────
    case 'right_side_grounder': return { batterImpact: 0.0, pitcherImpact: +0.1 };
    case 'left_side_grounder':  return { batterImpact: 0.0, pitcherImpact: +0.1 };
    case 'comebacker':          return { batterImpact: -0.1, pitcherImpact: +0.2 };
    case 'shallow_fly':         return { batterImpact: -0.1, pitcherImpact: +0.1 };
    case 'medium_fly':          return { batterImpact: -0.1, pitcherImpact: +0.2 };

    // ─── 投手に好影響（打者に悪影響） ───────────────────────
    case 'high_infield_fly': return { batterImpact: -0.3, pitcherImpact: +0.4 };
    case 'foul_fly':         return { batterImpact: -0.1, pitcherImpact: +0.2 };
    case 'check_swing_dribbler': return { batterImpact: -0.5, pitcherImpact: +0.5 };

    default:
      return { batterImpact: 0.0, pitcherImpact: 0.0 };
  }
}

// ============================================================
// ポテンヒット判定ヘルパー（R6-3）
// ============================================================

/**
 * 浅いフライがポテン落ちする状況かどうかを判定する（R6-3）
 *
 * 条件:
 * - hitType が over_infield_hit または shallow_fly
 * - launchAngle が低め (< 30度) → 外野手が前進が難しい軌道
 * - 飛距離が OVER_INFIELD_MIN_DIST〜SHALLOW_FLY_MAX_DIST 範囲
 */
export function isPotentialBlooper(
  hitType: DetailedHitType,
  trajectory: BallTrajectoryParams,
  flight: BallFlight,
): boolean {
  if (hitType !== 'over_infield_hit' && hitType !== 'shallow_fly') {
    return false;
  }
  const distFt = flight.distanceFt;
  // ポテンヒット距離帯: 90〜220ft
  const inBlooperRange = distFt >= 90 && distFt <= 220;
  // 低〜中角度の打球（高すぎると普通のフライになる）
  const isLowToMidAngle = trajectory.launchAngle <= 35;
  return inBlooperRange && isLowToMidAngle;
}

// ============================================================
// フェンス直撃判定ヘルパー（R6-4）
// ============================================================

/**
 * フェンス直撃演出が必要な状況かどうかを判定する（R6-4）
 *
 * wall_ball の NarrativeHook に追加演出情報を付与するために使用する。
 */
export function isWallBallDramatic(
  hitType: DetailedHitType,
  flight: BallFlight,
): boolean {
  if (hitType !== 'wall_ball') return false;
  // 飛距離が長いほど（フェンス際を叩いたほど）ドラマ性が高い
  return flight.distanceFt >= 300;
}

// ============================================================
// 実況ログテキスト生成（R6-1 統計集計用）
// ============================================================

/**
 * AtBatResult ログに追加する21種ベースの実況テキストを生成する
 *
 * @param hitType - 21種打球分類
 * @param isHit   - ヒット判定か（result.fieldResult.type から）
 * @returns ログテキスト
 */
export function buildDetailedHitLogText(
  hitType: DetailedHitType,
  isHit: boolean,
): string {
  const label = DETAILED_HIT_TYPE_LABEL[hitType];
  const short = DETAILED_HIT_TYPE_SHORT[hitType];

  if (!isHit) {
    // アウトの場合
    return `[${short}] ${label} → アウト`;
  }
  return `[${short}] ${label} → ヒット`;
}
