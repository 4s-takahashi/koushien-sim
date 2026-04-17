/**
 * tests/engine/world/world-ticker-phase8.test.ts
 *
 * Phase 8: シーズン遷移・トーナメント自動進行・試合結果テスト
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { advanceWorldDay } from '@/engine/world/world-ticker';
import type { WorldState, HighSchool } from '@/engine/world/world-state';
import {
  createEmptyYearResults,
  createDefaultWeeklyPlan,
  createInitialSeasonState,
  createInitialScoutState,
} from '@/engine/world/world-state';
import { generatePlayer } from '@/engine/player/generate';

// ============================================================
// テストヘルパー
// ============================================================

function makeSchool(id: string, name: string, tier: 'full' | 'standard' | 'minimal', reputation = 50): HighSchool {
  const rng = createRNG(`school-${id}`);
  const players = Array.from({ length: 15 }, (_, i) =>
    generatePlayer(rng.derive(`p${i}`), { enrollmentYear: 1, schoolReputation: reputation })
  );
  return {
    id,
    name,
    prefecture: '新潟',
    reputation,
    players,
    lineup: null,
    facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 },
    simulationTier: tier,
    coachStyle: { offenseType: 'balanced', defenseType: 'balanced', practiceEmphasis: 'balanced', aggressiveness: 50 },
    yearResults: createEmptyYearResults(),
    _summary: null,
  };
}

/**
 * テスト用に48校の WorldState を作る（トーナメントに必要）
 */
function makeFullWorld(currentDate = { year: 1, month: 4, day: 1 }): WorldState {
  const schools: HighSchool[] = [];

  // 自校 (full tier)
  schools.push(makeSchool('player-school', '自校テスト高校', 'full', 60));

  // 47 AI 校 (minimal tier)
  for (let i = 1; i < 48; i++) {
    schools.push(makeSchool(`ai-school-${i}`, `AI高校${i}`, 'minimal', 40 + (i % 30)));
  }

  return {
    version: '0.3.0',
    seed: 'phase8-test',
    currentDate,
    playerSchoolId: 'player-school',
    manager: { name: '監督', yearsActive: 1, fame: 0, totalWins: 0, totalLosses: 0, koshienAppearances: 0, koshienWins: 0 },
    settings: { autoAdvanceSpeed: 'normal', showDetailedGrowth: false },
    weeklyPlan: createDefaultWeeklyPlan(),
    prefecture: '新潟',
    schools,
    middleSchoolPool: [],
    personRegistry: { entries: new Map() },
    seasonState: createInitialSeasonState(),
    scoutState: createInitialScoutState(),
  };
}

/**
 * N日進めたWorldStateを返す
 */
function advanceNDays(world: WorldState, n: number): WorldState {
  let w = world;
  const rng = createRNG(`advance-${n}`);
  for (let i = 0; i < n; i++) {
    const dayRng = rng.derive(`day-${i}`);
    const { nextWorld } = advanceWorldDay(w, 'batting_basic', dayRng);
    w = nextWorld;
  }
  return w;
}

/**
 * 指定日付まで進めたWorldStateを返す
 */
function advanceToDate(
  world: WorldState,
  targetMonth: number,
  targetDay: number,
): WorldState {
  let w = world;
  let iter = 0;
  while (
    (w.currentDate.month !== targetMonth || w.currentDate.day !== targetDay) &&
    iter < 400
  ) {
    const rng = createRNG(`advance-to-${w.currentDate.month}-${w.currentDate.day}-${iter}`);
    const { nextWorld } = advanceWorldDay(w, 'batting_basic', rng);
    w = nextWorld;
    iter++;
  }
  return w;
}

// ============================================================
// テスト: シーズンフェーズ遷移
// ============================================================

describe('シーズンフェーズ遷移テスト', () => {
  it('4月は spring_practice フェーズ', () => {
    const world = makeFullWorld({ year: 1, month: 4, day: 1 });
    const rng = createRNG('season-1');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);
    expect(nextWorld.seasonState.phase).toBe('spring_practice');
  });

  it('7月10日に summer_tournament フェーズに遷移する', () => {
    const world = makeFullWorld({ year: 1, month: 7, day: 9 });
    const rng = createRNG('season-2');
    const { nextWorld, result } = advanceWorldDay(world, 'batting_basic', rng);
    // 7/9 → 7/10 になる時に夏大会開始
    expect(nextWorld.currentDate).toEqual({ year: 1, month: 7, day: 10 });
    expect(nextWorld.seasonState.phase).toBe('summer_tournament');
    expect(result.seasonTransition).toBe('summer_tournament');
  });

  it('7月31日以降は post_summer フェーズに遷移する', () => {
    // 7/31 は post_summer
    const world = makeFullWorld({ year: 1, month: 7, day: 30 });
    const rng = createRNG('season-3');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);
    // 7/30 → 7/31 になる
    expect(nextWorld.currentDate).toEqual({ year: 1, month: 7, day: 31 });
    expect(nextWorld.seasonState.phase).toBe('post_summer');
  });

  it('9月15日に autumn_tournament フェーズに遷移する', () => {
    const world = makeFullWorld({ year: 1, month: 9, day: 14 });
    const rng = createRNG('season-4');
    const { nextWorld, result } = advanceWorldDay(world, 'batting_basic', rng);
    expect(nextWorld.currentDate).toEqual({ year: 1, month: 9, day: 15 });
    expect(nextWorld.seasonState.phase).toBe('autumn_tournament');
    expect(result.seasonTransition).toBe('autumn_tournament');
  });

  it('10月15日に off_season フェーズに遷移する', () => {
    const world = makeFullWorld({ year: 1, month: 10, day: 14 });
    // activeTournament がないことを確認して進める
    const worldNoTournament = { ...world, activeTournament: null };
    const rng = createRNG('season-5');
    const { nextWorld } = advanceWorldDay(worldNoTournament, 'batting_basic', rng);
    expect(nextWorld.currentDate).toEqual({ year: 1, month: 10, day: 15 });
    expect(nextWorld.seasonState.phase).toBe('off_season');
  });

  it('12月は off_season フェーズ', () => {
    const world = makeFullWorld({ year: 1, month: 12, day: 1 });
    const worldWithPhase = {
      ...world,
      seasonState: { ...world.seasonState, phase: 'off_season' as const },
      activeTournament: null,
    };
    const rng = createRNG('season-6');
    const { nextWorld } = advanceWorldDay(worldWithPhase, 'batting_basic', rng);
    expect(nextWorld.seasonState.phase).toBe('off_season');
  });

  it('2月1日に pre_season フェーズに遷移する', () => {
    const world = makeFullWorld({ year: 1, month: 1, day: 31 });
    const worldWithPhase = {
      ...world,
      seasonState: { ...world.seasonState, phase: 'off_season' as const },
      activeTournament: null,
    };
    const rng = createRNG('season-7');
    const { nextWorld, result } = advanceWorldDay(worldWithPhase, 'batting_basic', rng);
    expect(nextWorld.currentDate).toEqual({ year: 1, month: 2, day: 1 });
    expect(nextWorld.seasonState.phase).toBe('pre_season');
    expect(result.seasonTransition).toBe('pre_season');
  });

  it('3/31→4/1 年度替わりで spring_practice にリセットされる', () => {
    const world = makeFullWorld({ year: 1, month: 3, day: 31 });
    const worldWithPhase = {
      ...world,
      seasonState: { ...world.seasonState, phase: 'pre_season' as const },
      activeTournament: null,
    };
    const rng = createRNG('season-8');
    const { nextWorld } = advanceWorldDay(worldWithPhase, 'batting_basic', rng);
    expect(nextWorld.currentDate).toEqual({ year: 1, month: 4, day: 1 });
    expect(nextWorld.seasonState.phase).toBe('spring_practice');
  });

  it('4月〜7月〜9月〜12月の連続遷移が正しい', () => {
    const world = makeFullWorld({ year: 1, month: 4, day: 1 });

    // 4月は spring_practice
    expect(world.seasonState.phase).toBe('spring_practice');

    // 7/10 まで進めて summer_tournament
    const worldAtSummer = advanceToDate(world, 7, 10);
    expect(worldAtSummer.seasonState.phase).toBe('summer_tournament');

    // 9/15 まで進めて autumn_tournament
    const worldAtAutumn = advanceToDate(worldAtSummer, 9, 15);
    expect(worldAtAutumn.seasonState.phase).toBe('autumn_tournament');

    // 10/15 まで進めて off_season
    const worldAtOff = advanceToDate(worldAtAutumn, 10, 15);
    expect(worldAtOff.seasonState.phase).toBe('off_season');
  });
});

// ============================================================
// テスト: トーナメント自動生成・進行
// ============================================================

describe('トーナメント自動生成・進行テスト', () => {
  it('7/10 に夏大会が自動開始される（activeTournament が設定される）', () => {
    const world = makeFullWorld({ year: 1, month: 7, day: 9 });
    const rng = createRNG('tournament-1');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);
    expect(nextWorld.currentDate).toEqual({ year: 1, month: 7, day: 10 });
    expect(nextWorld.activeTournament).not.toBeNull();
    expect(nextWorld.activeTournament?.type).toBe('summer');
  });

  it('夏大会は48校で構成される', () => {
    const world = makeFullWorld({ year: 1, month: 7, day: 9 });
    const rng = createRNG('tournament-2');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);
    expect(nextWorld.activeTournament?.totalTeams).toBe(48);
  });

  it('夏大会開始後に currentTournamentId が設定される', () => {
    const world = makeFullWorld({ year: 1, month: 7, day: 9 });
    const rng = createRNG('tournament-3');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);
    expect(nextWorld.seasonState.currentTournamentId).toBe(nextWorld.activeTournament?.id);
  });

  it('夏大会は6ラウンド構成', () => {
    const world = makeFullWorld({ year: 1, month: 7, day: 9 });
    const rng = createRNG('tournament-4');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);
    expect(nextWorld.activeTournament?.rounds.length).toBe(6);
  });

  it('夏大会期間中、大会が進行する（ラウンドが消化される）', () => {
    const world = makeFullWorld({ year: 1, month: 7, day: 9 });

    // 7/10: 大会開始 + Round 1
    const rng1 = createRNG('tournament-5a');
    const { nextWorld: w10 } = advanceWorldDay(world, 'batting_basic', rng1);
    expect(w10.activeTournament).not.toBeNull();

    // 7/13: Round 2 が進む
    const rng2 = createRNG('tournament-5b');
    const w11 = advanceNDays(w10, 1);
    const w12 = advanceNDays(w11, 1);
    const w13 = advanceNDays(w12, 1);

    // Round 1 が消化済みであることを確認
    if (w13.activeTournament) {
      const round1 = w13.activeTournament.rounds.find(r => r.roundNumber === 1);
      const round1Done = round1?.matches.every(m => m.winnerId !== null || m.isBye);
      expect(round1Done).toBe(true);
    }
  });

  it('9/15 に秋大会が自動開始される', () => {
    const world = makeFullWorld({ year: 1, month: 9, day: 14 });
    const worldNoTournament = { ...world, activeTournament: null };
    const rng = createRNG('tournament-autumn-1');
    const { nextWorld } = advanceWorldDay(worldNoTournament, 'batting_basic', rng);
    expect(nextWorld.currentDate).toEqual({ year: 1, month: 9, day: 15 });
    expect(nextWorld.activeTournament).not.toBeNull();
    expect(nextWorld.activeTournament?.type).toBe('autumn');
  });
});

// ============================================================
// テスト: 自校の試合結果が WorldDayResult に反映される
// ============================================================

describe('試合結果 WorldDayResult 反映テスト', () => {
  it('大会期間外は playerMatchResult が null', () => {
    const world = makeFullWorld({ year: 1, month: 5, day: 1 });
    const rng = createRNG('match-1');
    const { result } = advanceWorldDay(world, 'batting_basic', rng);
    expect(result.playerMatchResult).toBeUndefined();
    expect(result.playerMatchOpponent).toBeUndefined();
  });

  it('7/10 に自校の試合がある場合 playerMatchResult が設定される（自校の試合が存在する場合）', () => {
    const world = makeFullWorld({ year: 1, month: 7, day: 9 });
    const rng = createRNG('match-2');
    const { nextWorld, result } = advanceWorldDay(world, 'batting_basic', rng);

    // 自校がラウンド1に参加しているか確認
    const bracket = nextWorld.activeTournament;
    if (bracket) {
      const round1 = bracket.rounds.find(r => r.roundNumber === 1);
      const playerInRound1 = round1?.matches.some(
        m => m.homeSchoolId === 'player-school' || m.awaySchoolId === 'player-school'
      ) ?? false;

      if (playerInRound1) {
        // 自校が参加している場合、試合結果が設定される
        expect(result.playerMatchResult).not.toBeUndefined();
        expect(result.playerMatchOpponent).not.toBeUndefined();
        expect(result.playerMatchSide).toMatch(/home|away/);
      }
    }
  });

  it('試合結果がある場合、finalScore が数値で設定される', () => {
    // 7/10 に自動開始される大会でラウンド1の自校試合を探す
    const world = makeFullWorld({ year: 1, month: 7, day: 9 });
    const rng = createRNG('match-3');
    const { result } = advanceWorldDay(world, 'batting_basic', rng);

    if (result.playerMatchResult) {
      expect(typeof result.playerMatchResult.finalScore.home).toBe('number');
      expect(typeof result.playerMatchResult.finalScore.away).toBe('number');
      expect(result.playerMatchResult.finalScore.home).toBeGreaterThanOrEqual(0);
      expect(result.playerMatchResult.finalScore.away).toBeGreaterThanOrEqual(0);
      expect(result.playerMatchResult.winner).toMatch(/home|away/);
    }
  });
});

// ============================================================
// テスト: 年度替わりでシーズンリセット
// ============================================================

describe('年度替わりシーズンリセットテスト', () => {
  it('3/31 → 4/1 で seasonState.phase が spring_practice になる', () => {
    const world = makeFullWorld({ year: 1, month: 3, day: 31 });
    const worldWithPreSeason = {
      ...world,
      seasonState: { ...world.seasonState, phase: 'pre_season' as const },
      activeTournament: null,
    };
    const rng = createRNG('year-reset-1');
    const { nextWorld } = advanceWorldDay(worldWithPreSeason, 'batting_basic', rng);
    expect(nextWorld.currentDate.month).toBe(4);
    expect(nextWorld.currentDate.day).toBe(1);
    expect(nextWorld.seasonState.phase).toBe('spring_practice');
  });

  it('年度替わりで currentTournamentId がリセットされる', () => {
    const world = makeFullWorld({ year: 1, month: 3, day: 31 });
    const worldWithTournamentId = {
      ...world,
      seasonState: {
        ...world.seasonState,
        phase: 'pre_season' as const,
        currentTournamentId: 'old-tournament-id',
      },
      activeTournament: null,
    };
    const rng = createRNG('year-reset-2');
    const { nextWorld } = advanceWorldDay(worldWithTournamentId, 'batting_basic', rng);
    expect(nextWorld.seasonState.currentTournamentId).toBeNull();
  });

  it('年度替わりで manager.yearsActive が増加する', () => {
    const world = makeFullWorld({ year: 1, month: 3, day: 31 });
    const worldWithPhase = {
      ...world,
      seasonState: { ...world.seasonState, phase: 'pre_season' as const },
      activeTournament: null,
    };
    const rng = createRNG('year-reset-3');
    const { nextWorld } = advanceWorldDay(worldWithPhase, 'batting_basic', rng);
    expect(nextWorld.manager.yearsActive).toBe(world.manager.yearsActive + 1);
  });
});
