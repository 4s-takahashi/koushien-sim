/**
 * pitch-labels.ts — 球種ID → 日本語ラベル
 *
 * PitchType（engine/types/player.ts）および matchProjector で使われる
 * 'fastball' も含めた全球種を網羅する。
 */

export const PITCH_LABELS: Record<string, string> = {
  // engine/types/player.ts の PitchType
  curve:     'カーブ',
  slider:    'スライダー',
  fork:      'フォーク',
  changeup:  'チェンジアップ',
  cutter:    'カットボール',
  sinker:    'シンカー',
  // 試合画面・実況で使われる追加球種
  fastball:  'ストレート',
  curveball: 'カーブ',
  splitter:  'スプリット',
};
