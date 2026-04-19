/**
 * tests/engine/match/serialize.test.ts
 *
 * MatchState の serialize / deserialize が round-trip で成立するか検証。
 * Issue #8 試合中断/再開 (PR #6) の基盤となる。
 */

import { describe, it, expect } from 'vitest';
import { serializeMatchState, deserializeMatchState } from '@/engine/match/serialize';
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
    name: 'テスト高校',
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
    name: 'T', yearsActive: 0, fame: 10, totalWins: 0, totalLosses: 0,
    koshienAppearances: 0, koshienWins: 0,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createWorldState(team as any, manager, '新潟', seed, rng);
}

function makeMatchState(seed: string): MatchState {
  const world = makeWorld(seed);
  const ps = world.schools.find((s) => s.id === world.playerSchoolId)!;
  const op = world.schools.find((s) => s.id !== world.playerSchoolId)!;
  return {
    config: { innings: 9, maxExtras: 3, useDH: false, isTournament: true, isKoshien: false },
    homeTeam: buildMatchTeam(ps),
    awayTeam: buildMatchTeam(op),
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
}

describe('MatchState シリアライズ (Issue #8 PR #6)', () => {
  it('初期 state を round-trip できる', () => {
    const state = makeMatchState('ser-test-1');
    const json = serializeMatchState(state);
    const restored = deserializeMatchState(json);

    expect(restored.currentInning).toBe(state.currentInning);
    expect(restored.currentHalf).toBe(state.currentHalf);
    expect(restored.score.home).toBe(state.score.home);

    // fieldPositions が Map に戻っている
    expect(restored.homeTeam.fieldPositions).toBeInstanceOf(Map);
    expect(restored.homeTeam.fieldPositions.size).toBe(state.homeTeam.fieldPositions.size);

    // usedPlayerIds が Set に戻っている
    expect(restored.homeTeam.usedPlayerIds).toBeInstanceOf(Set);
  });

  it('試合進行中の state を round-trip できる', () => {
    const state = makeMatchState('ser-test-2');
    const runner = new MatchRunner(state, cpuAutoTactics, 'player-school');
    const rng = createRNG('ser-rng');

    // 20打席進める
    for (let i = 0; i < 20 && !runner.isOver(); i++) {
      runner.stepOneAtBat(rng);
    }

    const afterState = runner.getState();
    const json = serializeMatchState(afterState);
    const restored = deserializeMatchState(json);

    expect(restored.currentInning).toBe(afterState.currentInning);
    expect(restored.currentBatterIndex).toBe(afterState.currentBatterIndex);
    expect(restored.score.home).toBe(afterState.score.home);
    expect(restored.score.away).toBe(afterState.score.away);

    // 復元した state で MatchRunner を再構築して続きを進められる
    const runner2 = new MatchRunner(restored, cpuAutoTactics, 'player-school');
    expect(() => runner2.stepOneAtBat(createRNG('continue'))).not.toThrow();
  });

  it('試合完走後の state も round-trip できる', () => {
    const state = makeMatchState('ser-test-3');
    const runner = new MatchRunner(state, cpuAutoTactics, 'player-school');
    const rng = createRNG('ser-rng-3');
    runner.runToEnd(rng);

    const finalState = runner.getState();
    expect(finalState.isOver).toBe(true);

    const json = serializeMatchState(finalState);
    const restored = deserializeMatchState(json);
    expect(restored.isOver).toBe(true);
    expect(restored.score.home).toBe(finalState.score.home);
  });

  it('fieldPositions の Map エントリが保持される', () => {
    const state = makeMatchState('ser-test-4');
    const beforeMap = Array.from(state.homeTeam.fieldPositions.entries()).sort();
    const json = serializeMatchState(state);
    const restored = deserializeMatchState(json);
    const afterMap = Array.from(restored.homeTeam.fieldPositions.entries()).sort();
    expect(afterMap).toEqual(beforeMap);
  });
});
