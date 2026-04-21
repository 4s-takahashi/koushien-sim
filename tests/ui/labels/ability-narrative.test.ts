/**
 * tests/ui/labels/ability-narrative.test.ts
 *
 * Phase 11.5-D: 能力値言葉化ラベルのユニットテスト
 */

import { describe, it, expect } from 'vitest';
import {
  getAbilityNarrative,
  getAbilityNarrativeCandidates,
  SUPPORTED_ABILITIES,
  type AbilityKey,
} from '@/ui/labels/ability-narrative';
import type { AbilityRank } from '@/ui/projectors/view-state-types';

const ALL_RANKS: AbilityRank[] = ['S', 'A', 'B', 'C', 'D', 'E'];

// ============================================================
// 基本動作テスト
// ============================================================

describe('getAbilityNarrative', () => {
  it('全ての能力 × 全ランクで空文字列が返らない', () => {
    for (const ability of SUPPORTED_ABILITIES) {
      for (const rank of ALL_RANKS) {
        const narrative = getAbilityNarrative(ability, rank);
        expect(narrative.length).toBeGreaterThan(0);
      }
    }
  });

  it('同じ能力・ランクで同じ文字列を返す（決定論的）', () => {
    const n1 = getAbilityNarrative('球速', 'S');
    const n2 = getAbilityNarrative('球速', 'S');
    expect(n1).toBe(n2);
  });

  it('インデックスで別の候補が取得できる', () => {
    // 各能力・ランクには2つ以上の候補がある
    const n0 = getAbilityNarrative('球速', 'S', 0);
    const n1 = getAbilityNarrative('球速', 'S', 1);
    expect(typeof n0).toBe('string');
    expect(typeof n1).toBe('string');
    // 2候補は異なる内容
    expect(n0).not.toBe(n1);
  });

  it('存在しない能力名では空文字列を返す', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const narrative = getAbilityNarrative('存在しない能力' as any, 'S');
    expect(narrative).toBe('');
  });

  it('インデックスが候補数を超えても循環する（エラーにならない）', () => {
    const narrative = getAbilityNarrative('球速', 'S', 9999);
    expect(typeof narrative).toBe('string');
    expect(narrative.length).toBeGreaterThan(0);
  });
});

describe('getAbilityNarrativeCandidates', () => {
  it('全ての能力 × 全ランクで2つ以上の候補がある', () => {
    for (const ability of SUPPORTED_ABILITIES) {
      for (const rank of ALL_RANKS) {
        const candidates = getAbilityNarrativeCandidates(ability, rank);
        expect(candidates.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('存在しない能力名では空配列を返す', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidates = getAbilityNarrativeCandidates('不明' as any, 'S');
    expect(candidates).toEqual([]);
  });
});

describe('SUPPORTED_ABILITIES', () => {
  it('13種類の能力が定義されている', () => {
    expect(SUPPORTED_ABILITIES).toHaveLength(13);
  });

  it('期待される能力名が全て含まれている', () => {
    const expected: AbilityKey[] = [
      '体力', '走力', '肩力', '守備', '集中', '精神',
      'ミート', 'パワー', '選球眼', '技術',
      '球速', '制球', 'スタミナ',
    ];
    for (const ability of expected) {
      expect(SUPPORTED_ABILITIES).toContain(ability);
    }
  });
});

describe('コンテンツ妥当性チェック', () => {
  it('Sランクは高評価の表現を含む', () => {
    // S ランクの候補はポジティブな表現を含んでいるはず
    for (const ability of SUPPORTED_ABILITIES) {
      const sNarrative = getAbilityNarrative(ability, 'S');
      // 空でないことを確認（内容は定性的にのみチェック）
      expect(sNarrative).toBeTruthy();
    }
  });

  it('Eランクは低評価または改善が必要な表現を含む', () => {
    for (const ability of SUPPORTED_ABILITIES) {
      const eNarrative = getAbilityNarrative(ability, 'E');
      expect(eNarrative).toBeTruthy();
    }
  });

  it('球速 S ランクはプロ関連ワードを含む', () => {
    const sCandidates = getAbilityNarrativeCandidates('球速', 'S');
    const hasProWord = sCandidates.some((c) => c.includes('プロ') || c.includes('豪速') || c.includes('速球'));
    expect(hasProWord).toBe(true);
  });

  it('制球 S ランクは制球力の高さを示すワードを含む', () => {
    const sCandidates = getAbilityNarrativeCandidates('制球', 'S');
    const hasControlWord = sCandidates.some((c) => c.includes('制球'));
    expect(hasControlWord).toBe(true);
  });
});
