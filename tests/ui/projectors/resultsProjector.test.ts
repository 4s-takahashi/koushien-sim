/**
 * tests/ui/projectors/resultsProjector.test.ts
 *
 * resultsProjector のユニットテスト。
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { generatePlayer } from '@/engine/player/generate';
import type { WorldState, HighSchool } from '@/engine/world/world-state';
import type { WorldDayResult } from '@/engine/world/world-ticker';
import type { MatchResult } from '@/engine/match/types';
import {
  createEmptyYearResults,
  createInitialSeasonState,
  createDefaultWeeklyPlan,
} from '@/engine/world/world-state';
import { projectResults } from '@/ui/projectors/resultsProjector';

// ============================================================
// テストヘルパー
// ============================================================

function makeTestWorld(): WorldState {
  const rng = createRNG('results-projector-test');
  const player = generatePlayer(rng.derive('p'), { enrollmentYear: 1, schoolReputation: 60 });

  const playerSchool: HighSchool = {
    id: 'ps',
    name: '桜葉高校',
    prefecture: '新潟',
    reputation: 65,
    players: [player],
    lineup: null,
    facilities: { ground: 5, bullpen: 5, battingCage: 5, gym: 5 },
    simulationTier: 'full',
    coachStyle: { offenseType: 'balanced', defenseType: 'balanced', practiceEmphasis: 'balanced', aggressiveness: 50 },
    yearResults: createEmptyYearResults(),
    _summary: null,
  };

  return {
    version: '0.3.0',
    seed: 'test',
    currentDate: { year: 1, month: 7, day: 10 },
    playerSchoolId: 'ps',
    manager: { name: '監督', yearsActive: 0, fame: 0, totalWins: 0, totalLosses: 0, koshienAppearances: 0, koshienWins: 0 },
    settings: { autoAdvanceSpeed: 'normal', showDetailedGrowth: false },
    weeklyPlan: createDefaultWeeklyPlan(),
    prefecture: '新潟',
    schools: [playerSchool],
    middleSchoolPool: [],
    personRegistry: { entries: new Map() },
    seasonState: createInitialSeasonState(),
    scoutState: {
      watchList: [],
      scoutReports: new Map(),
      recruitAttempts: new Map(),
      monthlyScoutBudget: 4,
      usedScoutThisMonth: 0,
    },
  };
}

function makeMatchResult(winner: 'home' | 'away' | 'draw', homeScore: number, awayScore: number): MatchResult {
  return {
    winner,
    finalScore: { home: homeScore, away: awayScore },
    inningScores: {
      home: [0, 0, 1, 0, 0, 0, 2, 0, 0].slice(0, homeScore > 0 ? 9 : 9),
      away: [0, 1, 0, 0, 0, 0, 0, 0, 0].slice(0, 9),
    },
    totalInnings: 9,
    mvpPlayerId: null,
    batterStats: [],
    pitcherStats: [],
  };
}

function makeDayResult(
  matchResult: MatchResult | null,
  playerMatchSide: 'home' | 'away' = 'home',
  opponent = '対戦相手高校',
): WorldDayResult {
  return {
    date: { year: 1, month: 7, day: 10 },
    playerSchoolResult: {
      date: { year: 1, month: 7, day: 10 },
      dayType: 'match',
      practiceApplied: null,
      playerChanges: [],
      events: [],
      injuries: [],
      recovered: [],
    },
    playerMatchResult: matchResult,
    playerMatchOpponent: opponent,
    playerMatchSide,
    worldNews: [],
    seasonTransition: null,
  };
}

// ============================================================
// テスト
// ============================================================

describe('projectResults', () => {
  it('試合結果なしの場合は空のリストを返す', () => {
    const world = makeTestWorld();
    const view = projectResults(world, []);

    expect(view.recentResults).toHaveLength(0);
    expect(view.seasonRecord.wins).toBe(0);
    expect(view.seasonRecord.losses).toBe(0);
    expect(view.seasonRecord.draws).toBe(0);
  });

  it('playerMatchResult が null の DayResult はスキップされる', () => {
    const world = makeTestWorld();
    const dayResult = makeDayResult(null);
    const view = projectResults(world, [dayResult]);

    expect(view.recentResults).toHaveLength(0);
  });

  it('自校 home で勝利 → result = 勝利', () => {
    const world = makeTestWorld();
    const mr = makeMatchResult('home', 3, 1);
    const dayResult = makeDayResult(mr, 'home', 'A高校');
    const view = projectResults(world, [dayResult]);

    expect(view.recentResults).toHaveLength(1);
    expect(view.recentResults[0].result).toBe('勝利');
    expect(view.seasonRecord.wins).toBe(1);
  });

  it('自校 home で敗北 → result = 敗北', () => {
    const world = makeTestWorld();
    const mr = makeMatchResult('away', 1, 3);
    const dayResult = makeDayResult(mr, 'home', 'B高校');
    const view = projectResults(world, [dayResult]);

    expect(view.recentResults[0].result).toBe('敗北');
    expect(view.seasonRecord.losses).toBe(1);
  });

  it('自校 away で勝利 → result = 勝利', () => {
    const world = makeTestWorld();
    const mr = makeMatchResult('away', 1, 3);
    const dayResult = makeDayResult(mr, 'away', 'C高校');
    const view = projectResults(world, [dayResult]);

    expect(view.recentResults[0].result).toBe('勝利');
    expect(view.seasonRecord.wins).toBe(1);
  });

  it('引き分け → result = 引き分け', () => {
    const world = makeTestWorld();
    const mr = makeMatchResult('draw', 0, 0);
    const dayResult = makeDayResult(mr, 'home', 'D高校');
    const view = projectResults(world, [dayResult]);

    expect(view.recentResults[0].result).toBe('引き分け');
    expect(view.seasonRecord.draws).toBe(1);
  });

  it('学校名が正しくセットされる（home の場合）', () => {
    const world = makeTestWorld();
    const mr = makeMatchResult('home', 3, 1);
    const dayResult = makeDayResult(mr, 'home', 'X高校');
    const view = projectResults(world, [dayResult]);

    expect(view.recentResults[0].homeSchool).toBe('桜葉高校');
    expect(view.recentResults[0].awaySchool).toBe('X高校');
  });

  it('学校名が正しくセットされる（away の場合）', () => {
    const world = makeTestWorld();
    const mr = makeMatchResult('away', 1, 3);
    const dayResult = makeDayResult(mr, 'away', 'Y高校');
    const view = projectResults(world, [dayResult]);

    // away = 相手が home、自校が away
    expect(view.recentResults[0].homeSchool).toBe('Y高校');
    expect(view.recentResults[0].awaySchool).toBe('桜葉高校');
  });

  it('イニング別スコアが含まれる', () => {
    const world = makeTestWorld();
    const mr = makeMatchResult('home', 3, 1);
    const dayResult = makeDayResult(mr, 'home', 'Z高校');
    const view = projectResults(world, [dayResult]);

    const result = view.recentResults[0];
    expect(result.inningScores).toBeDefined();
    expect(result.inningScores!.totalInnings).toBe(9);
    expect(result.inningScores!.homeInnings).toHaveLength(9);
    expect(result.inningScores!.awayInnings).toHaveLength(9);
  });

  it('複数試合の勝敗が正しく集計される', () => {
    const world = makeTestWorld();
    const win = makeDayResult(makeMatchResult('home', 3, 1), 'home', 'W高校');
    const loss = makeDayResult(makeMatchResult('away', 1, 3), 'home', 'L高校');
    const draw = makeDayResult(makeMatchResult('draw', 0, 0), 'home', 'D高校');
    const view = projectResults(world, [win, loss, draw]);

    expect(view.seasonRecord.wins).toBe(1);
    expect(view.seasonRecord.losses).toBe(1);
    expect(view.seasonRecord.draws).toBe(1);
    expect(view.recentResults).toHaveLength(3);
  });
});
