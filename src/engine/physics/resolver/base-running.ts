/**
 * engine/physics/resolver/base-running.ts — 走塁判定
 *
 * Phase R3 §6.3 (baserunning-resolver) 相当。
 * 各走者の進塁判断・ETA・safe/out 結果を決定する。
 * §5.4 の decisionMargin を実装する。
 *
 * 依存: engine/physics/types.ts, field-geometry.ts, movement.ts, resolver/fielding.ts
 * 循環参照: なし
 */

import type {
  BaseId,
  BaseState,
  FieldingResult,
  ThrowResult,
  BaserunningResult,
  RunnerDecision,
} from '../types';
import type { RunnerStats } from './types';
import {
  distanceFt,
  getBasePos,
} from '../field-geometry';
import {
  makeRunnerProfile,
  timeToTraverseFt,
  batterRunCumulativeTimes,
} from '../movement';
import type { RNG } from '../../core/rng';

// ============================================================
// 定数
// ============================================================

/** decisionMargin の基本値 (ms) — プラスで慎重 */
export const BASE_DECISION_MARGIN_MS = 200;

/** アグレッシブ走塁の decisionMargin 減少量 */
export const AGGRESSIVE_MARGIN_REDUCTION_MS = 300;

/** タッチアップのリードオフ遅延 (ms) — フライの場合、捕球後に離塁 */
export const TOUCHUP_DELAY_MS = 100;

/** リードオフ距離 (ft) */
export const DEFAULT_LEAD_OFF_FT = 15;

/** フォースアウトの閾値 (ms) — 送球と走者の到達時刻の差 */
export const FORCE_OUT_THRESHOLD_MS = 50;

// ============================================================
// メイン: baserunning-resolver
// ============================================================

/**
 * 全走者の進塁判断を解決する
 *
 * @param bases         - 現在の塁状態
 * @param runners       - 走者能力一覧
 * @param batterId      - 打者 ID
 * @param batterSpeedStat - 打者走力
 * @param fieldingResult - 守備処理結果
 * @param throwResult   - 送球処理結果
 * @param isFlyBall     - フライか（タッチアップ判定用）
 * @param isHomeRun     - ホームランか
 * @param outs          - 現在のアウト数
 * @param rng           - 乱数生成器
 * @returns BaserunningResult
 */
export function resolveBaseRunning(
  bases: BaseState,
  runners: ReadonlyArray<RunnerStats>,
  batterId: string,
  batterSpeedStat: number,
  fieldingResult: FieldingResult,
  throwResult: ThrowResult,
  isFlyBall: boolean,
  isHomeRun: boolean,
  outs: number,
  rng: RNG,
): BaserunningResult {
  const decisions: RunnerDecision[] = [];

  // ホームランの場合: 全走者が本塁生還
  if (isHomeRun) {
    return resolveHomeRun(bases, runners, batterId, batterSpeedStat);
  }

  // フライの捕球成功 → タッチアップ判定
  if (isFlyBall && fieldingResult.catchAttempt.success) {
    return resolveTouchup(bases, runners, fieldingResult, throwResult, rng);
  }

  // ゴロ/ライナー/エラー: 通常の進塁判断
  const forceAdvanceBases = computeForceAdvanceBases(bases);

  // 打者走者を追加
  const batterDecision = resolveBatterRunner(
    batterId,
    batterSpeedStat,
    fieldingResult,
    throwResult,
    forceAdvanceBases,
    rng,
  );
  decisions.push(batterDecision);

  // 塁上走者の進塁判断
  for (const runner of runners) {
    const decision = resolveRunner(
      runner,
      bases,
      fieldingResult,
      throwResult,
      forceAdvanceBases,
      isFlyBall,
      outs,
      rng,
    );
    decisions.push(decision);
  }

  return { decisions };
}

// ============================================================
// ホームラン処理
// ============================================================

function resolveHomeRun(
  bases: BaseState,
  runners: ReadonlyArray<RunnerStats>,
  batterId: string,
  batterSpeedStat: number,
): BaserunningResult {
  const decisions: RunnerDecision[] = [];
  const baseTimes = batterRunCumulativeTimes(batterSpeedStat);

  // 全走者生還
  for (const runner of runners) {
    const runnerTimes = batterRunCumulativeTimes(runner.speedStat);
    decisions.push({
      runnerId: runner.runnerId,
      fromBase: runner.fromBase,
      targetBase: 'home',
      decisionMargin: 999,
      willAdvance: true,
      arrivalTimeMs: runnerTimes.toHome,
      outcome: 'safe',
    });
  }

  // 打者走者
  decisions.push({
    runnerId: batterId,
    fromBase: 'home',
    targetBase: 'home',
    decisionMargin: 999,
    willAdvance: true,
    arrivalTimeMs: baseTimes.toHome,
    outcome: 'safe',
  });

  return { decisions };
}

// ============================================================
// タッチアップ処理
// ============================================================

function resolveTouchup(
  bases: BaseState,
  runners: ReadonlyArray<RunnerStats>,
  fieldingResult: FieldingResult,
  throwResult: ThrowResult,
  rng: RNG,
): BaserunningResult {
  const decisions: RunnerDecision[] = [];
  const catchTimeMs = fieldingResult.primaryFielder.arrivalTimeMs;

  for (const runner of runners) {
    const fromPos = getBasePos(runner.fromBase);
    const targetBase = getNextBase(runner.fromBase);
    if (!targetBase) continue;

    const toPos = getBasePos(targetBase);
    const dist = distanceFt(fromPos, toPos);
    const profile = makeRunnerProfile(runner.speedStat);
    // タッチアップ: 捕球後に離塁
    const startTime = catchTimeMs + TOUCHUP_DELAY_MS;
    const runnerEta = startTime + timeToTraverseFt(dist, profile);

    // 送球との比較
    const throwArrival = throwResult.willThrow && throwResult.toBase === targetBase
      ? throwResult.arrivalTimeMs
      : Infinity;

    const decisionMargin = computeDecisionMargin(
      runner,
      dist,
      catchTimeMs,
      throwArrival,
      rng,
    );

    // 積極走塁 (decisionMargin 考慮)
    const willAdvance = shouldAdvance(decisionMargin, runner.aggressiveness);
    const outcome: RunnerDecision['outcome'] = !willAdvance
      ? 'still_running'
      : runnerEta <= throwArrival
        ? 'safe'
        : 'out';

    decisions.push({
      runnerId: runner.runnerId,
      fromBase: runner.fromBase,
      targetBase,
      decisionMargin,
      willAdvance,
      arrivalTimeMs: willAdvance ? runnerEta : catchTimeMs,
      outcome,
    });
  }

  return { decisions };
}

// ============================================================
// 打者走者
// ============================================================

function resolveBatterRunner(
  batterId: string,
  batterSpeedStat: number,
  fieldingResult: FieldingResult,
  throwResult: ThrowResult,
  _forceAdvanceBases: Set<BaseId>,
  rng: RNG,
): RunnerDecision {
  const baseTimes = batterRunCumulativeTimes(batterSpeedStat);

  // 守備処理後に打者走者が一塁を目指す
  // エラーがあれば更に先を目指す可能性
  const targetBase: BaseId = fieldingResult.catchAttempt.error ? 'second' : 'first';
  const runnerEta = targetBase === 'second' ? baseTimes.toSecond : baseTimes.toFirst;

  // 送球が一塁/二塁に向かっているか
  const throwTarget = throwResult.willThrow ? throwResult.toBase : null;
  const throwArrival = (throwTarget === 'first' || throwTarget === 'second')
    ? throwResult.arrivalTimeMs
    : Infinity;

  const noiseMs = rng.gaussian(0, 20);
  const margin = throwArrival - (runnerEta + noiseMs);

  const outcome: RunnerDecision['outcome'] = runnerEta <= throwArrival
    ? 'safe'
    : 'out';

  return {
    runnerId: batterId,
    fromBase: 'home',
    targetBase,
    decisionMargin: margin,
    willAdvance: true, // 打者走者は常に走る
    arrivalTimeMs: runnerEta,
    outcome,
  };
}

// ============================================================
// 塁上走者
// ============================================================

function resolveRunner(
  runner: RunnerStats,
  _bases: BaseState,
  fieldingResult: FieldingResult,
  throwResult: ThrowResult,
  forceAdvanceBases: Set<BaseId>,
  isFlyBall: boolean,
  outs: number,
  rng: RNG,
): RunnerDecision {
  const fromPos = getBasePos(runner.fromBase);
  const targetBase = getNextBase(runner.fromBase);

  if (!targetBase) {
    // すでにホームにいる（あり得ない状況）
    return {
      runnerId: runner.runnerId,
      fromBase: runner.fromBase,
      targetBase: 'home',
      decisionMargin: 0,
      willAdvance: false,
      arrivalTimeMs: Infinity,
      outcome: 'still_running',
    };
  }

  const toPos = getBasePos(targetBase);
  const dist = distanceFt(fromPos, toPos);
  const profile = makeRunnerProfile(runner.speedStat);

  // フライの場合はタッチアップで処理済みのはずだが、
  // ゴロ/ライナーの場合は打球発生後即座に走り出す
  const startTimeMs = isFlyBall ? fieldingResult.primaryFielder.arrivalTimeMs : 0;
  const runnerEta = startTimeMs + timeToTraverseFt(dist, profile);

  // フォースアウト対象かチェック
  const isForce = forceAdvanceBases.has(runner.fromBase);

  // 送球到達時刻
  const throwArrival = throwResult.willThrow && throwResult.toBase === targetBase
    ? throwResult.arrivalTimeMs
    : Infinity;

  const decisionMargin = computeDecisionMargin(
    runner,
    dist,
    fieldingResult.primaryFielder.arrivalTimeMs,
    throwArrival,
    rng,
  );

  // 進塁決定
  const willAdvance = isForce || shouldAdvance(decisionMargin, runner.aggressiveness);

  const outcome: RunnerDecision['outcome'] = !willAdvance
    ? 'still_running'
    : runnerEta <= throwArrival
      ? 'safe'
      : 'out';

  return {
    runnerId: runner.runnerId,
    fromBase: runner.fromBase,
    targetBase,
    decisionMargin,
    willAdvance,
    arrivalTimeMs: willAdvance ? runnerEta : startTimeMs,
    outcome,
  };
}

// ============================================================
// decisionMargin 計算 (V3 §5.4)
// ============================================================

/**
 * §5.4 の decisionMargin を計算する (ms)
 * 正の値 → 慎重（送球が遅い場合 safe 寄り）
 * 負の値 → 積極的
 *
 * decisionMargin = (走者到達時刻 - 送球到達時刻) + 積極性補正
 */
export function computeDecisionMargin(
  runner: RunnerStats,
  distanceFt: number,
  catchTimeMs: number,
  throwArrivalMs: number,
  rng: RNG,
): number {
  const profile = makeRunnerProfile(runner.speedStat);
  const runnerEta = catchTimeMs + timeToTraverseFt(distanceFt, profile);

  // 走者到達 vs 送球到達の差
  const rawMargin = throwArrivalMs - runnerEta;

  // 積極性補正: aggressiveness が高いほど margin が大きく（突っ込みやすい）
  const aggressivenessBonus = (runner.aggressiveness - 0.5) * AGGRESSIVE_MARGIN_REDUCTION_MS;

  // ランダム揺らぎ（走者の判断ブレ）
  const noise = rng.gaussian(0, 50);

  return rawMargin + aggressivenessBonus + noise;
}

/**
 * decisionMargin から進塁するか判断する
 */
export function shouldAdvance(decisionMargin: number, aggressiveness: number): boolean {
  // decisionMargin が大きい（走者の方が早い）→ 進塁
  // 積極的な走者は margin がギリギリでも突っ込む
  const threshold = BASE_DECISION_MARGIN_MS * (1 - aggressiveness * 0.5);
  return decisionMargin > -threshold;
}

// ============================================================
// フォースアドバンス計算
// ============================================================

/**
 * 現在の塁状態から、強制進塁が必要な走者の現在塁を返す
 * （打者走者が一塁に来るため、後続塁の走者も強制進塁）
 */
export function computeForceAdvanceBases(bases: BaseState): Set<BaseId> {
  const forced = new Set<BaseId>();

  // 一塁に走者がいる → 一塁走者は二塁に強制進塁
  if (bases.first) {
    forced.add('first');
    // さらに二塁にも走者がいる → 二塁走者は三塁に強制進塁
    if (bases.second) {
      forced.add('second');
      // 三塁にも走者がいる → 三塁走者は本塁に強制進塁
      if (bases.third) {
        forced.add('third');
      }
    }
  }

  return forced;
}

// ============================================================
// 補助関数
// ============================================================

/**
 * 現在の塁から次の塁を返す
 */
export function getNextBase(base: BaseId): BaseId | null {
  switch (base) {
    case 'home': return 'first';
    case 'first': return 'second';
    case 'second': return 'third';
    case 'third': return 'home';
  }
}

/**
 * ベース状態から走者のリストを生成する
 */
export function extractRunners(bases: BaseState): RunnerStats[] {
  const runners: RunnerStats[] = [];

  if (bases.third) {
    runners.push({
      runnerId: bases.third.playerId,
      fromBase: 'third',
      speedStat: bases.third.speed,
      aggressiveness: 0.5,
    });
  }
  if (bases.second) {
    runners.push({
      runnerId: bases.second.playerId,
      fromBase: 'second',
      speedStat: bases.second.speed,
      aggressiveness: 0.5,
    });
  }
  if (bases.first) {
    runners.push({
      runnerId: bases.first.playerId,
      fromBase: 'first',
      speedStat: bases.first.speed,
      aggressiveness: 0.5,
    });
  }

  return runners;
}

/**
 * 進塁後の塁状態を計算する
 */
export function computeBaseStateAfter(
  bases: BaseState,
  decisions: ReadonlyArray<RunnerDecision>,
  batterId: string,
): BaseState {
  const newBases: { first: BaseState['first']; second: BaseState['second']; third: BaseState['third'] } = {
    first: null,
    second: null,
    third: null,
  };

  // セーフになった走者を新しい塁に配置
  for (const decision of decisions) {
    if (decision.outcome !== 'safe') continue;
    if (decision.targetBase === 'home') continue; // 得点

    const runnerInfo = decision.runnerId === batterId
      ? null // 打者走者はBASE stateに元の情報なし
      : getRunnerInfoFromBases(bases, decision.runnerId);

    const info = runnerInfo ?? { playerId: decision.runnerId, speed: 60 };

    switch (decision.targetBase) {
      case 'first': newBases.first = info; break;
      case 'second': newBases.second = info; break;
      case 'third': newBases.third = info; break;
    }
  }

  // 進塁しなかった走者を元の塁に残す
  for (const decision of decisions) {
    if (decision.outcome !== 'still_running') continue;
    const runnerInfo = getRunnerInfoFromBases(bases, decision.runnerId);
    if (!runnerInfo) continue;
    switch (decision.fromBase) {
      case 'first': if (!newBases.first) newBases.first = runnerInfo; break;
      case 'second': if (!newBases.second) newBases.second = runnerInfo; break;
      case 'third': if (!newBases.third) newBases.third = runnerInfo; break;
    }
  }

  return newBases;
}

function getRunnerInfoFromBases(
  bases: BaseState,
  runnerId: string,
): { playerId: string; speed: number } | null {
  if (bases.first?.playerId === runnerId) return bases.first;
  if (bases.second?.playerId === runnerId) return bases.second;
  if (bases.third?.playerId === runnerId) return bases.third;
  return null;
}
