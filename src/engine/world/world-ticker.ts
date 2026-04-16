/**
 * world-ticker — 世界の1日を進める統括関数
 *
 * 全高校・全中学生を同一カレンダーで進行させる。
 * 計算粒度は SimulationTier (full / standard / minimal) で分岐する。
 */

import type { RNG } from '../core/rng';
import type { DayResult, DayType, GameDate, PracticeMenuId } from '../types/calendar';
import type { Player } from '../types/player';
import type {
  WorldState, HighSchool, SimulationTier, MiddleSchoolPlayer,
} from './world-state';
import { getDayType, advanceDate } from '../calendar/game-calendar';
import { getAnnualSchedule, isInCamp } from '../calendar/schedule';
import { processDay } from '../calendar/day-processor';
import type { GameState } from '../types/game-state';
import { applyBatchGrowth } from '../growth/batch-growth';
import { applyBulkGrowth } from '../growth/bulk-growth';
import { processYearTransition } from './year-transition';
import { generateDailyNews } from './news/news-generator';

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
// メイン: 世界の1日を進める
// ============================================================

/**
 * 世界全体の1日を進行させる。
 *
 * 1. 全高校の日次処理（Tier ごとに分岐）
 * 2. 中学生の成長処理
 * 3. 大会がある日は全試合実行（Phase 3.0b）
 * 4. 日付進行
 * 5. 年度替わり（3/31 → 4/1）
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

  // --- 世界ニュース生成 ---
  const generatedNews = generateDailyNews(world, rng.derive('news-gen'));
  worldNews.push(...generatedNews);

  // --- 日付進行 ---
  const newDate = advanceDate(date);

  // --- WorldState 更新 ---
  let nextWorld: WorldState = {
    ...world,
    currentDate: newDate,
    schools: updatedSchools,
    middleSchoolPool: updatedMiddleSchool,
  };

  // --- 年度替わり（3/31 から 4/1 への遷移） ---
  if (newDate.month === 4 && newDate.day === 1) {
    nextWorld = processYearTransition(nextWorld, rng.derive('year-transition'));
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

  const result: WorldDayResult = {
    date,
    playerSchoolResult,
    worldNews,
    seasonTransition: null,
  };

  return { nextWorld, result };
}
