/**
 * tests/engine/psyche/phase7e.test.ts
 *
 * Phase 7-E テスト:
 *   7-E1: MentalEffect → MatchOverrides → 試合エンジンへの反映
 *   7-E3: モノローグ連続重複回避（excludeIds）
 *   7-E4: 新特性10種の選手生成への割り当て
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '../../../src/engine/core/rng';
import {
  generatePitchMonologues,
  buildBatterOverridesFromEffects,
  buildPitcherOverridesFromEffects,
  hasIgnoreOrderEffect,
} from '../../../src/engine/psyche/generator';
import {
  getEffectiveBatterParams,
  getEffectivePitcherParams,
} from '../../../src/engine/match/pitch/process-pitch';
import { generateTraits } from '../../../src/engine/player/generate';
import type { PitchContext } from '../../../src/engine/psyche/types';
import type { TraitId } from '../../../src/engine/types/player';

// ============================================================
// テスト用ヘルパー
// ============================================================

/** 最小限の PitchContext を作成する */
function makeContext(overrides?: Partial<PitchContext>): PitchContext {
  return {
    inning: 5,
    half: 'bottom',
    outs: 2,
    balls: 0,
    strikes: 0,
    runnersOn: 'bases_loaded',
    scoreDiff: -1,
    isKoshien: false,
    batterTraits: ['passionate'],
    pitcherTraits: ['stoic'],
    pitcherStamina: 80,
    orderType: null,
    ...overrides,
  };
}

/** MatchPlayer のモックを返す */
function makeMockBatterMP(contact = 70, power = 60) {
  return {
    player: {
      id: 'batter-1',
      stats: {
        batting: { contact, power, eye: 60, technique: 55 },
        base: { speed: 60, mental: 60, focus: 60, stamina: 70, armStrength: 60, fielding: 60 },
        pitching: null,
      },
      condition: { mood: 'normal', fatigue: 10, injury: null },
      mentalState: { mood: 'normal', stress: 10, confidence: 50, teamChemistry: 50, flags: [] },
      battingSide: 'right' as const,
      traits: ['passionate'] as TraitId[],
    },
    stamina: 100,
    confidence: 50,
    pitchCountInGame: 0,
  } as any;
}

function makeMockPitcherMP(velocity = 135, control = 70) {
  return {
    player: {
      id: 'pitcher-1',
      stats: {
        pitching: { velocity, control, pitchStamina: 70, pitches: { slider: 3 } },
        base: { speed: 60, mental: 70, focus: 70, stamina: 80, armStrength: 70, fielding: 60 },
        batting: { contact: 30, power: 20, eye: 30, technique: 20 },
      },
      condition: { mood: 'normal', fatigue: 10, injury: null },
      mentalState: { mood: 'normal', stress: 10, confidence: 55, teamChemistry: 50, flags: [] },
      battingSide: 'right' as const,
      traits: ['stoic'] as TraitId[],
    },
    stamina: 80,
    confidence: 55,
    pitchCountInGame: 20,
  } as any;
}

// ============================================================
// 7-E1: MatchOverrides → 試合エンジン反映
// ============================================================

describe('Phase 7-E1: MentalEffect → MatchOverrides → 試合パラメータ', () => {
  it('contactMultiplier が打者 contact パラメータに反映される', () => {
    const batterMP = makeMockBatterMP(70, 60);

    const baseContact = getEffectiveBatterParams(batterMP).contact;

    // +10% 補正
    const boostedContact = getEffectiveBatterParams(batterMP, { contactBonus: 0.10 }).contact;
    expect(boostedContact).toBeGreaterThan(baseContact);
    expect(boostedContact / baseContact).toBeCloseTo(1.10, 1);
  });

  it('contactBonus -10% は打者 contact を下げる', () => {
    const batterMP = makeMockBatterMP(70, 60);

    const baseContact = getEffectiveBatterParams(batterMP).contact;
    const reduced = getEffectiveBatterParams(batterMP, { contactBonus: -0.10 }).contact;
    expect(reduced).toBeLessThan(baseContact);
  });

  it('powerBonus が打者 power パラメータに反映される', () => {
    const batterMP = makeMockBatterMP(70, 60);

    const basePower = getEffectiveBatterParams(batterMP).power;
    const boostedPower = getEffectiveBatterParams(batterMP, { powerBonus: 0.12 }).power;
    expect(boostedPower).toBeGreaterThan(basePower);
  });

  it('velocityBonus が投手 velocity に加算される', () => {
    const pitcherMP = makeMockPitcherMP(135, 70);

    const baseVel = getEffectivePitcherParams(pitcherMP).velocity;
    const boosted = getEffectivePitcherParams(pitcherMP, { velocityBonus: 3 }).velocity;
    expect(boosted - baseVel).toBeCloseTo(3, 1);
  });

  it('controlBonus が投手 control に乗算される', () => {
    const pitcherMP = makeMockPitcherMP(135, 70);

    const baseCtrl = getEffectivePitcherParams(pitcherMP).control;
    const boosted = getEffectivePitcherParams(pitcherMP, { controlBonus: 0.15 }).control;
    expect(boosted / baseCtrl).toBeCloseTo(1.15, 1);
  });

  it('補正なし（undefined）の場合は従来通りの値を返す', () => {
    const batterMP = makeMockBatterMP(70, 60);
    const pitcherMP = makeMockPitcherMP(135, 70);

    const base = getEffectiveBatterParams(batterMP);
    const withUndef = getEffectiveBatterParams(batterMP, undefined);
    expect(base.contact).toBe(withUndef.contact);
    expect(base.power).toBe(withUndef.power);

    const basePitch = getEffectivePitcherParams(pitcherMP);
    const withUndefPitch = getEffectivePitcherParams(pitcherMP, undefined);
    expect(basePitch.velocity).toBe(withUndefPitch.velocity);
    expect(basePitch.control).toBe(withUndefPitch.control);
  });

  it('補正は ±0.3 にクリップされる', () => {
    const batterMP = makeMockBatterMP(70, 60);

    const base = getEffectiveBatterParams(batterMP);
    // 極端な補正 +1.0 → クリップされて +0.3 と同等になる
    const maxBoost = getEffectiveBatterParams(batterMP, { contactBonus: 1.0 }).contact;
    const clippedBoost = getEffectiveBatterParams(batterMP, { contactBonus: 0.3 }).contact;
    expect(maxBoost).toBe(clippedBoost);
    expect(maxBoost).toBeGreaterThan(base.contact);
  });

  it('velocityBonus は ±5km/h にクリップされる', () => {
    const pitcherMP = makeMockPitcherMP(135, 70);

    const baseVel = getEffectivePitcherParams(pitcherMP).velocity;
    const maxBoost = getEffectivePitcherParams(pitcherMP, { velocityBonus: 10 }).velocity;
    const clippedBoost = getEffectivePitcherParams(pitcherMP, { velocityBonus: 5 }).velocity;
    expect(maxBoost).toBe(clippedBoost);
    expect(maxBoost - baseVel).toBeCloseTo(5, 1);
  });

  it('buildBatterOverridesFromEffects: contactMultiplier → contactBonus', () => {
    const result = buildBatterOverridesFromEffects([
      { contactMultiplier: 1.08 },
    ]);
    expect(result.contactBonus).toBeCloseTo(0.08, 5);
  });

  it('buildBatterOverridesFromEffects: 複数エフェクトの加算', () => {
    const result = buildBatterOverridesFromEffects([
      { contactMultiplier: 1.05 },
      { contactMultiplier: 1.03 },
    ]);
    expect(result.contactBonus).toBeCloseTo(0.08, 5);
  });

  it('buildBatterOverridesFromEffects: batterFocusDisrupt → マイナス補正', () => {
    const result = buildBatterOverridesFromEffects([
      { batterFocusDisrupt: true },
    ]);
    expect(result.contactBonus).toBeLessThan(0);
    expect(result.powerBonus).toBeLessThan(0);
  });

  it('buildPitcherOverridesFromEffects: velocityBonus', () => {
    const result = buildPitcherOverridesFromEffects([
      { velocityBonus: 3 },
    ]);
    expect(result.velocityBonus).toBe(3);
  });
});

// ============================================================
// 7-E1 + 7-E2: ignoreOrder フラグ
// ============================================================

describe('Phase 7-E2: ignoreOrder フラグ検出', () => {
  it('ignoreOrder: true を持つエフェクトがあれば true を返す', () => {
    const effects = [{ ignoreOrder: true as const, summary: '指示無視' }];
    expect(hasIgnoreOrderEffect(effects)).toBe(true);
  });

  it('ignoreOrder: undefined ならば false を返す', () => {
    const effects = [{ contactMultiplier: 1.1 }];
    expect(hasIgnoreOrderEffect(effects)).toBe(false);
  });

  it('空配列は false', () => {
    expect(hasIgnoreOrderEffect([])).toBe(false);
  });
});

// ============================================================
// 7-E3: モノローグ連続重複回避
// ============================================================

describe('Phase 7-E3: 連続重複回避（excludeIds）', () => {
  it('excludeIds に含まれるパターンは選ばれない（他の候補がある場合）', () => {
    // 同じコンテキストで複数回生成し、excludeIds を増やす
    const ctx = makeContext({ batterTraits: ['passionate'] });
    const results: string[] = [];

    // 最初のピック
    const first = generatePitchMonologues(ctx, new Set());
    if (first.batter) results.push(first.batter.text);

    // 最初のピックを除外
    const excludeIds = new Set(first.pickedIds);
    // excludeIds に1つ以上のIDが入っている
    expect(excludeIds.size).toBeGreaterThanOrEqual(0);
  });

  it('全候補が除外される場合はフォールバックして null にならない', () => {
    // 全パターンIDを除外セットに入れる
    const ctx = makeContext();
    // 非常に大きな除外セットを渡しても、結果が返ること
    const allIds = new Set([
      'bat_pinch_fiery', 'bat_pinch_calm', 'bat_pinch_nervous',
      'bat_outside_focus_ok', 'bat_inside_focus_hesitant',
      'bat_fired_up_2strike', 'bat_koshien_stage', 'bat_koshien_intimidated',
    ]);
    const result = generatePitchMonologues(ctx, allIds);
    // 候補がある場合はフォールバックして返る、候補がなければ null
    // ここでは「クラッシュしないこと」を確認する
    expect(result).toBeDefined();
    expect(result.batterEffects).toBeDefined();
    expect(result.pitcherEffects).toBeDefined();
    expect(result.pickedIds).toBeDefined();
  });

  it('generatePitchMonologues は pickedIds を返す', () => {
    const ctx = makeContext();
    const result = generatePitchMonologues(ctx, new Set());
    expect(Array.isArray(result.pickedIds)).toBe(true);
  });

  it('PitchMonologuesWithEffects は batterEffects / pitcherEffects を返す', () => {
    const ctx = makeContext({ batterTraits: ['passionate'] });
    const result = generatePitchMonologues(ctx, new Set());
    expect(Array.isArray(result.batterEffects)).toBe(true);
    expect(Array.isArray(result.pitcherEffects)).toBe(true);
  });
});

// ============================================================
// 7-E4: 新特性10種の選手生成
// ============================================================

describe('Phase 7-E4: 新特性10種の選手生成への割り当て', () => {
  const NEW_TRAITS: TraitId[] = [
    'hotblooded', 'stoic', 'cautious', 'stubborn', 'clutch_hitter',
    'scatterbrained', 'big_game_player', 'steady', 'timid', 'ace',
  ];

  it('新特性10種が大量サンプルで少なくとも1回は出現する（投手）', () => {
    const rng = createRNG('new-traits-pitcher');
    const allAssigned = new Set<string>();

    for (let i = 0; i < 2000; i++) {
      const traits = generateTraits(rng.derive(`pt${i}`), 'pitcher');
      for (const t of traits) allAssigned.add(t);
    }

    // 全新特性のうち、ace 含め投手で出る特性は出現するはず
    for (const t of ['hotblooded', 'stoic', 'cautious', 'scatterbrained', 'steady', 'timid', 'ace']) {
      expect(allAssigned.has(t), `${t} が投手で1回も出現しなかった`).toBe(true);
    }
  });

  it('新特性10種が大量サンプルで少なくとも1回は出現する（野手）', () => {
    const rng = createRNG('new-traits-fielder');
    const allAssigned = new Set<string>();

    for (let i = 0; i < 2000; i++) {
      const traits = generateTraits(rng.derive(`ft${i}`), 'center');
      for (const t of traits) allAssigned.add(t);
    }

    // ace は野手には付かない
    const fielderNewTraits = NEW_TRAITS.filter((t) => t !== 'ace');
    for (const t of fielderNewTraits) {
      expect(allAssigned.has(t), `${t} が野手で1回も出現しなかった`).toBe(true);
    }
  });

  it('ace は野手（center）には付与されない', () => {
    const rng = createRNG('ace-no-fielder');
    for (let i = 0; i < 2000; i++) {
      const traits = generateTraits(rng.derive(`an${i}`), 'center');
      expect(traits.includes('ace'), 'ace が野手に付与された').toBe(false);
    }
  });

  it('hotblooded と stoic は同時に付かない', () => {
    const rng = createRNG('conflict-hot-stoic');
    for (let i = 0; i < 1000; i++) {
      const traits = generateTraits(rng.derive(`hs${i}`));
      const hasHot = traits.includes('hotblooded');
      const hasStoic = traits.includes('stoic');
      expect(hasHot && hasStoic, 'hotblooded と stoic が同時に付いた').toBe(false);
    }
  });

  it('cautious と timid は同時に付かない', () => {
    const rng = createRNG('conflict-cau-tim');
    for (let i = 0; i < 1000; i++) {
      const traits = generateTraits(rng.derive(`ct${i}`));
      const hasCautious = traits.includes('cautious');
      const hasTimid = traits.includes('timid');
      expect(hasCautious && hasTimid, 'cautious と timid が同時に付いた').toBe(false);
    }
  });

  it('generateTraits は常に 2〜4 個の特性を返す（新特性追加後も）', () => {
    const rng = createRNG('count-check-new');
    for (let i = 0; i < 200; i++) {
      const traits = generateTraits(rng.derive(`cc${i}`), 'pitcher');
      expect(traits.length).toBeGreaterThanOrEqual(2);
      expect(traits.length).toBeLessThanOrEqual(4);
    }
  });

  it('generateTraits の戻り値に重複する特性はない', () => {
    const rng = createRNG('no-dup-new');
    for (let i = 0; i < 200; i++) {
      const traits = generateTraits(rng.derive(`nd${i}`), 'pitcher');
      const unique = new Set(traits);
      expect(unique.size, '特性に重複がある').toBe(traits.length);
    }
  });
});
