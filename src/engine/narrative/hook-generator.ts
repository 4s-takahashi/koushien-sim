/**
 * src/engine/narrative/hook-generator.ts — NarrativeHook 生成器
 *
 * Phase R6: 21種打球分類から NarrativeHook を生成する。
 * Phase R7-4: 投球種 × カウント対応の実況テンプレート拡張 + 単調さ回避ロジック。
 *
 * 設計方針:
 * - 純粋関数（副作用なし・乱数なし）
 * - DetailedHitType + PlayResolution の一部プロパティから決定論的に生成
 * - src/engine/physics/* は参照のみ（編集禁止）
 * - R7-4: pitchType × count × 打球種の組み合わせで実況テキストを多様化
 *   同一試合内での単調さを避けるため recentCommentaryIds で使用済みパターンを除外
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
// R7-4: 実況コンテキスト（オプション拡張引数）
// ============================================================

/**
 * R7-4 実況生成コンテキスト
 * 投球種・カウント・直近使用済みテンプレートIDを受け取ることで
 * 多様な実況テキストを生成する。
 */
export interface CommentaryContext {
  /** 投球種（fastball/slider/curve/fork/changeup/cutter/sinker/breaking/any） */
  pitchType?: string;
  /** ボールカウント */
  balls?: number;
  /** ストライクカウント */
  strikes?: number;
  /** 直近に使用した実況テンプレートID（重複回避用） */
  recentCommentaryIds?: ReadonlySet<string>;
}

// ============================================================
// R7-4: 投球種ラベル
// ============================================================

const PITCH_TYPE_LABEL: Readonly<Record<string, string>> = {
  fastball:  'ストレート',
  slider:    'スライダー',
  curve:     'カーブ',
  fork:      'フォーク',
  changeup:  'チェンジアップ',
  cutter:    'カット',
  sinker:    'シンカー',
  breaking:  '変化球',
  any:       '投球',
};

/** 投球種の日本語ラベルを返す（未知種はそのまま返す） */
function pitchTypeLabel(pitchType?: string): string {
  if (!pitchType) return '投球';
  return PITCH_TYPE_LABEL[pitchType] ?? pitchType;
}

// ============================================================
// R7-4: 実況テンプレートDB（hitType × pitchType × count）
// ============================================================

interface CommentaryTemplate {
  id: string;
  /** マッチ条件 */
  matchHitType?: ReadonlyArray<DetailedHitType>;
  matchPitchType?: ReadonlyArray<string>;
  /** カウント条件 */
  matchStrikes?: number;
  matchBalls?: number;
  /** テキスト（${pitchLabel} を動的に置換可能） */
  text: string;
  weight: number;
}

/**
 * R7-4 実況テンプレートDB
 *
 * 21種 × 投球種 × カウントの組み合わせで実況の多様化を実現する。
 * hitType なし = 汎用テンプレート（fallback）
 */
const COMMENTARY_TEMPLATE_DB: CommentaryTemplate[] = [

  // ─── HR 系 ───────────────────────────────────────────────────

  {
    id: 'hr_fastball',
    matchHitType: ['line_drive_hr', 'high_arc_hr'],
    matchPitchType: ['fastball'],
    text: 'ストレートを完璧に捉えた！弾丸ライナーがそのままスタンドへ！',
    weight: 90,
  },
  {
    id: 'hr_breaking_surprise',
    matchHitType: ['line_drive_hr', 'high_arc_hr'],
    matchPitchType: ['slider', 'curve', 'fork'],
    text: '${pitchLabel}を読んでいた！フルスイングでスタンドへ叩き込む！',
    weight: 85,
  },
  {
    id: 'hr_two_strikes',
    matchHitType: ['line_drive_hr', 'high_arc_hr'],
    matchStrikes: 2,
    text: '追い込まれてからのホームラン！逆転劇に会場が沸く！',
    weight: 95,
  },
  {
    id: 'hr_full_count',
    matchHitType: ['line_drive_hr', 'high_arc_hr'],
    matchBalls: 3,
    matchStrikes: 2,
    text: 'フルカウントからの長打！ドラマチックな一打がスタンドへ！',
    weight: 100,
  },
  {
    id: 'hr_liner_specific',
    matchHitType: ['line_drive_hr'],
    text: 'ライナー性の打球がそのままスタンドへ！矢のようなホームラン！',
    weight: 80,
  },
  {
    id: 'hr_arc_specific',
    matchHitType: ['high_arc_hr'],
    text: '大きなアーチを描いてスタンドへ！高弾道の豪快なホームラン！',
    weight: 80,
  },
  {
    id: 'hr_close_line',
    matchHitType: ['fence_close_call'],
    text: 'ライン際へ！フェア！スタンドへ消えていく際どいホームラン！',
    weight: 90,
  },

  // ─── フェンス直撃 ──────────────────────────────────────────

  {
    id: 'wall_ball_fastball',
    matchHitType: ['wall_ball'],
    matchPitchType: ['fastball'],
    text: 'ストレートを打ち返してフェンス直撃！跳ね返りを狙うランナーが回る！',
    weight: 85,
  },
  {
    id: 'wall_ball_breaking',
    matchHitType: ['wall_ball'],
    matchPitchType: ['slider', 'curve', 'fork', 'changeup'],
    text: '${pitchLabel}を振り抜いてフェンス直撃！長打確実！',
    weight: 85,
  },
  {
    id: 'wall_ball_generic',
    matchHitType: ['wall_ball'],
    text: 'フェンス直撃！跳ね返りを狙うランナーが回る！',
    weight: 70,
  },

  // ─── ポテンヒット系 ──────────────────────────────────────

  {
    id: 'blooper_two_strikes',
    matchHitType: ['over_infield_hit'],
    matchStrikes: 2,
    text: '追い込まれてもポテンヒット！追い詰められた中でのラッキーヒット！',
    weight: 85,
  },
  {
    id: 'blooper_fastball',
    matchHitType: ['over_infield_hit'],
    matchPitchType: ['fastball'],
    text: 'ストレートをどん詰まり！内野の頭を越えてポテンヒット！',
    weight: 80,
  },
  {
    id: 'blooper_generic',
    matchHitType: ['over_infield_hit'],
    text: 'ポテンヒット！内野手の頭を越えて外野前に落ちる！',
    weight: 70,
  },
  {
    id: 'shallow_fly_suspense',
    matchHitType: ['shallow_fly'],
    text: '浅いフライ！外野手が前進するが…落ちるのか？',
    weight: 80,
  },

  // ─── 強打系 ──────────────────────────────────────────────

  {
    id: 'line_drive_fastball',
    matchHitType: ['line_drive_hit'],
    matchPitchType: ['fastball'],
    text: 'ストレートを弾き返すライナー！鋭い打球が外野を抜けていく！',
    weight: 85,
  },
  {
    id: 'line_drive_slider',
    matchHitType: ['line_drive_hit'],
    matchPitchType: ['slider'],
    text: 'スライダーをうまくさばいてライナーヒット！バットコントロールが冴える！',
    weight: 80,
  },
  {
    id: 'line_drive_generic',
    matchHitType: ['line_drive_hit'],
    text: 'ライナー！鋭い打球が外野を抜けていく！',
    weight: 70,
  },
  {
    id: 'comebacker_fastball',
    matchHitType: ['comebacker'],
    matchPitchType: ['fastball'],
    text: 'ストレートをそのまま弾き返す！ピッチャー返し！',
    weight: 80,
  },
  {
    id: 'comebacker_generic',
    matchHitType: ['comebacker'],
    text: 'ピッチャー返し！投手の正面へ！',
    weight: 70,
  },

  // ─── ゴロ系 ──────────────────────────────────────────────

  {
    id: 'grounder_line1_count',
    matchHitType: ['first_line_grounder'],
    matchBalls: 3,
    text: '3ボールから一塁線を破るゴロ！粘りのヒット！',
    weight: 80,
  },
  {
    id: 'grounder_line1_generic',
    matchHitType: ['first_line_grounder'],
    text: '一塁線を破るゴロ！ライン際を転がる！',
    weight: 70,
  },
  {
    id: 'grounder_line3_two_strikes',
    matchHitType: ['third_line_grounder'],
    matchStrikes: 2,
    text: '2ストライクから三塁線を破るゴロ！意地のヒット！',
    weight: 85,
  },
  {
    id: 'grounder_line3_generic',
    matchHitType: ['third_line_grounder'],
    text: '三塁線を破るゴロ！',
    weight: 70,
  },
  {
    id: 'grounder_right_generic',
    matchHitType: ['right_side_grounder'],
    text: '二遊間を抜けるゴロ！',
    weight: 70,
  },
  {
    id: 'grounder_left_generic',
    matchHitType: ['left_side_grounder'],
    text: '三遊間への鋭いゴロ！',
    weight: 70,
  },

  // ─── ヒット系 ────────────────────────────────────────────

  {
    id: 'hit_center_fastball',
    matchHitType: ['up_the_middle_hit'],
    matchPitchType: ['fastball'],
    text: 'ストレートをはじき返してセンター前！クリーンヒット！',
    weight: 85,
  },
  {
    id: 'hit_center_breaking',
    matchHitType: ['up_the_middle_hit'],
    matchPitchType: ['slider', 'curve', 'fork'],
    text: '${pitchLabel}を見極めてセンター前！技ありのヒット！',
    weight: 80,
  },
  {
    id: 'hit_center_generic',
    matchHitType: ['up_the_middle_hit'],
    text: 'センター前へクリーンヒット！',
    weight: 70,
  },
  {
    id: 'hit_right_two_strikes',
    matchHitType: ['right_gap_hit'],
    matchStrikes: 2,
    text: '追い込まれてから一二塁間を破る！執念のヒット！',
    weight: 85,
  },
  {
    id: 'hit_right_generic',
    matchHitType: ['right_gap_hit'],
    text: '一二塁間を抜けるクリーンヒット！',
    weight: 70,
  },
  {
    id: 'hit_left_fork',
    matchHitType: ['left_gap_hit'],
    matchPitchType: ['fork'],
    text: 'フォークを上手くすくい上げて三遊間を破る！',
    weight: 80,
  },
  {
    id: 'hit_left_generic',
    matchHitType: ['left_gap_hit'],
    text: '三遊間を破るヒット！',
    weight: 70,
  },

  // ─── フライ系 ────────────────────────────────────────────

  {
    id: 'fly_infield_popup_generic',
    matchHitType: ['high_infield_fly'],
    text: '高い内野フライ！インフィールドフライ！',
    weight: 80,
  },
  {
    id: 'fly_medium_two_outs',
    matchHitType: ['medium_fly'],
    text: 'センターへ中距離フライ！',
    weight: 70,
  },
  {
    id: 'fly_deep_fastball',
    matchHitType: ['deep_fly'],
    matchPitchType: ['fastball'],
    text: 'ストレートを叩いた！深いフライ！外野手が後退する！',
    weight: 80,
  },
  {
    id: 'fly_deep_generic',
    matchHitType: ['deep_fly'],
    text: '深いフライ！外野手が後退する！',
    weight: 70,
  },

  // ─── 特殊 ────────────────────────────────────────────────

  {
    id: 'foul_fly_full_count',
    matchHitType: ['foul_fly'],
    matchBalls: 3,
    matchStrikes: 2,
    text: 'フルカウントからファウルフライ！際どい打球！',
    weight: 85,
  },
  {
    id: 'foul_fly_generic',
    matchHitType: ['foul_fly'],
    text: 'ファウルフライ！際どいコースへの打球！',
    weight: 70,
  },
  {
    id: 'weak_contact_breaking',
    matchHitType: ['check_swing_dribbler'],
    matchPitchType: ['fork', 'curve', 'changeup'],
    text: '${pitchLabel}に引っかかった！当たり損ねで投手前へ！',
    weight: 80,
  },
  {
    id: 'weak_contact_generic',
    matchHitType: ['check_swing_dribbler'],
    text: '当たり損ね！投手前へのゆっくりした打球！',
    weight: 70,
  },
  {
    id: 'infield_liner_hard',
    matchHitType: ['infield_liner'],
    text: '内野ライナー！鋭い打球！',
    weight: 75,
  },
];

// ============================================================
// R7-4: 実況テンプレート選択（重複回避付き）
// ============================================================

/**
 * hitType × pitchType × count に最も適したテンプレートを選択する
 *
 * 優先順位:
 * 1. hitType + pitchType + count が全一致
 * 2. hitType + count が一致
 * 3. hitType + pitchType が一致
 * 4. hitType のみ一致
 * 5. fallback（引数の hitType に関係なく汎用 fallback を使用）
 *
 * @param hitType         - 21種打球分類
 * @param pitchType       - 投球種（省略可）
 * @param balls           - ボールカウント（省略可）
 * @param strikes         - ストライクカウント（省略可）
 * @param recentIds       - 直近使用済みテンプレートID（重複回避用）
 * @returns 選択されたテンプレートテキスト（${pitchLabel} を置換済み）
 */
function selectCommentaryTemplate(
  hitType: DetailedHitType,
  pitchType?: string,
  balls?: number,
  strikes?: number,
  recentIds?: ReadonlySet<string>,
): string {
  const pLabel = pitchTypeLabel(pitchType);

  // 条件マッチ判定
  const matchesHitType = (t: CommentaryTemplate) =>
    t.matchHitType === undefined || t.matchHitType.includes(hitType);
  const matchesPitch = (t: CommentaryTemplate) =>
    t.matchPitchType === undefined ||
    (pitchType !== undefined && t.matchPitchType.includes(pitchType));
  const matchesStrikes = (t: CommentaryTemplate) =>
    t.matchStrikes === undefined || t.matchStrikes === strikes;
  const matchesBalls = (t: CommentaryTemplate) =>
    t.matchBalls === undefined || t.matchBalls === balls;

  // レベル順に候補を絞り込む
  const candidateSets: CommentaryTemplate[][] = [
    // 最高一致: hitType + pitchType + count 全一致
    COMMENTARY_TEMPLATE_DB.filter(
      (t) => matchesHitType(t) && matchesPitch(t) && matchesStrikes(t) && matchesBalls(t) &&
             t.matchHitType !== undefined && t.matchPitchType !== undefined &&
             (t.matchStrikes !== undefined || t.matchBalls !== undefined),
    ),
    // hitType + count 一致
    COMMENTARY_TEMPLATE_DB.filter(
      (t) => matchesHitType(t) && matchesStrikes(t) && matchesBalls(t) &&
             t.matchHitType !== undefined &&
             (t.matchStrikes !== undefined || t.matchBalls !== undefined),
    ),
    // hitType + pitchType 一致
    COMMENTARY_TEMPLATE_DB.filter(
      (t) => matchesHitType(t) && matchesPitch(t) &&
             t.matchHitType !== undefined && t.matchPitchType !== undefined,
    ),
    // hitType のみ一致
    COMMENTARY_TEMPLATE_DB.filter(
      (t) => matchesHitType(t) && t.matchHitType !== undefined &&
             t.matchPitchType === undefined && t.matchStrikes === undefined && t.matchBalls === undefined,
    ),
  ];

  for (const candidates of candidateSets) {
    if (candidates.length === 0) continue;

    // 重複回避: recentIds に含まれるものを除外（全候補が除外される場合は除外無視）
    const nonRecent = recentIds && recentIds.size > 0
      ? candidates.filter((t) => !recentIds.has(t.id))
      : candidates;
    const pool = nonRecent.length > 0 ? nonRecent : candidates;

    // 重み付きで選択（決定論的: 最高重みのものを返す）
    const best = pool.reduce((a, b) => b.weight > a.weight ? b : a);
    const text = best.text.replace(/\$\{pitchLabel\}/g, pLabel);
    return text;
  }

  // フォールバック: hitType ラベルのみ
  return `${DETAILED_HIT_TYPE_LABEL[hitType]}！`;
}

// ============================================================
// メイン API
// ============================================================

/**
 * 21種打球分類から NarrativeHook を生成する
 *
 * @param detailedHitType - 21種打球分類
 * @param trajectory      - 4軸打球パラメータ（演出強度算出用）
 * @param flight          - 打球軌道（飛距離・滞空時間）
 * @param commentaryCtx   - R7-4: 実況コンテキスト（投球種・カウント・重複回避）
 * @returns NarrativeHook
 */
export function generateNarrativeHook(
  detailedHitType: DetailedHitType,
  trajectory: BallTrajectoryParams,
  flight: BallFlight,
  commentaryCtx?: CommentaryContext,
): NarrativeHook {
  const kind = mapHitTypeToKind(detailedHitType, trajectory, flight);
  const dramaLevel = computeDramaLevel(detailedHitType, trajectory, flight);
  const homeRunFlag = computeHomeRunFlag(detailedHitType, trajectory);

  // R7-4: 投球種 × カウント対応の実況テキスト
  const commentaryText = commentaryCtx
    ? selectCommentaryTemplate(
        detailedHitType,
        commentaryCtx.pitchType,
        commentaryCtx.balls,
        commentaryCtx.strikes,
        commentaryCtx.recentCommentaryIds,
      )
    : buildCommentaryText(detailedHitType, trajectory, flight);

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
