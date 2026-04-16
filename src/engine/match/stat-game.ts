/**
 * stat-game — Tier 3 (Minimal) 用統計ベース試合結果生成
 *
 * チーム総合力の差 + ランダムで勝敗決定。
 * スコアを統計的に生成する。
 * 目標: 5ms 以内で完了。
 */

import type { RNG } from '../core/rng';
import type { TeamSummary } from '../world/world-state';

// ============================================================
// 型定義
// ============================================================

export interface StatGameResult {
  score: { home: number; away: number };
  winnerId: string;
  /** エース・4番など主要3-4人の簡易成績 */
  keyPlayers: KeyPlayerResult[];
}

export interface KeyPlayerResult {
  playerId: string;
  schoolId: string;
  role: 'pitcher' | 'batter';
  highlights: string[];
}

// ============================================================
// 勝率計算
// ============================================================

/**
 * 総合力差から勝率を計算する（ロジスティック曲線）。
 * strength 差 10 ≒ 勝率 60%, 差 30 ≒ 勝率 80%
 */
function computeWinProbability(homeStrength: number, awayStrength: number): number {
  const diff = homeStrength - awayStrength;
  // ロジスティック関数: 1 / (1 + exp(-diff/15))
  return 1 / (1 + Math.exp(-diff / 15));
}

// ============================================================
// スコア生成
// ============================================================

/**
 * チームの攻撃力から期待得点を算出し、ポアソン分布近似でスコアを生成する。
 */
function generateScore(attackStrength: number, defenseStrength: number, rng: RNG): number {
  // 得点期待値: 攻守差から算出
  const advantage = (attackStrength - defenseStrength) / 100;
  const expectedRuns = Math.max(0.3, 2.5 + advantage * 4.0);

  // ポアソン分布近似（逆変換法）
  let runs = 0;
  const L = Math.exp(-expectedRuns);
  let p = 1.0;
  while (p > L) {
    p *= rng.next();
    if (p > L) runs++;
  }

  return runs;
}

// ============================================================
// メイン: statGame
// ============================================================

/**
 * Tier 3 用の統計ベース試合結果生成。
 * チーム総合力の差とランダム性で勝敗とスコアを決定する。
 */
export function statGame(
  homeTeam: TeamSummary,
  awayTeam: TeamSummary,
  rng: RNG,
): StatGameResult {
  const homeWinProb = computeWinProbability(homeTeam.strength, awayTeam.strength);
  const homeWins = rng.next() < homeWinProb;

  // スコア生成
  let homeScore: number;
  let awayScore: number;

  if (homeWins) {
    // ホームが勝つ: ホームのスコアが高くなるよう生成
    awayScore = generateScore(awayTeam.battingStrength, homeTeam.defenseStrength, rng.derive('away'));
    homeScore = awayScore + Math.max(1, generateScore(homeTeam.battingStrength - 10, awayTeam.defenseStrength, rng.derive('home-extra')));
  } else {
    homeScore = generateScore(homeTeam.battingStrength, awayTeam.defenseStrength, rng.derive('home'));
    awayScore = homeScore + Math.max(1, generateScore(awayTeam.battingStrength - 10, homeTeam.defenseStrength, rng.derive('away-extra')));
  }

  const winnerId = homeScore > awayScore ? homeTeam.id : awayTeam.id;

  return {
    score: { home: homeScore, away: awayScore },
    winnerId,
    keyPlayers: [],
  };
}
