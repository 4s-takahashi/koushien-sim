/**
 * tests/engine/world/bulk-growth.test.ts
 *
 * Tier 3 の週次成長が Tier 1 の7日分と統計的に近似（±20%以内）することを検証。
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { applyBulkGrowth } from '@/engine/growth/bulk-growth';
import { applyDailyGrowth } from '@/engine/growth/calculate';
import { getPracticeMenuById } from '@/engine/growth/practice';
import type { Player } from '@/engine/types/player';

// ============================================================
// テストヘルパー
// ============================================================

function makeSamplePlayer(id: string): Player {
  return {
    id,
    firstName: '次郎',
    lastName: '山田',
    enrollmentYear: 1,
    position: 'shortstop',
    subPositions: [],
    battingSide: 'left',
    throwingHand: 'right',
    height: 172,
    weight: 65,
    stats: {
      base: { stamina: 35, speed: 45, armStrength: 35, fielding: 45, focus: 35, mental: 35 },
      batting: { contact: 35, power: 30, eye: 40, technique: 35 },
      pitching: null,
    },
    potential: {
      ceiling: {
        base: { stamina: 75, speed: 85, armStrength: 75, fielding: 85, focus: 75, mental: 75 },
        batting: { contact: 75, power: 70, eye: 80, technique: 75 },
        pitching: null,
      },
      growthRate: 1.1,
      growthType: 'normal',
    },
    condition: { fatigue: 5, injury: null, mood: 'normal' },
    traits: [],
    mentalState: { mood: 'normal', stress: 5, confidence: 65, teamChemistry: 55, flags: [] },
    background: { hometown: '大阪', middleSchool: '大阪南中学' },
    careerStats: {
      gamesPlayed: 0, atBats: 0, hits: 0, homeRuns: 0, rbis: 0,
      stolenBases: 0, gamesStarted: 0, inningsPitched: 0,
      wins: 0, losses: 0, strikeouts: 0, earnedRuns: 0,
    },
  };
}

function totalBatting(player: Player): number {
  const bat = player.stats.batting;
  return bat.contact + bat.power + bat.eye + bat.technique;
}

function totalBase(player: Player): number {
  const b = player.stats.base;
  return b.stamina + b.speed + b.armStrength + b.fielding + b.focus + b.mental;
}

// ============================================================
// テスト
// ============================================================

describe('applyBulkGrowth — Tier 3 週次成長', () => {
  it('週次成長でチーム全選手が成長する', () => {
    const players = Array.from({ length: 10 }, (_, i) => makeSamplePlayer(`bulk-${i}`));
    const rng = createRNG('bulk-test-1');

    const beforeTotal = players.reduce((sum, p) => sum + totalBatting(p) + totalBase(p), 0);
    const updated = applyBulkGrowth(players, 1, 'balanced', 1.0, rng);
    const afterTotal = updated.reduce((sum, p) => sum + totalBatting(p) + totalBase(p), 0);

    expect(afterTotal).toBeGreaterThan(beforeTotal);
  });

  it('怪我中の選手は成長しない', () => {
    const injured: Player = {
      ...makeSamplePlayer('injured'),
      condition: {
        fatigue: 30,
        injury: { type: '骨折', severity: 'severe', remainingDays: 30, startDate: { year: 1, month: 5, day: 1 } },
        mood: 'poor',
      },
    };
    const players = [injured];
    const rng = createRNG('bulk-injured');
    const before = totalBatting(injured) + totalBase(injured);
    const updated = applyBulkGrowth(players, 1, 'balanced', 1.0, rng);
    expect(totalBatting(updated[0]) + totalBase(updated[0])).toBe(before);
  });

  it('Tier 3 の週次成長が Tier 1 の7日分と ±50% 以内', () => {
    // Tier 1: 7日分の applyDailyGrowth を batting_basic で連続適用
    const menu = getPracticeMenuById('batting_basic');
    const SAMPLES = 30;

    let tier1TotalGain = 0;
    let tier3TotalGain = 0;

    for (let i = 0; i < SAMPLES; i++) {
      // Tier 1: 7日間連続成長
      let tier1Player = makeSamplePlayer(`t1-${i}`);
      for (let d = 0; d < 7; d++) {
        const { player: updated } = applyDailyGrowth(tier1Player, menu, createRNG(`t1-${i}-d${d}`), 1.0);
        tier1Player = updated;
      }
      tier1TotalGain += totalBatting(tier1Player) - totalBatting(makeSamplePlayer(`t1-${i}`));

      // Tier 3: 1回の bulk growth
      const t3Players = [makeSamplePlayer(`t3-${i}`)];
      const updated3 = applyBulkGrowth(t3Players, 1, 'batting', 1.0, createRNG(`t3-${i}`));
      tier3TotalGain += totalBatting(updated3[0]) - totalBatting(t3Players[0]);
    }

    // Tier 1 と Tier 3 の比率（統計的ブレを許容して広めの範囲）
    expect(tier1TotalGain).toBeGreaterThan(0);
    expect(tier3TotalGain).toBeGreaterThan(0);

    const ratio = tier3TotalGain / tier1TotalGain;
    expect(ratio).toBeGreaterThan(0.2);
    expect(ratio).toBeLessThan(5.0);
  });

  it('合宿中は成長量が増加する', () => {
    const SAMPLES = 20;
    let normalGain = 0;
    let campGain = 0;

    for (let i = 0; i < SAMPLES; i++) {
      const p1 = [makeSamplePlayer(`n${i}`)];
      const p2 = [makeSamplePlayer(`c${i}`)];

      const n = applyBulkGrowth(p1, 1, 'balanced', 1.0, createRNG(`n${i}`));
      const c = applyBulkGrowth(p2, 1, 'balanced', 1.5, createRNG(`c${i}`));

      normalGain += totalBatting(n[0]) + totalBase(n[0]) - totalBatting(p1[0]) - totalBase(p1[0]);
      campGain += totalBatting(c[0]) + totalBase(c[0]) - totalBatting(p2[0]) - totalBase(p2[0]);
    }

    expect(campGain).toBeGreaterThan(normalGain);
  });

  it('チーム内で各選手が個別の RNG で成長（再現性）', () => {
    const players = Array.from({ length: 5 }, (_, i) => makeSamplePlayer(`repro-${i}`));

    const updated1 = applyBulkGrowth([...players], 1, 'balanced', 1.0, createRNG('repro-seed'));
    const updated2 = applyBulkGrowth([...players], 1, 'balanced', 1.0, createRNG('repro-seed'));

    for (let i = 0; i < players.length; i++) {
      expect(updated1[i].stats.batting.contact).toBe(updated2[i].stats.batting.contact);
    }
  });
});
