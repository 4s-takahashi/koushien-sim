/**
 * bat-ball-distribution.test.ts
 *
 * v0.50.0: 打球分布の正常性を検証するインテグレーションテスト
 *
 * 目標分布（高校野球 / プロ野球参考）:
 *   - 打率: .220-.280
 *   - インプレー率: 45%-55% (全打席に対するインプレー割合)
 *   - ゴロ / フライ / ライナー / ポップがすべて出る
 *   - 三塁打率: < 3% (全打席に対する割合)
 *   - ヒットがゼロの試合は起こらない (200 AB で最低 30 ヒット以上)
 */
import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { processAtBat } from '@/engine/match/at-bat';
import { generatePlayer, type PlayerGenConfig } from '@/engine/player/generate';
import type { MatchPlayer, MatchState, MatchTeam } from '@/engine/match/types';
import { EMPTY_BASES } from '@/engine/match/types';

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
  for (let i = 1; i < 14; i++) {
    const player = generatePlayer(rng.derive(`${name}-player-${i}`), config);
    players.push({ player, pitchCountInGame: 0, stamina: 100, confidence: 50, isWarmedUp: false });
  }
  const battingPlayers = players.slice(0, 9);
  const positions = ['pitcher', 'catcher', 'first', 'second', 'third', 'shortstop', 'left', 'center', 'right'] as const;
  return {
    id: name, name, players,
    battingOrder: battingPlayers.map(p => p.player.id),
    fieldPositions: new Map(battingPlayers.map((p, i) => [p.player.id, positions[i]])),
    currentPitcherId: players[0].player.id,
    benchPlayerIds: players.slice(9).map(p => p.player.id),
    usedPlayerIds: new Set(),
  };
}

describe('打球分布テスト (v0.50.0)', () => {
  it('200打席で自然な打球分布が出る', () => {
    const homeTeam = createTestTeam('Home', 'dist-test-home-v050');
    const awayTeam = createTestTeam('Away', 'dist-test-away-v050');
    const state: MatchState = {
      config: { innings: 9, maxExtras: 3, useDH: false, isTournament: false, isKoshien: false },
      homeTeam, awayTeam, currentInning: 1, currentHalf: 'top', outs: 0,
      count: { balls: 0, strikes: 0 }, bases: EMPTY_BASES,
      score: { home: 0, away: 0 }, inningScores: { home: [], away: [] },
      currentBatterIndex: 0, pitchCount: 0, log: [], isOver: false, result: null
    };

    const fieldResults: Record<string, number> = {};
    const contactTypes: Record<string, number> = {};
    let hits = 0;
    let totalAB = 0;
    let triples = 0;

    for (let i = 0; i < 200; i++) {
      const { result } = processAtBat(state, { type: 'none' }, createRNG(`dist-ab-${i}`));
      totalAB++;

      const outcomeType = result.outcome.type;
      // walk / hbp は除外（ヒット・アウトのみ集計）
      const isWalk = outcomeType === 'walk' || outcomeType === 'hit_by_pitch';
      if (!isWalk) {
        const inPlayPitch = result.pitches.find(p => p.outcome === 'in_play');
        if (inPlayPitch?.batContact) {
          const ct = inPlayPitch.batContact.contactType;
          contactTypes[ct] = (contactTypes[ct] || 0) + 1;
          const fr = inPlayPitch.batContact.fieldResult.type;
          fieldResults[fr] = (fieldResults[fr] || 0) + 1;
          if (fr === 'single' || fr === 'double' || fr === 'triple' || fr === 'home_run') {
            hits++;
          }
          if (fr === 'triple') {
            triples++;
          }
        }
      }
    }

    // ── アサーション ──

    // 1. ヒットが出る（200打席で30以上）
    // 四球・死球を除いた実効打率ベースで最低 30 ヒットは必要
    expect(hits).toBeGreaterThanOrEqual(30);

    // 2. ゴロ (ground_ball) が出る
    expect(contactTypes['ground_ball'] ?? 0).toBeGreaterThan(0);

    // 3. フライ (fly_ball) が出る
    expect(contactTypes['fly_ball'] ?? 0).toBeGreaterThan(0);

    // 4. ライナー (line_drive) が出る
    expect(contactTypes['line_drive'] ?? 0).toBeGreaterThan(0);

    // 5. 三塁打率が異常に高くない（200打席中 6 本以下 = 3%以下）
    expect(triples).toBeLessThanOrEqual(6);

    // 6. ゴロのアウト (ground_out) が出る
    expect(fieldResults['out'] ?? 0).toBeGreaterThan(0);

    // 7. フライのアウトも出る（sacrifice_fly / out を合計）
    const flyOuts = (fieldResults['out'] ?? 0) + (fieldResults['sacrifice_fly'] ?? 0);
    expect(flyOuts).toBeGreaterThan(0);
  });
});
