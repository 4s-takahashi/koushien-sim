/**
 * tests/ui/projectors/homeProjector11_5.test.ts
 *
 * Phase 11.5-A: buildTeamConditionSummary のユニットテスト
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { generatePlayer } from '@/engine/player/generate';
import type { WorldState, HighSchool } from '@/engine/world/world-state';
import type { Player } from '@/engine/types/player';
import {
  createEmptyYearResults,
  createInitialSeasonState,
  createInitialScoutState,
  createDefaultWeeklyPlan,
} from '@/engine/world/world-state';
import { projectHome, buildTeamConditionSummary } from '@/ui/projectors/homeProjector';

// ============================================================
// テストヘルパー
// ============================================================

function makePlayer(opts: {
  id?: string;
  fatigue?: number;
  injury?: { type: string; remainingDays: number } | null;
} = {}): Player {
  const rng = createRNG('test-' + (opts.id ?? 'p0'));
  const base = generatePlayer(rng, { enrollmentYear: 1, schoolReputation: 60 });
  return {
    ...base,
    id: opts.id ?? base.id,
    condition: {
      ...base.condition,
      fatigue: opts.fatigue ?? 0,
      injury: opts.injury !== undefined ? opts.injury : null,
    },
  };
}

function makeTestWorld(players: Player[]): WorldState {
  const playerSchool: HighSchool = {
    id: 'ps',
    name: '桜葉高校',
    prefecture: '新潟',
    reputation: 65,
    players,
    lineup: null,
    facilities: { ground: 5, bullpen: 5, battingCage: 5, gym: 5 },
    simulationTier: 'full',
    coachStyle: { offenseType: 'balanced', defenseType: 'balanced', practiceEmphasis: 'balanced', aggressiveness: 50 },
    yearResults: createEmptyYearResults(),
    _summary: null,
  };

  return {
    version: '0.3.0',
    seed: 'test',
    currentDate: { year: 1, month: 5, day: 1 },
    playerSchoolId: 'ps',
    manager: { name: '山田監督', yearsActive: 0, fame: 10, totalWins: 0, totalLosses: 0, koshienAppearances: 0, koshienWins: 0 },
    settings: { autoAdvanceSpeed: 'normal', showDetailedGrowth: false },
    weeklyPlan: createDefaultWeeklyPlan(),
    prefecture: '新潟',
    schools: [playerSchool],
    middleSchoolPool: [],
    personRegistry: { entries: new Map() },
    seasonState: createInitialSeasonState(),
    scoutState: {
      watchList: [],
      scoutReports: new Map(),
      recruitAttempts: new Map(),
      monthlyScoutBudget: 4,
      usedScoutThisMonth: 0,
    },
  };
}

// ============================================================
// buildTeamConditionSummary テスト
// ============================================================

describe('buildTeamConditionSummary (Phase 11.5-A)', () => {
  it('全員良好なチームでは goodCount が正しい', () => {
    const players = [
      makePlayer({ id: 'p1', fatigue: 10, injury: null }),
      makePlayer({ id: 'p2', fatigue: 20, injury: null }),
      makePlayer({ id: 'p3', fatigue: 30, injury: null }),
    ];
    const summary = buildTeamConditionSummary(players);
    expect(summary.goodCount).toBe(3);
    expect(summary.cautionCount).toBe(0);
    expect(summary.dangerCount).toBe(0);
    expect(summary.injuredPlayers).toHaveLength(0);
    expect(summary.warningPlayers).toHaveLength(0);
  });

  it('疲労 >= 50 の選手は cautionCount に含まれる', () => {
    const players = [
      makePlayer({ id: 'p1', fatigue: 10, injury: null }),
      makePlayer({ id: 'p2', fatigue: 60, injury: null }),
      makePlayer({ id: 'p3', fatigue: 75, injury: null }),
    ];
    const summary = buildTeamConditionSummary(players);
    expect(summary.goodCount).toBe(1);
    expect(summary.cautionCount).toBe(2);
    expect(summary.dangerCount).toBe(0);
    expect(summary.warningPlayers).toHaveLength(2);
    expect(summary.injuredPlayers).toHaveLength(0);
  });

  it('負傷選手は dangerCount に含まれ injuredPlayers に詳細が入る', () => {
    const injuryPlayer = makePlayer({
      id: 'p1',
      fatigue: 20,
      injury: { type: '右肘', remainingDays: 5 },
    });
    const healthyPlayer = makePlayer({ id: 'p2', fatigue: 10, injury: null });

    const summary = buildTeamConditionSummary([injuryPlayer, healthyPlayer]);
    expect(summary.dangerCount).toBe(1);
    expect(summary.goodCount).toBe(1);
    expect(summary.injuredPlayers).toHaveLength(1);
    expect(summary.injuredPlayers[0].severity).toBe('injury');
    expect(summary.injuredPlayers[0].statusText).toContain('右肘');
    expect(summary.injuredPlayers[0].statusText).toContain('5');
  });

  it('warningPlayers の severity は caution', () => {
    const warnPlayer = makePlayer({ id: 'p1', fatigue: 65, injury: null });
    const summary = buildTeamConditionSummary([warnPlayer]);
    expect(summary.warningPlayers[0].severity).toBe('caution');
  });

  it('選手が空のとき全て0', () => {
    const summary = buildTeamConditionSummary([]);
    expect(summary.goodCount).toBe(0);
    expect(summary.cautionCount).toBe(0);
    expect(summary.dangerCount).toBe(0);
    expect(summary.avgMotivation).toBe(0);
  });

  it('avgMotivation は 0-100 の範囲', () => {
    const players = [
      makePlayer({ id: 'p1', fatigue: 10, injury: null }),
      makePlayer({ id: 'p2', fatigue: 20, injury: null }),
    ];
    const summary = buildTeamConditionSummary(players);
    expect(summary.avgMotivation).toBeGreaterThanOrEqual(0);
    expect(summary.avgMotivation).toBeLessThanOrEqual(100);
  });
});

// ============================================================
// projectHome に teamConditionSummary が含まれることのテスト
// ============================================================

describe('projectHome — teamConditionSummary (Phase 11.5-A)', () => {
  it('projectHome の返り値に teamConditionSummary が含まれる', () => {
    const players = [
      makePlayer({ id: 'p1', fatigue: 10, injury: null }),
      makePlayer({ id: 'p2', fatigue: 70, injury: null }),
      makePlayer({ id: 'p3', fatigue: 20, injury: { type: '腰', remainingDays: 3 } }),
    ];
    const world = makeTestWorld(players);
    const view = projectHome(world);

    expect(view.teamConditionSummary).toBeDefined();
    const cond = view.teamConditionSummary!;
    expect(cond.goodCount).toBe(1);
    expect(cond.cautionCount).toBe(1);
    expect(cond.dangerCount).toBe(1);
    expect(cond.injuredPlayers).toHaveLength(1);
    expect(cond.warningPlayers).toHaveLength(1);
  });
});
