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

// ============================================================
// WorldDayResult
// ============================================================

export interface WorldDayResult {
  date: GameDate;
  /** 自校の日次結果（Phase 1 互換） */
  playerSchoolResult: DayResult;
  /** 大会の全試合結果（Phase 3.0b で実装） */
  // tournamentResults: TournamentDayResults | null;
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
  dayType: DayType,
  seasonMultiplier: number,
  rng: RNG,
): HighSchool {
  // TODO Phase 3.0b: applyBatchGrowth() を実装
  // 現時点ではスケルトンのみ — 選手は変更なしで返す
  return { ...school, _summary: null };
}

/**
 * Tier 3 (Minimal): 週次バッチ成長。
 * 7日分をまとめて1回で計算する。大会日のみ個別処理。
 */
function advanceSchoolMinimal(
  school: HighSchool,
  dayType: DayType,
  dayOfWeek: number,
  seasonMultiplier: number,
  rng: RNG,
): HighSchool {
  // 日曜日（dayOfWeek === 0）のみ週次バッチ処理
  // TODO Phase 3.0b: applyBulkGrowth() を実装
  return { ...school, _summary: null };
}

/**
 * 中学生の日次成長（全中学生を一括処理）。
 */
function advanceMiddleSchool(
  pool: MiddleSchoolPlayer[],
  rng: RNG,
): MiddleSchoolPlayer[] {
  // TODO Phase 3.5: 中学生の成長処理
  return pool;
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
          advanceSchoolStandard(school, dayType, seasonMultiplier, schoolRng),
        );
        break;
      }
      case 'minimal': {
        updatedSchools.push(
          advanceSchoolMinimal(school, dayType, dayOfWeek, seasonMultiplier, schoolRng),
        );
        break;
      }
    }
  }

  // --- 中学生の成長処理 ---
  const updatedMiddleSchool = advanceMiddleSchool(
    world.middleSchoolPool,
    rng.derive('middle-school'),
  );

  // --- 日付進行 ---
  const newDate = advanceDate(date);

  // --- WorldState 更新 ---
  const nextWorld: WorldState = {
    ...world,
    currentDate: newDate,
    schools: updatedSchools,
    middleSchoolPool: updatedMiddleSchool,
  };

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
