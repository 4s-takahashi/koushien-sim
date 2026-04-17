/**
 * practice-game — 練習試合・紅白戦エンジン
 *
 * 大会期間外に実施できる練習試合（scrimmage）と紅白戦（intra_squad）を提供する。
 * 試合シミュレーションには quick-game エンジンを使用する。
 */

import type { RNG } from '../core/rng';
import type { GameDate } from '../types/calendar';
import type { WorldState, HighSchool, SeasonPhase } from '../world/world-state';
import type {
  ScheduledPracticeGame,
  PracticeGameRecord,
  PracticeGameType,
  ScheduleError,
} from '../types/practice-game';
import { quickGame } from '../match/quick-game';
import type { MatchTeam, MatchConfig } from '../match/types';

// ============================================================
// 定数
// ============================================================

/** 練習試合を予約できる最大先日数 */
const MAX_DAYS_AHEAD = 7;
/** 同時予約上限 */
const MAX_SCHEDULED = 3;

/** 大会期間中のフェーズ（練習試合不可） */
const TOURNAMENT_PHASES: SeasonPhase[] = [
  'summer_tournament',
  'autumn_tournament',
  'koshien',
];

// ============================================================
// 日付ユーティリティ
// ============================================================

/** GameDate を数値（比較用）に変換。year * 10000 + month * 100 + day */
function dateToNum(d: GameDate): number {
  return d.year * 10_000 + d.month * 100 + d.day;
}

/** GameDate の差分（b - a）を日数で返す（同月内のみ正確） */
function dateDiffDays(a: GameDate, b: GameDate): number {
  // 月跨ぎも対応するため一旦 JS Date に変換
  const da = new Date(2000 + a.year, a.month - 1, a.day);
  const db = new Date(2000 + b.year, b.month - 1, b.day);
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/** 日付が同じか */
function dateSame(a: GameDate, b: GameDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

// ============================================================
// MatchTeam 構築ユーティリティ
// ============================================================

/**
 * HighSchool から quick-game 用の MatchTeam を構築する。
 * フィールドポジションはシンプルなデフォルト割り当て。
 */
function buildMatchTeam(school: HighSchool): MatchTeam {
  const players = school.players.slice(0, 18);
  const matchPlayers = players.map((p) => ({
    player: p,
    pitchCountInGame: 0,
    stamina: 100,
    confidence: p.stats.base.mental,
    isWarmedUp: false,
  }));

  const lineup = school.lineup;
  let battingOrder: string[];
  if (lineup && lineup.battingOrder && lineup.battingOrder.length >= 9) {
    battingOrder = lineup.battingOrder.slice(0, 9);
  } else {
    battingOrder = players.slice(0, 9).map((p) => p.id);
  }

  // 投手を探す（ポジションが'pitcher'またはpitchingStatsを持つ最初の選手）
  const pitcherPlayer =
    players.find((p) => p.position === 'pitcher' && p.stats.pitching !== null) ??
    players.find((p) => p.stats.pitching !== null) ??
    players[0];

  const currentPitcherId = pitcherPlayer?.id ?? players[0]?.id ?? '';

  const fieldPositions = new Map<string, import('../types/player').Position>();
  const defaultPositions: import('../types/player').Position[] = [
    'pitcher', 'catcher', 'first', 'second',
    'third', 'shortstop', 'left', 'center', 'right',
  ];
  battingOrder.forEach((pid, i) => {
    if (i < defaultPositions.length) {
      fieldPositions.set(pid, defaultPositions[i]);
    }
  });

  const benchPlayerIds = players
    .filter((p) => !battingOrder.includes(p.id))
    .map((p) => p.id);

  return {
    id: school.id,
    name: school.name,
    players: matchPlayers,
    battingOrder,
    fieldPositions,
    currentPitcherId,
    benchPlayerIds,
    usedPlayerIds: new Set(),
  };
}

/**
 * 自校の選手を前半・後半に 2 分割して紅白戦用の 2 チームを構築する。
 * 返り値: [homeTeam, awayTeam]
 */
function buildIntraSquadTeams(school: HighSchool): [MatchTeam, MatchTeam] {
  const players = school.players.slice(0, 18);
  const half = Math.ceil(players.length / 2);

  const buildHalf = (subset: typeof players, suffix: string): MatchTeam => {
    const matchPlayers = subset.map((p) => ({
      player: p,
      pitchCountInGame: 0,
      stamina: 100,
      confidence: p.stats.base.mental,
      isWarmedUp: false,
    }));

    const battingOrder = subset.slice(0, 9).map((p) => p.id);
    const pitcher =
      subset.find((p) => p.position === 'pitcher' && p.stats.pitching !== null) ??
      subset.find((p) => p.stats.pitching !== null) ??
      subset[0];

    const fieldPositions = new Map<string, import('../types/player').Position>();
    const defaultPositions: import('../types/player').Position[] = [
      'pitcher', 'catcher', 'first', 'second',
      'third', 'shortstop', 'left', 'center', 'right',
    ];
    battingOrder.forEach((pid, i) => {
      if (i < defaultPositions.length) fieldPositions.set(pid, defaultPositions[i]);
    });

    return {
      id: `${school.id}-${suffix}`,
      name: `${school.name}（${suffix === 'white' ? '白組' : '紅組'}）`,
      players: matchPlayers,
      battingOrder,
      fieldPositions,
      currentPitcherId: pitcher?.id ?? subset[0]?.id ?? '',
      benchPlayerIds: subset.slice(9).map((p) => p.id),
      usedPlayerIds: new Set(),
    };
  };

  return [
    buildHalf(players.slice(0, half), 'red'),
    buildHalf(players.slice(half), 'white'),
  ];
}

// ============================================================
// スケジュール API
// ============================================================

/**
 * 練習試合をスケジュールに追加する。
 *
 * @returns 成功なら更新後の WorldState、失敗なら ScheduleError
 */
export function schedulePracticeMatch(
  world: WorldState,
  opponentSchoolId: string,
  date: GameDate,
): WorldState | ScheduleError {
  const error = validateSchedule(world, date, 'scrimmage');
  if (error) return error;

  const opponent = world.schools.find((s) => s.id === opponentSchoolId);
  if (!opponent) return 'opponent_not_found';

  const id = `practice-scrimmage-${date.year}-${date.month}-${date.day}`;
  const entry: ScheduledPracticeGame = {
    id,
    type: 'scrimmage',
    scheduledDate: date,
    opponentSchoolId,
  };

  return {
    ...world,
    scheduledPracticeGames: [...(world.scheduledPracticeGames ?? []), entry],
  };
}

/**
 * 紅白戦をスケジュールに追加する。
 *
 * @returns 成功なら更新後の WorldState、失敗なら ScheduleError
 */
export function scheduleIntraSquad(
  world: WorldState,
  date: GameDate,
): WorldState | ScheduleError {
  const error = validateSchedule(world, date, 'intra_squad');
  if (error) return error;

  const id = `practice-intra-${date.year}-${date.month}-${date.day}`;
  const entry: ScheduledPracticeGame = {
    id,
    type: 'intra_squad',
    scheduledDate: date,
    opponentSchoolId: null,
  };

  return {
    ...world,
    scheduledPracticeGames: [...(world.scheduledPracticeGames ?? []), entry],
  };
}

/**
 * 予約済みの練習試合をキャンセルする。
 * 指定 ID が存在しない場合はそのまま返す。
 */
export function cancelPracticeGame(
  world: WorldState,
  scheduleId: string,
): WorldState {
  return {
    ...world,
    scheduledPracticeGames: (world.scheduledPracticeGames ?? []).filter(
      (g) => g.id !== scheduleId,
    ),
  };
}

// ============================================================
// バリデーション
// ============================================================

function validateSchedule(
  world: WorldState,
  date: GameDate,
  type: PracticeGameType,
): ScheduleError | null {
  const today = world.currentDate;
  const phase = world.seasonState.phase;

  // 大会期間中は不可
  if (TOURNAMENT_PHASES.includes(phase)) return 'tournament_active';

  // 過去日チェック
  const diff = dateDiffDays(today, date);
  if (diff < 1) return 'date_past';

  // 7日先より遠い
  if (diff > MAX_DAYS_AHEAD) return 'date_too_far';

  const scheduled = world.scheduledPracticeGames ?? [];

  // 予約上限
  if (scheduled.length >= MAX_SCHEDULED) return 'max_scheduled';

  // 同日予約チェック
  const hasSameDay = scheduled.some((g) => dateSame(g.scheduledDate, date));
  if (hasSameDay) return 'date_conflict';

  void type; // 将来の種別別バリデーション用

  return null;
}

// ============================================================
// 試合実行
// ============================================================

/**
 * 予約済みの練習試合を実行して `PracticeGameRecord` を返す。
 * world-ticker から1日進行時に呼び出される。
 */
export function executePracticeGame(
  scheduled: ScheduledPracticeGame,
  playerSchool: HighSchool,
  opponentSchool: HighSchool | null,
  rng: RNG,
): PracticeGameRecord {
  const config: MatchConfig = {
    innings: 7,        // 練習試合は7イニング
    maxExtras: 1,
    useDH: false,
    isTournament: false,
    isKoshien: false,
  };

  if (scheduled.type === 'intra_squad') {
    return executeIntraSquad(scheduled, playerSchool, config, rng);
  } else {
    return executeScrimmage(scheduled, playerSchool, opponentSchool!, config, rng);
  }
}

function executeScrimmage(
  scheduled: ScheduledPracticeGame,
  playerSchool: HighSchool,
  opponent: HighSchool,
  config: MatchConfig,
  rng: RNG,
): PracticeGameRecord {
  const homeTeam = buildMatchTeam(playerSchool);
  const awayTeam = buildMatchTeam(opponent);

  const gameResult = quickGame(homeTeam, awayTeam, config, rng);

  const playerScore = gameResult.score.home;
  const opponentScore = gameResult.score.away;
  const result: 'win' | 'loss' | 'draw' =
    playerScore > opponentScore ? 'win' : playerScore < opponentScore ? 'loss' : 'draw';

  const fatigueDelta = Math.round(8 + rng.next() * 7); // 8〜15

  return {
    id: scheduled.id,
    type: 'scrimmage',
    date: scheduled.scheduledDate,
    opponentSchoolId: opponent.id,
    opponentSchoolName: opponent.name,
    result,
    finalScore: { player: playerScore, opponent: opponentScore },
    highlights: gameResult.highlights.slice(0, 5),
    mvpPlayerId: gameResult.mvpId,
    fatigueDelta,
  };
}

function executeIntraSquad(
  scheduled: ScheduledPracticeGame,
  playerSchool: HighSchool,
  config: MatchConfig,
  rng: RNG,
): PracticeGameRecord {
  const [homeTeam, awayTeam] = buildIntraSquadTeams(playerSchool);
  const gameResult = quickGame(homeTeam, awayTeam, config, rng);

  const homeScore = gameResult.score.home;
  const awayScore = gameResult.score.away;
  const result: 'win' | 'loss' | 'draw' =
    homeScore > awayScore ? 'win' : homeScore < awayScore ? 'loss' : 'draw';

  const fatigueDelta = Math.round(3 + rng.next() * 5); // 3〜8

  return {
    id: scheduled.id,
    type: 'intra_squad',
    date: scheduled.scheduledDate,
    opponentSchoolId: null,
    opponentSchoolName: null,
    result,
    finalScore: { player: homeScore, opponent: awayScore },
    highlights: gameResult.highlights.slice(0, 5),
    mvpPlayerId: gameResult.mvpId,
    fatigueDelta,
  };
}

// ============================================================
// 相手校提案
// ============================================================

/**
 * 練習試合の対戦相手候補を提案する。
 *
 * 選定基準:
 * - 同一都道府県
 * - 評判差 ±30 以内
 * - 自校以外
 * - 最大 `maxCount` 校（デフォルト: 5）
 */
export function suggestOpponents(
  world: WorldState,
  maxCount: number = 5,
): HighSchool[] {
  const playerSchool = world.schools.find((s) => s.id === world.playerSchoolId);
  if (!playerSchool) return [];

  const { prefecture, reputation } = playerSchool;
  const REPUTATION_RANGE = 30;

  const candidates = world.schools.filter(
    (s) =>
      s.id !== world.playerSchoolId &&
      s.prefecture === prefecture &&
      Math.abs(s.reputation - reputation) <= REPUTATION_RANGE,
  );

  // 評判差が小さい順にソート
  candidates.sort(
    (a, b) =>
      Math.abs(a.reputation - reputation) - Math.abs(b.reputation - reputation),
  );

  return candidates.slice(0, maxCount);
}

// ============================================================
// world-ticker から呼び出すヘルパー
// ============================================================

/**
 * 今日の日付に予約済みの練習試合があれば実行し、その結果と更新後の WorldState を返す。
 *
 * @returns `{ record, nextWorld }` or `null`（今日試合なし）
 */
export function processPracticeGameDay(
  world: WorldState,
  rng: RNG,
): { record: PracticeGameRecord; nextWorld: WorldState } | null {
  const today = world.currentDate;
  const scheduled = world.scheduledPracticeGames ?? [];

  const todayGame = scheduled.find((g) => dateSame(g.scheduledDate, today));
  if (!todayGame) return null;

  // 大会期間中は練習試合をスキップ（安全弁）
  if (TOURNAMENT_PHASES.includes(world.seasonState.phase)) {
    return null;
  }

  const playerSchool = world.schools.find((s) => s.id === world.playerSchoolId);
  if (!playerSchool) return null;

  const opponentSchool = todayGame.opponentSchoolId
    ? (world.schools.find((s) => s.id === todayGame.opponentSchoolId) ?? null)
    : null;

  const record = executePracticeGame(todayGame, playerSchool, opponentSchool, rng);

  // 疲労を実際に自校選手に反映（簡易: 全員に均等に加算）
  const updatedSchools = world.schools.map((s) => {
    if (s.id !== world.playerSchoolId) return s;
    const fatiguePerPlayer = Math.round(record.fatigueDelta / Math.max(1, s.players.length));
    const updatedPlayers = s.players.map((p) => ({
      ...p,
      stats: {
        ...p.stats,
        base: {
          ...p.stats.base,
          stamina: Math.max(0, p.stats.base.stamina - fatiguePerPlayer),
        },
      },
    }));
    return { ...s, players: updatedPlayers, _summary: null as null };
  });

  const remainingScheduled = scheduled.filter((g) => g.id !== todayGame.id);
  const updatedHistory = [...(world.practiceGameHistory ?? []), record].slice(-30);

  const nextWorld: WorldState = {
    ...world,
    schools: updatedSchools,
    scheduledPracticeGames: remainingScheduled,
    practiceGameHistory: updatedHistory,
  };

  return { record, nextWorld };
}

// re-export for convenience
export { dateToNum, dateDiffDays, dateSame };
