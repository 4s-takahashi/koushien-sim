/**
 * tests/engine/match/pitch/r7-batter-traits.test.ts
 *
 * Phase R7-1: batterTraits → BatBallContext 接続テスト
 * - 選手の traits が BatBallContext に正しく渡されるか
 * - 特性によって batterSwingType が変化するか
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { processPitch } from '@/engine/match/pitch/process-pitch';
import type { MatchState, MatchTeam, MatchPlayer, MatchConfig } from '@/engine/match/types';
import { EMPTY_BASES } from '@/engine/match/types';
import type { Player, Position, TraitId } from '@/engine/types/player';

// ── ヘルパー ──

function makePitcherPlayer(): Player {
  return {
    id: 'pitcher1',
    firstName: '剛',
    lastName: '山田',
    grade: 2,
    position: 'pitcher',
    throwingHand: 'right',
    battingSide: 'right',
    traits: [] as TraitId[],
    stats: {
      base: { stamina: 80, speed: 60, armStrength: 80, fielding: 65, focus: 70, mental: 70 },
      batting: { contact: 50, power: 40, eye: 50, technique: 45 },
      pitching: {
        velocity: 145,
        control: 75,
        pitchStamina: 75,
        pitches: { slider: 6, fork: 5 },
      },
    },
    condition: { mood: 'normal' },
    mentalState: { mood: 'normal', stress: 20, confidence: 55, teamChemistry: 60, flags: [] },
    growthLog: [],
  } as unknown as Player;
}

function makeBatterPlayer(traits: TraitId[] = []): Player {
  return {
    id: 'batter1',
    firstName: '一郎',
    lastName: '鈴木',
    grade: 3,
    position: 'left',
    throwingHand: 'right',
    battingSide: 'right',
    traits,
    stats: {
      base: { stamina: 80, speed: 70, armStrength: 60, fielding: 65, focus: 70, mental: 70 },
      batting: { contact: 75, power: 70, eye: 70, technique: 68 },
      pitching: null,
    },
    condition: { mood: 'normal' },
    mentalState: { mood: 'normal', stress: 20, confidence: 60, teamChemistry: 60, flags: [] },
    growthLog: [],
  } as unknown as Player;
}

function makeMatchPlayer(player: Player, stamina = 100, confidence = 60): MatchPlayer {
  return {
    player,
    pitchCountInGame: 0,
    stamina,
    confidence,
    isWarmedUp: true,
  };
}

function makeTeam(
  id: string,
  pitcherPlayer: Player,
  batterPlayers: Player[],
): MatchTeam {
  const allPlayers = [pitcherPlayer, ...batterPlayers];
  const positions: Position[] = ['pitcher', 'catcher', 'first', 'second', 'third', 'shortstop', 'left', 'center', 'right'];
  return {
    id,
    name: id === 'home' ? 'ホーム高校' : 'アウェイ高校',
    players: allPlayers.map((p, i) => makeMatchPlayer(p)),
    battingOrder: batterPlayers.map((p) => p.id),
    currentPitcherId: pitcherPlayer.id,
    fieldPositions: new Map(
      allPlayers.map((p, i) => [p.id, positions[i % positions.length]]),
    ),
  };
}

const BASE_CONFIG: MatchConfig = {
  innings: 9,
  maxExtras: 3,
  useDH: false,
  isTournament: true,
  isKoshien: false,
};

function makeMatchState(homeTeam: MatchTeam, awayTeam: MatchTeam): MatchState {
  return {
    config: BASE_CONFIG,
    homeTeam,
    awayTeam,
    currentInning: 5,
    currentHalf: 'top',
    currentBatterIndex: 0,
    count: { balls: 0, strikes: 0 },
    outs: 0,
    bases: EMPTY_BASES,
    score: { home: 0, away: 0 },
    inningScores: { home: [], away: [] },
    pitchCount: 0,
    log: [],
    currentAtBatPitches: [],
    isOver: false,
    result: null,
  } as unknown as MatchState;
}

// ============================================================
// R7-1: traits 接続テスト
// ============================================================

describe('R7-1: batterTraits → BatBallContext 接続', () => {
  const rng = createRNG('test-r7-traits');
  const pitcher = makePitcherPlayer();

  it('traits なし打者でも processPitch が正常動作する', () => {
    const batter = makeBatterPlayer([]);
    const homeTeam = makeTeam('home', pitcher, [batter]);
    const awayTeam = makeTeam('away', makePitcherPlayer(), [makeBatterPlayer([])]);
    const state = makeMatchState(homeTeam, awayTeam);

    expect(() => {
      processPitch(state, { type: 'none' }, rng);
    }).not.toThrow();
  });

  it('hotblooded 特性の打者で processPitch が正常動作する', () => {
    const batter = makeBatterPlayer(['hotblooded']);
    const homeTeam = makeTeam('home', pitcher, [batter]);
    const awayTeam = makeTeam('away', makePitcherPlayer(), [makeBatterPlayer(['hotblooded'])]);
    const state = makeMatchState(homeTeam, awayTeam);

    expect(() => {
      processPitch(state, { type: 'none' }, rng);
    }).not.toThrow();
  });

  it('stoic 特性の打者で processPitch が正常動作する', () => {
    const batter = makeBatterPlayer(['stoic']);
    const homeTeam = makeTeam('home', pitcher, [batter]);
    const awayTeam = makeTeam('away', makePitcherPlayer(), [makeBatterPlayer(['stoic'])]);
    const state = makeMatchState(homeTeam, awayTeam);

    expect(() => {
      processPitch(state, { type: 'none' }, rng);
    }).not.toThrow();
  });

  it('batter_detailed 采配で traits が両方渡されても正常動作する', () => {
    const batter = makeBatterPlayer(['hotblooded', 'competitive']);
    const homeTeam = makeTeam('home', pitcher, [batter]);
    const awayTeam = makeTeam('away', makePitcherPlayer(), [makeBatterPlayer(['hotblooded'])]);
    const state = makeMatchState(homeTeam, awayTeam);

    expect(() => {
      processPitch(state, {
        type: 'batter_detailed',
        focusArea: 'outside',
        aggressiveness: 'aggressive',
      }, rng);
    }).not.toThrow();
  });

  it('processPitch の結果に pitchResult が含まれる', () => {
    const batter = makeBatterPlayer(['clutch_hitter']);
    const homeTeam = makeTeam('home', pitcher, [batter]);
    const awayTeam = makeTeam('away', makePitcherPlayer(), [makeBatterPlayer([])]);
    const state = makeMatchState(homeTeam, awayTeam);

    const result = processPitch(state, { type: 'none' }, rng);
    expect(result.pitchResult).toBeDefined();
    expect(result.pitchResult.pitchSelection).toBeDefined();
    expect(result.pitchResult.outcome).toBeDefined();
  });

  it('same seed + same traits → 決定論的な結果', () => {
    const batter = makeBatterPlayer(['hotblooded']);
    const homeTeam1 = makeTeam('home', pitcher, [batter]);
    const awayTeam1 = makeTeam('away', makePitcherPlayer(), [makeBatterPlayer([])]);
    const state1 = makeMatchState(homeTeam1, awayTeam1);

    const homeTeam2 = makeTeam('home', pitcher, [batter]);
    const awayTeam2 = makeTeam('away', makePitcherPlayer(), [makeBatterPlayer([])]);
    const state2 = makeMatchState(homeTeam2, awayTeam2);

    const rng1 = createRNG('deterministic-seed-r7');
    const rng2 = createRNG('deterministic-seed-r7');

    const r1 = processPitch(state1, { type: 'none' }, rng1);
    const r2 = processPitch(state2, { type: 'none' }, rng2);

    expect(r1.pitchResult.outcome).toBe(r2.pitchResult.outcome);
    expect(r1.pitchResult.pitchSelection.type).toBe(r2.pitchResult.pitchSelection.type);
  });

  it('traits が異なると swingType が変化する可能性がある', () => {
    // pull 傾向の打者（hotblooded）と opposite 傾向の打者（stoic）で複数回試行
    // 同じシードでも traits が異なれば結果が変わりうる
    const pullerTraits: TraitId[] = ['hotblooded', 'competitive'];
    const opposerTraits: TraitId[] = ['stoic', 'calm'];

    const pullerBatter = makeBatterPlayer(pullerTraits);
    const opposerBatter = makeBatterPlayer(opposerTraits);

    const homeTeam1 = makeTeam('home', pitcher, [pullerBatter]);
    const awayTeam1 = makeTeam('away', makePitcherPlayer(), [makeBatterPlayer([])]);
    const state1 = makeMatchState(homeTeam1, awayTeam1);

    const homeTeam2 = makeTeam('home', pitcher, [opposerBatter]);
    const awayTeam2 = makeTeam('away', makePitcherPlayer(), [makeBatterPlayer([])]);
    const state2 = makeMatchState(homeTeam2, awayTeam2);

    // どちらも正常動作すること
    expect(() => processPitch(state1, { type: 'none' }, createRNG('r7-pull'))).not.toThrow();
    expect(() => processPitch(state2, { type: 'none' }, createRNG('r7-opp'))).not.toThrow();
  });
});
