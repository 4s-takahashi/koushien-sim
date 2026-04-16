/**
 * tests/engine/world/draft-system.test.ts
 *
 * ドラフト・進路分岐システムのテスト。
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import {
  identifyDraftCandidates,
  executeDraft,
  determineCareerPath,
  computePlayerOverall,
} from '@/engine/world/career/draft-system';
import type { WorldState, HighSchool } from '@/engine/world/world-state';
import {
  createEmptyYearResults,
  createDefaultWeeklyPlan,
  createInitialSeasonState,
  createInitialScoutState,
} from '@/engine/world/world-state';
import { generatePlayer } from '@/engine/player/generate';
import type { Player } from '@/engine/types/player';

// ============================================================
// テストヘルパー
// ============================================================

function makeSchool(id: string, players: Player[], opts: Partial<HighSchool> = {}): HighSchool {
  return {
    id,
    name: `${id}高校`,
    prefecture: '新潟',
    reputation: 60,
    players,
    lineup: null,
    facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 },
    simulationTier: 'standard',
    coachStyle: {
      offenseType: 'balanced', defenseType: 'balanced',
      practiceEmphasis: 'balanced', aggressiveness: 50,
    },
    yearResults: createEmptyYearResults(),
    _summary: null,
    ...opts,
  };
}

function makeWorldWithSchools(schools: HighSchool[]): WorldState {
  return {
    version: '0.3.0',
    seed: 'draft-test',
    currentDate: { year: 1, month: 3, day: 31 },
    playerSchoolId: schools[0]?.id ?? 'player-school',
    manager: {
      name: '監督', yearsActive: 1, fame: 0,
      totalWins: 0, totalLosses: 0, koshienAppearances: 0, koshienWins: 0,
    },
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

import type { RNG } from '@/engine/core/rng';

function makePlayerWithOverall(rng: RNG, enrollmentYear: number, targetOverall: number): Player {
  // generatePlayer で生成後に stats を上書きして指定 overall に近づける
  const player = generatePlayer(rng, { enrollmentYear, schoolReputation: 60 });
  const targetStat = Math.round(targetOverall);
  return {
    ...player,
    stats: {
      base: {
        stamina: targetStat, speed: targetStat, armStrength: targetStat,
        fielding: targetStat, focus: targetStat, mental: targetStat,
      },
      batting: {
        contact: targetStat, power: targetStat, eye: targetStat, technique: targetStat,
      },
      pitching: null,
    },
  };
}

// ============================================================
// computePlayerOverall
// ============================================================

describe('computePlayerOverall', () => {
  it('高能力選手は高い overall スコアを持つ', () => {
    const rng = createRNG('overall-test');
    const strongPlayer = makePlayerWithOverall(rng, 1, 80);
    const weakPlayer   = makePlayerWithOverall(rng, 1, 20);

    expect(computePlayerOverall(strongPlayer)).toBeGreaterThan(
      computePlayerOverall(weakPlayer)
    );
  });

  it('overall は 0-100 の範囲内に収まる', () => {
    const rng = createRNG('overall-range');
    for (let i = 0; i < 20; i++) {
      const player = generatePlayer(rng.derive(`p${i}`), { enrollmentYear: 1, schoolReputation: 60 });
      const overall = computePlayerOverall(player);
      expect(overall).toBeGreaterThanOrEqual(0);
      expect(overall).toBeLessThanOrEqual(100);
    }
  });
});

// ============================================================
// identifyDraftCandidates
// ============================================================

describe('identifyDraftCandidates', () => {
  it('overall >= 40 の3年生のみがドラフト候補になる', () => {
    const rng = createRNG('draft-candidates');
    const currentYear = 1;

    // 3年生（enrollmentYear = -1 なら grade = 1 - (-1) + 1 = 3）
    const strongSenior = {
      ...makePlayerWithOverall(rng, -1, 60), // overall 60（A 相当）
      id: 'strong-senior',
    };
    const weakSenior = {
      ...makePlayerWithOverall(rng, -1, 15), // overall 15（D 相当）
      id: 'weak-senior',
    };
    const junior = {
      ...generatePlayer(rng, { enrollmentYear: 0, schoolReputation: 60 }),
      id: 'junior-player',
    };

    const school = makeSchool('test-school', [strongSenior, weakSenior, junior]);
    const world = makeWorldWithSchools([school]);
    const candidates = identifyDraftCandidates(world, currentYear);

    const ids = candidates.map((c) => c.playerId);
    expect(ids).toContain('strong-senior');
    expect(ids).not.toContain('weak-senior');
    expect(ids).not.toContain('junior-player'); // 3年生ではない
  });

  it('候補は overall の高い順にソートされている', () => {
    const rng = createRNG('draft-sort');
    const currentYear = 1;

    const players = [30, 60, 45, 55, 75].map((overall, i) => ({
      ...makePlayerWithOverall(rng, -1, overall),
      id: `player-${i}-ov${overall}`,
    }));

    const school = makeSchool('sort-school', players);
    const world = makeWorldWithSchools([school]);
    const candidates = identifyDraftCandidates(world, currentYear);

    // ソート確認（降順）
    for (let i = 0; i < candidates.length - 1; i++) {
      expect(candidates[i].overallRating).toBeGreaterThanOrEqual(candidates[i + 1].overallRating);
    }
  });

  it('scoutRating が overall に応じて正しく設定される', () => {
    const rng = createRNG('draft-rating');
    const currentYear = 1;

    // S>=60, A>=45, B>=30 の閾値に合わせた値（Phase 5 バランス調整後）
    const sPlayer = { ...makePlayerWithOverall(rng, -1, 75), id: 'player-s' };
    const aPlayer = { ...makePlayerWithOverall(rng, -1, 50), id: 'player-a' };
    const bPlayer = { ...makePlayerWithOverall(rng, -1, 35), id: 'player-b' };

    const school = makeSchool('rating-school', [sPlayer, aPlayer, bPlayer]);
    const world = makeWorldWithSchools([school]);
    const candidates = identifyDraftCandidates(world, currentYear);

    const s = candidates.find((c) => c.playerId === 'player-s');
    const a = candidates.find((c) => c.playerId === 'player-a');
    const b = candidates.find((c) => c.playerId === 'player-b');

    expect(s?.scoutRating).toBe('S');
    expect(a?.scoutRating).toBe('A');
    expect(b?.scoutRating).toBe('B');
  });
});

// ============================================================
// executeDraft
// ============================================================

describe('executeDraft', () => {
  it('S/A 相当の選手はプロ指名される可能性がある', () => {
    const rng = createRNG('execute-draft-1');
    const currentYear = 1;

    const topPlayer = { ...makePlayerWithOverall(rng, -1, 75), id: 'top-player' };
    const school = makeSchool('draft-school', [topPlayer]);
    const world = makeWorldWithSchools([school]);

    const { results } = executeDraft(world, currentYear, rng);

    // 少なくとも何らかの結果がある
    expect(results.length).toBeGreaterThan(0);
    // top-player がドラフト対象になっている
    const topResult = results.find((r) => r.playerId === 'top-player');
    expect(topResult).toBeDefined();
  });

  it('B/C/D 相当の選手はドラフト対象にならない', () => {
    const rng = createRNG('execute-draft-weak');
    const currentYear = 1;

    const weakPlayer = { ...makePlayerWithOverall(rng, -1, 15), id: 'weak-player' };
    const school = makeSchool('weak-school', [weakPlayer]);
    const world = makeWorldWithSchools([school]);

    const { results } = executeDraft(world, currentYear, rng);

    // weak-player の結果があれば picked=false
    const weakResult = results.find((r) => r.playerId === 'weak-player');
    if (weakResult) {
      expect(weakResult.picked).toBe(false);
    }
  });

  it('ドラフト結果に team と round が含まれる（指名選手）', () => {
    const rng = createRNG('execute-draft-team');
    const currentYear = 1;

    // 複数のエース選手
    const players = Array.from({ length: 5 }, (_, i) => ({
      ...makePlayerWithOverall(rng, -1, 72),
      id: `elite-${i}`,
    }));

    const school = makeSchool('elite-school', players);
    const world = makeWorldWithSchools([school]);

    const { results } = executeDraft(world, currentYear, rng);

    const pickedResults = results.filter((r) => r.picked && r.negotiationSuccess);
    for (const r of pickedResults) {
      expect(r.team).not.toBeNull();
      expect(r.round).not.toBeNull();
      expect(r.round!).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// determineCareerPath
// ============================================================

describe('determineCareerPath', () => {
  it('ドラフト指名+交渉成功ならプロ入り', () => {
    const rng = createRNG('career-pro');
    const player = makePlayerWithOverall(rng, -1, 75);
    const school = makeSchool('school-pro', []);

    const draftResult = {
      playerId: player.id,
      picked: true,
      team: '読売巨人軍',
      round: 1,
      negotiationSuccess: true,
    };

    const career = determineCareerPath(player, school, draftResult, rng);
    expect(career.type).toBe('pro');
    if (career.type === 'pro') {
      expect(career.team).toBe('読売巨人軍');
      expect(career.pickRound).toBe(1);
    }
  });

  it('ドラフト交渉失敗なら大学進学の可能性がある', () => {
    const rng = createRNG('career-uni');
    const player = makePlayerWithOverall(rng, -1, 70);
    // mental を高めに設定
    const playerHighMental = {
      ...player,
      stats: { ...player.stats, base: { ...player.stats.base, mental: 70 } },
    };
    const school = makeSchool('school-uni', []);

    const draftResult = {
      playerId: player.id,
      picked: true,
      team: 'オリックスバファローズ',
      round: 2,
      negotiationSuccess: false, // 入団拒否
    };

    let universityCount = 0;
    for (let i = 0; i < 20; i++) {
      const career = determineCareerPath(
        playerHighMental, school, draftResult, rng.derive(`uni-${i}`)
      );
      if (career.type === 'university') universityCount++;
    }

    // 入団拒否後は大学進学が多い
    expect(universityCount).toBeGreaterThan(10);
  });

  it('ドラフト対象外でも実力者は大学/社会人に進める', () => {
    const rng = createRNG('career-fallback');
    const player = makePlayerWithOverall(rng, -1, 50);
    const school = makeSchool('school-fallback', []);

    const careers = Array.from({ length: 30 }, (_, i) =>
      determineCareerPath(player, school, null, rng.derive(`fallback-${i}`))
    );

    const retireCount = careers.filter((c) => c.type === 'retire').length;
    // 全員が引退するわけではない
    expect(retireCount).toBeLessThan(30);
  });

  it('能力の低い選手は引退が多い', () => {
    const rng = createRNG('career-retire');
    const player = makePlayerWithOverall(rng, -1, 10);
    const school = makeSchool('school-retire', []);

    const careers = Array.from({ length: 30 }, (_, i) =>
      determineCareerPath(player, school, null, rng.derive(`retire-${i}`))
    );

    const retireCount = careers.filter((c) => c.type === 'retire').length;
    // 低能力者は引退が多い
    expect(retireCount).toBeGreaterThan(15);
  });

  it('社会人野球ルートが存在する', () => {
    const rng = createRNG('career-corporate');
    const player = makePlayerWithOverall(rng, -1, 42);
    // mental 低め（社会人向き）
    const playerLowMental = {
      ...player,
      stats: { ...player.stats, base: { ...player.stats.base, mental: 25 } },
    };
    const school = makeSchool('school-corp', []);

    let corporateFound = false;
    for (let i = 0; i < 50; i++) {
      const career = determineCareerPath(
        playerLowMental, school, null, rng.derive(`corp-${i}`)
      );
      if (career.type === 'corporate') {
        corporateFound = true;
        break;
      }
    }

    expect(corporateFound).toBe(true);
  });

  it('進路分岐は再現性がある（同じシードなら同じ結果）', () => {
    const rng1 = createRNG('career-repro');
    const rng2 = createRNG('career-repro');
    const player = makePlayerWithOverall(rng1, -1, 55);
    const school = makeSchool('school-repro', []);

    const career1 = determineCareerPath(player, school, null, rng1.derive('path'));
    const career2 = determineCareerPath(player, school, null, rng2.derive('path'));

    expect(career1.type).toBe(career2.type);
  });
});
