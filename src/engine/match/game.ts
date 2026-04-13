import type { RNG } from '../../core/rng';
import type {
  MatchState,
  MatchConfig,
  MatchTeam,
  MatchPlayer,
  MatchResult,
  MatchBatterStat,
  MatchPitcherStat,
  TacticalOrder,
  HalfInning,
  InningResult,
  AtBatResult,
} from './types';
import { EMPTY_BASES } from './types';
import { processFullInning } from './inning';
import {
  collectBatterStats,
  collectPitcherStats,
  selectMVP,
} from './result';

// ============================================================
// 試合実行
// ============================================================

/**
 * 試合全体を実行する。
 * 9イニング + 延長（最大maxExtras回）。
 * トーナメントモードでは決着がつくまで延長。
 */
export function runGame(
  config: MatchConfig,
  homeTeam: MatchTeam,
  awayTeam: MatchTeam,
  rng: RNG,
  homeTactics?: (state: MatchState, rng: RNG) => TacticalOrder,
  awayTactics?: (state: MatchState, rng: RNG) => TacticalOrder,
): { finalState: MatchState; result: MatchResult } {
  let state: MatchState = {
    config,
    homeTeam,
    awayTeam,
    currentInning: 1,
    currentHalf: 'top',
    outs: 0,
    count: { balls: 0, strikes: 0 },
    bases: EMPTY_BASES,
    score: { home: 0, away: 0 },
    inningScores: { home: [], away: [] },
    currentBatterIndex: 0,
    pitchCount: 0,
    log: [],
    isOver: false,
    result: null,
  };

  const allAtBatResults: AtBatResult[] = [];
  const maxInnings = config.innings + config.maxExtras;
  const safetyMaxInnings = config.isTournament ? config.innings + 15 : maxInnings;

  for (let inning = 1; inning <= safetyMaxInnings; inning++) {
    state = { ...state, currentInning: inning };

    const { nextState, isSayonara, atBatResults } = processFullInning(
      state,
      rng.derive(`inning-${inning}`),
      homeTactics,
      awayTactics,
    );

    state = nextState;
    allAtBatResults.push(...atBatResults);

    // サヨナラ勝ち
    if (isSayonara) {
      return finishGame(state, inning, allAtBatResults);
    }

    // 規定イニング終了後の判定
    if (inning >= config.innings) {
      // 同点でなければ試合終了
      if (state.score.home !== state.score.away) {
        return finishGame(state, inning, allAtBatResults);
      }

      // 延長上限チェック（トーナメント以外）
      if (!config.isTournament && inning >= maxInnings) {
        return finishGame(state, inning, allAtBatResults); // 引き分け
      }
    }
  }

  // safety valve
  return finishGame(state, state.currentInning, allAtBatResults);
}

// ============================================================
// 試合結果の生成
// ============================================================

function finishGame(
  state: MatchState,
  totalInnings: number,
  allAtBatResults: AtBatResult[],
): { finalState: MatchState; result: MatchResult } {
  const winner =
    state.score.home > state.score.away
      ? 'home'
      : state.score.away > state.score.home
        ? 'away'
        : 'draw';

  // 全選手IDリスト
  const allPlayerIds = [
    ...state.homeTeam.players.map((p) => p.player.id),
    ...state.awayTeam.players.map((p) => p.player.id),
  ];

  // 投手IDリスト
  const homePitcherIds = state.homeTeam.players
    .filter((p) => p.player.stats.pitching)
    .map((p) => p.player.id);
  const awayPitcherIds = state.awayTeam.players
    .filter((p) => p.player.stats.pitching)
    .map((p) => p.player.id);
  const allPitcherIds = [...homePitcherIds, ...awayPitcherIds];

  // 成績集計
  const batterStats = collectBatterStats(allAtBatResults, allPlayerIds);
  const pitcherStats = collectPitcherStats(
    allAtBatResults,
    allPitcherIds,
    winner as 'home' | 'away' | 'draw',
    homePitcherIds,
    awayPitcherIds,
  );

  // MVP選出
  const homeBatterIds = state.homeTeam.battingOrder;
  const awayBatterIds = state.awayTeam.battingOrder;
  const mvpPlayerId = selectMVP(
    batterStats,
    pitcherStats,
    winner as 'home' | 'away' | 'draw',
    homeBatterIds,
    awayBatterIds,
  );

  const result: MatchResult = {
    winner: winner as 'home' | 'away' | 'draw',
    finalScore: { ...state.score },
    inningScores: {
      home: [...state.inningScores.home],
      away: [...state.inningScores.away],
    },
    totalInnings,
    mvpPlayerId,
    batterStats,
    pitcherStats,
  };

  const finalState: MatchState = {
    ...state,
    isOver: true,
    result,
  };

  return { finalState, result };
}
