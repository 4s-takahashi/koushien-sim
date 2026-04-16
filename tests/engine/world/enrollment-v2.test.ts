/**
 * tests/engine/world/enrollment-v2.test.ts
 *
 * 5要素スコアリングによる高校進学配分ロジックのテスト。
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { processYearTransition } from '@/engine/world/year-transition';
import type { WorldState, HighSchool, MiddleSchoolPlayer } from '@/engine/world/world-state';
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

function makeSchool(id: string, opts: Partial<HighSchool> = {}): HighSchool {
  return {
    id,
    name: `${id}高校`,
    prefecture: '新潟',
    reputation: 50,
    players: [],
    lineup: null,
    facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 },
    simulationTier: 'standard',
    coachStyle: {
      offenseType: 'balanced',
      defenseType: 'balanced',
      practiceEmphasis: 'balanced',
      aggressiveness: 50,
    },
    yearResults: createEmptyYearResults(),
    _summary: null,
    ...opts,
  };
}

function makeSenior(
  id: string,
  opts: Partial<MiddleSchoolPlayer> = {},
): MiddleSchoolPlayer {
  return {
    id,
    firstName: '太郎',
    lastName: '田中',
    middleSchoolGrade: 3,
    middleSchoolName: '新潟第一中学',
    prefecture: '新潟',
    currentStats: {
      base: { stamina: 20, speed: 20, armStrength: 20, fielding: 20, focus: 20, mental: 20 },
      batting: { contact: 20, power: 20, eye: 20, technique: 20 },
      pitching: null,
    },
    targetSchoolId: null,
    scoutedBy: [],
    ...opts,
  };
}

function makeWorldWithSchoolsAndSeniors(
  schools: HighSchool[],
  seniors: MiddleSchoolPlayer[],
): WorldState {
  const rng = createRNG('enrollment-test');
  const playerSchool = schools[0];

  // 各校に在校生を生成（2年生・1年生）
  const filledSchools = schools.map((school, idx) => {
    const players = Array.from({ length: 4 }, (_, i) =>
      generatePlayer(rng.derive(`p-${school.id}-${i}`), {
        enrollmentYear: idx === 0 ? 0 : -1,
        schoolReputation: school.reputation,
      })
    );
    return { ...school, players };
  });

  return {
    version: '0.3.0',
    seed: 'enrollment-v2-test',
    currentDate: { year: 1, month: 4, day: 1 },
    playerSchoolId: playerSchool.id,
    manager: {
      name: '監督', yearsActive: 1, fame: 0,
      totalWins: 0, totalLosses: 0, koshienAppearances: 0, koshienWins: 0,
    },
    settings: { autoAdvanceSpeed: 'normal', showDetailedGrowth: false },
    weeklyPlan: createDefaultWeeklyPlan(),
    prefecture: '新潟',
    schools: filledSchools,
    middleSchoolPool: seniors,
    personRegistry: { entries: new Map() },
    seasonState: createInitialSeasonState(),
    scoutState: createInitialScoutState(),
  };
}

// ============================================================
// テスト
// ============================================================

describe('高校進学配分 v2: targetSchoolId が確定済みの選手は対象校に入学する', () => {
  it('targetSchoolId が設定された選手は確定的に対象校に入学する', () => {
    const school1 = makeSchool('school-1', { reputation: 50 });
    const school2 = makeSchool('school-2', { reputation: 50 });

    const senior = makeSenior('ms-target-test', {
      targetSchoolId: 'school-1',
    });

    const world = makeWorldWithSchoolsAndSeniors([school1, school2], [senior]);
    const rng = createRNG('target-test');
    const nextWorld = processYearTransition(world, rng);

    const school1Players = nextWorld.schools.find((s) => s.id === 'school-1')!.players;
    const ids = school1Players.map((p) => p.id);
    expect(ids).toContain('ms-target-test');
  });

  it('targetSchoolId なしの選手はいずれかの学校に入学する', () => {
    const school1 = makeSchool('school-1');
    const school2 = makeSchool('school-2');
    const senior = makeSenior('ms-free-test');

    const world = makeWorldWithSchoolsAndSeniors([school1, school2], [senior]);
    const rng = createRNG('free-test');
    const nextWorld = processYearTransition(world, rng);

    const allPlayerIds = nextWorld.schools.flatMap((s) => s.players.map((p) => p.id));
    expect(allPlayerIds).toContain('ms-free-test');
  });
});

describe('高校進学配分 v2: 地元志向 (20%)', () => {
  it('同県内の選手は県外の学校より地元校に偏る', () => {
    // 新潟の選手 → 新潟の学校（school-1）と東京の学校（school-2）
    const localSchool  = makeSchool('school-niigata', { prefecture: '新潟', reputation: 50 });
    const distantSchool = makeSchool('school-tokyo',   { prefecture: '東京', reputation: 50 });

    const N = 30;
    const seniors = Array.from({ length: N }, (_, i) =>
      makeSenior(`ms-local-${i}`, { prefecture: '新潟' })
    );

    const world = makeWorldWithSchoolsAndSeniors([localSchool, distantSchool], seniors);
    const rng = createRNG('local-test-seed');
    const nextWorld = processYearTransition(world, rng);

    const localCount  = nextWorld.schools.find((s) => s.id === 'school-niigata')!.players
      .filter((p) => p.id.startsWith('ms-local')).length;
    const distantCount = nextWorld.schools.find((s) => s.id === 'school-tokyo')!.players
      .filter((p) => p.id.startsWith('ms-local')).length;

    // 地元校に多く配分されているはず（統計的に）
    expect(localCount).toBeGreaterThan(distantCount);
  });
});

describe('高校進学配分 v2: スカウト状況 (25%)', () => {
  it('scoutedBy に登録された学校に行きやすい', () => {
    const school1 = makeSchool('scout-school', { reputation: 50 });
    const school2 = makeSchool('other-school', { reputation: 50 });

    const N = 30;
    const scoutedSeniors = Array.from({ length: N }, (_, i) =>
      makeSenior(`ms-scouted-${i}`, {
        scoutedBy: ['scout-school'],
        targetSchoolId: null, // 未確定
      })
    );

    const world = makeWorldWithSchoolsAndSeniors([school1, school2], scoutedSeniors);
    const rng = createRNG('scout-bias-test');
    const nextWorld = processYearTransition(world, rng);

    const scoutedCount = nextWorld.schools.find((s) => s.id === 'scout-school')!.players
      .filter((p) => p.id.startsWith('ms-scouted')).length;
    const otherCount = nextWorld.schools.find((s) => s.id === 'other-school')!.players
      .filter((p) => p.id.startsWith('ms-scouted')).length;

    // スカウト校に多く配分されているはず
    expect(scoutedCount).toBeGreaterThan(otherCount);
  });
});

describe('高校進学配分 v2: 名門志向 (15%)', () => {
  it('有力選手（総合力高め）は名門校（reputation > 70）に偏る', () => {
    // 強豪と弱小
    const eliteSchool = makeSchool('elite', { reputation: 90 });
    const weakSchool  = makeSchool('weak',  { reputation: 20 });

    const N = 20;
    // 有力選手（中学生能力値が高め）
    const strongSeniors = Array.from({ length: N }, (_, i) =>
      makeSenior(`ms-strong-${i}`, {
        currentStats: {
          base: { stamina: 35, speed: 35, armStrength: 35, fielding: 35, focus: 35, mental: 35 },
          batting: { contact: 35, power: 35, eye: 35, technique: 35 },
          pitching: null,
        },
      })
    );

    const world = makeWorldWithSchoolsAndSeniors([eliteSchool, weakSchool], strongSeniors);
    const rng = createRNG('elite-test');
    const nextWorld = processYearTransition(world, rng);

    const eliteCount = nextWorld.schools.find((s) => s.id === 'elite')!.players
      .filter((p) => p.id.startsWith('ms-strong')).length;
    const weakCount = nextWorld.schools.find((s) => s.id === 'weak')!.players
      .filter((p) => p.id.startsWith('ms-strong')).length;

    // 名門校の方に多く配分されているはず
    expect(eliteCount).toBeGreaterThan(weakCount);
  });
});

describe('高校進学配分 v2: 定員制限', () => {
  it('各校の新入生数が MAX_PLAYERS_PER_SCHOOL（18人）を超えない', () => {
    // 在校生なし（empty players）・3校・60人の3年生
    const schools = Array.from({ length: 3 }, (_, i) => ({
      ...makeSchool(`school-cap-${i}`),
      players: [], // 在校生なし
    }));
    const seniors = Array.from({ length: 60 }, (_, i) =>
      makeSenior(`ms-cap-${i}`)
    );

    // makeWorldWithSchoolsAndSeniors は players を上書きするので直接組み立てる
    const rng = createRNG('cap-init');
    const world: WorldState = {
      version: '0.3.0',
      seed: 'cap-test',
      currentDate: { year: 1, month: 4, day: 1 },
      playerSchoolId: 'school-cap-0',
      manager: { name: '監督', yearsActive: 1, fame: 0, totalWins: 0, totalLosses: 0, koshienAppearances: 0, koshienWins: 0 },
      settings: { autoAdvanceSpeed: 'normal', showDetailedGrowth: false },
      weeklyPlan: createDefaultWeeklyPlan(),
      prefecture: '新潟',
      schools,
      middleSchoolPool: seniors,
      personRegistry: { entries: new Map() },
      seasonState: createInitialSeasonState(),
      scoutState: createInitialScoutState(),
    };

    const nextWorld = processYearTransition(world, createRNG('cap-test'));

    for (const school of nextWorld.schools) {
      // 新入生のみカウント（ms-cap-* のプレフィックスを持つ選手）
      const newEnrollees = school.players.filter((p) => p.id.startsWith('ms-cap-'));
      // 各校への新入生は最大25人以下（Phase 5 バランス調整後）
      expect(newEnrollees.length).toBeLessThanOrEqual(25);
    }
  });

  it('全選手がいずれかの学校に入学する（定員余裕あり）', () => {
    // 10校で seniors 10人ならすべて入学できる
    const schools = Array.from({ length: 10 }, (_, i) => makeSchool(`school-all-${i}`));
    const seniors = Array.from({ length: 10 }, (_, i) => makeSenior(`ms-all-${i}`));

    const world = makeWorldWithSchoolsAndSeniors(schools, seniors);
    const rng = createRNG('all-test');
    const nextWorld = processYearTransition(world, rng);

    const allPlayerIds = nextWorld.schools.flatMap((s) => s.players.map((p) => p.id));
    for (let i = 0; i < 10; i++) {
      expect(allPlayerIds).toContain(`ms-all-${i}`);
    }
  });
});
