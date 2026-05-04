/**
 * src/engine/psyche/catcher-thinking.ts
 *
 * Phase S2: キャッチャー性格システム
 *
 * キャッチャーの性格（積極派/慎重派/分析派）× 能力値 × ピッチャー状況 ×
 * 監督指示を組み合わせて「配球方針」と「思考テキスト」を生成する。
 *
 * 設計原則:
 * - 純粋関数（副作用なし・Math.random() 不使用）
 * - optional 引数で既存コードへの影響なし
 * - ピッチャー状況が性格より優先される（状況追従ルール）
 */

import type { CatcherPersonality, CatcherProfile, TraitId } from '../types/player';
import type { CatcherDetailedOrder } from '../match/types';

// ============================================================
// 型定義
// ============================================================

/** 配球方針 */
export type CallingStrategy =
  | 'fastball_heavy'   // ストレート中心（変化球キレ低下・積極派）
  | 'breaking_heavy'   // 変化球中心（分析派が弱点を突く）
  | 'outside_focus'    // 外角攻め（分析派・積極派）
  | 'inside_focus'     // 内角攻め（積極派）
  | 'mixed'            // バランス型
  | 'high_low'         // 高低の揺さぶり（慎重派が整えた後）
  | 'careful';         // カウント重視（慎重派・スタミナ低下時）

/** 配球補正（select-pitch に渡される） */
export interface PitchingBias {
  /** ストレート確率補正 (-0.3〜+0.3): 正=ストレート多め */
  fastballRatioBias: number;
  /** ゾーン内狙い率補正 (-0.3〜+0.3): 正=ストライクゾーン重視 */
  strikeZoneBias: number;
  /** 外角コース優先 */
  preferOutside: boolean;
  /** 内角コース優先 */
  preferInside: boolean;
}

/** キャッチャーの思考（打席前に生成） */
export interface CatcherThought {
  /** 採用した配球方針 */
  callingStrategy: CallingStrategy;
  /** 思考テキスト（PsycheWindow 表示用） */
  thoughtText: string;
  /** 配球に与える補正値 */
  pitchingBias: PitchingBias;
  /**
   * キャッチャーの能力が低い場合の配球精度フラグ
   * true = PitchingBias に軽微な誤差が入っている
   */
  hasCallingError: boolean;
}

/** generateCatcherThought の入力コンテキスト */
export interface CatcherThinkingContext {
  // キャッチャー情報
  /** キャッチャーの性格 */
  catcherPersonality: CatcherPersonality;
  /** リーダーシップ 0-100 */
  catcherLeadership: number;
  /** 配球精度 0-100 */
  catcherCallingAccuracy: number;

  // ピッチャー状況（リアルタイム）
  /** ピッチャースタミナ 0-100 */
  pitcherStamina: number;
  /** ピッチャーのコントロール能力値 */
  pitcherControl: number;
  /**
   * 変化球のキレ指数 0.0-1.0
   * 通常は 1.0 = フル、疲労などで低下
   */
  pitcherBreakingBallSharpness: number;
  /** ピッチャーのメンタル能力値 */
  pitcherMental: number;
  /** ピッチャーのスタミナ（試合中）残量（追加コンテキスト用） */
  pitcherCurrentStamina: number;

  // 相手バッター情報（分析用・過去打席データ含む）
  /** バッターの特性 */
  batterTraits: TraitId[];
  /** バッターのミート能力 */
  batterContact: number;
  /** バッターのパワー能力 */
  batterPower: number;
  /** バッターの選球眼能力 */
  batterEye: number;

  // ゲーム状況
  /** イニング（1-12） */
  inning: number;
  /** 守備チームから見た得点差（正=リード、負=ビハインド） */
  scoreDiff: number;
  /** アウト数（0-2） */
  outs: number;
  /** ランナー状況 */
  runnersOn: 'none' | 'some' | 'scoring' | 'bases_loaded';
  /** 甲子園かどうか */
  isKoshien: boolean;
  /** 連続安打数（このイニング内） */
  consecutiveHits: number;

  // 監督指示（任意）
  /** 監督からキャッチャーへの指示 */
  managerOrder?: CatcherDetailedOrder;
}

// ============================================================
// デフォルト CatcherProfile
// ============================================================

/** catcherProfile が未設定の捕手に使うデフォルト値 */
export const DEFAULT_CATCHER_PROFILE: CatcherProfile = {
  personality: 'cautious',
  leadershipScore: 50,
  callingAccuracy: 50,
};

// ============================================================
// 思考テキストDB
// ============================================================

// 性格 × 状況 → テキストパターン
// 決定論的選択のため配列インデックス指定で選ぶ

const AGGRESSIVE_TEXTS: Record<string, string[]> = {
  fastball_heavy: [
    'ストレートで押していこう。力で勝負だ！',
    '今日はストレート中心でいく。変化球なんていらない',
    '直球勝負！ここは力で打ち取れ',
  ],
  outside_focus: [
    '外角低めに徹しよう。外に逃げ続ければ打てない',
    '外角攻め一択だ。コーナーを突き続けろ',
    '外角で詰まらせてやる。外、外、外だ',
  ],
  inside_focus: [
    '内角を攻めよう。詰まらせれば勝てる',
    'インコース攻め！ ためらうな',
    '内角に食い込ませろ。それが今日の作戦だ',
  ],
  mixed: [
    '攻めたいが今日は無理できない…バランスで行こう',
    '内外に揺さぶりながら勝機を狙う',
    '状況を見ながら攻める配球で行こう',
  ],
  careful: [
    '今は慎重に行こう。カウントを整えてから勝負だ',
    '無理な攻めは禁物。まずストライクを取る',
  ],
};

const CAUTIOUS_TEXTS: Record<string, string[]> = {
  careful: [
    'まずカウントを整えよう。焦らず丁寧に行こう',
    'ストライクゾーンで勝負。慌てて動じるな',
    '慌てない。一球一球丁寧に積み上げていく',
  ],
  high_low: [
    'カウントを作ってから高低の揺さぶりで攻めよう',
    '高めと低めを使い分ける。打者が狙いを絞れない',
    'まず低めを意識させてから高めで仕留める',
  ],
  mixed: [
    '慎重に、でも攻める気持ちも忘れずにいこう',
    'バランスを保ちながら、チャンスを待つ',
    'ゆっくり、じっくり。慌てない配球で行く',
  ],
  fastball_heavy: [
    'ストレートを軸にしつつ、慎重に攻める',
    '直球中心だが、無理はしない。安全に行こう',
  ],
};

const ANALYTICAL_TEXTS: Record<string, string[]> = {
  outside_focus: [
    '相手は外角が苦手なはず。そこを徹底的に突こう',
    'データ通り外角攻め。弱点を見逃さない',
    '外角に的を絞れ。打者の傾向はバレている',
  ],
  inside_focus: [
    '内角に弱い。徹底的にインサイドで攻める',
    '分析通り内角。今日はこれで行く',
    '相手の内角打率は低い。ここ一択だ',
  ],
  mixed: [
    '相手の傾向は分かるが、ピッチャーの状態を見ながら…',
    '分析はできている。あとはタイミングを見計らう',
    '相手データを活かしつつ、状況に応じた配球で',
  ],
  fastball_heavy: [
    'ストレートで押すのが今日は最善の分析だ',
    '速球勝負が理にかなっている。分析通りだ',
  ],
};

// ピッチャー状況による補足テキスト
const PITCHER_SITUATION_TEXTS: Record<string, string> = {
  breaking_poor:     '変化球のキレがない。ストレート中心にしよう',
  control_bad:       'コントロールが悪い。ゾーンで勝負させよう。フォアボールだけは避けたい',
  stamina_low:       'スタミナが落ちてきた。球数を減らす組み立てで行こう',
  mental_low:        'ピッチャーが追い込まれている。落ち着かせなきゃ',
  mental_low_lead:   'リードしているのにピッチャーが硬い…大丈夫、ゆっくり行こう',
  consecutive_hits:  '連打を浴びている。ここで配球を変えなければ',
  koshien_pressure:  '甲子園の大舞台…でも基本通りに行こう。焦らない',
};

// ============================================================
// 内部ヘルパー
// ============================================================

/**
 * 文字列ハッシュ（決定論的なテキスト選択用）
 * RNG 不使用・副作用なし
 */
function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pickText(texts: string[], key: string): string {
  if (texts.length === 0) return '配球を考えている…';
  return texts[simpleHash(key) % texts.length];
}

function getTextsForPersonality(
  personality: CatcherPersonality,
  strategy: CallingStrategy,
  contextKey: string,
): string {
  let texts: string[] | undefined;

  switch (personality) {
    case 'aggressive':
      texts = AGGRESSIVE_TEXTS[strategy];
      break;
    case 'cautious':
      texts = CAUTIOUS_TEXTS[strategy];
      break;
    case 'analytical':
      texts = ANALYTICAL_TEXTS[strategy];
      break;
  }

  if (!texts || texts.length === 0) {
    // フォールバック
    return `${strategy === 'fastball_heavy' ? 'ストレート' : '変化球'}中心で行こう`;
  }
  return pickText(texts, contextKey);
}

/** ランダム誤差を決定論的に生成（callingAccuracy が低い場合） */
function calcCallingError(
  bias: PitchingBias,
  callingAccuracy: number,
  contextKey: string,
): PitchingBias {
  if (callingAccuracy >= 40) return bias;

  // 精度 0→40 で誤差 0.1→0 に線形補間
  const errorMagnitude = (40 - callingAccuracy) / 400; // 最大 0.1
  const hash = simpleHash(contextKey + 'error');
  const sign = hash % 2 === 0 ? 1 : -1;
  const errorValue = errorMagnitude * sign;

  return {
    ...bias,
    fastballRatioBias: Math.max(-0.3, Math.min(0.3, bias.fastballRatioBias + errorValue)),
    strikeZoneBias: Math.max(-0.3, Math.min(0.3, bias.strikeZoneBias + errorValue)),
  };
}

// ============================================================
// 配球方針 → PitchingBias マッピング
// ============================================================

const STRATEGY_BIAS_MAP: Record<CallingStrategy, PitchingBias> = {
  fastball_heavy: {
    fastballRatioBias: +0.25,
    strikeZoneBias: +0.05,
    preferOutside: false,
    preferInside: false,
  },
  breaking_heavy: {
    fastballRatioBias: -0.20,
    strikeZoneBias: 0,
    preferOutside: false,
    preferInside: false,
  },
  outside_focus: {
    fastballRatioBias: 0,
    strikeZoneBias: +0.05,
    preferOutside: true,
    preferInside: false,
  },
  inside_focus: {
    fastballRatioBias: 0,
    strikeZoneBias: +0.05,
    preferOutside: false,
    preferInside: true,
  },
  mixed: {
    fastballRatioBias: 0,
    strikeZoneBias: 0,
    preferOutside: false,
    preferInside: false,
  },
  high_low: {
    fastballRatioBias: +0.05,
    strikeZoneBias: +0.10,
    preferOutside: false,
    preferInside: false,
  },
  careful: {
    fastballRatioBias: +0.10,
    strikeZoneBias: +0.20,
    preferOutside: false,
    preferInside: false,
  },
};

// ============================================================
// 監督指示の反映
// ============================================================

function applyManagerOrder(
  strategy: CallingStrategy,
  bias: PitchingBias,
  order: CatcherDetailedOrder,
): { strategy: CallingStrategy; bias: PitchingBias } {
  let newStrategy = strategy;
  let newBias = { ...bias };

  // callingStyle の反映
  if (order.callingStyle === 'attack') {
    if (newBias.fastballRatioBias < 0.15) {
      newBias.fastballRatioBias = Math.min(0.3, newBias.fastballRatioBias + 0.10);
    }
    if (newStrategy === 'careful') newStrategy = 'mixed';
  } else if (order.callingStyle === 'careful') {
    newStrategy = 'careful';
    newBias = { ...STRATEGY_BIAS_MAP['careful'] };
  }
  // mixed はデフォルトのまま

  // focusArea の反映
  if (order.focusArea === 'outside') {
    newBias.preferOutside = true;
    newBias.preferInside = false;
    if (newStrategy === 'mixed' || newStrategy === 'careful') {
      newStrategy = 'outside_focus';
    }
  } else if (order.focusArea === 'inside') {
    newBias.preferInside = true;
    newBias.preferOutside = false;
    if (newStrategy === 'mixed' || newStrategy === 'careful') {
      newStrategy = 'inside_focus';
    }
  }

  // aggressiveness の反映
  if (order.aggressiveness === 'aggressive') {
    newBias.strikeZoneBias = Math.min(0.3, newBias.strikeZoneBias + 0.10);
    newBias.fastballRatioBias = Math.min(0.3, newBias.fastballRatioBias + 0.05);
  } else if (order.aggressiveness === 'passive') {
    newBias.strikeZoneBias = Math.max(-0.3, newBias.strikeZoneBias - 0.10);
    newBias.fastballRatioBias = Math.max(-0.3, newBias.fastballRatioBias - 0.05);
  }

  return { strategy: newStrategy, bias: newBias };
}

// ============================================================
// メイン: generateCatcherThought
// ============================================================

/**
 * キャッチャーの打席前思考を生成する。
 *
 * ロジック優先順位:
 * 1. ピッチャー状況による強制上書き（変化球キレ低・コントロール悪・スタミナ低・メンタル低）
 * 2. 監督指示による上書き
 * 3. 性格 × 能力値による基本方針
 *
 * @param ctx 思考生成コンテキスト
 * @returns CatcherThought（配球方針 + 思考テキスト + PitchingBias）
 */
export function generateCatcherThought(ctx: CatcherThinkingContext): CatcherThought {
  const {
    catcherPersonality,
    catcherLeadership,
    catcherCallingAccuracy,
    pitcherStamina,
    pitcherControl,
    pitcherBreakingBallSharpness,
    pitcherMental,
    batterTraits,
    batterContact,
    batterPower,
    batterEye,
    inning,
    scoreDiff,
    outs,
    runnersOn,
    isKoshien,
    consecutiveHits,
    managerOrder,
  } = ctx;

  // コンテキストキー（決定論的なテキスト選択用）
  const contextKey = `${catcherPersonality}:${inning}:${outs}:${runnersOn}:${consecutiveHits}`;

  // ── Step 1: ピッチャー状況フラグ ──
  const breakingBallPoor = pitcherBreakingBallSharpness < 0.5;
  const controlBad = pitcherControl < 50;
  const staminaLow = pitcherStamina < 40;
  const mentalLow = pitcherMental < 40;
  const hasConsecutiveHits = consecutiveHits >= 2;

  // ── Step 2: 性格 × 能力値による基本方針決定 ──
  let strategy: CallingStrategy;

  switch (catcherPersonality) {
    case 'aggressive':
      if (catcherCallingAccuracy >= 70) {
        // 高精度積極派: 外角攻めまたはストレート押し
        // 得点差が小さい・走者あり → 確実に外角
        if (runnersOn !== 'none' || Math.abs(scoreDiff) <= 1) {
          strategy = 'outside_focus';
        } else {
          strategy = 'fastball_heavy';
        }
      } else {
        // 低精度積極派: 攻めたいが制限
        strategy = 'mixed';
      }
      break;

    case 'cautious':
      if (catcherLeadership >= 70) {
        // 高リーダーシップ慎重派: カウント整えてから揺さぶり
        strategy = outs === 2 ? 'careful' : 'high_low';
      } else {
        // 低リーダーシップ慎重派: 純粋な慎重配球
        strategy = 'careful';
      }
      break;

    case 'analytical':
      if (catcherCallingAccuracy >= 70) {
        // 高精度分析派: バッターの弱点を突く
        if (batterEye < 50) {
          // 選球眼低 → 変化球多め
          strategy = 'breaking_heavy';
        } else if (batterContact < 60) {
          // ミート低 → 外角攻め
          strategy = 'outside_focus';
        } else if (batterPower < 60) {
          // パワー低 → 内角攻め
          strategy = 'inside_focus';
        } else {
          strategy = 'mixed';
        }
      } else {
        // 低精度分析派: 分析は見えているがキャッチャー技術が追いつかない
        strategy = 'mixed';
      }
      break;
  }

  // ── Step 3: ピッチャー状況による強制上書き ──
  let situationText = '';

  if (breakingBallPoor) {
    // 変化球キレ低下 → ストレート中心に強制
    strategy = 'fastball_heavy';
    situationText = PITCHER_SITUATION_TEXTS['breaking_poor'];
  }

  if (controlBad) {
    // コントロール悪 → ゾーン内勝負強制（上書きはbias側で）
    if (strategy !== 'fastball_heavy') {
      situationText = situationText || PITCHER_SITUATION_TEXTS['control_bad'];
    }
  }

  if (staminaLow) {
    // スタミナ低下 → 慎重配球
    strategy = 'careful';
    situationText = situationText || PITCHER_SITUATION_TEXTS['stamina_low'];
  }

  if (mentalLow) {
    // メンタル低下 → 励まし/落ち着かせる思考
    const mentalKey = scoreDiff >= 0 ? 'mental_low_lead' : 'mental_low';
    situationText = situationText || PITCHER_SITUATION_TEXTS[mentalKey];
  }

  if (hasConsecutiveHits && !situationText) {
    situationText = PITCHER_SITUATION_TEXTS['consecutive_hits'];
  }

  if (isKoshien && !situationText) {
    situationText = PITCHER_SITUATION_TEXTS['koshien_pressure'];
  }

  // ── Step 4: 配球補正(PitchingBias)の取得 ──
  let bias: PitchingBias = { ...STRATEGY_BIAS_MAP[strategy] };

  // コントロール悪の場合はゾーン内狙い率を上げる
  if (controlBad) {
    bias.strikeZoneBias = Math.min(0.3, bias.strikeZoneBias + 0.15);
  }

  // リーダーシップ低の場合は効果を半減
  if (catcherLeadership < 40) {
    bias.fastballRatioBias *= 0.5;
    bias.strikeZoneBias *= 0.5;
  }

  // ── Step 5: 監督指示の反映 ──
  if (managerOrder) {
    const result = applyManagerOrder(strategy, bias, managerOrder);
    strategy = result.strategy;
    bias = result.bias;
  }

  // ── Step 6: 配球精度が低い場合の誤差注入 ──
  const hasCallingError = catcherCallingAccuracy < 40;
  if (hasCallingError) {
    bias = calcCallingError(bias, catcherCallingAccuracy, contextKey);
  }

  // ── Step 7: 思考テキスト生成 ──
  // 状況テキストがある場合はそちらを優先
  const thoughtText = situationText || getTextsForPersonality(catcherPersonality, strategy, contextKey);

  return {
    callingStrategy: strategy,
    thoughtText,
    pitchingBias: bias,
    hasCallingError,
  };
}

/**
 * Player の catcherProfile から CatcherThinkingContext の性格情報を取得する。
 * catcherProfile が未設定の場合は DEFAULT_CATCHER_PROFILE を使用。
 *
 * @param profile Player.catcherProfile
 */
export function catcherProfileToContext(profile: CatcherProfile | undefined): {
  catcherPersonality: CatcherPersonality;
  catcherLeadership: number;
  catcherCallingAccuracy: number;
} {
  const p = profile ?? DEFAULT_CATCHER_PROFILE;
  return {
    catcherPersonality: p.personality,
    catcherLeadership: p.leadershipScore,
    catcherCallingAccuracy: p.callingAccuracy,
  };
}
