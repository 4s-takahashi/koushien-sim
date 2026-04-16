/**
 * tests/engine/world/tier-manager.test.ts
 *
 * Tier の昇格・降格ルールを検証。
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { updateSimulationTiers, applyTournamentFacing } from '@/engine/world/tier-manager';
import type { WorldState, HighSchool } from '@/engine/world/world-state';
import {
  createDefaultWeeklyPlan,
  createInitialSeasonState,
  createEmptyYearResults,
  createInitialScoutState,
} from '@/engine/world/world-state';

// ============================================================
// テストヘルパー
// ============================================================

function makeSchool(id: string, tier: HighSchool['simulationTier'], reputation: number): HighSchool {
  return {
    id,
    name: `${id}高校`,
    prefecture: '新潟',
    reputation,
    players: [],
    lineup: null,
    facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 },
    simulationTier: tier,
    coachStyle: { offenseType: 'balanced', defenseType: 'balanced', practiceEmphasis: 'balanced', aggressiveness: 50 },
    yearResults: createEmptyYearResults(),
    _summary: null,
  };
}

function makeWorld(schools: HighSchool[], playerSchoolId: string): WorldState {
  return {
    version: '0.3.0',
    seed: 'test',
    currentDate: { year: 1, month: 8, day: 1 },
    playerSchoolId,
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
// テスト
// ============================================================

describe('updateSimulationTiers', () => {
  it('自校は常に full のまま（昇格・降格不可）', () => {
    const playerSchool = makeSchool('player', 'full', 60);
    const world = makeWorld([playerSchool], 'player');

    const updated = updateSimulationTiers(world, [], new Map());
    const p = updated.schools.find((s) => s.id === 'player')!;
    expect(p.simulationTier).toBe('full');
  });

  it('対戦した学校は minimal → standard に昇格', () => {
    const playerSchool = makeSchool('player', 'full', 60);
    const rival = makeSchool('rival', 'minimal', 55);
    const world = makeWorld([playerSchool, rival], 'player');

    const updated = updateSimulationTiers(world, ['rival'], new Map());
    const r = updated.schools.find((s) => s.id === 'rival')!;
    expect(r.simulationTier).toBe('standard');
  });

  it('2大会以上対戦なしで standard → minimal に降格', () => {
    const playerSchool = makeSchool('player', 'full', 60);
    const rival = makeSchool('rival', 'standard', 45);
    const world = makeWorld([playerSchool, rival], 'player');

    // 対戦なし & tournament count 0
    const updated = updateSimulationTiers(world, [], new Map([['rival', 0]]));
    const r = updated.schools.find((s) => s.id === 'rival')!;
    expect(r.simulationTier).toBe('minimal');
  });

  it('県内トップ3強豪は minimal に降格しない', () => {
    const playerSchool = makeSchool('player', 'full', 60);
    // 強豪3校（reputation 順で上位3位）
    const top1 = makeSchool('top1', 'standard', 90);
    const top2 = makeSchool('top2', 'standard', 85);
    const top3 = makeSchool('top3', 'standard', 80);
    const weak = makeSchool('weak', 'standard', 30);

    const world = makeWorld([playerSchool, top1, top2, top3, weak], 'player');

    // 全校が対戦なし
    const updated = updateSimulationTiers(world, [], new Map());

    // トップ3は standard を維持
    expect(updated.schools.find((s) => s.id === 'top1')!.simulationTier).toBe('standard');
    expect(updated.schools.find((s) => s.id === 'top2')!.simulationTier).toBe('standard');
    expect(updated.schools.find((s) => s.id === 'top3')!.simulationTier).toBe('standard');

    // 弱小は降格
    expect(updated.schools.find((s) => s.id === 'weak')!.simulationTier).toBe('minimal');
  });

  it('applyTournamentFacing で対戦後に Tier 昇格', () => {
    const playerSchool = makeSchool('player', 'full', 60);
    const school1 = makeSchool('s1', 'minimal', 50);
    const school2 = makeSchool('s2', 'minimal', 45);
    const world = makeWorld([playerSchool, school1, school2], 'player');

    const updated = applyTournamentFacing(world, ['s1']);

    // s1 が standard に昇格
    expect(updated.schools.find((s) => s.id === 's1')!.simulationTier).toBe('standard');
    // s2 はそのまま minimal
    expect(updated.schools.find((s) => s.id === 's2')!.simulationTier).toBe('minimal');
  });

  it('空の対戦リストでは変更なし', () => {
    const playerSchool = makeSchool('player', 'full', 60);
    const school1 = makeSchool('s1', 'standard', 55);
    const world = makeWorld([playerSchool, school1], 'player');

    // 標準的なケース: s1 は対戦もないが tournament count もある
    const updated = applyTournamentFacing(world, []);
    // school1 は変化なし（applyTournamentFacing は面した学校のみ昇格）
    expect(updated.schools.find((s) => s.id === 's1')!.simulationTier).toBe('standard');
  });
});
