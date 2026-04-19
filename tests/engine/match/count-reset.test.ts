/**
 * count-reset.test.ts
 *
 * 打席終了時にカウントが必ず 0-0 にリセットされることを検証。
 *
 * 高橋さん報告 2026-04-19:
 *   「川崎がまだ2ストライクなのにアウトになっている」
 *   → 根本原因: 前の打席の中間カウント(strikes=1)が引き継がれていた。
 *     川崎の打席は strikes=1 で始まり、ファウル→ボール→空振り で
 *     見かけ上 2ストライクで三振してしまった。
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
    name: 'テスト',
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
    name: 'T',
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
  const ps = world.schools.find((s) => s.id === world.playerSchoolId)!;
  const op = world.schools.find((s) => s.id !== world.playerSchoolId)!;
  const homeTeam = buildMatchTeam(ps);
  const awayTeam = buildMatchTeam(op);
  const state: MatchState = {
    config: { innings: 9, maxExtras: 3, useDH: false, isTournament: true, isKoshien: false },
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

describe('打席終了後のカウントリセット — 2ストライクで三振バグ防止', () => {
  it('stepOneAtBat 後、カウントは必ず 0-0 にリセットされる', () => {
    const { state, playerSchoolId } = makeMatchState('count-reset-1');
    const runner = new MatchRunner(state, cpuAutoTactics, playerSchoolId);
    const rng = createRNG('t-count-1');

    // 50打席回しながら、各打席終了直後の count を検証
    for (let i = 0; i < 50 && !runner.isOver(); i++) {
      runner.stepOneAtBat(rng);
      const s = runner.getState();
      expect(
        s.count.balls,
        `iter ${i}: 打席終了後 balls が 0 でない (balls=${s.count.balls})`,
      ).toBe(0);
      expect(
        s.count.strikes,
        `iter ${i}: 打席終了後 strikes が 0 でない (strikes=${s.count.strikes})`,
      ).toBe(0);
    }
  });

  it('stepOnePitch を連続で呼んで、打席終了ごとにカウントが 0-0 に戻る', () => {
    const { state, playerSchoolId } = makeMatchState('count-reset-2');
    const runner = new MatchRunner(state, cpuAutoTactics, playerSchoolId);
    const rng = createRNG('t-count-2');

    let prevBatterIndex = runner.getState().currentBatterIndex;
    let prevHalf = runner.getState().currentHalf;
    let guard = 0;

    while (!runner.isOver() && guard < 500) {
      const before = runner.getState();
      const { atBatEnded } = runner.stepOnePitch(rng);
      const after = runner.getState();

      // 打席が終わったら count は 0-0 になっているはず
      if (atBatEnded) {
        expect(
          after.count.balls,
          `guard=${guard}: 打席終了後 balls=${after.count.balls}`,
        ).toBe(0);
        expect(
          after.count.strikes,
          `guard=${guard}: 打席終了後 strikes=${after.count.strikes}`,
        ).toBe(0);
      }

      // 打者が変わった or ハーフイニングが変わった場合もカウント 0-0
      if (
        after.currentBatterIndex !== prevBatterIndex ||
        after.currentHalf !== prevHalf
      ) {
        expect(
          after.count.balls,
          `打者交代時 (${prevBatterIndex}→${after.currentBatterIndex}) でカウントが残っている: balls=${after.count.balls}`,
        ).toBe(0);
        expect(
          after.count.strikes,
          `打者交代時 でカウントが残っている: strikes=${after.count.strikes}`,
        ).toBe(0);
      }

      prevBatterIndex = after.currentBatterIndex;
      prevHalf = after.currentHalf;
      guard++;
    }
    expect(runner.isOver(), `500球以内に試合が終わらなかった`).toBe(true);
  });

  it('stepOneAtBat と stepOnePitch を混ぜても、打席境界でカウントが必ずリセット', () => {
    const { state, playerSchoolId } = makeMatchState('count-reset-3');
    const runner = new MatchRunner(state, cpuAutoTactics, playerSchoolId);
    const rng = createRNG('t-count-3');

    let prevBatterIndex = runner.getState().currentBatterIndex;

    for (let i = 0; i < 100 && !runner.isOver(); i++) {
      if (i % 2 === 0) {
        runner.stepOneAtBat(rng);
      } else {
        runner.stepOnePitch(rng);
      }
      const s = runner.getState();
      if (s.currentBatterIndex !== prevBatterIndex) {
        // 打者が変わった直後は必ず count 0-0
        expect(s.count.balls).toBe(0);
        expect(s.count.strikes).toBe(0);
        prevBatterIndex = s.currentBatterIndex;
      }
    }
  });

  it('ホームラン/ヒット直後の次打席でも、打者は strikes=0 で打席を開始', () => {
    // 多数のシードを試して、ホームラン/ヒット発生後の次打席カウントを確認
    const seeds = ['hr-1', 'hr-2', 'hr-3', 'hr-4', 'hr-5'];
    for (const seed of seeds) {
      const { state, playerSchoolId } = makeMatchState(seed);
      const runner = new MatchRunner(state, cpuAutoTactics, playerSchoolId);
      const rng = createRNG('t-' + seed);

      for (let i = 0; i < 40 && !runner.isOver(); i++) {
        const { atBatResult } = runner.stepOneAtBat(rng);
        const after = runner.getState();

        // ヒット/HR/二塁打/三塁打 等のインプレー安打の後、カウントがリセットされているか
        if (
          atBatResult.outcome.type === 'home_run' ||
          atBatResult.outcome.type === 'single' ||
          atBatResult.outcome.type === 'double' ||
          atBatResult.outcome.type === 'triple'
        ) {
          expect(
            after.count.balls,
            `[${seed}] ${atBatResult.outcome.type} 直後 balls=${after.count.balls}`,
          ).toBe(0);
          expect(
            after.count.strikes,
            `[${seed}] ${atBatResult.outcome.type} 直後 strikes=${after.count.strikes}`,
          ).toBe(0);
        }
      }
    }
  });
});
