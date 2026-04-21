/**
 * rank-calculator.ts — 評価者ランク計算 (Phase 11.5-C)
 *
 * 純粋関数。WorldState や RNG に依存しない。
 */

import type { Player } from '../types/player';
import type { Evaluator, EvaluatorRank, EvaluatorFocus } from '../types/evaluator';
import { computePlayerOverall } from '../world/career/draft-system';

// ============================================================
// ランクしきい値（得点ベース）
// ============================================================

const RANK_THRESHOLDS: Array<{ rank: EvaluatorRank; minScore: number }> = [
  { rank: 'SSS', minScore: 92 },
  { rank: 'SS',  minScore: 85 },
  { rank: 'S',   minScore: 78 },
  { rank: 'A',   minScore: 68 },
  { rank: 'B',   minScore: 55 },
  { rank: 'C',   minScore: 42 },
  { rank: 'D',   minScore: 30 },
  { rank: 'E',   minScore: 15 },
  { rank: 'F',   minScore: 0 },
];

/** 得点からランクに変換する */
export function scoreToRank(score: number): EvaluatorRank {
  for (const { rank, minScore } of RANK_THRESHOLDS) {
    if (score >= minScore) return rank;
  }
  return 'F';
}

// ============================================================
// フォーカスに基づく基準スコア計算
// ============================================================

/**
 * 評価者のフォーカスに基づいて選手の基準スコアを計算する
 */
function computeFocusScore(player: Player, focus: EvaluatorFocus): number {
  const s = player.stats;
  const overall = computePlayerOverall(player);

  switch (focus) {
    case 'pitcher_overall':
      if (!s.pitching) return overall * 0.4;
      return (s.pitching.velocity + s.pitching.control + s.pitching.pitchStamina) / 3;

    case 'pitcher_velocity':
      if (!s.pitching) return 0;
      return s.pitching.velocity;

    case 'pitcher_control':
      if (!s.pitching) return 0;
      return s.pitching.control;

    case 'batter_overall':
      return (s.batting.contact + s.batting.power + s.batting.eye + s.batting.technique) / 4;

    case 'batter_power':
      return s.batting.power;

    case 'batter_contact':
      return s.batting.contact;

    case 'defense_fielding':
      return (s.base.fielding + s.base.armStrength) / 2;

    case 'speed_running':
      return s.base.speed;

    case 'mental_focus':
      return (s.base.mental + s.base.focus) / 2;

    case 'koshien_record':
      // 甲子園実績は外部から注入できないため、overall + 全体バイアスで代替
      return overall;

    case 'battery_pair':
      if (player.position === 'pitcher') return s.pitching ? s.pitching.velocity : overall;
      if (player.position === 'catcher') return (s.base.fielding + s.base.focus) / 2;
      return overall * 0.5;

    case 'breaking_ball':
      if (!s.pitching) return 0;
      // 変化球の種類数 × 球種レベル平均
      const pitches = s.pitching.pitches ?? {};
      const pitchValues = Object.values(pitches).filter((v) => v != null) as number[];
      if (pitchValues.length === 0) return s.pitching.control * 0.5;
      const avgPitch = pitchValues.reduce((a, b) => a + b, 0) / pitchValues.length;
      return avgPitch * 0.6 + s.pitching.control * 0.4;

    case 'stamina':
      return s.base.stamina;

    default:
      return overall;
  }
}

// ============================================================
// 公開 API
// ============================================================

/**
 * 評価者が選手を評価したときの得点を計算する（純粋関数）。
 *
 * @param evaluator  評価者データ
 * @param player     評価対象選手
 * @returns          0〜100 の評価得点
 */
export function calcEvaluatorScore(evaluator: Evaluator, player: Player): number {
  const bias = evaluator.bias;

  // フォーカスに基づく基準スコア (0-100)
  let score = computeFocusScore(player, evaluator.focus);

  // 全体バイアス適用 (× 10点)
  score += bias.generalBias * 10;

  // ポジションバイアス適用
  if (bias.positionBias) {
    const posBias = bias.positionBias[player.position] ?? 0;
    score += posBias;
  }

  // 閾値ボーナス適用
  if (bias.thresholdBonuses) {
    for (const bonus of bias.thresholdBonuses) {
      const statVal = getStatValue(player, bonus.stat);
      if (statVal >= bonus.threshold) {
        score += bonus.bonus;
      }
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * 評価者が選手を評価したときのランクを計算する（純粋関数）。
 *
 * @param evaluator  評価者データ
 * @param player     評価対象選手
 * @returns          評価ランク (SSS〜F)
 */
export function calcEvaluatorRank(evaluator: Evaluator, player: Player): EvaluatorRank {
  const score = calcEvaluatorScore(evaluator, player);
  return scoreToRank(score);
}

// ============================================================
// 内部ヘルパー
// ============================================================

/**
 * ドット記法で選手の能力値を取得する。
 * 例: 'base.stamina', 'batting.contact', 'pitching.velocity'
 */
function getStatValue(player: Player, statPath: string): number {
  const parts = statPath.split('.');
  if (parts.length !== 2) return 0;

  const [group, key] = parts;
  const stats = player.stats;

  if (group === 'base') {
    return ((stats.base as unknown) as Record<string, number>)[key] ?? 0;
  }
  if (group === 'batting') {
    return ((stats.batting as unknown) as Record<string, number>)[key] ?? 0;
  }
  if (group === 'pitching' && stats.pitching) {
    return ((stats.pitching as unknown) as Record<string, number>)[key] ?? 0;
  }
  return 0;
}
