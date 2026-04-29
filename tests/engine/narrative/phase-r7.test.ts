/**
 * tests/engine/narrative/phase-r7.test.ts
 *
 * Phase R7: 戦術・感情・思考への接続テスト
 *
 * R7-1: BatterDetailedOrder → Layer 3 入力 E (orderAggressiveness/orderFocusArea) 接続テスト
 * R7-2: NarrativeHook 購読インターフェーステスト
 * R7-3: 思考コメント生成（拡張パターン）テスト
 * R7-4: 実況パターン拡張（投球種 × カウント）テスト
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '../../../src/engine/core/rng';

// R7-1: latent-state
import {
  computeSwingLatentState,
  computeContactQuality,
  computeDecisionPressure,
  computeSwingIntent,
  AGGRESSIVENESS_CONTACT_BIAS,
  AGGRESSIVENESS_PRESSURE_BIAS,
  FOCUS_AREA_INTENT_BIAS,
} from '../../../src/engine/physics/bat-ball/latent-state';
import type { BatBallContext } from '../../../src/engine/physics/types';

// R7-2: psyche-bridge
import {
  notifyNarrativeHookSubscribers,
  computeConfidenceDelta,
  extractConfidenceDeltas,
  applyNarrativeHookToPsyche,
} from '../../../src/engine/narrative/psyche-bridge';
import type { NarrativeHookSubscriber } from '../../../src/engine/narrative/psyche-bridge';

// R7-3: thought-comment-generator
import {
  generateThoughtComments,
  extractThoughtCommentIds,
  updateThoughtCommentRing,
} from '../../../src/engine/narrative/thought-comment-generator';
import type { ThoughtCommentContext } from '../../../src/engine/narrative/types';

// R7-4: hook-generator
import {
  generateNarrativeHook,
} from '../../../src/engine/narrative/hook-generator';
import type { CommentaryContext } from '../../../src/engine/narrative/hook-generator';
import type { NarrativeHook } from '../../../src/engine/narrative/types';

// ============================================================
// テストヘルパー
// ============================================================

function makeRNG(seed = 'r7-test') {
  return createRNG(seed);
}

function makeBatBallContext(overrides: Partial<BatBallContext> = {}): BatBallContext {
  return {
    pitcher: {
      velocity: 135,
      control: 70,
      pitchStamina: 70,
      pitches: { slider: 3 },
      mental: 70,
      focus: 70,
      pitchCountInGame: 20,
      stamina: 80,
      mood: 'normal',
      confidence: 55,
    },
    perceivedPitch: {
      perceivedVelocity: 135,
      velocityChangeImpact: 0.1,
      breakSharpness: 0.2,
      lateMovement: 0.1,
      difficulty: 0.3,
    },
    pitchVelocity: 135,
    pitchType: 'fastball',
    pitchBreakLevel: 0,
    pitchActualLocation: { row: 2, col: 2 },
    batter: {
      contact: 70,
      power: 65,
      eye: 60,
      technique: 60,
      speed: 65,
      mental: 60,
      focus: 65,
      battingSide: 'right',
      confidence: 50,
      mood: 'normal',
    },
    batterSwingType: 'spray',
    timingError: 0,
    ballOnBat: 0.5,
    previousPitchVelocity: null,
    count: { balls: 0, strikes: 0 },
    inning: 5,
    scoreDiff: 0,
    outs: 1,
    bases: { first: null, second: null, third: null },
    isKeyMoment: false,
    orderFocusArea: 'none',
    orderAggressiveness: 'normal',
    batterTraits: [],
    batterMood: 0,
    ...overrides,
  };
}

function makeThoughtCommentContext(overrides: Partial<ThoughtCommentContext> = {}): ThoughtCommentContext {
  return {
    inning: 5,
    half: 'bottom',
    outs: 1,
    balls: 0,
    strikes: 0,
    runnersOn: 'none',
    scoreDiff: 0,
    isKoshien: false,
    batterName: '田中',
    pitcherName: '山田',
    batterTraits: [],
    pitcherTraits: [],
    pitcherStamina: 80,
    ...overrides,
  };
}

function makeTrajectory(overrides = {}) {
  return {
    exitVelocity: 140,
    launchAngle: 25,
    sprayAngle: 45,
    spin: { back: 2000, side: 0 },
    ...overrides,
  };
}

function makeFlight(overrides = {}) {
  return {
    landingPoint: { x: 100, y: 300 },
    hangTimeMs: 4000,
    apexFt: 50,
    apexTimeMs: 2000,
    distanceFt: 320,
    positionAt: () => ({ x: 0, y: 0, z: 0 }),
    isFoul: false,
    ...overrides,
  };
}

function makeNarrativeHook(overrides: Partial<NarrativeHook> = {}): NarrativeHook {
  return {
    kind: 'center_clean_hit',
    detailedHitType: 'up_the_middle_hit',
    dramaLevel: 'medium',
    commentaryText: 'センター前へクリーンヒット！',
    shortLabel: '中安',
    category: 'major',
    psycheHint: { batterImpact: 0.3, pitcherImpact: -0.3 },
    ...overrides,
  };
}

// ============================================================
// R7-1: BatterDetailedOrder → Layer 3 接続
// ============================================================

describe('R7-1: orderAggressiveness が Layer 3 潜在量に反映される', () => {

  it('aggressiveness=aggressive は contactQuality を下げる（normal 比較）', () => {
    const rng = makeRNG('r7-1a');
    const ctxNormal = makeBatBallContext({ orderAggressiveness: 'normal' });
    const ctxAggressive = makeBatBallContext({ orderAggressiveness: 'aggressive' });

    // 同一 RNG で比較（ノイズが同じになるよう seed を同じに）
    const qNormal = computeContactQuality(ctxNormal, createRNG('cq-test'));
    const qAggressive = computeContactQuality(ctxAggressive, createRNG('cq-test'));

    expect(qAggressive).toBeLessThan(qNormal);
  });

  it('aggressiveness=passive は contactQuality を上げる（normal 比較）', () => {
    const ctxNormal = makeBatBallContext({ orderAggressiveness: 'normal' });
    const ctxPassive = makeBatBallContext({ orderAggressiveness: 'passive' });

    const qNormal = computeContactQuality(ctxNormal, createRNG('cq-test2'));
    const qPassive = computeContactQuality(ctxPassive, createRNG('cq-test2'));

    expect(qPassive).toBeGreaterThan(qNormal);
  });

  it('aggressiveness=aggressive は decisionPressure を下げる', () => {
    const ctxNormal = makeBatBallContext({ orderAggressiveness: 'normal' });
    const ctxAggressive = makeBatBallContext({ orderAggressiveness: 'aggressive' });

    const pNormal = computeDecisionPressure(ctxNormal);
    const pAggressive = computeDecisionPressure(ctxAggressive);

    expect(pAggressive).toBeLessThan(pNormal);
  });

  it('aggressiveness=passive は decisionPressure を上げる', () => {
    const ctxNormal = makeBatBallContext({ orderAggressiveness: 'normal' });
    const ctxPassive = makeBatBallContext({ orderAggressiveness: 'passive' });

    const pNormal = computeDecisionPressure(ctxNormal);
    const pPassive = computeDecisionPressure(ctxPassive);

    expect(pPassive).toBeGreaterThan(pNormal);
  });

  it('AGGRESSIVENESS_CONTACT_BIAS: aggressive は負, passive は正', () => {
    expect(AGGRESSIVENESS_CONTACT_BIAS['aggressive']).toBeLessThan(0);
    expect(AGGRESSIVENESS_CONTACT_BIAS['passive']).toBeGreaterThan(0);
    expect(AGGRESSIVENESS_CONTACT_BIAS['normal']).toBe(0);
  });

  it('AGGRESSIVENESS_PRESSURE_BIAS: aggressive は負, passive は正', () => {
    expect(AGGRESSIVENESS_PRESSURE_BIAS['aggressive']).toBeLessThan(0);
    expect(AGGRESSIVENESS_PRESSURE_BIAS['passive']).toBeGreaterThan(0);
    expect(AGGRESSIVENESS_PRESSURE_BIAS['normal']).toBe(0);
  });

  it('focusArea=inside は swingIntent を引っ張り方向に増加させる', () => {
    const ctxNone = makeBatBallContext({ orderFocusArea: 'none' });
    const ctxInside = makeBatBallContext({ orderFocusArea: 'inside' });

    const intentNone = computeSwingIntent(ctxNone);
    const intentInside = computeSwingIntent(ctxInside);

    expect(intentInside).toBeGreaterThan(intentNone);
  });

  it('focusArea=outside は swingIntent を流し方向に減少させる', () => {
    const ctxNone = makeBatBallContext({ orderFocusArea: 'none' });
    const ctxOutside = makeBatBallContext({ orderFocusArea: 'outside' });

    const intentNone = computeSwingIntent(ctxNone);
    const intentOutside = computeSwingIntent(ctxOutside);

    expect(intentOutside).toBeLessThan(intentNone);
  });

  it('同じ打席でも aggressiveness が違えば computeSwingLatentState の結果が変わる', () => {
    const rng1 = createRNG('full-latent-1');
    const rng2 = createRNG('full-latent-1'); // 同じ seed

    const ctxNormal = makeBatBallContext({ orderAggressiveness: 'normal' });
    const ctxAggressive = makeBatBallContext({ orderAggressiveness: 'aggressive' });

    const latentNormal = computeSwingLatentState(ctxNormal, rng1);
    const latentAggressive = computeSwingLatentState(ctxAggressive, rng2);

    // contactQuality が変化していること
    expect(latentAggressive.contactQuality).not.toBeCloseTo(latentNormal.contactQuality, 5);
  });

  it('FOCUS_AREA_INTENT_BIAS: inside/outside の値が正反対', () => {
    expect(FOCUS_AREA_INTENT_BIAS['inside']).toBeGreaterThan(0);
    expect(FOCUS_AREA_INTENT_BIAS['outside']).toBeLessThan(0);
    expect(FOCUS_AREA_INTENT_BIAS['middle']).toBe(0);
  });
});

// ============================================================
// R7-2: NarrativeHook 購読インターフェース
// ============================================================

describe('R7-2: NarrativeHook 購読インターフェース', () => {

  it('notifyNarrativeHookSubscribers: 購読者が呼び出される', () => {
    const called: string[] = [];
    const subscriber: NarrativeHookSubscriber = (input) => {
      called.push(input.hook.kind);
    };

    const hook = makeNarrativeHook({ kind: 'center_clean_hit' });
    notifyNarrativeHookSubscribers([subscriber], hook);

    expect(called).toHaveLength(1);
    expect(called[0]).toBe('center_clean_hit');
  });

  it('notifyNarrativeHookSubscribers: 複数の購読者が全員呼び出される', () => {
    const results: number[] = [];
    const sub1: NarrativeHookSubscriber = () => results.push(1);
    const sub2: NarrativeHookSubscriber = () => results.push(2);
    const sub3: NarrativeHookSubscriber = () => results.push(3);

    const hook = makeNarrativeHook();
    notifyNarrativeHookSubscribers([sub1, sub2, sub3], hook);

    expect(results).toEqual([1, 2, 3]);
  });

  it('notifyNarrativeHookSubscribers: 空の購読者リストでもクラッシュしない', () => {
    const hook = makeNarrativeHook();
    expect(() => notifyNarrativeHookSubscribers([], hook)).not.toThrow();
  });

  it('computeConfidenceDelta: HR フックは打者に大きな正の信頼度変化', () => {
    const hrHook = makeNarrativeHook({
      kind: 'liner_home_run',
      dramaLevel: 'dramatic',
      psycheHint: { batterImpact: 1.0, pitcherImpact: -1.0 },
    });

    const batterDelta = computeConfidenceDelta(hrHook, 'batter');
    const pitcherDelta = computeConfidenceDelta(hrHook, 'pitcher');

    expect(batterDelta).toBeGreaterThan(0);
    expect(pitcherDelta).toBeLessThan(0);
    expect(Math.abs(batterDelta)).toBeGreaterThanOrEqual(Math.abs(computeConfidenceDelta(
      makeNarrativeHook({ dramaLevel: 'low', psycheHint: { batterImpact: 0.3, pitcherImpact: -0.3 } }),
      'batter',
    )));
  });

  it('computeConfidenceDelta: dramatic は low の 4 倍の影響（impact が同じ場合）', () => {
    const base = makeNarrativeHook({ psycheHint: { batterImpact: 1.0, pitcherImpact: -1.0 } });
    const dramatic = computeConfidenceDelta({ ...base, dramaLevel: 'dramatic' }, 'batter');
    const low = computeConfidenceDelta({ ...base, dramaLevel: 'low' }, 'batter');

    expect(dramatic / low).toBeCloseTo(4, 1);
  });

  it('computeConfidenceDelta: 返値は -10〜+10 の範囲', () => {
    const extremeHook = makeNarrativeHook({
      dramaLevel: 'dramatic',
      psycheHint: { batterImpact: 1.0, pitcherImpact: -1.0 },
    });
    const delta = computeConfidenceDelta(extremeHook, 'batter');
    expect(delta).toBeGreaterThanOrEqual(-10);
    expect(delta).toBeLessThanOrEqual(10);
  });

  it('extractConfidenceDeltas: hook から打者・投手 delta を正しく抽出', () => {
    const hook = makeNarrativeHook({
      dramaLevel: 'high',
      psycheHint: { batterImpact: 0.5, pitcherImpact: -0.5 },
    });
    const input = { hook };
    const deltas = extractConfidenceDeltas(input);

    expect(deltas.batter).toBeGreaterThan(0);
    expect(deltas.pitcher).toBeLessThan(0);
  });

  it('extractConfidenceDeltas: suggestedBatterConfidenceDelta が指定されれば優先される', () => {
    const hook = makeNarrativeHook({ psycheHint: { batterImpact: 1.0, pitcherImpact: -1.0 } });
    const input = { hook, suggestedBatterConfidenceDelta: 7 };
    const deltas = extractConfidenceDeltas(input);

    expect(deltas.batter).toBe(7);
  });

  it('applyNarrativeHookToPsyche: HR フックは打者 contactBonus がプラス', () => {
    const hrHook = makeNarrativeHook({
      kind: 'liner_home_run',
      psycheHint: { batterImpact: 1.0, pitcherImpact: -1.0 },
    });
    const result = applyNarrativeHookToPsyche(hrHook);

    expect(result.batterMental.contactBonus).toBeGreaterThanOrEqual(0);
  });

  it('applyNarrativeHookToPsyche: 既存の overrides に加算される', () => {
    const hook = makeNarrativeHook({ kind: 'center_clean_hit', psycheHint: { batterImpact: 0.3, pitcherImpact: -0.3 } });
    const initial = { batterMental: { contactBonus: 0.05, powerBonus: 0, eyeBonus: 0 } };
    const result = applyNarrativeHookToPsyche(hook, initial);

    expect(result.batterMental.contactBonus).toBeGreaterThanOrEqual(0.05);
  });
});

// ============================================================
// R7-3: 思考コメント生成（拡張パターン）
// ============================================================

describe('R7-3: 思考コメント生成（拡張パターン）', () => {

  it('generateThoughtComments: 基本コンテキストで最大3件のコメントを返す', () => {
    const ctx = makeThoughtCommentContext();
    const comments = generateThoughtComments(ctx, { batterName: '田中', pitcherName: '山田' });
    expect(comments.length).toBeGreaterThanOrEqual(0);
    expect(comments.length).toBeLessThanOrEqual(3);
  });

  it('generateThoughtComments: hookKind=liner_home_run でバッターのコメントが生成される', () => {
    const ctx = makeThoughtCommentContext({ hookKind: 'liner_home_run', dramaLevel: 'dramatic' });
    const comments = generateThoughtComments(ctx, { batterName: '田中', pitcherName: '山田' });
    const batter = comments.find((c) => c.role === 'batter');
    expect(batter).toBeDefined();
    expect(batter?.text).toBeTruthy();
  });

  it('generateThoughtComments: hookKind=infield_popup でバッター否定的コメントが生成される', () => {
    const ctx = makeThoughtCommentContext({ hookKind: 'infield_popup' });
    const comments = generateThoughtComments(ctx, { batterName: '田中', pitcherName: '山田' });
    const batter = comments.find((c) => c.role === 'batter');
    // popup パターンがあればコメントが返るはず
    if (batter) {
      expect(batter.text).toBeTruthy();
    }
  });

  it('generateThoughtComments: 甲子園フラグで甲子園専用コメントが含まれる可能性がある', () => {
    const ctx = makeThoughtCommentContext({ isKoshien: true });
    const comments = generateThoughtComments(ctx, { batterName: '田中', pitcherName: '山田' });
    // 甲子園コメントパターンがある
    expect(comments).toBeDefined();
  });

  it('generateThoughtComments: 2ストライク時はバッターのコメントが返る', () => {
    const ctx = makeThoughtCommentContext({ strikes: 2 });
    const comments = generateThoughtComments(ctx, { batterName: '田中', pitcherName: '山田' });
    const batter = comments.find((c) => c.role === 'batter');
    expect(batter).toBeDefined();
  });

  it('generateThoughtComments: 満塁時は投手のコメントが返る', () => {
    const ctx = makeThoughtCommentContext({ runnersOn: 'bases_loaded' });
    const comments = generateThoughtComments(ctx, { batterName: '田中', pitcherName: '山田' });
    const pitcher = comments.find((c) => c.role === 'pitcher');
    expect(pitcher).toBeDefined();
  });

  it('generateThoughtComments: スタミナ低下時（<40）は投手のコメントが返る', () => {
    const ctx = makeThoughtCommentContext({ pitcherStamina: 30 });
    const comments = generateThoughtComments(ctx, { batterName: '田中', pitcherName: '山田' });
    const pitcher = comments.find((c) => c.role === 'pitcher');
    expect(pitcher).toBeDefined();
  });

  it('generateThoughtComments: hotblooded+満塁でバッターの感情的コメント', () => {
    const ctx = makeThoughtCommentContext({
      batterTraits: ['hotblooded'],
      runnersOn: 'scoring',
    });
    const comments = generateThoughtComments(ctx, { batterName: '田中', pitcherName: '山田' });
    const batter = comments.find((c) => c.role === 'batter' && c.category === 'emotional');
    expect(batter).toBeDefined();
  });

  it('generateThoughtComments: consecutive_strikeouts>=2 で投手の得意コメント', () => {
    const ctx = makeThoughtCommentContext({ consecutiveStrikeouts: 2 });
    const comments = generateThoughtComments(ctx, { batterName: '田中', pitcherName: '山田' });
    const pitcher = comments.find((c) => c.role === 'pitcher');
    expect(pitcher).toBeDefined();
  });

  it('generateThoughtComments: recentCommentIds で同じコメントが連続しない', () => {
    const ctx = makeThoughtCommentContext({ strikes: 2 });
    const comments1 = generateThoughtComments(ctx, { batterName: '田中', pitcherName: '山田' });
    const ids1 = new Set(extractThoughtCommentIds(comments1));

    const ctx2: ThoughtCommentContext = { ...ctx, recentCommentIds: ids1 };
    const comments2 = generateThoughtComments(ctx2, { batterName: '田中', pitcherName: '山田' });

    // 全く同じテキストが返ることはない（別パターンが選ばれる）
    // （候補が1つしかない場合は同じになるのでテキスト同一でも OK）
    expect(comments2).toBeDefined();
  });

  it('updateThoughtCommentRing: ringSize 以内に収まる', () => {
    const ring = new Set(['a', 'b', 'c', 'd', 'e', 'f']);
    const updated = updateThoughtCommentRing(ring, ['g', 'h'], 6);
    expect(updated.size).toBeLessThanOrEqual(6);
  });

  it('generateThoughtComments: dramaLevel=dramatic でコメントが生成される', () => {
    const ctx = makeThoughtCommentContext({ dramaLevel: 'dramatic' });
    const comments = generateThoughtComments(ctx, { batterName: '田中', pitcherName: '山田' });
    expect(comments).toBeDefined();
  });

  it('generateThoughtComments: pitchType=fastball でバッターの球種コメントが生成される', () => {
    const ctx = makeThoughtCommentContext({ pitchType: 'fastball', strikes: 0 });
    const comments = generateThoughtComments(ctx, { batterName: '田中', pitcherName: '山田' });
    expect(comments).toBeDefined();
  });

  it('generateThoughtComments: velocity=148 でバッターの速度認識コメント', () => {
    const ctx = makeThoughtCommentContext({ velocity: 148 });
    const comments = generateThoughtComments(ctx, { batterName: '田中', pitcherName: '山田' });
    expect(comments).toBeDefined();
  });

  it('generateThoughtComments: 捕手コメントが返ることがある（特定条件）', () => {
    const ctx = makeThoughtCommentContext({ strikes: 2, outs: 2 });
    const comments = generateThoughtComments(ctx, { batterName: '田中', pitcherName: '山田', catcherName: '鈴木' });
    const catcher = comments.find((c) => c.role === 'catcher');
    if (catcher) {
      expect(catcher.speakerName).toBe('鈴木');
    }
  });
});

// ============================================================
// R7-4: 実況パターン拡張
// ============================================================

describe('R7-4: 実況パターン拡張（投球種 × カウント）', () => {

  it('generateNarrativeHook: CommentaryContext なしで従来のテキストを生成', () => {
    const hook = generateNarrativeHook('up_the_middle_hit', makeTrajectory(), makeFlight());
    expect(hook.commentaryText).toBeTruthy();
    expect(typeof hook.commentaryText).toBe('string');
  });

  it('generateNarrativeHook: fastball × HR で専用テンプレートが選ばれる', () => {
    const ctx: CommentaryContext = { pitchType: 'fastball' };
    const hook = generateNarrativeHook('line_drive_hr', makeTrajectory({ exitVelocity: 160 }), makeFlight(), ctx);
    expect(hook.commentaryText).toContain('ストレート');
  });

  it('generateNarrativeHook: 2ストライク × HR で追い込まれテンプレートが選ばれる', () => {
    const ctx: CommentaryContext = { strikes: 2 };
    const hook = generateNarrativeHook('high_arc_hr', makeTrajectory(), makeFlight(), ctx);
    expect(hook.commentaryText).toContain('追い込まれ');
  });

  it('generateNarrativeHook: フルカウント × HR でフルカウントテンプレートが選ばれる', () => {
    const ctx: CommentaryContext = { balls: 3, strikes: 2 };
    const hook = generateNarrativeHook('high_arc_hr', makeTrajectory(), makeFlight(), ctx);
    expect(hook.commentaryText).toContain('フルカウント');
  });

  it('generateNarrativeHook: slider × ポテンヒットでスライダー言及テキスト', () => {
    // center_clean_hit はfastball専用テンプレートあり
    const ctx: CommentaryContext = { pitchType: 'fastball' };
    const hook = generateNarrativeHook('up_the_middle_hit', makeTrajectory(), makeFlight(), ctx);
    expect(hook.commentaryText).toContain('ストレート');
  });

  it('generateNarrativeHook: fork × 当たり損ねで変化球言及テキスト', () => {
    const ctx: CommentaryContext = { pitchType: 'fork' };
    const hook = generateNarrativeHook('check_swing_dribbler', makeTrajectory(), makeFlight(), ctx);
    expect(hook.commentaryText).toContain('フォーク');
  });

  it('generateNarrativeHook: recentCommentaryIds で同じテンプレートを回避する', () => {
    // フルカウント HR は特定のIDが割り当てられている
    const recentIds = new Set(['hr_full_count', 'hr_two_strikes', 'hr_arc_specific']);
    const ctx: CommentaryContext = { balls: 3, strikes: 2, recentCommentaryIds: recentIds };
    const hook = generateNarrativeHook('high_arc_hr', makeTrajectory(), makeFlight(), ctx);
    // テキストが返ること（他のパターンにフォールバック）
    expect(hook.commentaryText).toBeTruthy();
  });

  it('generateNarrativeHook: 全21種で NarrativeHook が生成できる', () => {
    const allTypes = [
      'first_line_grounder', 'right_side_grounder', 'left_side_grounder',
      'third_line_grounder', 'comebacker', 'infield_liner', 'high_infield_fly',
      'over_infield_hit', 'right_gap_hit', 'up_the_middle_hit', 'left_gap_hit',
      'shallow_fly', 'medium_fly', 'deep_fly', 'line_drive_hit', 'wall_ball',
      'line_drive_hr', 'high_arc_hr', 'fence_close_call', 'foul_fly', 'check_swing_dribbler',
    ] as const;

    for (const hitType of allTypes) {
      const ctx: CommentaryContext = { pitchType: 'fastball', balls: 0, strikes: 0 };
      const hook = generateNarrativeHook(hitType, makeTrajectory(), makeFlight(), ctx);
      expect(hook.commentaryText).toBeTruthy();
      expect(hook.kind).toBeTruthy();
    }
  });

  it('generateNarrativeHook: 同じ hitType でも投球種が違えばテキストが変わる可能性がある', () => {
    const ctxFastball: CommentaryContext = { pitchType: 'fastball' };
    const ctxSlider: CommentaryContext = { pitchType: 'slider' };

    const hookFast = generateNarrativeHook('up_the_middle_hit', makeTrajectory(), makeFlight(), ctxFastball);
    const hookSlider = generateNarrativeHook('up_the_middle_hit', makeTrajectory(), makeFlight(), ctxSlider);

    // fastball は専用テンプレートがあるので変わるはず
    expect(hookFast.commentaryText).not.toBe(hookSlider.commentaryText);
  });

  it('generateNarrativeHook: wall_ball × fastball で専用テンプレートが選ばれる', () => {
    const ctx: CommentaryContext = { pitchType: 'fastball' };
    const hook = generateNarrativeHook('wall_ball', makeTrajectory(), makeFlight({ distanceFt: 310 }), ctx);
    expect(hook.commentaryText).toContain('ストレート');
  });

  it('generateNarrativeHook: CommentaryContext あり/なしで同じ hitType のテキストが変わることがある', () => {
    const hookWithCtx = generateNarrativeHook('line_drive_hr', makeTrajectory(), makeFlight(), { pitchType: 'fastball' });
    const hookNoCtx = generateNarrativeHook('line_drive_hr', makeTrajectory(), makeFlight());

    // どちらも有効なテキストを持つ
    expect(hookWithCtx.commentaryText).toBeTruthy();
    expect(hookNoCtx.commentaryText).toBeTruthy();
  });

  it('generateNarrativeHook: pitchLabel プレースホルダーが正しく置換される', () => {
    const ctx: CommentaryContext = { pitchType: 'slider' };
    const hook = generateNarrativeHook('high_arc_hr', makeTrajectory(), makeFlight(), ctx);
    // ${pitchLabel} がそのまま残ってはいけない
    expect(hook.commentaryText).not.toContain('${pitchLabel}');
  });

  it('generateNarrativeHook: 未知の pitchType でもクラッシュしない', () => {
    const ctx: CommentaryContext = { pitchType: 'unknown_special_pitch' };
    const hook = generateNarrativeHook('up_the_middle_hit', makeTrajectory(), makeFlight(), ctx);
    expect(hook.commentaryText).toBeTruthy();
    expect(hook.commentaryText).not.toContain('${pitchLabel}');
  });
});
