/**
 * tests/engine/world/practice-game.test.ts
 *
 * 練習試合・紅白戦システムのテスト
 *
 * テスト項目:
 * 1. schedulePracticeMatch — 通常予約、大会期間中の拒否、重複の拒否
 * 2. scheduleIntraSquad — 予約成功
 * 3. executePracticeGame — 結果生成（win/loss/draw）、疲労増分
 * 4. suggestOpponents — 5校以内、評判差フィルタ
 * 5. world-ticker 統合 — 予約日当日に試合が実行される、WorldDayResult に結果が入る
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { advanceWorldDay } from '@/engine/world/world-ticker';
import type { WorldState, HighSchool } from '@/engine/world/world-state';
import {
  createEmptyYearResults,
  createDefaultWeeklyPlan,
  createInitialSeasonState,
  createInitialScoutState,
} from '@/engine/world/world-state';
import {
  schedulePracticeMatch,
  scheduleIntraSquad,
  cancelPracticeGame,
  executePracticeGame,
  suggestOpponents,
  processPracticeGameDay,
} from '@/engine/world/practice-game';
import type { ScheduledPracticeGame } from '@/engine/types/practice-game';
import { generatePlayer } from '@/engine/player/generate';

// ============================================================
// テストヘルパー
// ============================================================

function makeSchool(
  id: string,
  name: string,
  tier: 'full' | 'standard' | 'minimal',
  reputation = 50,
  prefecture = '新潟',
): HighSchool {
  const rng = createRNG(`school-${id}`);
  const players = Array.from({ length: 15 }, (_, i) =>
    generatePlayer(rng.derive(`p${i}`), { enrollmentYear: 1, schoolReputation: reputation })
  );
  return {
    id,
    name,
    prefecture,
    reputation,
    players,
    lineup: null,
    facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 },
    simulationTier: tier,
    coachStyle: {
      offenseType: 'balanced',
      defenseType: 'balanced',
      practiceEmphasis: 'balanced',
      aggressiveness: 50,
    },
    yearResults: createEmptyYearResults(),
    _summary: null,
  };
}

function makeWorld(overrides?: Partial<WorldState>): WorldState {
  const schools: HighSchool[] = [
    makeSchool('player-school', '自校', 'full', 55),
    makeSchool('opponent-a', 'A高校', 'minimal', 50),
    makeSchool('opponent-b', 'B高校', 'minimal', 60),
    makeSchool('opponent-c', 'C高校', 'minimal', 45),
    makeSchool('opponent-far', '遠い高校', 'minimal', 95), // reputation差が大きい
    makeSchool('other-pref', '他県高校', 'minimal', 55, '東京'), // 他県
  ];
  return {
    version: '0.3.0',
    seed: 'practice-test',
    currentDate: { year: 1, month: 5, day: 1 },
    playerSchoolId: 'player-school',
    manager: {
      name: '監督',
      yearsActive: 0,
      fame: 0,
      totalWins: 0,
      totalLosses: 0,
      koshienAppearances: 0,
      koshienWins: 0,
    },
    settings: { autoAdvanceSpeed: 'normal', showDetailedGrowth: false },
    weeklyPlan: createDefaultWeeklyPlan(),
    prefecture: '新潟',
    schools,
    middleSchoolPool: [],
    personRegistry: { entries: new Map() },
    seasonState: createInitialSeasonState(),
    scoutState: createInitialScoutState(),
    activeTournament: null,
    tournamentHistory: [],
    scheduledPracticeGames: [],
    practiceGameHistory: [],
    ...overrides,
  };
}

// ============================================================
// schedulePracticeMatch のテスト
// ============================================================

describe('schedulePracticeMatch', () => {
  it('通常の練習試合を予約できる', () => {
    const world = makeWorld();
    const date = { year: 1, month: 5, day: 5 };
    const result = schedulePracticeMatch(world, 'opponent-a', date);

    expect(typeof result).toBe('object');
    const newWorld = result as WorldState;
    expect(newWorld.scheduledPracticeGames).toHaveLength(1);
    expect(newWorld.scheduledPracticeGames![0].opponentSchoolId).toBe('opponent-a');
    expect(newWorld.scheduledPracticeGames![0].type).toBe('scrimmage');
    expect(newWorld.scheduledPracticeGames![0].scheduledDate).toEqual(date);
  });

  it('大会期間中は予約できない', () => {
    const world = makeWorld({
      seasonState: {
        ...createInitialSeasonState(),
        phase: 'summer_tournament',
      },
    });
    const date = { year: 1, month: 7, day: 15 };
    const result = schedulePracticeMatch(world, 'opponent-a', date);
    expect(result).toBe('tournament_active');
  });

  it('秋大会中も予約できない', () => {
    const world = makeWorld({
      seasonState: {
        ...createInitialSeasonState(),
        phase: 'autumn_tournament',
      },
    });
    const date = { year: 1, month: 9, day: 20 };
    const result = schedulePracticeMatch(world, 'opponent-a', date);
    expect(result).toBe('tournament_active');
  });

  it('過去日には予約できない', () => {
    const world = makeWorld();
    const date = { year: 1, month: 4, day: 30 }; // 今日(5/1)より前
    const result = schedulePracticeMatch(world, 'opponent-a', date);
    expect(result).toBe('date_past');
  });

  it('7日超先には予約できない', () => {
    const world = makeWorld();
    const date = { year: 1, month: 5, day: 9 }; // 8日先
    const result = schedulePracticeMatch(world, 'opponent-a', date);
    expect(result).toBe('date_too_far');
  });

  it('同日に重複予約できない', () => {
    const world = makeWorld({
      scheduledPracticeGames: [
        {
          id: 'practice-scrimmage-1-5-5',
          type: 'scrimmage',
          scheduledDate: { year: 1, month: 5, day: 5 },
          opponentSchoolId: 'opponent-a',
        },
      ],
    });
    const date = { year: 1, month: 5, day: 5 };
    const result = schedulePracticeMatch(world, 'opponent-b', date);
    expect(result).toBe('date_conflict');
  });

  it('3件まで予約できる', () => {
    let world = makeWorld();
    world = schedulePracticeMatch(world, 'opponent-a', { year: 1, month: 5, day: 2 }) as WorldState;
    world = schedulePracticeMatch(world, 'opponent-b', { year: 1, month: 5, day: 3 }) as WorldState;
    world = schedulePracticeMatch(world, 'opponent-c', { year: 1, month: 5, day: 4 }) as WorldState;
    expect((world.scheduledPracticeGames ?? []).length).toBe(3);
    // 4件目は拒否
    const result = schedulePracticeMatch(world, 'opponent-a', { year: 1, month: 5, day: 5 });
    expect(result).toBe('max_scheduled');
  });

  it('存在しない相手校は拒否される', () => {
    const world = makeWorld();
    const result = schedulePracticeMatch(world, 'no-such-school', { year: 1, month: 5, day: 5 });
    expect(result).toBe('opponent_not_found');
  });
});

// ============================================================
// scheduleIntraSquad のテスト
// ============================================================

describe('scheduleIntraSquad', () => {
  it('紅白戦を予約できる', () => {
    const world = makeWorld();
    const date = { year: 1, month: 5, day: 3 };
    const result = scheduleIntraSquad(world, date);

    expect(typeof result).toBe('object');
    const newWorld = result as WorldState;
    expect(newWorld.scheduledPracticeGames).toHaveLength(1);
    expect(newWorld.scheduledPracticeGames![0].type).toBe('intra_squad');
    expect(newWorld.scheduledPracticeGames![0].opponentSchoolId).toBeNull();
  });

  it('大会期間中は紅白戦も予約できない', () => {
    const world = makeWorld({
      seasonState: {
        ...createInitialSeasonState(),
        phase: 'summer_tournament',
      },
    });
    const result = scheduleIntraSquad(world, { year: 1, month: 7, day: 12 });
    expect(result).toBe('tournament_active');
  });
});

// ============================================================
// cancelPracticeGame のテスト
// ============================================================

describe('cancelPracticeGame', () => {
  it('予約をキャンセルできる', () => {
    const world = makeWorld({
      scheduledPracticeGames: [
        {
          id: 'test-id-1',
          type: 'scrimmage',
          scheduledDate: { year: 1, month: 5, day: 5 },
          opponentSchoolId: 'opponent-a',
        },
        {
          id: 'test-id-2',
          type: 'intra_squad',
          scheduledDate: { year: 1, month: 5, day: 6 },
          opponentSchoolId: null,
        },
      ],
    });
    const result = cancelPracticeGame(world, 'test-id-1');
    expect(result.scheduledPracticeGames).toHaveLength(1);
    expect(result.scheduledPracticeGames![0].id).toBe('test-id-2');
  });

  it('存在しないIDのキャンセルは変化なし', () => {
    const world = makeWorld({
      scheduledPracticeGames: [
        {
          id: 'test-id-1',
          type: 'scrimmage',
          scheduledDate: { year: 1, month: 5, day: 5 },
          opponentSchoolId: 'opponent-a',
        },
      ],
    });
    const result = cancelPracticeGame(world, 'no-such-id');
    expect(result.scheduledPracticeGames).toHaveLength(1);
  });
});

// ============================================================
// executePracticeGame のテスト
// ============================================================

describe('executePracticeGame', () => {
  it('scrimmage: 試合結果が生成される', () => {
    const playerSchool = makeSchool('player', '自校', 'full', 55);
    const opponentSchool = makeSchool('opponent', '相手校', 'standard', 50);
    const rng = createRNG('exec-test');

    const scheduled: ScheduledPracticeGame = {
      id: 'test-scrimmage-1',
      type: 'scrimmage',
      scheduledDate: { year: 1, month: 5, day: 5 },
      opponentSchoolId: opponentSchool.id,
    };

    const record = executePracticeGame(scheduled, playerSchool, opponentSchool, rng);

    expect(record.type).toBe('scrimmage');
    expect(['win', 'loss', 'draw']).toContain(record.result);
    expect(record.finalScore.player).toBeGreaterThanOrEqual(0);
    expect(record.finalScore.opponent).toBeGreaterThanOrEqual(0);
    expect(record.fatigueDelta).toBeGreaterThanOrEqual(8);
    expect(record.fatigueDelta).toBeLessThanOrEqual(15);
    expect(record.opponentSchoolId).toBe(opponentSchool.id);
    expect(record.opponentSchoolName).toBe(opponentSchool.name);
  });

  it('intra_squad: 紅白戦の結果が生成される', () => {
    const playerSchool = makeSchool('player', '自校', 'full', 55);
    const rng = createRNG('intra-test');

    const scheduled: ScheduledPracticeGame = {
      id: 'test-intra-1',
      type: 'intra_squad',
      scheduledDate: { year: 1, month: 5, day: 3 },
      opponentSchoolId: null,
    };

    const record = executePracticeGame(scheduled, playerSchool, null, rng);

    expect(record.type).toBe('intra_squad');
    expect(['win', 'loss', 'draw']).toContain(record.result);
    expect(record.fatigueDelta).toBeGreaterThanOrEqual(3);
    expect(record.fatigueDelta).toBeLessThanOrEqual(8);
    expect(record.opponentSchoolId).toBeNull();
    expect(record.opponentSchoolName).toBeNull();
  });

  it('scrimmage の疲労は intra_squad より大きい傾向', () => {
    const playerSchool = makeSchool('player', '自校', 'full', 55);
    const opponentSchool = makeSchool('opponent', '相手', 'standard', 50);

    const scrimmageFatigues: number[] = [];
    const intraFatigues: number[] = [];

    // 複数回実行して傾向を確認
    for (let i = 0; i < 20; i++) {
      const rng = createRNG(`fat-${i}`);
      const s: ScheduledPracticeGame = {
        id: `s-${i}`,
        type: 'scrimmage',
        scheduledDate: { year: 1, month: 5, day: 5 },
        opponentSchoolId: opponentSchool.id,
      };
      scrimmageFatigues.push(executePracticeGame(s, playerSchool, opponentSchool, rng).fatigueDelta);

      const rng2 = createRNG(`fat-i-${i}`);
      const p: ScheduledPracticeGame = {
        id: `p-${i}`,
        type: 'intra_squad',
        scheduledDate: { year: 1, month: 5, day: 5 },
        opponentSchoolId: null,
      };
      intraFatigues.push(executePracticeGame(p, playerSchool, null, rng2).fatigueDelta);
    }

    const avgScrimmage = scrimmageFatigues.reduce((a, b) => a + b, 0) / scrimmageFatigues.length;
    const avgIntra = intraFatigues.reduce((a, b) => a + b, 0) / intraFatigues.length;
    // 練習試合の疲労の方が平均的に大きい
    expect(avgScrimmage).toBeGreaterThan(avgIntra);
  });
});

// ============================================================
// suggestOpponents のテスト
// ============================================================

describe('suggestOpponents', () => {
  it('同一都道府県・評判差±30以内の学校のみ返す', () => {
    const world = makeWorld();
    const candidates = suggestOpponents(world, 5);

    // opponent-far (rep=95, diff=40) と other-pref (他県) は除外
    const ids = candidates.map((s) => s.id);
    expect(ids).not.toContain('opponent-far');
    expect(ids).not.toContain('other-pref');
    expect(ids).not.toContain('player-school');

    // 同一都道府県・評判差30以内なら含む
    expect(ids).toContain('opponent-a');
    expect(ids).toContain('opponent-b');
    expect(ids).toContain('opponent-c');
  });

  it('自校は候補に含まれない', () => {
    const world = makeWorld();
    const candidates = suggestOpponents(world, 5);
    expect(candidates.map((c) => c.id)).not.toContain('player-school');
  });

  it('maxCount 以下の件数を返す', () => {
    const world = makeWorld();
    const candidates = suggestOpponents(world, 2);
    expect(candidates.length).toBeLessThanOrEqual(2);
  });

  it('評判差の小さい順にソートされる', () => {
    const world = makeWorld();
    const candidates = suggestOpponents(world, 10);
    const playerRep = world.schools.find((s) => s.id === world.playerSchoolId)!.reputation;

    for (let i = 1; i < candidates.length; i++) {
      const prevDiff = Math.abs(candidates[i - 1].reputation - playerRep);
      const currDiff = Math.abs(candidates[i].reputation - playerRep);
      expect(prevDiff).toBeLessThanOrEqual(currDiff);
    }
  });
});

// ============================================================
// processPracticeGameDay のテスト
// ============================================================

describe('processPracticeGameDay', () => {
  it('予約日当日に試合が実行される', () => {
    const world = makeWorld({
      currentDate: { year: 1, month: 5, day: 5 },
      scheduledPracticeGames: [
        {
          id: 'test-scheduled-1',
          type: 'scrimmage',
          scheduledDate: { year: 1, month: 5, day: 5 },
          opponentSchoolId: 'opponent-a',
        },
      ],
    });

    const rng = createRNG('process-test');
    const outcome = processPracticeGameDay(world, rng);

    expect(outcome).not.toBeNull();
    expect(outcome!.record.type).toBe('scrimmage');
    expect(outcome!.record.id).toBe('test-scheduled-1');
    // 実行後: scheduledPracticeGames から削除
    expect(outcome!.nextWorld.scheduledPracticeGames).toHaveLength(0);
    // 履歴に追加
    expect(outcome!.nextWorld.practiceGameHistory).toHaveLength(1);
  });

  it('予約がない日は null を返す', () => {
    const world = makeWorld({
      currentDate: { year: 1, month: 5, day: 5 },
      scheduledPracticeGames: [
        {
          id: 'test-scheduled-2',
          type: 'scrimmage',
          scheduledDate: { year: 1, month: 5, day: 10 }, // 5/10、今日は5/5
          opponentSchoolId: 'opponent-a',
        },
      ],
    });

    const rng = createRNG('process-no-game');
    const outcome = processPracticeGameDay(world, rng);
    expect(outcome).toBeNull();
  });

  it('大会期間中は試合をスキップする', () => {
    const world = makeWorld({
      currentDate: { year: 1, month: 7, day: 15 },
      seasonState: {
        ...createInitialSeasonState(),
        phase: 'summer_tournament',
      },
      scheduledPracticeGames: [
        {
          id: 'test-skip',
          type: 'scrimmage',
          scheduledDate: { year: 1, month: 7, day: 15 },
          opponentSchoolId: 'opponent-a',
        },
      ],
    });

    const rng = createRNG('process-skip');
    const outcome = processPracticeGameDay(world, rng);
    expect(outcome).toBeNull();
  });

  it('実行後に自校選手の疲労が増加する', () => {
    const world = makeWorld({
      currentDate: { year: 1, month: 5, day: 5 },
      scheduledPracticeGames: [
        {
          id: 'test-fatigue',
          type: 'scrimmage',
          scheduledDate: { year: 1, month: 5, day: 5 },
          opponentSchoolId: 'opponent-a',
        },
      ],
    });

    const playerSchool = world.schools.find((s) => s.id === world.playerSchoolId)!;
    const originalStaminaSum = playerSchool.players.reduce(
      (sum, p) => sum + p.stats.base.stamina, 0
    );

    const rng = createRNG('fatigue-test');
    const outcome = processPracticeGameDay(world, rng);

    expect(outcome).not.toBeNull();
    const updatedPlayerSchool = outcome!.nextWorld.schools.find(
      (s) => s.id === world.playerSchoolId
    )!;
    const newStaminaSum = updatedPlayerSchool.players.reduce(
      (sum, p) => sum + p.stats.base.stamina, 0
    );
    // 疲労が増加 = スタミナが減少
    expect(newStaminaSum).toBeLessThan(originalStaminaSum);
  });
});

// ============================================================
// world-ticker 統合テスト
// ============================================================

describe('world-ticker 統合: 練習試合', () => {
  it('予約日当日の advanceWorldDay で practiceGameResult が返る', () => {
    // 5/4 → 5/5 に進む。5/5 に練習試合予約あり
    const world = makeWorld({
      currentDate: { year: 1, month: 5, day: 4 },
      scheduledPracticeGames: [
        {
          id: 'ticker-test-1',
          type: 'scrimmage',
          scheduledDate: { year: 1, month: 5, day: 5 },
          opponentSchoolId: 'opponent-a',
        },
      ],
    });

    const rng = createRNG('ticker-practice');
    const { nextWorld, result } = advanceWorldDay(world, 'batting_basic', rng);

    // 翌日(5/5)に進んでいる
    expect(nextWorld.currentDate).toEqual({ year: 1, month: 5, day: 5 });

    // 試合日(5/5)なので practiceGameResult が設定されている
    expect(result.practiceGameResult).toBeDefined();
    expect(result.practiceGameResult).not.toBeNull();
    expect(result.practiceGameResult!.type).toBe('scrimmage');
    expect(result.practiceGameResult!.id).toBe('ticker-test-1');
  });

  it('advanceWorldDay 後、練習試合が履歴に移動している', () => {
    const world = makeWorld({
      currentDate: { year: 1, month: 5, day: 4 },
      scheduledPracticeGames: [
        {
          id: 'ticker-hist-1',
          type: 'intra_squad',
          scheduledDate: { year: 1, month: 5, day: 5 },
          opponentSchoolId: null,
        },
      ],
    });

    const rng = createRNG('ticker-hist');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);

    expect(nextWorld.scheduledPracticeGames ?? []).toHaveLength(0);
    expect(nextWorld.practiceGameHistory ?? []).toHaveLength(1);
    expect(nextWorld.practiceGameHistory![0].type).toBe('intra_squad');
  });

  it('試合がない日は practiceGameResult が undefined', () => {
    const world = makeWorld({
      currentDate: { year: 1, month: 5, day: 10 },
      scheduledPracticeGames: [],
    });

    const rng = createRNG('ticker-no-game');
    const { result } = advanceWorldDay(world, 'batting_basic', rng);

    expect(result.practiceGameResult).toBeUndefined();
  });
});
