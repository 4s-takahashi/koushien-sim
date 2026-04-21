/**
 * homeProjector — ホーム画面用 ViewState 生成
 *
 * (worldState: WorldState, recentNews: WorldNewsItem[]) => HomeViewState
 */

import type { WorldState } from '../../engine/world/world-state';
import type { WorldNewsItem } from '../../engine/world/world-ticker';
import type { Player } from '../../engine/types/player';
import type { Lineup } from '../../engine/types/team';
import type { TournamentBracket } from '../../engine/world/tournament-bracket';
import type {
  HomeViewState, HomeTeamSummary, HomeNewsItem, HomeScheduleItem,
  HomeTodayTask, HomeFeaturedPlayer, DateView, AbilityRank,
  HomeTournamentInfo, HomeTournamentStartInfo,
  TeamConditionSummary, InjuredPlayerBrief,
} from './view-state-types';
import { getMotivation } from '../../engine/growth/motivation';
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

// ============================================================
// 大会情報ヘルパー
// ============================================================

/**
 * 夏大会・秋大会の試合日スケジュール（dayIndex → roundNumber）
 */
const SUMMER_SCHEDULE: Record<number, number> = { 0: 1, 3: 2, 7: 3, 11: 4, 15: 5, 18: 6 };
const AUTUMN_SCHEDULE: Record<number, number> = { 0: 1, 4: 2, 9: 3, 14: 4, 20: 5, 25: 6 };

/**
 * 現在の日付から今日のラウンド番号を返す（試合のない日は 0）
 */
function getTodayRound(month: number, day: number, type: 'summer' | 'autumn'): number {
  if (type === 'summer') {
    if (month !== 7 || day < 10 || day >= 31) return 0;
    return SUMMER_SCHEDULE[day - 10] ?? 0;
  } else {
    let dayIdx = -1;
    if (month === 9 && day >= 15) {
      dayIdx = day - 15;
    } else if (month === 10 && day <= 14) {
      dayIdx = 16 + (day - 1);
    }
    if (dayIdx < 0) return 0;
    return AUTUMN_SCHEDULE[dayIdx] ?? 0;
  }
}

/**
 * 次の試合日（月/日）を返す
 * 現在の dayIndex より後の最初の試合日を探す
 */
function getNextMatchDate(
  month: number,
  day: number,
  type: 'summer' | 'autumn',
): { month: number; day: number; daysAway: number } | null {
  if (type === 'summer') {
    // 7/10〜7/30 の期間
    const currentDayIdx = (month === 7 && day >= 10 && day <= 30) ? day - 10 : -1;
    for (const [idx, _round] of Object.entries(SUMMER_SCHEDULE)) {
      const idxNum = Number(idx);
      if (idxNum > currentDayIdx) {
        const matchDay = 10 + idxNum;
        const daysAway = matchDay - (month === 7 ? day : 0);
        return { month: 7, day: matchDay, daysAway: Math.max(1, daysAway) };
      }
    }
    return null;
  } else {
    let currentDayIdx = -1;
    if (month === 9 && day >= 15) {
      currentDayIdx = day - 15;
    } else if (month === 10 && day <= 14) {
      currentDayIdx = 16 + (day - 1);
    }
    for (const [idx, _round] of Object.entries(AUTUMN_SCHEDULE)) {
      const idxNum = Number(idx);
      if (idxNum > currentDayIdx) {
        let matchMonth: number;
        let matchDay: number;
        if (idxNum <= 15) {
          matchMonth = 9;
          matchDay = 15 + idxNum;
        } else {
          matchMonth = 10;
          matchDay = idxNum - 16 + 1;
        }
        // 残り日数計算
        let daysAway = 0;
        if (month === 9 && matchMonth === 9) {
          daysAway = matchDay - day;
        } else if (month === 9 && matchMonth === 10) {
          daysAway = (30 - day) + matchDay;
        } else if (month === 10 && matchMonth === 10) {
          daysAway = matchDay - day;
        }
        return { month: matchMonth, day: matchDay, daysAway: Math.max(1, daysAway) };
      }
    }
    return null;
  }
}

/**
 * 自校がトーナメントに残っているか確認する
 */
function isPlayerStillInTournament(bracket: TournamentBracket, playerSchoolId: string): boolean {
  // 決勝ラウンドまで確認し、一度でも負けていたら敗退
  for (const round of bracket.rounds) {
    for (const match of round.matches) {
      if (
        (match.homeSchoolId === playerSchoolId || match.awaySchoolId === playerSchoolId) &&
        match.winnerId !== null &&
        match.winnerId !== playerSchoolId
      ) {
        return false; // 負けた試合がある
      }
    }
  }
  return true;
}

/**
 * 次ラウンドの対戦相手名を取得する（確定していない場合は undefined）
 */
function getNextOpponent(
  bracket: TournamentBracket,
  playerSchoolId: string,
  nextRound: number,
  schools: WorldState['schools'],
): string | undefined {
  const round = bracket.rounds.find((r) => r.roundNumber === nextRound);
  if (!round) return undefined;

  for (const match of round.matches) {
    if (match.homeSchoolId === playerSchoolId) {
      if (match.awaySchoolId) {
        return schools.find((s) => s.id === match.awaySchoolId)?.name;
      }
    }
    if (match.awaySchoolId === playerSchoolId) {
      if (match.homeSchoolId) {
        return schools.find((s) => s.id === match.homeSchoolId)?.name;
      }
    }
  }
  return undefined;
}

/**
 * ラウンド番号から「○回戦」形式の文字列を返す
 */
function getRoundLabel(roundNumber: number): string {
  const labels: Record<number, string> = {
    1: '1回戦',
    2: '2回戦',
    3: '3回戦（ベスト16）',
    4: '準々決勝（ベスト8）',
    5: '準決勝',
    6: '決勝',
  };
  return labels[roundNumber] ?? `${roundNumber}回戦`;
}

/**
 * 大会情報を構築する
 */
function buildTournamentInfo(
  worldState: WorldState,
  month: number,
  day: number,
): HomeTournamentInfo | undefined {
  const bracket = worldState.activeTournament;
  if (!bracket || bracket.isCompleted) return undefined;

  const type: 'summer' | 'autumn' = bracket.type === 'summer' ? 'summer' : 'autumn';
  const typeName = type === 'summer' ? '夏の大会' : '秋の大会';

  const todayRound = getTodayRound(month, day, type);
  const isMatchDay = todayRound > 0;

  const playerEliminated = !isPlayerStillInTournament(bracket, worldState.playerSchoolId);

  // 今日の試合結果は WorldDayResult から取得するため、ここでは計算しない
  // （projector は WorldState のみを受け取る純粋関数のため）

  // 次の試合日を求める（今日が試合日なら次は次ラウンド）
  const searchFromDay = isMatchDay ? day + 1 : day;
  const nextMatchInfo = getNextMatchDate(month, searchFromDay > 30 ? searchFromDay : day, type);

  // 現在進行中のラウンド（試合が始まっているが未完了のラウンド）を見つける
  let currentRoundNum = 1;
  for (const round of bracket.rounds) {
    const hasIncomplete = round.matches.some(
      (m) => m.homeSchoolId !== null && m.awaySchoolId !== null && m.winnerId === null
    );
    const hasCompleted = round.matches.some((m) => m.winnerId !== null);
    if (hasIncomplete || (!hasCompleted && round.roundNumber === 1)) {
      currentRoundNum = round.roundNumber;
      break;
    }
    if (hasCompleted) {
      currentRoundNum = Math.min(round.roundNumber + 1, 6);
    }
  }

  const nextOpponent = playerEliminated
    ? undefined
    : getNextOpponent(bracket, worldState.playerSchoolId, isMatchDay ? todayRound : currentRoundNum, worldState.schools);

  let nextMatchDateStr: string | undefined;
  let nextMatchDaysAway: number | undefined;
  if (nextMatchInfo && !playerEliminated) {
    nextMatchDateStr = `${nextMatchInfo.month}月${nextMatchInfo.day}日`;
    nextMatchDaysAway = nextMatchInfo.daysAway;
  }

  return {
    isActive: true,
    typeName,
    currentRound: getRoundLabel(currentRoundNum),
    isMatchDay,
    nextMatchDate: nextMatchDateStr,
    nextMatchDaysAway,
    nextOpponent,
    playerEliminated,
  };
}

/**
 * 大会開始前の情報を構築する
 */
function buildTournamentStartInfo(month: number, day: number): HomeTournamentStartInfo | undefined {
  // 夏大会まで（4月〜7月9日）
  if ((month >= 4 && month <= 6) || (month === 7 && day < 10)) {
    // 7/10 まで何日
    let daysAway = 0;
    if (month === 7) {
      daysAway = 10 - day;
    } else {
      // 月をまたぐ日数計算
      const monthDays = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      daysAway = monthDays[month] - day;
      for (let m = month + 1; m < 7; m++) daysAway += monthDays[m];
      daysAway += 10; // 7/10
    }
    return { name: '夏の大会', date: '7月10日', daysAway: Math.max(0, daysAway) };
  }

  // 秋大会まで（7月31日〜9月14日）
  if ((month === 7 && day >= 31) || month === 8 || (month === 9 && day < 15)) {
    let daysAway = 0;
    if (month === 9) {
      daysAway = 15 - day;
    } else if (month === 8) {
      daysAway = 31 - day + 15;
    } else {
      // 7/31〜
      daysAway = 31 - day + 31 + 15;
    }
    return { name: '秋の大会', date: '9月15日', daysAway: Math.max(0, daysAway) };
  }

  return undefined;
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
 * チーム状態サマリーを構築する (Phase 11.5-A)
 */
export function buildTeamConditionSummary(
  players: import('../../engine/types/player').Player[],
): TeamConditionSummary {
  let goodCount = 0;
  let cautionCount = 0;
  let dangerCount = 0;
  let motivationSum = 0;

  const injuredPlayers: InjuredPlayerBrief[] = [];
  const warningPlayers: InjuredPlayerBrief[] = [];

  for (const p of players) {
    const fatigue = p.condition?.fatigue ?? 0;
    const injury = p.condition?.injury ?? null;
    motivationSum += getMotivation(p);

    if (injury !== null) {
      dangerCount++;
      injuredPlayers.push({
        id: p.id,
        name: `${p.lastName}${p.firstName}`,
        statusText: `${injury.type} 残${injury.remainingDays}日`,
        severity: 'injury',
      });
    } else if (fatigue >= 50) {
      cautionCount++;
      warningPlayers.push({
        id: p.id,
        name: `${p.lastName}${p.firstName}`,
        statusText: `疲労 ${Math.round(fatigue)}`,
        severity: 'caution',
      });
    } else {
      goodCount++;
    }
  }

  const avgMotivation = players.length > 0
    ? Math.round(motivationSum / players.length)
    : 0;

  return {
    goodCount,
    cautionCount,
    dangerCount,
    avgMotivation,
    injuredPlayers,
    warningPlayers,
  };
}

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

  // チーム状況 (Issue #3 2026-04-19)
  const teamPulse = buildTeamPulse(players);

  // チーム状態サマリー (Phase 11.5-A)
  const teamConditionSummary = buildTeamConditionSummary(players);

  // 最近のOB (Phase 11-A4 2026-04-19)
  const recentGraduates = buildRecentGraduates(worldState);

  // 大会情報
  const tournament = buildTournamentInfo(worldState, currentDate.month, currentDate.day);
  const tournamentStart = !isInTournamentSeason
    ? buildTournamentStartInfo(currentDate.month, currentDate.day)
    : undefined;

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
    teamPulse,
    teamConditionSummary,
    recentGraduates,
    isTournamentDay,
    isInTournamentSeason,
    tournament,
    tournamentStart,
  };
}

/** Issue #3: チーム状況サマリー */
function buildTeamPulse(players: import('../../engine/types/player').Player[]): import('./view-state-types').HomeTeamPulse {
  const injured = players
    .filter((p) => p.condition.injury !== null)
    .map((p) => ({
      id: p.id,
      name: `${p.lastName}${p.firstName}`,
      note: p.condition.injury
        ? `${p.condition.injury.type} 残${p.condition.injury.remainingDays}日`
        : '',
    }));

  const warning = players
    .filter((p) => p.condition.injury === null && p.condition.fatigue >= 50)
    .sort((a, b) => b.condition.fatigue - a.condition.fatigue)
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      name: `${p.lastName}${p.firstName}`,
      note: `疲労 ${Math.round(p.condition.fatigue)}`,
    }));

  const hot = players
    .filter((p) => p.condition.mood === 'excellent' || p.condition.mood === 'good')
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      name: `${p.lastName}${p.firstName}`,
      note: p.condition.mood === 'excellent' ? '絶好調！' : '好調',
    }));

  const restingCount = players.filter((p) => p.restOverride != null).length;

  return { injured, warning, hot, restingCount };
}

/** Phase 11-A4: 最近のOB (直近3年以内の卒業生から最大3名) */
function buildRecentGraduates(
  worldState: import('../../engine/world/world-state').WorldState,
): import('./view-state-types').HomeRecentGraduate[] {
  const currentYear = worldState.currentDate.year;
  const registry = worldState.personRegistry;
  if (!registry?.entries) return [];

  const result: import('./view-state-types').HomeRecentGraduate[] = [];
  for (const entry of registry.entries.values()) {
    const summary = entry.graduateSummary;
    if (!summary) continue;
    if (summary.schoolId !== worldState.playerSchoolId) continue;
    const yearsAgo = currentYear - summary.graduationYear;
    if (yearsAgo < 0 || yearsAgo > 3) continue; // 直近3年以内

    const careerPathType = summary.careerPath.type;
    const careerPathLabel =
      careerPathType === 'pro' ? 'プロ入り'
      : careerPathType === 'university' ? '大学進学'
      : careerPathType === 'corporate' ? '社会人'
      : '引退';

    result.push({
      name: summary.name,
      graduationYear: summary.graduationYear,
      careerPath: careerPathType,
      careerPathLabel,
      bestAchievement: summary.achievements[0] ?? null,
      finalOverall: summary.finalOverall,
    });
  }

  // 総合力で上位3名
  return result
    .sort((a, b) => b.finalOverall - a.finalOverall)
    .slice(0, 3);
}
