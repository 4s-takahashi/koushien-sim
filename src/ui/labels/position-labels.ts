/**
 * position-labels.ts — ポジションID → 日本語ラベル
 *
 * engine/types/player.ts の Position 型に対応。
 */

import type { Position } from '../../engine/types/player';

export const POSITION_LABELS: Record<Position, string> = {
  pitcher:   '投手',
  catcher:   '捕手',
  first:     '一塁手',
  second:    '二塁手',
  third:     '三塁手',
  shortstop: '遊撃手',
  left:      '左翼手',
  center:    '中堅手',
  right:     '右翼手',
};
