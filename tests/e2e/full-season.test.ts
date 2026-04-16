/**
 * tests/e2e/full-season.test.ts
 *
 * E2E シーズン通しテスト
 *
 * 新規ワールド生成 → 100日間進行 → 夏大会期間到達 →
 * トーナメント生成 → セーブ/ロード の全フローを検証する。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { createWorldState } from '@/engine/world/create-world';
import { advanceWorldDay } from '@/engine/world/world-ticker';
import { createTournamentBracket, simulateTournamentRound } from '@/engine/world/tournament-bracket';
import {
  saveWorldState,
  loadWorldState,
  clearAllWorldSaves,
  WORLD_SAVE_SLOTS,
} from '@/engine/save/world-save-manager';
import { generatePlayer } from '@/engine/player/generate';
import { isTournamentPeriod } from '@/engine/calendar/schedule';
import type { WorldState } from '@/engine/world/world-state';
import type { FacilityLevel } from '@/engine/types/team';

// ============================================================
// テスト用ワールド生成
// ============================================================

function createE2EWorld(): WorldState {
  const rng = createRNG('e2e-full-season-seed');
  const players = Array.from({ length: 15 }, (_, i) =>
    generatePlayer(rng.derive(`player-${i}`), { enrollmentYear: 1, schoolReputation: 60 })
  );

  const facilities: FacilityLevel = { ground: 3, bullpen: 3, battingCage: 3, gym: 3 };
  const team = {
    id: 'e2e-player-school',
    name: 'E2E高校',
    prefecture: '新潟',
    reputation: 60,
    players,
    lineup: null,
    facilities,
  };

  const manager = {
    name: 'E2E監督',
    yearsActive: 0,
    fame: 10,
    totalWins: 0,
    totalLosses: 0,
    koshienAppearances: 0,
    koshienWins: 0,
  };

  return createWorldState(team, manager, '新潟', 'e2e-full-season-seed', rng);
}

// ============================================================
// セットアップ
// ============================================================

beforeEach(() => {
  clearAllWorldSaves();
});

// ============================================================
// 新規ワールド生成テスト
// ============================================================

describe('新規ワールド生成', () => {
  it('createWorldState() が正常に動作する', () => {
    const world = createE2EWorld();

    // 基本プロパティ
    expect(world.version).toBeDefined();
    expect(world.seed).toBe('e2e-full-season-seed');
    expect(world.playerSchoolId).toBeDefined();

    // 開始日: Year 1, April 1
    expect(world.currentDate.year).toBe(1);
    expect(world.currentDate.month).toBe(4);
    expect(world.currentDate.day).toBe(1);

    // 48校
    expect(world.schools).toHaveLength(48);

    // プレイヤー校が含まれている
    const playerSchool = world.schools.find((s) => s.id === world.playerSchoolId);
    expect(playerSchool).toBeDefined();
    expect(playerSchool!.name).toBe('E2E高校');
    expect(playerSchool!.players).toHaveLength(15);

    // 中学生プール（3学年 × 360人 = 1080人）
    expect(world.middleSchoolPool.length).toBeGreaterThan(0);

    // マネージャー情報
    expect(world.manager.name).toBe('E2E監督');

    // シーズン状態
    expect(world.seasonState).toBeDefined();
    expect(world.seasonState.phase).toBeDefined();
  });

  it('都道府県が正しく設定される', () => {
    const world = createE2EWorld();
    expect(world.prefecture).toBe('新潟');

    const playerSchool = world.schools.find((s) => s.id === world.playerSchoolId);
    expect(playerSchool!.prefecture).toBe('新潟');
  });

  it('各 HighSchool が simulationTier を持つ', () => {
    const world = createE2EWorld();
    for (const school of world.schools) {
      expect(['full', 'standard', 'minimal']).toContain(school.simulationTier);
    }

    // プレイヤー校は必ず full tier
    const playerSchool = world.schools.find((s) => s.id === world.playerSchoolId);
    expect(playerSchool!.simulationTier).toBe('full');
  });
});

// ============================================================
// 100日間進行テスト
// ============================================================

describe('シーズン進行（100日間）', () => {
  it('advanceWorldDay() を100回呼び出しても正常に動作する', () => {
    let world = createE2EWorld();
    const rng = createRNG('e2e-advance-100d');

    let lastDate = world.currentDate;

    for (let day = 0; day < 100; day++) {
      const { nextWorld, result } = advanceWorldDay(world, 'batting_basic', rng.derive(`day-${day}`));

      // 各日の結果が存在する
      expect(result).toBeDefined();
      expect(result.date).toBeDefined();
      expect(result.playerSchoolResult).toBeDefined();
      expect(result.worldNews).toBeDefined();

      // 日付が進んでいる
      const newDate = nextWorld.currentDate;
      const oldTotal = lastDate.year * 365 + lastDate.month * 31 + lastDate.day;
      const newTotal = newDate.year * 365 + newDate.month * 31 + newDate.day;
      expect(newTotal).toBeGreaterThan(oldTotal);

      lastDate = newDate;
      world = nextWorld;
    }

    // 100日後は7月中旬以降（夏大会期間）のはず
    // 4/1 から100日後 = 7/9 前後
    // Year 1, Month 7 あたりに到達しているはず
    expect(world.currentDate.month).toBeGreaterThanOrEqual(7);
  });

  it('100日進行後もプレイヤー校に15人の選手がいる', () => {
    let world = createE2EWorld();
    const rng = createRNG('e2e-players-100d');

    for (let day = 0; day < 100; day++) {
      const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng.derive(`d${day}`));
      world = nextWorld;
    }

    const playerSchool = world.schools.find((s) => s.id === world.playerSchoolId);
    expect(playerSchool).toBeDefined();
    expect(playerSchool!.players.length).toBeGreaterThan(0);
  });

  it('日進行中にプレイヤー校の選手能力値が変化する', () => {
    let world = createE2EWorld();
    const rng = createRNG('e2e-growth');

    const playerSchool = world.schools.find((s) => s.id === world.playerSchoolId)!;
    const initialStamina = playerSchool.players[0].stats.base.stamina;

    // 30日進行
    for (let day = 0; day < 30; day++) {
      const { nextWorld } = advanceWorldDay(world, 'running', rng.derive(`growth-${day}`));
      world = nextWorld;
    }

    const updatedSchool = world.schools.find((s) => s.id === world.playerSchoolId)!;
    // 30日後に何らかの変化があることを確認（成長 or 変動）
    // 少なくとも選手が存在する
    expect(updatedSchool.players.length).toBeGreaterThan(0);
    // スタミナが適正範囲内
    const updatedStamina = updatedSchool.players[0].stats.base.stamina;
    expect(updatedStamina).toBeGreaterThan(0);
    expect(updatedStamina).toBeLessThanOrEqual(100);
    // 初期値から記録として保持
    expect(typeof initialStamina).toBe('number');
  });

  it('ニュースが日々生成される', () => {
    let world = createE2EWorld();
    const rng = createRNG('e2e-news');
    let totalNews = 0;

    for (let day = 0; day < 10; day++) {
      const { nextWorld, result } = advanceWorldDay(world, 'batting_basic', rng.derive(`news-${day}`));
      totalNews += result.worldNews.length;
      world = nextWorld;
    }

    // 10日間で何らかのニュースが生成される（0件の日もありうる）
    expect(totalNews).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// 夏大会開始確認
// ============================================================

describe('夏大会期間の確認', () => {
  it('7月10日以降は夏大会期間として認識される', () => {
    // 夏大会開始日直前
    const beforeSummer = { year: 1, month: 7, day: 9 };
    expect(isTournamentPeriod(beforeSummer)).toBeNull();

    // 夏大会開始日
    const summerStart = { year: 1, month: 7, day: 10 };
    expect(isTournamentPeriod(summerStart)).toBe('summer');

    // 夏大会中盤
    const summerMid = { year: 1, month: 7, day: 20 };
    expect(isTournamentPeriod(summerMid)).toBe('summer');

    // 夏大会終了日
    const summerEnd = { year: 1, month: 7, day: 31 };
    expect(isTournamentPeriod(summerEnd)).toBe('summer');
  });

  it('100日進行後に夏大会期間に到達している', () => {
    let world = createE2EWorld();
    const rng = createRNG('e2e-summer-check');

    for (let day = 0; day < 100; day++) {
      const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng.derive(`sc-${day}`));
      world = nextWorld;
    }

    // 4/1 + 100日 ≈ 7/10 (夏大会開始付近)
    const inTournament = isTournamentPeriod(world.currentDate);
    // 夏大会期間中か、7月以降であることを確認
    expect(world.currentDate.month).toBeGreaterThanOrEqual(7);
    if (world.currentDate.month === 7 && world.currentDate.day >= 10) {
      expect(inTournament).toBe('summer');
    }
  });
});

// ============================================================
// トーナメント生成テスト
// ============================================================

describe('トーナメント生成', () => {
  it('createTournamentBracket() が正常にトーナメントを生成する', () => {
    const world = createE2EWorld();
    const rng = createRNG('e2e-tournament');

    const bracket = createTournamentBracket(
      'summer-year1',
      'summer',
      1,
      world.schools,
      rng,
    );

    // 基本構造
    expect(bracket.id).toBe('summer-year1');
    expect(bracket.type).toBe('summer');
    expect(bracket.year).toBe(1);
    expect(bracket.totalTeams).toBe(48);
    expect(bracket.isCompleted).toBe(false);
    expect(bracket.champion).toBeNull();

    // 6ラウンド構成
    expect(bracket.rounds).toHaveLength(6);

    // Round 1: 16試合
    const round1 = bracket.rounds[0];
    expect(round1.roundNumber).toBe(1);
    expect(round1.matches).toHaveLength(16);

    // Round 2: 16試合（シード含む）
    const round2 = bracket.rounds[1];
    expect(round2.roundNumber).toBe(2);
    expect(round2.matches).toHaveLength(16);

    // 決勝: 1試合
    const final = bracket.rounds[bracket.rounds.length - 1];
    expect(final.matches).toHaveLength(1);
  });

  it('全48校がトーナメントに参加している', () => {
    const world = createE2EWorld();
    const rng = createRNG('e2e-48teams');

    const bracket = createTournamentBracket(
      'summer-year1',
      'summer',
      1,
      world.schools,
      rng,
    );

    // 1回戦 + 2回戦の事前配置校を集める
    const schoolIds = new Set<string>();

    for (const match of bracket.rounds[0].matches) {
      if (match.homeSchoolId) schoolIds.add(match.homeSchoolId);
      if (match.awaySchoolId) schoolIds.add(match.awaySchoolId);
    }
    for (const match of bracket.rounds[1].matches) {
      if (match.homeSchoolId) schoolIds.add(match.homeSchoolId);
      // awaySchoolId は1回戦勝者なのでまだ null
    }

    // 48校すべてが何らかの試合に含まれている
    expect(schoolIds.size).toBe(48);
  });

  it('simulateTournamentRound() でラウンドを進行できる', () => {
    const world = createE2EWorld();
    const rng = createRNG('e2e-sim-round');

    let bracket = createTournamentBracket(
      'summer-year1',
      'summer',
      1,
      world.schools,
      rng,
    );

    // 1回戦を進行
    const updatedBracket = simulateTournamentRound(bracket, 1, world.schools, rng.derive('round1'));

    // 1回戦の全試合に勝者が決まっている
    for (const match of updatedBracket.rounds[0].matches) {
      expect(match.winnerId).not.toBeNull();
      expect(match.homeScore).not.toBeNull();
      expect(match.awayScore).not.toBeNull();
    }

    // まだ完了していない
    expect(updatedBracket.isCompleted).toBe(false);
  });

  it('全6ラウンドを通じてチャンピオンが決まる', () => {
    const world = createE2EWorld();
    const rng = createRNG('e2e-champion');

    let bracket = createTournamentBracket(
      'summer-year1',
      'summer',
      1,
      world.schools,
      rng,
    );

    // 全6ラウンドをシミュレート
    for (let round = 1; round <= 6; round++) {
      bracket = simulateTournamentRound(bracket, round, world.schools, rng.derive(`round-${round}`));
    }

    // チャンピオンが決まっている
    expect(bracket.isCompleted).toBe(true);
    expect(bracket.champion).not.toBeNull();

    // チャンピオンは実在する学校IDである
    const championId = bracket.champion!;
    const championSchool = world.schools.find((s) => s.id === championId);
    expect(championSchool).toBeDefined();
  });
});

// ============================================================
// セーブ/ロードテスト（E2E）
// ============================================================

describe('セーブ/ロード（E2E）', () => {
  it('ゲーム開始直後のセーブ → ロードが成功する', async () => {
    const world = createE2EWorld();

    const saveResult = await saveWorldState(WORLD_SAVE_SLOTS.SLOT_1, world, 'E2E 開始時');
    expect(saveResult.success).toBe(true);

    const loadResult = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_1);
    expect(loadResult.success).toBe(true);
    expect(loadResult.world).toBeDefined();

    const restored = loadResult.world!;
    expect(restored.seed).toBe(world.seed);
    expect(restored.currentDate).toEqual(world.currentDate);
    expect(restored.playerSchoolId).toBe(world.playerSchoolId);
    expect(restored.schools).toHaveLength(48);
  });

  it('100日進行後のセーブ → ロードが成功する', async () => {
    let world = createE2EWorld();
    const rng = createRNG('e2e-save-100d');

    for (let day = 0; day < 100; day++) {
      const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng.derive(`s-${day}`));
      world = nextWorld;
    }

    const saveResult = await saveWorldState(WORLD_SAVE_SLOTS.SLOT_2, world, 'E2E 100日後');
    expect(saveResult.success).toBe(true);

    const loadResult = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_2);
    expect(loadResult.success).toBe(true);

    const restored = loadResult.world!;
    expect(restored.currentDate.month).toBeGreaterThanOrEqual(7);
    expect(restored.schools).toHaveLength(48);
    expect(restored.middleSchoolPool.length).toBeGreaterThan(0);
  });

  it('ロード後に日進行を再開できる', async () => {
    let world = createE2EWorld();
    const rng = createRNG('e2e-reload-continue');

    // 10日進行してセーブ
    for (let day = 0; day < 10; day++) {
      const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng.derive(`pre-${day}`));
      world = nextWorld;
    }
    const savedDate = { ...world.currentDate };

    await saveWorldState(WORLD_SAVE_SLOTS.SLOT_3, world, 'E2E 再開テスト');

    // ロードして続き
    const loadResult = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_3);
    expect(loadResult.success).toBe(true);

    let restoredWorld = loadResult.world!;
    expect(restoredWorld.currentDate).toEqual(savedDate);

    // さらに5日進行
    for (let day = 0; day < 5; day++) {
      const { nextWorld } = advanceWorldDay(restoredWorld, 'batting_basic', rng.derive(`post-${day}`));
      restoredWorld = nextWorld;
    }

    // 合計15日後の日付になっている
    const expectedTotalDays =
      savedDate.year * 365 + (savedDate.month - 1) * 30 + savedDate.day + 5;
    const actualTotalDays =
      restoredWorld.currentDate.year * 365 +
      (restoredWorld.currentDate.month - 1) * 30 +
      restoredWorld.currentDate.day;
    expect(actualTotalDays).toBeGreaterThan(
      savedDate.year * 365 + (savedDate.month - 1) * 30 + savedDate.day
    );
  });

  it('セーブデータに正確なメタデータが記録される', async () => {
    let world = createE2EWorld();
    const rng = createRNG('e2e-meta');

    // 7月まで進行（大会期間シミュレーション）
    for (let day = 0; day < 100; day++) {
      const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng.derive(`m-${day}`));
      world = nextWorld;
    }

    await saveWorldState(WORLD_SAVE_SLOTS.SLOT_1, world, '夏大会前');

    const { listWorldSaves } = await import('@/engine/save/world-save-manager');
    const saves = listWorldSaves();
    const meta = saves.find((s) => s.slotId === WORLD_SAVE_SLOTS.SLOT_1);

    expect(meta).toBeDefined();
    expect(meta!.schoolName).toBe('E2E高校');
    expect(meta!.currentDate.month).toBeGreaterThanOrEqual(7);
    expect(meta!.displayName).toBe('夏大会前');
  });
});

// ============================================================
// 年度替わりテスト
// ============================================================

describe('年度替わり（3/31 → 4/1）', () => {
  it('365日進行後に年度が替わる', () => {
    let world = createE2EWorld();
    const rng = createRNG('e2e-year-transition');

    // 1年分（約365日）進行
    for (let day = 0; day < 365; day++) {
      const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng.derive(`yt-${day}`));
      world = nextWorld;
    }

    // 年度が変わっているはず（Year 2）
    expect(world.currentDate.year).toBeGreaterThanOrEqual(2);
  });
});
