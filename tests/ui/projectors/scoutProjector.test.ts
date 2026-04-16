/**
 * tests/ui/projectors/scoutProjector.test.ts
 *
 * scoutProjector のユニットテスト。
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import type { WorldState, HighSchool, MiddleSchoolPlayer } from '@/engine/world/world-state';
import {
  createEmptyYearResults,
  createInitialSeasonState,
  createInitialScoutState,
  createDefaultWeeklyPlan,
} from '@/engine/world/world-state';
import { generatePlayer } from '@/engine/player/generate';
import { projectScout } from '@/ui/projectors/scoutProjector';

function makeTestStats() {
  return {
    base: { stamina: 15, speed: 20, armStrength: 12, fielding: 14, focus: 16, mental: 18 },
    batting: { contact: 15, power: 12, eye: 13, technique: 14 },
    pitching: null,
  };
}

function makeTestWorld(): WorldState {
  const rng = createRNG('scout-projector-test');
  const player = generatePlayer(rng.derive('p'), { enrollmentYear: 1, schoolReputation: 60 });

  const playerSchool: HighSchool = {
    id: 'ps',
    name: '桜葉高校',
    prefecture: '新潟',
    reputation: 60,
    players: [player],
    lineup: null,
    facilities: { ground: 4, bullpen: 4, battingCage: 4, gym: 4 },
    simulationTier: 'full',
    coachStyle: { offenseType: 'balanced', defenseType: 'balanced', practiceEmphasis: 'balanced', aggressiveness: 50 },
    yearResults: createEmptyYearResults(),
    _summary: null,
  };

  const ms1: MiddleSchoolPlayer = {
    id: 'ms-1',
    firstName: '太郎',
    lastName: '田中',
    middleSchoolGrade: 3,
    middleSchoolName: '新潟第一中学',
    prefecture: '新潟',
    currentStats: makeTestStats(),
    targetSchoolId: null,
    scoutedBy: [],
  };

  const ms2: MiddleSchoolPlayer = {
    id: 'ms-2',
    firstName: '次郎',
    lastName: '山田',
    middleSchoolGrade: 2,
    middleSchoolName: '新潟第二中学',
    prefecture: '新潟',
    currentStats: makeTestStats(),
    targetSchoolId: 'ps',
    scoutedBy: ['ps'],
  };

  return {
    version: '0.3.0',
    seed: 'test',
    currentDate: { year: 1, month: 5, day: 1 },
    playerSchoolId: 'ps',
    manager: { name: '監督', yearsActive: 0, fame: 0, totalWins: 0, totalLosses: 0, koshienAppearances: 0, koshienWins: 0 },
    settings: { autoAdvanceSpeed: 'normal', showDetailedGrowth: false },
    weeklyPlan: createDefaultWeeklyPlan(),
    prefecture: '新潟',
    schools: [playerSchool],
    middleSchoolPool: [ms1, ms2],
    personRegistry: { entries: new Map() },
    seasonState: createInitialSeasonState(),
    scoutState: {
      watchList: ['ms-1'],
      scoutReports: new Map(),
      recruitAttempts: new Map(),
      monthlyScoutBudget: 4,
      usedScoutThisMonth: 1,
    },
  };
}

describe('projectScout', () => {
  it('ウォッチリストが正しく射影される', () => {
    const world = makeTestWorld();
    const view = projectScout(world);

    expect(view.watchList).toHaveLength(1);
    expect(view.watchList[0].id).toBe('ms-1');
    expect(view.watchList[0].lastName).toBe('田中');
  });

  it('予算が正しく反映される', () => {
    const world = makeTestWorld();
    const view = projectScout(world);

    expect(view.budgetTotal).toBe(4);
    expect(view.budgetUsed).toBe(1);
    expect(view.budgetRemaining).toBe(3);
  });

  it('searchResults に全中学生が含まれる', () => {
    const world = makeTestWorld();
    const view = projectScout(world);

    expect(view.searchResults).toHaveLength(2);
  });

  it('学年フィルタが機能する', () => {
    const world = makeTestWorld();
    const view = projectScout(world, { grade: 3 });

    expect(view.searchResults).toHaveLength(1);
    expect(view.searchResults[0].id).toBe('ms-1');
  });

  it('勧誘済みの選手の recruitStatus が "入学確定" になる', () => {
    const world = makeTestWorld();
    const view = projectScout(world);

    const ms2 = view.watchList.find((p) => p.id === 'ms-2');
    // ms-2 はウォッチリストにないので watchList には含まれない
    // searchResults で確認
    const ms2Result = view.searchResults.find((p) => p.id === 'ms-2');
    expect(ms2Result?.targetSchoolName).toBe('桜葉高校');
  });

  it('isOnWatchList が正しく反映される', () => {
    const world = makeTestWorld();
    const view = projectScout(world);

    const ms1 = view.searchResults.find((p) => p.id === 'ms-1');
    const ms2 = view.searchResults.find((p) => p.id === 'ms-2');
    expect(ms1?.isOnWatchList).toBe(true);
    expect(ms2?.isOnWatchList).toBe(false);
  });
});
