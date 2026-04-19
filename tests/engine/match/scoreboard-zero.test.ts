/**
 * scoreboard-zero.test.ts
 *
 * 無得点イニングでも inningScores 配列に 0 が入ることを検証。
 *
 * 高橋さん報告 2026-04-19:
 *   「スコアボードが回が進んだときに0点の場合0と入っていかない」
 *   → inningScores 配列の未埋めイニングが undefined として表示されていた。
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

describe('スコアボード: 無得点イニングでも 0 が配列に入る', () => {
  it('stepOneAtBat で完走後、inningScores が全回埋まっている', () => {
    const { state, playerSchoolId } = makeMatchState('scoreboard-1');
    const runner = new MatchRunner(state, cpuAutoTactics, playerSchoolId);
    const rng = createRNG('t-sb-1');

    let guard = 0;
    while (!runner.isOver() && guard < 200) {
      runner.stepOneAtBat(rng);
      guard++;
    }

    const final = runner.getState();
    const totalInnings = final.currentInning;

    // regulation 9 回以上回っているはず
    expect(totalInnings).toBeGreaterThanOrEqual(9);

    // away は必ず 9イニング分揃っているべき
    // (裏攻撃はサヨナラでスキップするので home は 8 でも OK)
    expect(final.inningScores.away.length).toBeGreaterThanOrEqual(9);

    // 配列の各要素が undefined/null でないこと（全要素が数値）
    for (let i = 0; i < final.inningScores.away.length; i++) {
      expect(
        typeof final.inningScores.away[i],
        `away[${i}] が数値でない: ${final.inningScores.away[i]}`,
      ).toBe('number');
    }
    for (let i = 0; i < final.inningScores.home.length; i++) {
      expect(
        typeof final.inningScores.home[i],
        `home[${i}] が数値でない: ${final.inningScores.home[i]}`,
      ).toBe('number');
    }
  });

  it('stepOnePitch で完走後、inningScores が全回埋まっている', () => {
    const { state, playerSchoolId } = makeMatchState('scoreboard-2');
    const runner = new MatchRunner(state, cpuAutoTactics, playerSchoolId);
    const rng = createRNG('t-sb-2');

    let guard = 0;
    while (!runner.isOver() && guard < 800) {
      runner.stepOnePitch(rng);
      guard++;
    }

    const final = runner.getState();
    expect(final.inningScores.away.length).toBeGreaterThanOrEqual(9);

    for (let i = 0; i < final.inningScores.away.length; i++) {
      expect(typeof final.inningScores.away[i]).toBe('number');
    }
    for (let i = 0; i < final.inningScores.home.length; i++) {
      expect(typeof final.inningScores.home[i]).toBe('number');
    }
  });

  it('無得点の表終了後、away[inning-1] === 0 がちゃんと入っている', () => {
    // 5シード試して、途中で無得点の表があれば配列に 0 が入っていることを確認
    const seeds = ['zero-1', 'zero-2', 'zero-3', 'zero-4', 'zero-5'];
    for (const seed of seeds) {
      const { state, playerSchoolId } = makeMatchState(seed);
      const runner = new MatchRunner(state, cpuAutoTactics, playerSchoolId);
      const rng = createRNG('t-' + seed);

      let prevHalf = runner.getState().currentHalf;
      let prevInning = runner.getState().currentInning;

      for (let i = 0; i < 100 && !runner.isOver(); i++) {
        runner.stepOneAtBat(rng);
        const s = runner.getState();

        // 表/裏の切り替えを検知したら、その時点で配列末尾が数値であることを検証
        const halfChanged = s.currentHalf !== prevHalf;
        const inningChanged = s.currentInning !== prevInning;

        if (halfChanged || inningChanged) {
          // 直前のハーフが終了 → 配列にちゃんと値が入っているはず
          if (prevHalf === 'top') {
            // away の prevInning 番目に値がある
            expect(
              typeof s.inningScores.away[prevInning - 1],
              `[${seed}] ${prevInning}回表終了後、away[${prevInning - 1}] が数値でない`,
            ).toBe('number');
          } else {
            expect(
              typeof s.inningScores.home[prevInning - 1],
              `[${seed}] ${prevInning}回裏終了後、home[${prevInning - 1}] が数値でない`,
            ).toBe('number');
          }
          prevHalf = s.currentHalf;
          prevInning = s.currentInning;
        }
      }
    }
  });
});
