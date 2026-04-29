/**
 * practice-menus.ts — 練習メニュー全定義 (Phase S1-B B4)
 *
 * 既存の engine/growth/practice.ts で定義されていたメニューに加え、
 * B4 で追加された6つの個別練習メニューを含む完全リスト。
 *
 * `engine/growth/practice.ts` の getPracticeMenus() と同期を保つこと。
 */

import type { PracticeMenu } from '../engine/types/calendar';

export const PRACTICE_MENUS: PracticeMenu[] = [
  // ── 既存メニュー（team + individual 共通） ──────────────────────────
  {
    id: 'batting_basic',
    name: '打撃基礎',
    description: '素振り・ティー打撃で基礎を固める',
    fatigueLoad: 5,
    statEffects: [
      { target: 'batting.contact', baseGain: 0.5 },
      { target: 'batting.technique', baseGain: 0.35 },
    ],
    duration: 'half',
  },
  {
    id: 'batting_live',
    name: '実戦打撃',
    description: 'フリーバッティングで実戦感覚を磨く',
    fatigueLoad: 8,
    statEffects: [
      { target: 'batting.contact', baseGain: 0.35 },
      { target: 'batting.power', baseGain: 0.5 },
      { target: 'batting.eye', baseGain: 0.35 },
    ],
    duration: 'full',
  },
  {
    id: 'pitching_basic',
    name: '投球基礎',
    description: 'シャドーピッチング・キャッチボールで基礎を固める',
    fatigueLoad: 6,
    statEffects: [
      { target: 'pitching.control', baseGain: 0.5 },
      { target: 'pitching.pitchStamina', baseGain: 0.35 },
    ],
    duration: 'half',
  },
  {
    id: 'pitching_bullpen',
    name: 'ブルペン投球',
    description: 'ブルペンで全力投球の感覚を磨く',
    fatigueLoad: 10,
    statEffects: [
      { target: 'pitching.velocity', baseGain: 0.35 },
      { target: 'pitching.control', baseGain: 0.35 },
      { target: 'pitching.pitchStamina', baseGain: 0.35 },
    ],
    duration: 'full',
  },
  {
    id: 'fielding_drill',
    name: '守備練習',
    description: 'ノック・守備練習で守備力を向上',
    fatigueLoad: 6,
    statEffects: [
      { target: 'base.fielding', baseGain: 0.6 },
      { target: 'base.armStrength', baseGain: 0.2 },
    ],
    duration: 'half',
  },
  {
    id: 'running',
    name: '走り込み',
    description: '走り込みで脚力とスタミナを強化',
    fatigueLoad: 10,
    statEffects: [
      { target: 'base.speed', baseGain: 0.5 },
      { target: 'base.stamina', baseGain: 0.5 },
    ],
    duration: 'full',
  },
  {
    id: 'strength',
    name: '筋力トレーニング',
    description: 'ウェイトトレーニングで身体を強化',
    fatigueLoad: 8,
    statEffects: [
      { target: 'batting.power', baseGain: 0.5 },
      { target: 'base.armStrength', baseGain: 0.35 },
      { target: 'base.stamina', baseGain: 0.2 },
    ],
    duration: 'full',
  },
  {
    id: 'mental',
    name: 'メンタルトレーニング',
    description: '精神力・集中力を鍛える',
    fatigueLoad: 2,
    statEffects: [
      { target: 'base.mental', baseGain: 0.5 },
      { target: 'base.focus', baseGain: 0.5 },
    ],
    duration: 'half',
  },
  {
    id: 'rest',
    name: '休養',
    description: '体を休めて疲労を回復する',
    fatigueLoad: -15,
    statEffects: [],
    duration: 'half',
  },

  // ── B4: 新規追加個別練習メニュー (Phase S1-B) ──────────────────────

  /**
   * 走力強化（ベースランニング）
   * 走塁技術と走力を集中特訓。
   */
  {
    id: 'base_running',
    name: '走力強化（ベースランニング）',
    description: 'ベースランニングを反復し走塁力と走力を集中特訓する',
    fatigueLoad: 9,
    statEffects: [
      { target: 'base.speed', baseGain: 0.7 },
      { target: 'base.stamina', baseGain: 0.3 },
    ],
    duration: 'full',
  },

  /**
   * 守備位置別反復（ポジション別）
   * 自分のポジションに特化した守備動作を繰り返す。
   */
  {
    id: 'position_drill',
    name: '守備位置別反復（ポジション別）',
    description: 'ポジション特化の守備反復練習で守備精度を高める',
    fatigueLoad: 7,
    statEffects: [
      { target: 'base.fielding', baseGain: 0.8 },
      { target: 'base.focus', baseGain: 0.2 },
    ],
    duration: 'full',
  },

  /**
   * 配球研究（投手向け）
   * 相手打者の弱点・打球傾向を分析し配球パターンを習得。
   */
  {
    id: 'pitch_study',
    name: '配球研究（投手向け）',
    description: '打者分析と配球パターン研究で投手としての頭脳を磨く',
    fatigueLoad: 3,
    statEffects: [
      { target: 'pitching.control', baseGain: 0.45 },
      { target: 'base.focus', baseGain: 0.35 },
      { target: 'base.mental', baseGain: 0.2 },
    ],
    duration: 'half',
  },

  /**
   * メンタルトレーニング（プレッシャー耐性）
   * 試合プレッシャー下での集中力・精神力を強化。
   */
  {
    id: 'pressure_mental',
    name: 'メンタルトレーニング（プレッシャー耐性）',
    description: '試合プレッシャーを想定した特訓でメンタルを強化する',
    fatigueLoad: 3,
    statEffects: [
      { target: 'base.mental', baseGain: 0.7 },
      { target: 'base.focus', baseGain: 0.3 },
    ],
    duration: 'half',
  },

  /**
   * 柔軟性向上（ケガ予防）
   * ストレッチ・ヨガで柔軟性を高め、ケガのリスクを低減。
   */
  {
    id: 'flexibility',
    name: '柔軟性向上（ケガ予防）',
    description: 'ストレッチ・ヨガで柔軟性を高めケガのリスクを低減する',
    fatigueLoad: -5,   // 軽度の疲労回復効果あり
    statEffects: [
      { target: 'base.stamina', baseGain: 0.3 },
      { target: 'base.speed', baseGain: 0.2 },
    ],
    duration: 'half',
  },

  /**
   * 動画分析（バッティング/ピッチング動画レビュー）
   * 自分のフォームを動画で分析し技術的な課題を修正。
   */
  {
    id: 'video_analysis',
    name: '動画分析（バッティング/ピッチング動画レビュー）',
    description: '自分のフォームを動画で確認・分析しフォームを修正する',
    fatigueLoad: 1,
    statEffects: [
      { target: 'batting.technique', baseGain: 0.5 },
      { target: 'pitching.control', baseGain: 0.3 },
      { target: 'base.focus', baseGain: 0.2 },
    ],
    duration: 'half',
  },
];

/** ID でメニューを取得（見つからない場合は batting_basic を返す） */
export function getPracticeMenuById(id: string): PracticeMenu {
  return PRACTICE_MENUS.find((m) => m.id === id) ?? PRACTICE_MENUS[0];
}

/** チーム練習用（個別練習追加分を除く9種） */
export const TEAM_PRACTICE_MENUS: PracticeMenu[] = PRACTICE_MENUS.filter((m) =>
  [
    'batting_basic', 'batting_live', 'pitching_basic', 'pitching_bullpen',
    'fielding_drill', 'running', 'strength', 'mental', 'rest',
  ].includes(m.id)
);

/** 個別練習用メニュー一覧（全メニュー） */
export const INDIVIDUAL_PRACTICE_MENUS: PracticeMenu[] = PRACTICE_MENUS;
