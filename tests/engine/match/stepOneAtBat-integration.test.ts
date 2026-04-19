/**
 * stepOneAtBat 統合テスト
 *
 * 高橋さん報告 2026-04-19: 試合中に「打者 不明」で停止する
 *
 * 狙い: MatchRunner で 27打席以上連続で実行しても打者が不明にならない
 * ことを検証する。build-match-team の battingOrder 整合性を担保する
 * ガードも同時に検証される。
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { createWorldState } from '@/engine/world/create-world';
import { generatePlayer } from '@/engine/player/generate';
import { buildMatchTeam } from '@/engine/world/match-team-builder';
import { MatchRunner } from '@/engine/match/runner';
import { cpuAutoTactics } from '@/engine/match/tactics';
import { EMPTY_BASES } from '@/engine/match/types';
import type { MatchState } from '@/engine/match/types';
import type { WorldState } from '@/engine/world/world-state';

function makeWorld(seed: string): WorldState {
  const rng = createRNG(seed);
  const team = {
    id: 'player-school',
    name: '岩室',
    prefecture: '新潟',
    reputation: 65,
    players: [] as ReturnType<typeof generatePlayer>[],
    lineup: null,
    facilities: { ground: 5, bullpen: 5, battingCage: 5, gym: 5 },
  };
  team.players = Array.from({ length: 20 }, (_, i) =>
    generatePlayer(rng.derive(`p${i}`), { enrollmentYear: 1, schoolReputation: 65 }),
  );
  const manager = {
    name: 'テスト',
    yearsActive: 0,
    fame: 10,
    totalWins: 0,
    totalLosses: 0,
    koshienAppearances: 0,
    koshienWins: 0,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createWorldState(team as any, manager, '新潟', seed, rng);
}

function makeMatchState(seed: string): { state: MatchState; playerSchoolId: string } {
  const world = makeWorld(seed);
  const playerSchool = world.schools.find((s) => s.id === world.playerSchoolId)!;
  const opponent = world.schools.find((s) => s.id !== world.playerSchoolId)!;

  const homeTeam = buildMatchTeam(playerSchool);
  const awayTeam = buildMatchTeam(opponent);

  const state: MatchState = {
    config: {
      innings: 9,
      maxExtras: 3,
      useDH: false,
      isTournament: true,
      isKoshien: false,
    },
    homeTeam,
    awayTeam,
    currentInning: 1,
    currentHalf: 'top',
    outs: 0,
    count: { balls: 0, strikes: 0 },
    bases: EMPTY_BASES,
    score: { home: 0, away: 0 },
    inningScores: { home: [], away: [] },
    currentBatterIndex: 0,
    pitchCount: 0,
    log: [],
    isOver: false,
    result: null,
  };
  return { state, playerSchoolId: world.playerSchoolId };
}

describe('stepOneAtBat 統合テスト — 打者不明バグ防止', () => {
  it('buildMatchTeam: battingOrder の全IDは必ず matchPlayers にも含まれる', () => {
    const { state } = makeMatchState('bug-repro-1');
    for (const team of [state.homeTeam, state.awayTeam]) {
      expect(team.battingOrder.length).toBeGreaterThanOrEqual(9);
      const playerIds = new Set(team.players.map((mp) => mp.player.id));
      for (const pid of team.battingOrder) {
        expect(
          playerIds.has(pid),
          `battingOrder の ${pid} が team.players にない`,
        ).toBe(true);
      }
    }
  });

  it('50打席連続実行で打者不明にならない (seed 1)', () => {
    const { state, playerSchoolId } = makeMatchState('bug-repro-1');
    const runner = new MatchRunner(state, cpuAutoTactics, playerSchoolId);
    const rng = createRNG('test-50ab-1');

    for (let i = 0; i < 50; i++) {
      if (runner.isOver()) break;
      const s = runner.getState();
      const battingTeam = s.currentHalf === 'top' ? s.awayTeam : s.homeTeam;
      const batterId = battingTeam.battingOrder[s.currentBatterIndex];
      const batterMP = battingTeam.players.find((p) => p.player.id === batterId);
      expect(
        batterMP,
        `iter ${i}: 打者 不明 (id=${batterId}, idx=${s.currentBatterIndex}, inn=${s.currentInning}${s.currentHalf}, outs=${s.outs})`,
      ).toBeDefined();
      runner.stepOneAtBat(rng);
    }
  });

  it('30打席連続実行で打者不明にならない (seed 2)', () => {
    const { state, playerSchoolId } = makeMatchState('bug-repro-2');
    const runner = new MatchRunner(state, cpuAutoTactics, playerSchoolId);
    const rng = createRNG('test-30ab-2');

    for (let i = 0; i < 30; i++) {
      if (runner.isOver()) break;
      const s = runner.getState();
      const battingTeam = s.currentHalf === 'top' ? s.awayTeam : s.homeTeam;
      const batterId = battingTeam.battingOrder[s.currentBatterIndex];
      const batterMP = battingTeam.players.find((p) => p.player.id === batterId);
      expect(batterMP, `iter ${i}: 打者 不明`).toBeDefined();
      runner.stepOneAtBat(rng);
    }
  });

  it('複数シードで試合完走しても打者不明が発生しない', () => {
    const seeds = ['g-1', 'g-2', 'g-3', 'g-4', 'g-5'];
    for (const seed of seeds) {
      const { state, playerSchoolId } = makeMatchState(seed);
      const runner = new MatchRunner(state, cpuAutoTactics, playerSchoolId);
      const rng = createRNG('test-' + seed);

      let guard = 0;
      while (!runner.isOver() && guard < 150) {
        const s = runner.getState();
        const battingTeam = s.currentHalf === 'top' ? s.awayTeam : s.homeTeam;
        const batterId = battingTeam.battingOrder[s.currentBatterIndex];
        const batterMP = battingTeam.players.find((p) => p.player.id === batterId);
        expect(
          batterMP,
          `[${seed}] iter ${guard}: 打者 不明 (id=${batterId}, idx=${s.currentBatterIndex}, inn=${s.currentInning}${s.currentHalf})`,
        ).toBeDefined();
        runner.stepOneAtBat(rng);
        guard++;
      }
      expect(runner.isOver(), `[${seed}] 試合が 150 打席で終わらなかった`).toBe(true);
    }
  });

  it('runToEnd で試合完走', () => {
    const { state, playerSchoolId } = makeMatchState('runToEnd-test');
    const runner = new MatchRunner(state, cpuAutoTactics, playerSchoolId);
    const rng = createRNG('test-hr');
    const result = runner.runToEnd(rng);
    expect(result).toBeDefined();
    expect(runner.isOver()).toBe(true);
  });
});
