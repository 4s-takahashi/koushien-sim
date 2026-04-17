/**
 * tests/ui/projectors/homeProjectorPhase8.test.ts
 *
 * Phase 8.1: 大会UX改善 — homeProjector の大会情報テスト
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { generatePlayer } from '@/engine/player/generate';
import type { WorldState, HighSchool } from '@/engine/world/world-state';
import {
  createEmptyYearResults,
  createInitialSeasonState,
  createInitialScoutState,
  createDefaultWeeklyPlan,
} from '@/engine/world/world-state';
import { createTournamentBracket } from '@/engine/world/tournament-bracket';
import { projectHome } from '@/ui/projectors/homeProjector';

// ============================================================
// テストヘルパー
// ============================================================

function makeSchool(id: string, name: string, reputation = 50): HighSchool {
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
    simulationTier: 'full',
    coachStyle: { offenseType: 'balanced', defenseType: 'balanced', practiceEmphasis: 'balanced', aggressiveness: 50 },
    yearResults: createEmptyYearResults(),
    _summary: null,
  };
}

function makeTestWorld(opts: {
  month?: number;
  day?: number;
  phase?: string;
  withActiveTournament?: 'summer' | 'autumn' | null;
} = {}): WorldState {
  const {
    month = 5, day = 1, phase = 'spring_practice', withActiveTournament = null,
  } = opts;

  const schools: HighSchool[] = [makeSchool('ps', '桜葉高校', 65)];
  for (let i = 1; i < 48; i++) {
    schools.push(makeSchool(`ai-${i}`, `AI高校${i}`, 40 + (i % 30)));
  }

  let activeTournament = undefined;
  if (withActiveTournament) {
    const rng = createRNG('test-tournament');
    activeTournament = createTournamentBracket(
      `tournament-${withActiveTournament}-1`,
      withActiveTournament,
      1,
      schools,
      rng,
    );
  }

  return {
    version: '0.3.0',
    seed: 'test',
    currentDate: { year: 1, month, day },
    playerSchoolId: 'ps',
    manager: { name: '監督', yearsActive: 0, fame: 10, totalWins: 0, totalLosses: 0, koshienAppearances: 0, koshienWins: 0 },
    settings: { autoAdvanceSpeed: 'normal', showDetailedGrowth: false },
    weeklyPlan: createDefaultWeeklyPlan(),
    prefecture: '新潟',
    schools,
    middleSchoolPool: [],
    personRegistry: { entries: new Map() },
    seasonState: {
      phase: phase as import('@/engine/world/world-state').SeasonPhase,
      currentTournamentId: null,
      yearResults: createEmptyYearResults(),
    },
    scoutState: createInitialScoutState(),
    activeTournament: activeTournament ?? null,
  };
}

// ============================================================
// テスト: 大会開始前情報
// ============================================================

describe('大会開始前情報 (tournamentStart)', () => {
  it('春季練習中は夏の大会の開始前情報が含まれる', () => {
    const world = makeTestWorld({ month: 5, day: 1, phase: 'spring_practice' });
    const view = projectHome(world);

    expect(view.tournamentStart).toBeDefined();
    expect(view.tournamentStart?.name).toBe('夏の大会');
    expect(view.tournamentStart?.date).toBe('7月10日');
    expect(view.tournamentStart?.daysAway).toBeGreaterThan(0);
  });

  it('7月9日は夏の大会まで1日', () => {
    const world = makeTestWorld({ month: 7, day: 9, phase: 'spring_practice' });
    const view = projectHome(world);

    expect(view.tournamentStart).toBeDefined();
    expect(view.tournamentStart?.name).toBe('夏の大会');
    expect(view.tournamentStart?.daysAway).toBe(1);
  });

  it('夏以降（7/31）は秋大会の開始前情報が含まれる', () => {
    const world = makeTestWorld({ month: 7, day: 31, phase: 'post_summer' });
    const view = projectHome(world);

    expect(view.tournamentStart).toBeDefined();
    expect(view.tournamentStart?.name).toBe('秋の大会');
    expect(view.tournamentStart?.date).toBe('9月15日');
    expect(view.tournamentStart?.daysAway).toBeGreaterThan(0);
  });

  it('大会期間中は tournamentStart が undefined', () => {
    const world = makeTestWorld({
      month: 7, day: 10, phase: 'summer_tournament',
      withActiveTournament: 'summer',
    });
    const view = projectHome(world);

    expect(view.tournamentStart).toBeUndefined();
  });

  it('オフシーズン中は tournamentStart が undefined', () => {
    const world = makeTestWorld({ month: 11, day: 1, phase: 'off_season' });
    const view = projectHome(world);

    // オフシーズンは大会期間外だが、buildTournamentStartInfo では undefined を返す
    expect(view.tournamentStart).toBeUndefined();
  });
});

// ============================================================
// テスト: 大会開催中情報
// ============================================================

describe('大会開催中情報 (tournament)', () => {
  it('大会が開催中なら tournament フィールドが設定される', () => {
    const world = makeTestWorld({
      month: 7, day: 10, phase: 'summer_tournament',
      withActiveTournament: 'summer',
    });
    const view = projectHome(world);

    expect(view.tournament).toBeDefined();
    expect(view.tournament?.isActive).toBe(true);
    expect(view.tournament?.typeName).toBe('夏の大会');
  });

  it('大会がない場合は tournament が undefined', () => {
    const world = makeTestWorld({ month: 5, day: 1, phase: 'spring_practice' });
    const view = projectHome(world);

    expect(view.tournament).toBeUndefined();
  });

  it('夏大会の試合日（7/10）は isMatchDay=true', () => {
    const world = makeTestWorld({
      month: 7, day: 10, phase: 'summer_tournament',
      withActiveTournament: 'summer',
    });
    const view = projectHome(world);

    expect(view.tournament?.isMatchDay).toBe(true);
  });

  it('夏大会の試合なし日（7/11）は isMatchDay=false', () => {
    const world = makeTestWorld({
      month: 7, day: 11, phase: 'summer_tournament',
      withActiveTournament: 'summer',
    });
    const view = projectHome(world);

    expect(view.tournament?.isMatchDay).toBe(false);
  });

  it('秋大会が開催中なら typeName が「秋の大会」', () => {
    const world = makeTestWorld({
      month: 9, day: 15, phase: 'autumn_tournament',
      withActiveTournament: 'autumn',
    });
    const view = projectHome(world);

    expect(view.tournament?.typeName).toBe('秋の大会');
  });

  it('大会中は isInTournamentSeason=true', () => {
    const world = makeTestWorld({
      month: 7, day: 10, phase: 'summer_tournament',
      withActiveTournament: 'summer',
    });
    const view = projectHome(world);

    expect(view.isInTournamentSeason).toBe(true);
  });

  it('大会外は isInTournamentSeason=false', () => {
    const world = makeTestWorld({ month: 5, day: 1, phase: 'spring_practice' });
    const view = projectHome(world);

    expect(view.isInTournamentSeason).toBe(false);
  });

  it('大会中は tournamentStart が undefined', () => {
    const world = makeTestWorld({
      month: 7, day: 15, phase: 'summer_tournament',
      withActiveTournament: 'summer',
    });
    const view = projectHome(world);

    expect(view.tournamentStart).toBeUndefined();
  });
});

// ============================================================
// テスト: 大会開始予告（残り日数）
// ============================================================

describe('大会開始予告の残り日数計算', () => {
  it('5月1日から夏大会まで40日以上残る', () => {
    const world = makeTestWorld({ month: 5, day: 1 });
    const view = projectHome(world);

    // 5月は31日、6月は30日、7月1〜10日
    // 残り: (31-1) + 30 + 10 = 70日
    expect(view.tournamentStart?.daysAway).toBeGreaterThanOrEqual(60);
  });

  it('7月1日は夏大会まで9日', () => {
    const world = makeTestWorld({ month: 7, day: 1 });
    const view = projectHome(world);

    expect(view.tournamentStart?.daysAway).toBe(9);
  });

  it('8月1日は秋大会まで45日前後', () => {
    const world = makeTestWorld({ month: 8, day: 1, phase: 'post_summer' });
    const view = projectHome(world);

    // 8月残り30日 + 9月15日 = 30 + 15 = 45日
    expect(view.tournamentStart?.daysAway).toBe(45);
  });
});
