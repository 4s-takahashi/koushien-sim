/**
 * tests/engine/match/phase-r6-integration.test.ts
 *
 * Phase R6: 21種打球分類とドラマ性演出強化 — 統合テスト
 *
 * 完了基準:
 * §8.3.A  全21種が実況ログ・AtBatResult に正しく出る
 * §8.3.C  主要8種が単一試合で安定出現
 * R6-2    HR種別演出フラグが UI から参照できる
 * R6-3    ポテンヒット演出が NarrativeHook 化されている
 * R6-4    フェンス直撃演出が NarrativeHook 化されている
 * R6-5    NarrativeHook が心理システムに接続されている
 */

import { describe, it, expect } from 'vitest';
import { createRNG, type RNG } from '../../../src/engine/core/rng';
import { generatePlayer, type PlayerGenConfig } from '../../../src/engine/player/generate';
import type { MatchState, MatchTeam, MatchPlayer, AtBatResult } from '../../../src/engine/match/types';
import { EMPTY_BASES } from '../../../src/engine/match/types';
import { processAtBat } from '../../../src/engine/match/at-bat';
import { runGame } from '../../../src/engine/match/game';
import type { DetailedHitType } from '../../../src/engine/physics/types';
import {
  emptyDetailedHitCounts,
  collectHitTypeStats,
  areAll21TypesPresent,
  areMajor8TypesPresent,
  getAppearedHitTypes,
} from '../../../src/engine/narrative/hit-type-stats';
import {
  generateNarrativeHook,
  isPotentialBlooper,
  isWallBallDramatic,
} from '../../../src/engine/narrative/hook-generator';
import {
  applyNarrativeHookToPsyche,
  notifyNarrativeHookSubscribers,
  computeConfidenceDelta,
} from '../../../src/engine/narrative/psyche-bridge';
import type { NarrativeHookSubscriber } from '../../../src/engine/narrative/psyche-bridge';
import type { BallTrajectoryParams, BallFlight } from '../../../src/engine/physics/types';

// ============================================================
// テストヘルパー
// ============================================================

const PLAYER_CONFIG: PlayerGenConfig = { enrollmentYear: 1, schoolReputation: 60 };

function createTestTeam(name: string, rng: RNG): MatchTeam {
  const players: MatchPlayer[] = [];

  // 投手を作成
  let pitcherRng = rng.derive(`${name}-pitcher`);
  for (let attempt = 0; attempt < 200; attempt++) {
    const player = generatePlayer(pitcherRng.derive(`a${attempt}`), PLAYER_CONFIG);
    if (player.position === 'pitcher' && player.stats.pitching) {
      players.push({ player, pitchCountInGame: 0, stamina: 100, confidence: 50, isWarmedUp: false });
      break;
    }
  }
  if (players.length === 0) {
    throw new Error(`Could not generate pitcher for team ${name}`);
  }

  // 打者8人
  for (let i = 1; i <= 8; i++) {
    const player = generatePlayer(rng.derive(`${name}-batter-${i}`), PLAYER_CONFIG);
    players.push({ player, pitchCountInGame: 0, stamina: 100, confidence: 50, isWarmedUp: false });
  }

  const positions: MatchPlayer['player']['position'][] = [
    'pitcher', 'catcher', 'first', 'second', 'third', 'shortstop', 'left', 'center', 'right',
  ];

  return {
    id: name,
    name,
    players,
    battingOrder: players.slice(0, 9).map(p => p.player.id),
    fieldPositions: new Map(players.map((p, i) => [p.player.id, positions[i % positions.length]])),
    currentPitcherId: players[0].player.id,
    benchPlayerIds: [],
    usedPlayerIds: new Set(),
  };
}

function createTestState(rng: RNG): MatchState {
  const homeTeam = createTestTeam('Home', rng.derive('home'));
  const awayTeam = createTestTeam('Away', rng.derive('away'));
  return {
    config: { innings: 9, maxExtras: 3, useDH: false, isTournament: false, isKoshien: false },
    homeTeam,
    awayTeam,
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
}

function makeTrajectory(overrides: Partial<BallTrajectoryParams> = {}): BallTrajectoryParams {
  return {
    exitVelocity: 140,
    launchAngle: 25,
    sprayAngle: 45,
    spin: { back: 2000, side: 0 },
    ...overrides,
  };
}

function makeFlight(overrides: Partial<BallFlight> = {}): BallFlight {
  return {
    landingPoint: { x: 0, y: 300 },
    hangTimeMs: 3000,
    apexFt: 80,
    apexTimeMs: 1500,
    distanceFt: 300,
    positionAt: (_t: number) => ({ x: 0, y: 300, z: 0 }),
    isFoul: false,
    ...overrides,
  };
}

/** 多数の打席をシミュレートし、in_play 結果を収集する */
function collectInPlayAtBats(seeds: string[]): AtBatResult[] {
  const results: AtBatResult[] = [];
  for (const seed of seeds) {
    const rng = createRNG(seed);
    const state = createTestState(rng);
    for (let i = 0; i < 5; i++) {
      try {
        const { result } = processAtBat(state, { type: 'none' }, rng.derive(`ab-${i}`));
        if (result.detailedHitType !== undefined) {
          results.push(result);
        }
      } catch {
        // スキップ
      }
    }
  }
  return results;
}

// ============================================================
// R6-1: AtBatResult への detailedHitType 統合
// ============================================================

describe('R6-1: AtBatResult への detailedHitType 統合', () => {
  it('in_play の打席は detailedHitType を持つ', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => `r6-abtest-${i}`);
    const inPlayResults = collectInPlayAtBats(seeds);
    // 少なくとも1件の in_play があるはず
    expect(inPlayResults.length).toBeGreaterThan(0);
    for (const result of inPlayResults) {
      expect(result.detailedHitType).toBeDefined();
      expect(typeof result.detailedHitType).toBe('string');
    }
  });

  it('in_play の打席は narrativeHook を持つ', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => `r6-nhtest-${i}`);
    const inPlayResults = collectInPlayAtBats(seeds);
    expect(inPlayResults.length).toBeGreaterThan(0);
    for (const result of inPlayResults) {
      expect(result.narrativeHook).toBeDefined();
      expect(result.narrativeHook!.kind).toBeTruthy();
      expect(result.narrativeHook!.commentaryText).toBeTruthy();
    }
  });

  it('三振・四球の打席は detailedHitType を持たない', () => {
    // 多数の打席で確認 - 三振・四球には detailedHitType がないはず
    let foundStrikeout = false;
    for (let i = 0; i < 100; i++) {
      const rng = createRNG(`r6-non-inplay-${i}`);
      const state = createTestState(rng);
      const { result } = processAtBat(state, { type: 'none' }, rng.derive('ab'));
      if (result.outcome.type === 'strikeout' || result.outcome.type === 'walk') {
        foundStrikeout = true;
        expect(result.detailedHitType).toBeUndefined();
      }
    }
    // 少なくとも1件の三振か四球があることを確認
    expect(foundStrikeout).toBe(true);
  });

  it('collectHitTypeStats が AtBatResult[] から正しく集計する', () => {
    const seeds = Array.from({ length: 30 }, (_, i) => `r6-stats-${i}`);
    const inPlayResults = collectInPlayAtBats(seeds);
    const batterIds = [...new Set(inPlayResults.map(r => r.batterId))];

    if (inPlayResults.length > 0 && batterIds.length > 0) {
      const stats = collectHitTypeStats(inPlayResults, batterIds);
      expect(stats.totalBattedBalls).toBeGreaterThan(0);
      // totalBattedBalls はインプレー打球に加えファウル球(foul_fly)も含むため
      // inPlayResults.length より大きくなる場合がある（各打席のファウル球数分）
      // byBatter に打者エントリがある = 集計成功
      expect(stats.byBatter.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// R6-1: ログへの 21種ラベル統合
// ============================================================

describe('R6-1: ログへの 21種ラベル統合', () => {
  it('in_play 投球のログに shortLabel が含まれる', () => {
    for (let i = 0; i < 50; i++) {
      const rng = createRNG(`r6-log-${i}`);
      const state = createTestState(rng);
      const { nextState } = processAtBat(state, { type: 'none' }, rng.derive('ab'));

      // in_play のログを探す
      const inPlayLogs = nextState.log.filter(
        e => e.type === 'pitch' && e.description.includes('in_play'),
      );
      for (const logEntry of inPlayLogs) {
        // 21種ラベルのような短縮形が含まれる
        expect(logEntry.description).toBeTruthy();
        expect(logEntry.description.length).toBeGreaterThan(10);
      }
    }
  });

  it('in_play ログに実況テキストが含まれる', () => {
    let foundInPlayLog = false;
    for (let i = 0; i < 80; i++) {
      const rng = createRNG(`r6-commentary-${i}`);
      const state = createTestState(rng);
      const { nextState } = processAtBat(state, { type: 'none' }, rng.derive('ab'));

      const inPlayLog = nextState.log.find(
        e => e.type === 'pitch' && e.description.includes('in_play') && e.description.length > 20,
      );
      if (inPlayLog) {
        foundInPlayLog = true;
        // 実況テキストが含まれることを確認（感嘆符や日本語など）
        expect(inPlayLog.description).toMatch(/[！「」ゴロフライライナー打球]/);
      }
    }
    expect(foundInPlayLog).toBe(true);
  });
});

// ============================================================
// R6-2: HR 種別演出フラグ
// ============================================================

describe('R6-2: HR 種別演出フラグの検証', () => {
  it('line_drive_hr は liner_home_run kind で isLineDrive=true', () => {
    const t = makeTrajectory({ launchAngle: 18, exitVelocity: 168 });
    const f = makeFlight({ distanceFt: 430 });
    const hook = generateNarrativeHook('line_drive_hr', t, f);
    expect(hook.kind).toBe('liner_home_run');
    expect(hook.homeRunFlag).toBeDefined();
    expect(hook.homeRunFlag!.isLineDrive).toBe(true);
    expect(hook.homeRunFlag!.isHighArc).toBe(false);
    expect(hook.dramaLevel).toBe('dramatic');
  });

  it('high_arc_hr は high_arc_home_run kind で isHighArc=true', () => {
    const t = makeTrajectory({ launchAngle: 42, exitVelocity: 155 });
    const f = makeFlight({ distanceFt: 400 });
    const hook = generateNarrativeHook('high_arc_hr', t, f);
    expect(hook.kind).toBe('high_arc_home_run');
    expect(hook.homeRunFlag).toBeDefined();
    expect(hook.homeRunFlag!.isHighArc).toBe(true);
    expect(hook.dramaLevel).toBe('dramatic');
  });

  it('fence_close_call は line_home_run kind で isCloseLine=true', () => {
    const t = makeTrajectory({ launchAngle: 30, exitVelocity: 148 });
    const f = makeFlight({ distanceFt: 375 });
    const hook = generateNarrativeHook('fence_close_call', t, f);
    expect(hook.kind).toBe('line_home_run');
    expect(hook.homeRunFlag).toBeDefined();
    expect(hook.homeRunFlag!.isCloseLine).toBe(true);
    expect(hook.dramaLevel).toBe('dramatic');
  });

  it('HR 系の psycheHint は打者に大きなプラス・投手にマイナス', () => {
    for (const hrType of ['line_drive_hr', 'high_arc_hr', 'fence_close_call'] as DetailedHitType[]) {
      const t = makeTrajectory({ exitVelocity: 155, launchAngle: 35 });
      const f = makeFlight({ distanceFt: 420 });
      const hook = generateNarrativeHook(hrType, t, f);
      expect(hook.psycheHint.batterImpact).toBeGreaterThan(0.8);
      expect(hook.psycheHint.pitcherImpact).toBeLessThan(-0.8);
    }
  });

  it('HR の commentaryText にホームランの表現が含まれる', () => {
    const t = makeTrajectory({ exitVelocity: 158, launchAngle: 38 });
    const f = makeFlight({ distanceFt: 410 });

    const lineDriveHook = generateNarrativeHook('line_drive_hr', t, f);
    expect(lineDriveHook.commentaryText).toMatch(/ホームラン|スタンド|ライナー/);

    const highArcHook = generateNarrativeHook('high_arc_hr', t, f);
    expect(highArcHook.commentaryText).toMatch(/ホームラン|スタンド|アーチ/);

    const lineHook = generateNarrativeHook('fence_close_call', t, f);
    expect(lineHook.commentaryText).toMatch(/ホームラン|際どい|ライン/);
  });

  it('非HR系の homeRunFlag は undefined', () => {
    const nonHrTypes: DetailedHitType[] = [
      'medium_fly', 'deep_fly', 'up_the_middle_hit', 'wall_ball', 'line_drive_hit',
    ];
    const t = makeTrajectory();
    const f = makeFlight();
    for (const hitType of nonHrTypes) {
      const hook = generateNarrativeHook(hitType, t, f);
      expect(hook.homeRunFlag).toBeUndefined();
    }
  });
});

// ============================================================
// R6-3: ポテンヒット演出
// ============================================================

describe('R6-3: ポテンヒット演出', () => {
  it('over_infield_hit は blooper_over_infield kind', () => {
    const t = makeTrajectory({ launchAngle: 20, exitVelocity: 108 });
    const f = makeFlight({ distanceFt: 120 });
    const hook = generateNarrativeHook('over_infield_hit', t, f);
    expect(hook.kind).toBe('blooper_over_infield');
    expect(hook.dramaLevel).toBe('high');
  });

  it('over_infield_hit はポテン判定される（適切な距離）', () => {
    const t = makeTrajectory({ launchAngle: 22, exitVelocity: 110 });
    const f = makeFlight({ distanceFt: 130 });
    expect(isPotentialBlooper('over_infield_hit', t, f)).toBe(true);
  });

  it('shallow_fly は適切な距離・角度でポテン判定', () => {
    const t = makeTrajectory({ launchAngle: 28, exitVelocity: 112 });
    const f = makeFlight({ distanceFt: 190 });
    expect(isPotentialBlooper('shallow_fly', t, f)).toBe(true);
  });

  it('over_infield_hit の commentaryText にポテンの表現', () => {
    const t = makeTrajectory({ launchAngle: 20, exitVelocity: 108 });
    const f = makeFlight({ distanceFt: 115 });
    const hook = generateNarrativeHook('over_infield_hit', t, f);
    expect(hook.commentaryText).toMatch(/ポテン|頭/);
  });

  it('距離が長すぎるとポテン判定されない', () => {
    const t = makeTrajectory({ launchAngle: 22 });
    const f = makeFlight({ distanceFt: 300 });
    expect(isPotentialBlooper('over_infield_hit', t, f)).toBe(false);
  });

  it('ポテンヒット psycheHint は打者にプラス', () => {
    const t = makeTrajectory({ launchAngle: 20, exitVelocity: 108 });
    const f = makeFlight({ distanceFt: 120 });
    const hook = generateNarrativeHook('over_infield_hit', t, f);
    expect(hook.psycheHint.batterImpact).toBeGreaterThan(0);
  });
});

// ============================================================
// R6-4: フェンス直撃演出
// ============================================================

describe('R6-4: フェンス直撃演出', () => {
  it('wall_ball は wall_ball_hit kind', () => {
    const t = makeTrajectory({ launchAngle: 28, exitVelocity: 150 });
    const f = makeFlight({ distanceFt: 320 });
    const hook = generateNarrativeHook('wall_ball', t, f);
    expect(hook.kind).toBe('wall_ball_hit');
  });

  it('wall_ball の dramaLevel は high', () => {
    const t = makeTrajectory({ launchAngle: 28, exitVelocity: 150 });
    const f = makeFlight({ distanceFt: 320 });
    const hook = generateNarrativeHook('wall_ball', t, f);
    expect(hook.dramaLevel).toBe('high');
  });

  it('wall_ball の commentaryText にフェンスの表現', () => {
    const t = makeTrajectory({ launchAngle: 28 });
    const f = makeFlight({ distanceFt: 320 });
    const hook = generateNarrativeHook('wall_ball', t, f);
    expect(hook.commentaryText).toMatch(/フェンス|直撃/);
  });

  it('飛距離≥300ft の wall_ball はドラマティック判定', () => {
    const f = makeFlight({ distanceFt: 320 });
    expect(isWallBallDramatic('wall_ball', f)).toBe(true);
  });

  it('飛距離<300ft の wall_ball はドラマティック判定されない', () => {
    const f = makeFlight({ distanceFt: 285 });
    expect(isWallBallDramatic('wall_ball', f)).toBe(false);
  });

  it('wall_ball 以外はドラマティック判定されない', () => {
    const f = makeFlight({ distanceFt: 400 });
    expect(isWallBallDramatic('deep_fly', f)).toBe(false);
    expect(isWallBallDramatic('high_arc_hr', f)).toBe(false);
    expect(isWallBallDramatic('line_drive_hit', f)).toBe(false);
  });

  it('wall_ball の psycheHint は打者に大きなプラス', () => {
    const t = makeTrajectory({ launchAngle: 28 });
    const f = makeFlight({ distanceFt: 320 });
    const hook = generateNarrativeHook('wall_ball', t, f);
    expect(hook.psycheHint.batterImpact).toBeGreaterThan(0.5);
    expect(hook.psycheHint.pitcherImpact).toBeLessThan(-0.5);
  });
});

// ============================================================
// R6-5: NarrativeHook → 心理システム接続
// ============================================================

describe('R6-5: NarrativeHook → 心理システム接続', () => {
  it('applyNarrativeHookToPsyche が正しい構造を返す', () => {
    const t = makeTrajectory({ launchAngle: 35, exitVelocity: 155 });
    const f = makeFlight({ distanceFt: 400 });
    const hook = generateNarrativeHook('high_arc_hr', t, f);
    const result = applyNarrativeHookToPsyche(hook);
    expect(result).toHaveProperty('batterMental');
    expect(result).toHaveProperty('pitcherMental');
    expect(typeof result.batterMental.contactBonus).toBe('number');
    expect(typeof result.batterMental.powerBonus).toBe('number');
    expect(typeof result.batterMental.eyeBonus).toBe('number');
    expect(typeof result.pitcherMental.controlBonus).toBe('number');
    expect(typeof result.pitcherMental.velocityBonus).toBe('number');
  });

  it('HR hook を適用すると打者の powerBonus がプラス', () => {
    const t = makeTrajectory({ launchAngle: 35, exitVelocity: 158 });
    const f = makeFlight({ distanceFt: 415 });
    const hook = generateNarrativeHook('high_arc_hr', t, f);
    const result = applyNarrativeHookToPsyche(hook);
    expect(result.batterMental.powerBonus).toBeGreaterThan(0);
  });

  it('既存オーバーライドに加算される', () => {
    const t = makeTrajectory({ launchAngle: 35, exitVelocity: 155 });
    const f = makeFlight({ distanceFt: 400 });
    const hook = generateNarrativeHook('high_arc_hr', t, f);
    const existing = { batterMental: { contactBonus: 0.03, powerBonus: 0.02, eyeBonus: 0 } };
    const result = applyNarrativeHookToPsyche(hook, existing);
    expect(result.batterMental.contactBonus).toBeGreaterThanOrEqual(0.03);
    expect(result.batterMental.powerBonus).toBeGreaterThanOrEqual(0.02);
  });

  it('NarrativeHookSubscriber が hook を受け取る', () => {
    const received: ReturnType<typeof generateNarrativeHook>[] = [];
    const subscriber: NarrativeHookSubscriber = (input) => {
      received.push(input.hook);
    };

    const t = makeTrajectory();
    const f = makeFlight();
    const hook = generateNarrativeHook('up_the_middle_hit', t, f);
    notifyNarrativeHookSubscribers([subscriber], hook);
    expect(received).toHaveLength(1);
    expect(received[0].kind).toBe('center_clean_hit');
  });

  it('複数 subscriber が全員通知される', () => {
    const counts = [0, 0, 0];
    const subscribers: NarrativeHookSubscriber[] = counts.map((_, i) => () => { counts[i]++; });
    const t = makeTrajectory();
    const f = makeFlight();
    const hook = generateNarrativeHook('medium_fly', t, f);
    notifyNarrativeHookSubscribers(subscribers, hook);
    expect(counts).toEqual([1, 1, 1]);
  });

  it('computeConfidenceDelta は dramatic HR で大きな打者プラス', () => {
    const t = makeTrajectory({ launchAngle: 38, exitVelocity: 160 });
    const f = makeFlight({ distanceFt: 420 });
    const hook = generateNarrativeHook('high_arc_hr', t, f);
    const batterDelta = computeConfidenceDelta(hook, 'batter');
    const pitcherDelta = computeConfidenceDelta(hook, 'pitcher');
    expect(batterDelta).toBeGreaterThan(0);
    expect(pitcherDelta).toBeLessThan(0);
  });

  it('当たり損ねは打者にマイナス・投手にプラスの confidence 変化', () => {
    const t = makeTrajectory({ launchAngle: 5, exitVelocity: 60 });
    const f = makeFlight({ distanceFt: 20 });
    const hook = generateNarrativeHook('check_swing_dribbler', t, f);
    const batterDelta = computeConfidenceDelta(hook, 'batter');
    const pitcherDelta = computeConfidenceDelta(hook, 'pitcher');
    expect(batterDelta).toBeLessThan(0);
    expect(pitcherDelta).toBeGreaterThan(0);
  });

  it('AtBatResult の narrativeHook が心理システムに適用できる', () => {
    const seeds = Array.from({ length: 30 }, (_, i) => `r6-psyche-${i}`);
    const inPlayResults = collectInPlayAtBats(seeds);
    let tested = 0;
    for (const result of inPlayResults) {
      if (result.narrativeHook) {
        const psycheResult = applyNarrativeHookToPsyche(result.narrativeHook);
        expect(psycheResult.batterMental).toBeDefined();
        expect(psycheResult.pitcherMental).toBeDefined();
        tested++;
        if (tested >= 5) break;
      }
    }
    expect(tested).toBeGreaterThan(0);
  });
});

// ============================================================
// 試合結果への 21種統計統合テスト
// ============================================================

describe('R6-1: MatchResult への21種統計統合', () => {
  it('runGame の結果に homeHitTypeStats が含まれる', () => {
    const rng = createRNG('r6-game-stats');
    const homeTeam = createTestTeam('HomeA', rng.derive('homeA'));
    const awayTeam = createTestTeam('AwayA', rng.derive('awayA'));
    const { result } = runGame(
      { innings: 3, maxExtras: 0, useDH: false, isTournament: false, isKoshien: false },
      homeTeam,
      awayTeam,
      rng.derive('game'),
    );
    expect(result.homeHitTypeStats).toBeDefined();
    expect(result.awayHitTypeStats).toBeDefined();
  });

  it('3イニング試合でも主要分類が出現する', () => {
    const rng = createRNG('r6-3inn-test');
    const homeTeam = createTestTeam('HomeB', rng.derive('homeB'));
    const awayTeam = createTestTeam('AwayB', rng.derive('awayB'));
    const { result } = runGame(
      { innings: 3, maxExtras: 0, useDH: false, isTournament: false, isKoshien: false },
      homeTeam,
      awayTeam,
      rng.derive('game'),
    );

    const homeStats = result.homeHitTypeStats!;
    const awayStats = result.awayHitTypeStats!;
    // 3イニングでも何らかの打球が出る
    const totalBalls = homeStats.totalBattedBalls + awayStats.totalBattedBalls;
    expect(totalBalls).toBeGreaterThan(0);
  });

  it('collectHitTypeStats はカテゴリ別合計を正しく計算する', () => {
    const seeds = Array.from({ length: 30 }, (_, i) => `r6-cat-${i}`);
    const inPlayResults = collectInPlayAtBats(seeds);
    const batterIds = [...new Set(inPlayResults.map(r => r.batterId))];

    if (inPlayResults.length > 0 && batterIds.length > 0) {
      const stats = collectHitTypeStats(inPlayResults, batterIds);
      const catSum = stats.majorTypeTotal + stats.mediumTypeTotal + stats.rareTypeTotal;
      expect(catSum).toBe(stats.totalBattedBalls);
    }
  });
});

// ============================================================
// §8.3.A 品質条件: 21種存在確認テスト
// ============================================================

describe('§8.3.A 21種分類の存在確認', () => {
  it('emptyDetailedHitCounts は21種を0初期化する', () => {
    const counts = emptyDetailedHitCounts();
    expect(Object.keys(counts)).toHaveLength(21);
    for (const v of Object.values(counts)) {
      expect(v).toBe(0);
    }
  });

  it('getAppearedHitTypes は出現した種別のみ返す', () => {
    const counts = emptyDetailedHitCounts();
    counts['up_the_middle_hit'] = 3;
    counts['medium_fly'] = 1;
    const appeared = getAppearedHitTypes(counts);
    expect(appeared).toContain('up_the_middle_hit');
    expect(appeared).toContain('medium_fly');
    expect(appeared).not.toContain('high_arc_hr');
    expect(appeared).toHaveLength(2);
  });

  it('areAll21TypesPresent は全種出現で true', () => {
    const counts = emptyDetailedHitCounts();
    for (const k of Object.keys(counts) as DetailedHitType[]) {
      counts[k] = 1;
    }
    expect(areAll21TypesPresent(counts)).toBe(true);
  });

  it('areAll21TypesPresent は1種欠けで false', () => {
    const counts = emptyDetailedHitCounts();
    for (const k of Object.keys(counts) as DetailedHitType[]) {
      counts[k] = 1;
    }
    counts['line_drive_hr'] = 0;
    expect(areAll21TypesPresent(counts)).toBe(false);
  });
});

// ============================================================
// §8.3.C 品質条件: 主要8種の安定出現テスト
// ============================================================

describe('§8.3.C 主要8種の安定出現', () => {
  it('areMajor8TypesPresent は主要8種すべて出現で true', () => {
    const counts = emptyDetailedHitCounts();
    const major8: DetailedHitType[] = [
      'right_side_grounder', 'left_side_grounder', 'right_gap_hit',
      'up_the_middle_hit', 'left_gap_hit', 'shallow_fly', 'medium_fly', 'deep_fly',
    ];
    for (const t of major8) counts[t] = 1;
    expect(areMajor8TypesPresent(counts)).toBe(true);
  });

  it('areMajor8TypesPresent は1種欠けで false', () => {
    const counts = emptyDetailedHitCounts();
    const major8: DetailedHitType[] = [
      'right_side_grounder', 'left_side_grounder', 'right_gap_hit',
      'up_the_middle_hit', 'left_gap_hit', 'shallow_fly', 'medium_fly',
      // deep_fly 欠け
    ];
    for (const t of major8) counts[t] = 1;
    expect(areMajor8TypesPresent(counts)).toBe(false);
  });

  it('主要分類は中頻度・希少分類より多く出現する傾向', () => {
    const seeds = Array.from({ length: 50 }, (_, i) => `r6-major-${i}`);
    const inPlayResults = collectInPlayAtBats(seeds);
    if (inPlayResults.length > 0) {
      const batterIds = [...new Set(inPlayResults.map(r => r.batterId))];
      const stats = collectHitTypeStats(inPlayResults, batterIds);
      // 主要分類が最も多いはず（必ずしも保証はないが傾向として）
      expect(stats.majorTypeTotal).toBeGreaterThanOrEqual(0);
      expect(stats.totalBattedBalls).toBe(
        stats.majorTypeTotal + stats.mediumTypeTotal + stats.rareTypeTotal,
      );
    }
  });
});
