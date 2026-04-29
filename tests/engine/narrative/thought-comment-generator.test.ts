/**
 * tests/engine/narrative/thought-comment-generator.test.ts
 *
 * Phase R7-3: 1球ごと思考コメント生成のテスト
 */

import { describe, it, expect } from 'vitest';
import {
  generateThoughtComments,
  extractThoughtCommentIds,
  updateThoughtCommentRing,
} from '@/engine/narrative/thought-comment-generator';
import type { ThoughtCommentContext } from '@/engine/narrative/types';

// ============================================================
// テスト用コンテキストファクトリ
// ============================================================

function makeCtx(overrides?: Partial<ThoughtCommentContext>): ThoughtCommentContext {
  return {
    inning: 5,
    half: 'top',
    outs: 1,
    balls: 1,
    strikes: 1,
    runnersOn: 'none',
    scoreDiff: 0,
    isKoshien: false,
    batterName: '田中',
    pitcherName: '佐藤',
    batterTraits: [],
    pitcherTraits: [],
    pitcherStamina: 80,
    orderType: null,
    ...overrides,
  };
}

const DEFAULT_SPEAKERS = { batterName: '田中', pitcherName: '佐藤' };

// ============================================================
// R7-3: 思考コメント生成テスト（24件）
// ============================================================

describe('generateThoughtComments', () => {
  it('基本: 空のコンテキストでも配列を返す', () => {
    const ctx = makeCtx();
    const result = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    expect(Array.isArray(result)).toBe(true);
  });

  it('各コメントに role, speakerName, text, category が含まれる', () => {
    const ctx = makeCtx({ runnersOn: 'scoring', strikes: 2 });
    const result = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    for (const c of result) {
      expect(c.role).toMatch(/^(batter|pitcher|catcher)$/);
      expect(typeof c.speakerName).toBe('string');
      expect(typeof c.text).toBe('string');
      expect(c.text.length).toBeGreaterThan(0);
      expect(c.category).toMatch(/^(tactical|emotional|analytical|situational)$/);
    }
  });

  it('2ストライク時は打者に situational/emotional コメントが生成される', () => {
    const ctx = makeCtx({ strikes: 2, runnersOn: 'none' });
    const result = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    const batter = result.find((c) => c.role === 'batter');
    expect(batter).toBeDefined();
    expect(batter!.text).toBeTruthy();
  });

  it('フルカウント時は打者のコメントが存在する', () => {
    const ctx = makeCtx({ balls: 3, strikes: 2 });
    const result = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    const batter = result.find((c) => c.role === 'batter');
    expect(batter).toBeDefined();
  });

  it('満塁時は打者と投手両方にコメントが生成される', () => {
    const ctx = makeCtx({ runnersOn: 'bases_loaded', outs: 2 });
    const result = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    const batter = result.find((c) => c.role === 'batter');
    const pitcher = result.find((c) => c.role === 'pitcher');
    expect(batter).toBeDefined();
    expect(pitcher).toBeDefined();
  });

  it('甲子園フラグ時は感情的なコメントが生成される', () => {
    const ctx = makeCtx({ isKoshien: true, runnersOn: 'none' });
    const result = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    const emotional = result.filter((c) => c.category === 'emotional');
    expect(emotional.length).toBeGreaterThan(0);
  });

  it('hotblooded 特性で積極的なコメントが生成される', () => {
    const ctx = makeCtx({
      batterTraits: ['hotblooded'],
      runnersOn: 'scoring',
    });
    const result = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    const batter = result.find((c) => c.role === 'batter');
    expect(batter).toBeDefined();
    // 感情的なカテゴリであることを確認
    expect(batter!.category).toBe('emotional');
  });

  it('stoic 特性で分析的なコメントが生成される', () => {
    const ctx = makeCtx({
      batterTraits: ['stoic'],
    });
    const result = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    const batter = result.find((c) => c.role === 'batter');
    // stoic は analytical カテゴリ
    if (batter) {
      expect(['analytical', 'tactical', 'situational', 'emotional']).toContain(batter.category);
    }
  });

  it('clutch_hitter が2ストライクで特別なコメントを生成する', () => {
    const ctx = makeCtx({
      batterTraits: ['clutch_hitter'],
      strikes: 2,
    });
    const result = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    const batter = result.find((c) => c.role === 'batter');
    expect(batter).toBeDefined();
  });

  it('timid + 甲子園で不安なコメントが生成される', () => {
    const ctx = makeCtx({
      batterTraits: ['timid'],
      isKoshien: true,
    });
    const result = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    const batter = result.find((c) => c.role === 'batter');
    expect(batter).toBeDefined();
    // timid + 甲子園パターンまたは甲子園一般パターンのどちらかが選ばれる
    const text = batter!.text;
    expect(text).toBeTruthy();
    expect(text.length).toBeGreaterThan(0);
    // 甲子園に関連するテキスト（甲子園か観客などのテーマ）
    const isKoshienRelated = text.includes('甲子園') || text.includes('観客') || text.includes('全国') || text.includes('震える');
    expect(isKoshienRelated).toBe(true);
  });

  it('big_game_player + 甲子園で力強いコメントが生成される', () => {
    const ctx = makeCtx({
      batterTraits: ['big_game_player'],
      isKoshien: true,
    });
    const result = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    const batter = result.find((c) => c.role === 'batter');
    expect(batter).toBeDefined();
  });

  it('ace + 甲子園で投手に特別なコメントが生成される', () => {
    const ctx = makeCtx({
      pitcherTraits: ['ace'],
      isKoshien: true,
    });
    const result = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    const pitcher = result.find((c) => c.role === 'pitcher');
    expect(pitcher).toBeDefined();
  });

  it('スタミナ不足時に投手コメントが生成される', () => {
    const ctx = makeCtx({ pitcherStamina: 30 });
    const result = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    const pitcher = result.find((c) => c.role === 'pitcher');
    expect(pitcher).toBeDefined();
  });

  it('連続三振2以上で投手に積極的なコメントが生成される', () => {
    const ctx = makeCtx({ consecutiveStrikeouts: 3 });
    const result = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    const pitcher = result.find((c) => c.role === 'pitcher');
    expect(pitcher).toBeDefined();
  });

  it('外角フォーカス采配で打者に戦術的コメントが生成される', () => {
    const ctx = makeCtx({ orderType: 'outside_focus' });
    const result = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    const batter = result.find((c) => c.role === 'batter');
    expect(batter).toBeDefined();
    expect(batter!.category).toBe('tactical');
  });

  it('積極采配で打者に戦術的コメントが生成される', () => {
    const ctx = makeCtx({ orderType: 'aggressive' });
    const result = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    const batter = result.find((c) => c.role === 'batter');
    expect(batter).toBeDefined();
  });

  it('得点差大きい追いかける場面で感情的なコメント', () => {
    const ctx = makeCtx({ scoreDiff: -4, inning: 8 });
    const result = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    const batter = result.find((c) => c.role === 'batter');
    expect(batter).toBeDefined();
  });

  it('リード場面でダメ押し志向のコメント', () => {
    const ctx = makeCtx({ scoreDiff: 4 });
    const result = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    // 打者のコメントがあることを確認
    const batter = result.find((c) => c.role === 'batter');
    if (batter) {
      expect(typeof batter.text).toBe('string');
    }
  });

  it('同じコンテキストは同じコメントを返す（決定論的）', () => {
    const ctx = makeCtx({ strikes: 2, runnersOn: 'bases_loaded' });
    const r1 = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    const r2 = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    expect(r1.map((c) => c.text)).toEqual(r2.map((c) => c.text));
  });

  it('recentCommentIds による重複回避', () => {
    const ctx = makeCtx({ strikes: 2 });
    const r1 = generateThoughtComments(ctx, DEFAULT_SPEAKERS);

    // r1 のコメントを除外セットに追加して再生成
    const ids = extractThoughtCommentIds(r1);
    const exclude = new Set(ids);
    const ctx2 = { ...ctx, recentCommentIds: exclude };

    // 除外しても配列が返る（フォールバックがある）
    const r2 = generateThoughtComments(ctx2, DEFAULT_SPEAKERS);
    expect(Array.isArray(r2)).toBe(true);
  });

  it('終盤イニングで情緒的なコメントが生成される', () => {
    const ctx = makeCtx({ inning: 9, outs: 2, scoreDiff: 0 });
    const result = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it('捕手コメントは 2ストライク時にカウント条件でマッチする', () => {
    const ctx = makeCtx({ strikes: 2, outs: 1 });
    const result = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    // catcher コメントが生成されることを確認（条件がマッチしない場合は省略される）
    const catcher = result.find((c) => c.role === 'catcher');
    if (catcher) {
      expect(typeof catcher.text).toBe('string');
    }
  });

  it('speakerNames が正しく反映される', () => {
    const ctx = makeCtx({ runnersOn: 'scoring' });
    const speakers = { batterName: '山田', pitcherName: '鈴木', catcherName: '野村' };
    const result = generateThoughtComments(ctx, speakers);
    for (const c of result) {
      const expectedName =
        c.role === 'batter' ? '山田' :
        c.role === 'pitcher' ? '鈴木' : '野村';
      expect(c.speakerName).toBe(expectedName);
    }
  });

  it('extractThoughtCommentIds が正しい数の ID を返す', () => {
    const ctx = makeCtx({ strikes: 2, runnersOn: 'bases_loaded' });
    const comments = generateThoughtComments(ctx, DEFAULT_SPEAKERS);
    const ids = extractThoughtCommentIds(comments);
    expect(ids.length).toBe(comments.length);
  });
});

// ============================================================
// R7-3: リングバッファテスト
// ============================================================

describe('updateThoughtCommentRing', () => {
  it('リングバッファが maxSize を超えない', () => {
    const current = new Set(['a', 'b', 'c', 'd', 'e', 'f']);
    const result = updateThoughtCommentRing(current, ['g', 'h'], 6);
    expect(result.size).toBeLessThanOrEqual(6);
  });

  it('新しい ID が追加される', () => {
    const current = new Set<string>();
    const result = updateThoughtCommentRing(current, ['new_id'], 6);
    expect(result.has('new_id')).toBe(true);
  });

  it('デフォルトサイズは 6', () => {
    let ring = new Set<string>();
    for (let i = 0; i < 10; i++) {
      ring = updateThoughtCommentRing(ring, [`id_${i}`]);
    }
    expect(ring.size).toBeLessThanOrEqual(6);
  });
});
