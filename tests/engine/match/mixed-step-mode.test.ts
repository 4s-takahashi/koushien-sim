/**
 * mixed-step-mode.test.ts
 *
 * stepOneAtBat と stepOnePitch を混ぜて使った時の挙動検証。
 * 高橋さん報告 2026-04-19: ホームラン後に実況ログが混乱する。
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

describe('stepOnePitch と stepOneAtBat を混ぜても打席進行が崩れない', () => {
  it('stepOneAtBat 後の stepOnePitch でも打者が正しく解決される', () => {
    const { state, playerSchoolId } = makeMatchState('mixed-1');
    const runner = new MatchRunner(state, cpuAutoTactics, playerSchoolId);
    const rng = createRNG('t-mixed-1');

    // 10打席 stepOneAtBat で進める
    for (let i = 0; i < 10 && !runner.isOver(); i++) {
      runner.stepOneAtBat(rng);
    }

    // そのまま stepOnePitch 20球で進める
    for (let i = 0; i < 20 && !runner.isOver(); i++) {
      const s = runner.getState();
      const team = s.currentHalf === 'top' ? s.awayTeam : s.homeTeam;
      const bid = team.battingOrder[s.currentBatterIndex];
      const bmp = team.players.find((p) => p.player.id === bid);
      expect(bmp, `pitch iter ${i}: 打者不明 (id=${bid}, idx=${s.currentBatterIndex})`).toBeDefined();
      runner.stepOnePitch(rng);
    }

    // 最後まで stepOneAtBat で完走
    let guard = 0;
    while (!runner.isOver() && guard < 200) {
      const s = runner.getState();
      const team = s.currentHalf === 'top' ? s.awayTeam : s.homeTeam;
      const bid = team.battingOrder[s.currentBatterIndex];
      const bmp = team.players.find((p) => p.player.id === bid);
      expect(bmp, `final iter ${guard}: 打者不明`).toBeDefined();
      runner.stepOneAtBat(rng);
      guard++;
    }
    expect(runner.isOver()).toBe(true);
  });

  it('ホームラン(home_run)が発生した打席でも打順+1は1回だけ', () => {
    // ホームラン発生を無理やり起こすのは難しいが、シード固定で挙動を確認
    const { state, playerSchoolId } = makeMatchState('hr-test');
    const runner = new MatchRunner(state, cpuAutoTactics, playerSchoolId);
    const rng = createRNG('t-hr');

    // 50打席実行中に home_run が発生することを期待（高確率で少なくとも1回起きる）
    for (let i = 0; i < 50 && !runner.isOver(); i++) {
      const prevIndex = runner.getState().currentBatterIndex;
      const prevInning = runner.getState().currentInning;
      const prevHalf = runner.getState().currentHalf;
      const { atBatResult } = runner.stepOneAtBat(rng);
      const newState = runner.getState();

      if (atBatResult.outcome.type === 'home_run') {
        // ホームラン後: 同じハーフならindex +1、ハーフ交代なら0
        if (newState.currentHalf === prevHalf && newState.currentInning === prevInning) {
          expect(newState.currentBatterIndex, `HR後、打順が +1 されてない (prev=${prevIndex}, now=${newState.currentBatterIndex})`).toBe((prevIndex + 1) % 9);
        }
      }
    }
  });

  it('stepOnePitch のみで試合完走できる', () => {
    const { state, playerSchoolId } = makeMatchState('pitch-only');
    const runner = new MatchRunner(state, cpuAutoTactics, playerSchoolId);
    const rng = createRNG('t-pitch-only');

    let guard = 0;
    // 9回 × 3アウト × 2チーム × ~5球/打席 = ~270 球くらいは見積もる。余裕見て 800
    while (!runner.isOver() && guard < 800) {
      const s = runner.getState();
      const team = s.currentHalf === 'top' ? s.awayTeam : s.homeTeam;
      const bid = team.battingOrder[s.currentBatterIndex];
      const bmp = team.players.find((p) => p.player.id === bid);
      expect(bmp, `pitch-only iter ${guard}: 打者不明`).toBeDefined();
      runner.stepOnePitch(rng);
      guard++;
    }
    expect(runner.isOver(), `stepOnePitch 単独で 800 球内に試合が終わらなかった`).toBe(true);
  });
});
