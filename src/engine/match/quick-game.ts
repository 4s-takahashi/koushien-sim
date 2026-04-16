/**
 * quick-game — Tier 2 (Standard) 用簡易試合エンジン
 *
 * イニングごとにチーム力差ベースでスコアを生成する。
 * 各打者に簡易打席結果（安打/凡退/HR等）を付与。
 * 目標: 50ms 以内で完了。
 */

import type { RNG } from '../core/rng';
import type { Player } from '../types/player';
import type { MatchTeam, MatchConfig } from './types';

// ============================================================
// 型定義
// ============================================================

export interface QuickBatterResult {
  playerId: string;
  atBats: number;
  hits: number;
  homeRuns: number;
  rbis: number;
  strikeouts: number;
  walks: number;
}

export interface QuickPitcherResult {
  playerId: string;
  inningsPitched: number;
  earnedRuns: number;
  strikeouts: number;
  walks: number;
}

export interface QuickGameResult {
  score: { home: number; away: number };
  winnerId: string;
  inningScores: { home: number[]; away: number[] };
  batterResults: QuickBatterResult[];
  pitcherResults: QuickPitcherResult[];
  mvpId: string | null;
  highlights: string[];
}

// ============================================================
// チーム強度計算
// ============================================================

function computeTeamStrength(team: MatchTeam): {
  batting: number;
  pitching: number;
  overall: number;
} {
  const players = team.players.map((mp) => mp.player);
  if (players.length === 0) {
    return { batting: 30, pitching: 30, overall: 30 };
  }

  const batSum = players.reduce((acc, p) => {
    return acc + (p.stats.batting.contact + p.stats.batting.power + p.stats.batting.eye + p.stats.batting.technique) / 4;
  }, 0);
  const batting = batSum / players.length;

  const pitchers = players.filter((p) => p.stats.pitching !== null);
  let pitching: number;
  if (pitchers.length > 0) {
    const pitchSum = pitchers.reduce((acc, p) => {
      const pit = p.stats.pitching!;
      // Normalize velocity to 0-100 scale
      const velNorm = ((pit.velocity - 80) / 80) * 100;
      return acc + (velNorm + pit.control + pit.pitchStamina) / 3;
    }, 0);
    pitching = pitchSum / pitchers.length;
  } else {
    pitching = batting * 0.7;
  }

  return { batting, pitching, overall: (batting + pitching) / 2 };
}

// ============================================================
// 1イニング分の得点計算
// ============================================================

function simulateHalfInning(
  offenseStrength: number,  // 攻撃側の打力 0-100
  defenseStrength: number,  // 守備側の投力 0-100
  rng: RNG,
): { runs: number; hits: number; outs: number } {
  // 実力差から得点期待値を計算
  const advantage = (offenseStrength - defenseStrength) / 100;
  // 基本出塁率: 実力差 +0.15 〜 0.45
  const obp = Math.max(0.05, Math.min(0.60, 0.30 + advantage * 0.3));
  // 基本長打率: OBP の1.5倍前後
  const slg = Math.max(0.05, Math.min(0.90, obp * 1.5));

  let runs = 0;
  let hits = 0;
  let outs = 0;
  let baserunners = 0; // 簡易: 走者数

  while (outs < 3) {
    if (rng.next() < obp) {
      hits++;
      baserunners++;
      // 長打判定
      if (rng.next() < slg - obp) {
        // ホームラン判定（slgが高いほど出やすい）
        if (rng.next() < 0.08 * (offenseStrength / 80)) {
          runs += baserunners;
          baserunners = 0;
        } else {
          // 2塁打・3塁打: ランナーの一部が生還
          const scored = Math.floor(baserunners * 0.6);
          runs += scored;
          baserunners = Math.max(1, baserunners - scored);
        }
      } else {
        // 単打: ランナーが進む
        if (baserunners >= 3) {
          runs += 1;
          baserunners--;
        }
      }
    } else {
      outs++;
      // ゴロアウト時のダブルプレー（簡易）
      if (outs < 3 && baserunners > 0 && rng.next() < 0.15) {
        outs++;
        baserunners = Math.max(0, baserunners - 1);
      }
    }
  }

  return { runs, hits, outs };
}

// ============================================================
// 打者成績生成
// ============================================================

function generateBatterResults(
  team: MatchTeam,
  totalHits: number,
  totalRuns: number,
  rng: RNG,
): QuickBatterResult[] {
  const players = team.players.map((mp) => mp.player);
  const results: QuickBatterResult[] = players.map((p) => ({
    playerId: p.id,
    atBats: 0,
    hits: 0,
    homeRuns: 0,
    rbis: 0,
    strikeouts: 0,
    walks: 0,
  }));

  if (players.length === 0) return results;

  // 打順に従って打席数を割り当て（9イニング × 1チーム = 27打者）
  const order = team.battingOrder.length > 0 ? team.battingOrder : players.map((p) => p.id);
  const totalAtBats = Math.max(27, 27 + totalHits);

  for (let i = 0; i < totalAtBats; i++) {
    const pid = order[i % order.length];
    const idx = results.findIndex((r) => r.playerId === pid);
    if (idx >= 0) results[idx].atBats++;
  }

  // ヒット・HRの配分（強い打者に多めに）
  const batterStrengths = players.map((p) =>
    p.stats.batting.contact + p.stats.batting.power
  );
  const totalStrength = batterStrengths.reduce((a, b) => a + b, 0) || players.length;

  let hitsLeft = totalHits;
  let runsLeft = totalRuns;

  for (let i = 0; i < results.length && hitsLeft > 0; i++) {
    const prob = batterStrengths[i] / totalStrength;
    const playerHits = Math.round(hitsLeft * prob * (0.8 + rng.next() * 0.4));
    const actualHits = Math.min(playerHits, hitsLeft, results[i].atBats);
    results[i].hits = actualHits;
    hitsLeft -= actualHits;

    // HR判定（強力打者に）
    if (players[i].stats.batting.power > 60 && actualHits > 0 && rng.next() < 0.15) {
      results[i].homeRuns = 1;
    }
  }

  // RBI の配分
  for (let i = 0; i < results.length && runsLeft > 0; i++) {
    if (results[i].hits > 0) {
      const rbis = Math.min(runsLeft, Math.ceil(results[i].hits * 0.6));
      results[i].rbis = rbis;
      runsLeft -= rbis;
    }
  }

  return results;
}

// ============================================================
// 投手成績生成
// ============================================================

function generatePitcherResults(
  team: MatchTeam,
  runsAllowed: number,
  rng: RNG,
): QuickPitcherResult[] {
  const pitchers = team.players
    .filter((mp) => mp.player.stats.pitching !== null)
    .map((mp) => mp.player);

  if (pitchers.length === 0) {
    // 投手がいない場合は先頭打者が投手扱い
    const first = team.players[0]?.player;
    if (!first) return [];
    return [{
      playerId: first.id,
      inningsPitched: 9,
      earnedRuns: runsAllowed,
      strikeouts: Math.floor(rng.next() * 8),
      walks: Math.floor(rng.next() * 5),
    }];
  }

  // 先発投手が主に投げる
  const ace = pitchers[0];
  const acePitchStamina = ace.stats.pitching!.pitchStamina;
  const acePitchedInnings = Math.round(6 + (acePitchStamina / 100) * 3);

  const results: QuickPitcherResult[] = [{
    playerId: ace.id,
    inningsPitched: Math.min(9, acePitchedInnings),
    earnedRuns: Math.ceil(runsAllowed * (acePitchedInnings / 9)),
    strikeouts: Math.round(rng.next() * 10 + 2),
    walks: Math.round(rng.next() * 4),
  }];

  // リリーフ投手がいれば
  if (pitchers.length > 1 && acePitchedInnings < 9) {
    const reliefInnings = 9 - acePitchedInnings;
    results.push({
      playerId: pitchers[1].id,
      inningsPitched: reliefInnings,
      earnedRuns: runsAllowed - results[0].earnedRuns,
      strikeouts: Math.round(rng.next() * reliefInnings),
      walks: Math.round(rng.next() * reliefInnings * 0.5),
    });
  }

  return results;
}

// ============================================================
// MVP 選出
// ============================================================

function selectMVP(
  homeBatterResults: QuickBatterResult[],
  awayBatterResults: QuickBatterResult[],
  winnerId: string,
  homeId: string,
): string | null {
  const winnerResults = winnerId === homeId ? homeBatterResults : awayBatterResults;
  if (winnerResults.length === 0) return null;

  const best = winnerResults.reduce((prev, curr) => {
    const prevScore = prev.hits * 2 + prev.homeRuns * 4 + prev.rbis * 2;
    const currScore = curr.hits * 2 + curr.homeRuns * 4 + curr.rbis * 2;
    return currScore > prevScore ? curr : prev;
  });

  return best.playerId;
}

// ============================================================
// メイン: quickGame
// ============================================================

/**
 * Tier 2 用の簡易試合シミュレーション。
 * イニングごとにチーム力差ベースでスコアを生成する。
 */
export function quickGame(
  homeTeam: MatchTeam,
  awayTeam: MatchTeam,
  _config: MatchConfig,
  rng: RNG,
): QuickGameResult {
  const homeStrength = computeTeamStrength(homeTeam);
  const awayStrength = computeTeamStrength(awayTeam);

  const homeInnings: number[] = [];
  const awayInnings: number[] = [];
  let totalHomeHits = 0;
  let totalAwayHits = 0;

  for (let inning = 0; inning < 9; inning++) {
    // 表: away攻撃
    const awayHalf = simulateHalfInning(
      awayStrength.batting,
      homeStrength.pitching,
      rng.derive(`inn-${inning}-away`),
    );
    awayInnings.push(awayHalf.runs);
    totalAwayHits += awayHalf.hits;

    // 裏: home攻撃
    const homeHalf = simulateHalfInning(
      homeStrength.batting,
      awayStrength.pitching,
      rng.derive(`inn-${inning}-home`),
    );
    homeInnings.push(homeHalf.runs);
    totalHomeHits += homeHalf.hits;
  }

  let homeScore = homeInnings.reduce((a, b) => a + b, 0);
  let awayScore = awayInnings.reduce((a, b) => a + b, 0);

  // 引き分け防止（トーナメント）: タイブレーカー
  let tiebreakInning = 9;
  while (homeScore === awayScore && tiebreakInning < 15) {
    const awayExtra = simulateHalfInning(awayStrength.batting, homeStrength.pitching, rng.derive(`ext-${tiebreakInning}-away`));
    const homeExtra = simulateHalfInning(homeStrength.batting, awayStrength.pitching, rng.derive(`ext-${tiebreakInning}-home`));
    awayInnings.push(awayExtra.runs);
    homeInnings.push(homeExtra.runs);
    awayScore += awayExtra.runs;
    homeScore += homeExtra.runs;
    tiebreakInning++;
  }

  // 最終的に同点の場合はホームチームの勝ち（選手権ルール）
  const winnerId = homeScore >= awayScore ? homeTeam.id : awayTeam.id;

  // 打者・投手成績生成
  const homeBatterResults = generateBatterResults(homeTeam, totalHomeHits, homeScore, rng.derive('home-bat'));
  const awayBatterResults = generateBatterResults(awayTeam, totalAwayHits, awayScore, rng.derive('away-bat'));
  const homePitcherResults = generatePitcherResults(homeTeam, awayScore, rng.derive('home-pit'));
  const awayPitcherResults = generatePitcherResults(awayTeam, homeScore, rng.derive('away-pit'));

  const mvpId = selectMVP(homeBatterResults, awayBatterResults, winnerId, homeTeam.id);

  // ハイライト生成（簡易）
  const highlights: string[] = [];
  const allBatters = [...homeBatterResults, ...awayBatterResults];
  const hrBatters = allBatters.filter((b) => b.homeRuns > 0);
  for (const b of hrBatters) {
    const player = [...homeTeam.players, ...awayTeam.players].find((mp) => mp.player.id === b.playerId);
    if (player) {
      highlights.push(`${player.player.lastName}がホームランを放った`);
    }
  }

  return {
    score: { home: homeScore, away: awayScore },
    winnerId,
    inningScores: { home: homeInnings, away: awayInnings },
    batterResults: [...homeBatterResults, ...awayBatterResults],
    pitcherResults: [...homePitcherResults, ...awayPitcherResults],
    mvpId,
    highlights,
  };
}
