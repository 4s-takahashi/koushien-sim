/**
 * resultsProjector — 試合結果画面用 ViewState 生成
 *
 * (worldState: WorldState, recentDayResults: WorldDayResult[]) => ResultsViewState
 */

import type { WorldState } from '../../engine/world/world-state';
import type { WorldDayResult } from '../../engine/world/world-ticker';
import type { MatchResult, InningResult, AtBatResult, AtBatOutcome } from '../../engine/match/types';
import type {
  ResultsViewState, ScoreboardView, InningScoreView,
  MatchHighlightView, PitcherSummaryView, AtBatFlowItem,
} from './view-state-types';
import { makeDateView } from './homeProjector';

// ============================================================
// 内部ヘルパー
// ============================================================

/**
 * AtBatOutcome を日本語の結果文字列に変換する
 */
function outcomeToLabel(outcome: AtBatOutcome): string {
  switch (outcome.type) {
    case 'strikeout':      return '三振';
    case 'ground_out':     return '内野ゴロ';
    case 'fly_out':        return '外野フライ';
    case 'line_out':       return 'ライナー';
    case 'double_play':    return '併殺打';
    case 'sacrifice_bunt': return '犠打';
    case 'sacrifice_fly':  return '犠飛';
    case 'single':         return '単打';
    case 'double':         return '二塁打';
    case 'triple':         return '三塁打';
    case 'home_run':       return 'ホームラン';
    case 'walk':           return '四球';
    case 'hit_by_pitch':   return '死球';
    case 'error':          return '失策';
    case 'intentional_walk': return '敬遠';
    default:               return '不明';
  }
}

/**
 * AtBatOutcome のハイライト種別を返す
 */
function outcomeToHighlightKind(outcome: AtBatOutcome): MatchHighlightView['kind'] | null {
  switch (outcome.type) {
    case 'home_run':    return 'homerun';
    case 'strikeout':   return 'strikeout';
    case 'double':      return 'double';
    case 'triple':      return 'triple';
    case 'double_play': return 'double_play';
    default:            return null;
  }
}

/**
 * ハイライト種別からアイコンを返す
 */
function highlightKindToIcon(kind: MatchHighlightView['kind']): string {
  switch (kind) {
    case 'homerun':     return '💥';
    case 'strikeout':   return '🔥';
    case 'double':      return '📍';
    case 'triple':      return '🚀';
    case 'double_play': return '⚡';
    case 'defense':     return '🛡️';
    default:            return '⚾';
  }
}

/**
 * InningResult[] から打席フローと highlights を生成する。
 */
function buildFlowAndHighlights(
  innings: InningResult[],
  getPlayerName: (id: string) => string,
  playerSide: 'home' | 'away',
): {
  atBatFlow: AtBatFlowItem[];
  highlights: MatchHighlightView[];
} {
  const atBatFlow: AtBatFlowItem[] = [];
  const highlights: MatchHighlightView[] = [];

  let homeScore = 0;
  let awayScore = 0;

  for (const inning of innings) {
    for (const ab of inning.atBats) {
      const label = outcomeToLabel(ab.outcome);

      // 得点更新
      if (inning.half === 'top') {
        awayScore += ab.rbiCount;
      } else {
        homeScore += ab.rbiCount;
      }

      const scoreStr = playerSide === 'home'
        ? `${homeScore}-${awayScore}`
        : `${awayScore}-${homeScore}`;

      // 自校打席のみフロー表示（最大 20 件）
      if (atBatFlow.length < 20) {
        atBatFlow.push({
          inning: inning.inningNumber,
          half: inning.half,
          batterName: getPlayerName(ab.batterId),
          result: label,
          rbiCount: ab.rbiCount,
          scoreAfter: scoreStr,
        });
      }

      // ハイライト: 特筆すべきプレイ（最大 10 件）
      if (highlights.length < 10) {
        const kind = outcomeToHighlightKind(ab.outcome);
        if (kind) {
          const halfLabel = inning.half === 'top' ? '表' : '裏';
          highlights.push({
            inning: inning.inningNumber,
            half: inning.half,
            label: `${inning.inningNumber}回${halfLabel} ${getPlayerName(ab.batterId)} → ${label}`,
            kind,
            icon: highlightKindToIcon(kind),
          });
        }
      }
    }
  }

  return { atBatFlow, highlights };
}

/**
 * MatchResult から InningScoreView を構築する
 */
function buildInningScoreView(matchResult: MatchResult): InningScoreView {
  const total = matchResult.totalInnings;
  const homeArr: (number | null)[] = [];
  const awayArr: (number | null)[] = [];

  for (let i = 0; i < total; i++) {
    homeArr.push(matchResult.inningScores.home[i] ?? 0);
    awayArr.push(matchResult.inningScores.away[i] ?? 0);
  }

  return {
    homeInnings: homeArr,
    awayInnings: awayArr,
    totalInnings: total,
  };
}

/**
 * MatchResult から先発投手成績サマリーを抽出する
 */
function buildPitcherSummary(
  matchResult: MatchResult,
  getPlayerName: (id: string) => string,
  starterPitcherId?: string,
): PitcherSummaryView | null {
  if (!matchResult.pitcherStats || matchResult.pitcherStats.length === 0) return null;

  // 先発（innings pitched が最も多い投手 or 指定 starter）
  const stats = starterPitcherId
    ? matchResult.pitcherStats.find((s) => s.playerId === starterPitcherId)
    : matchResult.pitcherStats.reduce((best, s) =>
        s.inningsPitched > best.inningsPitched ? s : best
      );

  if (!stats) return null;

  return {
    name: getPlayerName(stats.playerId),
    pitchCount: stats.pitchCount,
    strikeouts: stats.strikeouts,
    earnedRuns: stats.earnedRuns,
    inningsPitched: stats.inningsPitched,
  };
}

// ============================================================
// 公開 API
// ============================================================

/**
 * 試合結果画面の ViewState を生成する。
 *
 * @param worldState         現在の WorldState
 * @param recentDayResults   直近の WorldDayResult[]（最新順）
 */
export function projectResults(
  worldState: WorldState,
  recentDayResults: WorldDayResult[] = [],
): ResultsViewState {
  const { playerSchoolId, schools } = worldState;

  const playerSchool = schools.find((s) => s.id === playerSchoolId);
  const playerSchoolName = playerSchool?.name ?? '自校';

  // 選手名解決
  const allPlayers = schools.flatMap((s) => s.players);
  const getPlayerName = (id: string): string => {
    const p = allPlayers.find((pl) => pl.id === id);
    return p ? `${p.lastName}${p.firstName}` : id.slice(0, 4);
  };

  let wins = 0;
  let losses = 0;
  let draws = 0;

  const recentResults: ScoreboardView[] = [];

  for (const dayResult of recentDayResults) {
    const mr = dayResult.playerMatchResult;
    if (!mr) continue;

    const side = dayResult.playerMatchSide ?? 'home';
    const opponent = dayResult.playerMatchOpponent ?? '不明';
    const homeSchool = side === 'home' ? playerSchoolName : opponent;
    const awaySchool = side === 'home' ? opponent : playerSchoolName;
    const homeScore = mr.finalScore.home;
    const awayScore = mr.finalScore.away;

    // 自校スコア判定
    const myScore = side === 'home' ? homeScore : awayScore;
    const oppScore = side === 'home' ? awayScore : homeScore;

    let result: ScoreboardView['result'];
    if (mr.winner === 'draw') {
      result = '引き分け';
      draws++;
    } else if (
      (mr.winner === 'home' && side === 'home') ||
      (mr.winner === 'away' && side === 'away')
    ) {
      result = '勝利';
      wins++;
    } else {
      result = '敗北';
      losses++;
    }

    // イニング別スコア
    const inningScores = buildInningScoreView(mr);

    // 打席フロー & ハイライト（Phase 6: playerMatchInnings があれば詳細表示）
    const innings = dayResult.playerMatchInnings ?? [];
    const { atBatFlow, highlights } = buildFlowAndHighlights(innings, getPlayerName, side);

    // 先発投手成績
    const pitcherSummary = buildPitcherSummary(mr, getPlayerName);

    recentResults.push({
      date: makeDateView(dayResult.date.year, dayResult.date.month, dayResult.date.day),
      homeSchool,
      awaySchool,
      homeScore,
      awayScore,
      innings: mr.totalInnings,
      isPlayerSchool: true,
      result,
      inningScores,
      highlights: highlights.length > 0 ? highlights : undefined,
      pitcherSummary,
      atBatFlow: atBatFlow.length > 0 ? atBatFlow : undefined,
    });
  }

  return {
    recentResults,
    seasonRecord: { wins, losses, draws },
  };
}
