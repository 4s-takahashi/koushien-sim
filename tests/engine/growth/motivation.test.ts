/**
 * tests/engine/growth/motivation.test.ts
 * Phase 11-A3: 選手モチベーションシステム
 */

import { describe, it, expect } from 'vitest';
import {
  getMotivation,
  calcDailyMotivationDelta,
  calcMatchMotivationBonus,
  applyMotivationDelta,
  applyDailyMotivation,
  applyMatchMotivation,
  getMatchPerformanceMultiplier,
  getPracticeEfficiencyMultiplier,
} from '../../../src/engine/growth/motivation';
import type { Player } from '../../../src/engine/types/player';

// ============================================================
// テスト用最小Player生成ヘルパー
// ============================================================

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    firstName: '太郎',
    lastName: '田中',
    enrollmentYear: 2025,
    position: 'center',
    subPositions: [],
    battingSide: 'right',
    throwingHand: 'right',
    height: 170,
    weight: 65,
    stats: {
      base: { stamina: 50, speed: 50, armStrength: 50, fielding: 50, focus: 50, mental: 50 },
      batting: { contact: 50, power: 50, eye: 50, technique: 50 },
      pitching: null,
    },
    potential: {
      ceiling: {
        base: { stamina: 100, speed: 100, armStrength: 100, fielding: 100, focus: 100, mental: 100 },
        batting: { contact: 100, power: 100, eye: 100, technique: 100 },
        pitching: null,
      },
      growthRate: 1.0,
      growthType: 'normal',
    },
    condition: {
      fatigue: 0,
      injury: null,
      mood: 'normal',
    },
    traits: [],
    mentalState: {
      mood: 'normal',
      stress: 0,
      confidence: 50,
      teamChemistry: 50,
      flags: [],
    },
    background: { hometown: '東京', middleSchool: '東京中学' },
    careerStats: {
      gamesPlayed: 0, atBats: 0, hits: 0, homeRuns: 0, rbis: 0,
      stolenBases: 0, gamesStarted: 0, inningsPitched: 0,
      wins: 0, losses: 0, strikeouts: 0, earnedRuns: 0,
    },
    motivation: 50,
    ...overrides,
  };
}

// ============================================================
// getMotivation
// ============================================================

describe('getMotivation', () => {
  it('プレイヤーの motivation を返す', () => {
    expect(getMotivation(makePlayer({ motivation: 70 }))).toBe(70);
  });

  it('undefined の場合は 50 を返す（後方互換）', () => {
    const p = makePlayer();
    // motivation フィールドを除去
    const { motivation: _, ...rest } = p;
    expect(getMotivation(rest as Player)).toBe(50);
  });
});

// ============================================================
// calcDailyMotivationDelta
// ============================================================

describe('calcDailyMotivationDelta', () => {
  it('試合出場なし（ベンチ）で -2', () => {
    const delta = calcDailyMotivationDelta({
      isMatchDay: true,
      didPlay: false,
      isRestDay: false,
      samePositionCount: 1,
      fatigue: 0,
    });
    expect(delta).toBe(-2);
  });

  it('休養日で +3', () => {
    const delta = calcDailyMotivationDelta({
      isMatchDay: false,
      didPlay: false,
      isRestDay: true,
      samePositionCount: 1,
      fatigue: 0,
    });
    expect(delta).toBe(3);
  });

  it('同ポジション3人以上で -1', () => {
    const delta = calcDailyMotivationDelta({
      isMatchDay: false,
      didPlay: false,
      isRestDay: false,
      samePositionCount: 3,
      fatigue: 0,
    });
    expect(delta).toBe(-1);
  });

  it('疲労80以上で -3', () => {
    const delta = calcDailyMotivationDelta({
      isMatchDay: false,
      didPlay: false,
      isRestDay: false,
      samePositionCount: 1,
      fatigue: 80,
    });
    expect(delta).toBe(-3);
  });

  it('ベンチ + ライバル多 + 高疲労 で -6', () => {
    const delta = calcDailyMotivationDelta({
      isMatchDay: true,
      didPlay: false,
      isRestDay: false,
      samePositionCount: 4,
      fatigue: 90,
    });
    expect(delta).toBe(-2 + -1 + -3);
  });

  it('通常練習日で 0（追加なし）', () => {
    const delta = calcDailyMotivationDelta({
      isMatchDay: false,
      didPlay: false,
      isRestDay: false,
      samePositionCount: 1,
      fatigue: 0,
    });
    expect(delta).toBe(0);
  });
});

// ============================================================
// calcMatchMotivationBonus
// ============================================================

describe('calcMatchMotivationBonus', () => {
  it('出場のみで +5', () => {
    const bonus = calcMatchMotivationBonus(
      { playerId: 'p1', atBats: 3, hits: 1, doubles: 0, triples: 0, homeRuns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0, errors: 0 },
      undefined,
    );
    expect(bonus).toBe(5);
  });

  it('ホームランで +3 追加（合計 +8）', () => {
    const bonus = calcMatchMotivationBonus(
      { playerId: 'p1', atBats: 3, hits: 1, doubles: 0, triples: 0, homeRuns: 1, rbis: 1, walks: 0, strikeouts: 0, stolenBases: 0, errors: 0 },
      undefined,
    );
    expect(bonus).toBe(8); // 5 + 3
  });

  it('好投（6回以上 & 自責2以下）で +5 追加（合計 +10）', () => {
    const bonus = calcMatchMotivationBonus(
      undefined,
      { playerId: 'p1', inningsPitched: 7.0, pitchCount: 90, hits: 3, runs: 2, earnedRuns: 2, walks: 1, strikeouts: 7, homeRunsAllowed: 0, isWinner: true, isLoser: false, isSave: false },
    );
    expect(bonus).toBe(10); // 5 + 5
  });

  it('好投条件未満は +5 のみ', () => {
    const bonus = calcMatchMotivationBonus(
      undefined,
      { playerId: 'p1', inningsPitched: 5.0, pitchCount: 80, hits: 3, runs: 2, earnedRuns: 2, walks: 1, strikeouts: 5, homeRunsAllowed: 0, isWinner: false, isLoser: true, isSave: false },
    );
    expect(bonus).toBe(5);
  });
});

// ============================================================
// applyMotivationDelta
// ============================================================

describe('applyMotivationDelta', () => {
  it('+5 で motivation が増える', () => {
    const player = makePlayer({ motivation: 50 });
    const updated = applyMotivationDelta(player, 5);
    expect(updated.motivation).toBe(55);
  });

  it('-5 で motivation が減る', () => {
    const player = makePlayer({ motivation: 50 });
    const updated = applyMotivationDelta(player, -5);
    expect(updated.motivation).toBe(45);
  });

  it('100 を超えない（clamp）', () => {
    const player = makePlayer({ motivation: 98 });
    const updated = applyMotivationDelta(player, 10);
    expect(updated.motivation).toBe(100);
  });

  it('0 未満にならない（clamp）', () => {
    const player = makePlayer({ motivation: 3 });
    const updated = applyMotivationDelta(player, -10);
    expect(updated.motivation).toBe(0);
  });
});

// ============================================================
// applyDailyMotivation
// ============================================================

describe('applyDailyMotivation', () => {
  it('休養日は全選手 +3', () => {
    const players = [makePlayer({ id: 'p1', motivation: 50 }), makePlayer({ id: 'p2', motivation: 40 })];
    const updated = applyDailyMotivation(players, new Set(), false, true);
    expect(updated[0].motivation).toBe(53);
    expect(updated[1].motivation).toBe(43);
  });

  it('試合日・ベンチは -2', () => {
    const players = [makePlayer({ id: 'p1', motivation: 50 })];
    const updated = applyDailyMotivation(players, new Set(), true, false);
    expect(updated[0].motivation).toBe(48);
  });

  it('同ポジション3人以上で追加 -1', () => {
    const players = [
      makePlayer({ id: 'p1', position: 'center', motivation: 50 }),
      makePlayer({ id: 'p2', position: 'center', motivation: 50 }),
      makePlayer({ id: 'p3', position: 'center', motivation: 50 }),
    ];
    const updated = applyDailyMotivation(players, new Set(), false, false);
    // 3人以上で -1 が適用される
    expect(updated[0].motivation).toBe(49);
    expect(updated[1].motivation).toBe(49);
    expect(updated[2].motivation).toBe(49);
  });
});

// ============================================================
// applyMatchMotivation
// ============================================================

describe('applyMatchMotivation', () => {
  it('出場選手に +5 ボーナス', () => {
    const players = [makePlayer({ id: 'p1', motivation: 50 })];
    const batterStats = [{ playerId: 'p1', atBats: 3, hits: 1, doubles: 0, triples: 0, homeRuns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0, errors: 0 }];
    const updated = applyMatchMotivation(players, batterStats, []);
    expect(updated[0].motivation).toBe(55);
  });

  it('非出場選手は変化なし', () => {
    const players = [makePlayer({ id: 'p1', motivation: 50 }), makePlayer({ id: 'p2', motivation: 50 })];
    const batterStats = [{ playerId: 'p1', atBats: 3, hits: 1, doubles: 0, triples: 0, homeRuns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0, errors: 0 }];
    const updated = applyMatchMotivation(players, batterStats, []);
    expect(updated[0].motivation).toBe(55); // 出場
    expect(updated[1].motivation).toBe(50); // 非出場
  });
});

// ============================================================
// getMatchPerformanceMultiplier / getPracticeEfficiencyMultiplier
// ============================================================

describe('getMatchPerformanceMultiplier', () => {
  it('motivation >= 70 で 1.10', () => {
    expect(getMatchPerformanceMultiplier(70)).toBe(1.10);
    expect(getMatchPerformanceMultiplier(100)).toBe(1.10);
  });

  it('motivation <= 30 で 0.90', () => {
    expect(getMatchPerformanceMultiplier(30)).toBe(0.90);
    expect(getMatchPerformanceMultiplier(0)).toBe(0.90);
  });

  it('30 < motivation < 70 で 1.00', () => {
    expect(getMatchPerformanceMultiplier(50)).toBe(1.00);
    expect(getMatchPerformanceMultiplier(31)).toBe(1.00);
    expect(getMatchPerformanceMultiplier(69)).toBe(1.00);
  });
});

describe('getPracticeEfficiencyMultiplier', () => {
  it('motivation >= 70 で 1.20', () => {
    expect(getPracticeEfficiencyMultiplier(70)).toBe(1.20);
    expect(getPracticeEfficiencyMultiplier(100)).toBe(1.20);
  });

  it('motivation <= 30 で 0.80', () => {
    expect(getPracticeEfficiencyMultiplier(30)).toBe(0.80);
    expect(getPracticeEfficiencyMultiplier(0)).toBe(0.80);
  });

  it('30 < motivation < 70 で 1.00', () => {
    expect(getPracticeEfficiencyMultiplier(50)).toBe(1.00);
    expect(getPracticeEfficiencyMultiplier(50)).toBe(1.00);
  });
});
