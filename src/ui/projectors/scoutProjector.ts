/**
 * scoutProjector — スカウト画面用 ViewState 生成
 *
 * (worldState: WorldState) => ScoutViewState
 * (worldState: WorldState, filters: ScoutSearchFilter) => ScoutViewState（フィルタ付き）
 */

import type { WorldState, MiddleSchoolPlayer, ScoutSearchFilter } from '../../engine/world/world-state';
import type {
  ScoutViewState, WatchListPlayerView, ScoutReportView, ProspectSearchResultView,
} from './view-state-types';
import {
  computeMiddleSchoolOverall,
  searchMiddleSchoolers,
} from '../../engine/world/scout/scout-system';

// ============================================================
// 内部ヘルパー
// ============================================================

function overallToQualityTier(overall: number): 'S' | 'A' | 'B' | 'C' | 'D' {
  if (overall >= 70) return 'S';
  if (overall >= 55) return 'A';
  if (overall >= 40) return 'B';
  if (overall >= 25) return 'C';
  return 'D';
}

function confidenceToLabel(confidence: number): string {
  if (confidence >= 0.75) return '確度高';
  if (confidence >= 0.5) return '確度中';
  return '確度低';
}

function getRecruitStatus(ms: MiddleSchoolPlayer, playerSchoolId: string): string {
  if (ms.targetSchoolId === playerSchoolId) return '入学確定';
  if (ms.scoutedBy.includes(playerSchoolId)) return '交渉中';
  return '未接触';
}

/**
 * 状態バッジ種別を返す
 * - unvisited: 未視察（watch list に追加しているが視察なし）
 * - visited: 視察済み（scout report あり）
 * - recruited: 勧誘済み（scoutedBy に含まれる）
 * - competing: 競合中（他校が targetSchoolId）
 * - confirmed: 入学確定（targetSchoolId === playerSchoolId）
 */
function getStatusBadge(
  ms: MiddleSchoolPlayer,
  playerSchoolId: string,
  hasReport: boolean,
): WatchListPlayerView['statusBadge'] {
  if (ms.targetSchoolId === playerSchoolId) return 'confirmed';
  if (ms.targetSchoolId && ms.targetSchoolId !== playerSchoolId) return 'competing';
  if (ms.scoutedBy.includes(playerSchoolId)) return 'recruited';
  if (hasReport) return 'visited';
  return 'unvisited';
}

/**
 * スカウトコメントを最大 40 文字に短縮する
 */
function briefComment(comment: string, maxLen = 40): string {
  if (comment.length <= maxLen) return comment;
  return comment.slice(0, maxLen) + '…';
}

// ============================================================
// 公開 API
// ============================================================

/**
 * スカウト画面の ViewState を生成する。
 *
 * @param worldState  現在の WorldState
 * @param filters     検索フィルタ（省略時は全中学生）
 */
export function projectScout(
  worldState: WorldState,
  filters: ScoutSearchFilter = {},
): ScoutViewState {
  const { scoutState, middleSchoolPool, schools, playerSchoolId } = worldState;

  const schoolMap = new Map(schools.map((s) => [s.id, s.name]));

  // --- ウォッチリスト ---
  const watchList: WatchListPlayerView[] = scoutState.watchList
    .map((id) => {
      const ms = middleSchoolPool.find((p) => p.id === id);
      if (!ms) return null;

      const report = scoutState.scoutReports.get(id);
      const overall = report
        ? computeMiddleSchoolOverall({ ...ms, currentStats: report.observedStats as typeof ms.currentStats })
        : computeMiddleSchoolOverall(ms);
      const hasReport = !!report;

      return {
        id: ms.id,
        lastName: ms.lastName,
        firstName: ms.firstName,
        grade: ms.middleSchoolGrade,
        gradeLabel: `中学${ms.middleSchoolGrade}年`,
        prefecture: ms.prefecture,
        middleSchoolName: ms.middleSchoolName,
        estimatedOverall: overall,
        qualityTier: report?.estimatedQuality ?? overallToQualityTier(overall),
        hasScoutReport: hasReport,
        isRecruited: ms.targetSchoolId === playerSchoolId,
        recruitStatus: getRecruitStatus(ms, playerSchoolId),
        statusBadge: getStatusBadge(ms, playerSchoolId, hasReport),
        scoutCommentBrief: report ? briefComment(report.scoutComment) : null,
      } as WatchListPlayerView;
    })
    .filter((v): v is WatchListPlayerView => v !== null);

  // --- スカウトレポート一覧 ---
  const scoutReports: ScoutReportView[] = [];
  for (const [playerId, report] of scoutState.scoutReports) {
    const ms = middleSchoolPool.find((p) => p.id === playerId);
    if (!ms) continue;

    const obs = report.observedStats;
    scoutReports.push({
      playerId,
      playerName: `${ms.lastName}${ms.firstName}`,
      confidence: report.confidence,
      confidenceLabel: confidenceToLabel(report.confidence),
      scoutComment: report.scoutComment,
      estimatedQuality: report.estimatedQuality,
      observedStats: {
        stamina: obs.base?.stamina ?? 0,
        speed: obs.base?.speed ?? 0,
        armStrength: obs.base?.armStrength ?? 0,
        fielding: obs.base?.fielding ?? 0,
        contact: obs.batting?.contact ?? 0,
        power: obs.batting?.power ?? 0,
      },
    });
  }

  // --- 検索結果 ---
  const filteredPool = searchMiddleSchoolers(middleSchoolPool, filters);
  const searchResults: ProspectSearchResultView[] = filteredPool.map((ms) => {
    const overall = computeMiddleSchoolOverall(ms);
    return {
      id: ms.id,
      lastName: ms.lastName,
      firstName: ms.firstName,
      grade: ms.middleSchoolGrade,
      gradeLabel: `中学${ms.middleSchoolGrade}年`,
      prefecture: ms.prefecture,
      middleSchoolName: ms.middleSchoolName,
      estimatedOverall: overall,
      qualityTier: overallToQualityTier(overall),
      isOnWatchList: scoutState.watchList.includes(ms.id),
      targetSchoolName: ms.targetSchoolId ? (schoolMap.get(ms.targetSchoolId) ?? ms.targetSchoolId) : null,
    };
  });

  return {
    watchList,
    scoutReports,
    budgetRemaining: scoutState.monthlyScoutBudget - scoutState.usedScoutThisMonth,
    budgetTotal: scoutState.monthlyScoutBudget,
    budgetUsed: scoutState.usedScoutThisMonth,
    searchResults,
  };
}
