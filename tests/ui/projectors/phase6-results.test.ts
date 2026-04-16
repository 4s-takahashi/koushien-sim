/**
 * Phase 6 — resultsProjector 試合表示強化テスト
 *
 * - playerMatchInnings データが存在する場合のフロー/ハイライト生成
 * - InningResult からの打席フロー抽出テスト
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { projectResults } from '@/ui/projectors/resultsProjector';
import { createWorldState } from '@/engine/world/create-world';
import { generatePlayer } from '@/engine/player/generate';
import type { WorldDayResult } from '@/engine/world/world-ticker';
import type { InningResult, AtBatResult } from '@/engine/match/types';
import type { GameDate, DayType } from '@/engine/types/calendar';

// ============================================================
// テスト用ヘルパー
// ============================================================

function createTestWorld() {
  const rng = createRNG('results-phase6-test');
  const players = Array.from({ length: 15 }, (_, i) =>
    generatePlayer(rng.derive(`p${i}`), { enrollmentYear: 1, schoolReputation: 60 })
  );

  const team = {
    id: 'player-school',
    name: '自校高校',
    prefecture: '新潟',
    reputation: 60,
    players,
    lineup: null,
    facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 } as const,
  };

  return createWorldState(team, {
    name: '監督',
    yearsActive: 0, fame: 10, totalWins: 0, totalLosses: 0,
    koshienAppearances: 0, koshienWins: 0,
  }, '新潟', 'test', rng);
}

function makeDate(year = 1, month = 7, day = 10): GameDate {
  return { year, month, day };
}

function makeAtBat(batterId: string, pitcherId: string, outcomeType: string, rbiCount = 0): AtBatResult {
  return {
    batterId,
    pitcherId,
    pitches: [],
    finalCount: { balls: 0, strikes: 0 },
    outcome: { type: outcomeType } as AtBatResult['outcome'],
    rbiCount,
    runnersBefore: { first: null, second: null, third: null },
    runnersAfter: { first: null, second: null, third: null },
  };
}

function makeInningResult(
  inningNumber: number,
  half: 'top' | 'bottom',
  atBats: AtBatResult[],
  runsScored = 0,
): InningResult {
  return {
    inningNumber,
    half,
    atBats,
    runsScored,
    outsRecorded: 3,
    endingBaseState: { first: null, second: null, third: null },
  };
}

function makeDayResult(
  world: ReturnType<typeof createTestWorld>,
  innings: InningResult[],
  homeScore: number,
  awayScore: number,
  side: 'home' | 'away',
): WorldDayResult {
  return {
    date: makeDate(),
    playerSchoolResult: {
      date: makeDate(),
      dayType: 'tournament_day' as DayType,
      practiceApplied: null,
      playerChanges: [],
      events: [],
      injuries: [],
      recovered: [],
    },
    playerMatchResult: {
      winner: homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : 'draw',
      finalScore: { home: homeScore, away: awayScore },
      inningScores: {
        home: innings.filter((i) => i.half === 'bottom').map((i) => i.runsScored),
        away: innings.filter((i) => i.half === 'top').map((i) => i.runsScored),
      },
      totalInnings: 9,
      mvpPlayerId: null,
      batterStats: [],
      pitcherStats: [],
    },
    playerMatchOpponent: '対戦相手高校',
    playerMatchSide: side,
    playerMatchInnings: innings,
    worldNews: [],
    seasonTransition: null,
  };
}

// ============================================================
// テスト
// ============================================================

describe('resultsProjector Phase 6 強化', () => {
  it('playerMatchInnings があれば打席フローが生成される', () => {
    const world = createTestWorld();
    const playerSchool = world.schools.find((s) => s.id === world.playerSchoolId)!;
    const pitcher = playerSchool.players.find((p) => p.stats.pitching !== null)
      ?? playerSchool.players[0];
    const batter = playerSchool.players.find((p) => p !== pitcher) ?? playerSchool.players[1];

    const innings: InningResult[] = [
      makeInningResult(1, 'bottom', [
        makeAtBat(batter.id, pitcher.id, 'single', 0),
        makeAtBat(batter.id, pitcher.id, 'home_run', 2),
      ], 2),
      makeInningResult(1, 'top', [
        makeAtBat(pitcher.id, batter.id, 'strikeout', 0),
      ], 0),
    ];

    const dayResult = makeDayResult(world, innings, 2, 0, 'home');
    const view = projectResults(world, [dayResult]);

    expect(view.recentResults).toHaveLength(1);
    const result = view.recentResults[0];
    expect(result.atBatFlow).toBeDefined();
    expect(result.atBatFlow!.length).toBeGreaterThan(0);
  });

  it('home_run の打席がハイライトに含まれる', () => {
    const world = createTestWorld();
    const playerSchool = world.schools.find((s) => s.id === world.playerSchoolId)!;
    const pitcher = playerSchool.players[0];
    const batter = playerSchool.players[1];

    const innings: InningResult[] = [
      makeInningResult(3, 'bottom', [
        makeAtBat(batter.id, pitcher.id, 'home_run', 1),
      ], 1),
    ];

    const dayResult = makeDayResult(world, innings, 1, 0, 'home');
    const view = projectResults(world, [dayResult]);

    const result = view.recentResults[0];
    expect(result.highlights).toBeDefined();
    const hrHighlight = result.highlights!.find((h) => h.kind === 'homerun');
    expect(hrHighlight).toBeDefined();
    expect(hrHighlight!.icon).toBe('💥');
  });

  it('strikeout がハイライトに含まれる', () => {
    const world = createTestWorld();
    const playerSchool = world.schools.find((s) => s.id === world.playerSchoolId)!;
    const pitcher = playerSchool.players[0];
    const batter = playerSchool.players[1];

    const innings: InningResult[] = [
      makeInningResult(2, 'top', [
        makeAtBat(batter.id, pitcher.id, 'strikeout', 0),
        makeAtBat(pitcher.id, batter.id, 'strikeout', 0),
        makeAtBat(batter.id, pitcher.id, 'strikeout', 0),
      ], 0),
    ];

    const dayResult = makeDayResult(world, innings, 3, 0, 'home');
    const view = projectResults(world, [dayResult]);
    const result = view.recentResults[0];

    expect(result.highlights).toBeDefined();
    const kHighlights = result.highlights!.filter((h) => h.kind === 'strikeout');
    expect(kHighlights.length).toBeGreaterThan(0);
    expect(kHighlights[0].icon).toBe('🔥');
  });

  it('playerMatchInnings が空でも試合結果は表示される', () => {
    const world = createTestWorld();

    const dayResult = makeDayResult(world, [], 3, 1, 'home');
    const view = projectResults(world, [dayResult]);

    expect(view.recentResults).toHaveLength(1);
    expect(view.recentResults[0].result).toBe('勝利');
  });

  it('打席フローのスコア推移が正確', () => {
    const world = createTestWorld();
    const playerSchool = world.schools.find((s) => s.id === world.playerSchoolId)!;
    const pitcher = playerSchool.players[0];
    const batter = playerSchool.players[1];

    // 3回表 相手が2点 → 3回裏 自校が3点
    const innings: InningResult[] = [
      makeInningResult(3, 'top', [
        makeAtBat(pitcher.id, batter.id, 'home_run', 2),
      ], 2),
      makeInningResult(3, 'bottom', [
        makeAtBat(batter.id, pitcher.id, 'single', 0),
        makeAtBat(batter.id, pitcher.id, 'home_run', 3),
      ], 3),
    ];

    const dayResult = makeDayResult(world, innings, 3, 2, 'home');
    const view = projectResults(world, [dayResult]);
    const result = view.recentResults[0];

    expect(result.atBatFlow).toBeDefined();
    // 逆転の場面があることを確認
    const scores = result.atBatFlow!.map((ab) => ab.scoreAfter);
    expect(scores.length).toBeGreaterThan(0);
  });

  it('シーズン勝敗が正確にカウントされる（複数試合）', () => {
    const world = createTestWorld();
    const playerSchool = world.schools.find((s) => s.id === world.playerSchoolId)!;
    const pitcher = playerSchool.players[0];
    const batter = playerSchool.players[1];

    const winResult = makeDayResult(world, [], 5, 2, 'home');
    const loseResult = makeDayResult(world, [], 1, 3, 'home');
    const drawResult = {
      ...makeDayResult(world, [], 2, 2, 'home'),
      playerMatchResult: {
        winner: 'draw' as const,
        finalScore: { home: 2, away: 2 },
        inningScores: { home: [], away: [] },
        totalInnings: 9,
        mvpPlayerId: null,
        batterStats: [],
        pitcherStats: [],
      },
    };

    const view = projectResults(world, [winResult, loseResult, drawResult]);

    expect(view.seasonRecord.wins).toBe(1);
    expect(view.seasonRecord.losses).toBe(1);
    expect(view.seasonRecord.draws).toBe(1);
  });
});
