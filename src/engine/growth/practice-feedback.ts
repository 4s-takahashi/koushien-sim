/**
 * practice-feedback.ts — 練習成果フィードバック生成 (Phase S1-B B6)
 *
 * stat の変化量（delta）に応じて「ミート率があがったような気がする」などの
 * 日本語表現でフィードバックメッセージを生成する。
 */

import type { StatTarget } from '../types/calendar';

// ============================================================
// メッセージテンプレート定義
// ============================================================

interface FeedbackTemplate {
  /** 対象スタット */
  target: StatTarget;
  /** このテンプレートが適用される最小 delta 閾値 */
  minDelta: number;
  /** メッセージ（選手の一人称的な表現） */
  message: string;
  /** 練習カテゴリ名（バッティング、走力など） */
  practiceType: string;
}

/**
 * フィードバックテンプレート一覧。
 * 同一ターゲットに複数閾値を設定する場合は minDelta の大きい順に並べること。
 * buildFeedbackMessage() は最初にマッチしたテンプレートを返す。
 */
const FEEDBACK_TEMPLATES: FeedbackTemplate[] = [
  // ── バッティング ──────────────────────────────────────────

  // ミート
  { target: 'batting.contact', minDelta: 5, message: 'ミート率がしっかり上がっている', practiceType: 'バッティング' },
  { target: 'batting.contact', minDelta: 3, message: 'ミート率が上がってきた気がする', practiceType: 'バッティング' },
  { target: 'batting.contact', minDelta: 1, message: 'ミート率があがったような気がする', practiceType: 'バッティング' },

  // パワー
  { target: 'batting.power', minDelta: 5, message: '打球がずっと遠くまで飛ぶようになった', practiceType: 'バッティング' },
  { target: 'batting.power', minDelta: 3, message: '打球が遠くまで飛ぶようになった', practiceType: 'バッティング' },
  { target: 'batting.power', minDelta: 1, message: 'バットに少し力が乗るようになったかも', practiceType: 'バッティング' },

  // 選球眼
  { target: 'batting.eye', minDelta: 5, message: 'ボールの見極めがかなり良くなった', practiceType: 'バッティング' },
  { target: 'batting.eye', minDelta: 3, message: 'ボールの軌道が読みやすくなってきた', practiceType: 'バッティング' },
  { target: 'batting.eye', minDelta: 1, message: '選球眼が少し良くなったような気がする', practiceType: 'バッティング' },

  // テクニック
  { target: 'batting.technique', minDelta: 5, message: 'バッティングの技術が確実に向上している', practiceType: 'バッティング' },
  { target: 'batting.technique', minDelta: 3, message: '打ち方のコツがつかめてきた', practiceType: 'バッティング' },
  { target: 'batting.technique', minDelta: 1, message: 'バッティングの感触がちょっと変わってきたかも', practiceType: 'バッティング' },

  // ── 投球 ──────────────────────────────────────────────────

  // 球速
  { target: 'pitching.velocity', minDelta: 5, message: '球速の伸びが目に見えてわかる', practiceType: '投球' },
  { target: 'pitching.velocity', minDelta: 3, message: '球速の伸びを感じる', practiceType: '投球' },
  { target: 'pitching.velocity', minDelta: 1, message: '球速がほんの少し増したかも', practiceType: '投球' },

  // 制球
  { target: 'pitching.control', minDelta: 5, message: '制球力が格段に上がっている', practiceType: '投球' },
  { target: 'pitching.control', minDelta: 3, message: 'コントロールが安定してきた感じがする', practiceType: '投球' },
  { target: 'pitching.control', minDelta: 1, message: 'コントロールがほんの少し定まってきたかも', practiceType: '投球' },

  // 投手スタミナ
  { target: 'pitching.pitchStamina', minDelta: 5, message: '後半でもしっかり腕が振れるようになった', practiceType: '投球' },
  { target: 'pitching.pitchStamina', minDelta: 3, message: '投球スタミナが上がってきた気がする', practiceType: '投球' },
  { target: 'pitching.pitchStamina', minDelta: 1, message: '終盤でも少し粘れるようになったかも', practiceType: '投球' },

  // ── 基礎能力 ──────────────────────────────────────────────

  // スタミナ
  { target: 'base.stamina', minDelta: 5, message: '体力が明らかに上がっている', practiceType: '体力' },
  { target: 'base.stamina', minDelta: 3, message: '体力がついてきた感じがする', practiceType: '体力' },
  { target: 'base.stamina', minDelta: 1, message: 'スタミナが少し上がったような気がする', practiceType: '体力' },

  // 走力
  { target: 'base.speed', minDelta: 5, message: '足がずいぶん速くなった', practiceType: '走力' },
  { target: 'base.speed', minDelta: 3, message: '走力が上がってきた感じがする', practiceType: '走力' },
  { target: 'base.speed', minDelta: 1, message: '少し走り方が軽くなったような気がする', practiceType: '走力' },

  // 肩力
  { target: 'base.armStrength', minDelta: 5, message: '送球がずっと力強くなった', practiceType: '送球' },
  { target: 'base.armStrength', minDelta: 3, message: '肩の強さが上がってきた気がする', practiceType: '送球' },
  { target: 'base.armStrength', minDelta: 1, message: '送球がほんの少し伸びてきたかも', practiceType: '送球' },

  // 守備
  { target: 'base.fielding', minDelta: 5, message: '守備の動きがかなり良くなった', practiceType: '守備' },
  { target: 'base.fielding', minDelta: 3, message: '守備のグラブさばきが上達してきた', practiceType: '守備' },
  { target: 'base.fielding', minDelta: 1, message: '守備の感触がちょっと良くなったような気がする', practiceType: '守備' },

  // 集中
  { target: 'base.focus', minDelta: 5, message: '試合中の集中力が格段に上がった気がする', practiceType: 'メンタル' },
  { target: 'base.focus', minDelta: 3, message: '集中力が上がってきた感じがする', practiceType: 'メンタル' },
  { target: 'base.focus', minDelta: 1, message: '集中力がほんの少し上がったかも', practiceType: 'メンタル' },

  // 精神
  { target: 'base.mental', minDelta: 5, message: '精神力がかなり強くなった気がする', practiceType: 'メンタル' },
  { target: 'base.mental', minDelta: 3, message: 'プレッシャーに少し強くなってきた感じがする', practiceType: 'メンタル' },
  { target: 'base.mental', minDelta: 1, message: 'メンタルがほんのり鍛えられた気がする', practiceType: 'メンタル' },
];

// ============================================================
// メッセージ生成 API
// ============================================================

export interface FeedbackResult {
  message: string;
  practiceType: string;
}

/**
 * stat delta に応じたフィードバックメッセージを返す。
 * delta が閾値未満（< 1）の場合は null を返す。
 *
 * @param target  変化した StatTarget
 * @param delta   変化量（正数）
 * @returns       フィードバックメッセージ、または null
 */
export function buildFeedbackMessage(target: StatTarget, delta: number): FeedbackResult | null {
  if (delta < 1) return null;

  // 同ターゲットのテンプレートを minDelta の大きい順にフィルタ
  const candidates = FEEDBACK_TEMPLATES
    .filter((t) => t.target === target && delta >= t.minDelta)
    .sort((a, b) => b.minDelta - a.minDelta);

  if (candidates.length === 0) return null;

  // 最初（最大閾値）にマッチしたものを採用
  const tpl = candidates[0];
  return { message: tpl.message, practiceType: tpl.practiceType };
}

/**
 * 複数の stat delta から最も印象的なフィードバックを1件だけ返す。
 * （delta が大きいほど優先度が高い）
 *
 * @param deltas  StatTarget → delta のマップ
 * @returns       最優先フィードバック、または null（全て delta < 1 の場合）
 */
export function pickBestFeedback(
  deltas: Partial<Record<StatTarget, number>>
): FeedbackResult | null {
  let best: FeedbackResult | null = null;
  let bestDelta = 0;

  for (const [target, delta] of Object.entries(deltas) as [StatTarget, number][]) {
    if ((delta ?? 0) <= bestDelta) continue;
    const result = buildFeedbackMessage(target as StatTarget, delta ?? 0);
    if (result) {
      best = result;
      bestDelta = delta ?? 0;
    }
  }

  return best;
}
