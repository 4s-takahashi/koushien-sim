/**
 * tests/ui/projectors/homeProjectorV2.test.ts
 *
 * Phase 4.1 の homeProjector 改善テスト。
 * - todayTask（今日やること）
 * - featuredPlayers（注目選手）
 * - isTournamentDay / isInTournamentSeason フラグ
 * - ニュースアイコン付与
 * - ニュース重要度ソート・最大10件
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { generatePlayer } from '@/engine/player/generate';
import type { WorldState, HighSchool } from '@/engine/world/world-state';
import {
  createEmptyYearResults,
  createInitialSeasonState,
  createDefaultWeeklyPlan,
} from '@/engine/world/world-state';
import { projectHome } from '@/ui/projectors/homeProjector';
import type { WorldNewsItem } from '@/engine/world/world-ticker';

// ============================================================
// テストヘルパー
// ============================================================

function makeTestWorld(opts: {
  month?: number;
  day?: number;
  playerCount?: number;
  scoutBudget?: number;
  usedScout?: number;
  phase?: string;
} = {}): WorldState {
  const {
    month = 5, day = 1, playerCount = 15,
    scoutBudget = 4, usedScout = 0,
    phase = 'spring_practice',
  } = opts;

  const rng = createRNG('home-projector-v2-test');
  const players = Array.from({ length: playerCount }, (_, i) =>
    generatePlayer(rng.derive(`p${i}`), { enrollmentYear: 1, schoolReputation: 60 })
  );

  const seasonState = createInitialSeasonState();
  const customSeasonState = { ...seasonState, phase };

  const playerSchool: HighSchool = {
    id: 'ps',
    name: '桜葉高校',
    prefecture: '新潟',
    reputation: 65,
    players,
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
    currentDate: { year: 1, month, day },
    playerSchoolId: 'ps',
    manager: { name: '山田監督', yearsActive: 0, fame: 10, totalWins: 0, totalLosses: 0, koshienAppearances: 0, koshienWins: 0 },
    settings: { autoAdvanceSpeed: 'normal', showDetailedGrowth: false },
    weeklyPlan: createDefaultWeeklyPlan(),
    prefecture: '新潟',
    schools: [playerSchool],
    middleSchoolPool: [],
    personRegistry: { entries: new Map() },
    seasonState: customSeasonState,
    scoutState: {
      watchList: [],
      scoutReports: new Map(),
      recruitAttempts: new Map(),
      monthlyScoutBudget: scoutBudget,
      usedScoutThisMonth: usedScout,
    },
  };
}

// ============================================================
// todayTask のテスト
// ============================================================

describe('todayTask', () => {
  it('春季練習フェーズは練習日タスクを返す', () => {
    const world = makeTestWorld({ phase: 'spring_practice', scoutBudget: 0 });
    const view = projectHome(world);
    expect(view.todayTask.type).toBe('practice');
  });

  it('大会フェーズは試合日タスクを返す', () => {
    const world = makeTestWorld({ phase: 'summer_tournament' });
    const view = projectHome(world);
    expect(view.todayTask.type).toBe('match');
  });

  it('オフシーズンは休養日タスクを返す', () => {
    const world = makeTestWorld({ phase: 'off_season' });
    const view = projectHome(world);
    expect(view.todayTask.type).toBe('off');
  });

  it('スカウト予算が残っている場合はスカウトタスクを返す', () => {
    const world = makeTestWorld({ phase: 'spring_practice', scoutBudget: 5, usedScout: 2 });
    const view = projectHome(world);
    expect(view.todayTask.type).toBe('scout');
  });

  it('todayTask.detail は文字列', () => {
    const world = makeTestWorld();
    const view = projectHome(world);
    expect(typeof view.todayTask.detail).toBe('string');
    expect(view.todayTask.detail.length).toBeGreaterThan(0);
  });
});

// ============================================================
// featuredPlayers のテスト
// ============================================================

describe('featuredPlayers', () => {
  it('最大3人を返す', () => {
    const world = makeTestWorld({ playerCount: 20 });
    const view = projectHome(world);
    expect(view.featuredPlayers.length).toBeLessThanOrEqual(3);
  });

  it('選手がいない場合は空配列', () => {
    const world = makeTestWorld({ playerCount: 0 });
    const view = projectHome(world);
    expect(view.featuredPlayers).toHaveLength(0);
  });

  it('各選手は必要なフィールドを持つ', () => {
    const world = makeTestWorld({ playerCount: 5 });
    const view = projectHome(world);
    if (view.featuredPlayers.length > 0) {
      const p = view.featuredPlayers[0];
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.overall).toBeGreaterThanOrEqual(0);
      expect(p.overall).toBeLessThanOrEqual(100);
      expect(['S', 'A', 'B', 'C', 'D', 'E']).toContain(p.overallRank);
      expect(p.reason).toBeTruthy();
    }
  });

  it('1人の場合も正常に動作する', () => {
    const world = makeTestWorld({ playerCount: 1 });
    const view = projectHome(world);
    expect(view.featuredPlayers.length).toBe(1);
  });
});

// ============================================================
// isTournamentDay / isInTournamentSeason のテスト
// ============================================================

describe('tournamentFlags', () => {
  it('summer_tournament フェーズは isTournamentDay = true', () => {
    const world = makeTestWorld({ phase: 'summer_tournament' });
    const view = projectHome(world);
    expect(view.isTournamentDay).toBe(true);
    expect(view.isInTournamentSeason).toBe(true);
  });

  it('koshien フェーズは isTournamentDay = true', () => {
    const world = makeTestWorld({ phase: 'koshien' });
    const view = projectHome(world);
    expect(view.isTournamentDay).toBe(true);
  });

  it('autumn_tournament フェーズは isTournamentDay = true', () => {
    const world = makeTestWorld({ phase: 'autumn_tournament' });
    const view = projectHome(world);
    expect(view.isTournamentDay).toBe(true);
  });

  it('spring_practice フェーズは isTournamentDay = false', () => {
    const world = makeTestWorld({ phase: 'spring_practice' });
    const view = projectHome(world);
    expect(view.isTournamentDay).toBe(false);
    expect(view.isInTournamentSeason).toBe(false);
  });
});

// ============================================================
// ニュースアイコンのテスト
// ============================================================

describe('newsIcons', () => {
  it('番狂わせニュースには 🔥 アイコンが付く', () => {
    const world = makeTestWorld();
    const news: WorldNewsItem[] = [
      {
        type: 'upset',
        headline: '【番狂わせ】強豪A高を撃破',
        involvedSchoolIds: [],
        involvedPlayerIds: [],
        importance: 'high',
      },
    ];
    const view = projectHome(world, news);
    expect(view.recentNews[0].icon).toBe('🔥');
  });

  it('ドラフトニュースには 📋 アイコンが付く', () => {
    const world = makeTestWorld();
    const news: WorldNewsItem[] = [
      {
        type: 'draft',
        headline: '【ドラフト】田中が1位指名',
        involvedSchoolIds: [],
        involvedPlayerIds: [],
        importance: 'high',
      },
    ];
    const view = projectHome(world, news);
    expect(view.recentNews[0].icon).toBe('📋');
  });

  it('OB活躍ニュースには 🏆 アイコンが付く', () => {
    const world = makeTestWorld();
    const news: WorldNewsItem[] = [
      {
        type: 'record',
        headline: '【OB情報】山田（読売）が本塁打',
        involvedSchoolIds: [],
        involvedPlayerIds: [],
        importance: 'low',
      },
    ];
    const view = projectHome(world, news);
    expect(view.recentNews[0].icon).toBe('🏆');
  });

  it('ニュースは重要度順にソートされる', () => {
    const world = makeTestWorld();
    const news: WorldNewsItem[] = [
      { type: 'draft', headline: '低重要ドラフト', involvedSchoolIds: [], involvedPlayerIds: [], importance: 'low' },
      { type: 'upset', headline: '高重要番狂わせ', involvedSchoolIds: [], involvedPlayerIds: [], importance: 'high' },
      { type: 'record', headline: '中重要記録', involvedSchoolIds: [], involvedPlayerIds: [], importance: 'medium' },
    ];
    const view = projectHome(world, news);
    expect(view.recentNews[0].importance).toBe('high');
    expect(view.recentNews[1].importance).toBe('medium');
    expect(view.recentNews[2].importance).toBe('low');
  });

  it('ニュースは最大10件に制限される', () => {
    const world = makeTestWorld();
    const news: WorldNewsItem[] = Array.from({ length: 15 }, (_, i) => ({
      type: 'record' as const,
      headline: `ニュース${i}`,
      involvedSchoolIds: [],
      involvedPlayerIds: [],
      importance: 'low' as const,
    }));
    const view = projectHome(world, news);
    expect(view.recentNews.length).toBeLessThanOrEqual(10);
  });
});
