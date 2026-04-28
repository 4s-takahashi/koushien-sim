import type { RNG } from '../core/rng';
import type {
  MatchState,
  MatchTeam,
  MatchPlayer,
  InningResult,
  AtBatResult,
  HalfInning,
  BaseState,
  TacticalOrder,
} from './types';
import { EMPTY_BASES } from './types';
import { processAtBat } from './at-bat';
import { cpuAutoTactics, validateOrder } from './tactics';
import { MATCH_CONSTANTS } from './constants';

// ============================================================
// イニング処理
// ============================================================

/**
 * 1ハーフイニングを処理する。
 * 3アウトになるまで打席を繰り返す。
 *
 * ## Phase R4 責務（V3 §10.2）
 *
 * inning.ts はイニング進行のみを担当する:
 * - `processAtBat` を繰り返してアウトカウントを 3 まで積み上げる
 * - `processAtBat` の不変条件（count リセット・スコア更新済み）に依存できる
 * - 試合終了判定は `processFullInning` / runner.ts が担当
 *
 * @returns 更新された MatchState と InningResult
 */
export function processHalfInning(
  state: MatchState,
  rng: RNG,
  tacticsProvider?: (state: MatchState, rng: RNG) => TacticalOrder,
): { nextState: MatchState; result: InningResult } {
  let currentState: MatchState = {
    ...state,
    outs: 0,
    bases: EMPTY_BASES,
  };

  const atBats: AtBatResult[] = [];
  let runsScored = 0;
  const maxAtBatsPerInning = 50; // safety valve

  for (let i = 0; i < maxAtBatsPerInning && currentState.outs < 3; i++) {
    // 采配を取得
    const provider = tacticsProvider ?? cpuAutoTactics;
    const order = provider(currentState, rng.derive(`tactics-${i}`));

    // 采配バリデーション
    const validation = validateOrder(order, currentState);
    const effectiveOrder: TacticalOrder = validation.valid ? order : { type: 'none' };

    // 得点記録（打席前）
    const scoreBefore =
      currentState.currentHalf === 'top'
        ? currentState.score.away
        : currentState.score.home;

    // 打席処理
    const { nextState, result } = processAtBat(
      currentState,
      effectiveOrder,
      rng.derive(`at-bat-${i}`),
    );

    atBats.push(result);

    // 得点を累計
    const scoreAfter =
      nextState.currentHalf === 'top'
        ? nextState.score.away
        : nextState.score.home;
    runsScored += scoreAfter - scoreBefore;

    // 打順を進める（0-8をループ）
    // v0.40.0: 打席内投球履歴をクリア（配球学習）
    const newBatterIndex = (nextState.currentBatterIndex + 1) % 9;
    currentState = { ...nextState, currentBatterIndex: newBatterIndex, currentAtBatPitches: [] };
  }

  // イニングスコアの当該回スロットが未初期化の場合は0で埋める
  // （得点なしでも length が現在イニング数を反映するようにする）
  const inningIdx = state.currentInning - 1;
  const isBottom = state.currentHalf === 'bottom';
  const scoreKey = isBottom ? 'home' : 'away';
  if (currentState.inningScores[scoreKey].length <= inningIdx) {
    const arr = [...currentState.inningScores[scoreKey]];
    while (arr.length <= inningIdx) arr.push(0);
    currentState = {
      ...currentState,
      inningScores: { ...currentState.inningScores, [scoreKey]: arr },
    };
  }

  const inningResult: InningResult = {
    inningNumber: state.currentInning,
    half: state.currentHalf,
    atBats,
    runsScored,
    outsRecorded: 3,
    endingBaseState: currentState.bases,
  };

  return { nextState: currentState, result: inningResult };
}

/**
 * 1回全体（表+裏）を処理する。
 * サヨナラ判定を含む。
 * 
 * NOTE: inningScoresはat-bat.ts内で更新されるため、ここでは追加しない。
 */
export function processFullInning(
  state: MatchState,
  rng: RNG,
  homeTactics?: (state: MatchState, rng: RNG) => TacticalOrder,
  awayTactics?: (state: MatchState, rng: RNG) => TacticalOrder,
): { nextState: MatchState; isSayonara: boolean; atBatResults: AtBatResult[] } {
  // ── 表（away攻撃） ──
  const topState: MatchState = {
    ...state,
    currentHalf: 'top' as HalfInning,
  };

  const { nextState: afterTop, result: topResult } = processHalfInning(
    topState,
    rng.derive(`top-${state.currentInning}`),
    awayTactics,
  );

  // ── 裏（home攻撃） ──
  // 9回裏以降でホームがリードしていればスキップ（ゲームセット）
  if (
    state.currentInning >= state.config.innings &&
    afterTop.score.home > afterTop.score.away
  ) {
    return {
      nextState: afterTop,
      isSayonara: false,
      atBatResults: topResult.atBats,
    };
  }

  const bottomState: MatchState = {
    ...afterTop,
    currentHalf: 'bottom' as HalfInning,
    outs: 0,
    bases: EMPTY_BASES,
  };

  // サヨナラ判定付きの裏イニング処理
  const { nextState: afterBottom, result: bottomResult } = processHalfInningSayonara(
    bottomState,
    rng.derive(`bottom-${state.currentInning}`),
    state.currentInning >= state.config.innings,
    homeTactics,
  );

  const isSayonara =
    state.currentInning >= state.config.innings &&
    afterBottom.score.home > afterBottom.score.away;

  return {
    nextState: afterBottom,
    isSayonara,
    atBatResults: [...topResult.atBats, ...bottomResult.atBats],
  };
}

/**
 * サヨナラ判定付きの裏イニング処理。
 * ホームが得点した時点でリードしていれば即座に終了。
 */
function processHalfInningSayonara(
  state: MatchState,
  rng: RNG,
  checkSayonara: boolean,
  tacticsProvider?: (state: MatchState, rng: RNG) => TacticalOrder,
): { nextState: MatchState; result: InningResult } {
  let currentState: MatchState = {
    ...state,
    outs: 0,
    bases: EMPTY_BASES,
  };

  const atBats: AtBatResult[] = [];
  let runsScored = 0;
  const maxAtBatsPerInning = 50;

  for (let i = 0; i < maxAtBatsPerInning && currentState.outs < 3; i++) {
    const provider = tacticsProvider ?? cpuAutoTactics;
    const order = provider(currentState, rng.derive(`tactics-${i}`));
    const validation = validateOrder(order, currentState);
    const effectiveOrder: TacticalOrder = validation.valid ? order : { type: 'none' };

    const scoreBefore = currentState.score.home;

    const { nextState, result } = processAtBat(
      currentState,
      effectiveOrder,
      rng.derive(`at-bat-${i}`),
    );

    atBats.push(result);
    runsScored += nextState.score.home - scoreBefore;

    // v0.40.0: 打席切替で currentAtBatPitches をクリア
    const newBatterIndex = (nextState.currentBatterIndex + 1) % 9;
    currentState = { ...nextState, currentBatterIndex: newBatterIndex, currentAtBatPitches: [] };

    // サヨナラ判定: ホームがリードしたら即座に終了
    if (checkSayonara && currentState.score.home > currentState.score.away) {
      break;
    }
  }

  // イニングスコアの当該回スロットが未初期化の場合は0で埋める
  const sayonaraInningIdx = state.currentInning - 1;
  if (currentState.inningScores.home.length <= sayonaraInningIdx) {
    const arr = [...currentState.inningScores.home];
    while (arr.length <= sayonaraInningIdx) arr.push(0);
    currentState = {
      ...currentState,
      inningScores: { ...currentState.inningScores, home: arr },
    };
  }

  const inningResult: InningResult = {
    inningNumber: state.currentInning,
    half: 'bottom',
    atBats,
    runsScored,
    outsRecorded: Math.min(currentState.outs, 3),
    endingBaseState: currentState.bases,
  };

  return { nextState: currentState, result: inningResult };
}
