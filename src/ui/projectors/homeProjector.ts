/**
 * homeProjector — ホーム画面用 ViewState 生成
 *
 * (worldState: WorldState, recentNews: WorldNewsItem[]) => HomeViewState
 */

import type { WorldState } from '../../engine/world/world-state';
import type { WorldNewsItem } from '../../engine/world/world-ticker';
import type { Player } from '../../engine/types/player';
import type { Lineup } from '../../engine/types/team';
import type {
  HomeViewState, HomeTeamSummary, HomeNewsItem, HomeScheduleItem,
  HomeTodayTask, HomeFeaturedPlayer, DateView, AbilityRank,
} from './view-state-types';
import { computePlayerOverall } from '../../engine/world/career/draft-system';

// ============================================================
// 内部ヘルパー
// ============================================================

export function makeDateView(year: number, month: number, day: number): DateView {
  const DOW = ['日', '月', '火', '水', '木', '金', '土'];
  // 簡易曜日計算（Year 1, 4/1 = 月曜）
  const monthDays = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let totalDays = 0;
  for (let y = 1; y < year; y++) totalDays += 365;
  for (let m = 1; m < month; m++) totalDays += monthDays[m];
  totalDays += day - 1;
  const dow = DOW[(totalDays + 1) % 7];

  return {
    year,
    month,
    day,
    displayString: `Year ${year} - ${month}月${day}日`,
    japaneseDisplay: `${year}年目 ${month}月${day}日（${dow}）`,
  };
}

function getSeasonPhaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    spring_practice: '春季練習',
    summer_tournament: '夏の大会',
    koshien: '甲子園',
    post_summer: '夏以降練習',
    autumn_tournament: '秋の大会',
    off_season: 'オフシーズン',
    pre_season: '始動',
  };
  return labels[phase] ?? phase;
}

function findAce(players: Player[]): Player | null {
  const pitchers = players.filter((p) => p.position === 'pitcher');
  if (pitchers.length === 0) return null;
  return pitchers.reduce((best, p) =>
    computePlayerOverall(p) > computePlayerOverall(best) ? p : best
  );
}

function findAnchor(players: Player[], lineup: Lineup | null): Player | null {
  if (lineup && lineup.battingOrder.length >= 4) {
    const id4 = lineup.battingOrder[3]; // 4番打者（0-indexed）
    if (id4) {
      const p = players.find((pl) => pl.id === id4);
      if (p) return p;
    }
  }
  // フォールバック: 最高総合力の野手
  const hitters = players.filter((p) => p.position !== 'pitcher');
  if (hitters.length === 0) return null;
  return hitters.reduce((best, p) =>
    computePlayerOverall(p) > computePlayerOverall(best) ? p : best
  );
}

function computeTeamOverall(players: Player[]): number {
  if (players.length === 0) return 0;
  const sum = players.reduce((acc, p) => acc + computePlayerOverall(p), 0);
  return Math.round(sum / players.length);
}

function getSchoolName(worldState: WorldState, schoolId: string): string {
  return worldState.schools.find((s) => s.id === schoolId)?.name ?? '不明';
}

function buildUpcomingSchedule(month: number): HomeScheduleItem[] {
  const schedule: HomeScheduleItem[] = [];

  if (month < 4)  schedule.push({ description: '入学式', monthDay: '4月1日' });
  if (month < 7)  schedule.push({ description: '夏の大会（地方予選）', monthDay: '7月上旬' });
  if (month < 8)  schedule.push({ description: '甲子園（全国大会）', monthDay: '8月6日〜' });
  if (month < 9)  schedule.push({ description: '秋の大会', monthDay: '9月上旬' });
  if (month < 10) schedule.push({ description: 'プロ野球ドラフト会議', monthDay: '10月20日' });
  if (month < 3)  schedule.push({ description: '卒業式・年度替わり', monthDay: '3月31日' });

  return schedule.slice(0, 3);
}

/**
 * ニュース種別からアイコンを返す
 */
function getNewsIcon(type: string, headline: string): string {
  if (type === 'upset') return '🔥';
  if (type === 'draft') return '📋';
  if (type === 'record') {
    // OB活躍ニュースは headline に【OB情報】が含まれる
    if (headline.includes('OB')) return '🏆';
    return '📊';
  }
  if (type === 'tournament_result') {
    if (headline.includes('甲子園')) return '🏆';
    if (headline.includes('ドラフト')) return '📋';
    return '⚾';
  }
  if (type === 'injury') return '🏥';
  if (type === 'no_hitter') return '✨';
  // scout_prospect ニュースは upset で代替されているため headline で判定
  if (headline.includes('注目株') || headline.includes('超高校級')) return '⭐';
  return '📰';
}

/**
 * overallToAbilityRank
 */
function overallToRank(overall: number): AbilityRank {
  if (overall >= 75) return 'S';
  if (overall >= 60) return 'A';
  if (overall >= 45) return 'B';
  if (overall >= 30) return 'C';
  if (overall >= 15) return 'D';
  return 'E';
}

/**
 * 注目選手（調子良い or 能力伸びが顕著な上位 3 名）を取得する。
 * Phase 4.1 時点では疲労が低い＝調子が良い選手を「注目」として扱う。
 */
function buildFeaturedPlayers(players: Player[]): HomeFeaturedPlayer[] {
  if (players.length === 0) return [];

  // 各選手を overall + 低疲労ボーナスでスコアリング
  const scored = players.map((p) => {
    const overall = computePlayerOverall(p);
    const fatigueBonus = Math.max(0, 50 - (p.condition?.fatigue ?? 50));
    return { p, score: overall + fatigueBonus * 0.3 };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, 3).map(({ p }) => {
    const overall = computePlayerOverall(p);
    const fatigue = p.condition?.fatigue ?? 50;
    let reason = '総合力上位';
    if (fatigue < 20) reason = '絶好調';
    else if (fatigue < 35) reason = '好調';

    return {
      id: p.id,
      name: `${p.lastName}${p.firstName}`,
      overall,
      overallRank: overallToRank(overall),
      reason,
    };
  });
}

/**
 * 今日やることを返す
 */
function buildTodayTask(
  phase: string,
  scoutBudgetRemaining: number,
): HomeTodayTask {
  const inTournament = phase === 'summer_tournament' || phase === 'koshien' || phase === 'autumn_tournament';

  if (inTournament) {
    return {
      type: 'match',
      label: '試合に備えよう',
      detail: '大会シーズン中です。ベストコンディションで挑みましょう！',
    };
  }

  if (phase === 'off_season') {
    return {
      type: 'off',
      label: '休養日',
      detail: 'オフシーズンです。選手の回復を優先しましょう。',
    };
  }

  if (scoutBudgetRemaining > 0) {
    return {
      type: 'scout',
      label: 'スカウト活動を行おう',
      detail: `視察予算が ${scoutBudgetRemaining} 回残っています。中学生を視察しましょう。`,
    };
  }

  return {
    type: 'practice',
    label: '練習メニューを選ぼう',
    detail: '今日の練習メニューを選んで1日進行してください。',
  };
}

// ============================================================
// 公開 API
// ============================================================

/**
 * ホーム画面の ViewState を生成する。
 *
 * @param worldState  現在の WorldState
 * @param recentNews  直近のニュース（最新順）
 */
export function projectHome(
  worldState: WorldState,
  recentNews: WorldNewsItem[] = [],
): HomeViewState {
  const { currentDate, playerSchoolId, schools, seasonState, scoutState } = worldState;

  const playerSchool = schools.find((s) => s.id === playerSchoolId);
  const players = playerSchool?.players ?? [];
  const lineup = playerSchool?.lineup ?? null;

  const ace = findAce(players);
  const anchor = findAnchor(players, lineup);
  const teamOverall = computeTeamOverall(players);

  const team: HomeTeamSummary = {
    schoolName: playerSchool?.name ?? '不明',
    playerCount: players.length,
    acePlayerName: ace ? `${ace.lastName}${ace.firstName}` : null,
    aceOverall: ace ? computePlayerOverall(ace) : 0,
    anchorPlayerName: anchor ? `${anchor.lastName}${anchor.firstName}` : null,
    anchorOverall: anchor ? computePlayerOverall(anchor) : 0,
    teamOverall,
  };

  // ニュースを重要度順にソートして最大10件、HomeNewsItem に変換
  const sortedNews = [...recentNews].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.importance] - order[b.importance];
  });

  const newsItems: HomeNewsItem[] = sortedNews.slice(0, 10).map((item) => ({
    type: item.type,
    headline: item.headline,
    importance: item.importance,
    involvedSchoolNames: item.involvedSchoolIds.map((id) => getSchoolName(worldState, id)),
    icon: getNewsIcon(item.type, item.headline),
  }));

  // シーズンフラグ
  const phase = seasonState.phase;
  const isTournamentDay = phase === 'summer_tournament' || phase === 'koshien' || phase === 'autumn_tournament';
  const isInTournamentSeason = isTournamentDay;

  // 今日やること
  const scoutBudgetRemaining = scoutState.monthlyScoutBudget - scoutState.usedScoutThisMonth;
  const todayTask = buildTodayTask(phase, scoutBudgetRemaining);

  // 注目選手
  const featuredPlayers = buildFeaturedPlayers(players);

  return {
    date: makeDateView(currentDate.year, currentDate.month, currentDate.day),
    team,
    seasonPhase: phase,
    seasonPhaseLabel: getSeasonPhaseLabel(phase),
    recentNews: newsItems,
    upcomingSchedule: buildUpcomingSchedule(currentDate.month),
    scoutBudgetRemaining,
    scoutBudgetTotal: scoutState.monthlyScoutBudget,
    todayTask,
    featuredPlayers,
    isTournamentDay,
    isInTournamentSeason,
  };
}
