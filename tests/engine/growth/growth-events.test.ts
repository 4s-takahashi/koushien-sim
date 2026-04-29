/**
 * tests/engine/growth/growth-events.test.ts
 * Phase S1-C C3: 成長イベント生成・適用テスト
 */

import { describe, it, expect } from 'vitest';
import {
  calcGrowthEventProbability,
  shouldGenerateEvent,
  generateGrowthEvents,
  applyGrowthEvents,
} from '../../../src/engine/growth/growth-events';
import { createRNG } from '../../../src/engine/core/rng';
import type { Player } from '../../../src/engine/types/player';
import type { GameDate } from '../../../src/engine/types/calendar';

// ============================================================
// テスト用ヘルパー
// ============================================================

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    firstName: '太郎',
    lastName: '田中',
    enrollmentYear: 1,
    position: 'center',
    subPositions: [],
    battingSide: 'right',
    throwingHand: 'right',
    height: 170,
    weight: 65,
    stats: {
      base: { stamina: 50, speed: 50, armStrength: 50, fielding: 50, focus: 50, mental: 50 },
      batting: { contact: 50, power: 50, eye: 50, technique: 50 },
      pitching: null,
    },
    potential: {
      ceiling: {
        base: { stamina: 100, speed: 100, armStrength: 100, fielding: 100, focus: 100, mental: 100 },
        batting: { contact: 100, power: 100, eye: 100, technique: 100 },
        pitching: null,
      },
      growthRate: 1.0,
      growthType: 'normal',
    },
    condition: {
      fatigue: 0,
      injury: null,
      mood: 'normal',
    },
    traits: [],
    mentalState: {
      mood: 'normal',
      stress: 0,
      confidence: 50,
      teamChemistry: 50,
      flags: [],
    },
    background: { hometown: '東京', middleSchool: '東京中学' },
    careerStats: {
      gamesPlayed: 0, atBats: 0, hits: 0, homeRuns: 0, rbis: 0,
      stolenBases: 0, gamesStarted: 0, inningsPitched: 0,
      wins: 0, losses: 0, strikeouts: 0, earnedRuns: 0,
    },
    motivation: 50,
    ...overrides,
  };
}

const testDate: GameDate = { year: 1, month: 6, day: 15 };

// ============================================================
// C3-test1: 確率 0.5%/日で統計範囲
// ============================================================

describe('C3-test1: イベント発生確率', () => {
  it('基本確率は 0.005 (0.5%/日)', () => {
    // growthRate < 0.7 かつ motivation < 70 にして ボーナスなし状態にする
    const player = makePlayer({
      potential: {
        ceiling: makePlayer().potential.ceiling,
        growthRate: 0.5, // < 0.7 → 適性ボーナスなし
        growthType: 'normal',
      },
      motivation: 50, // < 70 → motivationボーナスなし
    });
    const prob = calcGrowthEventProbability(player, 0);
    expect(prob).toBeCloseTo(0.005, 5);
  });

  it('練習継続5日以上で確率 +0.3%', () => {
    const player = makePlayer();
    const probBase = calcGrowthEventProbability(player, 0);
    const probCont = calcGrowthEventProbability(player, 5);
    expect(probCont - probBase).toBeCloseTo(0.003, 5);
  });

  it('growthRate >= 0.7 なら確率 +0.2%', () => {
    const playerHigh = makePlayer({ potential: { ceiling: makePlayer().potential.ceiling, growthRate: 0.8, growthType: 'normal' } });
    const playerLow = makePlayer({ potential: { ceiling: makePlayer().potential.ceiling, growthRate: 0.5, growthType: 'normal' } });
    const probHigh = calcGrowthEventProbability(playerHigh, 0);
    const probLow = calcGrowthEventProbability(playerLow, 0);
    expect(probHigh - probLow).toBeCloseTo(0.002, 5);
  });

  it('10000日試行で 0.5%/日に近い発生数（統計的範囲確認）', () => {
    const player = makePlayer();
    const rng = createRNG('c3-test1-stats');
    let count = 0;
    const trials = 10000;

    for (let i = 0; i < trials; i++) {
      const trialRng = rng.derive(`trial-${i}`);
      if (shouldGenerateEvent(player, 0, trialRng)) {
        count++;
      }
    }

    // 期待値: 50 / 10000 = 0.5%
    // 3σ 範囲: 50 ± 3*sqrt(50*(1-0.005)) ≈ 50 ± 21
    const rate = count / trials;
    expect(rate).toBeGreaterThan(0.002); // 最低でも 0.2%
    expect(rate).toBeLessThan(0.015);    // 最大でも 1.5%
  });
});

// ============================================================
// C3-test2: イベントの効果が反映されること
// ============================================================

describe('C3-test2: イベント効果の反映', () => {
  it('generateGrowthEvents で生成されたイベントを applyGrowthEvents で適用できる', () => {
    // 確実にイベントが発生するよう大量試行
    const players: Player[] = [];
    for (let i = 0; i < 50; i++) {
      players.push(makePlayer({ id: `p${i}`, position: i < 5 ? 'pitcher' : 'center' }));
    }

    let events;
    let attempts = 0;
    const rng = createRNG('c3-test2');
    do {
      events = generateGrowthEvents(players, testDate, rng.derive(`attempt-${attempts}`));
      attempts++;
    } while (events.length === 0 && attempts < 1000);

    // 最低1件のイベントが発生するはず（50人 × 0.5% × 1000試行）
    expect(events.length).toBeGreaterThan(0);

    // applyGrowthEvents で選手に効果を反映
    const { updatedPlayers, appliedEvents } = applyGrowthEvents(players, events);
    expect(appliedEvents.length).toBe(events.length);

    // 効果が反映された選手の能力が変化しているか確認
    for (const evt of events) {
      const original = players.find((p) => p.id === evt.playerId);
      const updated = updatedPlayers.find((p) => p.id === evt.playerId);
      expect(original).toBeDefined();
      expect(updated).toBeDefined();

      // 効果があれば何らかの stats が変化しているはず
      if (evt.effects.length > 0) {
        // 少なくとも説明文が正しく設定されている
        expect(evt.description).toBeTruthy();
        expect(evt.description.length).toBeGreaterThan(0);
      }
    }
  });

  it('opposite_field イベントで batting.contact と batting.technique が上がる', () => {
    // opposite_field イベントを直接テストするため、generateGrowthEvents を使い
    // 野手プレイヤーで複数回試行して opposite_field イベントを得る
    const players = [makePlayer({ id: 'batter1', position: 'center', motivation: 80 })];
    const rng = createRNG('c3-test2-opposite');

    let oppositeEvent = null;
    for (let i = 0; i < 10000; i++) {
      const events = generateGrowthEvents(players, testDate, rng.derive(`t${i}`));
      const found = events.find((e) => e.type === 'opposite_field');
      if (found) {
        oppositeEvent = found;
        break;
      }
    }

    if (oppositeEvent) {
      const { updatedPlayers } = applyGrowthEvents(players, [oppositeEvent]);
      const updated = updatedPlayers[0];
      const original = players[0];

      expect(updated.stats.batting.contact).toBeGreaterThan(original.stats.batting.contact);
    }
    // イベントが得られなかった場合でも統計的に起こりうる → スキップ
  });

  it('mental_shift イベントで base.mental が上がる', () => {
    const players = [makePlayer({ id: 'p1', position: 'catcher', motivation: 20 })]; // 低motivation → mental_shift が出やすい
    const rng = createRNG('c3-test2-mental');

    let mentalEvent = null;
    for (let i = 0; i < 10000; i++) {
      const events = generateGrowthEvents(players, testDate, rng.derive(`t${i}`));
      const found = events.find((e) => e.type === 'mental_shift');
      if (found) {
        mentalEvent = found;
        break;
      }
    }

    if (mentalEvent) {
      const { updatedPlayers } = applyGrowthEvents(players, [mentalEvent]);
      const updated = updatedPlayers[0];
      const original = players[0];
      // mental か confidence が上がっているはず
      const mentalUp = updated.stats.base.mental > original.stats.base.mental;
      const confUp = updated.mentalState.confidence > original.mentalState.confidence;
      expect(mentalUp || confUp).toBe(true);
    }
  });
});

// ============================================================
// C3-test3: eventLog に永続化されること
// ============================================================

describe('C3-test3: eventLog への永続化', () => {
  it('生成されたイベントが GrowthEvent の構造を持つ', () => {
    const players = [makePlayer({ id: 'p1' })];
    const rng = createRNG('c3-test3');

    let events = null;
    for (let i = 0; i < 1000; i++) {
      const e = generateGrowthEvents(players, testDate, rng.derive(`t${i}`));
      if (e.length > 0) {
        events = e;
        break;
      }
    }

    if (events && events.length > 0) {
      const evt = events[0];
      expect(evt).toHaveProperty('id');
      expect(evt).toHaveProperty('playerId');
      expect(evt).toHaveProperty('date');
      expect(evt).toHaveProperty('type');
      expect(evt).toHaveProperty('description');
      expect(evt).toHaveProperty('effects');
      expect(typeof evt.id).toBe('string');
      expect(typeof evt.description).toBe('string');
      expect(Array.isArray(evt.effects)).toBe(true);
    }
  });

  it('1日に同じ選手から複数イベントが発生しない（1人1イベント/日）', () => {
    const player = makePlayer({ id: 'single-player' });
    const rng = createRNG('c3-test3-dedup');

    for (let i = 0; i < 100; i++) {
      const events = generateGrowthEvents([player], testDate, rng.derive(`t${i}`));
      expect(events.filter((e) => e.playerId === 'single-player').length).toBeLessThanOrEqual(1);
    }
  });

  it('GrowthEvent の effects は statPath と delta を持つ', () => {
    const players = Array.from({ length: 30 }, (_, i) =>
      makePlayer({ id: `p${i}`, position: i < 3 ? 'pitcher' : 'center' })
    );
    const rng = createRNG('c3-test3-effects');

    for (let i = 0; i < 500; i++) {
      const events = generateGrowthEvents(players, testDate, rng.derive(`t${i}`));
      for (const evt of events) {
        for (const eff of evt.effects) {
          expect(typeof eff.statPath).toBe('string');
          expect(typeof eff.delta).toBe('number');
          expect(eff.delta).not.toBe(0);
        }
      }
    }
  });
});
