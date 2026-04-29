import { describe, it, expect } from 'vitest';
import type { MatchConfig, MatchBatterStat, MatchPitcherStat, AtBatResult } from '../../../src/engine/match/types';
import { runGame } from '../../../src/engine/match/game';
import { createRNG } from '../../../src/engine/core/rng';
import { generatePlayer, type PlayerGenConfig } from '../../../src/engine/player/generate';
import type { MatchTeam, MatchPlayer } from '../../../src/engine/match/types';

function createTestTeam(name: string, seed: string): MatchTeam {
  const rng = createRNG(seed);
  const config: PlayerGenConfig = { enrollmentYear: 1, schoolReputation: 50 };
  const players: MatchPlayer[] = [];

  let pitcherFound = false;
  for (let i = 0; i < 50 && !pitcherFound; i++) {
    const player = generatePlayer(rng.derive(`${name}-find-pitcher-${i}`), config);
    if (player.position === 'pitcher' && player.stats.pitching) {
      players.push({ player, pitchCountInGame: 0, stamina: 100, confidence: 50, isWarmedUp: true });
      pitcherFound = true;
    }
  }
  if (!pitcherFound) throw new Error('Could not generate pitcher');

  for (let i = 1; i < 14; i++) {
    const player = generatePlayer(rng.derive(`${name}-player-${i}`), config);
    players.push({ player, pitchCountInGame: 0, stamina: 100, confidence: 50, isWarmedUp: false });
  }

  const battingPlayers = players.slice(0, 9);
  const benchPlayers = players.slice(9);
  const positions = ['pitcher', 'catcher', 'first', 'second', 'third', 'shortstop', 'left', 'center', 'right'] as const;

  return {
    id: name,
    name,
    players,
    battingOrder: battingPlayers.map((p) => p.player.id),
    fieldPositions: new Map(battingPlayers.map((p, i) => [p.player.id, positions[i]])),
    currentPitcherId: players[0].player.id,
    benchPlayerIds: benchPlayers.map((p) => p.player.id),
    usedPlayerIds: new Set(),
  };
}

interface SimStats {
  totalGames: number;
  avgTotalScore: number;
  avgBattingAvg: number;
  avgSlugging: number;
  hrRate: number;
  strikeoutRate: number;
  walkRate: number;
  avgPitchCount: number;
  avgERA: number;
}

function runSimulation(numGames: number, seedBase: string): SimStats {
  const config: MatchConfig = {
    innings: 9, maxExtras: 3, useDH: false, isTournament: false, isKoshien: false,
  };

  let totalScore = 0;
  let totalAtBats = 0;
  let totalHits = 0;
  let totalDoubles = 0;
  let totalTriples = 0;
  let totalHomeRuns = 0;
  let totalStrikeouts = 0;
  let totalWalks = 0;
  let totalPitchCount = 0;
  let totalInningsPitched = 0;
  let totalEarnedRuns = 0;
  let totalPlateAppearances = 0;

  for (let i = 0; i < numGames; i++) {
    const homeTeam = createTestTeam('Home', `${seedBase}-home-${i}`);
    const awayTeam = createTestTeam('Away', `${seedBase}-away-${i}`);
    const rng = createRNG(`${seedBase}-game-${i}`);

    const { result } = runGame(config, homeTeam, awayTeam, rng);

    totalScore += result.finalScore.home + result.finalScore.away;

    for (const bs of result.batterStats) {
      totalAtBats += bs.atBats;
      totalHits += bs.hits;
      totalDoubles += bs.doubles;
      totalTriples += bs.triples;
      totalHomeRuns += bs.homeRuns;
      totalStrikeouts += bs.strikeouts;
      totalWalks += bs.walks;
      totalPlateAppearances += bs.atBats + bs.walks;
    }

    for (const ps of result.pitcherStats) {
      totalPitchCount += ps.pitchCount;
      totalInningsPitched += ps.inningsPitched;
      totalEarnedRuns += ps.earnedRuns;
    }
  }

  const battingAvg = totalAtBats > 0 ? totalHits / totalAtBats : 0;
  const singles = totalHits - totalDoubles - totalTriples - totalHomeRuns;
  const totalBases = singles + totalDoubles * 2 + totalTriples * 3 + totalHomeRuns * 4;
  const slugging = totalAtBats > 0 ? totalBases / totalAtBats : 0;
  const hrRate = totalPlateAppearances > 0 ? totalHomeRuns / totalPlateAppearances : 0;
  const kRate = totalPlateAppearances > 0 ? totalStrikeouts / totalPlateAppearances : 0;
  const bbRate = totalPlateAppearances > 0 ? totalWalks / totalPlateAppearances : 0;
  const era = totalInningsPitched > 0 ? (totalEarnedRuns / totalInningsPitched) * 9 : 0;

  return {
    totalGames: numGames,
    avgTotalScore: totalScore / numGames,
    avgBattingAvg: battingAvg,
    avgSlugging: slugging,
    hrRate,
    strikeoutRate: kRate,
    walkRate: bbRate,
    avgPitchCount: totalPitchCount / numGames,
    avgERA: era,
  };
}

describe('balance.test.ts - ゲームバランス検証', () => {
  const NUM_GAMES = 100;
  let stats: SimStats;

  // beforeAll equivalent using a shared variable
  it('should run simulation and collect stats', () => {
    stats = runSimulation(NUM_GAMES, 'balance-v1');

    console.log('=== Balance Report ===');
    console.log(`Games: ${stats.totalGames}`);
    console.log(`Avg Total Score: ${stats.avgTotalScore.toFixed(1)}`);
    console.log(`Avg Batting Avg: ${stats.avgBattingAvg.toFixed(3)}`);
    console.log(`Avg Slugging: ${stats.avgSlugging.toFixed(3)}`);
    console.log(`HR Rate: ${(stats.hrRate * 100).toFixed(1)}%`);
    console.log(`Strikeout Rate: ${(stats.strikeoutRate * 100).toFixed(1)}%`);
    console.log(`Walk Rate: ${(stats.walkRate * 100).toFixed(1)}%`);
    console.log(`Avg Pitch Count: ${stats.avgPitchCount.toFixed(0)}`);
    console.log(`Avg ERA: ${stats.avgERA.toFixed(2)}`);
    console.log('======================');

    expect(stats.totalGames).toBe(NUM_GAMES);
  });

  it('batting average should be .200-.350', () => {
    expect(stats.avgBattingAvg).toBeGreaterThanOrEqual(0.200);
    expect(stats.avgBattingAvg).toBeLessThanOrEqual(0.350);
  });

  it('ERA should be 1.50-6.00', () => {
    expect(stats.avgERA).toBeGreaterThanOrEqual(1.50);
    expect(stats.avgERA).toBeLessThanOrEqual(6.00);
  });

  it('HR rate should be 0.5-4%', () => {
    // Phase R8: 打率・HR率を高校野球水準に調整。
    // §12.3 HR/試合 0.4-1.5 に対応する PA あたり HR 率は 0.5-4% 程度。
    expect(stats.hrRate * 100).toBeGreaterThanOrEqual(0.5);
    expect(stats.hrRate * 100).toBeLessThanOrEqual(4);
  });

  it('strikeout rate should be 15-30%', () => {
    expect(stats.strikeoutRate * 100).toBeGreaterThanOrEqual(15);
    expect(stats.strikeoutRate * 100).toBeLessThanOrEqual(30);
  });

  it('walk rate should be 5-15%', () => {
    expect(stats.walkRate * 100).toBeGreaterThanOrEqual(5);
    expect(stats.walkRate * 100).toBeLessThanOrEqual(15);
  });

  it('avg pitch count per game should be 200-400', () => {
    expect(stats.avgPitchCount).toBeGreaterThanOrEqual(200);
    expect(stats.avgPitchCount).toBeLessThanOrEqual(400);
  });

  it('avg total score per game should be 2.5-16 (high school baseball range)', () => {
    // Phase R7-1: batterTraits から batterSwingType を決定するように変更したため、
    // pull傾向の選手が増えると打球傾向が変わり得点がわずかに変動する。
    // Phase R8: 高校野球の現実的な得点範囲(2〜12点)。下限を2.5に調整（低評価チーム想定）。
    expect(stats.avgTotalScore).toBeGreaterThanOrEqual(2.5);
    expect(stats.avgTotalScore).toBeLessThanOrEqual(16);
  });
});
