/**
 * trait-labels.ts — 特性ID → 日本語ラベル
 *
 * すべての TraitId に対応する日本語表示名を定義。
 * 各 projector からはこのファイルから import して使う。
 */

import type { TraitId } from '../../engine/types/player';

export const TRAIT_LABELS: Record<TraitId, string> = {
  // 既存の24特性
  passionate:      '情熱家',
  calm:            '冷静沈着',
  easygoing:       'のんびり屋',
  sensitive:       '繊細',
  bold:            '大胆',
  leader:          'リーダー',
  morale_booster:  'ムードメーカー',
  lone_wolf:       '一匹狼',
  shy:             '内気',
  hard_worker:     '努力家',
  natural_talent:  '天才型',
  strategist:      '戦略家',
  competitive:     '負けず嫌い',
  fun_lover:       '楽天家',
  short_tempered:  '短気',
  slacker:         '怠け者',
  overconfident:   '自信過剰',
  self_doubt:      '自信喪失',
  rebellious:      '反骨心',
  responsible:     '責任感',
  caring:          '面倒見がいい',
  gritty:          '根性',
  honest:          '誠実',
  ambitious:       '野心家',
  // Phase 7-D: 心理特性10種 (2026-04-20)
  hotblooded:      '熱血',
  stoic:           '冷静',
  cautious:        '慎重',
  stubborn:        '頑固',
  clutch_hitter:   '勝負師',
  scatterbrained:  '混乱しやすい',
  big_game_player: '大舞台',
  steady:          '地味',
  timid:           'ビビリ',
  ace:             'エース',
};
