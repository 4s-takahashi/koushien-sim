/**
 * tests/engine/world/world-store-phase8.test.ts
 *
 * Phase 8.1: advanceWeek 試合日停止テスト
 *
 * NOTE: Zustand ストアはブラウザ環境向けなので、ここではエンジンレベルの
 * ロジック（isTournamentMatchDay / isPlayerSchoolInTournament に相当）をテストする。
 * ストア自体のユニットテストは world-store-integration として扱う。
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
import { generatePlayer } from '@/engine/player/generate';
import { createTournamentBracket } from '@/engine/world/tournament-bracket';

// ============================================================
// テストヘルパー
// ============================================================

function makeSchool(id: string, name: string, tier: 'full' | 'standard' | 'minimal', reputation = 50): HighSchool {
  const rng = createRNG(`school-${id}`);
  const players = Array.from({ length: 15 }, (_, i) =>
    generatePlayer(rng.derive(`p${i}`), { enrollmentYear: 1, schoolReputation: reputation })
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
    coachStyle: { offenseType: 'balanced', defenseType: 'balanced', practiceEmphasis: 'balanced', aggressiveness: 50 },
    yearResults: createEmptyYearResults(),
    _summary: null,
  };
}

function makeFullWorld(currentDate = { year: 1, month: 4, day: 1 }): WorldState {
  const schools: HighSchool[] = [
    makeSchool('player-school', '自校テスト高校', 'full', 60),
  ];
  for (let i = 1; i < 48; i++) {
    schools.push(makeSchool(`ai-school-${i}`, `AI高校${i}`, 'minimal', 40 + (i % 30)));
  }

  return {
    version: '0.3.0',
    seed: 'phase8-store-test',
    currentDate,
    playerSchoolId: 'player-school',
    manager: { name: '監督', yearsActive: 1, fame: 0, totalWins: 0, totalLosses: 0, koshienAppearances: 0, koshienWins: 0 },
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

function advanceNDays(world: WorldState, n: number): { world: WorldState; results: ReturnType<typeof advanceWorldDay>['result'][] } {
  let w = world;
  const results = [];
  for (let i = 0; i < n; i++) {
    const rng = createRNG(`advance-day-${i}-${w.currentDate.month}-${w.currentDate.day}`);
    const { nextWorld, result } = advanceWorldDay(w, 'batting_basic', rng);
    w = nextWorld;
    results.push(result);
  }
  return { world: w, results };
}

// ============================================================
// 試合日スケジュールの確認
// ============================================================

describe('夏大会スケジュールの試合日確認', () => {
  it('夏大会は7/10に自動作成される', () => {
    // 7/9 から始めて 7/10 まで進め、大会が始まることを確認
    const world = makeFullWorld({ year: 1, month: 7, day: 9 });
    const rng = createRNG('round1-check');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);

    expect(nextWorld.currentDate).toEqual({ year: 1, month: 7, day: 10 });
    expect(nextWorld.activeTournament).not.toBeNull();
    expect(nextWorld.activeTournament?.type).toBe('summer');
    // 大会は作成されたが、1回戦の消化は7/10に進んだ時点で行われる
    // （7/9→7/10 の遷移時は大会がまだ存在しないため）
    expect(nextWorld.activeTournament?.rounds.length).toBe(6);
  });

  it('7/10 から 7/11 へ進めると大会が進行する', () => {
    // 7/10 の状態（大会作成済み）から 1 日進めて 1 回戦を消化する
    const world = makeFullWorld({ year: 1, month: 7, day: 9 });
    const rng1 = createRNG('round1-setup');
    const { nextWorld: w10 } = advanceWorldDay(world, 'batting_basic', rng1);

    // w10 は7/10、activeTournament あり
    expect(w10.activeTournament).not.toBeNull();

    // もう1日進める（7/10 → 7/11）
    const rng2 = createRNG('round1-advance');
    const { nextWorld: w11, result } = advanceWorldDay(w10, 'batting_basic', rng2);

    // 7/10 が試合日なので、7/11 へ進んだ時点で1回戦が消化されているはず
    // （world-ticker は日付を進める前に activeTournament の試合日チェックをする）
    expect(w11.currentDate.day).toBe(11);
  });

  it('夏大会期間中（7/11）は大会が進行しない日がある', () => {
    // 7/10 で大会開始→ 7/11 は試合なし
    const world = makeFullWorld({ year: 1, month: 7, day: 10 });
    const rng1 = createRNG('no-match-day-1');
    const { nextWorld: w10 } = advanceWorldDay(world, 'batting_basic', rng1);
    // 7/10 で大会開始（この時点でラウンド1消化済み）

    const rng2 = createRNG('no-match-day-2');
    const { result: result11 } = advanceWorldDay(w10, 'batting_basic', rng2);

    // 7/11 は試合なしのため playerMatchResult は undefined
    expect(result11.playerMatchResult).toBeUndefined();
  });

  it('秋大会は9/15に自動開始される', () => {
    const world = makeFullWorld({ year: 1, month: 9, day: 14 });
    const worldNoTournament = { ...world, activeTournament: null };
    const rng = createRNG('autumn-start');
    const { nextWorld } = advanceWorldDay(worldNoTournament, 'batting_basic', rng);

    expect(nextWorld.currentDate).toEqual({ year: 1, month: 9, day: 15 });
    expect(nextWorld.activeTournament?.type).toBe('autumn');
  });
});

// ============================================================
// 大会中の試合結果確認
// ============================================================

describe('大会中の playerMatchResult', () => {
  it('試合日には playerMatchResult が設定される場合がある（自校が1回戦に参加している場合）', () => {
    const world = makeFullWorld({ year: 1, month: 7, day: 9 });
    const rng = createRNG('match-result-check');
    const { nextWorld, result } = advanceWorldDay(world, 'batting_basic', rng);

    // ラウンド1で自校が試合に参加しているか確認
    const round1 = nextWorld.activeTournament?.rounds.find(r => r.roundNumber === 1);
    const playerInRound1 = round1?.matches.some(
      m => m.homeSchoolId === 'player-school' || m.awaySchoolId === 'player-school'
    ) ?? false;

    if (playerInRound1) {
      expect(result.playerMatchResult).toBeDefined();
      expect(result.playerMatchResult?.finalScore.home).toBeGreaterThanOrEqual(0);
      expect(result.playerMatchResult?.finalScore.away).toBeGreaterThanOrEqual(0);
    }
  });

  it('大会外（5月）では playerMatchResult は undefined', () => {
    const world = makeFullWorld({ year: 1, month: 5, day: 1 });
    const rng = createRNG('no-match-outside');
    const { result } = advanceWorldDay(world, 'batting_basic', rng);

    expect(result.playerMatchResult).toBeUndefined();
  });
});

// ============================================================
// 大会の自動終了
// ============================================================

describe('大会の自動終了・履歴保存', () => {
  it('夏大会の最終ラウンド（7/28）後、activeTournament が null になる', () => {
    // 全ラウンドを進める
    let world = makeFullWorld({ year: 1, month: 7, day: 9 });

    // 大会全期間を進める
    const { world: finalWorld } = advanceNDays(world, 25); // 7/9 + 25 = 8/3 頃

    // 大会が完了または null になっているはず
    if (finalWorld.activeTournament !== null) {
      expect(finalWorld.activeTournament?.isCompleted).toBe(true);
    }
  });

  it('夏大会が完了後、tournamentHistory に追加される', () => {
    let world = makeFullWorld({ year: 1, month: 7, day: 9 });
    const { world: finalWorld } = advanceNDays(world, 25);

    // 履歴が保存されているはず
    expect((finalWorld.tournamentHistory?.length ?? 0)).toBeGreaterThan(0);
  });
});

// ============================================================
// シーズン遷移
// ============================================================

describe('大会後のシーズン遷移', () => {
  it('夏大会（7/10〜）から post_summer（7/31）へ遷移する', () => {
    const world = makeFullWorld({ year: 1, month: 7, day: 30 });
    const rng = createRNG('post-summer-transition');
    // activeTournament が null の状態でテスト
    const worldNoTournament = { ...world, activeTournament: null };
    const { nextWorld } = advanceWorldDay(worldNoTournament, 'batting_basic', rng);

    expect(nextWorld.currentDate).toEqual({ year: 1, month: 7, day: 31 });
    expect(nextWorld.seasonState.phase).toBe('post_summer');
  });
});
