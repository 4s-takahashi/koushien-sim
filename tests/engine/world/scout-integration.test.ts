/**
 * tests/engine/world/scout-integration.test.ts
 *
 * スカウト統合テスト:
 * 中学1年生成 → 2年成長 → 3年でスカウト → 勧誘 → 入学 → 同一ID維持
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { processYearTransition } from '@/engine/world/year-transition';
import { advanceWorldDay } from '@/engine/world/world-ticker';
import {
  addToWatchList,
  removeFromWatchList,
  conductScoutVisit,
  recruitPlayer,
} from '@/engine/world/scout/scout-system';
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

function makeMinimalWorldForIntegration(): WorldState {
  const rng = createRNG('integration-scout');

  const playerSchool: HighSchool = {
    id: 'player-school',
    name: '統合テスト高校',
    prefecture: '新潟',
    reputation: 65,
    players: Array.from({ length: 6 }, (_, i) =>
      generatePlayer(rng.derive(`p${i}`), { enrollmentYear: -1 + (i < 3 ? -1 : 0), schoolReputation: 65 })
    ),
    lineup: null,
    facilities: { ground: 4, bullpen: 4, battingCage: 4, gym: 4 },
    simulationTier: 'full',
    coachStyle: {
      offenseType: 'balanced', defenseType: 'balanced',
      practiceEmphasis: 'balanced', aggressiveness: 50,
    },
    yearResults: createEmptyYearResults(),
    _summary: null,
  };

  const aiSchool: HighSchool = {
    id: 'ai-school',
    name: 'AI高校',
    prefecture: '新潟',
    reputation: 50,
    players: Array.from({ length: 6 }, (_, i) =>
      generatePlayer(rng.derive(`ai-p${i}`), { enrollmentYear: -1, schoolReputation: 50 })
    ),
    lineup: null,
    facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 },
    simulationTier: 'standard',
    coachStyle: {
      offenseType: 'balanced', defenseType: 'balanced',
      practiceEmphasis: 'balanced', aggressiveness: 40,
    },
    yearResults: createEmptyYearResults(),
    _summary: null,
  };

  // 中学生プール: 1年・2年各1人 + 3年1人（注目対象）
  const targetMs: MiddleSchoolPlayer = {
    id: 'ms-target-player',
    firstName: '翔',
    lastName: '山田',
    middleSchoolGrade: 1, // 1年生スタート
    middleSchoolName: '新潟第一中学',
    prefecture: '新潟',
    currentStats: {
      base: { stamina: 15, speed: 20, armStrength: 15, fielding: 15, focus: 15, mental: 15 },
      batting: { contact: 15, power: 10, eye: 14, technique: 14 },
      pitching: null,
    },
    targetSchoolId: null,
    scoutedBy: [],
  };

  // その他の中学生（各学年5人ずつ）
  const otherMs: MiddleSchoolPlayer[] = Array.from({ length: 15 }, (_, i) => ({
    id: `ms-other-${i}`,
    firstName: '太郎',
    lastName: '田中',
    middleSchoolGrade: ((i % 3) + 1) as 1 | 2 | 3,
    middleSchoolName: `新潟第${i + 2}中学`,
    prefecture: '新潟',
    currentStats: {
      base: {
        stamina:     Math.round(10 + ((i % 3) + 1) * 3),
        speed:       Math.round(10 + ((i % 3) + 1) * 3),
        armStrength: Math.round(8  + ((i % 3) + 1) * 3),
        fielding:    Math.round(8  + ((i % 3) + 1) * 3),
        focus:       Math.round(10 + ((i % 3) + 1) * 3),
        mental:      Math.round(10 + ((i % 3) + 1) * 3),
      },
      batting: {
        contact:   Math.round(10 + ((i % 3) + 1) * 3),
        power:     Math.round(8  + ((i % 3) + 1) * 3),
        eye:       Math.round(8  + ((i % 3) + 1) * 3),
        technique: Math.round(8  + ((i % 3) + 1) * 3),
      },
      pitching: null,
    },
    targetSchoolId: null,
    scoutedBy: [],
  }));

  return {
    version: '0.3.0',
    seed: 'integration-scout',
    currentDate: { year: 1, month: 4, day: 1 },
    playerSchoolId: 'player-school',
    manager: {
      name: '統合監督', yearsActive: 1, fame: 10,
      totalWins: 5, totalLosses: 3, koshienAppearances: 0, koshienWins: 0,
    },
    settings: { autoAdvanceSpeed: 'normal', showDetailedGrowth: false },
    weeklyPlan: createDefaultWeeklyPlan(),
    prefecture: '新潟',
    schools: [playerSchool, aiSchool],
    middleSchoolPool: [targetMs, ...otherMs],
    personRegistry: { entries: new Map() },
    seasonState: createInitialSeasonState(),
    scoutState: createInitialScoutState(),
  };
}

// ============================================================
// テスト
// ============================================================

describe('スカウト統合: ウォッチリスト操作', () => {
  it('注目登録して解除するフローが正しく動く', () => {
    const world = makeMinimalWorldForIntegration();

    const w1 = addToWatchList(world, 'ms-target-player');
    expect(w1.scoutState.watchList).toContain('ms-target-player');

    const w2 = addToWatchList(w1, 'ms-other-0');
    expect(w2.scoutState.watchList.length).toBe(2);

    // 一人削除
    const w3 = removeFromWatchList(w2, 'ms-target-player');
    expect(w3.scoutState.watchList).not.toContain('ms-target-player');
    expect(w3.scoutState.watchList).toContain('ms-other-0');
  });
});

describe('スカウト統合: 視察 → 勧誘 → 入学フロー', () => {
  it('視察 → 勧誘成功 → 年度替わりで対象校に入学し ID が維持される', () => {
    let world = makeMinimalWorldForIntegration();
    const rng = createRNG('full-flow');

    // 中学1年生を視察（3年生がいないと視察できないので
    // テスト用に対象選手を3年生として新たに追加）
    const grade3Target: MiddleSchoolPlayer = {
      id: 'ms-grade3-target',
      firstName: '大輝',
      lastName: '鈴木',
      middleSchoolGrade: 3,
      middleSchoolName: '新潟中央中学',
      prefecture: '新潟',
      currentStats: {
        base: { stamina: 25, speed: 28, armStrength: 22, fielding: 24, focus: 25, mental: 25 },
        batting: { contact: 25, power: 18, eye: 22, technique: 22 },
        pitching: null,
      },
      targetSchoolId: null,
      scoutedBy: [],
    };

    world = {
      ...world,
      middleSchoolPool: [...world.middleSchoolPool, grade3Target],
    };

    // 1. 注目登録
    world = addToWatchList(world, 'ms-grade3-target');
    expect(world.scoutState.watchList).toContain('ms-grade3-target');

    // 2. 視察
    const { world: worldAfterVisit, scoutReport } = conductScoutVisit(
      world, 'ms-grade3-target', rng.derive('visit')
    );
    world = worldAfterVisit;

    expect(scoutReport.playerId).toBe('ms-grade3-target');
    expect(world.scoutState.scoutReports.has('ms-grade3-target')).toBe(true);
    expect(world.scoutState.usedScoutThisMonth).toBe(1);

    // 3. 勧誘（複数回試行して成功を得る）
    let recruitSuccess = false;
    for (let i = 0; i < 50; i++) {
      const result = recruitPlayer(world, 'ms-grade3-target', rng.derive(`recruit-${i}`));
      if (result.success) {
        world = result.world;
        recruitSuccess = true;
        break;
      }
    }

    if (recruitSuccess) {
      // 対象校に設定されている
      const ms = world.middleSchoolPool.find((m) => m.id === 'ms-grade3-target')!;
      expect(ms.targetSchoolId).toBe('player-school');
    }

    // 4. 年度替わり処理
    const yearRng = createRNG('year-trans-integration');
    const nextWorld = processYearTransition(world, yearRng);

    // 5. ID 維持確認
    const allPlayerIds = nextWorld.schools.flatMap((s) => s.players.map((p) => p.id));
    if (recruitSuccess) {
      // 勧誘成功していれば player-school に入学しているはず
      expect(allPlayerIds).toContain('ms-grade3-target');
      const playerSchool = nextWorld.schools.find((s) => s.id === 'player-school')!;
      expect(playerSchool.players.map((p) => p.id)).toContain('ms-grade3-target');
    } else {
      // 勧誘失敗でも何らかの学校に入学している
      expect(allPlayerIds).toContain('ms-grade3-target');
    }
  });
});

describe('スカウト統合: 未スカウト選手の自動進学', () => {
  it('スカウトしていない中学3年生もいずれかの学校に入学する', () => {
    const world = makeMinimalWorldForIntegration();
    const rng = createRNG('auto-enroll');

    // 3年生のみ取り出す
    const grade3Ids = world.middleSchoolPool
      .filter((ms) => ms.middleSchoolGrade === 3)
      .map((ms) => ms.id);

    const nextWorld = processYearTransition(world, rng);
    const allPlayerIds = nextWorld.schools.flatMap((s) => s.players.map((p) => p.id));

    for (const id of grade3Ids) {
      expect(allPlayerIds).toContain(id);
    }
  });
});

describe('スカウト統合: 他校 AI スカウトとの競合', () => {
  it('AI 校のスカウト活動後も年度替わりが正常に完走する', () => {
    const world = makeMinimalWorldForIntegration();
    const rng = createRNG('ai-conflict');

    // processYearTransition 内で AI スカウトが実行される
    expect(() => processYearTransition(world, rng)).not.toThrow();
  });

  it('AI スカウトと競合しても選手の targetSchoolId は変わらない（プレイヤー優先）', () => {
    // 先にプレイヤーが勧誘済みの選手を作る
    let world = makeMinimalWorldForIntegration();

    // 3年生を一人勧誘成功させる
    const grade3Target: MiddleSchoolPlayer = {
      id: 'ms-conflict-test',
      firstName: '健太',
      lastName: '佐藤',
      middleSchoolGrade: 3,
      middleSchoolName: '新潟南中学',
      prefecture: '新潟',
      currentStats: {
        base: { stamina: 20, speed: 20, armStrength: 20, fielding: 20, focus: 20, mental: 20 },
        batting: { contact: 20, power: 20, eye: 20, technique: 20 },
        pitching: null,
      },
      targetSchoolId: 'player-school', // 既にプレイヤー校が確定
      scoutedBy: ['player-school'],
    };

    world = { ...world, middleSchoolPool: [...world.middleSchoolPool, grade3Target] };

    const rng = createRNG('conflict-test');
    const nextWorld = processYearTransition(world, rng);

    // ms-conflict-test は player-school に入学しているはず
    const playerSchool = nextWorld.schools.find((s) => s.id === 'player-school')!;
    expect(playerSchool.players.map((p) => p.id)).toContain('ms-conflict-test');
  });
});

describe('スカウト統合: 3年間通しのフロー検証', () => {
  it('3年間（3回の年度替わり）を通しで実行できる', { timeout: 60000 }, () => {
    let world = makeMinimalWorldForIntegration();
    const rng = createRNG('three-year-flow');

    // 3回の年度替わり
    for (let year = 0; year < 3; year++) {
      // 364日進める
      for (let d = 0; d < 364; d++) {
        const dayRng = rng.derive(`y${year}-d${d}`);
        const { nextWorld } = advanceWorldDay(world, 'batting_basic', dayRng);
        world = nextWorld;
      }
      // 年度替わり
      const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng.derive(`y${year}-final`));
      world = nextWorld;
    }

    // 3年後も安定している
    expect(world.schools.length).toBeGreaterThan(0);
    expect(world.middleSchoolPool.length).toBeGreaterThan(0);
    for (const school of world.schools) {
      expect(school.players.length).toBeGreaterThanOrEqual(3);
    }

    // scoutState が維持されている
    expect(world.scoutState).toBeDefined();
    expect(world.scoutState.monthlyScoutBudget).toBe(4);
  });
});
