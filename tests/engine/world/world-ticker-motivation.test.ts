/**
 * tests/engine/world/world-ticker-motivation.test.ts
 * Phase S1-C C1-test4: tickMotivation が world-ticker から呼ばれること
 * （呼ばれていないバグの再発防止）
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

function makeTestWorld(currentDate = { year: 1, month: 4, day: 1 }): WorldState {
  const schools: HighSchool[] = [];
  schools.push(makeSchool('player-school', '自校テスト高校', 'full', 60));
  for (let i = 1; i < 10; i++) {
    schools.push(makeSchool(`ai-school-${i}`, `AI高校${i}`, 'minimal', 40));
  }

  return {
    version: '0.3.0',
    seed: 'c1-test4',
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

// ============================================================
// C1-test4: tickMotivation が world-ticker から呼ばれること
// ============================================================

describe('C1-test4: tickMotivation の world-ticker 統合', () => {
  it('advanceWorldDay で自校選手の motivation が変化する（練習日）', () => {
    // 4/1（練習日）
    const world = makeTestWorld({ year: 1, month: 4, day: 1 });
    const playerSchool = world.schools.find((s) => s.id === 'player-school')!;
    const initialMotivations = playerSchool.players.map((p) => p.motivation ?? 50);

    const rng = createRNG('c1-test4-practice');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);

    const nextSchool = nextWorld.schools.find((s) => s.id === 'player-school')!;
    const nextMotivations = nextSchool.players.map((p) => p.motivation ?? 50);

    // 少なくとも1人は motivation が変化しているはず
    const anyChange = initialMotivations.some((m, i) => m !== nextMotivations[i]);
    expect(anyChange).toBe(true);
  });

  it('advanceWorldDay で休養日（日曜）に motivation が回復する', () => {
    // 日曜日が休養日になるように日付を設定
    // Year 1 4/1 = Monday (dow=1) なので 4/6 = Saturday, 4/7 = Sunday
    // ゲームの getDayOfWeek: (totalDays + 1) % 7 で 4/1=1(月), 4/7=0(日)
    // off_day は schedule で決まるので、確実な off_day の日を特定する
    // 2/1〜3/31 はオフシーズン。3/1（日曜かどうかに関わらず）は練習日になる可能性があるが
    // 休養日を含む week を進める
    // 代わりに: 7日間進めて全体の平均 motivation を確認
    const world = makeTestWorld({ year: 1, month: 4, day: 1 });

    const playerSchool = world.schools.find((s) => s.id === 'player-school')!;
    // motivation が低い状態を設定
    const lowMotivPlayers = playerSchool.players.map((p) => ({ ...p, motivation: 30 }));
    const worldLow: WorldState = {
      ...world,
      schools: world.schools.map((s) =>
        s.id === 'player-school' ? { ...s, players: lowMotivPlayers } : s
      ),
    };

    // 7日進める
    let w = worldLow;
    const rng = createRNG('c1-test4-recovery');
    for (let i = 0; i < 7; i++) {
      const { nextWorld } = advanceWorldDay(w, 'batting_basic', rng.derive(`day${i}`));
      w = nextWorld;
    }

    const finalSchool = w.schools.find((s) => s.id === 'player-school')!;
    const avgMotivAfter = finalSchool.players.reduce((sum, p) => sum + (p.motivation ?? 50), 0) / finalSchool.players.length;

    // 低モチベ(30)から7日後に回復しているはず（少なくとも数ポイント上昇）
    expect(avgMotivAfter).toBeGreaterThan(30);
  });

  it('motivation は 0-100 の範囲を維持する', () => {
    const world = makeTestWorld({ year: 1, month: 4, day: 1 });
    const rng = createRNG('c1-test4-clamp');

    let w = world;
    for (let i = 0; i < 30; i++) {
      const { nextWorld } = advanceWorldDay(w, 'batting_basic', rng.derive(`day${i}`));
      w = nextWorld;
    }

    for (const school of w.schools) {
      for (const player of school.players) {
        const m = player.motivation ?? 50;
        expect(m).toBeGreaterThanOrEqual(0);
        expect(m).toBeLessThanOrEqual(100);
      }
    }
  });
});
