/**
 * B5-test1, B6-test2: 選手詳細プロジェクターテスト
 *
 * Phase S1-B B5: 個別練習メニューが playerProjector に反映されること
 * Phase S1-B B6: 練習成果フィードバック履歴が直近10件・日付順で返ること
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { generatePlayer } from '@/engine/player/generate';
import type { WorldState, HighSchool } from '@/engine/world/world-state';
import {
  createEmptyYearResults,
  createInitialSeasonState,
} from '@/engine/world/world-state';
import { projectPlayer } from '@/ui/projectors/playerProjector';
import type { PracticeFeedback } from '@/engine/types/calendar';

// ============================================================
// テストヘルパー
// ============================================================

function makeTestWorldWithPlayer(opts: {
  individualMenu?: string;
  feedbacks?: PracticeFeedback[];
} = {}): { world: WorldState; playerId: string } {
  const rng = createRNG('player-feedback-test');
  const players = Array.from({ length: 3 }, (_, i) =>
    generatePlayer(rng.derive(`p${i}`), { enrollmentYear: 1, schoolReputation: 60 })
  );

  const playerId = players[0].id;
  const { individualMenu, feedbacks } = opts;

  const individualPracticeMenus: Record<string, string> = {};
  if (individualMenu) {
    individualPracticeMenus[playerId] = individualMenu;
  }

  const practiceFeedbackHistory: Record<string, PracticeFeedback[]> = {};
  if (feedbacks && feedbacks.length > 0) {
    practiceFeedbackHistory[playerId] = feedbacks;
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
    individualPracticeMenus,
    _summary: null,
    ...(Object.keys(practiceFeedbackHistory).length > 0 ? { practiceFeedbackHistory } : {}),
  } as unknown as HighSchool;

  const world: WorldState = {
    version: '0.45.0',
    seed: 'test',
    currentDate: { year: 1, month: 5, day: 1 },
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
      watchList: [],
      scoutReports: new Map(),
      recruitAttempts: new Map(),
      monthlyScoutBudget: 4,
      usedScoutThisMonth: 0,
    },
  } as unknown as WorldState;

  return { world, playerId };
}

function makeFeedback(month: number, day: number, message: string, practiceType = 'バッティング'): PracticeFeedback {
  return {
    date: { year: 1, month, day },
    practiceType,
    message,
    delta: { stat: 'batting.contact' as import('@/engine/types/calendar').StatTarget, value: 2 },
  };
}

// ============================================================
// B5 テスト: 個別練習メニュー
// ============================================================

describe('Phase S1-B B5: 個別練習メニュー設定の反映', () => {
  // B5-test1: 個別練習メニューが playerProjector に正しく反映される
  it('B5-test1: 個別練習メニューが設定されている場合、individualMenu が返る', () => {
    const { world, playerId } = makeTestWorldWithPlayer({ individualMenu: 'base_running' });
    const view = projectPlayer(world, playerId);

    expect(view).not.toBeNull();
    expect(view!.individualMenu).toBe('base_running');
  });

  it('個別練習メニューが未設定の場合、individualMenu は null', () => {
    const { world, playerId } = makeTestWorldWithPlayer({});
    const view = projectPlayer(world, playerId);

    expect(view).not.toBeNull();
    expect(view!.individualMenu).toBeNull();
  });

  it('別選手のメニュー設定が他の選手に影響しない', () => {
    const rng = createRNG('player-feedback-test');
    const players = Array.from({ length: 3 }, (_, i) =>
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
      coachStyle: {
        offenseType: 'balanced', defenseType: 'balanced',
        practiceEmphasis: 'balanced', aggressiveness: 50,
      },
      yearResults: createEmptyYearResults(),
      // players[0] にのみメニュー設定
      individualPracticeMenus: { [players[0].id]: 'video_analysis' },
      _summary: null,
    } as unknown as HighSchool;

    const world = {
      version: '0.45.0',
      seed: 'test',
      currentDate: { year: 1, month: 5, day: 1 },
      playerSchoolId: 'ps',
      manager: { name: '山田監督', yearsActive: 0, fame: 10, totalWins: 0, totalLosses: 0, koshienAppearances: 0, koshienWins: 0 },
      settings: { autoAdvanceSpeed: 'normal', showDetailedGrowth: false },
      weeklyPlan: { monday: 'batting_basic', tuesday: 'batting_basic', wednesday: 'batting_basic', thursday: 'batting_basic', friday: 'batting_basic', saturday: 'batting_basic', sunday: 'rest' },
      prefecture: '新潟',
      schools: [playerSchool],
      middleSchoolPool: [],
      personRegistry: { entries: new Map() },
      seasonState: createInitialSeasonState(),
      scoutState: { watchList: [], scoutReports: new Map(), recruitAttempts: new Map(), monthlyScoutBudget: 4, usedScoutThisMonth: 0 },
    } as unknown as WorldState;

    const view0 = projectPlayer(world, players[0].id);
    const view1 = projectPlayer(world, players[1].id);

    expect(view0!.individualMenu).toBe('video_analysis');
    expect(view1!.individualMenu).toBeNull();
  });

  it('存在しない選手IDに対して projectPlayer は null を返す', () => {
    const { world } = makeTestWorldWithPlayer({});
    const view = projectPlayer(world, 'non-existent-player-id');
    expect(view).toBeNull();
  });
});

// ============================================================
// B6 テスト: 練習成果フィードバック履歴
// ============================================================

describe('Phase S1-B B6: 練習成果フィードバック履歴', () => {
  // B6-test2: 直近10件の練習成果履歴が日付順で返ること
  it('B6-test2: フィードバックが 10件以下の場合、全件が日付順に返る', () => {
    const feedbacks: PracticeFeedback[] = [
      makeFeedback(4, 1, 'ミート率があがったような気がする'),
      makeFeedback(4, 5, 'ミート率が上がってきた気がする'),
      makeFeedback(4, 10, 'ミート率がしっかり上がっている'),
    ];
    const { world, playerId } = makeTestWorldWithPlayer({ feedbacks });
    const view = projectPlayer(world, playerId);

    expect(view).not.toBeNull();
    expect(view!.practiceFeedbacks).toBeDefined();
    expect(view!.practiceFeedbacks!).toHaveLength(3);

    // 日付順（元の順序 = スライスなので）
    expect(view!.practiceFeedbacks![0].message).toContain('ミート率があがったような気がする');
    expect(view!.practiceFeedbacks![1].message).toContain('ミート率が上がってきた気がする');
    expect(view!.practiceFeedbacks![2].message).toContain('ミート率がしっかり上がっている');
  });

  it('B6-test2: フィードバックが12件あっても直近10件のみ返ること', () => {
    const feedbacks: PracticeFeedback[] = Array.from({ length: 12 }, (_, i) =>
      makeFeedback(4, i + 1, `フィードバック${i + 1}`)
    );
    const { world, playerId } = makeTestWorldWithPlayer({ feedbacks });
    const view = projectPlayer(world, playerId);

    expect(view).not.toBeNull();
    expect(view!.practiceFeedbacks).toBeDefined();
    // 直近10件のみ（12件中最後の10件）
    expect(view!.practiceFeedbacks!).toHaveLength(10);
    // 最後のエントリが最も新しい（12件目）
    expect(view!.practiceFeedbacks![9].message).toContain('フィードバック12');
    // 最初のエントリは3件目（先頭2件はカット）
    expect(view!.practiceFeedbacks![0].message).toContain('フィードバック3');
  });

  it('フィードバック履歴がない場合、practiceFeedbacks は undefined', () => {
    const { world, playerId } = makeTestWorldWithPlayer({});
    const view = projectPlayer(world, playerId);

    expect(view).not.toBeNull();
    expect(view!.practiceFeedbacks).toBeUndefined();
  });

  it('フィードバックの dateLabel が月日形式（例: "4月1日"）', () => {
    const feedbacks: PracticeFeedback[] = [
      makeFeedback(4, 1, 'ミート率があがったような気がする'),
    ];
    const { world, playerId } = makeTestWorldWithPlayer({ feedbacks });
    const view = projectPlayer(world, playerId);

    expect(view!.practiceFeedbacks![0].dateLabel).toBe('4月1日');
  });

  it('フィードバックの practiceType が正しく表示される', () => {
    const feedbacks: PracticeFeedback[] = [
      makeFeedback(4, 1, '球速がほんの少し増したかも', '投球'),
    ];
    const { world, playerId } = makeTestWorldWithPlayer({ feedbacks });
    const view = projectPlayer(world, playerId);

    expect(view!.practiceFeedbacks![0].practiceType).toBe('投球');
    expect(view!.practiceFeedbacks![0].message).toBe('球速がほんの少し増したかも');
  });

  it('practiceFeedbacks に dateLabel, practiceType, message フィールドが存在する', () => {
    const feedbacks: PracticeFeedback[] = [
      makeFeedback(5, 15, 'ミート率があがったような気がする'),
    ];
    const { world, playerId } = makeTestWorldWithPlayer({ feedbacks });
    const view = projectPlayer(world, playerId);

    const fb = view!.practiceFeedbacks![0];
    expect(fb).toHaveProperty('dateLabel');
    expect(fb).toHaveProperty('practiceType');
    expect(fb).toHaveProperty('message');
  });
});
