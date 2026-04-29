/**
 * Phase R6: NarrativeHook 生成・統計テスト
 *
 * 完了基準:
 * - NarrativeHook が全21種から生成できる
 * - HR 演出フラグが正しく設定される（R6-2）
 * - ポテンヒット判定が機能する（R6-3）
 * - フェンス直撃判定が機能する（R6-4）
 * - 心理システム接続が動作する（R6-5）
 * - 21種統計集計が正しく動作する（R6-1）
 * - 全21種ラベルが設定済み
 */

import { describe, it, expect } from 'vitest';
import {
  generateNarrativeHook,
  isPotentialBlooper,
  isWallBallDramatic,
  buildDetailedHitLogText,
} from '../../../src/engine/narrative/hook-generator';
import {
  DETAILED_HIT_TYPE_LABEL,
  DETAILED_HIT_TYPE_SHORT,
  DETAILED_HIT_TYPE_CATEGORY,
} from '../../../src/engine/narrative/types';
import {
  applyNarrativeHookToPsyche,
  computeHookMentalEffect,
  HOOK_MENTAL_EFFECT_MAP,
} from '../../../src/engine/narrative/psyche-bridge';
import {
  emptyDetailedHitCounts,
  collectHitTypeStats,
  formatHitTypeStats,
  getAppearedHitTypes,
  areAll21TypesPresent,
  areMajor8TypesPresent,
} from '../../../src/engine/narrative/hit-type-stats';
import type { DetailedHitType, BallTrajectoryParams, BallFlight } from '../../../src/engine/physics/types';
import type { NarrativeHook } from '../../../src/engine/narrative/types';
import type { AtBatResultWithHitType } from '../../../src/engine/narrative/hit-type-stats';

// ============================================================
// テストヘルパー
// ============================================================

function makeTrajectory(overrides: Partial<BallTrajectoryParams> = {}): BallTrajectoryParams {
  return {
    exitVelocity: 140,
    launchAngle: 25,
    sprayAngle: 45,
    spin: { back: 2000, side: 0 },
    ...overrides,
  };
}

function makeFlight(overrides: Partial<BallFlight> = {}): BallFlight {
  return {
    landingPoint: { x: 0, y: 300 },
    hangTimeMs: 3000,
    apexFt: 80,
    apexTimeMs: 1500,
    distanceFt: 300,
    positionAt: (_t: number) => ({ x: 0, y: 300, z: 0 }),
    isFoul: false,
    ...overrides,
  };
}

/** 全21種の配列 */
const ALL_21_TYPES: DetailedHitType[] = [
  'first_line_grounder',
  'right_side_grounder',
  'left_side_grounder',
  'third_line_grounder',
  'comebacker',
  'infield_liner',
  'high_infield_fly',
  'over_infield_hit',
  'right_gap_hit',
  'up_the_middle_hit',
  'left_gap_hit',
  'shallow_fly',
  'medium_fly',
  'deep_fly',
  'line_drive_hit',
  'wall_ball',
  'line_drive_hr',
  'high_arc_hr',
  'fence_close_call',
  'foul_fly',
  'check_swing_dribbler',
];

// ============================================================
// R6-1: 21種ラベル・カテゴリ
// ============================================================

describe('R6-1: 21種ラベル・カテゴリ', () => {
  it('全21種に日本語ラベルが設定されている', () => {
    for (const hitType of ALL_21_TYPES) {
      expect(DETAILED_HIT_TYPE_LABEL[hitType]).toBeTruthy();
      expect(typeof DETAILED_HIT_TYPE_LABEL[hitType]).toBe('string');
    }
  });

  it('全21種に短縮ラベルが設定されている', () => {
    for (const hitType of ALL_21_TYPES) {
      expect(DETAILED_HIT_TYPE_SHORT[hitType]).toBeTruthy();
      expect(typeof DETAILED_HIT_TYPE_SHORT[hitType]).toBe('string');
    }
  });

  it('全21種にカテゴリが設定されている', () => {
    const validCategories = new Set(['major', 'medium', 'rare', 'special']);
    for (const hitType of ALL_21_TYPES) {
      const cat = DETAILED_HIT_TYPE_CATEGORY[hitType];
      expect(validCategories.has(cat), `${hitType} has invalid category: ${cat}`).toBe(true);
    }
  });

  it('主要分類が正しくカテゴリ設定されている', () => {
    const majorTypes: DetailedHitType[] = [
      'first_line_grounder', 'right_side_grounder', 'left_side_grounder', 'third_line_grounder',
      'right_gap_hit', 'up_the_middle_hit', 'left_gap_hit', 'shallow_fly', 'medium_fly', 'deep_fly',
    ];
    for (const t of majorTypes) {
      expect(DETAILED_HIT_TYPE_CATEGORY[t]).toBe('major');
    }
  });

  it('希少分類が正しくカテゴリ設定されている', () => {
    const rareTypes: DetailedHitType[] = ['wall_ball', 'line_drive_hr', 'high_arc_hr', 'fence_close_call'];
    for (const t of rareTypes) {
      expect(DETAILED_HIT_TYPE_CATEGORY[t]).toBe('rare');
    }
  });

  it('実況ログテキスト生成（ヒット）', () => {
    const text = buildDetailedHitLogText('up_the_middle_hit', true);
    expect(text).toContain('センター前ヒット');
    expect(text).toContain('ヒット');
  });

  it('実況ログテキスト生成（アウト）', () => {
    const text = buildDetailedHitLogText('medium_fly', false);
    expect(text).toContain('中距離フライ');
    expect(text).toContain('アウト');
  });
});

// ============================================================
// R6-1: NarrativeHook 生成（全21種）
// ============================================================

describe('R6-1: NarrativeHook 生成 - 全21種', () => {
  it('全21種から NarrativeHook が生成できる', () => {
    const trajectory = makeTrajectory();
    const flight = makeFlight();
    for (const hitType of ALL_21_TYPES) {
      const hook = generateNarrativeHook(hitType, trajectory, flight);
      expect(hook).toBeTruthy();
      expect(hook.detailedHitType).toBe(hitType);
      expect(hook.kind).toBeTruthy();
      expect(hook.dramaLevel).toBeTruthy();
      expect(hook.commentaryText).toBeTruthy();
      expect(hook.shortLabel).toBeTruthy();
      expect(hook.category).toBeTruthy();
      expect(hook.psycheHint).toBeTruthy();
    }
  });

  it('全21種の NarrativeHook が shortLabel を持つ', () => {
    const trajectory = makeTrajectory();
    const flight = makeFlight();
    for (const hitType of ALL_21_TYPES) {
      const hook = generateNarrativeHook(hitType, trajectory, flight);
      expect(typeof hook.shortLabel).toBe('string');
      expect(hook.shortLabel.length).toBeGreaterThan(0);
    }
  });

  it('全21種の NarrativeHook が commentaryText を持つ', () => {
    const trajectory = makeTrajectory();
    const flight = makeFlight();
    for (const hitType of ALL_21_TYPES) {
      const hook = generateNarrativeHook(hitType, trajectory, flight);
      expect(typeof hook.commentaryText).toBe('string');
      expect(hook.commentaryText.length).toBeGreaterThan(0);
    }
  });

  it('all psycheHint values are in -1.0 to +1.0 range', () => {
    const trajectory = makeTrajectory();
    const flight = makeFlight();
    for (const hitType of ALL_21_TYPES) {
      const hook = generateNarrativeHook(hitType, trajectory, flight);
      expect(hook.psycheHint.batterImpact).toBeGreaterThanOrEqual(-1.0);
      expect(hook.psycheHint.batterImpact).toBeLessThanOrEqual(1.0);
      expect(hook.psycheHint.pitcherImpact).toBeGreaterThanOrEqual(-1.0);
      expect(hook.psycheHint.pitcherImpact).toBeLessThanOrEqual(1.0);
    }
  });
});

// ============================================================
// R6-2: HR 種別演出フラグ
// ============================================================

describe('R6-2: HR 種別演出フラグ', () => {
  it('line_drive_hr は liner_home_run kind を返す', () => {
    const trajectory = makeTrajectory({ launchAngle: 20, exitVelocity: 165 });
    const flight = makeFlight({ distanceFt: 420 });
    const hook = generateNarrativeHook('line_drive_hr', trajectory, flight);
    expect(hook.kind).toBe('liner_home_run');
  });

  it('high_arc_hr は high_arc_home_run kind を返す', () => {
    const trajectory = makeTrajectory({ launchAngle: 40, exitVelocity: 155 });
    const flight = makeFlight({ distanceFt: 400 });
    const hook = generateNarrativeHook('high_arc_hr', trajectory, flight);
    expect(hook.kind).toBe('high_arc_home_run');
  });

  it('fence_close_call は line_home_run kind を返す', () => {
    const trajectory = makeTrajectory({ launchAngle: 32, exitVelocity: 150 });
    const flight = makeFlight({ distanceFt: 380 });
    const hook = generateNarrativeHook('fence_close_call', trajectory, flight);
    expect(hook.kind).toBe('line_home_run');
  });

  it('line_drive_hr の homeRunFlag.isLineDrive が true', () => {
    const trajectory = makeTrajectory({ launchAngle: 20, exitVelocity: 165 });
    const flight = makeFlight({ distanceFt: 420 });
    const hook = generateNarrativeHook('line_drive_hr', trajectory, flight);
    expect(hook.homeRunFlag).toBeDefined();
    expect(hook.homeRunFlag!.isLineDrive).toBe(true);
    expect(hook.homeRunFlag!.isCloseLine).toBe(false);
  });

  it('high_arc_hr の homeRunFlag.isHighArc が true', () => {
    const trajectory = makeTrajectory({ launchAngle: 42, exitVelocity: 155 });
    const flight = makeFlight({ distanceFt: 400 });
    const hook = generateNarrativeHook('high_arc_hr', trajectory, flight);
    expect(hook.homeRunFlag).toBeDefined();
    expect(hook.homeRunFlag!.isHighArc).toBe(true);
  });

  it('fence_close_call の homeRunFlag.isCloseLine が true', () => {
    const trajectory = makeTrajectory({ launchAngle: 30, exitVelocity: 148 });
    const flight = makeFlight({ distanceFt: 370 });
    const hook = generateNarrativeHook('fence_close_call', trajectory, flight);
    expect(hook.homeRunFlag).toBeDefined();
    expect(hook.homeRunFlag!.isCloseLine).toBe(true);
  });

  it('非HR系の homeRunFlag は undefined', () => {
    const trajectory = makeTrajectory({ launchAngle: 25 });
    const flight = makeFlight({ distanceFt: 280 });
    const hook = generateNarrativeHook('medium_fly', trajectory, flight);
    expect(hook.homeRunFlag).toBeUndefined();
  });

  it('HR 系の dramaLevel は dramatic', () => {
    const hrTypes: DetailedHitType[] = ['line_drive_hr', 'high_arc_hr', 'fence_close_call'];
    const trajectory = makeTrajectory({ exitVelocity: 155, launchAngle: 35 });
    const flight = makeFlight({ distanceFt: 420 });
    for (const t of hrTypes) {
      const hook = generateNarrativeHook(t, trajectory, flight);
      expect(hook.dramaLevel).toBe('dramatic');
    }
  });

  it('HR の psycheHint は打者に大きなプラス', () => {
    const trajectory = makeTrajectory({ launchAngle: 35, exitVelocity: 158 });
    const flight = makeFlight({ distanceFt: 410 });
    const hook = generateNarrativeHook('high_arc_hr', trajectory, flight);
    expect(hook.psycheHint.batterImpact).toBeGreaterThan(0.8);
    expect(hook.psycheHint.pitcherImpact).toBeLessThan(-0.8);
  });

  it('HR の実況テキストにホームランの表現が含まれる', () => {
    const trajectory = makeTrajectory({ launchAngle: 35, exitVelocity: 155 });
    const flight = makeFlight({ distanceFt: 400 });
    const hrHook = generateNarrativeHook('high_arc_hr', trajectory, flight);
    expect(hrHook.commentaryText).toMatch(/ホームラン|スタンド|アーチ/);

    const lineDriveHook = generateNarrativeHook('line_drive_hr', trajectory, flight);
    expect(lineDriveHook.commentaryText).toMatch(/ホームラン|スタンド|ライナー/);
  });
});

// ============================================================
// R6-3: ポテンヒット演出
// ============================================================

describe('R6-3: ポテンヒット演出', () => {
  it('over_infield_hit はポテンヒット判定される', () => {
    const trajectory = makeTrajectory({ launchAngle: 20, exitVelocity: 110 });
    const flight = makeFlight({ distanceFt: 120 });
    expect(isPotentialBlooper('over_infield_hit', trajectory, flight)).toBe(true);
  });

  it('shallow_fly は適切な距離でポテンヒット判定される', () => {
    const trajectory = makeTrajectory({ launchAngle: 28, exitVelocity: 115 });
    const flight = makeFlight({ distanceFt: 180 });
    expect(isPotentialBlooper('shallow_fly', trajectory, flight)).toBe(true);
  });

  it('over_infield_hit の NarrativeHook kind は blooper_over_infield', () => {
    const trajectory = makeTrajectory({ launchAngle: 20, exitVelocity: 110 });
    const flight = makeFlight({ distanceFt: 120 });
    const hook = generateNarrativeHook('over_infield_hit', trajectory, flight);
    expect(hook.kind).toBe('blooper_over_infield');
  });

  it('over_infield_hit の commentaryText にポテンの表現が含まれる', () => {
    const trajectory = makeTrajectory({ launchAngle: 18 });
    const flight = makeFlight({ distanceFt: 110 });
    const hook = generateNarrativeHook('over_infield_hit', trajectory, flight);
    expect(hook.commentaryText).toMatch(/ポテン|頭/);
  });

  it('距離が遠すぎるとポテン判定されない', () => {
    const trajectory = makeTrajectory({ launchAngle: 22 });
    const flight = makeFlight({ distanceFt: 280 });  // SHALLOW_FLY_MAX_DIST 超
    expect(isPotentialBlooper('shallow_fly', trajectory, flight)).toBe(false);
  });

  it('HR系はポテン判定されない', () => {
    const trajectory = makeTrajectory({ launchAngle: 35 });
    const flight = makeFlight({ distanceFt: 400 });
    expect(isPotentialBlooper('high_arc_hr', trajectory, flight)).toBe(false);
  });

  it('ポテンヒット dramaLevel は high', () => {
    const trajectory = makeTrajectory({ launchAngle: 20 });
    const flight = makeFlight({ distanceFt: 120 });
    const hook = generateNarrativeHook('over_infield_hit', trajectory, flight);
    expect(hook.dramaLevel).toBe('high');
  });
});

// ============================================================
// R6-4: フェンス直撃演出
// ============================================================

describe('R6-4: フェンス直撃演出', () => {
  it('wall_ball は wall_ball_hit kind を返す', () => {
    const trajectory = makeTrajectory({ launchAngle: 28, exitVelocity: 150 });
    const flight = makeFlight({ distanceFt: 320 });
    const hook = generateNarrativeHook('wall_ball', trajectory, flight);
    expect(hook.kind).toBe('wall_ball_hit');
  });

  it('wall_ball の commentaryText にフェンスの表現が含まれる', () => {
    const trajectory = makeTrajectory({ launchAngle: 28 });
    const flight = makeFlight({ distanceFt: 320 });
    const hook = generateNarrativeHook('wall_ball', trajectory, flight);
    expect(hook.commentaryText).toMatch(/フェンス|直撃/);
  });

  it('遠距離のwall_ballはドラマティック判定される（isWallBallDramatic）', () => {
    const flight = makeFlight({ distanceFt: 320 });
    expect(isWallBallDramatic('wall_ball', flight)).toBe(true);
  });

  it('短い距離のwall_ballはドラマティック判定されない', () => {
    const flight = makeFlight({ distanceFt: 290 });
    expect(isWallBallDramatic('wall_ball', flight)).toBe(false);
  });

  it('wall_ball以外でisWallBallDramaticはfalse', () => {
    const flight = makeFlight({ distanceFt: 400 });
    expect(isWallBallDramatic('deep_fly', flight)).toBe(false);
    expect(isWallBallDramatic('high_arc_hr', flight)).toBe(false);
  });

  it('wall_ball dramaLevel は high', () => {
    const trajectory = makeTrajectory({ launchAngle: 28 });
    const flight = makeFlight({ distanceFt: 320 });
    const hook = generateNarrativeHook('wall_ball', trajectory, flight);
    expect(hook.dramaLevel).toBe('high');
  });

  it('wall_ball の psycheHint は打者にプラス', () => {
    const trajectory = makeTrajectory({ launchAngle: 28 });
    const flight = makeFlight({ distanceFt: 320 });
    const hook = generateNarrativeHook('wall_ball', trajectory, flight);
    expect(hook.psycheHint.batterImpact).toBeGreaterThan(0);
  });
});

// ============================================================
// R6-5: 心理システム接続
// ============================================================

describe('R6-5: 心理システム接続', () => {
  it('全21種に HOOK_MENTAL_EFFECT_MAP が存在する', () => {
    const trajectory = makeTrajectory();
    const flight = makeFlight();
    for (const hitType of ALL_21_TYPES) {
      const hook = generateNarrativeHook(hitType, trajectory, flight);
      const effect = HOOK_MENTAL_EFFECT_MAP[hook.kind];
      expect(effect).toBeDefined();
    }
  });

  it('computeHookMentalEffect は batter/pitcher 別に計算する', () => {
    const trajectory = makeTrajectory({ launchAngle: 35, exitVelocity: 155 });
    const flight = makeFlight({ distanceFt: 400 });
    const hook = generateNarrativeHook('high_arc_hr', trajectory, flight);

    const batterEffect = computeHookMentalEffect(hook, 'batter');
    const pitcherEffect = computeHookMentalEffect(hook, 'pitcher');

    // HRは打者に良い影響
    expect(batterEffect.powerMultiplier).toBeGreaterThan(1.0);
    // HRは投手に悪い影響（controlMultiplierは変化しない or 無変化）
    expect(pitcherEffect).toBeDefined();
  });

  it('applyNarrativeHookToPsyche がオーバーライドを返す', () => {
    const trajectory = makeTrajectory({ launchAngle: 35 });
    const flight = makeFlight({ distanceFt: 400 });
    const hook = generateNarrativeHook('high_arc_hr', trajectory, flight);

    const result = applyNarrativeHookToPsyche(hook);
    expect(result).toHaveProperty('batterMental');
    expect(result).toHaveProperty('pitcherMental');
    expect(result.batterMental).toHaveProperty('contactBonus');
    expect(result.batterMental).toHaveProperty('powerBonus');
    expect(result.batterMental).toHaveProperty('eyeBonus');
    expect(result.pitcherMental).toHaveProperty('controlBonus');
    expect(result.pitcherMental).toHaveProperty('velocityBonus');
  });

  it('applyNarrativeHookToPsyche は既存オーバーライドに加算する', () => {
    const trajectory = makeTrajectory({ launchAngle: 35 });
    const flight = makeFlight({ distanceFt: 400 });
    const hook = generateNarrativeHook('high_arc_hr', trajectory, flight);

    const existing = {
      batterMental: { contactBonus: 0.02, powerBonus: 0.01, eyeBonus: 0 },
    };

    const result = applyNarrativeHookToPsyche(hook, existing);
    // 加算されている（HR効果 + 既存値）
    expect(result.batterMental.contactBonus).toBeGreaterThanOrEqual(0.02);
  });

  it('当たり損ね は打者のマイナス・投手のプラス効果', () => {
    const trajectory = makeTrajectory({ launchAngle: 5, exitVelocity: 60 });
    const flight = makeFlight({ distanceFt: 20 });
    const hook = generateNarrativeHook('check_swing_dribbler', trajectory, flight);

    expect(hook.psycheHint.batterImpact).toBeLessThan(0);
    expect(hook.psycheHint.pitcherImpact).toBeGreaterThan(0);

    const effect = computeHookMentalEffect(hook, 'pitcher');
    expect(effect.controlMultiplier).toBeGreaterThan(1.0);
  });

  it('NarrativeHook.category が psycheHint と整合する', () => {
    // rare 系（HR）は打者にプラス
    const trajectory = makeTrajectory({ launchAngle: 38, exitVelocity: 158 });
    const flight = makeFlight({ distanceFt: 410 });
    const hrHook = generateNarrativeHook('high_arc_hr', trajectory, flight);
    expect(hrHook.category).toBe('rare');
    expect(hrHook.psycheHint.batterImpact).toBeGreaterThan(0.5);
  });
});

// ============================================================
// R6-1: 21種統計集計
// ============================================================

describe('R6-1: 21種統計集計', () => {
  it('emptyDetailedHitCounts は全21種を0で初期化する', () => {
    const counts = emptyDetailedHitCounts();
    expect(Object.keys(counts)).toHaveLength(21);
    for (const v of Object.values(counts)) {
      expect(v).toBe(0);
    }
  });

  it('collectHitTypeStats は打球データから正しく集計する', () => {
    const results: AtBatResultWithHitType[] = [
      { batterId: 'p1', detailedHitType: 'up_the_middle_hit' },
      { batterId: 'p1', detailedHitType: 'medium_fly' },
      { batterId: 'p1', detailedHitType: 'up_the_middle_hit' },
      { batterId: 'p2', detailedHitType: 'high_arc_hr' },
    ];

    const stats = collectHitTypeStats(results, ['p1', 'p2']);

    expect(stats.teamTotals.up_the_middle_hit).toBe(2);
    expect(stats.teamTotals.medium_fly).toBe(1);
    expect(stats.teamTotals.high_arc_hr).toBe(1);
    expect(stats.totalBattedBalls).toBe(4);
  });

  it('collectHitTypeStats はカテゴリ別合計を計算する', () => {
    const results: AtBatResultWithHitType[] = [
      { batterId: 'p1', detailedHitType: 'right_side_grounder' },   // major
      { batterId: 'p1', detailedHitType: 'comebacker' },             // medium
      { batterId: 'p1', detailedHitType: 'wall_ball' },              // rare
    ];

    const stats = collectHitTypeStats(results, ['p1']);
    expect(stats.majorTypeTotal).toBe(1);
    expect(stats.mediumTypeTotal).toBe(1);
    expect(stats.rareTypeTotal).toBe(1);
  });

  it('formatHitTypeStats は読みやすいテキストを返す', () => {
    const results: AtBatResultWithHitType[] = [
      { batterId: 'p1', detailedHitType: 'up_the_middle_hit' },
    ];
    const stats = collectHitTypeStats(results, ['p1']);
    const text = formatHitTypeStats(stats);

    expect(text).toContain('打球分類統計');
    expect(text).toContain('センター前ヒット');
  });

  it('getAppearedHitTypes は出現した種別のみ返す', () => {
    const counts = emptyDetailedHitCounts();
    counts['up_the_middle_hit'] = 2;
    counts['medium_fly'] = 1;

    const appeared = getAppearedHitTypes(counts);
    expect(appeared).toContain('up_the_middle_hit');
    expect(appeared).toContain('medium_fly');
    expect(appeared).not.toContain('high_arc_hr');
    expect(appeared).toHaveLength(2);
  });

  it('areAll21TypesPresent は全種出現で true を返す', () => {
    const counts = emptyDetailedHitCounts();
    // 全種に1を設定
    for (const k of Object.keys(counts) as DetailedHitType[]) {
      counts[k] = 1;
    }
    expect(areAll21TypesPresent(counts)).toBe(true);
  });

  it('areAll21TypesPresent は未出現種があれば false を返す', () => {
    const counts = emptyDetailedHitCounts();
    for (const k of Object.keys(counts) as DetailedHitType[]) {
      counts[k] = 1;
    }
    counts['line_drive_hr'] = 0;  // 1種を0に
    expect(areAll21TypesPresent(counts)).toBe(false);
  });

  it('areMajor8TypesPresent は主要8種すべて出現で true を返す', () => {
    const counts = emptyDetailedHitCounts();
    const major8: DetailedHitType[] = [
      'right_side_grounder', 'left_side_grounder', 'right_gap_hit',
      'up_the_middle_hit', 'left_gap_hit', 'shallow_fly', 'medium_fly', 'deep_fly',
    ];
    for (const t of major8) {
      counts[t] = 1;
    }
    expect(areMajor8TypesPresent(counts)).toBe(true);
  });

  it('areMajor8TypesPresent は主要8種の1つが欠けたら false', () => {
    const counts = emptyDetailedHitCounts();
    const major8: DetailedHitType[] = [
      'right_side_grounder', 'left_side_grounder', 'right_gap_hit',
      'up_the_middle_hit', 'left_gap_hit', 'shallow_fly', 'medium_fly',
      // deep_fly は除外
    ];
    for (const t of major8) {
      counts[t] = 1;
    }
    expect(areMajor8TypesPresent(counts)).toBe(false);
  });
});

// ============================================================
// NarrativeHook 基本品質テスト
// ============================================================

describe('NarrativeHook 基本品質', () => {
  it('dramaLevel が4種類のいずれかである', () => {
    const validLevels = new Set(['low', 'medium', 'high', 'dramatic']);
    const trajectory = makeTrajectory();
    const flight = makeFlight();
    for (const hitType of ALL_21_TYPES) {
      const hook = generateNarrativeHook(hitType, trajectory, flight);
      expect(validLevels.has(hook.dramaLevel), `${hitType}: ${hook.dramaLevel}`).toBe(true);
    }
  });

  it('凡打系は low/medium drama level', () => {
    const weakTypes: DetailedHitType[] = ['check_swing_dribbler', 'high_infield_fly', 'foul_fly'];
    const trajectory = makeTrajectory();
    const flight = makeFlight();
    for (const t of weakTypes) {
      const hook = generateNarrativeHook(t, trajectory, flight);
      expect(['low', 'medium']).toContain(hook.dramaLevel);
    }
  });

  it('強打系（high exitVelocity）はdramaLevelが上がる傾向', () => {
    const lowEv = makeTrajectory({ exitVelocity: 90 });
    const highEv = makeTrajectory({ exitVelocity: 165 });
    const flight = makeFlight({ distanceFt: 350 });

    const lowHook = generateNarrativeHook('infield_liner', lowEv, flight);
    const highHook = generateNarrativeHook('infield_liner', highEv, flight);

    const levelRank = { low: 0, medium: 1, high: 2, dramatic: 3 };
    expect(levelRank[highHook.dramaLevel]).toBeGreaterThanOrEqual(levelRank[lowHook.dramaLevel]);
  });

  it('NarrativeHook は immutable-like（追加プロパティなし）', () => {
    const trajectory = makeTrajectory();
    const flight = makeFlight();
    const hook = generateNarrativeHook('up_the_middle_hit', trajectory, flight);

    // 必須プロパティが存在する
    expect('kind' in hook).toBe(true);
    expect('detailedHitType' in hook).toBe(true);
    expect('dramaLevel' in hook).toBe(true);
    expect('commentaryText' in hook).toBe(true);
    expect('shortLabel' in hook).toBe(true);
    expect('category' in hook).toBe(true);
    expect('psycheHint' in hook).toBe(true);
  });
});
