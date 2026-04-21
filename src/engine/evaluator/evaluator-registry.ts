/**
 * evaluator-registry.ts — 評価者データレジストリ (Phase 11.5-C)
 *
 * 24名の評価者データ定義。
 * メディア (8名) / 評論家 (8名) / スカウト (8名)
 */

import type { Evaluator } from '../types/evaluator';

export const EVALUATOR_REGISTRY: Evaluator[] = [
  // ============================================================
  // メディア (media) — 8名
  // ============================================================
  {
    id: 'media_001',
    name: '木村 健太',
    type: 'media',
    affiliation: '高校野球週刊',
    focus: 'pitcher_overall',
    bias: {
      generalBias: 0,
      positionBias: { pitcher: 10 },
      thresholdBonuses: [{ stat: 'pitching.velocity', threshold: 80, bonus: 8 }],
    },
    description: '投手専門ライター。球速に強い拘りを持つ。',
  },
  {
    id: 'media_002',
    name: '田中 真一',
    type: 'media',
    affiliation: 'スポーツ報知（仮）',
    focus: 'batter_overall',
    bias: {
      generalBias: 0.5,
      positionBias: { pitcher: -5 },
    },
    description: '打者贔屓のベテラン記者。大物感を重視。',
  },
  {
    id: 'media_003',
    name: '佐藤 由美',
    type: 'media',
    affiliation: '野球タイムズ',
    focus: 'batter_power',
    bias: {
      generalBias: 0,
      thresholdBonuses: [{ stat: 'batting.power', threshold: 70, bonus: 10 }],
    },
    description: '長距離打者を愛するコラムニスト。',
  },
  {
    id: 'media_004',
    name: '中村 修平',
    type: 'media',
    affiliation: '高校野球ファン',
    focus: 'mental_focus',
    bias: {
      generalBias: -0.5,
      thresholdBonuses: [{ stat: 'base.mental', threshold: 75, bonus: 12 }],
    },
    description: '精神面を最重視する論客。浮き沈みが激しい選手は評価しない。',
  },
  {
    id: 'media_005',
    name: '渡辺 浩二',
    type: 'media',
    affiliation: 'ベースボールマガジン',
    focus: 'defense_fielding',
    bias: {
      generalBias: 0,
      positionBias: { shortstop: 8, second: 6, third: 4 },
      thresholdBonuses: [{ stat: 'base.fielding', threshold: 70, bonus: 8 }],
    },
    description: '守備の職人を愛する守備マニア記者。',
  },
  {
    id: 'media_006',
    name: '伊藤 健三',
    type: 'media',
    affiliation: '地方野球新聞',
    focus: 'speed_running',
    bias: {
      generalBias: 0,
      thresholdBonuses: [{ stat: 'base.speed', threshold: 75, bonus: 10 }],
    },
    description: '俊足選手が大好きな足専門ライター。',
  },
  {
    id: 'media_007',
    name: '加藤 美里',
    type: 'media',
    affiliation: '全国高校野球速報',
    focus: 'koshien_record',
    bias: {
      generalBias: 1.0,
    },
    description: '甲子園出場校の選手を高く評価する傾向。',
  },
  {
    id: 'media_008',
    name: '松本 誠',
    type: 'media',
    affiliation: '野球データラボ',
    focus: 'pitcher_control',
    bias: {
      generalBias: -0.5,
      thresholdBonuses: [{ stat: 'pitching.control', threshold: 80, bonus: 15 }],
    },
    description: 'データ主義の制球重視ライター。球速より制球を評価。',
  },

  // ============================================================
  // 評論家 (critic) — 8名
  // ============================================================
  {
    id: 'critic_001',
    name: '高橋 一夫',
    type: 'critic',
    affiliation: '野球評論家',
    focus: 'pitcher_overall',
    bias: {
      generalBias: -1.0,
      thresholdBonuses: [
        { stat: 'pitching.velocity', threshold: 85, bonus: 20 },
        { stat: 'pitching.control', threshold: 80, bonus: 10 },
      ],
    },
    description: '辛口で知られる元プロ。基準が高く滅多に褒めない。',
  },
  {
    id: 'critic_002',
    name: '林 正夫',
    type: 'critic',
    affiliation: '技術評論家',
    focus: 'batter_contact',
    bias: {
      generalBias: 0,
      thresholdBonuses: [{ stat: 'batting.contact', threshold: 75, bonus: 15 }],
    },
    description: 'ミートを最重視。パワーより技術を評価する。',
  },
  {
    id: 'critic_003',
    name: '小林 龍太',
    type: 'critic',
    affiliation: '育成論評家',
    focus: 'stamina',
    bias: {
      generalBias: 0,
      thresholdBonuses: [{ stat: 'base.stamina', threshold: 80, bonus: 12 }],
    },
    description: '選手の体力・継続性を最重視。スタミナが高い選手を高く評価。',
  },
  {
    id: 'critic_004',
    name: '山口 勝己',
    type: 'critic',
    affiliation: '守備評論家',
    focus: 'defense_fielding',
    bias: {
      generalBias: 0,
      positionBias: { catcher: 10 },
      thresholdBonuses: [{ stat: 'base.fielding', threshold: 80, bonus: 20 }],
    },
    description: '捕手と守備を愛する元内野手評論家。',
  },
  {
    id: 'critic_005',
    name: '岡田 勇',
    type: 'critic',
    affiliation: '打撃理論家',
    focus: 'batter_power',
    bias: {
      generalBias: 1.0,
      thresholdBonuses: [{ stat: 'batting.power', threshold: 80, bonus: 15 }],
    },
    description: '豪快な打者を好む元四番打者評論家。',
  },
  {
    id: 'critic_006',
    name: '清水 孝之',
    type: 'critic',
    affiliation: '変化球研究家',
    focus: 'breaking_ball',
    bias: {
      generalBias: 0,
      positionBias: { pitcher: 15 },
    },
    description: '変化球の種類と精度にこだわる専門家。',
  },
  {
    id: 'critic_007',
    name: '村田 真也',
    type: 'critic',
    affiliation: '精神面専門家',
    focus: 'mental_focus',
    bias: {
      generalBias: 0,
      thresholdBonuses: [
        { stat: 'base.mental', threshold: 70, bonus: 10 },
        { stat: 'base.focus', threshold: 70, bonus: 10 },
      ],
    },
    description: 'スポーツ心理学が専門の評論家。メンタルを重視。',
  },
  {
    id: 'critic_008',
    name: '福島 大介',
    type: 'critic',
    affiliation: '投手育成論者',
    focus: 'pitcher_velocity',
    bias: {
      generalBias: 0,
      thresholdBonuses: [{ stat: 'pitching.velocity', threshold: 90, bonus: 25 }],
    },
    description: '速球派投手を至上とする元スピードスター。',
  },

  // ============================================================
  // スカウト (scout) — 8名
  // ============================================================
  {
    id: 'scout_001',
    name: '大島 誠司',
    type: 'scout',
    affiliation: 'プロ球団A スカウト部',
    focus: 'pitcher_overall',
    bias: {
      generalBias: -0.5,
      thresholdBonuses: [
        { stat: 'pitching.velocity', threshold: 85, bonus: 15 },
        { stat: 'pitching.pitchStamina', threshold: 75, bonus: 10 },
      ],
    },
    description: 'ドラフト上位狙いの投手スカウト。ポテンシャル重視。',
  },
  {
    id: 'scout_002',
    name: '藤井 康弘',
    type: 'scout',
    affiliation: 'プロ球団B スカウト部',
    focus: 'batter_overall',
    bias: {
      generalBias: 0,
      positionBias: { pitcher: -10, catcher: 5 },
    },
    description: '中軸打者専門スカウト。長打力と選球眼を評価。',
  },
  {
    id: 'scout_003',
    name: '石川 俊介',
    type: 'scout',
    affiliation: 'プロ球団C スカウト部',
    focus: 'speed_running',
    bias: {
      generalBias: 0,
      thresholdBonuses: [
        { stat: 'base.speed', threshold: 80, bonus: 20 },
        { stat: 'base.armStrength', threshold: 70, bonus: 5 },
      ],
    },
    description: '俊足外野手を探すスカウト。脚力を最重視。',
  },
  {
    id: 'scout_004',
    name: '橋本 正明',
    type: 'scout',
    affiliation: 'プロ球団D スカウト部',
    focus: 'batter_power',
    bias: {
      generalBias: 0,
      thresholdBonuses: [
        { stat: 'batting.power', threshold: 85, bonus: 20 },
        { stat: 'batting.contact', threshold: 60, bonus: 5 },
      ],
    },
    description: 'スラッガー発掘のベテランスカウト。',
  },
  {
    id: 'scout_005',
    name: '坂本 英樹',
    type: 'scout',
    affiliation: 'プロ球団E スカウト部',
    focus: 'defense_fielding',
    bias: {
      generalBias: 0,
      positionBias: { catcher: 15, shortstop: 10 },
    },
    description: '守備専門スカウト。キャッチャーと遊撃手を好む。',
  },
  {
    id: 'scout_006',
    name: '近藤 義男',
    type: 'scout',
    affiliation: 'プロ球団F スカウト部',
    focus: 'pitcher_control',
    bias: {
      generalBias: 0,
      thresholdBonuses: [
        { stat: 'pitching.control', threshold: 80, bonus: 15 },
        { stat: 'pitching.velocity', threshold: 75, bonus: 5 },
      ],
    },
    description: '制球型投手好きのスカウト。荒れ球には興味なし。',
  },
  {
    id: 'scout_007',
    name: '竹内 俊一',
    type: 'scout',
    affiliation: 'プロ球団G スカウト部',
    focus: 'mental_focus',
    bias: {
      generalBias: 0,
      thresholdBonuses: [
        { stat: 'base.focus', threshold: 75, bonus: 12 },
        { stat: 'base.mental', threshold: 75, bonus: 12 },
      ],
    },
    description: 'メンタルの強い選手を掘り出すスカウト。',
  },
  {
    id: 'scout_008',
    name: '吉田 和也',
    type: 'scout',
    affiliation: '独立リーグ スカウト',
    focus: 'stamina',
    bias: {
      generalBias: -1.0,
      thresholdBonuses: [{ stat: 'base.stamina', threshold: 85, bonus: 20 }],
    },
    description: '独立リーグ向けスカウト。体力と継続力重視。基準が厳しい。',
  },
];

/** IDで評価者を検索する */
export function findEvaluator(id: string): Evaluator | undefined {
  return EVALUATOR_REGISTRY.find((e) => e.id === id);
}

/** 評価者種別でフィルタする */
export function getEvaluatorsByType(type: import('../types/evaluator').EvaluatorType): Evaluator[] {
  return EVALUATOR_REGISTRY.filter((e) => e.type === type);
}
