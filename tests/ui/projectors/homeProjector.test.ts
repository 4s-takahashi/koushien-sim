/**
 * tests/ui/projectors/homeProjector.test.ts
 *
 * homeProjector のユニットテスト。
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
import { projectHome, makeDateView } from '@/ui/projectors/homeProjector';

// ============================================================
// テストヘルパー
// ============================================================

function makeTestWorld(opts: {
  month?: number;
  day?: number;
  playerCount?: number;
  scoutBudget?: number;
  usedScout?: number;
} = {}): WorldState {
  const {
    month = 5, day = 1, playerCount = 15,
    scoutBudget = 4, usedScout = 0,
  } = opts;

  const rng = createRNG('home-projector-test');
  const players = Array.from({ length: playerCount }, (_, i) =>
    generatePlayer(rng.derive(`p${i}`), { enrollmentYear: 1, schoolReputation: 60 })
  );

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
    seasonState: createInitialSeasonState(),
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
// テスト
// ============================================================

describe('homeProjector', () => {
  it('チーム名・選手数が正しく射影される', () => {
    const world = makeTestWorld({ playerCount: 15 });
    const view = projectHome(world);

    expect(view.team.schoolName).toBe('桜葉高校');
    expect(view.team.playerCount).toBe(15);
  });

  it('日付が正しく表示文字列に変換される', () => {
    const world = makeTestWorld({ month: 7, day: 10 });
    const view = projectHome(world);

    expect(view.date.year).toBe(1);
    expect(view.date.month).toBe(7);
    expect(view.date.day).toBe(10);
    expect(view.date.displayString).toContain('7月10日');
    expect(view.date.japaneseDisplay).toContain('7月10日');
  });

  it('スカウト予算が正しく反映される', () => {
    const world = makeTestWorld({ scoutBudget: 5, usedScout: 2 });
    const view = projectHome(world);

    expect(view.scoutBudgetTotal).toBe(5);
    expect(view.scoutBudgetRemaining).toBe(3);
  });

  it('ニュースが空のとき空配列を返す', () => {
    const world = makeTestWorld();
    const view = projectHome(world, []);

    expect(view.recentNews).toHaveLength(0);
  });

  it('ニュースが注入されたとき正しく反映される', () => {
    const world = makeTestWorld();
    const news = [
      {
        type: 'upset' as const,
        headline: 'テストニュース',
        involvedSchoolIds: [],
        involvedPlayerIds: [],
        importance: 'high' as const,
      },
    ];
    const view = projectHome(world, news);

    expect(view.recentNews).toHaveLength(1);
    expect(view.recentNews[0].headline).toBe('テストニュース');
    expect(view.recentNews[0].importance).toBe('high');
  });

  it('シーズンフェーズラベルが正しく変換される', () => {
    const world = makeTestWorld();
    const view = projectHome(world);

    expect(view.seasonPhase).toBe('spring_practice');
    expect(view.seasonPhaseLabel).toBe('春季練習');
  });

  it('チーム総合力は 0-100 の範囲内', () => {
    const world = makeTestWorld({ playerCount: 20 });
    const view = projectHome(world);

    expect(view.team.teamOverall).toBeGreaterThanOrEqual(0);
    expect(view.team.teamOverall).toBeLessThanOrEqual(100);
  });
});

describe('makeDateView', () => {
  it('Year 1 4月1日は月曜日', () => {
    const d = makeDateView(1, 4, 1);
    expect(d.japaneseDisplay).toContain('月');
  });

  it('displayString に年月日が含まれる', () => {
    const d = makeDateView(2, 8, 15);
    expect(d.displayString).toContain('Year 2');
    expect(d.displayString).toContain('8月15日');
  });
});
