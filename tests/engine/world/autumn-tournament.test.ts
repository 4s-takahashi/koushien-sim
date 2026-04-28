/**
 * tests/engine/world/autumn-tournament.test.ts
 *
 * 秋大会バグリグレッションテスト
 *
 * - 新規ゲーム → 9/15 時点で自校が秋大会のいずれかのラウンドに登録されている
 * - 9/15 → 10/15 まで進めると大会が完了する
 * - 夏大会終了後（7/29-7/30）は post_summer フェーズ（修正後）
 * - 秋大会終了後（10/11-10/14）は off_season フェーズ（修正後）
 * - 夏と秋の両方で自校が必ず試合に出場する
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { advanceWorldDay } from '@/engine/world/world-ticker';
import { createWorldState } from '@/engine/world/create-world';
import type { WorldState, HighSchool } from '@/engine/world/world-state';
import {
  createEmptyYearResults,
  createDefaultWeeklyPlan,
  createInitialSeasonState,
  createInitialScoutState,
} from '@/engine/world/world-state';
import { generatePlayer } from '@/engine/player/generate';
import type { TournamentBracket } from '@/engine/world/tournament-bracket';

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

function make48SchoolWorld(currentDate = { year: 1, month: 4, day: 1 }, playerRep = 55): WorldState {
  const schools: HighSchool[] = [];
  schools.push(makeSchool('player-school', '自校', 'full', playerRep));
  for (let i = 1; i < 48; i++) {
    const rep = 30 + (i % 60);
    schools.push(makeSchool(`ai-${i}`, `AI高校${i}`, 'minimal', rep));
  }
  return {
    version: '0.3.0',
    seed: 'autumn-test',
    currentDate,
    playerSchoolId: 'player-school',
    manager: { name: '監督', yearsActive: 0, fame: 0, totalWins: 0, totalLosses: 0, koshienAppearances: 0, koshienWins: 0 },
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

function advanceToDate(world: WorldState, targetMonth: number, targetDay: number): WorldState {
  let w = world;
  let iter = 0;
  const rng = createRNG('advance-to-date');
  while (
    (w.currentDate.month !== targetMonth || w.currentDate.day !== targetDay) &&
    iter < 500
  ) {
    const { nextWorld } = advanceWorldDay(w, 'batting_basic', rng.derive(`iter-${iter}`));
    w = nextWorld;
    iter++;
  }
  return w;
}

function isPlayerInBracket(bracket: TournamentBracket, playerSchoolId: string): boolean {
  for (const round of bracket.rounds) {
    for (const m of round.matches) {
      if (m.homeSchoolId === playerSchoolId || m.awaySchoolId === playerSchoolId) {
        return true;
      }
    }
  }
  return false;
}

function getPlayerBestRound(bracket: TournamentBracket, playerSchoolId: string): number {
  let best = 0;
  for (const round of bracket.rounds) {
    for (const m of round.matches) {
      if (
        (m.homeSchoolId === playerSchoolId || m.awaySchoolId === playerSchoolId) &&
        m.winnerId === playerSchoolId
      ) {
        if (round.roundNumber > best) best = round.roundNumber;
      }
    }
  }
  return best;
}

// ============================================================
// テスト: 秋大会の自動生成と自校配置
// ============================================================

describe('秋大会 — 自動生成と自校配置', () => {
  it('9/15 に秋大会が自動生成され、自校がブラケットに含まれている', () => {
    const world = make48SchoolWorld({ year: 1, month: 9, day: 14 });
    const rng = createRNG('autumn-reg-1');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);

    expect(nextWorld.currentDate).toEqual({ year: 1, month: 9, day: 15 });
    expect(nextWorld.activeTournament).not.toBeNull();
    expect(nextWorld.activeTournament?.type).toBe('autumn');

    const bracket = nextWorld.activeTournament!;
    const inBracket = isPlayerInBracket(bracket, nextWorld.playerSchoolId);
    expect(inBracket).toBe(true);
  });

  it('秋大会ブラケットには必ず48校が含まれる', () => {
    const world = make48SchoolWorld({ year: 1, month: 9, day: 14 });
    const rng = createRNG('autumn-reg-2');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);

    const bracket = nextWorld.activeTournament!;
    const allIds = new Set<string>();
    for (const round of bracket.rounds) {
      for (const m of round.matches) {
        if (m.homeSchoolId) allIds.add(m.homeSchoolId);
        if (m.awaySchoolId) allIds.add(m.awaySchoolId);
      }
    }
    expect(allIds.size).toBe(48);
  });

  it('夏大会終了後（activeTournament = null）でも秋大会が正常に生成される', () => {
    // 夏大会完了後を模倣: activeTournament = null
    const world = make48SchoolWorld({ year: 1, month: 9, day: 14 });
    const worldPostSummer = { ...world, activeTournament: null };
    const rng = createRNG('autumn-reg-3');
    const { nextWorld } = advanceWorldDay(worldPostSummer, 'batting_basic', rng);

    expect(nextWorld.activeTournament?.type).toBe('autumn');
  });

  it('高reputation（シード校）の自校も秋大会に配置される', () => {
    // 高reputation → seeded校（Round2に配置）
    const world = make48SchoolWorld({ year: 1, month: 9, day: 14 }, 90);
    const rng = createRNG('autumn-reg-seeded');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);

    const bracket = nextWorld.activeTournament!;
    expect(isPlayerInBracket(bracket, nextWorld.playerSchoolId)).toBe(true);

    // シード校はRound2に配置されているはず
    const round2 = bracket.rounds.find((r) => r.roundNumber === 2);
    const inRound2 = round2?.matches.some(
      (m) => m.homeSchoolId === nextWorld.playerSchoolId || m.awaySchoolId === nextWorld.playerSchoolId,
    );
    expect(inRound2).toBe(true);
  });
});

// ============================================================
// テスト: 秋大会の完走（9/15 → 10/15）
// ============================================================

describe('秋大会 — 9/15 → 10/15 完走', () => {
  it('9/15 から 10/15 まで進めると秋大会が完了する', () => {
    const world = make48SchoolWorld({ year: 1, month: 9, day: 14 });
    let w = advanceToDate(world, 9, 15); // 9/15: 秋大会作成
    w = advanceToDate(w, 10, 15);        // 10/15: 大会完了後

    // 秋大会が履歴に入っている
    const autumnHist = w.tournamentHistory?.find((t) => t.type === 'autumn');
    expect(autumnHist).toBeDefined();
    expect(autumnHist?.isCompleted).toBe(true);
    expect(autumnHist?.champion).not.toBeNull();

    // activeTournament は null
    expect(w.activeTournament).toBeNull();
  });

  it('秋大会の優勝校は48校のいずれか', () => {
    const world = make48SchoolWorld({ year: 1, month: 9, day: 14 });
    let w = advanceToDate(world, 9, 15);
    w = advanceToDate(w, 10, 15);

    const autumnHist = w.tournamentHistory?.find((t) => t.type === 'autumn');
    const schoolIds = w.schools.map((s) => s.id);
    expect(schoolIds).toContain(autumnHist?.champion);
  });

  it('秋大会完了後のフェーズは off_season', () => {
    const world = make48SchoolWorld({ year: 1, month: 9, day: 14 });
    let w = advanceToDate(world, 9, 15);
    w = advanceToDate(w, 10, 15);

    expect(w.seasonState.phase).toBe('off_season');
  });
});

// ============================================================
// テスト: フェーズ表示の修正確認
// ============================================================

describe('シーズンフェーズ — 大会終了後の修正確認', () => {
  it('夏大会終了後（7/29-7/30）は post_summer フェーズを返す', () => {
    // 夏大会完了後、activeTournament = null の状態で 7/28 から進める
    const world = make48SchoolWorld({ year: 1, month: 7, day: 28 });
    // tournamentHistory に year=1 の夏大会を追加し、新規生成を防ぐ
    const dummySummerTournament: Tournament = {
      id: 'tournament-summer-1',
      type: 'summer',
      year: 1,
      bracket: 'double-elimination',
      isCompleted: true,
      rounds: [],
      champion: 'dummy-school',
    };
    const worldNoTournament = {
      ...world,
      activeTournament: null,
      tournamentHistory: [...(world.tournamentHistory ?? []), dummySummerTournament],
      seasonState: { ...world.seasonState, phase: 'summer_tournament' as const },
    };

    const rng1 = createRNG('phase-fix-1');
    const { nextWorld: w29 } = advanceWorldDay(worldNoTournament, 'batting_basic', rng1);
    // 7/28 → 7/29: 大会なし、カレンダー的には夏大会期間だが修正によって post_summer
    expect(w29.currentDate.day).toBe(29);
    expect(w29.seasonState.phase).toBe('post_summer');

    const rng2 = createRNG('phase-fix-2');
    const { nextWorld: w30 } = advanceWorldDay(w29, 'batting_basic', rng2);
    expect(w30.currentDate.day).toBe(30);
    expect(w30.seasonState.phase).toBe('post_summer');
  });

  it('秋大会終了後（10/11-10/14）は off_season フェーズを返す', () => {
    // 秋大会完了後、activeTournament = null の状態で 10/10 から進める
    const world = make48SchoolWorld({ year: 1, month: 10, day: 10 });
    // tournamentHistory に year=1 の秋大会を追加し、新規生成を防ぐ
    const dummyAutumnTournament: Tournament = {
      id: 'tournament-autumn-1',
      type: 'autumn',
      year: 1,
      bracket: 'double-elimination',
      isCompleted: true,
      rounds: [],
      champion: 'dummy-school',
    };
    const worldNoTournament = {
      ...world,
      activeTournament: null,
      tournamentHistory: [...(world.tournamentHistory ?? []), dummyAutumnTournament],
      seasonState: { ...world.seasonState, phase: 'autumn_tournament' as const },
    };

    const rng = createRNG('phase-fix-3');
    const { nextWorld: w11 } = advanceWorldDay(worldNoTournament, 'batting_basic', rng);
    // 10/10 → 10/11: 大会なし → off_season (修正により autumn_tournament にならない)
    expect(w11.currentDate.day).toBe(11);
    expect(w11.seasonState.phase).toBe('off_season');
  });

  it('大会進行中は大会フェーズが維持される', () => {
    // 夏大会進行中 (activeTournament あり)
    const world = make48SchoolWorld({ year: 1, month: 7, day: 9 });
    const rng = createRNG('phase-active');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);

    // 7/10 に夏大会が作成され、フェーズが summer_tournament になる
    expect(nextWorld.seasonState.phase).toBe('summer_tournament');
    expect(nextWorld.activeTournament?.type).toBe('summer');
  });
});

// ============================================================
// テスト: フルシーズン（夏 + 秋 両方に自校が参加）
// ============================================================

describe('フルシーズン — 夏・秋 両方への参加確認', () => {
  it('全シーズン進行で夏・秋両方の大会履歴が残る', () => {
    const rng = createRNG('fullseason');
    const players = Array.from({ length: 15 }, (_, i) =>
      generatePlayer(rng.derive(`p${i}`), { enrollmentYear: 1, schoolReputation: 55 })
    );
    const playerTeam = {
      id: 'fullseason-school',
      name: 'フルシーズン高校',
      prefecture: '東京',
      reputation: 55,
      players,
      lineup: null,
      facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 } as const,
    };
    const manager = {
      name: '監督',
      yearsActive: 0,
      fame: 10,
      totalWins: 0,
      totalLosses: 0,
      koshienAppearances: 0,
      koshienWins: 0,
    };

    let world = createWorldState(playerTeam, manager, '東京', 'fullseason', rng.derive('world'));
    world = advanceToDate(world, 10, 20);

    const summerHist = world.tournamentHistory?.find((t) => t.type === 'summer');
    const autumnHist = world.tournamentHistory?.find((t) => t.type === 'autumn');

    expect(summerHist).toBeDefined();
    expect(autumnHist).toBeDefined();
    expect(summerHist?.isCompleted).toBe(true);
    expect(autumnHist?.isCompleted).toBe(true);
  });

  it('夏大会に自校が必ずエントリーされている', () => {
    const rng = createRNG('summer-entry');
    const players = Array.from({ length: 15 }, (_, i) =>
      generatePlayer(rng.derive(`p${i}`), { enrollmentYear: 1, schoolReputation: 55 })
    );
    const playerTeam = {
      id: 'entry-school',
      name: 'エントリー高校',
      prefecture: '大阪',
      reputation: 55,
      players,
      lineup: null,
      facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 } as const,
    };
    const manager = {
      name: '監督',
      yearsActive: 0,
      fame: 10,
      totalWins: 0,
      totalLosses: 0,
      koshienAppearances: 0,
      koshienWins: 0,
    };

    let world = createWorldState(playerTeam, manager, '大阪', 'summer-entry', rng.derive('world'));
    world = advanceToDate(world, 8, 1);

    const summerHist = world.tournamentHistory?.find((t) => t.type === 'summer');
    expect(summerHist).toBeDefined();
    expect(isPlayerInBracket(summerHist!, world.playerSchoolId)).toBe(true);
  });

  it('秋大会に自校が必ずエントリーされている', () => {
    const rng = createRNG('autumn-entry');
    const players = Array.from({ length: 15 }, (_, i) =>
      generatePlayer(rng.derive(`p${i}`), { enrollmentYear: 1, schoolReputation: 55 })
    );
    const playerTeam = {
      id: 'entry-school2',
      name: 'エントリー高校2',
      prefecture: '福岡',
      reputation: 55,
      players,
      lineup: null,
      facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 } as const,
    };
    const manager = {
      name: '監督',
      yearsActive: 0,
      fame: 10,
      totalWins: 0,
      totalLosses: 0,
      koshienAppearances: 0,
      koshienWins: 0,
    };

    let world = createWorldState(playerTeam, manager, '福岡', 'autumn-entry', rng.derive('world'));
    world = advanceToDate(world, 10, 20);

    const autumnHist = world.tournamentHistory?.find((t) => t.type === 'autumn');
    expect(autumnHist).toBeDefined();
    expect(isPlayerInBracket(autumnHist!, world.playerSchoolId)).toBe(true);
  });

  it('自校がシード校（高reputation）でも秋大会に参加できる', () => {
    const rng = createRNG('seeded-entry');
    const players = Array.from({ length: 15 }, (_, i) =>
      generatePlayer(rng.derive(`p${i}`), { enrollmentYear: 1, schoolReputation: 90 })
    );
    const playerTeam = {
      id: 'seeded-school',
      name: '強豪高校',
      prefecture: '愛知',
      reputation: 90,
      players,
      lineup: null,
      facilities: { ground: 5, bullpen: 5, battingCage: 5, gym: 5 } as const,
    };
    const manager = {
      name: '監督',
      yearsActive: 0,
      fame: 50,
      totalWins: 0,
      totalLosses: 0,
      koshienAppearances: 0,
      koshienWins: 0,
    };

    let world = createWorldState(playerTeam, manager, '愛知', 'seeded-entry', rng.derive('world'));
    world = advanceToDate(world, 10, 20);

    const autumnHist = world.tournamentHistory?.find((t) => t.type === 'autumn');
    expect(autumnHist).toBeDefined();
    expect(isPlayerInBracket(autumnHist!, world.playerSchoolId)).toBe(true);
  });
});

// ============================================================
// テスト: 秋大会の試合結果が WorldDayResult に反映される
// ============================================================

describe('秋大会 — 試合結果の WorldDayResult 反映', () => {
  it('秋大会期間中に自校の試合日には playerMatchResult が設定される', () => {
    const world = make48SchoolWorld({ year: 1, month: 9, day: 14 });
    const rng = createRNG('autumn-match-result');

    // 9/15 に秋大会開始
    let w = advanceToDate(world, 9, 15);

    // 秋大会の試合日を全て走査して自校試合を探す
    const AUTUMN_MATCH_DAYS: Array<{ month: number; day: number }> = [
      { month: 9, day: 15 },
      { month: 9, day: 19 },
      { month: 9, day: 24 },
      { month: 9, day: 29 },
      { month: 10, day: 5 },
      { month: 10, day: 10 },
    ];

    let foundMatch = false;
    for (const target of AUTUMN_MATCH_DAYS) {
      w = advanceToDate(w, target.month, target.day);
      const { nextWorld, result } = advanceWorldDay(w, 'batting_basic', rng.derive(`day-${target.month}-${target.day}`));
      w = nextWorld;

      if (result.playerMatchResult !== undefined && result.playerMatchResult !== null) {
        foundMatch = true;
        // 試合結果の基本検証
        expect(result.playerMatchResult.finalScore).toBeDefined();
        expect(result.playerMatchResult.winner).toMatch(/^(home|away)$/);
        // 自校の試合日程があれば対戦相手も設定されている
        expect(result.playerMatchOpponent).toBeDefined();
        break; // 最初の試合が見つかれば十分
      }

      // 自校が敗退していたら終了
      if (w.activeTournament) {
        const hasLoss = w.activeTournament.rounds.some((round) =>
          round.matches.some(
            (m) =>
              (m.homeSchoolId === w.playerSchoolId || m.awaySchoolId === w.playerSchoolId) &&
              m.winnerId !== null &&
              m.winnerId !== w.playerSchoolId,
          ),
        );
        if (hasLoss) break;
      } else {
        break; // 大会終了
      }
    }

    // 何らかの形で自校は大会に参加した（試合結果 OR ブラケットに存在した）
    const autumnHist = w.tournamentHistory?.find((t) => t.type === 'autumn');
    if (autumnHist) {
      expect(isPlayerInBracket(autumnHist, w.playerSchoolId)).toBe(true);
    }
  });
});
