/**
 * grade-labels.ts — 学年・グレード → 日本語ラベル
 */

export const GRADE_LABELS: Record<1 | 2 | 3, string> = {
  1: '1年',
  2: '2年',
  3: '3年',
};

export const GROWTH_TYPE_LABELS: Record<string, string> = {
  early:  '早熟型',
  normal: '標準型',
  late:   '晩成型',
  genius: '天才型',
};
