/**
 * world-ticker — 世界の1日を進める統括関数
 *
 * 全高校・全中学生を同一カレンダーで進行させる。
 * 計算粒度は SimulationTier (full / standard / minimal) で分岐する。
 */

import type { RNG } from '../core/rng';
import type { DayResult, DayType, GameDate, PracticeMenuId } from '../types/calendar';
import type {
  WorldState, HighSchool, SimulationTier, MiddleSchoolPlayer, SeasonPhase,
} from './world-state';
import { getDayType, advanceDate } from '../calendar/game-calendar';
import { getAnnualSchedule, isInCamp } from '../calendar/schedule';
import { processDay } from '../calendar/day-processor';
import type { GameState } from '../types/game-state';
import { applyBatchGrowth } from '../growth/batch-growth';
import { applyBulkGrowth } from '../growth/bulk-growth';
import { processYearTransition } from './year-transition';
import { generateDailyNews } from './news/news-generator';
import {
  createTournamentBracket,
  simulateTournamentRound,
} from './tournament-bracket';
import type { TournamentBracket, TournamentMatch } from './tournament-bracket';
import { processPracticeGameDay } from './practice-game';
import type { PracticeGameRecord } from '../types/practice-game';

// ============================================================
// WorldDayResult
// ============================================================

export interface WorldDayResult {
  date: GameDate;
  /** 自校の日次結果（Phase 1 互換） */
  playerSchoolResult: DayResult;
  /** 大会の全試合結果（Phase 3.0b で実装） */
  // tournamentResults: TournamentDayResults | null;
  /** 自校の試合結果（Phase 4.1 以降で入力される。試合がない日は null） */
  playerMatchResult?: import('../match/types').MatchResult | null;
  /** 自校の試合の相手チーム名（試合がある日のみ） */
  playerMatchOpponent?: string | null;
  /** 自校が先攻(away)か後攻(home)か */
  playerMatchSide?: 'home' | 'away' | null;
  /**
   * イニング詳細（Phase 6 で追加）。
   * MatchResult があり、かつ詳細データが取れた場合のみ存在。
   * 自校の打席結果フロー・ハイライト生成に使用する。
   */
  playerMatchInnings?: import('../match/types').InningResult[] | null;
  /** 世界のニュース */
  worldNews: WorldNewsItem[];
  /** シーズンフェーズ変更 */
  seasonTransition: import('./world-state').SeasonPhase | null;
  /** 練習試合・紅白戦の結果（実施した日のみ設定） */
  practiceGameResult?: PracticeGameRecord | null;
}

export interface WorldNewsItem {
  type: 'tournament_result' | 'upset' | 'no_hitter' | 'record' | 'draft' | 'injury';
  headline: string;
  involvedSchoolIds: string[];
  involvedPlayerIds: string[];
  importance: 'high' | 'medium' | 'low';
}

// ============================================================
// Tier ごとの日次処理
// ============================================================

/**
 * Tier 1 (Full): 既存の processDay() をそのまま使う。
 * 自校専用。
 */
function advanceSchoolFull(
  school: HighSchool,
  menuId: PracticeMenuId,
  worldState: WorldState,
  rng: RNG,
): { school: HighSchool; dayResult: DayResult } {
  // HighSchool → GameState に変換して既存の processDay を呼ぶ
  const fakeGameState: GameState = {
    version: worldState.version,
    seed: worldState.seed,
    currentDate: worldState.currentDate,
    team: {
      id: school.id,
      name: school.name,
      prefecture: school.prefecture,
      reputation: school.reputation,
      players: school.players,
      lineup: school.lineup,
      facilities: school.facilities,
    },
    manager: worldState.manager,
    graduates: [],
    settings: worldState.settings,
  };

  const { nextState, dayResult } = processDay(fakeGameState, menuId, rng);

  const updatedSchool: HighSchool = {
    ...school,
    players: nextState.team.players,
    lineup: nextState.team.lineup,
    reputation: nextState.team.reputation,
    _summary: null, // invalidate cache
  };

  return { school: updatedSchool, dayResult };
}

/**
 * Tier 2 (Standard): バッチ成長計算。
 * コンディション簡易判定 + 全能力一括成長。
 */
function advanceSchoolStandard(
  school: HighSchool,
  _dayType: DayType,
  seasonMultiplier: number,
  currentYear: number,
  rng: RNG,
): HighSchool {
  const updatedPlayers = school.players.map((player) =>
    applyBatchGrowth(player, currentYear, school.coachStyle.practiceEmphasis, seasonMultiplier, rng.derive(player.id))
  );

  return { ...school, players: updatedPlayers, _summary: null };
}

/**
 * Tier 3 (Minimal): 週次バッチ成長。
 * 7日分をまとめて1回で計算する。日曜日のみ実行。
 */
function advanceSchoolMinimal(
  school: HighSchool,
  _dayType: DayType,
  dayOfWeek: number,
  seasonMultiplier: number,
  currentYear: number,
  rng: RNG,
): HighSchool {
  // 日曜日（dayOfWeek === 0）のみ週次バッチ処理
  if (dayOfWeek !== 0) {
    return school;
  }

  const updatedPlayers = applyBulkGrowth(
    school.players,
    currentYear,
    school.coachStyle.practiceEmphasis,
    seasonMultiplier,
    rng,
  );

  return { ...school, players: updatedPlayers, _summary: null };
}

/**
 * 中学生の日次成長（Tier 3 相当：日曜のみ週次バッチ）
 */
function advanceMiddleSchool(
  pool: MiddleSchoolPlayer[],
  dayOfWeek: number,
  seasonMultiplier: number,
  rng: RNG,
): MiddleSchoolPlayer[] {
  // 日曜日のみ成長処理
  if (dayOfWeek !== 0) {
    return pool;
  }

  return pool.map((ms) => {
    const msRng = rng.derive(ms.id);
    // 中学生学年に応じた成長倍率
    const gradeMultiplier = ms.middleSchoolGrade === 1 ? 0.8 : ms.middleSchoolGrade === 2 ? 1.0 : 1.2;
    const weeklyGain = 0.3 * gradeMultiplier * seasonMultiplier; // 基本値

    function addGain(v: number, max: number): number {
      const gain = weeklyGain * (0.7 + msRng.next() * 0.6);
      return Math.max(1, Math.min(max, v + gain));
    }

    const newStats = {
      base: {
        stamina:     addGain(ms.currentStats.base.stamina,     50),
        speed:       addGain(ms.currentStats.base.speed,       50),
        armStrength: addGain(ms.currentStats.base.armStrength, 50),
        fielding:    addGain(ms.currentStats.base.fielding,    50),
        focus:       addGain(ms.currentStats.base.focus,       50),
        mental:      addGain(ms.currentStats.base.mental,      50),
      },
      batting: {
        contact:   addGain(ms.currentStats.batting.contact,   50),
        power:     addGain(ms.currentStats.batting.power,     50),
        eye:       addGain(ms.currentStats.batting.eye,       50),
        technique: addGain(ms.currentStats.batting.technique, 50),
      },
      pitching: null,
    };

    return { ...ms, currentStats: newStats };
  });
}

// ============================================================
// 曜日計算ヘルパー
// ============================================================

/**
 * GameDate から曜日を計算する（簡易版）。
 * 0=日曜, 1=月曜, ..., 6=土曜。
 * ゲーム内年度は Year 1 の 4月1日が月曜日と仮定。
 */
function getDayOfWeek(date: GameDate): number {
  // 4/1 を day 0 として、年度開始からの経過日数で曜日を計算
  const monthDays = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let totalDays = 0;
  for (let y = 1; y < date.year; y++) totalDays += 365;
  for (let m = 1; m < date.month; m++) totalDays += monthDays[m];
  totalDays += date.day - 1;
  // Year 1, Apr 1 = Monday (1)
  return (totalDays + 1) % 7;
}

// ============================================================
// シーズンフェーズ遷移
// ============================================================

/**
 * 日付からシーズンフェーズを決定する。
 *
 * 遷移ルール（その日付がどのフェーズに属するかを返す）:
 *  - 4/1〜7/9:   spring_practice
 *  - 7/10〜7/30: summer_tournament
 *  - 7/31〜9/14: post_summer
 *  - 9/15〜10/14: autumn_tournament
 *  - 10/15〜1/31: off_season
 *  - 2/1〜3/31: pre_season
 */
export function computeSeasonPhase(date: GameDate): SeasonPhase {
  const { month, day } = date;

  // 4月1日〜7月9日: 春季練習
  if (month >= 4 && month <= 6) return 'spring_practice';
  if (month === 7 && day < 10) return 'spring_practice';

  // 7月10日〜7月30日: 夏大会
  if (month === 7 && day >= 10 && day <= 30) return 'summer_tournament';

  // 7月31日〜9月14日: 夏以降練習
  if (month === 7 && day >= 31) return 'post_summer';
  if (month === 8) return 'post_summer';
  if (month === 9 && day < 15) return 'post_summer';

  // 9月15日〜10月14日: 秋大会
  if (month === 9 && day >= 15) return 'autumn_tournament';
  if (month === 10 && day < 15) return 'autumn_tournament';

  // 10月15日〜1月31日: オフシーズン
  if (month === 10 && day >= 15) return 'off_season';
  if (month === 11) return 'off_season';
  if (month === 12) return 'off_season';
  if (month === 1) return 'off_season';

  // 2月1日〜3月31日: プレシーズン
  if (month === 2) return 'pre_season';
  if (month === 3) return 'pre_season';

  // フォールバック
  return 'spring_practice';
}

// ============================================================
// トーナメントヘルパー
// ============================================================

/**
 * トーナメントラウンドから自校の試合を見つける。
 * Phase 5.5: inningScores, totalInnings, mvpPlayerId も返すよう拡張。
 */
function findPlayerMatchInRound(
  bracket: TournamentBracket,
  roundNumber: number,
  playerSchoolId: string,
): {
  opponent: string | null;
  side: 'home' | 'away' | null;
  playerWon: boolean;
  homeScore: number | null;
  awayScore: number | null;
  inningScores: TournamentMatch['inningScores'];
  totalInnings: number | null;
  mvpPlayerId: string | null;
} | null {
  const round = bracket.rounds.find((r) => r.roundNumber === roundNumber);
  if (!round) return null;

  for (const match of round.matches) {
    if (match.homeSchoolId === playerSchoolId) {
      return {
        opponent: match.awaySchoolId,
        side: 'home',
        playerWon: match.winnerId === playerSchoolId,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        inningScores: match.inningScores,
        totalInnings: match.totalInnings,
        mvpPlayerId: match.mvpPlayerId,
      };
    }
    if (match.awaySchoolId === playerSchoolId) {
      return {
        opponent: match.homeSchoolId,
        side: 'away',
        playerWon: match.winnerId === playerSchoolId,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        inningScores: match.inningScores,
        totalInnings: match.totalInnings,
        mvpPlayerId: match.mvpPlayerId,
      };
    }
  }
  return null;
}

/**
 * 日付から今日のトーナメントラウンド番号を返す。
 * 大会は数日おきに1ラウンドずつ進行する（6ラウンド合計）。
 * 夏大会: 7/10〜7/30 の期間で6ラウンドを分散
 * 秋大会: 9/15〜10/14 の期間で6ラウンドを分散
 *
 * @returns ラウンド番号 (1〜6)、試合のない日は 0
 */
function getTodayRound(date: GameDate, tournamentType: 'summer' | 'autumn'): number {
  if (tournamentType === 'summer') {
    // 7/10〜7/30 = 21日間 (index 0〜20)
    if (date.month !== 7 || date.day < 10 || date.day >= 31) return 0;
    const dayIdx = date.day - 10; // 0-indexed
    // ラウンドを均等配置: 0,3,7,11,15,18 の日にラウンド1〜6
    const schedule: Record<number, number> = { 0: 1, 3: 2, 7: 3, 11: 4, 15: 5, 18: 6 };
    return schedule[dayIdx] ?? 0;
  } else {
    // 秋大会: 9/15〜10/14 = 30日間
    // 9/15 = idx 0, 9/30 = idx 15, 10/1 = idx 16, 10/14 = idx 29
    let dayIdx = -1;
    if (date.month === 9 && date.day >= 15) {
      dayIdx = date.day - 15; // 9/15=0 ... 9/30=15
    } else if (date.month === 10 && date.day <= 14) {
      dayIdx = 16 + (date.day - 1); // 10/1=16 ... 10/14=29
    }
    if (dayIdx < 0) return 0;
    // ラウンドを均等配置
    const schedule: Record<number, number> = { 0: 1, 4: 2, 9: 3, 14: 4, 20: 5, 25: 6 };
    return schedule[dayIdx] ?? 0;
  }
}

// ============================================================
// メイン: 世界の1日を進める
// ============================================================

/**
 * 世界全体の1日を進行させる。
 *
 * 処理順序:
 * 1. 全高校の日次処理（Tier ごとに分岐）
 * 2. 中学生の成長処理
 * 3. 大会の進行（今日が大会日ならラウンドを進める）
 * 4. ニュース生成
 * 5. 日付進行
 * 6. シーズンフェーズを新日付に基づいて更新
 * 7. 大会の新規作成（新日付が大会開始日なら）
 * 8. 年度替わり（3/31 → 4/1）
 */
export function advanceWorldDay(
  world: WorldState,
  playerMenuId: PracticeMenuId,
  rng: RNG,
): { nextWorld: WorldState; result: WorldDayResult } {
  const date = world.currentDate;
  const schedule = getAnnualSchedule();
  const dayType = getDayType(date, schedule);
  const seasonMultiplier = isInCamp(date) ? 1.5 : 1.0;
  const dayOfWeek = getDayOfWeek(date);
  const currentYear = date.year;

  let playerSchoolResult: DayResult | null = null;
  const updatedSchools: HighSchool[] = [];
  const worldNews: WorldNewsItem[] = [];

  // --- 全高校の日次処理 ---
  for (const school of world.schools) {
    const schoolRng = rng.derive(`school:${school.id}`);

    switch (school.simulationTier) {
      case 'full': {
        const { school: updated, dayResult } = advanceSchoolFull(
          school,
          playerMenuId,
          world,
          schoolRng,
        );
        updatedSchools.push(updated);
        if (school.id === world.playerSchoolId) {
          playerSchoolResult = dayResult;
        }
        break;
      }
      case 'standard': {
        updatedSchools.push(
          advanceSchoolStandard(school, dayType, seasonMultiplier, currentYear, schoolRng),
        );
        break;
      }
      case 'minimal': {
        updatedSchools.push(
          advanceSchoolMinimal(school, dayType, dayOfWeek, seasonMultiplier, currentYear, schoolRng),
        );
        break;
      }
    }
  }

  // --- 中学生の成長処理 ---
  const updatedMiddleSchool = advanceMiddleSchool(
    world.middleSchoolPool,
    dayOfWeek,
    seasonMultiplier,
    rng.derive('middle-school'),
  );

  // --- 今日の大会進行（今日のラウンドを消化） ---
  let activeTournament = world.activeTournament ?? null;
  let tournamentHistory = world.tournamentHistory ?? [];
  let playerMatchResult: import('../match/types').MatchResult | null | undefined = undefined;
  let playerMatchOpponent: string | null | undefined = undefined;
  let playerMatchSide: 'home' | 'away' | null | undefined = undefined;

  // 大会が進行中なら今日のラウンドを消化する
  if (activeTournament && !activeTournament.isCompleted) {
    const tournamentType: 'summer' | 'autumn' =
      activeTournament.type === 'summer' ? 'summer' : 'autumn';
    const todayRound = getTodayRound(date, tournamentType);

    if (todayRound > 0) {
      activeTournament = simulateTournamentRound(
        activeTournament,
        todayRound,
        updatedSchools,
        rng.derive(`tournament-round-${todayRound}`),
      );

      // 自校の試合を探す
      const playerMatch = findPlayerMatchInRound(
        activeTournament,
        todayRound,
        world.playerSchoolId,
      );

      if (playerMatch && playerMatch.side !== null) {
        const opponentId = playerMatch.opponent;
        const opponentSchool = opponentId
          ? updatedSchools.find((s) => s.id === opponentId) ?? null
          : null;
        playerMatchOpponent = opponentSchool?.name ?? opponentId ?? null;
        playerMatchSide = playerMatch.side;

        const homeScore = playerMatch.homeScore ?? 0;
        const awayScore = playerMatch.awayScore ?? 0;
        const isHome = playerMatch.side === 'home';
        const playerScore = isHome ? homeScore : awayScore;
        const opponentScore = isHome ? awayScore : homeScore;
        const winner: 'home' | 'away' = playerMatch.playerWon
          ? (isHome ? 'home' : 'away')
          : (isHome ? 'away' : 'home');

        playerMatchResult = {
          winner,
          finalScore: { home: homeScore, away: awayScore },
          // Phase 5.5: quickGame の実シミュ結果から直接取得（distributeScore 廃止）
          inningScores: playerMatch.inningScores ?? { home: [], away: [] },
          totalInnings: playerMatch.totalInnings ?? 9,
          mvpPlayerId: playerMatch.mvpPlayerId ?? null,
          batterStats: [],
          pitcherStats: [],
        };

        const playerSchoolName = world.schools.find(s => s.id === world.playerSchoolId)?.name ?? '自校';
        if (playerScore > opponentScore) {
          worldNews.push({
            type: 'tournament_result',
            headline: `${playerSchoolName} が ${playerMatchOpponent ?? '対戦校'} に ${playerScore}対${opponentScore} で勝利！`,
            involvedSchoolIds: [world.playerSchoolId, ...(opponentId ? [opponentId] : [])],
            involvedPlayerIds: [],
            importance: 'high',
          });
        } else {
          worldNews.push({
            type: 'tournament_result',
            headline: `${playerSchoolName} が ${playerMatchOpponent ?? '対戦校'} に ${playerScore}対${opponentScore} で敗れた`,
            involvedSchoolIds: [world.playerSchoolId, ...(opponentId ? [opponentId] : [])],
            involvedPlayerIds: [],
            importance: 'high',
          });
        }
      }
    }

    // 大会終了チェック
    if (activeTournament.isCompleted) {
      tournamentHistory = [...tournamentHistory, activeTournament].slice(-10);

      // 自校の最高到達ラウンドを更新
      let playerBestRound = 0;
      for (const round of activeTournament.rounds) {
        for (const match of round.matches) {
          if (
            (match.homeSchoolId === world.playerSchoolId || match.awaySchoolId === world.playerSchoolId) &&
            match.winnerId === world.playerSchoolId
          ) {
            if (round.roundNumber > playerBestRound) {
              playerBestRound = round.roundNumber;
            }
          }
        }
      }

      const champion = activeTournament.champion
        ? (updatedSchools.find((s) => s.id === activeTournament!.champion)?.name ?? activeTournament.champion)
        : null;
      if (champion) {
        worldNews.push({
          type: 'tournament_result',
          headline: `【大会結果】${activeTournament.type === 'summer' ? '夏季' : '秋季'}大会優勝: ${champion}`,
          involvedSchoolIds: activeTournament.champion ? [activeTournament.champion] : [],
          involvedPlayerIds: [],
          importance: 'high',
        });
      }

      activeTournament = null;
    }
  }

  // --- ニュース生成 ---
  const generatedNews = generateDailyNews(world, rng.derive('news-gen'));
  worldNews.push(...generatedNews);

  // --- 日付進行 ---
  const newDate = advanceDate(date);

  // --- 新日付に基づいてシーズンフェーズを決定 ---
  const oldPhase = world.seasonState.phase;
  let newPhase = computeSeasonPhase(newDate);

  // 大会が終了したのに calendar phase が tournament 表示になるのを防ぐ
  // （例: 夏大会が7/28に終わっても computeSeasonPhase({7,29}) は 'summer_tournament' を返す）
  if (!activeTournament && (newPhase === 'summer_tournament' || newPhase === 'autumn_tournament')) {
    newPhase = newPhase === 'summer_tournament' ? 'post_summer' : 'off_season';
  }

  // 大会が進行中なら大会フェーズを維持
  if (activeTournament && !activeTournament.isCompleted) {
    newPhase = activeTournament.type === 'summer' ? 'summer_tournament' : 'autumn_tournament';
  }

  const seasonTransition: SeasonPhase | null = newPhase !== oldPhase ? newPhase : null;

  let updatedSeasonState = {
    ...world.seasonState,
    phase: newPhase,
    currentTournamentId: activeTournament?.id ?? null,
  };

  // 大会終了後に yearResults を更新
  if (!activeTournament && world.activeTournament?.isCompleted === false) {
    // 大会が今日完了した場合（activeTournament が null になった）
    const completedTournament = tournamentHistory[tournamentHistory.length - 1];
    if (completedTournament) {
      let playerBestRound = 0;
      for (const round of completedTournament.rounds) {
        for (const match of round.matches) {
          if (
            (match.homeSchoolId === world.playerSchoolId || match.awaySchoolId === world.playerSchoolId) &&
            match.winnerId === world.playerSchoolId
          ) {
            if (round.roundNumber > playerBestRound) playerBestRound = round.roundNumber;
          }
        }
      }
      const yearResults = { ...updatedSeasonState.yearResults };
      if (completedTournament.type === 'summer') {
        yearResults.summerBestRound = playerBestRound;
      } else if (completedTournament.type === 'autumn') {
        yearResults.autumnBestRound = playerBestRound;
      }
      updatedSeasonState = { ...updatedSeasonState, yearResults };
    }
  }

  // --- WorldState 更新 ---
  let nextWorld: WorldState = {
    ...world,
    currentDate: newDate,
    schools: updatedSchools,
    middleSchoolPool: updatedMiddleSchool,
    seasonState: updatedSeasonState,
    activeTournament,
    tournamentHistory,
  };

  // --- 新日付が大会開始日なら大会を自動作成 ---
  // 夏大会: 7/10 開始
  if (newDate.month === 7 && newDate.day === 10 && !nextWorld.activeTournament) {
    const id = `tournament-summer-${newDate.year}`;
    const newTournament = createTournamentBracket(
      id,
      'summer',
      newDate.year,
      nextWorld.schools,
      rng.derive('create-summer-tournament'),
    );
    nextWorld = {
      ...nextWorld,
      activeTournament: newTournament,
      seasonState: {
        ...nextWorld.seasonState,
        phase: 'summer_tournament',
        currentTournamentId: newTournament.id,
      },
    };
    // 遷移を記録
    if (oldPhase !== 'summer_tournament') {
      // seasonTransition は上で計算済み（summer_tournament になるはず）
    }
  }

  // 秋大会: 9/15 開始
  if (newDate.month === 9 && newDate.day === 15 && !nextWorld.activeTournament) {
    const id = `tournament-autumn-${newDate.year}`;
    const newTournament = createTournamentBracket(
      id,
      'autumn',
      newDate.year,
      nextWorld.schools,
      rng.derive('create-autumn-tournament'),
    );
    nextWorld = {
      ...nextWorld,
      activeTournament: newTournament,
      seasonState: {
        ...nextWorld.seasonState,
        phase: 'autumn_tournament',
        currentTournamentId: newTournament.id,
      },
    };
  }

  // --- 年度替わり（3/31 から 4/1 への遷移） ---
  if (newDate.month === 4 && newDate.day === 1) {
    nextWorld = processYearTransition(nextWorld, rng.derive('year-transition'));
    // 年度替わり後は spring_practice に
    nextWorld = {
      ...nextWorld,
      seasonState: {
        ...nextWorld.seasonState,
        phase: 'spring_practice',
        currentTournamentId: null,
      },
    };
  }

  // --- 練習試合・紅白戦の処理（新日付の予約分） ---
  // nextWorld.currentDate === newDate なのでそのまま渡す。
  let practiceGameResult: PracticeGameRecord | null = null;
  const practiceOutcome = processPracticeGameDay(
    nextWorld,
    rng.derive('practice-game'),
  );
  if (practiceOutcome) {
    practiceGameResult = practiceOutcome.record;
    // 練習試合後の学校状態（疲労反映済み）と履歴を nextWorld に適用
    nextWorld = {
      ...nextWorld,
      schools: practiceOutcome.nextWorld.schools,
      scheduledPracticeGames: practiceOutcome.nextWorld.scheduledPracticeGames,
      practiceGameHistory: practiceOutcome.nextWorld.practiceGameHistory,
    };
    // ニュースに追加
    if (practiceOutcome.record.type === 'scrimmage') {
      const opponentName = practiceOutcome.record.opponentSchoolName ?? '相手校';
      const resultLabel =
        practiceOutcome.record.result === 'win' ? '勝利'
        : practiceOutcome.record.result === 'loss' ? '敗退'
        : '引き分け';
      const score = practiceOutcome.record.finalScore;
      worldNews.push({
        type: 'tournament_result',
        headline: `練習試合: ${opponentName} と ${score.player}対${score.opponent} で${resultLabel}`,
        involvedSchoolIds: [
          world.playerSchoolId,
          ...(practiceOutcome.record.opponentSchoolId ? [practiceOutcome.record.opponentSchoolId] : []),
        ],
        involvedPlayerIds: [],
        importance: 'low',
      });
    }
  }

  // fallback: 自校が full tier でない場合（通常ありえないが安全策）
  if (!playerSchoolResult) {
    playerSchoolResult = {
      date,
      dayType,
      practiceApplied: null,
      playerChanges: [],
      events: [],
      injuries: [],
      recovered: [],
    };
  }

  // seasonTransition は nextWorld の phase と元の phase を比較
  const finalSeasonTransition: SeasonPhase | null =
    nextWorld.seasonState.phase !== oldPhase ? nextWorld.seasonState.phase : null;

  const result: WorldDayResult = {
    date,
    playerSchoolResult,
    worldNews,
    seasonTransition: finalSeasonTransition,
    ...(playerMatchResult !== undefined ? { playerMatchResult } : {}),
    ...(playerMatchOpponent !== undefined ? { playerMatchOpponent } : {}),
    ...(playerMatchSide !== undefined ? { playerMatchSide } : {}),
    ...(practiceGameResult !== null ? { practiceGameResult } : {}),
  };

  return { nextWorld, result };
}

// distributeScore は Phase 5.5 で廃止。quickGame の実イニングスコアを直接使用。
