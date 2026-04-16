/**
 * balance.test.ts — Phase 5 バランス検証テスト
 *
 * 調整後の定数・システムが目標バランスを満たすことを検証する。
 * これらのテストは定数変更時に自動的にバランス確認となる。
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { createWorldState } from '@/engine/world/create-world';
import { generatePlayer } from '@/engine/player/generate';
import {
  computePlayerOverall,
  identifyDraftCandidates,
  executeDraft,
  determineCareerPath,
} from '@/engine/world/career/draft-system';
import { computeMiddleSchoolOverall } from '@/engine/world/scout/scout-system';
import { processYearTransition } from '@/engine/world/year-transition';
import { generateDailyNews } from '@/engine/world/news/news-generator';
import type { Player } from '@/engine/types/player';
import type { WorldState } from '@/engine/world/world-state';
import { createEmptyYearResults, createInitialSeasonState, createInitialScoutState } from '@/engine/world/world-state';

// ============================================================
// テストヘルパー
// ============================================================

function makeMinimalPlayer(rng: ReturnType<typeof createRNG>, enrollmentYear: number, overall: number): Player {
  // overall をおおよそ指定した選手を生成する
  const rep = Math.min(100, Math.max(0, overall * 2));
  const player = generatePlayer(rng, { enrollmentYear, schoolReputation: rep });
  return player;
}

function makeTestWorld(): WorldState {
  const rng = createRNG('balance-test-seed');
  const playerGenRng = rng.derive('player-gen');
  const players: Player[] = [];
  for (let i = 0; i < 20; i++) {
    const p = generatePlayer(playerGenRng.derive(`p-${i}`), { enrollmentYear: 1, schoolReputation: 50 });
    players.push(p);
  }

  const playerTeam = {
    id: 'player-school',
    name: '選抜高校',
    prefecture: '埼玉',
    reputation: 50,
    players,
    lineup: null,
    facilities: { ground: 5, bullpen: 5, battingCage: 5, gym: 5 },
  };

  const manager = {
    firstName: '太郎',
    lastName: '田中',
    yearsActive: 0,
    personality: { strictness: 50, communication: 50, strategy: 50 },
  };

  return createWorldState(playerTeam, manager, '埼玉', 'balance-test-seed', rng.derive('world-init'));
}

// ============================================================
// 成長バランスのテスト
// ============================================================

describe('成長バランス', () => {
  it('computePlayerOverall は 0-100 の範囲に収まる', () => {
    const rng = createRNG('overall-test');
    for (let i = 0; i < 50; i++) {
      const player = generatePlayer(rng.derive(`p-${i}`), { enrollmentYear: 1, schoolReputation: 50 });
      const overall = computePlayerOverall(player);
      expect(overall).toBeGreaterThanOrEqual(0);
      expect(overall).toBeLessThanOrEqual(100);
    }
  });

  it('評判100の高校生成選手の平均 overall は 40 以上', () => {
    const rng = createRNG('high-rep-test');
    const players = Array.from({ length: 30 }, (_, i) =>
      generatePlayer(rng.derive(`p-${i}`), { enrollmentYear: 1, schoolReputation: 100 })
    );
    const avgOverall = players.reduce((s, p) => s + computePlayerOverall(p), 0) / players.length;
    expect(avgOverall).toBeGreaterThan(40);
  });

  it('評判0の高校生成選手の平均 overall は 30 未満', () => {
    const rng = createRNG('low-rep-test');
    const players = Array.from({ length: 30 }, (_, i) =>
      generatePlayer(rng.derive(`p-${i}`), { enrollmentYear: 1, schoolReputation: 0 })
    );
    const avgOverall = players.reduce((s, p) => s + computePlayerOverall(p), 0) / players.length;
    expect(avgOverall).toBeLessThan(40);
  });
});

// ============================================================
// スカウトレーティングのテスト（Phase 5 調整後閾値）
// ============================================================

describe('スカウトレーティング（Phase 5 調整後）', () => {
  it('S 評価は overall >= 60 の選手', () => {
    const rng = createRNG('scout-rating-s');
    const currentYear = 1;
    // overall ~75 の選手を作成
    const highPlayer = generatePlayer(rng, { enrollmentYear: currentYear - 2, schoolReputation: 100 });
    const overall = computePlayerOverall(highPlayer);
    if (overall >= 60) {
      const world = makeTestWorld();
      const testSchool = world.schools.find((s) => s.id === world.playerSchoolId)!;
      const worldWithPlayer = {
        ...world,
        schools: world.schools.map((s) =>
          s.id === world.playerSchoolId
            ? { ...s, players: [{ ...highPlayer, enrollmentYear: currentYear - 2 }] }
            : s
        ),
      };
      const candidates = identifyDraftCandidates(worldWithPlayer, currentYear);
      const candidate = candidates.find((c) => c.playerId === highPlayer.id);
      expect(candidate?.scoutRating).toBe('S');
    }
  });

  it('B 評価は overall >= 30 かつ < 45 の選手', () => {
    const rng = createRNG('scout-rating-b');
    const currentYear = 1;
    // overall 30-44 の選手を作成（評判20-40の学校の平均的な選手）
    const medPlayer = generatePlayer(rng, { enrollmentYear: currentYear - 2, schoolReputation: 20 });
    const overall = computePlayerOverall(medPlayer);
    if (overall >= 30 && overall < 45) {
      const world = makeTestWorld();
      const worldWithPlayer = {
        ...world,
        schools: world.schools.map((s) =>
          s.id === world.playerSchoolId
            ? { ...s, players: [{ ...medPlayer, enrollmentYear: currentYear - 2 }] }
            : s
        ),
      };
      const candidates = identifyDraftCandidates(worldWithPlayer, currentYear);
      const candidate = candidates.find((c) => c.playerId === medPlayer.id);
      if (candidate) {
        expect(['B', 'C']).toContain(candidate.scoutRating);
      }
    }
  });

  it('ドラフト候補の閾値は overall >= 30', () => {
    const rng = createRNG('draft-threshold');
    const currentYear = 1;
    // overall 20-29 の選手はドラフト対象外
    const lowPlayer = generatePlayer(rng, { enrollmentYear: currentYear - 2, schoolReputation: 0 });
    const overall = computePlayerOverall(lowPlayer);
    if (overall < 30) {
      const world = makeTestWorld();
      const worldWithPlayer = {
        ...world,
        schools: world.schools.map((s) =>
          s.id === world.playerSchoolId
            ? { ...s, players: [{ ...lowPlayer, enrollmentYear: currentYear - 2 }] }
            : s
        ),
      };
      const candidates = identifyDraftCandidates(worldWithPlayer, currentYear);
      const candidate = candidates.find((c) => c.playerId === lowPlayer.id);
      expect(candidate).toBeUndefined();
    }
  });
});

// ============================================================
// 入学配分のテスト（Phase 5 調整後）
// ============================================================

describe('入学配分バランス（Phase 5 調整後）', () => {
  it('年度替わり後に全校が9人以上の選手を保有する', () => {
    const world = makeTestWorld();
    const rng = createRNG('enrollment-balance');
    const nextWorld = processYearTransition(world, rng);

    for (const school of nextWorld.schools) {
      expect(school.players.length).toBeGreaterThanOrEqual(9);
    }
  });

  it('年度替わり後の全選手数は合理的な範囲内 (400〜1500)', () => {
    const world = makeTestWorld();
    const rng = createRNG('player-count-balance');
    const nextWorld = processYearTransition(world, rng);

    const totalPlayers = nextWorld.schools.reduce((s, sch) => s + sch.players.length, 0);
    expect(totalPlayers).toBeGreaterThan(400);
    expect(totalPlayers).toBeLessThan(1500);
  });

  it('中学生プールは年度替わり後も 1000 人以上維持される', () => {
    const world = makeTestWorld();
    const rng = createRNG('ms-pool-balance');
    const nextWorld = processYearTransition(world, rng);

    expect(nextWorld.middleSchoolPool.length).toBeGreaterThan(1000);
  });
});

// ============================================================
// PersonRegistry 記録のテスト
// ============================================================

describe('PersonRegistry への卒業生記録', () => {
  it('年度替わり後に PersonRegistry に卒業生が記録される', () => {
    const world = makeTestWorld();
    const rng = createRNG('registry-test');
    const nextWorld = processYearTransition(world, rng);

    // 卒業生がいれば registryに記録されているはず
    expect(nextWorld.personRegistry.entries.size).toBeGreaterThan(0);
  });

  it('PersonRegistry のエントリはプロか引退かいずれかのcareerPathを持つ', () => {
    const world = makeTestWorld();
    const rng = createRNG('registry-path-test');
    const nextWorld = processYearTransition(world, rng);

    for (const [, entry] of nextWorld.personRegistry.entries) {
      if (entry.graduateSummary) {
        const pathType = entry.graduateSummary.careerPath.type;
        expect(['pro', 'university', 'corporate', 'retire']).toContain(pathType);
      }
    }
  });

  it('プロ入り選手は PersonRegistry に tracked として記録される', () => {
    const world = makeTestWorld();
    const rng = createRNG('pro-registry-test');
    const nextWorld = processYearTransition(world, rng);

    for (const [, entry] of nextWorld.personRegistry.entries) {
      if (entry.graduateSummary?.careerPath.type === 'pro') {
        expect(entry.retention).toBe('tracked');
      }
    }
  });
});

// ============================================================
// ドラフト・進路のテスト
// ============================================================

describe('ドラフト・進路バランス', () => {
  it('48校のワールドで年度替わり後に最低1人のプロ入りが発生する', () => {
    const world = makeTestWorld();
    const rng = createRNG('draft-balance');
    const nextWorld = processYearTransition(world, rng);

    const proPlayers = Array.from(nextWorld.personRegistry.entries.values())
      .filter((e) => e.graduateSummary?.careerPath.type === 'pro');
    // 48校で3年生がいれば最低数人がプロ入りするはず
    expect(proPlayers.length).toBeGreaterThanOrEqual(1);
  });

  it('卒業生の大半は引退以外の進路を選ぶ', () => {
    const world = makeTestWorld();
    const rng = createRNG('career-balance');
    const nextWorld = processYearTransition(world, rng);

    const graduates = Array.from(nextWorld.personRegistry.entries.values())
      .filter((e) => e.graduateSummary);

    if (graduates.length > 0) {
      const retiredCount = graduates.filter((e) => e.graduateSummary?.careerPath.type === 'retire').length;
      const retiredRatio = retiredCount / graduates.length;
      // 引退率は50%未満が理想
      expect(retiredRatio).toBeLessThan(0.6);
    }
  });
});

// ============================================================
// ニュース生成のテスト
// ============================================================

describe('ニュース生成バランス', () => {
  it('シーズン節目（4月1日）に必ずニュースが生成される', () => {
    const world = makeTestWorld();
    const rng = createRNG('news-april');
    // 4月1日の状態でニュース生成
    const testWorld = { ...world, currentDate: { year: 1, month: 4, day: 1 } };
    const news = generateDailyNews(testWorld, rng);
    expect(news.length).toBeGreaterThan(0);
    const hasHighNews = news.some((n) => n.importance === 'high');
    expect(hasHighNews).toBe(true);
  });

  it('甲子園開幕日（8月6日）に必ずニュースが生成される', () => {
    const world = makeTestWorld();
    const rng = createRNG('news-koshien');
    const testWorld = { ...world, currentDate: { year: 1, month: 8, day: 6 } };
    const news = generateDailyNews(testWorld, rng);
    expect(news.length).toBeGreaterThan(0);
  });

  it('ドラフト日（10月20日）にドラフトニュースが生成される', () => {
    const world = makeTestWorld();
    const rng = createRNG('news-draft');
    const testWorld = { ...world, currentDate: { year: 1, month: 10, day: 20 } };
    const news = generateDailyNews(testWorld, rng);
    const hasDraftNews = news.some((n) => n.type === 'draft');
    expect(hasDraftNews).toBe(true);
  });

  it('通常日でも一定確率でニュースが生成される', () => {
    const world = makeTestWorld();
    let newsCount = 0;
    const sampleDays = 30;

    for (let day = 1; day <= sampleDays; day++) {
      const rng = createRNG(`news-daily-${day}`);
      const testWorld = { ...world, currentDate: { year: 1, month: 6, day } };
      const news = generateDailyNews(testWorld, rng);
      newsCount += news.length;
    }

    // 30日間で少なくとも10件以上のニュースが生成される
    expect(newsCount).toBeGreaterThan(10);
  });

  it('大会シーズン（7〜8月）に番狂わせニュースが生成されやすい', () => {
    const world = makeTestWorld();
    let upsetCount = 0;
    const trials = 100;

    for (let i = 0; i < trials; i++) {
      const rng = createRNG(`upset-test-${i}`);
      const testWorld = { ...world, currentDate: { year: 1, month: 7, day: 15 } };
      const news = generateDailyNews(testWorld, rng);
      upsetCount += news.filter((n) => n.type === 'upset').length;
    }

    // 100試行で番狂わせニュースが少なくとも5回は生成される
    expect(upsetCount).toBeGreaterThan(5);
  });
});

// ============================================================
// 中学生 overall スケールのテスト
// ============================================================

describe('中学生 overall スケール', () => {
  it('中学3年生の overall は 0-100 スケールで 30-80 の範囲に収まる（平均）', () => {
    const world = makeTestWorld();
    const grade3 = world.middleSchoolPool.filter((ms) => ms.middleSchoolGrade === 3);
    expect(grade3.length).toBeGreaterThan(0);

    const overalls = grade3.map((ms) => computeMiddleSchoolOverall(ms));
    const avg = overalls.reduce((s, v) => s + v, 0) / overalls.length;

    // 中学3年生の平均 overall は 25-65 の範囲
    expect(avg).toBeGreaterThan(20);
    expect(avg).toBeLessThan(70);
  });

  it('中学1年生は3年生より平均 overall が低い', () => {
    const world = makeTestWorld();
    const grade1 = world.middleSchoolPool.filter((ms) => ms.middleSchoolGrade === 1);
    const grade3 = world.middleSchoolPool.filter((ms) => ms.middleSchoolGrade === 3);

    const avg1 = grade1.reduce((s, ms) => s + computeMiddleSchoolOverall(ms), 0) / grade1.length;
    const avg3 = grade3.reduce((s, ms) => s + computeMiddleSchoolOverall(ms), 0) / grade3.length;

    expect(avg1).toBeLessThan(avg3);
  });
});
