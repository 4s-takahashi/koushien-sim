import type { RNG } from '../core/rng';
import type {
  MatchState,
  MatchPlayer,
  AtBatResult,
  AtBatOutcome,
  TacticalOrder,
  Count,
  BaseState,
  RunnerInfo,
  PitchResult,
} from './types';
import { processPitch } from './pitch/process-pitch';
import { MATCH_CONSTANTS } from './constants';
import type { MatchOverrides } from './runner-types';

// ============================================================
// 走者進塁ヘルパー（四球・死球共通）
// ============================================================

/**
 * 四球（死球含む）時に、打者が一塁に進み、走者が押し出されるロジック。
 * 満塁の場合は三塁走者が生還（1点）。
 */
export function advanceRunnerOnWalk(
  bases: BaseState,
  batterInfo: RunnerInfo,
): { bases: BaseState; scoredRuns: number } {
  let scoredRuns = 0;

  if (bases.first !== null) {
    if (bases.second !== null) {
      if (bases.third !== null) {
        // 満塁 → 三塁走者が生還
        scoredRuns = 1;
        bases = {
          third: bases.second,
          second: bases.first,
          first: batterInfo,
        };
      } else {
        // 一・二塁 → 二塁走者が三塁へ
        bases = {
          third: bases.second,
          second: bases.first,
          first: batterInfo,
        };
      }
    } else {
      // 一塁のみ → 一塁走者が二塁へ
      bases = {
        ...bases,
        second: bases.first,
        first: batterInfo,
      };
    }
  } else {
    // 一塁が空 → 打者がそのまま一塁へ
    bases = { ...bases, first: batterInfo };
  }

  return { bases, scoredRuns };
}

/**
 * 走者進塁・スコア更新をまとめて MatchState に適用するヘルパー
 */
function applyWalkToState(
  state: MatchState,
  batterMP: MatchPlayer,
): { nextState: MatchState; scoredRuns: number } {
  const batterInfo: RunnerInfo = {
    playerId: batterMP.player.id,
    speed: batterMP.player.stats.base.speed,
  };
  const { bases: newBases, scoredRuns } = advanceRunnerOnWalk(state.bases, batterInfo);

  const isBottom = state.currentHalf === 'bottom';
  let score = state.score;
  let inningScores = state.inningScores;

  if (scoredRuns > 0) {
    const idx = state.currentInning - 1;
    const key = isBottom ? 'home' : 'away';
    const arr = [...inningScores[key]];
    // fill any gaps with 0 to avoid sparse array NaN in reduce
    while (arr.length <= idx) arr.push(0);
    arr[idx] = arr[idx] + scoredRuns;
    inningScores = {
      ...inningScores,
      [key]: arr,
    };
    score = { ...score, [key]: score[key] + scoredRuns };
  }

  return {
    nextState: { ...state, bases: newBases, score, inningScores },
    scoredRuns,
  };
}

/**
 * 死球チェック
 */
function checkHitByPitch(rng: RNG): boolean {
  return rng.chance(MATCH_CONSTANTS.HIT_BY_PITCH_BASE_RATE);
}

// ============================================================
// 打点計算
// ============================================================

/**
 * 打席結果と生還得点数から打点を計算する。
 * 三振・通常アウト・エラーは打点なし。
 */
export function calculateRBI(
  outcome: AtBatOutcome,
  runsScoredDuringAtBat: number,
): number {
  switch (outcome.type) {
    case 'strikeout':
    case 'error':
    case 'ground_out':
    case 'fly_out':
    case 'line_out':
    case 'double_play':
      return 0;
    default:
      return runsScoredDuringAtBat;
  }
}

/**
 * 1打席を処理する
 * @param overrides Phase 7-E1: 心理システムからのメンタル補正（省略可）。
 *   省略時は従来通りの挙動。
 */
export function processAtBat(
  state: MatchState,
  order: TacticalOrder,
  rng: RNG,
  overrides?: MatchOverrides,
): { nextState: MatchState; result: AtBatResult } {
  const battingTeam = state.currentHalf === 'top' ? state.awayTeam : state.homeTeam;
  const batterId = battingTeam.battingOrder[state.currentBatterIndex];
  const batterMP = battingTeam.players.find((p) => p.player.id === batterId);
  if (!batterMP) throw new Error(`Batter not found: ${batterId}`);

  const fieldingTeam = state.currentHalf === 'top' ? state.homeTeam : state.awayTeam;
  const pitcherId = fieldingTeam.currentPitcherId;
  const pitcherMP = fieldingTeam.players.find((p) => p.player.id === pitcherId);
  if (!pitcherMP) throw new Error(`Pitcher not found: ${pitcherId}`);

  const runnersBefore = state.bases;
  const isBottom = state.currentHalf === 'bottom';

  // ── 敬遠の即座処理 ──
  if (order.type === 'intentional_walk') {
    const { nextState: stateAfterWalk, scoredRuns } = applyWalkToState(state, batterMP);
    const outcome: AtBatOutcome = { type: 'intentional_walk' };
    const rbiCount = calculateRBI(outcome, scoredRuns);
    const finalState = updateConfidenceAfterAtBat(stateAfterWalk, outcome, batterMP, pitcherMP, rbiCount);

    return {
      nextState: finalState,
      result: {
        batterId,
        pitcherId,
        pitches: [],
        finalCount: { balls: 4, strikes: 0 },
        outcome,
        rbiCount,
        runnersBefore,
        runnersAfter: finalState.bases,
      },
    };
  }

  // ── 打席ループ: processPitch を繰り返す ──
  // カウントを打席開始時にリセット（前の打席のカウントを引き継がないよう）
  let currentState = { ...state, count: { balls: 0, strikes: 0 } };
  let currentCount: Count = { balls: 0, strikes: 0 };
  const pitches: PitchResult[] = [];
  let atBatOutcome: AtBatOutcome | null = null;
  let runnersAfter = state.bases;
  let rbiCount = 0;

  // 最大投球数の安全弁
  const MAX_PITCHES = 20;

  while (pitches.length < MAX_PITCHES) {
    // 死球判定（各投球前）
    if (checkHitByPitch(rng)) {
      const { nextState: stateAfterHBP, scoredRuns } = applyWalkToState(currentState, batterMP);
      atBatOutcome = { type: 'hit_by_pitch' };
      rbiCount = calculateRBI(atBatOutcome, scoredRuns);
      currentCount = stateAfterHBP.count;
      // state 側は次打席のためにカウントをリセット
      currentState = { ...stateAfterHBP, count: { balls: 0, strikes: 0 } };
      runnersAfter = stateAfterHBP.bases;
      break;
    }

    // 投球前のストライクカウントを記録（三振判定に使用）
    const strikesBeforePitch = currentState.count.strikes;

    // 1球処理（Phase 7-E1: 心理補正を渡す）
    const { nextState, pitchResult } = processPitch(currentState, order, rng, overrides);
    pitches.push(pitchResult);
    currentState = nextState;
    currentCount = nextState.count;

    // ── 打席終了判定 ──

    // 三振:
    // - called_strike / swinging_strike: 投球前に2ストライクだった場合
    // - foul_bunt: 投球前に2ストライク（バントファウルは常に三振カウント）
    //   ※ foul は 2ストライクでもカウント変化しない（通常ファウル = 三振なし）
    const isStrikeOutcome =
      pitchResult.outcome === 'called_strike' ||
      pitchResult.outcome === 'swinging_strike' ||
      pitchResult.outcome === 'foul_bunt';

    if (isStrikeOutcome && strikesBeforePitch === 2) {
      atBatOutcome = { type: 'strikeout' };
      // 三振はアウト +1（processPitch 内では加算されていないため、ここで加算する）
      currentState = {
        ...currentState,
        outs: Math.min(currentState.outs + 1, 3),
        count: { balls: 0, strikes: 0 },
      };
      runnersAfter = nextState.bases;
      break;
    }

    // 四球
    if (nextState.count.balls >= 4) {
      // 押し出し走者処理
      const { nextState: stateAfterWalk, scoredRuns } = applyWalkToState(currentState, batterMP);
      atBatOutcome = { type: 'walk' };
      rbiCount = calculateRBI(atBatOutcome, scoredRuns);
      // result.finalCount には四球成立時のカウント（balls>=4）を残す
      currentCount = stateAfterWalk.count;
      // state 側は次打席のためにカウントをリセット
      currentState = { ...stateAfterWalk, count: { balls: 0, strikes: 0 } };
      runnersAfter = stateAfterWalk.bases;
      break;
    }

    // インプレー: 打球結果で打席終了
    if (pitchResult.outcome === 'in_play' && pitchResult.batContact) {
      const fc = pitchResult.batContact.fieldResult;
      const contactType = pitchResult.batContact.contactType;

      switch (fc.type) {
        case 'single':
          atBatOutcome = { type: 'single' };
          break;
        case 'double':
          atBatOutcome = { type: 'double' };
          break;
        case 'triple':
          atBatOutcome = { type: 'triple' };
          break;
        case 'home_run':
          atBatOutcome = { type: 'home_run' };
          break;
        case 'error':
          atBatOutcome = { type: 'error', fielder: fc.fielder };
          break;
        case 'out':
          if (contactType === 'fly_ball' || contactType === 'popup') {
            atBatOutcome = { type: 'fly_out', fielder: fc.fielder };
          } else if (contactType === 'line_drive') {
            atBatOutcome = { type: 'line_out', fielder: fc.fielder };
          } else {
            atBatOutcome = { type: 'ground_out', fielder: fc.fielder };
          }
          break;
        case 'double_play':
          atBatOutcome = { type: 'double_play' };
          break;
        case 'sacrifice':
          atBatOutcome = { type: 'sacrifice_bunt' };
          break;
        case 'sacrifice_fly':
          atBatOutcome = { type: 'sacrifice_fly' };
          break;
        default:
          atBatOutcome = { type: 'ground_out', fielder: fc.fielder };
      }

      runnersAfter = nextState.bases;
      // RBI: 打席中に得点したランナー数
      const runsScored = calculateRunsScored(isBottom, nextState.score, state.score);
      rbiCount = calculateRBI(atBatOutcome, runsScored);

      // ⚠️ 重要: 打席終了時にカウントをリセット
      // これを忘れると次の打席の打者に前の打席の中間カウントが引き継がれ、
      // 「2ストライクで三振した」ように見える誤動作になる (2026-04-19 バグ修正)
      currentState = { ...currentState, count: { balls: 0, strikes: 0 } };
      currentCount = { balls: 0, strikes: 0 };
      break;
    }
  }

  // 打席終了に達しなかった場合の安全弁（MAX_PITCHES超過 → 強制四球）
  if (!atBatOutcome) {
    const { nextState: stateAfterWalk, scoredRuns } = applyWalkToState(currentState, batterMP);
    atBatOutcome = { type: 'walk' };
    rbiCount = calculateRBI(atBatOutcome, scoredRuns);
    currentState = stateAfterWalk;
    currentCount = stateAfterWalk.count;
    runnersAfter = stateAfterWalk.bases;
  }

  // 投手・打者の confidence 更新
  let finalState = currentState;
  finalState = updateConfidenceAfterAtBat(finalState, atBatOutcome, batterMP, pitcherMP, rbiCount);

  return {
    nextState: finalState,
    result: {
      batterId,
      pitcherId,
      pitches,
      finalCount: currentCount,
      outcome: atBatOutcome,
      rbiCount,
      runnersBefore,
      runnersAfter,
    },
  };
}

/**
 * 打席中に得点したランナー数を計算
 */
function calculateRunsScored(
  isBottom: boolean,
  scoreAfter: MatchState['score'],
  scoreBefore: MatchState['score'],
): number {
  const key = isBottom ? 'home' : 'away';
  return Math.max(0, scoreAfter[key] - scoreBefore[key]);
}

/**
 * 打席結果に応じてconfidenceを更新
 */
function updateConfidenceAfterAtBat(
  state: MatchState,
  outcome: AtBatOutcome,
  batterMP: MatchPlayer,
  pitcherMP: MatchPlayer,
  rbiCount: number,
): MatchState {
  const battingTeam = state.currentHalf === 'top' ? state.awayTeam : state.homeTeam;
  const fieldingTeam = state.currentHalf === 'top' ? state.homeTeam : state.awayTeam;

  // 打者の confidence 更新
  let batterConfidence = batterMP.confidence;
  if (outcome.type === 'home_run') {
    batterConfidence += MATCH_CONSTANTS.CONFIDENCE_HR_GAIN;
  } else if (outcome.type === 'single' || outcome.type === 'double' || outcome.type === 'triple') {
    batterConfidence += MATCH_CONSTANTS.CONFIDENCE_HIT_GAIN;
  } else if (outcome.type === 'walk' || outcome.type === 'hit_by_pitch' || outcome.type === 'error') {
    batterConfidence += MATCH_CONSTANTS.CONFIDENCE_WALK_GAIN;
  } else if (outcome.type === 'strikeout') {
    batterConfidence += MATCH_CONSTANTS.CONFIDENCE_STRIKEOUT_LOSS;
  } else if (outcome.type === 'ground_out' || outcome.type === 'fly_out' || outcome.type === 'line_out') {
    batterConfidence += MATCH_CONSTANTS.CONFIDENCE_POPUP_LOSS;
  }

  // 投手の confidence 更新
  let pitcherConfidence = pitcherMP.confidence;
  if (outcome.type === 'strikeout') {
    pitcherConfidence += MATCH_CONSTANTS.CONFIDENCE_PITCHER_K_GAIN;
  } else if (outcome.type === 'ground_out' || outcome.type === 'fly_out' || outcome.type === 'line_out') {
    pitcherConfidence += MATCH_CONSTANTS.CONFIDENCE_PITCHER_OUT_GAIN;
  } else if (outcome.type === 'single' || outcome.type === 'double' || outcome.type === 'triple') {
    pitcherConfidence += MATCH_CONSTANTS.CONFIDENCE_PITCHER_HIT_LOSS;
  } else if (outcome.type === 'home_run') {
    pitcherConfidence += MATCH_CONSTANTS.CONFIDENCE_PITCHER_HR_LOSS;
  } else if (outcome.type === 'walk') {
    pitcherConfidence += MATCH_CONSTANTS.CONFIDENCE_PITCHER_WALK_LOSS;
  }

  // clamp to 0-100
  batterConfidence = Math.max(0, Math.min(100, batterConfidence));
  pitcherConfidence = Math.max(0, Math.min(100, pitcherConfidence));

  // MatchPlayer を更新
  const updatedBatterMP = { ...batterMP, confidence: batterConfidence };
  const updatedPitcherMP = { ...pitcherMP, confidence: pitcherConfidence };

  // チームのplayers配列を更新
  const updatedBattingTeam = {
    ...battingTeam,
    players: battingTeam.players.map((mp) =>
      mp.player.id === batterMP.player.id ? updatedBatterMP : mp,
    ),
  };

  const updatedFieldingTeam = {
    ...fieldingTeam,
    players: fieldingTeam.players.map((mp) =>
      mp.player.id === pitcherMP.player.id ? updatedPitcherMP : mp,
    ),
  };

  const isTop = state.currentHalf === 'top';
  return {
    ...state,
    awayTeam: isTop ? updatedBattingTeam : updatedFieldingTeam,
    homeTeam: isTop ? updatedFieldingTeam : updatedBattingTeam,
  };
}
