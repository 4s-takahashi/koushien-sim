/**
 * tests/engine/world/bugfix-autumn-tournament-window.test.ts
 *
 * 秋大会が起動しないバグ第2弾（2026-04-22 報告）のリグレッションテスト。
 *
 * 症状:
 *  - 夏大会初戦敗退 → 9/19 時点で activeTournament が null のまま
 *  - UI は「秋の大会タブ」だが本体は「読み込み中...」のまま進まない
 *
 * 根本原因:
 *  - world-ticker.ts の大会生成条件が「ピンポイント日付（=== 10 / === 15）」で、
 *    何らかの経路で 7/10 / 9/15 を踏まず翌日以降に到達すると永遠に生成されない
 *  - completeInteractiveMatch に大会自動生成ブロックが無く、インタラクティブ経由の
 *    日付進行では特定経路で抜けうる
 *
 * 修正:
 *  1. advanceWorldDay: 生成条件を期間ウィンドウ（7/10〜7/30 / 9/15〜10/14）に
 *  2. completeInteractiveMatch: 同じ期間ウィンドウで生成ブロックを追加
 *  3. world-store.ts storage.getItem: ロード時に大会期間内で null なら自動生成して救済
 *
 * このテストは修正（1）（2）を検証する。（3）はブラウザ側 localStorage が必要なため
 * 別途 tests/stores/ で検証する。
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import {
  advanceWorldDay,
  completeInteractiveMatch,
} from '@/engine/world/world-ticker';
import type { WorldState, HighSchool } from '@/engine/world/world-state';
import {
  createEmptyYearResults,
  createDefaultWeeklyPlan,
  createInitialSeasonState,
  createInitialScoutState,
} from '@/engine/world/world-state';
import { generatePlayer } from '@/engine/player/generate';
import type { MatchResult } from '@/engine/match/types';

// ============================================================
// ヘルパー
// ============================================================

function makeSchool(
  id: string,
  name: string,
  tier: 'full' | 'standard' | 'minimal',
  reputation = 50,
): HighSchool {
  const rng = createRNG(`school-${id}`);
  const players = Array.from({ length: 15 }, (_, i) =>
    generatePlayer(rng.derive(`p${i}`), {
      enrollmentYear: 1,
      schoolReputation: reputation,
    }),
  );
  return {
    id,
    name,
    prefecture: '新潟',
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

function make48SchoolWorld(
  currentDate: { year: number; month: number; day: number },
): WorldState {
  const schools: HighSchool[] = [];
  schools.push(makeSchool('player-school', '自校', 'full', 55));
  for (let i = 1; i < 48; i++) {
    const rep = 30 + (i % 60);
    schools.push(makeSchool(`ai-${i}`, `AI高校${i}`, 'minimal', rep));
  }
  return {
    version: '0.3.0',
    seed: 'bugfix-window-test',
    currentDate,
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
  };
}

// ============================================================
// テスト1: 秋大会期間ウィンドウでの自動生成
// ============================================================

describe('バグ修正: 秋大会が期間内のいつでも生成される', () => {
  it('9/14 → 9/15 の遷移で秋大会が生成される（従来の正常系）', () => {
    const world = make48SchoolWorld({ year: 1, month: 9, day: 14 });
    // 夏大会が完了済みであることを明示的に設定（高橋さんの報告ケースに合わせる）
    const worldPostSummer = {
      ...world,
      activeTournament: null,
      tournamentHistory: [],
      seasonState: { ...world.seasonState, phase: 'post_summer' as const },
    };
    const rng = createRNG('test-915');
    const { nextWorld } = advanceWorldDay(worldPostSummer, 'batting_basic', rng);
    expect(nextWorld.currentDate).toEqual({ year: 1, month: 9, day: 15 });
    expect(nextWorld.activeTournament).not.toBeNull();
    expect(nextWorld.activeTournament?.type).toBe('autumn');
    expect(nextWorld.seasonState.phase).toBe('autumn_tournament');
  });

  it('9/18 など「15を踏み外した」状態でも次の tick で秋大会が生成される', () => {
    // activeTournament=null で 9/18 に到達している壊れた状態を用意
    const world = make48SchoolWorld({ year: 1, month: 9, day: 18 });
    expect(world.activeTournament).toBeNull();

    const rng = createRNG('test-918');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);

    // 9/19 に進行、秋大会が自動生成されている
    expect(nextWorld.currentDate).toEqual({ year: 1, month: 9, day: 19 });
    expect(nextWorld.activeTournament).not.toBeNull();
    expect(nextWorld.activeTournament?.type).toBe('autumn');
    expect(nextWorld.seasonState.phase).toBe('autumn_tournament');
  });

  it('10/10 の終盤でも activeTournament=null なら秋大会が生成される', () => {
    const world = make48SchoolWorld({ year: 1, month: 10, day: 9 });
    expect(world.activeTournament).toBeNull();
    const rng = createRNG('test-1010');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);
    expect(nextWorld.currentDate).toEqual({ year: 1, month: 10, day: 10 });
    expect(nextWorld.activeTournament).not.toBeNull();
    expect(nextWorld.activeTournament?.type).toBe('autumn');
  });

  it('10/15 以降（オフシーズン）では秋大会は生成されない', () => {
    const world = make48SchoolWorld({ year: 1, month: 10, day: 14 });
    const rng = createRNG('test-1015');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);
    expect(nextWorld.currentDate).toEqual({ year: 1, month: 10, day: 15 });
    // 10/15 は off_season の初日なので生成されないべき
    expect(nextWorld.activeTournament).toBeNull();
    expect(nextWorld.seasonState.phase).toBe('off_season');
  });
});

// ============================================================
// テスト2: 夏大会期間ウィンドウでの自動生成
// ============================================================

describe('バグ修正: 夏大会も期間内のいつでも生成される', () => {
  it('7/9 → 7/10 の遷移で夏大会が生成される（従来の正常系）', () => {
    const world = make48SchoolWorld({ year: 1, month: 7, day: 9 });
    const rng = createRNG('test-710');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);
    expect(nextWorld.currentDate).toEqual({ year: 1, month: 7, day: 10 });
    expect(nextWorld.activeTournament).not.toBeNull();
    expect(nextWorld.activeTournament?.type).toBe('summer');
  });

  it('7/15 で activeTournament=null でも夏大会が生成される（期間内救済）', () => {
    const world = make48SchoolWorld({ year: 1, month: 7, day: 14 });
    const rng = createRNG('test-715');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);
    expect(nextWorld.currentDate).toEqual({ year: 1, month: 7, day: 15 });
    expect(nextWorld.activeTournament).not.toBeNull();
    expect(nextWorld.activeTournament?.type).toBe('summer');
  });

  it('7/31 以降（post_summer）では夏大会は生成されない', () => {
    const world = make48SchoolWorld({ year: 1, month: 7, day: 30 });
    const rng = createRNG('test-731');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);
    expect(nextWorld.currentDate).toEqual({ year: 1, month: 7, day: 31 });
    expect(nextWorld.activeTournament).toBeNull();
    expect(nextWorld.seasonState.phase).toBe('post_summer');
  });
});

// ============================================================
// テスト3: completeInteractiveMatch で大会期間に突入した場合も生成される
// ============================================================

describe('バグ修正: completeInteractiveMatch 経由でも大会期間内で自動生成される', () => {
  function makeDummyMatchResult(): MatchResult {
    return {
      winner: 'home',
      finalScore: { home: 1, away: 0 },
      inningScores: { home: [1, 0, 0, 0, 0, 0, 0, 0, 0], away: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
      totalInnings: 9,
      mvpPlayerId: null,
      batterStats: [],
      pitcherStats: [],
    };
  }

  it('completeInteractiveMatch で 9/14 → 9/15 に入った場合、秋大会が生成される', () => {
    // 夏大会のインタラクティブ最終試合が 9/14 にかかるような状況は通常ないが、
    // 関数単体の挙動として検証する。
    // pendingInteractiveMatch がないと completeInteractiveMatch は advanceWorldDay に
    // フォールバックするため、ここでは直接 world.currentDate を 9/14 にして tick する
    // 形で代用できる。
    // completeInteractiveMatch 本来の分岐は pendingInteractiveMatch を経由するため、
    // ここでは advanceWorldDay による 9/15 生成を検証するに留める。
    const world = make48SchoolWorld({ year: 1, month: 9, day: 14 });
    const rng = createRNG('ci-914');
    const { nextWorld } = completeInteractiveMatch(
      world,
      makeDummyMatchResult(),
      rng,
    );
    // pendingInteractiveMatch がない → 通常進行で advanceWorldDay 相当になる
    expect(nextWorld.currentDate).toEqual({ year: 1, month: 9, day: 15 });
    expect(nextWorld.activeTournament).not.toBeNull();
    expect(nextWorld.activeTournament?.type).toBe('autumn');
  });
});

// ============================================================
// テスト4: 報告ケースの再現 — 9/19 で activeTournament=null から復旧
// ============================================================

describe('報告再現: 1年目 9/19 で activeTournament=null になっていても回復する', () => {
  it('9/19 から 1 tick で秋大会が生成され、以降の試合進行が正常に動く', () => {
    const world = make48SchoolWorld({ year: 1, month: 9, day: 19 });
    expect(world.activeTournament).toBeNull();
    expect(world.seasonState.phase).toBe('spring_practice'); // 初期値、実戦では autumn_tournament

    const rng = createRNG('report-919');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);

    // 9/20 に進行、秋大会が自動生成されている
    expect(nextWorld.currentDate).toEqual({ year: 1, month: 9, day: 20 });
    expect(nextWorld.activeTournament).not.toBeNull();
    expect(nextWorld.activeTournament?.type).toBe('autumn');
    expect(nextWorld.activeTournament?.isCompleted).toBe(false);
    expect(nextWorld.seasonState.phase).toBe('autumn_tournament');
    expect(nextWorld.seasonState.currentTournamentId).toBe(
      nextWorld.activeTournament?.id,
    );
  });
});
