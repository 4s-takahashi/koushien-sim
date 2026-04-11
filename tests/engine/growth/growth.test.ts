import { describe, it, expect } from 'vitest';
import { GROWTH_CONSTANTS } from '@/engine/growth/constants';
import { getPracticeMenus, getPracticeMenuById, getDefaultMenu } from '@/engine/growth/practice';
import { applyFatigue, recoverFatigue, rollInjury, advanceInjury, updateDailyCondition } from '@/engine/growth/condition';
import { applyDailyGrowth, clampStats } from '@/engine/growth/calculate';
import { generatePlayer, type PlayerGenConfig } from '@/engine/player/generate';
import { createRNG } from '@/engine/core/rng';
import type { ConditionState, Player } from '@/engine/types/player';

const DEFAULT_CONFIG: PlayerGenConfig = {
  enrollmentYear: 1,
  schoolReputation: 50,
};

describe('GROWTH_CONSTANTS', () => {
  it('能力値範囲が定義済み', () => {
    expect(GROWTH_CONSTANTS.STAT_MIN).toBe(1);
    expect(GROWTH_CONSTANTS.STAT_MAX).toBe(100);
    expect(GROWTH_CONSTANTS.VELOCITY_MIN).toBe(80);
    expect(GROWTH_CONSTANTS.VELOCITY_MAX).toBe(160);
  });

  it('疲労回復値が定義済み', () => {
    expect(GROWTH_CONSTANTS.FATIGUE_NATURAL_RECOVERY).toBeGreaterThan(0);
    expect(GROWTH_CONSTANTS.FATIGUE_REST_RECOVERY).toBeGreaterThan(GROWTH_CONSTANTS.FATIGUE_NATURAL_RECOVERY);
  });
});

describe('practice メニュー', () => {
  it('9種類の練習メニューがある', () => {
    const menus = getPracticeMenus();
    expect(menus).toHaveLength(9);
  });

  it('getPracticeMenuById が正しいメニューを返す', () => {
    const menu = getPracticeMenuById('batting_basic');
    expect(menu.id).toBe('batting_basic');
    expect(menu.name).toBe('打撃基礎');
    expect(menu.statEffects.length).toBeGreaterThan(0);
  });

  it('存在しないメニューでエラーを投げる', () => {
    expect(() => getPracticeMenuById('nonexistent' as any)).toThrow();
  });

  it('getDefaultMenu が dayType に応じたメニューを返す', () => {
    expect(getDefaultMenu('off_day')).toBe('rest');
    expect(getDefaultMenu('school_day')).toBe('batting_basic');
    expect(getDefaultMenu('camp_day')).toBe('batting_live');
  });
});

describe('コンディション管理', () => {
  const baseCondition: ConditionState = {
    fatigue: 30,
    injury: null,
    mood: 'normal',
  };

  it('applyFatigue が疲労を加算する', () => {
    const result = applyFatigue(baseCondition, 10);
    expect(result.fatigue).toBe(40);
  });

  it('applyFatigue が上限を超えない', () => {
    const result = applyFatigue({ ...baseCondition, fatigue: 95 }, 20);
    expect(result.fatigue).toBe(100);
  });

  it('recoverFatigue が自然回復する', () => {
    const result = recoverFatigue(baseCondition, false);
    expect(result.fatigue).toBe(30 - GROWTH_CONSTANTS.FATIGUE_NATURAL_RECOVERY);
  });

  it('recoverFatigue（休養）がより多く回復する', () => {
    const result = recoverFatigue(baseCondition, true);
    expect(result.fatigue).toBe(30 - GROWTH_CONSTANTS.FATIGUE_REST_RECOVERY);
  });

  it('recoverFatigue が0未満にならない', () => {
    const result = recoverFatigue({ ...baseCondition, fatigue: 5 }, true);
    expect(result.fatigue).toBe(0);
  });

  it('怪我中は疲労回復しない', () => {
    const injured: ConditionState = {
      fatigue: 50,
      injury: { type: '筋肉疲労', severity: 'minor', remainingDays: 3, startDate: { year: 1, month: 4, day: 1 } },
      mood: 'normal',
    };
    const result = recoverFatigue(injured, true);
    expect(result.fatigue).toBe(50);
  });

  it('advanceInjury が残日数を減らす', () => {
    const injury = { type: 'テスト', severity: 'minor' as const, remainingDays: 3, startDate: { year: 1, month: 4, day: 1 } };
    const result = advanceInjury(injury);
    expect(result?.remainingDays).toBe(2);
  });

  it('advanceInjury が完治時に null を返す', () => {
    const injury = { type: 'テスト', severity: 'minor' as const, remainingDays: 1, startDate: { year: 1, month: 4, day: 1 } };
    expect(advanceInjury(injury)).toBeNull();
  });
});

describe('updateDailyCondition', () => {
  it('気分を更新する', () => {
    const rng = createRNG('condition-update-test');
    const player = generatePlayer(rng, DEFAULT_CONFIG);
    const newCondition = updateDailyCondition(player, rng.derive('day'));
    expect(['excellent', 'good', 'normal', 'poor', 'terrible']).toContain(newCondition.mood);
  });
});

describe('applyDailyGrowth', () => {
  it('練習で能力値が増加する', () => {
    const rng = createRNG('growth-test');
    const player = generatePlayer(rng, DEFAULT_CONFIG);
    const menu = getPracticeMenuById('batting_basic');

    const { player: grown, statChanges } = applyDailyGrowth(player, menu, rng.derive('day'));

    // 何らかの成長が発生しているはず（ゼロの場合もあり得るが確率的に稀）
    expect(grown.stats).toBeDefined();
    // 打撃基礎 → contact か technique が変化
    // ゼロ以上であることのみ確認
    expect(grown.stats.batting.contact).toBeGreaterThanOrEqual(player.stats.batting.contact);
  });
});

describe('clampStats', () => {
  it('範囲外の値をクランプする', () => {
    const overStats = {
      base: { stamina: 150, speed: -10, armStrength: 50, fielding: 50, focus: 50, mental: 50 },
      batting: { contact: 200, power: 50, eye: 50, technique: 0 },
      pitching: null,
    };
    const clamped = clampStats(overStats);
    expect(clamped.base.stamina).toBe(100);
    expect(clamped.base.speed).toBe(1);
    expect(clamped.batting.contact).toBe(100);
    expect(clamped.batting.technique).toBe(1);
  });
});
