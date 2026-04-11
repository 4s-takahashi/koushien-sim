import { describe, it, expect } from 'vitest';
import { processDay } from '@/engine/calendar/day-processor';
import { createRNG } from '@/engine/core/rng';
import { generatePlayer } from '@/engine/player/generate';
import { autoGenerateLineup } from '@/engine/team/lineup';
import type { GameState } from '@/engine/types/game-state';
import { CURRENT_SAVE_VERSION } from '@/engine/save/save-manager';

function createTestGameState(): GameState {
  const rng = createRNG('day-proc-test');
  const players = Array.from({ length: 15 }, (_, i) =>
    generatePlayer(rng.derive(`p${i}`), { enrollmentYear: 1, schoolReputation: 50 })
  );

  const team = {
    id: 'team-1',
    name: 'テスト高校',
    prefecture: '新潟',
    reputation: 50,
    players,
    lineup: null,
    facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 },
  };
  team.lineup = autoGenerateLineup(team, 1);

  return {
    version: CURRENT_SAVE_VERSION,
    seed: 'day-proc-test',
    currentDate: { year: 1, month: 4, day: 2 },
    team,
    manager: {
      name: 'テスト監督',
      yearsActive: 0,
      fame: 10,
      totalWins: 0,
      totalLosses: 0,
      koshienAppearances: 0,
      koshienWins: 0,
    },
    graduates: [],
    settings: {
      autoAdvanceSpeed: 'normal',
      showDetailedGrowth: true,
    },
  };
}

describe('processDay', () => {
  it('DayProcessResult（{ nextState, dayResult }）を返す', () => {
    const state = createTestGameState();
    const rng = createRNG('day-1');
    const result = processDay(state, 'batting_basic', rng);

    expect(result.nextState).toBeDefined();
    expect(result.dayResult).toBeDefined();
    expect(result.dayResult.date).toEqual(state.currentDate);
    expect(result.nextState.currentDate.day).toBe(state.currentDate.day + 1);
  });

  it('日付が1日進む', () => {
    const state = createTestGameState();
    const rng = createRNG('advance-test');
    const result = processDay(state, 'batting_basic', rng);
    expect(result.nextState.currentDate.day).toBe(3); // 4/2 → 4/3
  });

  it('練習メニューが dayResult に記録される', () => {
    const state = createTestGameState();
    const rng = createRNG('menu-record');
    const result = processDay(state, 'running', rng);
    expect(result.dayResult.practiceApplied).toBe('running');
  });

  it('DayResult に playerChanges が含まれる', () => {
    const state = createTestGameState();
    const rng = createRNG('changes-test');
    const result = processDay(state, 'batting_basic', rng);
    expect(Array.isArray(result.dayResult.playerChanges)).toBe(true);
  });

  it('複数日の連続進行が安定する', () => {
    let state = createTestGameState();

    for (let i = 0; i < 30; i++) {
      const dateStr = `${state.currentDate.year}-${state.currentDate.month}-${state.currentDate.day}`;
      const rng = createRNG(state.seed + ':' + dateStr);
      const result = processDay(state, 'batting_basic', rng);
      state = result.nextState;
    }

    // 30日後 → 4/2 + 30 = 5/2
    expect(state.currentDate.month).toBe(5);
    expect(state.currentDate.day).toBe(2);
    expect(state.team.players.length).toBeGreaterThan(0);
  });

  it('年度替わり（4月1日到達）で入学・卒業が処理される', () => {
    const rng = createRNG('year-transition');
    // enrollmentYear=-1: currentYear=1 で grade = 1-(-1)+1 = 3 → 卒業対象
    const players3rd = Array.from({ length: 5 }, (_, i) =>
      generatePlayer(rng.derive(`3rd-${i}`), { enrollmentYear: -1, schoolReputation: 50 })
    ).map(p => ({ ...p, enrollmentYear: -1 }));
    // enrollmentYear=0: currentYear=1 で grade = 1-0+1 = 2 → 卒業対象外
    const playersUnder = Array.from({ length: 10 }, (_, i) =>
      generatePlayer(rng.derive(`under-${i}`), { enrollmentYear: 0, schoolReputation: 50 })
    ).map(p => ({ ...p, enrollmentYear: 0 }));

    const state: GameState = {
      version: CURRENT_SAVE_VERSION,
      seed: 'year-trans-test',
      currentDate: { year: 1, month: 3, day: 31 },
      team: {
        id: 'team-1',
        name: 'テスト高校',
        prefecture: '新潟',
        reputation: 50,
        players: [...players3rd, ...playersUnder],
        lineup: null,
        facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 },
      },
      manager: {
        name: 'テスト監督',
        yearsActive: 0,
        fame: 10,
        totalWins: 0,
        totalLosses: 0,
        koshienAppearances: 0,
        koshienWins: 0,
      },
      graduates: [],
      settings: { autoAdvanceSpeed: 'normal', showDetailedGrowth: true },
    };

    const result = processDay(state, 'rest', createRNG('year-trans-test:1-3-31'));

    // 3/31 → 4/1（同年）
    expect(result.nextState.currentDate).toEqual({ year: 1, month: 4, day: 1 });
    // processYearTransition が発動して卒業生が追加される
    expect(result.nextState.graduates.length).toBeGreaterThan(0);
    // 新入生が追加されている（enrollmentYear = currentDate.year = 1）
    const totalBefore = players3rd.length + playersUnder.length;
    // 3年生5人が抜けて、新入生が入っているので人数が変わっている
    expect(result.nextState.team.players.length).not.toBe(totalBefore);
  });
});
