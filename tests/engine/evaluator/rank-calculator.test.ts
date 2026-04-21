/**
 * tests/engine/evaluator/rank-calculator.test.ts
 *
 * Phase 11.5-C: 評価者ランク計算のユニットテスト
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { generatePlayer } from '@/engine/player/generate';
import type { Player } from '@/engine/types/player';
import type { Evaluator } from '@/engine/types/evaluator';
import {
  calcEvaluatorScore,
  calcEvaluatorRank,
  scoreToRank,
} from '@/engine/evaluator/rank-calculator';
import { EVALUATOR_REGISTRY, findEvaluator } from '@/engine/evaluator/evaluator-registry';

// ============================================================
// テストヘルパー
// ============================================================

function makePitcher(opts: {
  velocity?: number;
  control?: number;
  pitchStamina?: number;
  stamina?: number;
} = {}): Player {
  const rng = createRNG('test-pitcher');
  const base = generatePlayer(rng, { enrollmentYear: 1, schoolReputation: 60 });
  return {
    ...base,
    position: 'pitcher',
    stats: {
      ...base.stats,
      pitching: {
        velocity: opts.velocity ?? 70,
        control: opts.control ?? 70,
        pitchStamina: opts.pitchStamina ?? 70,
        pitches: { curve: 60, slider: 55 },
      },
      base: {
        ...base.stats.base,
        stamina: opts.stamina ?? 70,
      },
    },
  };
}

function makeBatter(opts: {
  contact?: number;
  power?: number;
  speed?: number;
  fielding?: number;
} = {}): Player {
  const rng = createRNG('test-batter');
  const base = generatePlayer(rng, { enrollmentYear: 1, schoolReputation: 60 });
  return {
    ...base,
    position: 'left',
    stats: {
      ...base.stats,
      pitching: null,
      batting: {
        contact: opts.contact ?? 60,
        power: opts.power ?? 60,
        eye: 60,
        technique: 60,
      },
      base: {
        ...base.stats.base,
        speed: opts.speed ?? 60,
        fielding: opts.fielding ?? 60,
      },
    },
  };
}

// ============================================================
// scoreToRank テスト
// ============================================================

describe('scoreToRank', () => {
  it('92以上は SSS', () => expect(scoreToRank(92)).toBe('SSS'));
  it('91は SS', () => expect(scoreToRank(91)).toBe('SS'));
  it('85以上は SS', () => expect(scoreToRank(85)).toBe('SS'));
  it('78以上は S', () => expect(scoreToRank(78)).toBe('S'));
  it('68以上は A', () => expect(scoreToRank(68)).toBe('A'));
  it('55以上は B', () => expect(scoreToRank(55)).toBe('B'));
  it('42以上は C', () => expect(scoreToRank(42)).toBe('C'));
  it('30以上は D', () => expect(scoreToRank(30)).toBe('D'));
  it('15以上は E', () => expect(scoreToRank(15)).toBe('E'));
  it('0以上は F', () => expect(scoreToRank(0)).toBe('F'));
});

// ============================================================
// calcEvaluatorScore テスト
// ============================================================

describe('calcEvaluatorScore', () => {
  it('得点は 0〜100 の範囲に収まる', () => {
    for (const evaluator of EVALUATOR_REGISTRY) {
      const pitcher = makePitcher();
      const batter = makeBatter();
      const score1 = calcEvaluatorScore(evaluator, pitcher);
      const score2 = calcEvaluatorScore(evaluator, batter);
      expect(score1).toBeGreaterThanOrEqual(0);
      expect(score1).toBeLessThanOrEqual(100);
      expect(score2).toBeGreaterThanOrEqual(0);
      expect(score2).toBeLessThanOrEqual(100);
    }
  });

  it('球速特化評価者: 高球速投手が低球速投手より高得点', () => {
    const velocityEval = findEvaluator('media_008');  // 制球重視 (松本)
    const speedEval = findEvaluator('critic_008');    // 球速重視 (福島)
    expect(velocityEval).toBeDefined();
    expect(speedEval).toBeDefined();

    const fastPitcher = makePitcher({ velocity: 95, control: 60 });
    const slowPitcher = makePitcher({ velocity: 60, control: 90 });

    // 球速重視評価者は速い投手を高く評価
    const fastScore = calcEvaluatorScore(speedEval!, fastPitcher);
    const slowScore = calcEvaluatorScore(speedEval!, slowPitcher);
    expect(fastScore).toBeGreaterThan(slowScore);

    // 制球重視評価者は制球のよい投手を高く評価
    const controlFastScore = calcEvaluatorScore(velocityEval!, fastPitcher);
    const controlSlowScore = calcEvaluatorScore(velocityEval!, slowPitcher);
    expect(controlSlowScore).toBeGreaterThan(controlFastScore);
  });

  it('全体バイアスが得点に影響する（同じフォーカスで比較）', () => {
    // 同じ focus (pitcher_overall) で generalBias の差を比較するテスト
    const positiveBiasEval: Evaluator = {
      id: 'test_pos',
      name: 'ポジティブ評価者',
      type: 'critic',
      affiliation: 'テスト',
      focus: 'pitcher_overall',
      bias: { generalBias: 1.0 },
      description: '',
    };
    const negativeBiasEval: Evaluator = {
      id: 'test_neg',
      name: 'ネガティブ評価者',
      type: 'critic',
      affiliation: 'テスト',
      focus: 'pitcher_overall',
      bias: { generalBias: -1.0 },
      description: '',
    };

    const player = makePitcher({ velocity: 70, control: 70, pitchStamina: 70 });

    const posScore = calcEvaluatorScore(positiveBiasEval, player);
    const negScore = calcEvaluatorScore(negativeBiasEval, player);

    // ポジティブバイアス評価者 > ネガティブバイアス評価者（同じ選手なら差は 20点）
    expect(posScore).toBeGreaterThan(negScore);
    expect(posScore - negScore).toBeCloseTo(20, 0);
  });

  it('閾値ボーナス: 閾値以上の場合にスコアが上がる', () => {
    // 球速 threshold=90, bonus=25 の評価者 (critic_008)
    const eval1 = findEvaluator('critic_008');
    expect(eval1).toBeDefined();

    const highVel = makePitcher({ velocity: 92 });
    const lowVel = makePitcher({ velocity: 70 });

    const highScore = calcEvaluatorScore(eval1!, highVel);
    const lowScore = calcEvaluatorScore(eval1!, lowVel);

    // 高球速は閾値ボーナスが加算されるので差がつく
    expect(highScore - lowScore).toBeGreaterThanOrEqual(20);
  });

  it('投手フォーカス評価者は非投手の得点が低くなる', () => {
    const pitchEval: Evaluator = {
      id: 'test',
      name: 'テスト',
      type: 'critic',
      affiliation: 'テスト',
      focus: 'pitcher_velocity',
      bias: { generalBias: 0 },
      description: '',
    };

    const pitcher = makePitcher({ velocity: 85 });
    const batter = makeBatter();

    const pitcherScore = calcEvaluatorScore(pitchEval, pitcher);
    const batterScore = calcEvaluatorScore(pitchEval, batter);

    // 投手は球速スコアがそのまま使われる
    expect(pitcherScore).toBeGreaterThan(batterScore);
    // 非投手は 0 点
    expect(batterScore).toBe(0);
  });
});

// ============================================================
// calcEvaluatorRank テスト
// ============================================================

describe('calcEvaluatorRank', () => {
  it('返り値は有効なランク', () => {
    const validRanks = ['SSS', 'SS', 'S', 'A', 'B', 'C', 'D', 'E', 'F'];
    const eval1 = EVALUATOR_REGISTRY[0];
    const player = makePitcher();
    const rank = calcEvaluatorRank(eval1, player);
    expect(validRanks).toContain(rank);
  });

  it('EVALUATOR_REGISTRY の全評価者で正常動作する', () => {
    const pitcher = makePitcher({ velocity: 85, control: 75 });
    const batter = makeBatter({ contact: 75, power: 70 });

    for (const evaluator of EVALUATOR_REGISTRY) {
      expect(() => calcEvaluatorRank(evaluator, pitcher)).not.toThrow();
      expect(() => calcEvaluatorRank(evaluator, batter)).not.toThrow();
    }
  });
});

// ============================================================
// EVALUATOR_REGISTRY テスト
// ============================================================

describe('EVALUATOR_REGISTRY', () => {
  it('24名の評価者が登録されている', () => {
    expect(EVALUATOR_REGISTRY).toHaveLength(24);
  });

  it('メディアは8名', () => {
    const media = EVALUATOR_REGISTRY.filter((e) => e.type === 'media');
    expect(media).toHaveLength(8);
  });

  it('評論家は8名', () => {
    const critics = EVALUATOR_REGISTRY.filter((e) => e.type === 'critic');
    expect(critics).toHaveLength(8);
  });

  it('スカウトは8名', () => {
    const scouts = EVALUATOR_REGISTRY.filter((e) => e.type === 'scout');
    expect(scouts).toHaveLength(8);
  });

  it('全評価者にユニークIDがある', () => {
    const ids = EVALUATOR_REGISTRY.map((e) => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('findEvaluator で既存のIDが取得できる', () => {
    const e = findEvaluator('media_001');
    expect(e).toBeDefined();
    expect(e!.name).toBe('木村 健太');
  });

  it('findEvaluator で存在しないIDはundefined', () => {
    const e = findEvaluator('nonexistent_999');
    expect(e).toBeUndefined();
  });
});
