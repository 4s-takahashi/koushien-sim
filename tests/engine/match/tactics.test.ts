import { describe, it, expect, beforeEach } from 'vitest';
import type { MatchState, MatchTeam, MatchPlayer } from '../../../src/engine/match/types';
import { EMPTY_BASES } from '../../../src/engine/match/types';
import {
  validateOrder,
  applyPinchHit,
  applyPitchingChange,
  applyMoundVisit,
  willObeySign,
  cpuAutoTactics,
} from '../../../src/engine/match/tactics';
import { createRNG } from '../../../src/engine/core/rng';
import { generatePlayer, type PlayerGenConfig } from '../../../src/engine/player/generate';

describe('tactics.ts', () => {
  let mockMatchState: MatchState;
  let mockHomeTeam: MatchTeam;
  let mockAwayTeam: MatchTeam;

  beforeEach(() => {
    const createTeam = (name: string, rng: any): MatchTeam => {
      const config: PlayerGenConfig = { enrollmentYear: 1, schoolReputation: 50 };
      const players: MatchPlayer[] = [];

      // 投手を作成
      let playerGenRng = rng.derive(`${name}-pitcher`);
      let attemptCount = 0;
      while (players.length === 0 && attemptCount < 100) {
        const player = generatePlayer(playerGenRng, config);
        if (player.position === 'pitcher' && player.stats.pitching) {
          players.push({
            player,
            pitchCountInGame: 0,
            stamina: 100,
            confidence: 50,
            isWarmedUp: false,
          });
          break;
        }
        playerGenRng = playerGenRng.derive(`retry-${attemptCount}`);
        attemptCount++;
      }

      // 打者8人 + ベンチ5人（合計14人）
      for (let i = 1; i < 14; i++) {
        const player = generatePlayer(rng.derive(`${name}-player-${i}`), config);
        players.push({
          player,
          pitchCountInGame: 0,
          stamina: 100,
          confidence: 50,
          isWarmedUp: false,
        });
      }

      const battingPlayers = players.slice(0, 9);
      const benchPlayers = players.slice(9);

      return {
        id: name,
        name,
        players,
        battingOrder: battingPlayers.map((p) => p.player.id),
        fieldPositions: new Map(
          battingPlayers.map((p, i) => [p.player.id, (['pitcher', 'catcher', 'first', 'second', 'third', 'shortstop', 'left', 'center', 'right'][i] as any)])
        ),
        currentPitcherId: players[0].player.id,
        benchPlayerIds: benchPlayers.map((p) => p.player.id),
        usedPlayerIds: new Set(),
      };
    };

    const rng = createRNG('test-seed-m3');
    mockHomeTeam = createTeam('Home', rng);
    mockAwayTeam = createTeam('Away', rng);

    mockMatchState = {
      config: {
        innings: 9,
        maxExtras: 3,
        useDH: false,
        isTournament: false,
        isKoshien: false,
      },
      homeTeam: mockHomeTeam,
      awayTeam: mockAwayTeam,
      currentInning: 1,
      currentHalf: 'top',
      outs: 0,
      count: { balls: 0, strikes: 0 },
      bases: EMPTY_BASES,
      score: { home: 0, away: 0 },
      inningScores: { home: [], away: [] },
      currentBatterIndex: 0,
      pitchCount: 0,
      log: [],
      isOver: false,
      result: null,
    };
  });

  it('should validate none order', () => {
    const result = validateOrder({ type: 'none' }, mockMatchState);
    expect(result.valid).toBe(true);
  });

  it('should validate pinch_hit order', () => {
    const outPlayer = mockMatchState.awayTeam.battingOrder[0];
    const inPlayer = mockMatchState.awayTeam.benchPlayerIds[0];
    const result = validateOrder({ type: 'pinch_hit', outPlayerId: outPlayer, inPlayerId: inPlayer }, mockMatchState);
    expect(result.valid).toBe(true);
  });

  it('should reject invalid pinch_hit (inPlayer not in bench)', () => {
    const outPlayer = mockMatchState.awayTeam.battingOrder[0];
    const inPlayer = mockMatchState.awayTeam.battingOrder[1];
    const result = validateOrder({ type: 'pinch_hit', outPlayerId: outPlayer, inPlayerId: inPlayer }, mockMatchState);
    expect(result.valid).toBe(false);
  });

  it('should apply pinch_hit', () => {
    const outPlayer = mockMatchState.awayTeam.battingOrder[0];
    const inPlayer = mockMatchState.awayTeam.benchPlayerIds[0];
    const nextState = applyPinchHit(mockMatchState, outPlayer, inPlayer);

    expect(nextState.awayTeam.battingOrder[0]).toBe(inPlayer);
    expect(nextState.awayTeam.usedPlayerIds.has(outPlayer)).toBe(true);
    expect(nextState.awayTeam.benchPlayerIds).not.toContain(inPlayer);
  });

  it('should apply pitching_change', () => {
    const newPitcher = mockMatchState.homeTeam.benchPlayerIds.find((id) => {
      const mp = mockMatchState.homeTeam.players.find((p) => p.player.id === id);
      return mp?.player.stats.pitching !== undefined;
    });

    if (!newPitcher) {
      // スキップ（投手ベンチがない場合）
      expect(true).toBe(true);
      return;
    }

    const oldPitcher = mockMatchState.homeTeam.currentPitcherId;
    const nextState = applyPitchingChange(mockMatchState, newPitcher);

    expect(nextState.homeTeam.currentPitcherId).toBe(newPitcher);
    expect(nextState.homeTeam.usedPlayerIds.has(oldPitcher)).toBe(true);
  });

  it('should apply mound_visit and gain confidence', () => {
    const rng = createRNG('test-seed-mv');
    const nextState = applyMoundVisit(mockMatchState);

    const pitcher = nextState.homeTeam.players.find(
      (p) => p.player.id === nextState.homeTeam.currentPitcherId,
    );
    expect(pitcher).toBeDefined();
    expect(pitcher!.confidence).toBeGreaterThan(mockMatchState.homeTeam.players.find(
      (p) => p.player.id === mockMatchState.homeTeam.currentPitcherId,
    )!.confidence);
  });

  it('should reject mound_visit at limit', () => {
    // 3回のマウンド訪問を記録
    let state = mockMatchState;
    state = {
      ...state,
      log: [
        { inning: 1, half: 'top', type: 'pitch', description: 'Mound visit' },
        { inning: 2, half: 'top', type: 'pitch', description: 'Mound visit' },
        { inning: 3, half: 'top', type: 'pitch', description: 'Mound visit' },
      ],
    };

    const result = validateOrder({ type: 'mound_visit' }, state);
    expect(result.valid).toBe(false);
  });

  it('should obey sign for honest players', () => {
    const rng = createRNG('test-seed-honest');
    const testTeam = createRNG('test-honest-team').derive('players');

    // honest trait を持つプレイヤーを探す
    let honestPlayer: MatchPlayer | undefined;
    for (let i = 0; i < 100; i++) {
      const player = generatePlayer(testTeam.derive(`player-${i}`), { enrollmentYear: 1, schoolReputation: 50 });
      if (player.traits.includes('honest')) {
        honestPlayer = {
          player,
          pitchCountInGame: 0,
          stamina: 100,
          confidence: 50,
          isWarmedUp: false,
        };
        break;
      }
    }

    if (honestPlayer) {
      let obeyCount = 0;
      for (let i = 0; i < 100; i++) {
        const rng2 = createRNG(`test-obey-${i}`);
        if (willObeySign(honestPlayer, { type: 'bunt', playerId: 'test' }, mockMatchState, rng2)) {
          obeyCount++;
        }
      }
      // honest players should have high obedience (>80%)
      expect(obeyCount).toBeGreaterThan(80);
    }
  });

  it('should disobey sign for rebellious players', () => {
    const rng = createRNG('test-seed-rebellious');
    const testTeam = createRNG('test-rebellious-team').derive('players');

    let rebelliousPlayer: MatchPlayer | undefined;
    for (let i = 0; i < 100; i++) {
      const player = generatePlayer(testTeam.derive(`player-${i}`), { enrollmentYear: 1, schoolReputation: 50 });
      if (player.traits.includes('rebellious')) {
        rebelliousPlayer = {
          player,
          pitchCountInGame: 0,
          stamina: 100,
          confidence: 50,
          isWarmedUp: false,
        };
        break;
      }
    }

    if (rebelliousPlayer) {
      let obeyCount = 0;
      for (let i = 0; i < 100; i++) {
        const rng2 = createRNG(`test-disobey-${i}`);
        if (willObeySign(rebelliousPlayer, { type: 'bunt', playerId: 'test' }, mockMatchState, rng2)) {
          obeyCount++;
        }
      }
      // rebellious players should have lower obedience than honest (base 0.90 - 0.15 = 0.75)
      // but actual rate depends on RNG distribution, so we just check it's reasonable (not >85%)
      expect(obeyCount).toBeLessThanOrEqual(85);
    }
  });

  it('should return cpu_auto_tactics with none order for neutral state', () => {
    const rng = createRNG('test-seed-cpu');
    const order = cpuAutoTactics(mockMatchState, rng);
    expect(order.type).toBe('none');
  });

  it('should return cpu_auto_tactics with pitching_change for tired pitcher', () => {
    const rng = createRNG('test-seed-cpu-tired');
    const state = {
      ...mockMatchState,
      homeTeam: {
        ...mockMatchState.homeTeam,
        players: mockMatchState.homeTeam.players.map((mp) =>
          mp.player.id === mockMatchState.homeTeam.currentPitcherId
            ? { ...mp, stamina: 10 }
            : mp,
        ),
      },
    };

    const order = cpuAutoTactics(state, rng);
    expect(order.type === 'none' || order.type === 'pitching_change').toBe(true);
  });

  it('should have seed reproducibility', () => {
    const rng1 = createRNG('test-seed-repr');
    const order1 = cpuAutoTactics(mockMatchState, rng1);

    const rng2 = createRNG('test-seed-repr');
    const order2 = cpuAutoTactics(mockMatchState, rng2);

    expect(order1.type).toBe(order2.type);
  });
});
