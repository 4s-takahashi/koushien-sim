import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { resolveFieldResult, getNearestFielder } from '@/engine/match/pitch/field-result';
import type {
  BaseState,
  BatterParams,
  BatContactResult,
  MatchTeam,
  MatchPlayer,
} from '@/engine/match/types';
import type { Player, Position } from '@/engine/types/player';
import { generatePlayer } from '@/engine/player/generate';
import { EMPTY_BASES } from '@/engine/match/types';

function makeBatter(overrides: Partial<BatterParams> = {}): BatterParams {
  return {
    contact: 70, power: 60, eye: 70, technique: 60,
    speed: 60, mental: 60, focus: 60,
    battingSide: 'right', confidence: 50, mood: 'normal',
    ...overrides,
  };
}

function makeMatchTeam(fieldingAvg: number): MatchTeam {
  const rng = createRNG('field-result-team');
  const positions: Position[] = ['pitcher', 'catcher', 'first', 'second', 'third', 'shortstop', 'left', 'center', 'right'];
  const players: MatchPlayer[] = positions.map((pos, i) => {
    const p = generatePlayer(rng.derive(`field-${i}`), { enrollmentYear: 1, schoolReputation: 50 });
    // 守備力を強制的に設定
    const modifiedPlayer: Player = {
      ...p,
      stats: {
        ...p.stats,
        base: { ...p.stats.base, fielding: fieldingAvg },
      },
    };
    return {
      player: modifiedPlayer,
      pitchCountInGame: 0,
      stamina: 100,
      confidence: 50,
      isWarmedUp: false,
    };
  });

  const fieldPositions = new Map<string, Position>();
  players.forEach((mp, i) => {
    fieldPositions.set(mp.player.id, positions[i]);
  });

  return {
    id: 'team-field',
    name: 'フィールドチーム',
    players,
    battingOrder: players.slice(0, 9).map((mp) => mp.player.id),
    fieldPositions,
    currentPitcherId: players[0].player.id,
    benchPlayerIds: [],
    usedPlayerIds: new Set(),
  };
}

function makeContact(overrides: Partial<Omit<BatContactResult, 'fieldResult'>> = {}): Omit<BatContactResult, 'fieldResult'> {
  return {
    contactType: 'fly_ball',
    direction: 45,
    speed: 'hard',
    distance: 110,
    ...overrides,
  };
}

describe('resolveFieldResult', () => {
  it('fly_ball + distance > 100 → home_run', () => {
    const rng = createRNG('hr-test');
    const contact = makeContact({ contactType: 'fly_ball', distance: 110 });
    const team = makeMatchTeam(70);
    const result = resolveFieldResult(contact, EMPTY_BASES, 0, team, makeBatter(), rng);
    expect(result.type).toBe('home_run');
  });

  it('fly_ball + distance <= 100 → アウト or ヒット', () => {
    const contact = makeContact({ contactType: 'fly_ball', distance: 80 });
    const team = makeMatchTeam(70);
    let outCount = 0;
    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`fly-out-${i}`);
      const result = resolveFieldResult(contact, EMPTY_BASES, 0, team, makeBatter(), rng);
      expect(['out', 'single', 'double', 'sacrifice_fly']).toContain(result.type);
      if (result.type === 'out') outCount++;
    }
    // 守備力70でアウト率 ~0.905
    expect(outCount).toBeGreaterThan(70);
  });

  it('popup → ほぼアウト（エラーのみ稀にある）', () => {
    const contact = makeContact({ contactType: 'popup', distance: 25 });
    const team = makeMatchTeam(70);
    let outCount = 0;
    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`popup-out-${i}`);
      const result = resolveFieldResult(contact, EMPTY_BASES, 0, team, makeBatter(), rng);
      if (result.type === 'out') outCount++;
    }
    // popup の out 率 = 95%
    expect(outCount).toBeGreaterThan(85);
  });

  it('守備力が高いほどゴロアウト率が上がる', () => {
    const contact = makeContact({ contactType: 'ground_ball', speed: 'normal', direction: 45, distance: 30 });
    const highFieldTeam = makeMatchTeam(90);
    const lowFieldTeam = makeMatchTeam(30);
    let outHigh = 0;
    let outLow = 0;
    for (let i = 0; i < 200; i++) {
      const rng1 = createRNG(`gout-high-${i}`);
      const rng2 = createRNG(`gout-low-${i}`);
      const r1 = resolveFieldResult(contact, EMPTY_BASES, 0, highFieldTeam, makeBatter(), rng1);
      const r2 = resolveFieldResult(contact, EMPTY_BASES, 0, lowFieldTeam, makeBatter(), rng2);
      if (r1.type === 'out') outHigh++;
      if (r2.type === 'out') outLow++;
    }
    expect(outHigh).toBeGreaterThan(outLow);
  });

  it('fly_ball + 三塁走者 + 0アウトで sacrifice_fly になることがある', () => {
    const contact = makeContact({ contactType: 'fly_ball', distance: 80 });
    const team = makeMatchTeam(70);
    const basesWithRunner: BaseState = { first: null, second: null, third: { playerId: 'runner-3', speed: 70 } };
    let sacFlyFound = false;
    for (let i = 0; i < 200; i++) {
      const rng = createRNG(`sac-fly-${i}`);
      const result = resolveFieldResult(contact, basesWithRunner, 0, team, makeBatter(), rng);
      if (result.type === 'sacrifice_fly') {
        sacFlyFound = true;
        break;
      }
    }
    expect(sacFlyFound).toBe(true);
  });

  it('一塁走者 + 0アウト + 弱い打球 → 併殺になることがある', () => {
    const contact = makeContact({ contactType: 'ground_ball', speed: 'weak', distance: 20 });
    const team = makeMatchTeam(80);
    const basesWithFirst: BaseState = { first: { playerId: 'runner-1', speed: 50 }, second: null, third: null };
    let dpFound = false;
    for (let i = 0; i < 200; i++) {
      const rng = createRNG(`dp-${i}`);
      const result = resolveFieldResult(contact, basesWithFirst, 0, team, makeBatter(), rng);
      if (result.type === 'double_play') {
        dpFound = true;
        break;
      }
    }
    expect(dpFound).toBe(true);
  });
});

describe('getNearestFielder', () => {
  it('左方向 → left', () => {
    expect(getNearestFielder(5)).toBe('left');
  });
  it('センター方向 → center', () => {
    expect(getNearestFielder(45)).toBe('center');
  });
  it('右方向 → right', () => {
    expect(getNearestFielder(85)).toBe('right');
  });
});
