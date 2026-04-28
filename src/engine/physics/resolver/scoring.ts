/**
 * engine/physics/resolver/scoring.ts — 記録（得点・アウトカウント・打席結果・公式記録）
 *
 * Phase R3 §6 (result-deriver / record) 相当。
 * BaserunningResult + FieldingResult から公式記録を生成する。
 *
 * 依存: engine/physics/types.ts, engine/match/types.ts
 * 循環参照: なし
 */

import type {
  BaserunningResult,
  FieldingResult,
  DetailedHitType,
  BaseState,
} from '../types';
import type {
  FieldResult,
  AtBatOutcome,
} from '../../match/types';
import type { Position } from '../../types/player';

// ============================================================
// 定数
// ============================================================

/** ホームランフラグとなる DetailedHitType */
export const HOME_RUN_TYPES: ReadonlySet<DetailedHitType> = new Set<DetailedHitType>([
  'line_drive_hr',
  'high_arc_hr',
]);

/** ヒット（単打）となる DetailedHitType */
export const SINGLE_HIT_TYPES: ReadonlySet<DetailedHitType> = new Set<DetailedHitType>([
  'right_gap_hit',
  'up_the_middle_hit',
  'left_gap_hit',
  'over_infield_hit',
  'line_drive_hit',
  'comebacker',        // 投手前ヒットになる場合
]);

/** 二塁打になり得る DetailedHitType */
export const DOUBLE_HIT_TYPES: ReadonlySet<DetailedHitType> = new Set<DetailedHitType>([
  'wall_ball',
  'deep_fly',          // エラー絡みなど（主にシングルだが文脈次第）
]);

// ============================================================
// 記録計算
// ============================================================

/**
 * 打席結果のサマリーを計算する
 */
export interface ScoringResult {
  /** 得点数 */
  readonly runsScored: number;
  /** このプレーでのアウト数 */
  readonly outsRecorded: number;
  /** 打者走者の結果 */
  readonly batterOutcome: AtBatOutcome;
  /** 後方互換: FieldResult */
  readonly fieldResult: FieldResult;
  /** 打点数 */
  readonly rbiCount: number;
  /** プレー後の塁状態 */
  readonly baseStateAfter: BaseState;
}

/**
 * Baserunning 結果から得点・アウト・打席結果を計算する
 *
 * @param baserunning  - 走塁結果
 * @param fielding     - 守備結果
 * @param detailedHit  - 21 種打球分類
 * @param baseBefore   - プレー前の塁状態
 * @param batterId     - 打者 ID
 * @param batterSpeedStat - 打者走力（内野安打判定用）
 * @returns ScoringResult
 */
export function computeScoring(
  baserunning: BaserunningResult,
  fielding: FieldingResult,
  detailedHit: DetailedHitType,
  baseBefore: BaseState,
  batterId: string,
  _batterSpeedStat: number,
): ScoringResult {
  // 得点計算
  const runsScored = countRuns(baserunning, batterId);

  // アウト計算
  const outsRecorded = countOuts(baserunning, fielding, detailedHit);

  // 打者走者の結果
  const batterDecision = baserunning.decisions.find(d => d.runnerId === batterId);
  const batterOutcome = deriveBatterOutcome(
    detailedHit,
    batterDecision?.outcome ?? 'still_running',
    batterDecision?.targetBase,
    fielding,
  );

  // FieldResult（後方互換）
  const fieldResult = deriveFieldResult(
    detailedHit,
    fielding,
    batterOutcome,
  );

  // 打点計算
  const rbiCount = computeRBI(baserunning, batterId, batterOutcome);

  // 打席後の塁状態
  const baseStateAfter = computeBaseStateAfterScoring(
    baseBefore,
    baserunning,
    batterId,
  );

  return {
    runsScored,
    outsRecorded,
    batterOutcome,
    fieldResult,
    rbiCount,
    baseStateAfter,
  };
}

// ============================================================
// 得点計算
// ============================================================

/**
 * 本塁生還者数を数える
 */
export function countRuns(
  baserunning: BaserunningResult,
  _batterId: string,
): number {
  return baserunning.decisions.filter(
    d => d.targetBase === 'home' && d.outcome === 'safe',
  ).length;
}

// ============================================================
// アウト計算
// ============================================================

/**
 * このプレーで記録されるアウト数を計算する
 */
export function countOuts(
  baserunning: BaserunningResult,
  fielding: FieldingResult,
  detailedHit: DetailedHitType,
): number {
  // フライ捕球でのアウト（HR は捕球されないのでカウントしない）
  const isActualHR = HOME_RUN_TYPES.has(detailedHit) || detailedHit === 'fence_close_call';
  const flyOut = fielding.catchAttempt.success && isFlyType(detailedHit) && !isActualHR ? 1 : 0;

  // 走塁アウト
  const rundownOuts = baserunning.decisions.filter(d => d.outcome === 'out').length;

  return flyOut + rundownOuts;
}

/**
 * フライ性の打球か判定
 */
export function isFlyType(detailedHit: DetailedHitType): boolean {
  return [
    'shallow_fly', 'medium_fly', 'deep_fly',
    'high_infield_fly', 'foul_fly',
    'high_arc_hr', 'line_drive_hr',
  ].includes(detailedHit);
}

// ============================================================
// 打者打席結果の導出
// ============================================================

/**
 * DetailedHitType と走塁結果から AtBatOutcome を導出する
 */
export function deriveBatterOutcome(
  detailedHit: DetailedHitType,
  batterRunnerOutcome: RunnerDecisionOutcome,
  targetBase: import('../types').BaseId | undefined,
  fielding: FieldingResult,
): AtBatOutcome {
  // ホームラン
  if (HOME_RUN_TYPES.has(detailedHit)) {
    return { type: 'home_run' };
  }

  // ライン際（fence_close_call）: ホームランか二塁打（判定が曖昧）
  if (detailedHit === 'fence_close_call') {
    return { type: 'home_run' };
  }

  // フライアウト（捕球成功）
  if (fielding.catchAttempt.success && isFlyType(detailedHit)) {
    const pos = fielding.primaryFielder.position;
    if (detailedHit === 'foul_fly') return { type: 'fly_out', fielder: pos };
    return { type: 'fly_out', fielder: pos };
  }

  // ファウルフライ（アウトにならない場合はこの分岐に来ない）
  if (detailedHit === 'foul_fly') {
    // ファウルフライ落球（エラー）→ アウトにならない
    return { type: 'error', fielder: fielding.primaryFielder.position };
  }

  // エラー
  if (fielding.catchAttempt.error) {
    return { type: 'error', fielder: fielding.primaryFielder.position };
  }

  // 打者走者アウト（内野ゴロなど）
  if (batterRunnerOutcome === 'out') {
    if (isGrounderType(detailedHit)) {
      return { type: 'ground_out', fielder: fielding.primaryFielder.position };
    }
    if (isLinerType(detailedHit)) {
      return { type: 'line_out', fielder: fielding.primaryFielder.position };
    }
    return { type: 'ground_out', fielder: fielding.primaryFielder.position };
  }

  // ヒット系: 到達塁で分類
  const hitTarget = targetBase ?? 'first';
  switch (hitTarget) {
    case 'home': return { type: 'home_run' };
    case 'third': return { type: 'triple' };
    case 'second': return { type: 'double' };
    default: return { type: 'single' };
  }
}

type RunnerDecisionOutcome = 'safe' | 'out' | 'still_running';

function isGrounderType(t: DetailedHitType): boolean {
  return ['first_line_grounder', 'right_side_grounder', 'left_side_grounder',
    'third_line_grounder', 'comebacker', 'check_swing_dribbler'].includes(t);
}

function isLinerType(t: DetailedHitType): boolean {
  return ['infield_liner', 'line_drive_hit', 'over_infield_hit'].includes(t);
}

// ============================================================
// FieldResult 生成（後方互換）
// ============================================================

/**
 * AtBatOutcome から FieldResult を生成する
 */
export function deriveFieldResult(
  detailedHit: DetailedHitType,
  fielding: FieldingResult,
  batterOutcome: AtBatOutcome,
): FieldResult {
  const fielder = fielding.primaryFielder.position;
  const isError = fielding.catchAttempt.error;

  switch (batterOutcome.type) {
    case 'home_run':
      return { type: 'home_run', fielder, isError: false };
    case 'triple':
      return { type: 'triple', fielder, isError };
    case 'double':
      return { type: 'double', fielder, isError };
    case 'single':
      return { type: 'single', fielder, isError };
    case 'error':
      return { type: 'error', fielder, isError: true };
    case 'fly_out':
      // 犠牲フライ判定は文脈依存（ここでは単純 out）
      return { type: 'out', fielder, isError: false };
    case 'ground_out':
      return { type: 'out', fielder, isError: false };
    case 'line_out':
      return { type: 'out', fielder, isError: false };
    case 'double_play':
      return { type: 'double_play', fielder, isError: false };
    case 'sacrifice_fly':
      return { type: 'sacrifice_fly', fielder, isError: false };
    case 'sacrifice_bunt':
      return { type: 'sacrifice', fielder, isError: false };
    default:
      return { type: 'out', fielder, isError: false };
  }
}

// ============================================================
// 打点計算
// ============================================================

/**
 * 打点を計算する
 * 得点した走者のうち、エラーでない場合の得点が打点
 */
export function computeRBI(
  baserunning: BaserunningResult,
  batterId: string,
  batterOutcome: AtBatOutcome,
): number {
  // エラー、フィルダースチョイスの場合は打点なし
  if (batterOutcome.type === 'error') return 0;

  // 本塁生還した走者数（打者走者も含む）
  const scorers = baserunning.decisions.filter(
    d => d.targetBase === 'home' && d.outcome === 'safe',
  );

  // ホームランは打者走者自身を含む
  if (batterOutcome.type === 'home_run') {
    return scorers.length; // 打者含む生還数
  }

  // 打者以外の生還
  return scorers.filter(d => d.runnerId !== batterId).length;
}

// ============================================================
// 塁状態更新
// ============================================================

/**
 * 得点・アウトを反映した後の塁状態を計算する
 */
export function computeBaseStateAfterScoring(
  baseBefore: BaseState,
  baserunning: BaserunningResult,
  batterId: string,
): BaseState {
  // 進塁した走者と元の塁の走者を整理
  const occupied: Map<import('../types').BaseId, { playerId: string; speed: number }> = new Map();

  // まず、セーフになった走者を新しい塁に配置
  for (const decision of baserunning.decisions) {
    if (decision.outcome !== 'safe') continue;
    if (decision.targetBase === 'home') continue;

    const speedStat = getRunnerSpeed(baseBefore, decision.runnerId, batterId);
    occupied.set(decision.targetBase, { playerId: decision.runnerId, speed: speedStat });
  }

  // 進塁しなかった走者を元の塁に残す
  for (const decision of baserunning.decisions) {
    if (decision.outcome !== 'still_running') continue;
    if (decision.fromBase === 'home') continue;
    if (!occupied.has(decision.fromBase)) {
      const speedStat = getRunnerSpeed(baseBefore, decision.runnerId, batterId);
      occupied.set(decision.fromBase, { playerId: decision.runnerId, speed: speedStat });
    }
  }

  return {
    first: occupied.get('first') ?? null,
    second: occupied.get('second') ?? null,
    third: occupied.get('third') ?? null,
  };
}

function getRunnerSpeed(
  bases: BaseState,
  runnerId: string,
  _batterId: string,
): number {
  if (bases.first?.playerId === runnerId) return bases.first.speed;
  if (bases.second?.playerId === runnerId) return bases.second.speed;
  if (bases.third?.playerId === runnerId) return bases.third.speed;
  return 60; // デフォルト走力
}

// ============================================================
// ダブルプレー判定
// ============================================================

/**
 * ダブルプレーが成立するか判定する
 */
export function isDoublePLay(
  baserunning: BaserunningResult,
  fielding: FieldingResult,
): boolean {
  const outs = baserunning.decisions.filter(d => d.outcome === 'out').length;
  const flyOut = fielding.catchAttempt.success ? 1 : 0;
  return outs + flyOut >= 2;
}
