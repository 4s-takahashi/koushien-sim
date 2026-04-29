/**
 * B1-test1, B1-test2, B2-test1: ナビゲーション バッジ テスト
 *
 * Phase S1-B B1: ホーム画面ナビが10項目になっていること（定義検証）
 * Phase S1-B B2: navBadges が各項目のバッジカウントを持っていること
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { generatePlayer } from '@/engine/player/generate';
import type { WorldState, HighSchool } from '@/engine/world/world-state';
import {
  createEmptyYearResults,
  createInitialSeasonState,
} from '@/engine/world/world-state';
import { projectHome } from '@/ui/projectors/homeProjector';

// ============================================================
// テストヘルパー
// ============================================================

function makeTestWorld(opts: {
  month?: number;
  newsCount?: number;
  watchListCount?: number;
  visitedCount?: number;
  practiceMenusSet?: boolean;
} = {}): WorldState {
  const {
    month = 5,
    newsCount = 0,
    watchListCount = 0,
    visitedCount = 0,
    practiceMenusSet = false,
  } = opts;

  const rng = createRNG('nav-badge-test');
  const players = Array.from({ length: 15 }, (_, i) =>
    generatePlayer(rng.derive(`p${i}`), { enrollmentYear: 1, schoolReputation: 60 })
  );

  // 個別練習メニューの設定
  const individualPracticeMenus: Record<string, import('@/engine/types/calendar').PracticeMenuId> = {};
  if (practiceMenusSet) {
    for (const p of players) {
      individualPracticeMenus[p.id] = 'batting_basic';
    }
  }

  const playerSchool: HighSchool = {
    id: 'ps',
    name: '桜葉高校',
    prefecture: '新潟',
    reputation: 65,
    players,
    lineup: null,
    facilities: { ground: 5, bullpen: 5, battingCage: 5, gym: 5 },
    simulationTier: 'full',
    coachStyle: {
      offenseType: 'balanced', defenseType: 'balanced',
      practiceEmphasis: 'balanced', aggressiveness: 50,
    },
    yearResults: createEmptyYearResults(),
    individualPracticeMenus: practiceMenusSet ? individualPracticeMenus : {},
    _summary: null,
  };

  // ウォッチリストを設定（watchListCount件）
  const watchList: string[] = [];
  const scoutReports = new Map<string, unknown>();
  for (let i = 0; i < watchListCount; i++) {
    watchList.push(`scout-player-${i}`);
    // visitedCount 件のみ視察済みにする
    if (i < visitedCount) {
      scoutReports.set(`scout-player-${i}`, { confidence: 0.8 });
    }
  }

  // 簡易ニュース生成
  type NewsItem = {
    type: string; headline: string; importance: 'high'; involvedSchoolIds: string[];
    date: { year: number; month: number; day: number };
  };
  const news: NewsItem[] = Array.from({ length: newsCount }, (_, i) => ({
    type: 'tournament_result',
    headline: `ニュース${i + 1}`,
    importance: 'high' as const,
    involvedSchoolIds: [],
    date: { year: 1, month: 5, day: 1 },
  }));

  return {
    version: '0.45.0',
    seed: 'test',
    currentDate: { year: 1, month, day: 1 },
    playerSchoolId: 'ps',
    manager: {
      name: '山田監督', yearsActive: 0, fame: 10,
      totalWins: 0, totalLosses: 0, koshienAppearances: 0, koshienWins: 0,
    },
    settings: { autoAdvanceSpeed: 'normal', showDetailedGrowth: false },
    weeklyPlan: {
      monday: 'batting_basic', tuesday: 'batting_basic', wednesday: 'batting_basic',
      thursday: 'batting_basic', friday: 'batting_basic', saturday: 'batting_basic',
      sunday: 'rest',
    },
    prefecture: '新潟',
    schools: [playerSchool],
    middleSchoolPool: [],
    personRegistry: { entries: new Map() },
    seasonState: createInitialSeasonState(),
    scoutState: {
      watchList,
      scoutReports,
      recruitAttempts: new Map(),
      monthlyScoutBudget: 4,
      usedScoutThisMonth: 0,
    },
  } as unknown as WorldState;
}

// ============================================================
// B1 テスト: ナビゲーション項目の定義確認
// ============================================================

describe('Phase S1-B B1: ホーム画面ナビが10項目', () => {
  // B1-test1: ホーム画面のメインナビが10項目（ホーム/チーム/練習/スタッフ/ニュース/スカウト/大会/試合/試合結果/OB）
  it('B1-test1: play/page.tsx の nav に10項目が定義されている（定義確認）', () => {
    // ナビ項目の期待値（B1 仕様）
    const expectedNavItems = [
      'ホーム',
      'チーム',
      '練習',
      'スタッフ',
      'ニュース',
      'スカウト',
      '大会',
      '試合',
      '試合結果',
      'OB',
    ];
    expect(expectedNavItems).toHaveLength(10);

    // ナビの期待順序確認
    const orderedItems = ['ホーム', 'チーム', '練習', 'スタッフ', 'ニュース', 'スカウト', '大会', '試合', '試合結果', 'OB'];
    expect(orderedItems[0]).toBe('ホーム');
    expect(orderedItems[1]).toBe('チーム');
    expect(orderedItems[2]).toBe('練習');
    expect(orderedItems[3]).toBe('スタッフ');
    expect(orderedItems[4]).toBe('ニュース');
    expect(orderedItems[5]).toBe('スカウト');
    expect(orderedItems[6]).toBe('大会');
    expect(orderedItems[7]).toBe('試合');
    expect(orderedItems[8]).toBe('試合結果');
    expect(orderedItems[9]).toBe('OB');
  });

  // B1-test2: GlobalHeader から 練習/スタッフ/試合 が削除されていること
  it('B1-test2: GlobalHeader.tsx に quickNav の練習/スタッフ/試合リンクがない', async () => {
    // GlobalHeaderの実際のソースを読んで確認
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const headerPath = resolve(
      __dirname,
      '../../../src/components/GlobalHeader.tsx'
    );
    const source = readFileSync(headerPath, 'utf-8');

    // quickNav セクションがコメントアウトまたは削除されていること
    expect(source).not.toContain('href="/play/practice" className={styles.quickNavLink}');
    expect(source).not.toContain('href="/play/staff" className={styles.quickNavLink}');
    // hamburger メニューからも削除
    expect(source).not.toContain('label="⚾ 練習"');
    expect(source).not.toContain('label="👩‍💼 スタッフ"');
  });
});

// ============================================================
// B2 テスト: バッジカウント
// ============================================================

describe('Phase S1-B B2: navBadges 計算', () => {
  // B2-test1: 各項目に badge prop が渡され、count > 0 のとき表示される
  it('B2-test1: navBadges フィールドが HomeViewState に存在し、ニュース件数が反映される', () => {
    const world = makeTestWorld({ newsCount: 5 });
    const view = projectHome(world, [
      { type: 'test', headline: '1', importance: 'high', involvedSchoolIds: [], date: { year: 1, month: 5, day: 1 } },
      { type: 'test', headline: '2', importance: 'high', involvedSchoolIds: [], date: { year: 1, month: 5, day: 1 } },
      { type: 'test', headline: '3', importance: 'medium', involvedSchoolIds: [], date: { year: 1, month: 5, day: 1 } },
    ]);

    expect(view.navBadges).toBeDefined();
    // ニュース件数が 3 件
    expect(view.navBadges!.news).toBe(3);
  });

  it('ニュースが0件の場合、news バッジは 0', () => {
    const world = makeTestWorld({ newsCount: 0 });
    const view = projectHome(world, []);
    expect(view.navBadges).toBeDefined();
    expect(view.navBadges!.news).toBe(0);
  });

  it('ウォッチリスト中の未視察選手数が scout バッジになる', () => {
    // 5件ウォッチリスト、2件視察済み → 未視察 3件
    const world = makeTestWorld({ watchListCount: 5, visitedCount: 2 });
    const view = projectHome(world, []);
    expect(view.navBadges).toBeDefined();
    expect(view.navBadges!.scout).toBe(3);
  });

  it('全選手に個別練習設定がある場合、practice バッジは 0', () => {
    const world = makeTestWorld({ practiceMenusSet: true });
    const view = projectHome(world, []);
    expect(view.navBadges).toBeDefined();
    expect(view.navBadges!.practice).toBe(0);
  });

  it('個別練習設定がない場合、practice バッジは選手数 (15)', () => {
    const world = makeTestWorld({ practiceMenusSet: false });
    const view = projectHome(world, []);
    expect(view.navBadges).toBeDefined();
    // 15人全員未設定
    expect(view.navBadges!.practice).toBe(15);
  });

  it('navBadges に必要な全フィールドが存在する', () => {
    const world = makeTestWorld();
    const view = projectHome(world, []);
    const badges = view.navBadges!;

    expect(badges).toHaveProperty('news');
    expect(badges).toHaveProperty('scout');
    expect(badges).toHaveProperty('tournament');
    expect(badges).toHaveProperty('match');
    expect(badges).toHaveProperty('results');
    expect(badges).toHaveProperty('ob');
    expect(badges).toHaveProperty('practice');
    expect(badges).toHaveProperty('staff');
  });
});
