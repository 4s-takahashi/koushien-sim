/**
 * practiceProjector — 練習試合・紅白戦画面の ViewState 生成
 *
 * (WorldState) => PracticeViewState
 */

import type { WorldState, SeasonPhase } from '../../engine/world/world-state';
import type {
  PracticeViewState,
  PracticeScheduleItemView,
  PracticeHistoryItemView,
  OpponentCandidateView,
} from './view-state-types';
import { suggestOpponents } from '../../engine/world/practice-game';

const TOURNAMENT_PHASES: SeasonPhase[] = [
  'summer_tournament',
  'autumn_tournament',
  'koshien',
];

function formatDate(d: { year: number; month: number; day: number }): string {
  return `${d.month}月${d.day}日`;
}

function resultLabel(r: 'win' | 'loss' | 'draw'): string {
  return r === 'win' ? '○ 勝利' : r === 'loss' ? '● 敗戦' : '△ 引き分け';
}

function typeLabel(t: 'scrimmage' | 'intra_squad'): string {
  return t === 'scrimmage' ? '練習試合' : '紅白戦';
}

export function projectPracticeView(world: WorldState): PracticeViewState {
  const phase = world.seasonState.phase;
  const canSchedule = !TOURNAMENT_PHASES.includes(phase);

  // 予約済み練習試合
  const scheduled = (world.scheduledPracticeGames ?? [])
    .slice()
    .sort((a, b) => {
      const da = a.scheduledDate;
      const db = b.scheduledDate;
      if (da.year !== db.year) return da.year - db.year;
      if (da.month !== db.month) return da.month - db.month;
      return da.day - db.day;
    });

  const scheduleItems: PracticeScheduleItemView[] = scheduled.map((s) => {
    const opponentName = s.opponentSchoolId
      ? (world.schools.find((sc) => sc.id === s.opponentSchoolId)?.name ?? s.opponentSchoolId)
      : '自校（紅白戦）';
    return {
      id: s.id,
      type: s.type,
      typeLabel: typeLabel(s.type),
      dateLabel: formatDate(s.scheduledDate),
      opponentName,
      opponentSchoolId: s.opponentSchoolId,
    };
  });

  // 実施履歴（新しい順、最大20件）
  const history = (world.practiceGameHistory ?? []).slice().reverse().slice(0, 20);
  const historyItems: PracticeHistoryItemView[] = history.map((h) => ({
    id: h.id,
    type: h.type,
    typeLabel: typeLabel(h.type),
    dateLabel: formatDate(h.date),
    opponentName: h.opponentSchoolName ?? '自校（紅白戦）',
    result: h.result,
    resultLabel: resultLabel(h.result),
    scoreLabel: `${h.finalScore.player} - ${h.finalScore.opponent}`,
    highlights: h.highlights,
    mvpPlayerName: h.mvpPlayerId
      ? (world.schools
          .flatMap((s) => s.players)
          .find((p) => p.id === h.mvpPlayerId)?.lastName ?? null)
      : null,
  }));

  // 対戦相手候補
  const opponents = canSchedule ? suggestOpponents(world, 5) : [];
  const opponentCandidates: OpponentCandidateView[] = opponents.map((s) => ({
    schoolId: s.id,
    schoolName: s.name,
    prefecture: s.prefecture,
    reputation: s.reputation,
    reputationDiff: s.reputation - (world.schools.find((sc) => sc.id === world.playerSchoolId)?.reputation ?? 50),
  }));

  return {
    canSchedule,
    cannotScheduleReason: canSchedule ? null : '大会期間中は練習試合を予約できません',
    scheduleItems,
    historyItems,
    opponentCandidates,
    scheduledCount: scheduleItems.length,
    maxScheduled: 3,
    totalWins: history.filter((h) => h.result === 'win').length,
    totalLosses: history.filter((h) => h.result === 'loss').length,
    totalDraws: history.filter((h) => h.result === 'draw').length,
  };
}
