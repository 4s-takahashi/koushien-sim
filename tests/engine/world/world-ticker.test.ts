/**
 * tests/engine/world/world-ticker.test.ts
 *
 * 世界の1日進行テストと大会日の処理テスト。
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { advanceWorldDay } from '@/engine/world/world-ticker';
import { createWorldState } from '@/engine/world/create-world';
import type { WorldState, HighSchool } from '@/engine/world/world-state';
import { createEmptyYearResults, createDefaultWeeklyPlan, createInitialSeasonState, createInitialScoutState } from '@/engine/world/world-state';
import { generatePlayer } from '@/engine/player/generate';

// ============================================================
// テストヘルパー
// ============================================================

function makeSingleSchoolWorld(currentDate = { year: 1, month: 5, day: 1 }): WorldState {
  const rng = createRNG('world-ticker-test');
  const players = Array.from({ length: 15 }, (_, i) =>
    generatePlayer(rng.derive(`p${i}`), { enrollmentYear: currentDate.year, schoolReputation: 60 })
  );

  const playerSchool: HighSchool = {
    id: 'player-school',
    name: 'テスト高校',
    prefecture: '新潟',
    reputation: 60,
    players,
    lineup: null,
    facilities: { ground: 5, bullpen: 5, battingCage: 5, gym: 5 },
    simulationTier: 'full',
    coachStyle: { offenseType: 'balanced', defenseType: 'balanced', practiceEmphasis: 'balanced', aggressiveness: 50 },
    yearResults: createEmptyYearResults(),
    _summary: null,
  };

  // Standard school
  const standardPlayers = Array.from({ length: 15 }, (_, i) =>
    generatePlayer(rng.derive(`std-p${i}`), { enrollmentYear: currentDate.year, schoolReputation: 50 })
  );
  const standardSchool: HighSchool = {
    id: 'standard-school',
    name: '中堅高校',
    prefecture: '新潟',
    reputation: 50,
    players: standardPlayers,
    lineup: null,
    facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 },
    simulationTier: 'standard',
    coachStyle: { offenseType: 'balanced', defenseType: 'balanced', practiceEmphasis: 'batting', aggressiveness: 50 },
    yearResults: createEmptyYearResults(),
    _summary: null,
  };

  // Minimal school
  const minimalPlayers = Array.from({ length: 12 }, (_, i) =>
    generatePlayer(rng.derive(`min-p${i}`), { enrollmentYear: currentDate.year, schoolReputation: 30 })
  );
  const minimalSchool: HighSchool = {
    id: 'minimal-school',
    name: '弱小高校',
    prefecture: '新潟',
    reputation: 30,
    players: minimalPlayers,
    lineup: null,
    facilities: { ground: 2, bullpen: 2, battingCage: 2, gym: 2 },
    simulationTier: 'minimal',
    coachStyle: { offenseType: 'balanced', defenseType: 'balanced', practiceEmphasis: 'balanced', aggressiveness: 40 },
    yearResults: createEmptyYearResults(),
    _summary: null,
  };

  return {
    version: '0.3.0',
    seed: 'ticker-test',
    currentDate,
    playerSchoolId: 'player-school',
    manager: { name: '監督', yearsActive: 1, fame: 0, totalWins: 0, totalLosses: 0, koshienAppearances: 0, koshienWins: 0 },
    settings: { autoAdvanceSpeed: 'normal', showDetailedGrowth: false },
    weeklyPlan: createDefaultWeeklyPlan(),
    prefecture: '新潟',
    schools: [playerSchool, standardSchool, minimalSchool],
    middleSchoolPool: [],
    personRegistry: { entries: new Map() },
    seasonState: createInitialSeasonState(),
    scoutState: createInitialScoutState(),
  };
}

// ============================================================
// テスト
// ============================================================

describe('advanceWorldDay — 1日進行テスト', () => {
  it('1日進行で日付が1日進む', () => {
    const world = makeSingleSchoolWorld({ year: 1, month: 5, day: 10 });
    const rng = createRNG('ticker-1');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);
    expect(nextWorld.currentDate).toEqual({ year: 1, month: 5, day: 11 });
  });

  it('月末に正しく月をまたぐ', () => {
    const world = makeSingleSchoolWorld({ year: 1, month: 5, day: 31 });
    const rng = createRNG('ticker-2');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);
    expect(nextWorld.currentDate).toEqual({ year: 1, month: 6, day: 1 });
  });

  it('3/31 → 4/1 で年度替わり処理が実行される', () => {
    const world = makeSingleSchoolWorld({ year: 1, month: 3, day: 31 });
    const rng = createRNG('ticker-yr');
    const { nextWorld } = advanceWorldDay(world, 'rest', rng);
    expect(nextWorld.currentDate).toEqual({ year: 1, month: 4, day: 1 });
    // 年度替わり後はマネージャーの yearsActive が増加
    expect(nextWorld.manager.yearsActive).toBe(world.manager.yearsActive + 1);
  });

  it('自校 (full tier) の DayResult が返される', () => {
    const world = makeSingleSchoolWorld();
    const rng = createRNG('ticker-3');
    const { result } = advanceWorldDay(world, 'batting_basic', rng);
    expect(result.playerSchoolResult).toBeDefined();
    expect(result.playerSchoolResult.date).toEqual(world.currentDate);
  });

  it('全高校の選手リストが更新される', () => {
    const world = makeSingleSchoolWorld({ year: 1, month: 5, day: 1 });
    const rng = createRNG('ticker-4');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);

    // 全校が存在する
    expect(nextWorld.schools.length).toBe(3);

    // player-school の選手は full tier なのでそのまま処理される
    const playerSchool = nextWorld.schools.find((s) => s.id === 'player-school')!;
    expect(playerSchool.players.length).toBeGreaterThan(0);
  });

  it('Tier 2 (standard) 校は日次成長が適用される', () => {
    const world = makeSingleSchoolWorld({ year: 1, month: 5, day: 1 });
    const rng = createRNG('ticker-std');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);

    const beforeSchool = world.schools.find((s) => s.id === 'standard-school')!;
    const afterSchool = nextWorld.schools.find((s) => s.id === 'standard-school')!;

    // 少なくとも1人の選手の能力値が変化している
    let changed = false;
    for (let i = 0; i < beforeSchool.players.length; i++) {
      if (beforeSchool.players[i].stats.batting.contact !== afterSchool.players[i].stats.batting.contact) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });

  it('Tier 3 (minimal) 校は月曜日には成長しない', () => {
    // 月曜日は day 1 = 2026年4月1日 + 0 = Monday(1)
    // Year1, Apr 1 = Monday, May 1 = Thursday(4)
    // May 7 = Wednesday(3), May 5 = Monday(1)
    const world = makeSingleSchoolWorld({ year: 1, month: 5, day: 5 }); // Monday
    const rng = createRNG('ticker-min-mon');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);

    const beforeSchool = world.schools.find((s) => s.id === 'minimal-school')!;
    const afterSchool = nextWorld.schools.find((s) => s.id === 'minimal-school')!;

    // 月曜日は minimal tier は成長しない（日曜のみ）
    let unchanged = true;
    for (let i = 0; i < beforeSchool.players.length; i++) {
      if (beforeSchool.players[i].stats.batting.contact !== afterSchool.players[i].stats.batting.contact) {
        unchanged = false;
        break;
      }
    }
    expect(unchanged).toBe(true);
  });

  it('シード再現性: 同じシードで同じ結果', () => {
    const world = makeSingleSchoolWorld();

    const { nextWorld: nw1 } = advanceWorldDay(world, 'batting_basic', createRNG('repro-seed'));
    const { nextWorld: nw2 } = advanceWorldDay(world, 'batting_basic', createRNG('repro-seed'));

    const playerSchool1 = nw1.schools.find((s) => s.id === 'player-school')!;
    const playerSchool2 = nw2.schools.find((s) => s.id === 'player-school')!;

    // 自校1番目の選手の能力値が一致
    expect(playerSchool1.players[0].stats.batting.contact)
      .toBe(playerSchool2.players[0].stats.batting.contact);
  });
});
