/**
 * engine/physics/resolver/index.ts — Play Resolver 統合 API
 *
 * Phase R3 メイン公開 API。
 * 6 サブモジュールをパイプライン実行して PlayResolution を返す。
 *
 * パイプライン:
 *   BatBall 出力 → bat-swing → contact → trajectory補正
 *   → batted-ball-classifier → fielding → base-running → scoring
 *   → timeline-build → validate → PlayResolution
 *
 * 依存: すべての resolver サブモジュール + engine/physics/types.ts
 * 循環参照: なし
 */

import type {
  BallTrajectoryParams,
  BallFlight,
  SwingLatentState,
  CanonicalTimeline,
  TimelineEvent,
  PlayResolution,
  BaseState,
  FieldingResult,
  ThrowResult,
  BaserunningResult,
} from '../types';
import { TimelineValidationError } from '../types';
import { simulateTrajectory } from '../trajectory';
import { createRNG } from '../../core/rng';

// サブモジュール
import { generateBatSwing } from './bat-swing';
import { resolveContact, adjustTrajectoryForContact, getFoulReason } from './contact';
import { classifyDetailedHit } from './batted-ball-classifier';
import {
  resolveFielding,
  resolveThrow,
  type FielderAbility,
} from './fielding';
import {
  resolveBaseRunning,
  extractRunners,
} from './base-running';
import { computeScoring } from './scoring';
import type { ResolvePlayInput } from './types';

// ============================================================
// 統合 API
// ============================================================

/**
 * 1 打球のプレー全体を解決して PlayResolution を返す
 *
 * @param trajectory     - bat-ball モジュールが出力した 4 軸打球パラメータ
 * @param latent         - bat-ball モジュールが出力した中間潜在量
 * @param basesBefore    - プレー前の塁状態
 * @param input          - プレー入力（走者・打者情報など）
 * @param fielderAbilities - 野手能力マップ（省略時はデフォルト値）
 * @returns PlayResolution（PlayResult含む）
 */
export function resolvePlay(
  trajectory: BallTrajectoryParams,
  latent: SwingLatentState,
  basesBefore: BaseState,
  input: ResolvePlayInput,
  fielderAbilities: ReadonlyMap<string, FielderAbility> = new Map(),
): PlayResolution {
  const rng = createRNG(input.rngSeed);
  const events: TimelineEvent[] = [];

  // ─── Step 1: バットスイング ───────────────────────────────
  const swing = generateBatSwing(latent, 60, rng.derive('swing'));

  // swing_start イベント
  events.push({
    t: swing.startTimeMs,
    kind: 'swing_start',
    batterId: input.batterId,
    timingError: swing.timingErrorMs,
  });

  // ─── Step 2: コンタクト判定 ──────────────────────────────
  const contact = resolveContact(latent, swing, rng.derive('contact'));

  // ball_contact or foul イベント
  if (contact.didContact && !contact.isFoul) {
    events.push({
      t: contact.contactTimeMs,
      kind: 'ball_contact',
      trajectory,
    });
  } else if (contact.isFoul) {
    events.push({
      t: contact.contactTimeMs,
      kind: 'foul',
      reason: getFoulReason(contact, latent),
    });
  }

  // コンタクト品質で打球パラメータを調整
  const adjustedTrajectory = adjustTrajectoryForContact(trajectory, contact);

  // ─── Step 3: 打球軌道計算 ────────────────────────────────
  const flight: BallFlight = simulateTrajectory(adjustedTrajectory);

  // ファウル or ミスの場合は簡易結果を返す
  if (!contact.didContact || contact.isFoul || flight.isFoul) {
    return buildFoulOrMissResolution(
      adjustedTrajectory,
      flight,
      contact,
      latent,
      basesBefore,
      input,
      events,
    );
  }

  // ball_landing イベント
  events.push({
    t: flight.hangTimeMs,
    kind: 'ball_landing',
    pos: flight.landingPoint,
  });

  // ─── Step 4: 打球分類 ─────────────────────────────────────
  const detailedHit = classifyDetailedHit(adjustedTrajectory, flight, contact, basesBefore);

  // ─── Step 5: 守備処理 ─────────────────────────────────────
  // Position→FielderAbility のマップを作成
  const posAbilities = buildPositionAbilityMap(fielderAbilities);

  const fieldingResult: FieldingResult = resolveFielding(
    adjustedTrajectory,
    flight,
    posAbilities,
    rng.derive('fielding'),
  );

  // fielder_react, fielder_field_ball イベント
  events.push({
    t: fieldingResult.primaryFielder.arrivalTimeMs * 0.3,
    kind: 'fielder_react',
    fielderId: fieldingResult.primaryFielder.id,
  });
  events.push({
    t: fieldingResult.primaryFielder.arrivalTimeMs,
    kind: 'fielder_field_ball',
    fielderId: fieldingResult.primaryFielder.id,
    pos: fieldingResult.primaryFielder.arrivalPos,
    cleanCatch: fieldingResult.catchAttempt.success,
  });

  // バウンドイベント
  if (fieldingResult.bouncePoints) {
    for (const bp of fieldingResult.bouncePoints) {
      events.push({
        t: bp.t,
        kind: 'ball_bounce',
        pos: bp.pos,
        remainingEnergy: 0.5,
      });
    }
  }

  // ─── Step 6: 送球処理 ─────────────────────────────────────
  const basesBool = {
    first: basesBefore.first !== null,
    second: basesBefore.second !== null,
    third: basesBefore.third !== null,
  };

  const throwResult: ThrowResult = resolveThrow(
    fieldingResult,
    basesBool,
    input.outs,
    posAbilities,
    rng.derive('throw'),
  );

  if (throwResult.willThrow && throwResult.toBase !== 'cutoff') {
    events.push({
      t: throwResult.releaseTimeMs,
      kind: 'fielder_throw',
      fromId: fieldingResult.primaryFielder.id,
      toBase: throwResult.toBase,
      throwQuality: throwResult.throwQuality,
    });
    events.push({
      t: throwResult.arrivalTimeMs,
      kind: 'throw_arrival',
      toBase: throwResult.toBase,
      pos: { x: 0, y: 0 }, // 塁座標（簡略化）
    });
  }

  // ─── Step 7: 走塁判定 ─────────────────────────────────────
  const runners = extractRunners(basesBefore);
  const isFlyBall = adjustedTrajectory.launchAngle > 25;
  const isHomeRun = ['line_drive_hr', 'high_arc_hr', 'fence_close_call'].includes(detailedHit);

  const baserunningResult: BaserunningResult = resolveBaseRunning(
    basesBefore,
    runners,
    input.batterId,
    input.batterSpeedStat,
    fieldingResult,
    throwResult,
    isFlyBall,
    isHomeRun,
    input.outs,
    rng.derive('baserunning'),
  );

  // 走者イベント
  for (const decision of baserunningResult.decisions) {
    if (decision.willAdvance) {
      events.push({
        t: decision.arrivalTimeMs * 0.5,
        kind: 'runner_advance',
        runnerId: decision.runnerId,
        fromBase: decision.fromBase,
        toBase: decision.targetBase,
      });

      if (decision.outcome === 'safe') {
        events.push({
          t: decision.arrivalTimeMs,
          kind: decision.targetBase === 'home' ? 'home_run' : 'runner_safe',
          runnerId: decision.runnerId,
          ...(decision.targetBase !== 'home' ? { base: decision.targetBase } : {}),
        } as TimelineEvent);
      } else if (decision.outcome === 'out') {
        events.push({
          t: decision.arrivalTimeMs,
          kind: 'runner_out',
          runnerId: decision.runnerId,
          base: decision.targetBase,
          cause: 'force_out',
        });
      }
    }
  }

  // ─── Step 8: 記録計算 ─────────────────────────────────────
  const scoring = computeScoring(
    baserunningResult,
    fieldingResult,
    detailedHit,
    basesBefore,
    input.batterId,
    input.batterSpeedStat,
  );

  // ─── Step 9: タイムライン構築・検証 ──────────────────────
  events.push({ t: scoring.baseStateAfter ? getLastEventTime(events) + 100 : 9999, kind: 'play_end' });

  const timeline = buildAndValidateTimeline(events, input.rngSeed);

  // ─── Step 10: PlayResolution 組み立て ────────────────────
  return {
    trajectory: adjustedTrajectory,
    flight,
    timeline,
    fieldResult: scoring.fieldResult,
    detailedHitType: detailedHit,
    rbiCount: scoring.rbiCount,
    baseStateAfter: scoring.baseStateAfter,
    latentState: latent,
  };
}

// ============================================================
// ファウル/ミス時の簡易 PlayResolution
// ============================================================

function buildFoulOrMissResolution(
  trajectory: BallTrajectoryParams,
  flight: BallFlight,
  contact: import('./types').ContactDetail,
  _latent: SwingLatentState,
  basesBefore: BaseState,
  input: ResolvePlayInput,
  events: TimelineEvent[],
): PlayResolution {
  // flight.isFoul は sprayAngle ベースの物理ファウル、contact.isFoul はコンタクト品質ベース
  const detailedHit = (contact.isFoul || flight.isFoul) ? 'foul_fly' as const : 'check_swing_dribbler' as const;

  if (flight.isFoul || contact.isFoul) {
    events.push({
      t: flight.hangTimeMs,
      kind: 'ball_landing',
      pos: flight.landingPoint,
    });
  }

  events.push({ t: getLastEventTime(events) + 100, kind: 'play_end' });

  const timeline = buildAndValidateTimeline(events, input.rngSeed);

  return {
    trajectory,
    flight,
    timeline,
    fieldResult: { type: 'out', fielder: 'catcher', isError: false },
    detailedHitType: detailedHit,
    rbiCount: 0,
    baseStateAfter: basesBefore,
    latentState: _latent,
  };
}

// ============================================================
// タイムライン構築・検証
// ============================================================

/**
 * イベント列をソートして CanonicalTimeline を構築・検証する
 * V3 §7.2 の 5 つの不変条件をチェックする
 */
export function buildAndValidateTimeline(
  rawEvents: TimelineEvent[],
  rngSeed?: string,
): CanonicalTimeline {
  // 1. 時刻昇順ソート
  const sorted = [...rawEvents].sort((a, b) => a.t - b.t);

  // 2. play_end が最後にあることを保証
  const withEnd = ensurePlayEnd(sorted);

  // 3. 不変条件チェック
  validateTimeline(withEnd);

  return {
    events: withEnd,
    rngSeed,
  };
}

/**
 * 5 つの不変条件を検証する (V3 §7.2)
 */
export function validateTimeline(events: ReadonlyArray<TimelineEvent>): void {
  // 1. 時刻単調
  for (let i = 1; i < events.length; i++) {
    if (events[i].t < events[i - 1].t) {
      throw new TimelineValidationError(
        `時刻単調違反: events[${i - 1}].t=${events[i - 1].t} > events[${i}].t=${events[i].t}`,
        'time_monotonic',
        events,
      );
    }
  }

  // 2. 因果整合: runner_out の前に throw_arrival か fielder_field_ball があること
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.kind === 'runner_out') {
      const hasPrecursor = events.slice(0, i).some(
        e => e.kind === 'throw_arrival' || e.kind === 'fielder_field_ball',
      );
      if (!hasPrecursor) {
        throw new TimelineValidationError(
          `因果整合違反: runner_out の前に throw_arrival または fielder_field_ball がない (t=${ev.t})`,
          'causality',
          events,
        );
      }
    }
  }

  // 3. 完結性: play_end で終わること
  const last = events[events.length - 1];
  if (!last || last.kind !== 'play_end') {
    throw new TimelineValidationError(
      '完結性違反: タイムラインが play_end で終わっていない',
      'completeness',
      events,
    );
  }
}

// ============================================================
// ヘルパー関数
// ============================================================

function ensurePlayEnd(events: TimelineEvent[]): TimelineEvent[] {
  const hasEnd = events.some(e => e.kind === 'play_end');
  if (hasEnd) return events;

  const lastT = events.length > 0 ? events[events.length - 1].t : 0;
  return [...events, { t: lastT + 100, kind: 'play_end' } as const];
}

function getLastEventTime(events: TimelineEvent[]): number {
  if (events.length === 0) return 0;
  return Math.max(...events.map(e => e.t));
}

function buildPositionAbilityMap(
  fielderAbilities: ReadonlyMap<string, FielderAbility>,
): Map<import('../../types/player').Position, FielderAbility> {
  const map = new Map<import('../../types/player').Position, FielderAbility>();
  for (const [key, val] of fielderAbilities) {
    map.set(key as import('../../types/player').Position, val);
  }
  return map;
}

// ============================================================
// re-exports（テスト・外部利用）
// ============================================================

export { generateBatSwing, computeSwingSpeed, computeTimingErrorMs } from './bat-swing';
export {
  resolveContact,
  computeTimingPenalty,
  computeIsFoul,
  computeTimingFoulProb,
  getFoulReason,
  adjustTrajectoryForContact,
  isDribblerContact,
} from './contact';
export {
  classifyDetailedHit,
  classifyGrounder,
  classifyFly,
  classifyHomeRun,
  isDribbler,
  getSprayZone,
  getBallZone,
  MAJOR_HIT_TYPES,
  MEDIUM_HIT_TYPES,
  RARE_HIT_TYPES,
} from './batted-ball-classifier';
export {
  resolveFielding,
  resolveThrow,
  selectPrimaryFielder,
  selectThrowTarget,
  resolveCatchAttempt,
  computeHandleTime,
  computeThrowArrivalMs,
  computeRunnerArrivalMs,
  DEFAULT_FIELDER_ABILITY,
} from './fielding';
export {
  resolveBaseRunning,
  computeDecisionMargin,
  shouldAdvance,
  computeForceAdvanceBases,
  getNextBase,
  extractRunners,
  computeBaseStateAfter,
} from './base-running';
export {
  computeScoring,
  countRuns,
  countOuts,
  deriveBatterOutcome,
  deriveFieldResult,
  computeRBI,
  isFlyType,
} from './scoring';
export type { ResolvePlayInput } from './types';
export type { FielderAbility } from './fielding';
