/**
 * tests/engine/world/scout-system.test.ts
 *
 * スカウトシステムのユニットテスト。
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import {
  searchMiddleSchoolers,
  addToWatchList,
  removeFromWatchList,
  conductScoutVisit,
  recruitPlayer,
  computeMiddleSchoolOverall,
  runAISchoolScouting,
} from '@/engine/world/scout/scout-system';
import type { WorldState, MiddleSchoolPlayer, HighSchool } from '@/engine/world/world-state';
import {
  createEmptyYearResults,
  createDefaultWeeklyPlan,
  createInitialSeasonState,
  createInitialScoutState,
} from '@/engine/world/world-state';

// ============================================================
// テストヘルパー
// ============================================================

function makeMiddleSchooler(
  overrides: Partial<MiddleSchoolPlayer> = {},
): MiddleSchoolPlayer {
  return {
    id: 'ms-test-1',
    firstName: '太郎',
    lastName: '田中',
    middleSchoolGrade: 3,
    middleSchoolName: '新潟第一中学',
    prefecture: '新潟',
    currentStats: {
      base: { stamina: 20, speed: 22, armStrength: 18, fielding: 20, focus: 20, mental: 20 },
      batting: { contact: 20, power: 15, eye: 18, technique: 18 },
      pitching: null,
    },
    targetSchoolId: null,
    scoutedBy: [],
    ...overrides,
  };
}

function makeHighSchool(overrides: Partial<HighSchool> = {}): HighSchool {
  return {
    id: 'school-1',
    name: '新潟高校',
    prefecture: '新潟',
    reputation: 60,
    players: [],
    lineup: null,
    facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 },
    simulationTier: 'full',
    coachStyle: {
      offenseType: 'balanced',
      defenseType: 'balanced',
      practiceEmphasis: 'balanced',
      aggressiveness: 50,
    },
    yearResults: createEmptyYearResults(),
    _summary: null,
    ...overrides,
  };
}

function makeMinimalWorld(
  pool: MiddleSchoolPlayer[] = [],
  schools: HighSchool[] = [],
): WorldState {
  const playerSchool = makeHighSchool({ id: 'player-school', name: 'テスト高校' });
  return {
    version: '0.3.0',
    seed: 'scout-test',
    currentDate: { year: 1, month: 9, day: 1 },
    playerSchoolId: 'player-school',
    manager: {
      name: '監督', yearsActive: 1, fame: 0,
      totalWins: 0, totalLosses: 0, koshienAppearances: 0, koshienWins: 0,
    },
    settings: { autoAdvanceSpeed: 'normal', showDetailedGrowth: false },
    weeklyPlan: createDefaultWeeklyPlan(),
    prefecture: '新潟',
    schools: [playerSchool, ...schools],
    middleSchoolPool: pool,
    personRegistry: { entries: new Map() },
    seasonState: createInitialSeasonState(),
    scoutState: createInitialScoutState(),
  };
}

// ============================================================
// computeMiddleSchoolOverall
// ============================================================

describe('computeMiddleSchoolOverall', () => {
  it('能力値が高いほど総合力が高い', () => {
    const low = makeMiddleSchooler({
      currentStats: {
        base: { stamina: 5, speed: 5, armStrength: 5, fielding: 5, focus: 5, mental: 5 },
        batting: { contact: 5, power: 5, eye: 5, technique: 5 },
        pitching: null,
      },
    });
    const high = makeMiddleSchooler({
      currentStats: {
        base: { stamina: 40, speed: 40, armStrength: 40, fielding: 40, focus: 40, mental: 40 },
        batting: { contact: 40, power: 40, eye: 40, technique: 40 },
        pitching: null,
      },
    });

    expect(computeMiddleSchoolOverall(high)).toBeGreaterThan(computeMiddleSchoolOverall(low));
  });

  it('最大値（全50）で総合力 100 になる', () => {
    const maxMs = makeMiddleSchooler({
      currentStats: {
        base: { stamina: 50, speed: 50, armStrength: 50, fielding: 50, focus: 50, mental: 50 },
        batting: { contact: 50, power: 50, eye: 50, technique: 50 },
        pitching: null,
      },
    });
    expect(computeMiddleSchoolOverall(maxMs)).toBe(100);
  });
});

// ============================================================
// searchMiddleSchoolers
// ============================================================

describe('searchMiddleSchoolers', () => {
  const pool: MiddleSchoolPlayer[] = [
    makeMiddleSchooler({ id: 'ms-1', middleSchoolGrade: 3, prefecture: '新潟' }),
    makeMiddleSchooler({ id: 'ms-2', middleSchoolGrade: 2, prefecture: '新潟' }),
    makeMiddleSchooler({ id: 'ms-3', middleSchoolGrade: 3, prefecture: '東京' }),
    makeMiddleSchooler({
      id: 'ms-4',
      middleSchoolGrade: 3,
      prefecture: '新潟',
      currentStats: {
        base: { stamina: 1, speed: 1, armStrength: 1, fielding: 1, focus: 1, mental: 1 },
        batting: { contact: 1, power: 1, eye: 1, technique: 1 },
        pitching: null,
      },
    }),
  ];

  it('学年フィルタが正しく動く', () => {
    const result = searchMiddleSchoolers(pool, { grade: 3 });
    expect(result.map((m) => m.id)).toContain('ms-1');
    expect(result.map((m) => m.id)).toContain('ms-3');
    expect(result.map((m) => m.id)).not.toContain('ms-2');
  });

  it('都道府県フィルタが正しく動く', () => {
    const result = searchMiddleSchoolers(pool, { prefecture: '新潟' });
    expect(result.map((m) => m.id)).toContain('ms-1');
    expect(result.map((m) => m.id)).toContain('ms-2');
    expect(result.map((m) => m.id)).not.toContain('ms-3');
  });

  it('複合フィルタ（学年＋都道府県）が正しく動く', () => {
    const result = searchMiddleSchoolers(pool, { grade: 3, prefecture: '新潟' });
    expect(result.map((m) => m.id)).toContain('ms-1');
    expect(result.map((m) => m.id)).not.toContain('ms-2'); // grade 2
    expect(result.map((m) => m.id)).not.toContain('ms-3'); // 東京
  });

  it('minReputation フィルタが総合力で機能する', () => {
    const result = searchMiddleSchoolers(pool, { minReputation: 10 });
    // ms-4 は能力値が低いので除外されるはず
    expect(result.map((m) => m.id)).not.toContain('ms-4');
    expect(result.map((m) => m.id)).toContain('ms-1');
  });

  it('フィルタなしで全員返す', () => {
    const result = searchMiddleSchoolers(pool, {});
    expect(result.length).toBe(pool.length);
  });

  it('条件に一致しない場合は空配列', () => {
    const result = searchMiddleSchoolers(pool, { grade: 1, prefecture: '大阪' });
    expect(result.length).toBe(0);
  });
});

// ============================================================
// addToWatchList / removeFromWatchList
// ============================================================

describe('addToWatchList / removeFromWatchList', () => {
  it('注目登録が WorldState の watchList に反映される', () => {
    const world = makeMinimalWorld();
    const newWorld = addToWatchList(world, 'ms-abc');
    expect(newWorld.scoutState.watchList).toContain('ms-abc');
    // 元の WorldState は変わらない（不変）
    expect(world.scoutState.watchList).not.toContain('ms-abc');
  });

  it('同じ選手を二重登録しても重複しない', () => {
    const world = makeMinimalWorld();
    const w1 = addToWatchList(world, 'ms-abc');
    const w2 = addToWatchList(w1, 'ms-abc');
    expect(w2.scoutState.watchList.filter((id) => id === 'ms-abc').length).toBe(1);
  });

  it('注目解除が watchList から削除される', () => {
    const world = makeMinimalWorld();
    const w1 = addToWatchList(world, 'ms-abc');
    const w2 = removeFromWatchList(w1, 'ms-abc');
    expect(w2.scoutState.watchList).not.toContain('ms-abc');
  });

  it('存在しない選手を解除しても例外が出ない', () => {
    const world = makeMinimalWorld();
    expect(() => removeFromWatchList(world, 'non-existent')).not.toThrow();
  });
});

// ============================================================
// conductScoutVisit
// ============================================================

describe('conductScoutVisit', () => {
  it('視察レポートが生成される', () => {
    const ms = makeMiddleSchooler();
    const world = makeMinimalWorld([ms]);
    const rng = createRNG('scout-visit-1');

    const { scoutReport } = conductScoutVisit(world, ms.id, rng);

    expect(scoutReport.playerId).toBe(ms.id);
    expect(scoutReport.confidence).toBeGreaterThan(0);
    expect(scoutReport.confidence).toBeLessThanOrEqual(0.95);
    expect(scoutReport.scoutComment.length).toBeGreaterThan(0);
    expect(['S', 'A', 'B', 'C', 'D']).toContain(scoutReport.estimatedQuality);
  });

  it('観測値に誤差がある（実際の能力と完全一致しない可能性がある）', () => {
    const ms = makeMiddleSchooler({
      currentStats: {
        base: { stamina: 20, speed: 20, armStrength: 20, fielding: 20, focus: 20, mental: 20 },
        batting: { contact: 20, power: 20, eye: 20, technique: 20 },
        pitching: null,
      },
    });
    const world = makeMinimalWorld([ms]);

    // 10回試行して少なくとも1回は誤差が出る（confidence < 0.9 なら誤差が出る）
    let hasError = false;
    for (let i = 0; i < 20; i++) {
      const rng = createRNG(`scout-error-${i}`);
      const { scoutReport } = conductScoutVisit(world, ms.id, rng);
      const obsBase = scoutReport.observedStats.base;
      if (obsBase) {
        if (
          obsBase.stamina !== 20 || obsBase.speed !== 20 ||
          obsBase.armStrength !== 20 || obsBase.fielding !== 20
        ) {
          hasError = true;
          break;
        }
      }
    }
    expect(hasError).toBe(true);
  });

  it('視察後に usedScoutThisMonth が増加する', () => {
    const ms = makeMiddleSchooler();
    const world = makeMinimalWorld([ms]);
    const rng = createRNG('scout-budget-1');

    const { world: newWorld } = conductScoutVisit(world, ms.id, rng);
    expect(newWorld.scoutState.usedScoutThisMonth).toBe(1);
  });

  it('月次予算を超えた視察は例外をスローする', () => {
    const ms = makeMiddleSchooler();
    const worldFull = makeMinimalWorld([ms]);
    // 予算を使い切った状態にする
    const fullWorld: WorldState = {
      ...worldFull,
      scoutState: {
        ...worldFull.scoutState,
        usedScoutThisMonth: 4,
        monthlyScoutBudget: 4,
      },
    };

    const rng = createRNG('scout-over-budget');
    expect(() => conductScoutVisit(fullWorld, ms.id, rng)).toThrow();
  });

  it('存在しない選手への視察は例外をスローする', () => {
    const world = makeMinimalWorld([]);
    const rng = createRNG('scout-not-found');
    expect(() => conductScoutVisit(world, 'non-existent-id', rng)).toThrow();
  });

  it('視察レポートが scoutReports Map に保存される', () => {
    const ms = makeMiddleSchooler();
    const world = makeMinimalWorld([ms]);
    const rng = createRNG('scout-save-1');

    const { world: newWorld } = conductScoutVisit(world, ms.id, rng);
    expect(newWorld.scoutState.scoutReports.has(ms.id)).toBe(true);
  });
});

// ============================================================
// recruitPlayer
// ============================================================

describe('recruitPlayer', () => {
  it('勧誘成功時に targetSchoolId がプレイヤー校に設定される', () => {
    const ms = makeMiddleSchooler({ id: 'ms-recruit-1' });
    const world = makeMinimalWorld([ms]);

    // 成功確率が高くなるように多数試行
    let success = false;
    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`recruit-success-${i}`);
      const result = recruitPlayer(world, 'ms-recruit-1', rng);
      if (result.success) {
        expect(result.world.middleSchoolPool[0].targetSchoolId).toBe('player-school');
        success = true;
        break;
      }
    }
    expect(success).toBe(true);
  });

  it('勧誘失敗時は targetSchoolId が変わらない', () => {
    const ms = makeMiddleSchooler({ id: 'ms-recruit-2' });
    const world = makeMinimalWorld([ms]);

    let failureFound = false;
    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`recruit-fail-${i}`);
      const result = recruitPlayer(world, 'ms-recruit-2', rng);
      if (!result.success) {
        expect(result.world.middleSchoolPool[0].targetSchoolId).toBeNull();
        failureFound = true;
        break;
      }
    }
    expect(failureFound).toBe(true);
  });

  it('他校確定済みの選手への勧誘は失敗する', () => {
    const ms = makeMiddleSchooler({
      id: 'ms-recruit-3',
      targetSchoolId: 'rival-school',
    });
    const world = makeMinimalWorld([ms]);
    const rng = createRNG('recruit-locked');

    const result = recruitPlayer(world, 'ms-recruit-3', rng);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('rival-school');
  });

  it('高評判の学校は勧誘成功率が高い', () => {
    const ms = makeMiddleSchooler({ id: 'ms-recruit-rep' });

    // 低評判校
    const lowRepWorld: WorldState = {
      ...makeMinimalWorld([ms]),
      schools: [makeHighSchool({ id: 'player-school', reputation: 10 })],
      playerSchoolId: 'player-school',
    };

    // 高評判校
    const highRepWorld: WorldState = {
      ...makeMinimalWorld([ms]),
      schools: [makeHighSchool({ id: 'player-school', reputation: 95 })],
      playerSchoolId: 'player-school',
    };

    let lowSuccessCount = 0;
    let highSuccessCount = 0;
    const N = 50;

    for (let i = 0; i < N; i++) {
      const rng = createRNG(`rep-test-${i}`);
      if (recruitPlayer(lowRepWorld, 'ms-recruit-rep', rng).success) lowSuccessCount++;
    }
    for (let i = 0; i < N; i++) {
      const rng = createRNG(`rep-test-${i}`);
      if (recruitPlayer(highRepWorld, 'ms-recruit-rep', rng).success) highSuccessCount++;
    }

    // 高評判校の方が勧誘成功率が高い
    expect(highSuccessCount).toBeGreaterThan(lowSuccessCount);
  });

  it('勧誘後に scoutedBy にプレイヤー校が追加される', () => {
    const ms = makeMiddleSchooler({ id: 'ms-recruit-scouted' });
    const world = makeMinimalWorld([ms]);
    const rng = createRNG('recruit-scouted-1');

    const { world: newWorld } = recruitPlayer(world, 'ms-recruit-scouted', rng);
    const updatedMs = newWorld.middleSchoolPool.find((m) => m.id === 'ms-recruit-scouted')!;
    expect(updatedMs.scoutedBy).toContain('player-school');
  });

  it('勧誘結果が recruitAttempts Map に記録される', () => {
    const ms = makeMiddleSchooler({ id: 'ms-recruit-log' });
    const world = makeMinimalWorld([ms]);
    const rng = createRNG('recruit-log-1');

    const { world: newWorld } = recruitPlayer(world, 'ms-recruit-log', rng);
    expect(newWorld.scoutState.recruitAttempts.has('ms-recruit-log')).toBe(true);
  });
});

// ============================================================
// runAISchoolScouting
// ============================================================

describe('runAISchoolScouting', () => {
  it('AI 校が中学3年生をスカウトする', () => {
    const grade3Players = Array.from({ length: 10 }, (_, i) =>
      makeMiddleSchooler({
        id: `ms-ai-${i}`,
        middleSchoolGrade: 3,
      })
    );

    const aiSchool = makeHighSchool({
      id: 'ai-school-1',
      reputation: 70,
    });

    const world: WorldState = {
      ...makeMinimalWorld(grade3Players, [aiSchool]),
    };

    const rng = createRNG('ai-scout-test');
    const newWorld = runAISchoolScouting(world, rng);

    // AI 校がいくつかの選手をスカウトしているはず
    const scoutedCount = newWorld.middleSchoolPool.filter((ms) =>
      ms.scoutedBy.includes('ai-school-1') || ms.targetSchoolId === 'ai-school-1'
    ).length;

    expect(scoutedCount).toBeGreaterThan(0);
  });

  it('プレイヤー校の勧誘済み選手は AI 校に奪われない', () => {
    const ms = makeMiddleSchooler({
      id: 'ms-player-locked',
      middleSchoolGrade: 3,
      targetSchoolId: 'player-school',
    });

    const aiSchool = makeHighSchool({ id: 'ai-school-rival', reputation: 90 });
    const world: WorldState = {
      ...makeMinimalWorld([ms], [aiSchool]),
    };

    const rng = createRNG('ai-scout-lock');
    const newWorld = runAISchoolScouting(world, rng);

    const updatedMs = newWorld.middleSchoolPool.find((m) => m.id === 'ms-player-locked')!;
    // targetSchoolId は player-school のまま
    expect(updatedMs.targetSchoolId).toBe('player-school');
  });

  it('強豪校（高評判）はより多くの選手をスカウトする', () => {
    const grade3Players = Array.from({ length: 50 }, (_, i) =>
      makeMiddleSchooler({ id: `ms-strong-${i}`, middleSchoolGrade: 3 })
    );

    const weakSchool  = makeHighSchool({ id: 'weak',   reputation: 10 });
    const strongSchool = makeHighSchool({ id: 'strong', reputation: 95 });

    const world: WorldState = {
      ...makeMinimalWorld(grade3Players, [weakSchool, strongSchool]),
    };

    const rng = createRNG('ai-scout-strength');
    const newWorld = runAISchoolScouting(world, rng);

    const weakCount = newWorld.middleSchoolPool.filter(
      (ms) => ms.targetSchoolId === 'weak'
    ).length;
    const strongCount = newWorld.middleSchoolPool.filter(
      (ms) => ms.targetSchoolId === 'strong'
    ).length;

    expect(strongCount).toBeGreaterThanOrEqual(weakCount);
  });
});
