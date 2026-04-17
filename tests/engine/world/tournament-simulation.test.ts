/**
 * tests/engine/world/tournament-simulation.test.ts
 *
 * Phase 5.5: 大会試合の実シミュレーション確認テスト
 *
 * - simulateTournamentRound が quickGame を使っていること
 * - イニングスコアが [1,1,1,...,0] パターンにならないこと
 * - 48校全ラウンド完走テスト（5秒以内）
 * - skipPlayerMatch オプションで自校試合が未決のまま返ること
 * - inningScores の合計が homeScore/awayScore と一致すること
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import {
  createTournamentBracket,
  simulateTournamentRound,
  simulateFullTournament,
} from '@/engine/world/tournament-bracket';
import type { TournamentBracket } from '@/engine/world/tournament-bracket';
import type { HighSchool } from '@/engine/world/world-state';
import { generatePlayer } from '@/engine/player/generate';
import {
  createEmptyYearResults,
} from '@/engine/world/world-state';

// ============================================================
// テストヘルパー
// ============================================================

function makeSchool(id: string, reputation = 50): HighSchool {
  const rng = createRNG(`school-${id}`);
  const players = Array.from({ length: 18 }, (_, i) =>
    generatePlayer(rng.derive(`p${i}`), { enrollmentYear: 1, schoolReputation: reputation })
  );
  return {
    id,
    name: `${id}高校`,
    prefecture: '新潟',
    reputation,
    players,
    lineup: null,
    facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 },
    simulationTier: 'standard',
    coachStyle: {
      offenseType: 'balanced',
      defenseType: 'balanced',
      practiceEmphasis: 'balanced',
      aggressiveness: 50,
    },
    yearResults: createEmptyYearResults(),
    _summary: null,
  };
}

function make48Schools(playerRep = 55): HighSchool[] {
  const schools: HighSchool[] = [];
  schools.push(makeSchool('player-school', playerRep));
  for (let i = 1; i < 48; i++) {
    schools.push(makeSchool(`ai-${i}`, 30 + (i % 60)));
  }
  return schools;
}

// ============================================================
// テスト
// ============================================================

describe('simulateTournamentRound — 実シミュレーション', () => {
  it('ラウンド完了後、全試合に winnerId が設定される', () => {
    const rng = createRNG('test-round-complete');
    const schools = make48Schools();
    const bracket = createTournamentBracket('test', 'summer', 1, schools, rng.derive('bracket'));
    const result = simulateTournamentRound(bracket, 1, schools, rng.derive('round1'));

    const round1 = result.rounds.find((r) => r.roundNumber === 1)!;
    for (const match of round1.matches) {
      expect(match.winnerId).not.toBeNull();
    }
  });

  it('各試合に inningScores が設定される', () => {
    const rng = createRNG('test-inning-scores');
    const schools = make48Schools();
    const bracket = createTournamentBracket('test', 'summer', 1, schools, rng.derive('bracket'));
    const result = simulateTournamentRound(bracket, 1, schools, rng.derive('round1'));

    const round1 = result.rounds.find((r) => r.roundNumber === 1)!;
    for (const match of round1.matches) {
      if (match.isBye) continue;
      expect(match.inningScores).not.toBeNull();
      expect(match.inningScores!.home.length).toBeGreaterThanOrEqual(9);
      expect(match.inningScores!.away.length).toBeGreaterThanOrEqual(9);
    }
  });

  it('inningScores の合計が homeScore/awayScore と一致する', () => {
    const rng = createRNG('test-score-sum');
    const schools = make48Schools();
    const bracket = createTournamentBracket('test', 'summer', 1, schools, rng.derive('bracket'));
    const result = simulateTournamentRound(bracket, 1, schools, rng.derive('round1'));

    const round1 = result.rounds.find((r) => r.roundNumber === 1)!;
    for (const match of round1.matches) {
      if (match.isBye || !match.inningScores) continue;
      const homeSum = match.inningScores.home.reduce((a, b) => a + b, 0);
      const awaySum = match.inningScores.away.reduce((a, b) => a + b, 0);
      expect(homeSum).toBe(match.homeScore ?? 0);
      expect(awaySum).toBe(match.awayScore ?? 0);
    }
  });

  it('distributeScore の [1,1,1,...,0] パターンにならない（複数ラウンドで検証）', () => {
    const rng = createRNG('test-no-uniform-pattern');
    const schools = make48Schools();
    const bracket = createTournamentBracket('test', 'summer', 1, schools, rng.derive('bracket'));

    // 全ラウンド実行
    const fullResult = simulateFullTournament(bracket, schools, rng.derive('full'));

    // 全試合のイニングスコアを収集（bye除く、実スコアが3点以上の試合）
    const nonUniformFound = { home: false, away: false };

    for (const round of fullResult.rounds) {
      for (const match of round.matches) {
        if (match.isBye || !match.inningScores) continue;
        const { home, away } = match.inningScores;

        // スコアが複数の異なるイニングに分散しているか確認
        // distributeScore のバグでは常に前半のイニングに均等分散される
        const homeScore = home.reduce((a, b) => a + b, 0);
        const awayScore = away.reduce((a, b) => a + b, 0);

        // 3点以上入った試合でチェック
        if (homeScore >= 3) {
          // 3点が全て1回〜3回に入っている（distributeScore パターン）でない試合があるか
          const firstThreeSum = home.slice(0, 3).reduce((a, b) => a + b, 0);
          if (firstThreeSum < homeScore) {
            nonUniformFound.home = true;
          }
        }
        if (awayScore >= 3) {
          const firstThreeSum = away.slice(0, 3).reduce((a, b) => a + b, 0);
          if (firstThreeSum < awayScore) {
            nonUniformFound.away = true;
          }
        }
      }
    }

    // 全試合を通じて、少なくとも一つの試合で後半イニングにも点が入っている
    expect(nonUniformFound.home || nonUniformFound.away).toBe(true);
  });

  it('totalInnings が設定される（9以上）', () => {
    const rng = createRNG('test-total-innings');
    const schools = make48Schools();
    const bracket = createTournamentBracket('test', 'summer', 1, schools, rng.derive('bracket'));
    const result = simulateTournamentRound(bracket, 1, schools, rng.derive('round1'));

    const round1 = result.rounds.find((r) => r.roundNumber === 1)!;
    for (const match of round1.matches) {
      if (match.isBye) continue;
      expect(match.totalInnings).not.toBeNull();
      expect(match.totalInnings!).toBeGreaterThanOrEqual(9);
    }
  });

  it('skipPlayerMatch オプションで自校試合が未決のまま返る', () => {
    const rng = createRNG('test-skip-player');
    const schools = make48Schools(55);
    const playerSchoolId = 'player-school';
    const bracket = createTournamentBracket('test', 'summer', 1, schools, rng.derive('bracket'));

    // 自校がラウンド1にいるか確認（いない可能性がある—シード校なら Round 2 から）
    const round1 = bracket.rounds.find((r) => r.roundNumber === 1)!;
    const playerInRound1 = round1.matches.some(
      (m) => m.homeSchoolId === playerSchoolId || m.awaySchoolId === playerSchoolId
    );

    if (!playerInRound1) {
      // 自校がシードの場合、Round 2 でテスト
      const result1 = simulateTournamentRound(bracket, 1, schools, rng.derive('round1'));
      const result2 = simulateTournamentRound(result1, 2, schools, rng.derive('round2'), {
        skipPlayerMatch: true,
        playerSchoolId,
      });
      const round2 = result2.rounds.find((r) => r.roundNumber === 2)!;
      const playerMatch2 = round2.matches.find(
        (m) => m.homeSchoolId === playerSchoolId || m.awaySchoolId === playerSchoolId
      );
      if (playerMatch2) {
        expect(playerMatch2.winnerId).toBeNull();
      }
      return;
    }

    const result = simulateTournamentRound(bracket, 1, schools, rng.derive('round1'), {
      skipPlayerMatch: true,
      playerSchoolId,
    });

    const resultRound1 = result.rounds.find((r) => r.roundNumber === 1)!;
    const playerMatch = resultRound1.matches.find(
      (m) => m.homeSchoolId === playerSchoolId || m.awaySchoolId === playerSchoolId
    );

    // 自校の試合は未決のまま
    expect(playerMatch?.winnerId).toBeNull();

    // 他の試合は全て決定済み
    const otherMatches = resultRound1.matches.filter(
      (m) => m.homeSchoolId !== playerSchoolId && m.awaySchoolId !== playerSchoolId
    );
    for (const m of otherMatches) {
      expect(m.winnerId).not.toBeNull();
    }
  });
});

describe('simulateFullTournament — 全ラウンド完走テスト', () => {
  it('48校大会が正常に完走し champion が決まる', () => {
    const rng = createRNG('test-full-tournament');
    const schools = make48Schools();
    const bracket = createTournamentBracket('test', 'summer', 1, schools, rng.derive('bracket'));
    const result = simulateFullTournament(bracket, schools, rng.derive('full'));

    expect(result.isCompleted).toBe(true);
    expect(result.champion).not.toBeNull();
  });

  it('48校大会が5秒以内に完走する', () => {
    const rng = createRNG('test-perf');
    const schools = make48Schools();
    const bracket = createTournamentBracket('test', 'summer', 1, schools, rng.derive('bracket'));

    const start = Date.now();
    simulateFullTournament(bracket, schools, rng.derive('full'));
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000);
  });

  it('全試合の inningScores 合計がスコアと一致する', () => {
    const rng = createRNG('test-full-scores');
    const schools = make48Schools();
    const bracket = createTournamentBracket('test', 'summer', 1, schools, rng.derive('bracket'));
    const result = simulateFullTournament(bracket, schools, rng.derive('full'));

    for (const round of result.rounds) {
      for (const match of round.matches) {
        if (!match.inningScores || match.isBye) continue;
        if (match.homeScore === null || match.awayScore === null) continue;

        const homeSum = match.inningScores.home.reduce((a, b) => a + b, 0);
        const awaySum = match.inningScores.away.reduce((a, b) => a + b, 0);
        expect(homeSum).toBe(match.homeScore);
        expect(awaySum).toBe(match.awayScore);
      }
    }
  });

  it('決勝戦（Round 6）に inningScores が存在する', () => {
    const rng = createRNG('test-final-innings');
    const schools = make48Schools();
    const bracket = createTournamentBracket('test', 'summer', 1, schools, rng.derive('bracket'));
    const result = simulateFullTournament(bracket, schools, rng.derive('full'));

    const finalRound = result.rounds.find((r) => r.roundNumber === 6)!;
    const finalMatch = finalRound.matches[0];
    expect(finalMatch.inningScores).not.toBeNull();
    expect(finalMatch.mvpPlayerId).toBeDefined(); // null も可だが defined
  });
});
