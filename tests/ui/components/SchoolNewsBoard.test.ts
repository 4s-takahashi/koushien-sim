/**
 * tests/ui/components/SchoolNewsBoard.test.ts
 * Phase S1-C C2-test1: 自校ニュース枠テスト
 *
 * SchoolNewsBoard の表示ロジック（school-news.ts）の単体テスト
 * - 30件表示・日付ソート・ジャンルアイコン確認
 */

import { describe, it, expect } from 'vitest';
import {
  growthEventToSchoolNews,
  buildSchoolNewsList,
  sortAndLimitNews,
  getGenreIcon,
} from '../../../src/engine/news/school-news';
import type { SchoolNewsItem } from '../../../src/engine/news/school-news';
import type { GrowthEvent } from '../../../src/engine/types/growth';

// ============================================================
// テストヘルパー
// ============================================================

function makeGrowthEvent(overrides: Partial<GrowthEvent> = {}): GrowthEvent {
  return {
    id: 'ge-test-1',
    playerId: 'p1',
    date: { year: 1, month: 5, day: 10 },
    type: 'breakthrough',
    description: '田中太郎の調子が一段と上がった！',
    effects: [{ statPath: 'batting.contact', delta: 2 }],
    ...overrides,
  };
}

// ============================================================
// C2-test1: 30件表示・日付ソート・ジャンルアイコン
// ============================================================

describe('C2-test1: SchoolNewsBoard 表示ロジック', () => {
  it('growthEventToSchoolNews が SchoolNewsItem に変換できる', () => {
    const event = makeGrowthEvent({ type: 'pitch_acquired', description: '田中がカーブを習得した！' });
    const item = growthEventToSchoolNews(event);

    expect(item.id).toBe(`news-${event.id}`);
    expect(item.headline).toBe('田中がカーブを習得した！');
    expect(item.genre).toBe('growth');
    expect(item.icon).toBeTruthy();
    expect(item.playerId).toBe('p1');
    expect(item.date).toEqual(event.date);
  });

  it('各イベント種別が正しいジャンルに変換される', () => {
    const cases: Array<{ type: GrowthEvent['type']; expectedGenre: string }> = [
      { type: 'pitch_acquired', expectedGenre: 'growth' },
      { type: 'opposite_field', expectedGenre: 'growth' },
      { type: 'breakthrough', expectedGenre: 'growth' },
      { type: 'injury_recover', expectedGenre: 'injury' },
      { type: 'mental_shift', expectedGenre: 'mental' },
    ];

    for (const c of cases) {
      const event = makeGrowthEvent({ type: c.type });
      const item = growthEventToSchoolNews(event);
      expect(item.genre, `type=${c.type}`).toBe(c.expectedGenre);
    }
  });

  it('getGenreIcon が各ジャンルに対してアイコン文字列を返す', () => {
    const genres = ['growth', 'record', 'injury', 'mental', 'general'] as const;
    for (const genre of genres) {
      const icon = getGenreIcon(genre);
      expect(icon, `genre=${genre}`).toBeTruthy();
      expect(typeof icon).toBe('string');
    }
  });

  it('sortAndLimitNews で日付降順（新しい順）にソートされる', () => {
    const items: SchoolNewsItem[] = [
      { id: 'n1', date: { year: 1, month: 4, day: 1 }, genre: 'growth', icon: '⭐', headline: '古いニュース' },
      { id: 'n2', date: { year: 1, month: 6, day: 15 }, genre: 'growth', icon: '⭐', headline: '新しいニュース' },
      { id: 'n3', date: { year: 1, month: 5, day: 10 }, genre: 'mental', icon: '💪', headline: '中くらい' },
    ];

    const sorted = sortAndLimitNews(items);
    expect(sorted[0].id).toBe('n2'); // 最新
    expect(sorted[1].id).toBe('n3'); // 中間
    expect(sorted[2].id).toBe('n1'); // 最古
  });

  it('buildSchoolNewsList が最大30件に絞る', () => {
    // 35件のイベントを作成
    const events: GrowthEvent[] = Array.from({ length: 35 }, (_, i) =>
      makeGrowthEvent({
        id: `ge-${i}`,
        playerId: `p${i}`,
        date: { year: 1, month: 5, day: 1 + (i % 28) },
        description: `テストイベント${i}`,
      })
    );

    const items = buildSchoolNewsList(events, 30);
    expect(items.length).toBe(30);
  });

  it('buildSchoolNewsList でアイテムが日付降順にソートされる', () => {
    const events: GrowthEvent[] = [
      makeGrowthEvent({ id: 'old', date: { year: 1, month: 4, day: 1 }, description: '古い' }),
      makeGrowthEvent({ id: 'new', date: { year: 1, month: 7, day: 20 }, description: '新しい' }),
      makeGrowthEvent({ id: 'mid', date: { year: 1, month: 6, day: 10 }, description: '中間' }),
    ];

    const items = buildSchoolNewsList(events);
    expect(items[0].sourceEventId).toBe('new');
    expect(items[1].sourceEventId).toBe('mid');
    expect(items[2].sourceEventId).toBe('old');
  });

  it('buildSchoolNewsList が空リストで空配列を返す', () => {
    const items = buildSchoolNewsList([]);
    expect(items).toEqual([]);
  });

  it('各アイテムに icon フィールドが設定されている', () => {
    const events: GrowthEvent[] = Array.from({ length: 5 }, (_, i) =>
      makeGrowthEvent({
        id: `ge-${i}`,
        type: ['pitch_acquired', 'opposite_field', 'breakthrough', 'injury_recover', 'mental_shift'][i] as GrowthEvent['type'],
      })
    );

    const items = buildSchoolNewsList(events);
    for (const item of items) {
      expect(item.icon).toBeTruthy();
      expect(typeof item.icon).toBe('string');
      expect(item.icon.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// C2-test2: C3 イベント → 自校ニュース投稿確認（統合）
// ============================================================

describe('C2-test2: C3イベント → 自校ニュース統合', () => {
  it('GrowthEvent を eventLog に追加すると buildSchoolNewsList でニュースが生成される', () => {
    const eventLog: GrowthEvent[] = [
      makeGrowthEvent({ id: 'growth-1', type: 'pitch_acquired', description: '田中がスライダーを習得！' }),
      makeGrowthEvent({ id: 'growth-2', type: 'mental_shift', description: '鈴木がプレッシャーに強くなった！' }),
    ];

    const items = buildSchoolNewsList(eventLog);
    expect(items.length).toBe(2);

    const pitchNews = items.find((i) => i.sourceEventId === 'growth-1');
    expect(pitchNews).toBeDefined();
    expect(pitchNews!.headline).toContain('スライダーを習得');
    expect(pitchNews!.genre).toBe('growth');
    expect(pitchNews!.icon).toBe('⭐');

    const mentalNews = items.find((i) => i.sourceEventId === 'growth-2');
    expect(mentalNews).toBeDefined();
    expect(mentalNews!.genre).toBe('mental');
    expect(mentalNews!.icon).toBe('💪');
  });
});
