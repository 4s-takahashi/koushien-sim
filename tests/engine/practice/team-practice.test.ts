/**
 * B3-test1, B3-test2: チーム全体練習 3スロット選択テスト
 *
 * Phase S1-B B3: TeamPracticePlan の3スロット効果計算ロジックを検証
 */

import { describe, it, expect } from 'vitest';
import {
  computePlanStatEffects,
  computePlanFatigueLoad,
  createTeamPracticePlan,
  menuIdToPlan,
  getPlanLabel,
  getPrimaryMenuId,
} from '../../../src/engine/practice/team-practice';
import type { TeamPracticePlan } from '../../../src/engine/types/calendar';

describe('Phase S1-B B3: チーム全体練習 3スロット選択', () => {
  // B3-test1: 3スロット選択時、各スロットの効果が 1/3 ずつ加算されること
  it('B3-test1: 異なる3メニューの効果が 1/3 ずつ加算される', () => {
    const plan = createTeamPracticePlan('batting_basic', 'running', 'strength');
    const effects = computePlanStatEffects(plan);

    // batting_basic: batting.contact 0.5, batting.technique 0.35
    // running: base.speed 0.5, base.stamina 0.5
    // strength: batting.power 0.5, base.armStrength 0.35, base.stamina 0.2
    // 各スロット効果 × 1/3

    const contactEffect = effects.find((e) => e.target === 'batting.contact');
    expect(contactEffect).toBeDefined();
    // batting_basic のみ → 0.5 / 3 ≒ 0.1667
    expect(contactEffect!.baseGain).toBeCloseTo(0.5 / 3, 4);

    const speedEffect = effects.find((e) => e.target === 'base.speed');
    expect(speedEffect).toBeDefined();
    // running のみ → 0.5 / 3 ≒ 0.1667
    expect(speedEffect!.baseGain).toBeCloseTo(0.5 / 3, 4);

    // base.stamina: running (0.5/3) + strength (0.2/3) = 0.7/3
    const staminaEffect = effects.find((e) => e.target === 'base.stamina');
    expect(staminaEffect).toBeDefined();
    expect(staminaEffect!.baseGain).toBeCloseTo((0.5 + 0.2) / 3, 4);
  });

  // B3-test2: 同じメニューを2スロットで重複選択した場合の合算ロジック
  it('B3-test2: 同一メニューを2スロット設定すると効果が2倍になる', () => {
    // batting_basic を2スロット、running を1スロット
    const plan = createTeamPracticePlan('batting_basic', 'batting_basic', 'running');
    const effects = computePlanStatEffects(plan);

    // batting.contact: batting_basic が2スロット → (0.5 + 0.5) / 3 ≒ 0.333
    const contactEffect = effects.find((e) => e.target === 'batting.contact');
    expect(contactEffect).toBeDefined();
    expect(contactEffect!.baseGain).toBeCloseTo((0.5 * 2) / 3, 4);

    // batting.contact の効果が1スロット時の2倍になること
    const singlePlan = createTeamPracticePlan('batting_basic', 'running', 'running');
    const singleEffects = computePlanStatEffects(singlePlan);
    const singleContact = singleEffects.find((e) => e.target === 'batting.contact');
    expect(singleContact).toBeDefined();
    expect(contactEffect!.baseGain).toBeCloseTo(singleContact!.baseGain * 2, 4);
  });

  it('全スロットが同一メニューの場合、単一メニューと同じ効果になる', () => {
    const plan = createTeamPracticePlan('batting_basic', 'batting_basic', 'batting_basic');
    const effects = computePlanStatEffects(plan);

    // batting.contact: 3スロット × (0.5/3) = 0.5
    const contactEffect = effects.find((e) => e.target === 'batting.contact');
    expect(contactEffect).toBeDefined();
    expect(contactEffect!.baseGain).toBeCloseTo(0.5, 4);
  });

  it('menuIdToPlan で単一メニューから3スロットプランを生成できる', () => {
    const plan = menuIdToPlan('batting_basic');
    expect(plan.slots).toHaveLength(3);
    expect(plan.slots[0].menuId).toBe('batting_basic');
    expect(plan.slots[1].menuId).toBe('batting_basic');
    expect(plan.slots[2].menuId).toBe('batting_basic');
  });

  it('getPlanLabel で3スロットのラベルを取得できる', () => {
    const plan = createTeamPracticePlan('batting_basic', 'running', 'rest');
    const label = getPlanLabel(plan);
    expect(label).toContain('/');
    expect(label).toContain('打撃基礎');
    expect(label).toContain('走り込み');
  });

  it('computePlanFatigueLoad で疲労負荷の1/3合算が計算される', () => {
    // batting_basic(5) + running(10) + rest(-15) = 0 → /3 = 0
    const plan = createTeamPracticePlan('batting_basic', 'running', 'rest');
    const fatigueLoad = computePlanFatigueLoad(plan);
    expect(fatigueLoad).toBeCloseTo((5 + 10 + (-15)) / 3, 4);
  });

  it('getPrimaryMenuId で先頭スロットのメニューIDを返す', () => {
    const plan = createTeamPracticePlan('batting_live', 'pitching_basic', 'rest');
    expect(getPrimaryMenuId(plan)).toBe('batting_live');
  });
});
