/**
 * src/engine/narrative/types.ts — NarrativeHook 型定義
 *
 * Phase R6: 21種打球分類に基づくドラマ性演出フック。
 * R7 が NarrativeHook 型を参照するため、型シグネチャを早期に確定する。
 *
 * 設計指針:
 * - NarrativeHook は engine が emit する「出来事の意味付け」
 * - UI/心理システムはこれを購読して演出・モノローグを生成する
 * - 純粋なデータ型（関数なし・副作用なし）
 */

import type { DetailedHitType } from '../physics/types';

// ============================================================
// NarrativeHook 種別
// ============================================================

/**
 * NarrativeHook の種別
 *
 * 各種別は「何が起きたか」の意味付けを表す。
 * UI はこれを見て演出種別（カメラワーク・SE・テロップ）を決定する。
 * 心理システムはこれを見て選手のモノローグ・メンタル補正を決定する。
 */
export type NarrativeHookKind =
  // ─── ホームラン系 ───────────────────────────────────────
  /** ライナー性ホームラン（低弾道・強打） */
  | 'liner_home_run'
  /** 高弾道ホームラン（アーチを描く打球） */
  | 'high_arc_home_run'
  /** ライン際ホームラン（フェアファウル際どい） */
  | 'line_home_run'

  // ─── 長打系演出 ──────────────────────────────────────────
  /** フェンス直撃 → 跳ね返りヒット */
  | 'wall_ball_hit'
  /** 深い二塁打・三塁打 */
  | 'extra_base_drive'

  // ─── ポテンヒット系 ──────────────────────────────────────
  /** 内野手の頭越しポテンヒット（浅いフライが落ちる） */
  | 'blooper_over_infield'
  /** 浅いフライがポテン落ち（外野手が間に合わない） */
  | 'shallow_fly_drop'

  // ─── ゴロ・ライナー系 ────────────────────────────────────
  /** ピッチャー返し（投手への強烈な打球） */
  | 'comebacker_hard'
  /** ライン際ゴロ（ぎりぎりフェア） */
  | 'line_grounder'
  /** センター前クリーンヒット */
  | 'center_clean_hit'
  /** 抜けるヒット（内野を抜ける打球） */
  | 'through_infield'

  // ─── 凡打・アウト系 ──────────────────────────────────────
  /** 内野フライ（ポップフライ） */
  | 'infield_popup'
  /** 当たり損ね（チェックスウィング系） */
  | 'weak_contact'
  /** 平凡なゴロ */
  | 'routine_grounder'
  /** 平凡なフライ */
  | 'routine_fly'

  // ─── 特殊演出 ────────────────────────────────────────────
  /** ファウルフライ（際どい打球） */
  | 'foul_fly_close'
  /** 強打者の鋭い当たり（汎用） */
  | 'hard_hit_ball';

// ============================================================
// NarrativeHook の演出強度
// ============================================================

/**
 * 演出強度
 * - low: 通常の実況テキストのみ
 * - medium: テキスト + SE 変化
 * - high: テキスト + SE + カメラ演出
 * - dramatic: テキスト + SE + カメラ + スローモーション
 */
export type NarrativeDramaLevel = 'low' | 'medium' | 'high' | 'dramatic';

// ============================================================
// HR 演出フラグ（R6-2 専用）
// ============================================================

/**
 * ホームラン演出フラグ（R6-2 要件）
 * UI 側はこのフラグを見て異なるカメラワーク・SE を選択する。
 */
export interface HomeRunDisplayFlag {
  /** ライナー性HR: カメラは水平追従、SEは鋭い打球音 */
  readonly isLineDrive: boolean;
  /** 高弾道HR: カメラは放物線追従、SEは重低音+歓声 */
  readonly isHighArc: boolean;
  /** ライン際HR: テロップ「際どい！」→「入った！」の2段演出 */
  readonly isCloseLine: boolean;
}

// ============================================================
// NarrativeHook 本体
// ============================================================

/**
 * NarrativeHook — 1打球から発行される演出フック
 *
 * @example
 * ```ts
 * // エンジン側で生成
 * const hook = generateNarrativeHook(resolution);
 *
 * // UI 側で参照
 * if (hook.kind === 'liner_home_run') {
 *   camera.followLineDrive();
 *   sound.play('hr_liner');
 * }
 *
 * // 心理システム側で購読
 * applyNarrativeHookToPsyche(hook, matchState);
 * ```
 */
export interface NarrativeHook {
  /** フックの種別（R7 が参照するため変更禁止） */
  readonly kind: NarrativeHookKind;

  /** 元となった21種打球分類 */
  readonly detailedHitType: DetailedHitType;

  /** 演出強度 */
  readonly dramaLevel: NarrativeDramaLevel;

  /** HR 演出フラグ（HR系のみ。非HR系は undefined） */
  readonly homeRunFlag?: HomeRunDisplayFlag;

  /** 実況テキスト候補（日本語）
   *  - R7 がテンプレートエンジンでより詳細な文を生成する
   *  - R6 では固定テンプレートを使用
   */
  readonly commentaryText: string;

  /** 短縮ラベル（スコアボード・ログ表示用） */
  readonly shortLabel: string;

  /** 21種分類カテゴリ */
  readonly category: 'major' | 'medium' | 'rare' | 'special';

  /** 心理システムへの影響ヒント
   *  - 打者: 成功体験(+) / 凡退(-) のメンタル補正に使う
   *  - 投手: 被打(−) / 打者アウト(+) のメンタル補正に使う
   */
  readonly psycheHint: {
    /** 打者への影響 (-1.0 〜 +1.0) */
    readonly batterImpact: number;
    /** 投手への影響 (-1.0 〜 +1.0) */
    readonly pitcherImpact: number;
  };
}

// ============================================================
// R7-2: 思考コメント型（1球ごとの選手思考）
// ============================================================

/**
 * 思考コメント — 1球ごとのバッター・ピッチャー・キャッチャーの心理状態テキスト
 * （Phase R7-3: NarrativeHook → コメントテンプレートから生成）
 */
export interface ThoughtComment {
  /** 発言者の役割 */
  role: 'batter' | 'pitcher' | 'catcher';
  /** 発言者名（表示用） */
  speakerName: string;
  /** コメントテキスト（日本語） */
  text: string;
  /** コメントカテゴリ（UI スタイル分岐用） */
  category: 'tactical' | 'emotional' | 'analytical' | 'situational';
  /** 心理効果サマリー（省略可） */
  effectSummary?: string;
}

/**
 * 思考コメント生成のための打席コンテキスト（R7-3 入力）
 */
export interface ThoughtCommentContext {
  /** フックの種別（打球結果が確定している場合のみ） */
  hookKind?: NarrativeHookKind;
  /** 演出強度 */
  dramaLevel?: NarrativeDramaLevel;
  /** 投球コンテキスト */
  inning: number;
  half: 'top' | 'bottom';
  outs: number;
  balls: number;
  strikes: number;
  runnersOn: 'none' | 'some' | 'scoring' | 'bases_loaded';
  scoreDiff: number;
  isKoshien: boolean;
  batterName: string;
  pitcherName: string;
  batterTraits: ReadonlyArray<string>;
  pitcherTraits: ReadonlyArray<string>;
  pitcherStamina: number;
  /** 直前の投球結果（after_pitch 時のみ） */
  pitchOutcome?: string;
  /** 球種 */
  pitchType?: string;
  /** 球速 */
  velocity?: number;
  /** 连続三振数（投手） */
  consecutiveStrikeouts?: number;
  /** 連続凡退数（打者） */
  consecutiveRetired?: number;
  /** 采配タイプ */
  orderType?: string | null;
  /** 詳細采配フォーカスエリア */
  orderFocusArea?: string;
  /** 直前のモノローグ（重複回避用） */
  recentCommentIds?: ReadonlySet<string>;
}

// ============================================================
// R7-2: NarrativeHook 購読インターフェース
// ============================================================

/**
 * NarrativeHook 購読コールバックの入力型
 * 心理システムがこれを購読して confidence/mood の変化を起こす
 */
export interface NarrativeHookSubscribeInput {
  hook: NarrativeHook;
  /** 打者信頼度変化提案（-10〜+10） */
  suggestedBatterConfidenceDelta?: number;
  /** 投手信頼度変化提案（-10〜+10） */
  suggestedPitcherConfidenceDelta?: number;
}

// ============================================================
// 21種ラベルマップ（実況ログ・成績表示用）
// ============================================================

/**
 * DetailedHitType → 日本語ラベル
 * 実況ログや成績集計テーブルで使用する。
 */
export const DETAILED_HIT_TYPE_LABEL: Readonly<Record<DetailedHitType, string>> = {
  // 内野ゴロ系
  first_line_grounder:   '一塁線ゴロ',
  right_side_grounder:   '二遊間ゴロ',
  left_side_grounder:    '三遊間ゴロ',
  third_line_grounder:   '三塁線ゴロ',
  // 投手周辺
  comebacker:            'ピッチャー返し',
  // 内野フライ・ライナー系
  infield_liner:         '内野ライナー',
  high_infield_fly:      '高い内野フライ',
  over_infield_hit:      'ポテンヒット',
  // 外野ゴロ抜けヒット
  right_gap_hit:         '一二塁間ヒット',
  up_the_middle_hit:     'センター前ヒット',
  left_gap_hit:          '三遊間ヒット',
  // 外野フライ系
  shallow_fly:           '浅いフライ',
  medium_fly:            '中距離フライ',
  deep_fly:              '深いフライ',
  // ライナー性
  line_drive_hit:        'ライナー性ヒット',
  // 長打系
  wall_ball:             'フェンス直撃',
  line_drive_hr:         'ライナー性ホームラン',
  high_arc_hr:           '高弾道ホームラン',
  fence_close_call:      'ライン際打球',
  // ファウル・特殊
  foul_fly:              'ファウルフライ',
  check_swing_dribbler:  '当たり損ね',
} as const;

/**
 * DetailedHitType → 短縮ラベル（スコアボード等で使用）
 */
export const DETAILED_HIT_TYPE_SHORT: Readonly<Record<DetailedHitType, string>> = {
  first_line_grounder:   '一線ゴロ',
  right_side_grounder:   '二遊間',
  left_side_grounder:    '三遊間',
  third_line_grounder:   '三線ゴロ',
  comebacker:            'P返し',
  infield_liner:         '内野L',
  high_infield_fly:      'ポップ',
  over_infield_hit:      'ポテン',
  right_gap_hit:         '右安',
  up_the_middle_hit:     '中安',
  left_gap_hit:          '左安',
  shallow_fly:           '浅F',
  medium_fly:            '中F',
  deep_fly:              '深F',
  line_drive_hit:        'ライナー',
  wall_ball:             'フェンス',
  line_drive_hr:         'L性HR',
  high_arc_hr:           '高弾道HR',
  fence_close_call:      'ライン際',
  foul_fly:              'ファF',
  check_swing_dribbler:  '当損ね',
} as const;

// ============================================================
// 21種カテゴリマッピング
// ============================================================

/**
 * DetailedHitType → カテゴリ (§8.4 準拠)
 */
export const DETAILED_HIT_TYPE_CATEGORY: Readonly<Record<DetailedHitType, 'major' | 'medium' | 'rare' | 'special'>> = {
  // 主要（major）
  first_line_grounder:   'major',
  right_side_grounder:   'major',
  left_side_grounder:    'major',
  third_line_grounder:   'major',
  right_gap_hit:         'major',
  up_the_middle_hit:     'major',
  left_gap_hit:          'major',
  shallow_fly:           'major',
  medium_fly:            'major',
  deep_fly:              'major',
  // 中頻度（medium）
  comebacker:            'medium',
  infield_liner:         'medium',
  high_infield_fly:      'medium',
  over_infield_hit:      'medium',
  line_drive_hit:        'medium',
  foul_fly:              'medium',
  check_swing_dribbler:  'medium',
  // 希少（rare）
  wall_ball:             'rare',
  line_drive_hr:         'rare',
  high_arc_hr:           'rare',
  fence_close_call:      'rare',
  // 特殊（special）— 現在は空だが将来拡張用
} as const;
