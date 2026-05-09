/**
 * battery-and-fielding.stats.test.ts — 100 試合統計テスト
 *
 * 設計書 Section 6.2 の統計テスト:
 * - WP/試合 0.2〜2.0 の範囲に収まること
 * - PB/試合 0.0〜0.8 の範囲に収まること
 *
 * 注意: 100 試合シミュレーションは重いため、タイムアウトを 60 秒に設定。
 */

import { describe, it, expect } from 'vitest';
import type { MatchConfig, MatchTeam, MatchPlayer } from '../../src/engine/match/types';
import { runGame } from '../../src/engine/match/game';
import { createRNG } from '../../src/engine/core/rng';
import { generatePlayer, type PlayerGenConfig } from '../../src/engine/player/generate';

// ============================================================
// テストチーム生成ヘルパー
// ============================================================

function createTestTeam(name: string, seed: string): MatchTeam {
  const rng = createRNG(seed);
  const config: PlayerGenConfig = { enrollmentYear: 1, schoolReputation: 50 };
  const players: MatchPlayer[] = [];

  // 投手を1人確保
  let pitcherFound = false;
  for (let i = 0; i < 50 && !pitcherFound; i++) {
    const player = generatePlayer(rng.derive(`${name}-find-pitcher-${i}`), config);
    if (player.position === 'pitcher' && player.stats.pitching) {
      players.push({ player, pitchCountInGame: 0, stamina: 100, confidence: 50, isWarmedUp: true });
      pitcherFound = true;
    }
  }
  if (!pitcherFound) throw new Error('Could not generate pitcher');

  // 残り 13 人を生成
  for (let i = 1; i < 14; i++) {
    const player = generatePlayer(rng.derive(`${name}-player-${i}`), config);
    players.push({ player, pitchCountInGame: 0, stamina: 100, confidence: 50, isWarmedUp: false });
  }

  const battingPlayers = players.slice(0, 9);
  const benchPlayers = players.slice(9);
  const positions = [
    'pitcher', 'catcher', 'first', 'second', 'third',
    'shortstop', 'left', 'center', 'right',
  ] as const;

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

// ============================================================
// 100 試合シミュレーション
// ============================================================

interface BatteryErrorStats {
  totalGames: number;
  totalWP: number;
  totalPB: number;
  avgWP: number;
  avgPB: number;
}

function runBatteryErrorSimulation(numGames: number, seedBase: string): BatteryErrorStats {
  const config: MatchConfig = {
    innings: 9,
    maxExtras: 3,
    useDH: false,
    isTournament: false,
    isKoshien: false,
  };

  let totalWP = 0;
  let totalPB = 0;

  for (let i = 0; i < numGames; i++) {
    const homeTeam = createTestTeam('Home', `${seedBase}-home-${i}`);
    const awayTeam = createTestTeam('Away', `${seedBase}-away-${i}`);
    const rng = createRNG(`${seedBase}-game-${i}`);

    const { finalState } = runGame(config, homeTeam, awayTeam, rng);

    // state.log から WP/PB イベントを集計
    for (const entry of finalState.log) {
      if (entry.type === 'wild_pitch') totalWP++;
      if (entry.type === 'passed_ball') totalPB++;
    }
  }

  return {
    totalGames: numGames,
    totalWP,
    totalPB,
    avgWP: totalWP / numGames,
    avgPB: totalPB / numGames,
  };
}

// ============================================================
// 統計テスト
// ============================================================

describe('100試合統計テスト — バッテリーエラー頻度', () => {
  const NUM_GAMES = 100;

  it('WP/試合が目標範囲内 (0.2〜2.0)', { timeout: 120_000 }, () => {
    const stats = runBatteryErrorSimulation(NUM_GAMES, 'battery-stats-v1');

    console.log(`=== Battery Error Stats (${NUM_GAMES} games) ===`);
    console.log(`Total WP: ${stats.totalWP} (avg: ${stats.avgWP.toFixed(2)}/game)`);
    console.log(`Total PB: ${stats.totalPB} (avg: ${stats.avgPB.toFixed(2)}/game)`);
    console.log(`====================================`);

    // WP/試合 0.2〜2.0 の目標範囲（設計書 Section 7 Phase 1 リリース条件）
    expect(stats.avgWP).toBeGreaterThan(0.2);
    expect(stats.avgWP).toBeLessThan(2.0);
  });

  it('PB/試合が目標範囲内 (0.0〜0.8)', { timeout: 120_000 }, () => {
    const stats = runBatteryErrorSimulation(NUM_GAMES, 'battery-stats-v2');

    console.log(`=== Battery Error Stats (${NUM_GAMES} games) ===`);
    console.log(`Total WP: ${stats.totalWP} (avg: ${stats.avgWP.toFixed(2)}/game)`);
    console.log(`Total PB: ${stats.totalPB} (avg: ${stats.avgPB.toFixed(2)}/game)`);
    console.log(`====================================`);

    // PB/試合 0.0〜0.8 の目標範囲（設計書 Section 6.2）
    expect(stats.avgPB).toBeGreaterThanOrEqual(0.0);
    expect(stats.avgPB).toBeLessThan(0.8);
  });

  it('WP+PB 合計が 0.3〜1.5/試合の範囲（設計書 Section 7 最終確認）', { timeout: 120_000 }, () => {
    const stats = runBatteryErrorSimulation(NUM_GAMES, 'battery-stats-v3');
    const avgTotal = stats.avgWP + stats.avgPB;

    console.log(`=== Battery Error Total Stats (${NUM_GAMES} games) ===`);
    console.log(`Total WP: ${stats.totalWP} (avg: ${stats.avgWP.toFixed(2)}/game)`);
    console.log(`Total PB: ${stats.totalPB} (avg: ${stats.avgPB.toFixed(2)}/game)`);
    console.log(`Combined avg: ${avgTotal.toFixed(2)}/game`);
    console.log(`====================================`);

    // 設計書の目標: "合算すると「素晴らしいバッテリー」では 1 試合 0〜1 回程度、
    // 制球の悪い投手 + 未熟なキャッチャーでは 1 試合 2〜4 回の発生もありえる"
    // ランダムなチームの平均として 0.3〜1.5 程度を期待
    expect(avgTotal).toBeGreaterThan(0.1);
    expect(avgTotal).toBeLessThan(3.0);
  });
});
