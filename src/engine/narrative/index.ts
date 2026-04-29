/**
 * src/engine/narrative/index.ts — NarrativeHook モジュール公開 API
 *
 * Phase R6: 21種打球分類からドラマ性演出フックを生成するモジュール。
 *
 * 主要エクスポート:
 * - NarrativeHook 型: R7 が参照する演出フック型（変更禁止）
 * - generateNarrativeHook(): PlayResolution から NarrativeHook を生成
 * - applyNarrativeHookToPsyche(): 心理システムへの接続
 * - DETAILED_HIT_TYPE_LABEL: 実況ログ用ラベルマップ
 */

// 型エクスポート（R7 参照用）
export type {
  NarrativeHook,
  NarrativeHookKind,
  NarrativeDramaLevel,
  HomeRunDisplayFlag,
  // R7-2: 思考コメント型
  ThoughtComment,
  ThoughtCommentContext,
  NarrativeHookSubscribeInput,
} from './types';

// 定数エクスポート
export {
  DETAILED_HIT_TYPE_LABEL,
  DETAILED_HIT_TYPE_SHORT,
  DETAILED_HIT_TYPE_CATEGORY,
} from './types';

// 生成器エクスポート
export {
  generateNarrativeHook,
  isPotentialBlooper,
  isWallBallDramatic,
  buildDetailedHitLogText,
} from './hook-generator';

// 心理システム接続
export {
  applyNarrativeHookToPsyche,
  computeHookMentalEffect,
  HOOK_MENTAL_EFFECT_MAP,
} from './psyche-bridge';

// R7-3: 思考コメント生成
export {
  generateThoughtComments,
  extractThoughtCommentIds,
  updateThoughtCommentRing,
} from './thought-comment-generator';

// 21種統計集計（R6-1）
export type {
  DetailedHitCounts,
  BatterHitTypeStats,
  MatchHitTypeStats,
  AtBatResultWithHitType,
} from './hit-type-stats';
export {
  emptyDetailedHitCounts,
  collectHitTypeStats,
  formatHitTypeStats,
  getAppearedHitTypes,
  areAll21TypesPresent,
  areMajor8TypesPresent,
} from './hit-type-stats';
