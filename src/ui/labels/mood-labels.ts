/**
 * mood-labels.ts — Mood → 日本語ラベル
 *
 * engine/types/player.ts の Mood 型に対応。
 */

import type { Mood } from '../../engine/types/player';

export const MOOD_LABELS: Record<Mood, string> = {
  excellent: '絶好調',
  good:      '好調',
  normal:    '普通',
  poor:      '不調',
  terrible:  '最悪',
};
