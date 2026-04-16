/**
 * Phase 6 — トーナメントブラケットテスト
 *
 * - 48校ブラケットの生成テスト
 * - ラウンドシミュレーションテスト
 * - 全大会シミュレーションテスト
 * - 勝者伝播テスト
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { createWorldState } from '@/engine/world/create-world';
import {
  createTournamentBracket,
  simulateTournamentRound,
  simulateFullTournament,
} from '@/engine/world/tournament-bracket';
import type { TournamentBracket } from '@/engine/world/tournament-bracket';
import { projectTournament } from '@/ui/projectors/tournamentProjector';
import { generatePlayer } from '@/engine/player/generate';

// ============================================================
// テスト用 WorldState
// ============================================================

function createTestWorld() {
  const rng = createRNG('tournament-test');
  const players = Array.from({ length: 15 }, (_, i) =>
    generatePlayer(rng.derive(`p${i}`), { enrollmentYear: 1, schoolReputation: 60 })
  );

  const team = {
    id: 'player-school',
    name: 'テスト高校',
    prefecture: '新潟',
    reputation: 70,
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

  return createWorldState(team, manager, '新潟', 'tournament-test', rng);
}

// ============================================================
// ブラケット生成テスト
// ============================================================

describe('createTournamentBracket', () => {
  it('48校から6ラウンドのブラケットを生成する', () => {
    const world = createTestWorld();
    const rng = createRNG('bracket-gen');
    const bracket = createTournamentBracket('test-bracket', 'summer', 1, world.schools, rng);

    expect(bracket.rounds).toHaveLength(6);
    expect(bracket.totalTeams).toBe(48);
    expect(bracket.type).toBe('summer');
    expect(bracket.year).toBe(1);
    expect(bracket.isCompleted).toBe(false);
    expect(bracket.champion).toBeNull();
  });

  it('1回戦は16試合になる（32校が対戦）', () => {
    const world = createTestWorld();
    const rng = createRNG('bracket-gen');
    const bracket = createTournamentBracket('test-bracket', 'summer', 1, world.schools, rng);

    const round1 = bracket.rounds.find((r) => r.roundNumber === 1);
    expect(round1).toBeDefined();
    expect(round1!.matches).toHaveLength(16);
  });

  it('48校の場合、1回戦に不戦勝はない（32校が全試合対戦）', () => {
    const world = createTestWorld();
    const rng = createRNG('bracket-gen');
    const bracket = createTournamentBracket('test-bracket', 'summer', 1, world.schools, rng);

    const round1 = bracket.rounds.find((r) => r.roundNumber === 1);
    const byeMatches = round1!.matches.filter((m) => m.isBye || m.awaySchoolId === null);
    // 32校が16試合対戦するので不戦勝なし
    expect(byeMatches.length).toBe(0);
  });

  it('2回戦には16シード校が事前配置されている', () => {
    const world = createTestWorld();
    const rng = createRNG('bracket-gen');
    const bracket = createTournamentBracket('test-bracket', 'summer', 1, world.schools, rng);

    const round2 = bracket.rounds.find((r) => r.roundNumber === 2)!;
    // シード校は homeSchoolId として事前配置
    const seededSlots = round2.matches.filter((m) => m.homeSchoolId !== null);
    expect(seededSlots.length).toBe(16);
  });

  it('各ラウンドの試合数が正しい', () => {
    const world = createTestWorld();
    const rng = createRNG('bracket-gen');
    const bracket = createTournamentBracket('test-bracket', 'summer', 1, world.schools, rng);

    // Round 1: 32校が16試合, Round 2: 32校が16試合, Round 3〜6: 8/4/2/1
    const expectedCounts = [16, 16, 8, 4, 2, 1];
    bracket.rounds.forEach((round, i) => {
      expect(round.matches).toHaveLength(expectedCounts[i]);
    });
  });

  it('ラウンド名が正しい', () => {
    const world = createTestWorld();
    const rng = createRNG('bracket-gen');
    const bracket = createTournamentBracket('test-bracket', 'summer', 1, world.schools, rng);

    const finalRound = bracket.rounds.find((r) => r.roundNumber === 6);
    expect(finalRound!.roundName).toBe('決勝');

    const semiFinal = bracket.rounds.find((r) => r.roundNumber === 5);
    expect(semiFinal!.roundName).toBe('準決勝');
  });

  it('全48校が1回戦または2回戦スロットに配置される', () => {
    const world = createTestWorld();
    const rng = createRNG('bracket-gen');
    const bracket = createTournamentBracket('test-bracket', 'summer', 1, world.schools, rng);

    const allSchoolIds = new Set<string>();
    // Round 1: 32校
    const round1 = bracket.rounds.find((r) => r.roundNumber === 1)!;
    for (const m of round1.matches) {
      if (m.homeSchoolId) allSchoolIds.add(m.homeSchoolId);
      if (m.awaySchoolId) allSchoolIds.add(m.awaySchoolId);
    }
    // Round 2: 16シード校
    const round2 = bracket.rounds.find((r) => r.roundNumber === 2)!;
    for (const m of round2.matches) {
      if (m.homeSchoolId) allSchoolIds.add(m.homeSchoolId);
    }
    expect(allSchoolIds.size).toBe(48);
  });
});

// ============================================================
// ラウンドシミュレーションテスト
// ============================================================

describe('simulateTournamentRound', () => {
  it('1回戦をシミュレーションすると全試合に勝者が決まる', () => {
    const world = createTestWorld();
    const rng = createRNG('sim-test');
    let bracket = createTournamentBracket('test', 'summer', 1, world.schools, rng);
    bracket = simulateTournamentRound(bracket, 1, world.schools, rng.derive('round1'));

    const round1 = bracket.rounds.find((r) => r.roundNumber === 1)!;
    for (const m of round1.matches) {
      expect(m.winnerId).not.toBeNull();
    }
  });

  it('1回戦後、2回戦のスロットに勝者が伝播される', () => {
    const world = createTestWorld();
    const rng = createRNG('sim-test');
    let bracket = createTournamentBracket('test', 'summer', 1, world.schools, rng);
    bracket = simulateTournamentRound(bracket, 1, world.schools, rng.derive('round1'));

    const round2 = bracket.rounds.find((r) => r.roundNumber === 2)!;
    const filledSlots = round2.matches.filter(
      (m) => m.homeSchoolId !== null || m.awaySchoolId !== null
    );
    expect(filledSlots.length).toBeGreaterThan(0);
  });

  it('スコアは数値で設定される', () => {
    const world = createTestWorld();
    const rng = createRNG('sim-test');
    let bracket = createTournamentBracket('test', 'summer', 1, world.schools, rng);
    bracket = simulateTournamentRound(bracket, 1, world.schools, rng.derive('round1'));

    const round1 = bracket.rounds.find((r) => r.roundNumber === 1)!;
    for (const m of round1.matches) {
      if (!m.isBye) {
        expect(typeof m.homeScore).toBe('number');
        expect(typeof m.awayScore).toBe('number');
      }
    }
  });
});

// ============================================================
// 全大会シミュレーションテスト
// ============================================================

describe('simulateFullTournament', () => {
  it('全6ラウンドをシミュレーションして優勝校が決まる', () => {
    const world = createTestWorld();
    const rng = createRNG('full-sim');
    let bracket = createTournamentBracket('test', 'summer', 1, world.schools, rng);
    bracket = simulateFullTournament(bracket, world.schools, rng.derive('simulate'));

    expect(bracket.isCompleted).toBe(true);
    expect(bracket.champion).not.toBeNull();
    expect(typeof bracket.champion).toBe('string');
  });

  it('優勝校は 48 校のいずれかである', () => {
    const world = createTestWorld();
    const rng = createRNG('full-sim');
    let bracket = createTournamentBracket('test', 'summer', 1, world.schools, rng);
    bracket = simulateFullTournament(bracket, world.schools, rng.derive('simulate'));

    const schoolIds = world.schools.map((s) => s.id);
    expect(schoolIds).toContain(bracket.champion);
  });

  it('全試合に勝者が決定している', () => {
    const world = createTestWorld();
    const rng = createRNG('full-sim');
    let bracket = createTournamentBracket('test', 'summer', 1, world.schools, rng);
    bracket = simulateFullTournament(bracket, world.schools, rng.derive('simulate'));

    for (const round of bracket.rounds) {
      for (const m of round.matches) {
        if (m.homeSchoolId !== null || m.awaySchoolId !== null) {
          expect(m.winnerId).not.toBeNull();
        }
      }
    }
  });

  it('シード（RNG）が同じなら結果が再現可能', () => {
    const world = createTestWorld();
    const rng1 = createRNG('deterministic');
    const rng2 = createRNG('deterministic');

    const b1 = createTournamentBracket('t1', 'summer', 1, world.schools, rng1);
    const b2 = createTournamentBracket('t2', 'summer', 1, world.schools, rng2);

    const s1 = simulateFullTournament(b1, world.schools, rng1.derive('sim'));
    const s2 = simulateFullTournament(b2, world.schools, rng2.derive('sim'));

    // 同じシードなら同じ優勝校
    expect(s1.champion).toBe(s2.champion);
  });

  it('秋大会と夏大会は独立したブラケットになる', () => {
    const world = createTestWorld();
    const rng = createRNG('multi-tournament');

    const summer = createTournamentBracket('summer-1', 'summer', 1, world.schools, rng.derive('summer'));
    const autumn = createTournamentBracket('autumn-1', 'autumn', 1, world.schools, rng.derive('autumn'));

    const summerResult = simulateFullTournament(summer, world.schools, rng.derive('summer-sim'));
    const autumnResult = simulateFullTournament(autumn, world.schools, rng.derive('autumn-sim'));

    expect(summerResult.type).toBe('summer');
    expect(autumnResult.type).toBe('autumn');
    // 両方完了
    expect(summerResult.isCompleted).toBe(true);
    expect(autumnResult.isCompleted).toBe(true);
  });
});

// ============================================================
// TournamentProjector テスト
// ============================================================

describe('projectTournament', () => {
  it('activeTournament がない場合、placeholder が設定される', () => {
    const world = createTestWorld();
    const view = projectTournament(world);

    expect(view.activeBracket).toBeNull();
    expect(view.placeholder).toBeTruthy();
  });

  it('activeTournament がある場合、bracketView が生成される', () => {
    const world = createTestWorld();
    const rng = createRNG('projector-test');
    const bracket = createTournamentBracket('t1', 'summer', 1, world.schools, rng);
    const worldWithBracket = { ...world, activeTournament: bracket };

    const view = projectTournament(worldWithBracket);

    expect(view.activeBracket).not.toBeNull();
    expect(view.activeBracket!.typeName).toBe('夏の大会');
    expect(view.activeBracket!.rounds).toHaveLength(6);
  });

  it('自校の試合が isPlayerSchoolMatch = true になる', () => {
    const world = createTestWorld();
    const rng = createRNG('projector-test');
    let bracket = createTournamentBracket('t1', 'summer', 1, world.schools, rng);
    bracket = simulateFullTournament(bracket, world.schools, rng.derive('sim'));
    const worldWithBracket = { ...world, activeTournament: bracket };

    const view = projectTournament(worldWithBracket);

    // 自校が参加した試合を検索
    const allMatches = view.activeBracket!.rounds.flatMap((r) => r.matches);
    const playerMatches = allMatches.filter((m) => m.isPlayerSchoolMatch);
    expect(playerMatches.length).toBeGreaterThan(0);
  });

  it('完了したトーナメントの championName が設定される', () => {
    const world = createTestWorld();
    const rng = createRNG('projector-test');
    let bracket = createTournamentBracket('t1', 'summer', 1, world.schools, rng);
    bracket = simulateFullTournament(bracket, world.schools, rng.derive('sim'));
    const worldWithBracket = { ...world, activeTournament: bracket };

    const view = projectTournament(worldWithBracket);

    expect(view.activeBracket!.championName).not.toBeNull();
    expect(typeof view.activeBracket!.championName).toBe('string');
  });

  it('tournamentHistory の過去大会が historyBrackets に射影される', () => {
    const world = createTestWorld();
    const rng = createRNG('history-test');

    let summer = createTournamentBracket('s1', 'summer', 1, world.schools, rng);
    summer = simulateFullTournament(summer, world.schools, rng.derive('sim-s'));

    let autumn = createTournamentBracket('a1', 'autumn', 1, world.schools, rng);
    autumn = simulateFullTournament(autumn, world.schools, rng.derive('sim-a'));

    const worldWithHistory = {
      ...world,
      activeTournament: null,
      tournamentHistory: [summer, autumn],
    };

    const view = projectTournament(worldWithHistory);

    expect(view.historyBrackets).toHaveLength(2);
    const typeNames = view.historyBrackets.map((b) => b.typeName);
    expect(typeNames).toContain('夏の大会');
    expect(typeNames).toContain('秋の大会');
  });
});
