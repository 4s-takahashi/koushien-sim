/**
 * tests/ui/projectors/obProjector.test.ts
 *
 * obProjector のユニットテスト。
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
import type { PersonRegistryEntry, GraduateSummary } from '@/engine/world/person-state';
import { projectOB } from '@/ui/projectors/obProjector';

function makeBaseWorld(): WorldState {
  const rng = createRNG('ob-projector-test');
  const player = generatePlayer(rng.derive('p'), { enrollmentYear: 1, schoolReputation: 60 });

  const playerSchool: HighSchool = {
    id: 'ps',
    name: '桜葉高校',
    prefecture: '新潟',
    reputation: 60,
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
    currentDate: { year: 2, month: 5, day: 1 },
    playerSchoolId: 'ps',
    manager: { name: '監督', yearsActive: 0, fame: 0, totalWins: 0, totalLosses: 0, koshienAppearances: 0, koshienWins: 0 },
    settings: { autoAdvanceSpeed: 'normal', showDetailedGrowth: false },
    weeklyPlan: createDefaultWeeklyPlan(),
    prefecture: '新潟',
    schools: [playerSchool],
    middleSchoolPool: [],
    personRegistry: { entries: new Map() },
    seasonState: createInitialSeasonState(),
    scoutState: createInitialScoutState(),
  };
}

function makeGraduateSummary(personId: string, schoolId: string, schoolName: string): GraduateSummary {
  return {
    personId,
    name: `選手${personId}`,
    finalStats: {
      base: { stamina: 70, speed: 65, armStrength: 60, fielding: 55, focus: 68, mental: 72 },
      batting: { contact: 65, power: 60, eye: 63, technique: 67 },
      pitching: null,
    },
    finalOverall: 65,
    schoolId,
    schoolName,
    graduationYear: 1,
    careerPath: { type: 'pro', team: '読売巨人軍', pickRound: 1 },
    achievements: ['甲子園出場'],
  };
}

describe('projectOB', () => {
  it('卒業生がいない場合は空のリストを返す', () => {
    const world = makeBaseWorld();
    const view = projectOB(world);

    expect(view.totalGraduates).toBe(0);
    expect(view.graduates).toHaveLength(0);
  });

  it('GraduateSummary から正しく射影される', () => {
    const world = makeBaseWorld();
    const entry: PersonRegistryEntry = {
      personId: 'person-1',
      retention: 'tracked',
      stage: { type: 'pro', team: '読売巨人軍', yearsActive: 1 },
      graduateSummary: makeGraduateSummary('person-1', 'ps', '桜葉高校'),
    };
    world.personRegistry.entries.set('person-1', entry);

    const view = projectOB(world);

    expect(view.totalGraduates).toBe(1);
    expect(view.proCount).toBe(1);
    expect(view.graduates[0].careerPathType).toBe('pro');
    expect(view.graduates[0].careerPathLabel).toContain('読売巨人軍');
  });

  it('自校OBが playerSchoolGraduates に含まれる', () => {
    const world = makeBaseWorld();
    const entry: PersonRegistryEntry = {
      personId: 'person-2',
      retention: 'tracked',
      stage: { type: 'graduated', year: 1, path: { type: 'pro', team: '読売巨人軍', pickRound: 2 } },
      graduateSummary: makeGraduateSummary('person-2', 'ps', '桜葉高校'),
    };
    world.personRegistry.entries.set('person-2', entry);

    const view = projectOB(world);

    expect(view.playerSchoolGraduates).toHaveLength(1);
    expect(view.playerSchoolGraduates[0].isFromPlayerSchool).toBe(true);
  });

  it('他校OBは playerSchoolGraduates に含まれない', () => {
    const world = makeBaseWorld();
    const entry: PersonRegistryEntry = {
      personId: 'person-3',
      retention: 'tracked',
      stage: { type: 'graduated', year: 1, path: { type: 'university', school: '慶應大学', hasScholarship: false } },
      graduateSummary: makeGraduateSummary('person-3', 'other-school', '他校'),
    };
    world.personRegistry.entries.set('person-3', entry);

    const view = projectOB(world);

    expect(view.playerSchoolGraduates).toHaveLength(0);
    expect(view.graduates[0].isFromPlayerSchool).toBe(false);
  });

  it('統計カウントが正しい', () => {
    const world = makeBaseWorld();

    const proEntry: PersonRegistryEntry = {
      personId: 'p1',
      retention: 'tracked',
      stage: { type: 'pro', team: '阪神タイガース', yearsActive: 1 },
      graduateSummary: { ...makeGraduateSummary('p1', 'ps', '桜葉高校'), careerPath: { type: 'pro', team: '阪神タイガース', pickRound: 3 } },
    };
    const univEntry: PersonRegistryEntry = {
      personId: 'p2',
      retention: 'tracked',
      stage: { type: 'graduated', year: 1, path: { type: 'university', school: '早稲田', hasScholarship: true } },
      graduateSummary: { ...makeGraduateSummary('p2', 'ps', '桜葉高校'), careerPath: { type: 'university', school: '早稲田', hasScholarship: true } },
    };

    world.personRegistry.entries.set('p1', proEntry);
    world.personRegistry.entries.set('p2', univEntry);

    const view = projectOB(world);

    expect(view.proCount).toBe(1);
    expect(view.universityCount).toBe(1);
    expect(view.totalGraduates).toBe(2);
  });
});
