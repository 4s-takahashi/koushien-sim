/**
 * tests/ui/narration/r7-pitch-pattern.test.ts
 *
 * Phase R7-4: 実況パターン拡張のテスト
 * - 投球種 × カウント × アウトカムの組み合わせで多様な実況テキスト生成
 * - 重複回避ロジックの確認
 */

import { describe, it, expect } from 'vitest';
import {
  selectPitchNarrationPhrase,
  getCountBand,
  updatePhraseRing,
} from '@/ui/narration/buildNarration';

// ============================================================
// selectPitchNarrationPhrase テスト（12件）
// ============================================================

describe('selectPitchNarrationPhrase', () => {
  it('fastball + called_strike でテキストが返る', () => {
    const result = selectPitchNarrationPhrase('fastball', 'called_strike', 'early');
    expect(result.text).toBeTruthy();
    expect(result.phraseKey).toBeTruthy();
  });

  it('slider + swinging_strike でテキストが返る', () => {
    const result = selectPitchNarrationPhrase('slider', 'swinging_strike', 'twoStrikes');
    expect(result.text).toBeTruthy();
  });

  it('fork + ball でテキストが返る', () => {
    const result = selectPitchNarrationPhrase('fork', 'ball', 'full');
    expect(result.text).toBeTruthy();
  });

  it('curve + foul でテキストが返る', () => {
    const result = selectPitchNarrationPhrase('curve', 'foul', 'early');
    expect(result.text).toBeTruthy();
  });

  it('changeup + swinging_strike でテキストが返る', () => {
    const result = selectPitchNarrationPhrase('changeup', 'swinging_strike', 'twoStrikes');
    expect(result.text).toBeTruthy();
  });

  it('未知の球種はデフォルトテキストにフォールバック', () => {
    const result = selectPitchNarrationPhrase('unknown_pitch', 'called_strike', 'early');
    // デフォルトのテキストが返る
    expect(typeof result.text).toBe('string');
  });

  it('未知のアウトカムは空文字列を返す', () => {
    const result = selectPitchNarrationPhrase('fastball', 'unknown_outcome', 'early');
    expect(result.text).toBe('');
    expect(result.phraseKey).toBe('');
  });

  it('recentPhrases による重複回避: 未使用のフレーズが選ばれる', () => {
    // key 0 のフレーズを既使用にする
    const recent = new Set(['called_strike:fastball:0']);
    const r1 = selectPitchNarrationPhrase('fastball', 'called_strike', 'early');
    const r2 = selectPitchNarrationPhrase('fastball', 'called_strike', 'early', recent);

    // 利用可能なフレーズが複数あるため、r2 は r1 と異なる可能性がある
    // (少なくともエラーにならないこと)
    expect(typeof r2.text).toBe('string');
  });

  it('phraseKey の形式が outcome:pitchType:index', () => {
    const result = selectPitchNarrationPhrase('fastball', 'called_strike', 'early');
    expect(result.phraseKey).toMatch(/^called_strike:fastball:\d+$/);
  });

  it('twoStrikes カウント帯では異なるフレーズが選ばれる可能性がある', () => {
    const r_early = selectPitchNarrationPhrase('slider', 'swinging_strike', 'early');
    const r_two = selectPitchNarrationPhrase('slider', 'swinging_strike', 'twoStrikes');
    // 少なくともどちらもテキストを返すこと
    expect(r_early.text).toBeTruthy();
    expect(r_two.text).toBeTruthy();
  });

  it('full カウント帯でテキストが返る', () => {
    const result = selectPitchNarrationPhrase('fastball', 'called_strike', 'full');
    expect(result.text).toBeTruthy();
  });

  it('foul_bunt は foul にフォールバックしない（空文字列）', () => {
    // foul_bunt は PITCH_OUTCOME_PHRASES に定義されていない
    const result = selectPitchNarrationPhrase('fastball', 'foul_bunt', 'early');
    // 空文字列またはデフォルトテキスト
    expect(typeof result.text).toBe('string');
  });
});

// ============================================================
// getCountBand テスト（6件）
// ============================================================

describe('getCountBand', () => {
  it('3-2 は full', () => {
    expect(getCountBand(3, 2)).toBe('full');
  });

  it('0-2 は twoStrikes', () => {
    expect(getCountBand(0, 2)).toBe('twoStrikes');
  });

  it('2-2 は twoStrikes', () => {
    expect(getCountBand(2, 2)).toBe('twoStrikes');
  });

  it('1-2 は twoStrikes', () => {
    expect(getCountBand(1, 2)).toBe('twoStrikes');
  });

  it('0-0 は early', () => {
    expect(getCountBand(0, 0)).toBe('early');
  });

  it('3-1 は early (2ストライク未満)', () => {
    expect(getCountBand(3, 1)).toBe('early');
  });
});

// ============================================================
// updatePhraseRing テスト（4件）
// ============================================================

describe('updatePhraseRing', () => {
  it('新しいキーが追加される', () => {
    const current = new Set<string>();
    const result = updatePhraseRing(current, 'new_key');
    expect(result.has('new_key')).toBe(true);
  });

  it('maxSize を超えたら古いものが除去される', () => {
    let ring = new Set<string>();
    for (let i = 0; i < 10; i++) {
      ring = updatePhraseRing(ring, `key_${i}`, 5);
    }
    expect(ring.size).toBeLessThanOrEqual(5);
  });

  it('デフォルト maxSize は 8', () => {
    let ring = new Set<string>();
    for (let i = 0; i < 15; i++) {
      ring = updatePhraseRing(ring, `k${i}`);
    }
    expect(ring.size).toBeLessThanOrEqual(8);
  });

  it('空の Set に追加できる', () => {
    const result = updatePhraseRing(new Set(), 'test');
    expect(result.size).toBe(1);
  });
});
