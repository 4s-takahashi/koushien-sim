/**
 * tests/engine/world/year-transition.test.ts
 *
 * 年度替わりの各処理ステップを検証する。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { processYearTransition } from '@/engine/world/year-transition';
import { createWorldState } from '@/engine/world/create-world';
import type { WorldState, HighSchool, MiddleSchoolPlayer } from '@/engine/world/world-state';
import { createEmptyYearResults, createDefaultWeeklyPlan, createInitialSeasonState, createInitialScoutState } from '@/engine/world/world-state';
import { generatePlayer } from '@/engine/player/generate';

// ============================================================
// テストヘルパー
// ============================================================

function makeMinimalWorld(): WorldState {
  const rng = createRNG('year-transition-test');
  const team = {
    id: 'player-school',
    name: 'テスト高校',
    prefecture: '新潟',
    reputation: 60,
    players: [
      // 3年生（currentYear=1 に入学した選手 → grade=3 when currentYear=3）
      generatePlayer(rng.derive('p1'), { enrollmentYear: -1, schoolReputation: 60 }),
      generatePlayer(rng.derive('p2'), { enrollmentYear: -1, schoolReputation: 60 }),
      generatePlayer(rng.derive('p3'), { enrollmentYear: -1, schoolReputation: 60 }),
      // 2年生
      generatePlayer(rng.derive('p4'), { enrollmentYear: 0, schoolReputation: 60 }),
      generatePlayer(rng.derive('p5'), { enrollmentYear: 0, schoolReputation: 60 }),
      // 1年生
      generatePlayer(rng.derive('p6'), { enrollmentYear: 1, schoolReputation: 60 }),
      generatePlayer(rng.derive('p7'), { enrollmentYear: 1, schoolReputation: 60 }),
    ],
    lineup: null,
    facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 },
  };

  // enrollmentYear を固定して年度確定させる
  const players = team.players.map((p, i) => ({
    ...p,
    enrollmentYear: i < 3 ? -1 : i < 5 ? 0 : 1,
  }));

  const manager = { name: '監督', yearsActive: 1, fame: 0, totalWins: 0, totalLosses: 0, koshienAppearances: 0, koshienWins: 0 };

  const playerSchool: HighSchool = {
    id: 'player-school',
    name: 'テスト高校',
    prefecture: '新潟',
    reputation: 60,
    players,
    lineup: null,
    facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 },
    simulationTier: 'full',
    coachStyle: { offenseType: 'balanced', defenseType: 'balanced', practiceEmphasis: 'balanced', aggressiveness: 50 },
    yearResults: createEmptyYearResults(),
    _summary: null,
  };

  // 最小の中学生プール（中学3年生3人）
  const msPlayers: MiddleSchoolPlayer[] = [
    {
      id: 'ms-grade3-1',
      firstName: '一郎',
      lastName: '中学',
      middleSchoolGrade: 3,
      middleSchoolName: '新潟第一中学',
      prefecture: '新潟',
      currentStats: {
        base: { stamina: 20, speed: 22, armStrength: 18, fielding: 20, focus: 20, mental: 20 },
        batting: { contact: 20, power: 15, eye: 18, technique: 18 },
        pitching: null,
      },
      targetSchoolId: 'player-school',
      scoutedBy: ['player-school'],
    },
    {
      id: 'ms-grade3-2',
      firstName: '二郎',
      lastName: '中学',
      middleSchoolGrade: 3,
      middleSchoolName: '新潟第二中学',
      prefecture: '新潟',
      currentStats: {
        base: { stamina: 18, speed: 20, armStrength: 16, fielding: 18, focus: 18, mental: 18 },
        batting: { contact: 18, power: 12, eye: 16, technique: 16 },
        pitching: null,
      },
      targetSchoolId: null,
      scoutedBy: [],
    },
    {
      id: 'ms-grade2-1',
      firstName: '三郎',
      lastName: '中学',
      middleSchoolGrade: 2,
      middleSchoolName: '新潟北中学',
      prefecture: '新潟',
      currentStats: {
        base: { stamina: 15, speed: 16, armStrength: 14, fielding: 15, focus: 15, mental: 15 },
        batting: { contact: 15, power: 10, eye: 14, technique: 14 },
        pitching: null,
      },
      targetSchoolId: null,
      scoutedBy: [],
    },
  ];

  return {
    version: '0.3.0',
    seed: 'test',
    currentDate: { year: 1, month: 4, day: 1 },
    playerSchoolId: 'player-school',
    manager,
    settings: { autoAdvanceSpeed: 'normal', showDetailedGrowth: false },
    weeklyPlan: createDefaultWeeklyPlan(),
    prefecture: '新潟',
    schools: [playerSchool],
    middleSchoolPool: msPlayers,
    personRegistry: { entries: new Map() },
    seasonState: createInitialSeasonState(),
    scoutState: createInitialScoutState(),
  };
}

// ============================================================
// テスト
// ============================================================

describe('processYearTransition', () => {
  it('3年生が卒業してチームから消える', () => {
    const world = makeMinimalWorld();
    const rng = createRNG('yr-trans-1');

    const playerSchool = world.schools.find((s) => s.id === 'player-school')!;
    const seniorIds = playerSchool.players
      .filter((p) => world.currentDate.year - p.enrollmentYear + 1 >= 3)
      .map((p) => p.id);
    expect(seniorIds.length).toBeGreaterThan(0);

    const nextWorld = processYearTransition(world, rng);

    const updatedSchool = nextWorld.schools.find((s) => s.id === 'player-school')!;
    const remainingIds = updatedSchool.players.map((p) => p.id);

    // 3年生は残っていない
    for (const seniorId of seniorIds) {
      expect(remainingIds).not.toContain(seniorId);
    }
  });

  it('中学3年生が高校入学処理で Player に変換される', () => {
    const world = makeMinimalWorld();
    const rng = createRNG('yr-trans-2');

    const grade3Ids = world.middleSchoolPool
      .filter((ms) => ms.middleSchoolGrade === 3)
      .map((ms) => ms.id);
    expect(grade3Ids.length).toBe(2); // ms-grade3-1, ms-grade3-2

    const nextWorld = processYearTransition(world, rng);

    // 元々の中学3年生 (ms-grade3-1, ms-grade3-2) が middleSchoolPool から消えた
    // （grade=2 だった ms-grade2-1 は grade=3 に昇格して残る）
    const grade3InPool = nextWorld.middleSchoolPool.filter((ms) => ms.middleSchoolGrade === 3);
    // ms-grade3-1, ms-grade3-2 は消えたはず
    const originalGrade3StillPresent = grade3InPool.filter(
      (ms) => ms.id === 'ms-grade3-1' || ms.id === 'ms-grade3-2'
    );
    expect(originalGrade3StillPresent.length).toBe(0); // 元の3年生は消えた

    // 全高校の選手リストに grade3 の ID がある（どこかの学校に入学した）
    const allPlayerIds = nextWorld.schools.flatMap((s) => s.players.map((p) => p.id));
    // ms-grade3-1 は targetSchoolId='player-school' なので player-school に入学しているはず
    expect(allPlayerIds).toContain('ms-grade3-1');
  });

  it('同一ID維持: 中学生→高校生のID一貫性', () => {
    const world = makeMinimalWorld();
    const rng = createRNG('yr-trans-3');

    const grade3Id = 'ms-grade3-1'; // targetSchoolId = 'player-school'

    const nextWorld = processYearTransition(world, rng);
    const playerSchool = nextWorld.schools.find((s) => s.id === 'player-school')!;

    const newPlayer = playerSchool.players.find((p) => p.id === grade3Id);
    expect(newPlayer).toBeDefined();
    expect(newPlayer!.id).toBe(grade3Id); // ID は変わっていない
  });

  it('中学生の進級: grade が 2→3 に上がる', () => {
    const world = makeMinimalWorld();
    const rng = createRNG('yr-trans-4');

    const grade2Id = 'ms-grade2-1'; // middleSchoolGrade = 2

    const nextWorld = processYearTransition(world, rng);

    // grade2-1 が grade3 に昇格しているはず
    const promoted = nextWorld.middleSchoolPool.find((ms) => ms.id === grade2Id);
    expect(promoted).toBeDefined();
    expect(promoted!.middleSchoolGrade).toBe(3);
  });

  it('新中学1年生が生成される', () => {
    const world = makeMinimalWorld();
    const beforeCount = world.middleSchoolPool.length;
    const rng = createRNG('yr-trans-5');

    const nextWorld = processYearTransition(world, rng);

    // 新中学1年生が追加される（360人: Phase 5 バランス調整後）
    const newGrade1 = nextWorld.middleSchoolPool.filter((ms) => ms.middleSchoolGrade === 1);
    expect(newGrade1.length).toBe(360);
  });

  it('年度替わり後にチームにプレイヤーが最低3人いる', () => {
    const world = makeMinimalWorld();
    const rng = createRNG('yr-trans-min');

    const nextWorld = processYearTransition(world, rng);

    for (const school of nextWorld.schools) {
      expect(school.players.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('監督の yearsActive が増加する', () => {
    const world = makeMinimalWorld();
    const before = world.manager.yearsActive;
    const rng = createRNG('yr-trans-mgr');

    const nextWorld = processYearTransition(world, rng);
    expect(nextWorld.manager.yearsActive).toBe(before + 1);
  });
});
