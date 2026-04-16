/**
 * tournament-bracket — トーナメント表データ構造と生成
 *
 * 48校シングルエリミネーション。
 *
 * 方式:
 *  - 1回戦: 32校が16試合（→16勝者）
 *  - 2回戦: 16勝者 + 16シード校 = 32校 → 16試合
 *  - 3回戦以降: 通常のシングルエリミネーション
 *
 * ラウンド構成（6ラウンド）:
 *  Round 1: 16試合 (32 → 16)
 *  Round 2: 16試合 (16+16シード = 32 → 16)
 *  Round 3:  8試合 (16 → 8, ベスト8)
 *  Round 4:  4試合 (8 → 4, 準々決勝)
 *  Round 5:  2試合 (4 → 2, 準決勝)
 *  Round 6:  1試合 (2 → 1, 決勝)
 */

import type { RNG } from '../core/rng';
import type { HighSchool } from './world-state';

// ============================================================
// 型定義
// ============================================================

export type TournamentType = 'summer' | 'autumn' | 'koshien';

export interface TournamentMatch {
  matchId: string;
  round: number;
  matchIndex: number;
  homeSchoolId: string | null;
  awaySchoolId: string | null;
  winnerId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  isBye: boolean;
  isUpset: boolean;
}

export interface TournamentRound {
  roundNumber: number;
  roundName: string;
  matches: TournamentMatch[];
}

export interface TournamentBracket {
  id: string;
  type: TournamentType;
  year: number;
  totalTeams: number;
  rounds: TournamentRound[];
  isCompleted: boolean;
  champion: string | null;
}

// ============================================================
// ラウンド名
// ============================================================

function getRoundName(round: number, totalRounds: number): string {
  const fromFinal = totalRounds - round;
  if (fromFinal === 0) return '決勝';
  if (fromFinal === 1) return '準決勝';
  if (fromFinal === 2) return '準々決勝（ベスト8）';
  if (fromFinal === 3) return '3回戦（ベスト16）';
  if (fromFinal === 4) return '2回戦（ベスト32）';
  return `${round}回戦`;
}

// ============================================================
// トーナメント生成
// ============================================================

/**
 * 48校から6ラウンドのトーナメントブラケットを生成する。
 *
 * 構造:
 *  - 16校がシード（2回戦から参加）
 *  - 32校が1回戦（16試合）→ 16勝者が2回戦へ
 *  - 2回戦: 16勝者 + 16シード = 32校 → 16試合
 *  - 以降標準シングルエリミネーション
 */
export function createTournamentBracket(
  id: string,
  type: TournamentType,
  year: number,
  schools: HighSchool[],
  rng: RNG,
): TournamentBracket {
  const TOTAL_ROUNDS = 6;
  const TOTAL_TEAMS = schools.length; // 48

  // reputation 順でソート後、軽くシャッフル
  const sorted = [...schools].sort((a, b) => b.reputation - a.reputation);
  for (let i = sorted.length - 1; i > 0; i--) {
    const range = Math.min(6, i);
    const j = Math.max(0, i - Math.floor(rng.next() * range));
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
  }

  // 上位16校をシード（2回戦から）
  const SEED_COUNT = 16;
  const ROUND1_TEAMS = TOTAL_TEAMS - SEED_COUNT; // 32
  const seededSchools = sorted.slice(0, SEED_COUNT);
  const round1Schools = sorted.slice(SEED_COUNT); // 32校

  // --- Round 1: 32校 → 16試合 ---
  const round1Matches: TournamentMatch[] = [];
  for (let i = 0; i < ROUND1_TEAMS / 2; i++) {
    const home = round1Schools[i * 2];
    const away = round1Schools[i * 2 + 1];
    round1Matches.push({
      matchId: `${id}-r1-${i}`,
      round: 1,
      matchIndex: i,
      homeSchoolId: home?.id ?? null,
      awaySchoolId: away?.id ?? null,
      winnerId: null,
      homeScore: null,
      awayScore: null,
      isBye: false,
      isUpset: false,
    });
  }

  // --- Round 2: 32試合スロット（16は1回戦勝者、16はシード校）---
  // シード校は各ブロックの上側に配置
  const round2Matches: TournamentMatch[] = [];
  for (let i = 0; i < 16; i++) {
    const seed = seededSchools[i];
    round2Matches.push({
      matchId: `${id}-r2-${i}`,
      round: 2,
      matchIndex: i,
      homeSchoolId: seed?.id ?? null, // シード校は home として事前配置
      awaySchoolId: null,             // 1回戦勝者が入る（伝播で埋まる）
      winnerId: null,
      homeScore: null,
      awayScore: null,
      isBye: false,
      isUpset: false,
    });
  }

  // --- Round 3〜6: 空スロット ---
  const laterRounds: TournamentRound[] = [];
  const roundSizes = [8, 4, 2, 1];
  for (let r = 3; r <= TOTAL_ROUNDS; r++) {
    const matchCount = roundSizes[r - 3];
    const matches: TournamentMatch[] = Array.from({ length: matchCount }, (_, i) => ({
      matchId: `${id}-r${r}-${i}`,
      round: r,
      matchIndex: i,
      homeSchoolId: null,
      awaySchoolId: null,
      winnerId: null,
      homeScore: null,
      awayScore: null,
      isBye: false,
      isUpset: false,
    }));
    laterRounds.push({ roundNumber: r, roundName: getRoundName(r, TOTAL_ROUNDS), matches });
  }

  const rounds: TournamentRound[] = [
    { roundNumber: 1, roundName: getRoundName(1, TOTAL_ROUNDS), matches: round1Matches },
    { roundNumber: 2, roundName: getRoundName(2, TOTAL_ROUNDS), matches: round2Matches },
    ...laterRounds,
  ];

  return {
    id,
    type,
    year,
    totalTeams: TOTAL_TEAMS,
    rounds,
    isCompleted: false,
    champion: null,
  };
}

// ============================================================
// 1ラウンドシミュレーション
// ============================================================

export function simulateTournamentRound(
  bracket: TournamentBracket,
  roundNumber: number,
  schools: HighSchool[],
  rng: RNG,
): TournamentBracket {
  const schoolMap = new Map<string, HighSchool>();
  for (const s of schools) schoolMap.set(s.id, s);

  const newRounds = bracket.rounds.map((round) => {
    if (round.roundNumber !== roundNumber) return round;

    const newMatches = round.matches.map((match) => {
      if (match.winnerId !== null) return match;

      const home = match.homeSchoolId ? schoolMap.get(match.homeSchoolId) ?? null : null;
      const away = match.awaySchoolId ? schoolMap.get(match.awaySchoolId) ?? null : null;

      if (!home && !away) return match;
      if (!home) return { ...match, winnerId: away!.id, homeScore: 0, awayScore: 0 };
      if (!away) return { ...match, winnerId: home.id, isBye: true, homeScore: 0, awayScore: 0 };

      const repDiff = (home.reputation - away.reputation) / 100;
      const homeWinProb = Math.max(0.15, Math.min(0.85, 0.5 + repDiff * 0.6));
      const rand = rng.derive(`${match.matchId}`).next();
      const homeWins = rand < homeWinProb;
      const winner = homeWins ? home : away;
      const loser = homeWins ? away : home;

      const runDiff = Math.max(1, Math.round(1 + (winner.reputation - loser.reputation) / 30 + rng.derive(`${match.matchId}-score`).next() * 3));
      const loserScore = Math.max(0, Math.round(rng.derive(`${match.matchId}-ls`).next() * 5));
      const winnerScore = loserScore + runDiff;

      const homeScore = homeWins ? winnerScore : loserScore;
      const awayScore = homeWins ? loserScore : winnerScore;
      const isUpset = loser.reputation - winner.reputation > 15;

      return { ...match, winnerId: winner.id, homeScore, awayScore, isUpset };
    });

    return { ...round, matches: newMatches };
  });

  // 勝者を次ラウンドに伝播
  const updatedRounds = propagateWinners(newRounds, roundNumber);

  // 完了チェック: 全試合に勝者がいる
  const allMatchesDecided = updatedRounds.every((r) =>
    r.matches.every((m) =>
      m.winnerId !== null ||
      (m.homeSchoolId === null && m.awaySchoolId === null)
    )
  );

  const finalRound = updatedRounds.find((r) => r.roundNumber === 6);
  const champion = finalRound?.matches[0]?.winnerId ?? null;

  return {
    ...bracket,
    rounds: updatedRounds,
    isCompleted: allMatchesDecided && champion !== null,
    champion,
  };
}

function propagateWinners(rounds: TournamentRound[], justCompleted: number): TournamentRound[] {
  const currentRound = rounds.find((r) => r.roundNumber === justCompleted);
  const nextRound = rounds.find((r) => r.roundNumber === justCompleted + 1);
  if (!currentRound || !nextRound) return rounds;

  const newNextMatches = [...nextRound.matches];

  // Round 1 → Round 2: 勝者は round2 の awaySchoolId に入る
  // Round 2 → Round 3 以降: 通常の伝播
  if (justCompleted === 1) {
    // 1回戦の勝者を 2回戦の awaySchoolId に埋める（シード校が home 側）
    currentRound.matches.forEach((match, i) => {
      if (!match.winnerId) return;
      if (i < newNextMatches.length) {
        newNextMatches[i] = { ...newNextMatches[i], awaySchoolId: match.winnerId };
      }
    });
  } else {
    // Round N (N≥2) → Round N+1: 通常の勝者伝播
    currentRound.matches.forEach((match, i) => {
      if (!match.winnerId) return;
      const nextMatchIdx = Math.floor(i / 2);
      if (nextMatchIdx >= newNextMatches.length) return;
      const isHome = i % 2 === 0;
      const cur = newNextMatches[nextMatchIdx];
      if (isHome) {
        newNextMatches[nextMatchIdx] = { ...cur, homeSchoolId: match.winnerId };
      } else {
        newNextMatches[nextMatchIdx] = { ...cur, awaySchoolId: match.winnerId };
      }
    });
  }

  return rounds.map((r) =>
    r.roundNumber === justCompleted + 1 ? { ...r, matches: newNextMatches } : r
  );
}

// ============================================================
// 全ラウンドシミュレーション
// ============================================================

export function simulateFullTournament(
  bracket: TournamentBracket,
  schools: HighSchool[],
  rng: RNG,
): TournamentBracket {
  let current = bracket;
  const totalRounds = bracket.rounds.length;
  for (let r = 1; r <= totalRounds; r++) {
    current = simulateTournamentRound(current, r, schools, rng.derive(`round-${r}`));
  }
  // 強制的に完了マーク（全ラウンドが終わった後）
  const finalRound = current.rounds.find((r) => r.roundNumber === current.rounds.length);
  const champion = finalRound?.matches[0]?.winnerId ?? null;
  return { ...current, isCompleted: champion !== null, champion };
}
