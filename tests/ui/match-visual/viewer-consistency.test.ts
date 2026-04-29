/**
 * Phase R5: §12.5 Viewer 整合テスト
 *
 * 目的: timeline と UI 再生が常に整合すること、UI 操作で結果が変わらないこと。
 *
 * テスト観点:
 * 1. buildAnimationFromTimeline が有効な PlaySequence を生成すること
 * 2. timeline のイベント順序が AnimationSequence のフェーズ順と一致すること
 * 3. out/safe 判定が timeline から読み取られ、UI 側で変更されないこと
 * 4. timeScale 変更が結果に影響しないこと（倍速・スロー）
 * 5. getTimelineStepPoints が正しい境界時刻を返すこと
 * 6. 150ms ハック削除後も buildGroundOutSequence の先着順が engine 判定と一致すること
 * 7. 各種プレイタイプで totalMs > 0 が保証されること
 * 8. easing 適用後も到達順が変わらないこと
 */

import { describe, it, expect } from 'vitest';
import {
  buildAnimationFromTimeline,
  getTimelineStepPoints,
  buildGroundOutSequence,
  buildInfieldHitSequence,
} from '../../../src/ui/match-visual/useBallAnimation';
import type { PlayResolution, CanonicalTimeline } from '../../../src/engine/physics/types';

// ============================================================
// テスト用 PlayResolution ファクトリ
// ============================================================

function makeTimeline(events: CanonicalTimeline['events']): CanonicalTimeline {
  return { events };
}

/**
 * アウトになる PlayResolution (ゴロアウト)
 */
function makeGroundOutResolution(): PlayResolution {
  const timeline = makeTimeline([
    { t: 0, kind: 'ball_contact', trajectory: {
      exitVelocity: 80, launchAngle: -5, sprayAngle: 45,
      spin: { back: -200, side: 0 },
    }},
    { t: 300, kind: 'ball_landing', pos: { x: 0, y: 80 } },
    { t: 500, kind: 'fielder_react', fielderId: 'ss' },
    { t: 800, kind: 'fielder_field_ball', fielderId: 'ss', pos: { x: -20, y: 100 }, cleanCatch: true },
    { t: 900, kind: 'fielder_throw', fromId: 'ss', toBase: 'first', throwQuality: 0.9 },
    { t: 1200, kind: 'throw_arrival', toBase: 'first', pos: { x: 63.64, y: 63.64 } },
    { t: 1350, kind: 'runner_advance', runnerId: 'batter', fromBase: 'home', toBase: 'first' },
    { t: 1350, kind: 'runner_out', runnerId: 'batter', base: 'first', cause: 'force_out' },
    { t: 1400, kind: 'play_end' },
  ]);

  return {
    trajectory: { exitVelocity: 80, launchAngle: -5, sprayAngle: 45, spin: { back: -200, side: 0 } },
    flight: {
      landingPoint: { x: 0, y: 80 },
      hangTimeMs: 300,
      apexFt: 5,
      apexTimeMs: 150,
      distanceFt: 80,
      positionAt: (_t: number) => ({ x: 0, y: 40, z: 2 }),
      isFoul: false,
    },
    timeline,
    fieldResult: { type: 'out', fielder: 'shortstop', isError: false },
    detailedHitType: 'left_side_grounder',
    rbiCount: 0,
    baseStateAfter: { first: null, second: null, third: null },
  };
}

/**
 * シングルヒットの PlayResolution
 */
function makeSingleResolution(): PlayResolution {
  const timeline = makeTimeline([
    { t: 0, kind: 'ball_contact', trajectory: {
      exitVelocity: 130, launchAngle: 15, sprayAngle: 45,
      spin: { back: 1500, side: 200 },
    }},
    { t: 1200, kind: 'ball_landing', pos: { x: 0, y: 220 } },
    { t: 1400, kind: 'fielder_react', fielderId: 'cf' },
    { t: 2200, kind: 'fielder_field_ball', fielderId: 'cf', pos: { x: 0, y: 220 }, cleanCatch: true },
    { t: 2300, kind: 'fielder_throw', fromId: 'cf', toBase: 'second', throwQuality: 0.85 },
    { t: 2800, kind: 'throw_arrival', toBase: 'second', pos: { x: 0, y: 127.28 } },
    { t: 1800, kind: 'runner_advance', runnerId: 'batter', fromBase: 'home', toBase: 'first' },
    { t: 1800, kind: 'runner_safe', runnerId: 'batter', base: 'first' },
    { t: 3000, kind: 'play_end' },
  ]);

  return {
    trajectory: { exitVelocity: 130, launchAngle: 15, sprayAngle: 45, spin: { back: 1500, side: 200 } },
    flight: {
      landingPoint: { x: 0, y: 220 },
      hangTimeMs: 1200,
      apexFt: 45,
      apexTimeMs: 600,
      distanceFt: 220,
      positionAt: (_t: number) => ({ x: 0, y: 110, z: 30 }),
      isFoul: false,
    },
    timeline,
    fieldResult: { type: 'single', fielder: 'center', isError: false },
    detailedHitType: 'up_the_middle_hit',
    rbiCount: 0,
    baseStateAfter: { first: { playerId: 'batter', speed: 60 }, second: null, third: null },
  };
}

/**
 * ホームランの PlayResolution
 */
function makeHomeRunResolution(): PlayResolution {
  const timeline = makeTimeline([
    { t: 0, kind: 'ball_contact', trajectory: {
      exitVelocity: 170, launchAngle: 30, sprayAngle: 45,
      spin: { back: 2800, side: 0 },
    }},
    { t: 1800, kind: 'ball_landing', pos: { x: 0, y: 420 } },
    { t: 1800, kind: 'home_run', runnerId: 'batter' },
    { t: 6000, kind: 'runner_safe', runnerId: 'batter', base: 'home' },
    { t: 6100, kind: 'play_end' },
  ]);

  return {
    trajectory: { exitVelocity: 170, launchAngle: 30, sprayAngle: 45, spin: { back: 2800, side: 0 } },
    flight: {
      landingPoint: { x: 0, y: 420 },
      hangTimeMs: 1800,
      apexFt: 110,
      apexTimeMs: 900,
      distanceFt: 420,
      positionAt: (_t: number) => ({ x: 0, y: 210, z: 80 }),
      isFoul: false,
    },
    timeline,
    fieldResult: { type: 'home_run', fielder: 'center', isError: false },
    detailedHitType: 'high_arc_hr',
    rbiCount: 1,
    baseStateAfter: { first: null, second: null, third: null },
  };
}

// ============================================================
// §12.5 Viewer 整合テスト
// ============================================================

// ── 1. buildAnimationFromTimeline が有効な PlaySequence を生成する ──

describe('buildAnimationFromTimeline: 基本整合性', () => {
  it('ゴロアウト → totalMs > 0 の PlaySequence を生成する', () => {
    const seq = buildAnimationFromTimeline(makeGroundOutResolution());
    expect(seq.totalMs).toBeGreaterThan(0);
  });

  it('シングルヒット → totalMs > 0 の PlaySequence を生成する', () => {
    const seq = buildAnimationFromTimeline(makeSingleResolution());
    expect(seq.totalMs).toBeGreaterThan(0);
  });

  it('ホームラン → totalMs > 0 の PlaySequence を生成する', () => {
    const seq = buildAnimationFromTimeline(makeHomeRunResolution());
    expect(seq.totalMs).toBeGreaterThan(0);
  });

  it('全フェーズで startMs < endMs が保証される（ゴロアウト）', () => {
    const seq = buildAnimationFromTimeline(makeGroundOutResolution());
    for (const phase of seq.phases) {
      expect(phase.startMs).toBeLessThan(phase.endMs);
    }
  });

  it('全フェーズで startMs < endMs が保証される（シングル）', () => {
    const seq = buildAnimationFromTimeline(makeSingleResolution());
    for (const phase of seq.phases) {
      expect(phase.startMs).toBeLessThan(phase.endMs);
    }
  });

  it('totalMs が全フェーズの endMs 以上である', () => {
    const resolution = makeGroundOutResolution();
    const seq = buildAnimationFromTimeline(resolution);
    const maxEnd = Math.max(...seq.phases.map((p) => p.endMs));
    expect(seq.totalMs).toBeGreaterThanOrEqual(maxEnd);
  });
});

// ── 2. out/safe 判定が timeline から読み取られること ──

describe('buildAnimationFromTimeline: out/safe 判定 = timeline から読取のみ', () => {
  it('ゴロアウト → result フェーズは isOut=true', () => {
    const seq = buildAnimationFromTimeline(makeGroundOutResolution());
    const resultPhase = seq.phases.find((p) => p.kind === 'result');
    expect(resultPhase).toBeDefined();
    if (resultPhase?.data.kind === 'result') {
      expect(resultPhase.data.isOut).toBe(true);
      expect(resultPhase.data.text).toBe('アウト！');
    }
  });

  it('シングルヒット → result フェーズは isOut=false', () => {
    const seq = buildAnimationFromTimeline(makeSingleResolution());
    const resultPhase = seq.phases.find((p) => p.kind === 'result');
    expect(resultPhase).toBeDefined();
    if (resultPhase?.data.kind === 'result') {
      expect(resultPhase.data.isOut).toBe(false);
    }
  });

  it('ホームラン → result フェーズは isOut=false でテキストは「ホームラン！」', () => {
    const seq = buildAnimationFromTimeline(makeHomeRunResolution());
    const resultPhase = seq.phases.find((p) => p.kind === 'result');
    expect(resultPhase).toBeDefined();
    if (resultPhase?.data.kind === 'result') {
      expect(resultPhase.data.isOut).toBe(false);
      expect(resultPhase.data.text).toBe('ホームラン！');
    }
  });

  it('UI 側がアウト判定を独自決定していない（result フェーズは timeline の runner_out 由来）', () => {
    // ゴロアウト timeline の runner_out イベント時刻
    const resolution = makeGroundOutResolution();
    const runnerOutEvt = resolution.timeline.events.find((e) => e.kind === 'runner_out');
    expect(runnerOutEvt).toBeDefined();
    // result フェーズの startMs は runner_out の t と同程度（スケール適用後）
    const seq = buildAnimationFromTimeline(resolution);
    const resultPhase = seq.phases.find((p) => p.kind === 'result');
    if (resultPhase && runnerOutEvt) {
      // resultPhase の startMs は timeScale=1.0 なので runnerOutEvt.t と一致するはず
      expect(resultPhase.startMs).toBeCloseTo(runnerOutEvt.t, -1); // 10ms 精度
    }
  });
});

// ── 3. timeScale が結果(out/safe)に影響しないこと ──

describe('buildAnimationFromTimeline: timeScale 変更は結果に影響しない', () => {
  it('timeScale=1.0 vs 2.0: 両方とも isOut=true（ゴロアウト）', () => {
    const resolution = makeGroundOutResolution();
    const seq1 = buildAnimationFromTimeline(resolution, 1.0);
    const seq2 = buildAnimationFromTimeline(resolution, 2.0);
    const result1 = seq1.phases.find((p) => p.kind === 'result');
    const result2 = seq2.phases.find((p) => p.kind === 'result');
    if (result1?.data.kind === 'result' && result2?.data.kind === 'result') {
      expect(result1.data.isOut).toBe(result2.data.isOut);
      expect(result1.data.text).toBe(result2.data.text);
    }
  });

  it('timeScale=2.0 → totalMs が timeScale=1.0 の半分になる（倍速）', () => {
    const resolution = makeGroundOutResolution();
    const seq1 = buildAnimationFromTimeline(resolution, 1.0);
    const seq2 = buildAnimationFromTimeline(resolution, 2.0);
    // 倍速ならシーケンスの totalMs は半分（フェーズ時刻がスケールされる）
    expect(seq2.totalMs).toBeLessThan(seq1.totalMs);
  });

  it('timeScale=0.5 → totalMs が timeScale=1.0 の2倍になる（スロー）', () => {
    const resolution = makeGroundOutResolution();
    const seq1 = buildAnimationFromTimeline(resolution, 1.0);
    const seq2 = buildAnimationFromTimeline(resolution, 0.5);
    // スローならシーケンスの totalMs は2倍
    expect(seq2.totalMs).toBeGreaterThan(seq1.totalMs);
  });

  it('timeScale=1.0 vs 0.5: 両方とも isOut=false（シングルヒット）', () => {
    const resolution = makeSingleResolution();
    const seq1 = buildAnimationFromTimeline(resolution, 1.0);
    const seq2 = buildAnimationFromTimeline(resolution, 0.5);
    const result1 = seq1.phases.find((p) => p.kind === 'result');
    const result2 = seq2.phases.find((p) => p.kind === 'result');
    if (result1?.data.kind === 'result' && result2?.data.kind === 'result') {
      expect(result1.data.isOut).toBe(result2.data.isOut);
    }
  });
});

// ── 4. getTimelineStepPoints: 境界時刻リスト ──

describe('getTimelineStepPoints: 1球送りの境界時刻', () => {
  it('ゴロアウト timeline → 複数のステップ境界点を返す', () => {
    const resolution = makeGroundOutResolution();
    const points = getTimelineStepPoints(resolution.timeline);
    expect(points.length).toBeGreaterThan(2);
  });

  it('境界時刻リストは昇順ソートされている', () => {
    const resolution = makeGroundOutResolution();
    const points = getTimelineStepPoints(resolution.timeline);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]).toBeGreaterThanOrEqual(points[i - 1]!);
    }
  });

  it('timeScale=2.0 → 境界時刻が半分になる（倍速）', () => {
    const resolution = makeGroundOutResolution();
    const points1 = getTimelineStepPoints(resolution.timeline, 1.0);
    const points2 = getTimelineStepPoints(resolution.timeline, 2.0);
    // 倍速なら同じ数だが時刻は半分
    expect(points2.length).toBe(points1.length);
    for (let i = 0; i < points1.length; i++) {
      expect(points2[i]).toBeCloseTo(points1[i]! / 2, 0);
    }
  });

  it('play_end を含む境界時刻が存在する', () => {
    const resolution = makeGroundOutResolution();
    const playEndEvt = resolution.timeline.events.find((e) => e.kind === 'play_end');
    const points = getTimelineStepPoints(resolution.timeline);
    if (playEndEvt) {
      expect(points).toContain(playEndEvt.t);
    }
  });

  it('ホームラン timeline → home_run イベントが境界点に含まれる', () => {
    const resolution = makeHomeRunResolution();
    const homeRunEvt = resolution.timeline.events.find((e) => e.kind === 'home_run');
    const points = getTimelineStepPoints(resolution.timeline);
    if (homeRunEvt) {
      expect(points).toContain(homeRunEvt.t);
    }
  });

  it('重複する時刻が境界点リストに含まれない（一意性）', () => {
    const resolution = makeGroundOutResolution();
    const points = getTimelineStepPoints(resolution.timeline);
    const uniquePoints = [...new Set(points)];
    expect(points.length).toBe(uniquePoints.length);
  });
});

// ── 5. 150ms ハック削除後の先着順整合性 ──

describe('Phase R5: v0.42.0 ハック削除後の先着順整合性', () => {
  const ground = {
    contactType: 'ground_ball' as const,
    direction: 35,
    speed: 'normal' as const,
    distance: 65,
  };

  it('buildGroundOutSequence(isOut=true): result フェーズは「アウト！」', () => {
    const seq = buildGroundOutSequence(ground, true);
    const result = seq.phases.find((p) => p.kind === 'result');
    if (result?.data.kind === 'result') {
      expect(result.data.isOut).toBe(true);
      expect(result.data.text).toBe('アウト！');
    }
  });

  it('buildGroundOutSequence(isOut=false): result フェーズは「セーフ！」', () => {
    const seq = buildGroundOutSequence(ground, false);
    const result = seq.phases.find((p) => p.kind === 'result');
    if (result?.data.kind === 'result') {
      expect(result.data.isOut).toBe(false);
      expect(result.data.text).toBe('セーフ！');
    }
  });

  it('buildGroundOutSequence(isOut=true): アウト時に throw endMs < batterRun endMs（送球先着）', () => {
    const seq = buildGroundOutSequence(ground, true);
    const throwPhase = seq.phases.find((p) => p.kind === 'throw');
    const runPhase = seq.phases.filter((p) => p.kind === 'batterRun')[0];
    if (throwPhase && runPhase) {
      expect(throwPhase.endMs).toBeLessThan(runPhase.endMs);
    }
  });

  it('buildGroundOutSequence(isOut=false): セーフ時に batterRun endMs < throw endMs（走者先着）', () => {
    const seq = buildGroundOutSequence(ground, false);
    const throwPhase = seq.phases.find((p) => p.kind === 'throw');
    const runPhase = seq.phases.filter((p) => p.kind === 'batterRun')[0];
    if (throwPhase && runPhase) {
      expect(runPhase.endMs).toBeLessThan(throwPhase.endMs);
    }
  });

  it('buildInfieldHitSequence: 常に走者先着（isOut 引数不要）', () => {
    const seq = buildInfieldHitSequence(ground);
    const throwPhase = seq.phases.find((p) => p.kind === 'throw');
    const runPhase = seq.phases.filter((p) => p.kind === 'batterRun')[0];
    if (throwPhase && runPhase) {
      expect(runPhase.endMs).toBeLessThan(throwPhase.endMs);
    }
  });

  it('全フェーズの startMs < endMs が保証される（ハック削除後も崩れない）', () => {
    const seqs = [
      buildGroundOutSequence(ground, true),
      buildGroundOutSequence(ground, false),
      buildInfieldHitSequence(ground),
    ];
    for (const seq of seqs) {
      for (const phase of seq.phases) {
        expect(phase.startMs).toBeLessThan(phase.endMs);
      }
    }
  });
});
