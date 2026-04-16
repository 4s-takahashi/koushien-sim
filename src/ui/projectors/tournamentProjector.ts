/**
 * tournamentProjector — 大会画面用 ViewState 生成
 *
 * (worldState: WorldState) => TournamentViewState
 */

import type { WorldState } from '../../engine/world/world-state';
import type { TournamentBracket } from '../../engine/world/tournament-bracket';
import type {
  TournamentViewState, TournamentBracketView,
  TournamentRoundView, TournamentMatchView,
} from './view-state-types';

// ============================================================
// 内部ヘルパー
// ============================================================

function getSeasonPhaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    spring_practice: '春季練習期間',
    summer_tournament: '夏の大会（地方予選）',
    koshien: '甲子園（全国大会）',
    post_summer: '夏以降練習',
    autumn_tournament: '秋の大会',
    off_season: 'オフシーズン',
    pre_season: '始動期間',
  };
  return labels[phase] ?? phase;
}

function getTournamentTypeName(type: string): string {
  switch (type) {
    case 'summer':  return '夏の大会';
    case 'autumn':  return '秋の大会';
    case 'koshien': return '甲子園';
    default:        return '大会';
  }
}

/**
 * TournamentBracket → TournamentBracketView に射影する
 */
function projectBracket(
  bracket: TournamentBracket,
  playerSchoolId: string,
  schoolNameMap: Map<string, string>,
): TournamentBracketView {
  const getSchoolName = (id: string | null): string | null => {
    if (!id) return null;
    return schoolNameMap.get(id) ?? id.slice(0, 6);
  };

  // 自校の最高到達ラウンドを計算
  let playerBestRound = 0;
  let playerWon = false;

  const rounds: TournamentRoundView[] = bracket.rounds.map((round) => {
    const matches: TournamentMatchView[] = round.matches.map((match) => {
      const isPlayerHome = match.homeSchoolId === playerSchoolId;
      const isPlayerAway = match.awaySchoolId === playerSchoolId;
      const isPlayerMatch = isPlayerHome || isPlayerAway;
      const isCompleted = match.winnerId !== null;

      // 自校の勝ち上がり記録
      if (isPlayerMatch && isCompleted && match.winnerId === playerSchoolId) {
        if (round.roundNumber > playerBestRound) {
          playerBestRound = round.roundNumber;
        }
      }

      return {
        matchId: match.matchId,
        round: match.round,
        matchIndex: match.matchIndex,
        homeSchoolName: getSchoolName(match.homeSchoolId),
        awaySchoolName: getSchoolName(match.awaySchoolId),
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        winnerId: match.winnerId,
        winnerName: getSchoolName(match.winnerId),
        isPlayerSchoolHome: isPlayerHome,
        isPlayerSchoolAway: isPlayerAway,
        isPlayerSchoolMatch: isPlayerMatch,
        isBye: match.isBye,
        isUpset: match.isUpset,
        isCompleted,
      };
    });

    return {
      roundNumber: round.roundNumber,
      roundName: round.roundName,
      matches,
    };
  });

  if (bracket.champion === playerSchoolId) {
    playerWon = true;
    playerBestRound = 6;
  }

  return {
    id: bracket.id,
    typeName: getTournamentTypeName(bracket.type),
    year: bracket.year,
    totalTeams: bracket.totalTeams,
    rounds,
    isCompleted: bracket.isCompleted,
    championName: getSchoolName(bracket.champion),
    playerSchoolBestRound: playerBestRound,
    isPlayerSchoolWinner: playerWon,
  };
}

// ============================================================
// 公開 API
// ============================================================

/**
 * 大会画面の ViewState を生成する。
 */
export function projectTournament(worldState: WorldState): TournamentViewState {
  const { currentDate, playerSchoolId, schools, seasonState } = worldState;

  const yearResults = seasonState.yearResults;

  // 学校名マップ構築
  const schoolNameMap = new Map<string, string>();
  for (const s of schools) {
    schoolNameMap.set(s.id, s.name);
  }

  // アクティブブラケット
  const activeBracket = worldState.activeTournament
    ? projectBracket(worldState.activeTournament, playerSchoolId, schoolNameMap)
    : null;

  // 履歴ブラケット（最大5件）
  const historyBrackets = ((worldState.tournamentHistory) ?? [])
    .slice(-5)
    .reverse()
    .map((b) => projectBracket(b, playerSchoolId, schoolNameMap));

  return {
    seasonPhase: seasonState.phase,
    seasonPhaseLabel: getSeasonPhaseLabel(seasonState.phase),
    currentYear: currentDate.year,
    yearResults: {
      summerBestRound: yearResults.summerBestRound,
      autumnBestRound: yearResults.autumnBestRound,
      koshienAppearance: yearResults.koshienAppearance,
      koshienBestRound: yearResults.koshienBestRound,
    },
    activeBracket,
    historyBrackets,
    placeholder: activeBracket
      ? ''
      : '大会期間中にトーナメント表が表示されます。\n夏大会（7月）・秋大会（9月）・甲子園（8月）に注目しましょう。',
  };
}
