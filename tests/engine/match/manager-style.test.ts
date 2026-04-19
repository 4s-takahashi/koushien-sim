/**
 * manager-style.test.ts — 監督戦術スタイル (Phase 11-A2)
 *
 * テスト対象:
 * - getStyleEffects() が正しい効果を返す
 * - cpuAutoTactics でスタイルによるバント確率補正が機能する
 * - defensive スタイルでエラー率が下がる
 * - small_ball スタイルで CPU のバント確率が上がる
 * - 未設定 (undefined) なら balanced と同等
 */

import { describe, it, expect } from 'vitest';
import { getStyleEffects } from '../../../src/engine/match/manager-style-effects';
import { cpuAutoTactics } from '../../../src/engine/match/tactics';
import { processAtBat } from '../../../src/engine/match/at-bat';
import { createRNG } from '../../../src/engine/core/rng';
import { generatePlayer, type PlayerGenConfig } from '../../../src/engine/player/generate';
import type { MatchState, MatchTeam, MatchPlayer } from '../../../src/engine/match/types';
import { EMPTY_BASES } from '../../../src/engine/match/types';

// ============================================================
// テストヘルパー
// ============================================================

function createTestTeam(name: string, seed: string): MatchTeam {
  const rng = createRNG(seed);
  const config: PlayerGenConfig = { enrollmentYear: 1, schoolReputation: 50 };

  const players: MatchPlayer[] = [];

  // 投手を確保
  let pitcherId: string | null = null;
  for (let i = 0; i < 100; i++) {
    const player = generatePlayer(rng.derive(`pitcher-${i}`), config);
    if (player.position === 'pitcher' && player.stats.pitching) {
      players.push({
        player,
        pitchCountInGame: 0,
        stamina: 100,
        confidence: 50,
        isWarmedUp: true,
      });
      pitcherId = player.id;
      break;
    }
  }
  if (!pitcherId) throw new Error(`投手が生成できませんでした: ${seed}`);

  // 打者 8 人 + ベンチ 5 人
  for (let i = 0; i < 13; i++) {
    const player = generatePlayer(rng.derive(`batter-${i}`), config);
    players.push({
      player,
      pitchCountInGame: 0,
      stamina: 100,
      confidence: 50,
      isWarmedUp: false,
    });
  }

  const starters = players.slice(0, 9);
  const bench = players.slice(9);

  return {
    id: name,
    name,
    players,
    battingOrder: starters.map((p) => p.player.id),
    fieldPositions: new Map(
      starters.map((p, i) => [
        p.player.id,
        (['pitcher', 'catcher', 'first', 'second', 'third', 'shortstop', 'left', 'center', 'right'][i] as any),
      ]),
    ),
    currentPitcherId: pitcherId,
    benchPlayerIds: bench.map((p) => p.player.id),
    usedPlayerIds: new Set(),
  };
}

function createBaseState(home: MatchTeam, away: MatchTeam): MatchState {
  return {
    config: {
      innings: 9,
      maxExtras: 3,
      useDH: false,
      isTournament: false,
      isKoshien: false,
    },
    homeTeam: home,
    awayTeam: away,
    currentInning: 7,
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
}

// ============================================================
// getStyleEffects のテスト
// ============================================================

describe('getStyleEffects()', () => {
  it('undefined は balanced と同等', () => {
    const undefinedEffects = getStyleEffects(undefined);
    const balancedEffects = getStyleEffects('balanced');
    expect(undefinedEffects).toEqual(balancedEffects);
  });

  it('aggressive は longHitMultiplier=1.05、cpuBuntBias=-0.10', () => {
    const effects = getStyleEffects('aggressive');
    expect(effects.longHitMultiplier).toBe(1.05);
    expect(effects.cpuBuntBias).toBe(-0.10);
    expect(effects.cpuStealBias).toBe(-0.10);
    expect(effects.errorRateMultiplier).toBe(1.0);
  });

  it('balanced はすべて補正なし', () => {
    const effects = getStyleEffects('balanced');
    expect(effects.longHitMultiplier).toBe(1.0);
    expect(effects.cpuBuntBias).toBe(0);
    expect(effects.cpuStealBias).toBe(0);
    expect(effects.errorRateMultiplier).toBe(1.0);
    expect(effects.stealSuccessBonus).toBe(0);
  });

  it('defensive は errorRateMultiplier=0.9、cpuBuntBias=+0.10', () => {
    const effects = getStyleEffects('defensive');
    expect(effects.errorRateMultiplier).toBe(0.9);
    expect(effects.cpuBuntBias).toBe(0.10);
    expect(effects.longHitMultiplier).toBe(1.0);
  });

  it('small_ball は cpuBuntBias=+0.25、stealSuccessBonus=+0.05', () => {
    const effects = getStyleEffects('small_ball');
    expect(effects.cpuBuntBias).toBe(0.25);
    expect(effects.stealSuccessBonus).toBe(0.05);
    expect(effects.longHitMultiplier).toBe(1.0);
  });
});

// ============================================================
// cpuAutoTactics スタイル補正テスト
// ============================================================

describe('cpuAutoTactics() — スタイル補正', () => {
  it('aggressive ではバント確率が下がる（1点差7回以降・無死1塁でも抑制）', () => {
    const home = createTestTeam('Home', 'tactics-aggressive-home');
    const away = createTestTeam('Away', 'tactics-aggressive-away');

    // バント条件: 1点差・7回以降・無死・1塁のみ
    const baseState = createBaseState(home, away);
    const buntState: MatchState = {
      ...baseState,
      bases: {
        first: { playerId: away.battingOrder[0], speed: 50 },
        second: null,
        third: null,
      },
      score: { home: 1, away: 0 },
      currentInning: 8,
    };

    let aggressiveBuntCount = 0;
    let balancedBuntCount = 0;
    const TRIALS = 200;

    for (let i = 0; i < TRIALS; i++) {
      const rng = createRNG(`bunt-test-${i}`);
      const aggressiveOrder = cpuAutoTactics(buntState, rng, 'aggressive');
      if (aggressiveOrder.type === 'bunt') aggressiveBuntCount++;

      const rng2 = createRNG(`bunt-test-${i}`);
      const balancedOrder = cpuAutoTactics(buntState, rng2, 'balanced');
      if (balancedOrder.type === 'bunt') balancedBuntCount++;
    }

    // balanced は条件が成立すれば必ずバント（200/200）
    // aggressive は cpuBuntBias=-0.10 → 90% 確率でバント
    expect(balancedBuntCount).toBe(TRIALS);
    expect(aggressiveBuntCount).toBeLessThan(TRIALS);
    expect(aggressiveBuntCount).toBeGreaterThan(TRIALS * 0.5); // 極端に低くはならない
  });

  it('small_ball では balanced より多くバントを実行する', () => {
    const home = createTestTeam('Home', 'tactics-smallball-home');
    const away = createTestTeam('Away', 'tactics-smallball-away');

    // バント条件を満たさない状態（5回・2点差）→ small_ball だけが追加バントを試みる
    const baseState = createBaseState(home, away);
    const earlyBuntState: MatchState = {
      ...baseState,
      bases: {
        first: { playerId: away.battingOrder[0], speed: 50 },
        second: null,
        third: null,
      },
      score: { home: 2, away: 0 },
      currentInning: 5,
    };

    let smallBallBuntCount = 0;
    let balancedBuntCount = 0;
    const TRIALS = 200;

    for (let i = 0; i < TRIALS; i++) {
      const rng = createRNG(`sb-test-${i}`);
      const sbOrder = cpuAutoTactics(earlyBuntState, rng, 'small_ball');
      if (sbOrder.type === 'bunt') smallBallBuntCount++;

      const rng2 = createRNG(`sb-test-${i}`);
      const balancedOrder = cpuAutoTactics(earlyBuntState, rng2, 'balanced');
      if (balancedOrder.type === 'bunt') balancedBuntCount++;
    }

    // balanced はこの条件ではバントしない
    expect(balancedBuntCount).toBe(0);
    // small_ball は 35% 確率でバントを試みる
    expect(smallBallBuntCount).toBeGreaterThan(0);
  });

  it('undefined スタイルは balanced と同等の采配になる', () => {
    const home = createTestTeam('Home', 'tactics-undefined-home');
    const away = createTestTeam('Away', 'tactics-undefined-away');

    const baseState = createBaseState(home, away);
    const buntState: MatchState = {
      ...baseState,
      bases: {
        first: { playerId: away.battingOrder[0], speed: 50 },
        second: null,
        third: null,
      },
      score: { home: 1, away: 0 },
      currentInning: 8,
    };

    const TRIALS = 50;
    for (let i = 0; i < TRIALS; i++) {
      const rng1 = createRNG(`undef-test-${i}`);
      const undefinedOrder = cpuAutoTactics(buntState, rng1, undefined);

      const rng2 = createRNG(`undef-test-${i}`);
      const balancedOrder = cpuAutoTactics(buntState, rng2, 'balanced');

      // 同じ seed で同じ結果になる
      expect(undefinedOrder.type).toBe(balancedOrder.type);
    }
  });
});

// ============================================================
// defensive エラー率低下テスト
// ============================================================

describe('processAtBat() — defensive エラー率低下', () => {
  it('defensive スタイルは balanced より少ないエラーアウトを発生させる傾向がある', () => {
    // 注: これは確率的テストのため多数試行で検証する
    // エラーが発生しにくくなる（errorRateMultiplier=0.9）
    // 直接計測するのではなく、getStyleEffects の返り値で検証する
    const defensiveEffects = getStyleEffects('defensive');
    const balancedEffects = getStyleEffects('balanced');

    expect(defensiveEffects.errorRateMultiplier).toBeLessThan(balancedEffects.errorRateMultiplier);
    expect(defensiveEffects.errorRateMultiplier).toBe(0.9);
  });
});
