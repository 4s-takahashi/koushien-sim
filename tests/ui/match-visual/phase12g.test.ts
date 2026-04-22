/**
 * Phase 12-G: 新機能のユニットテスト
 *
 * - buildGroundOutSequence: 内野ゴロのプレイシーケンス構築
 * - computePitchTrajPos: 投球軌道座標計算
 * - computeTrajectory: ホームラン場外飛距離
 */

import { describe, it, expect } from 'vitest';
import {
  buildGroundOutSequence,
  computeTrajectory,
} from '../../../src/ui/match-visual/useBallAnimation';
import type { BatContactForAnimation } from '../../../src/ui/match-visual/useBallAnimation';
import { computePitchTrajPos } from '../../../src/ui/match-visual/StrikeZone';

// ============================================================
// buildGroundOutSequence
// ============================================================

describe('buildGroundOutSequence', () => {
  const groundBallCenter: BatContactForAnimation = {
    contactType: 'ground_ball',
    direction: 45,
    speed: 'normal',
    distance: 80,
  };

  const groundBallLeft: BatContactForAnimation = {
    contactType: 'ground_ball',
    direction: 15,
    speed: 'normal',
    distance: 70,
  };

  const groundBallRight: BatContactForAnimation = {
    contactType: 'ground_ball',
    direction: 80,
    speed: 'normal',
    distance: 70,
  };

  it('シーケンスには groundRoll, fielderMove, throw, batterRun, result の 5 フェーズがある', () => {
    const seq = buildGroundOutSequence(groundBallCenter, true);
    const kinds = seq.phases.map((p) => p.kind);
    expect(kinds).toContain('groundRoll');
    expect(kinds).toContain('fielderMove');
    expect(kinds).toContain('throw');
    expect(kinds).toContain('batterRun');
    expect(kinds).toContain('result');
  });

  it('totalMs が 0 より大きい', () => {
    const seq = buildGroundOutSequence(groundBallCenter, true);
    expect(seq.totalMs).toBeGreaterThan(0);
  });

  it('アウト時 result フェーズのテキストは「アウト！」', () => {
    const seq = buildGroundOutSequence(groundBallCenter, true);
    const resultPhase = seq.phases.find((p) => p.kind === 'result');
    expect(resultPhase).toBeDefined();
    if (resultPhase?.data.kind === 'result') {
      expect(resultPhase.data.text).toBe('アウト！');
      expect(resultPhase.data.isOut).toBe(true);
    }
  });

  it('セーフ時 result フェーズのテキストは「セーフ！」', () => {
    const seq = buildGroundOutSequence(groundBallCenter, false);
    const resultPhase = seq.phases.find((p) => p.kind === 'result');
    expect(resultPhase).toBeDefined();
    if (resultPhase?.data.kind === 'result') {
      expect(resultPhase.data.text).toBe('セーフ！');
      expect(resultPhase.data.isOut).toBe(false);
    }
  });

  it('フェーズの開始時刻は終了時刻より前', () => {
    const seq = buildGroundOutSequence(groundBallCenter, true);
    for (const phase of seq.phases) {
      expect(phase.startMs).toBeLessThan(phase.endMs);
    }
  });

  it('左方向のゴロ → fielderMove は shortstop or third 方向', () => {
    const seq = buildGroundOutSequence(groundBallLeft, true);
    const fielderPhase = seq.phases.find((p) => p.kind === 'fielderMove');
    if (fielderPhase?.data.kind === 'fielderMove') {
      // third または shortstop（fielderPosKey が 'third' or 'shortstop'）
      expect(['third', 'shortstop']).toContain(fielderPhase.data.fielderPosKey);
    }
  });

  it('右方向のゴロ → fielderMove は second or first 方向', () => {
    const seq = buildGroundOutSequence(groundBallRight, true);
    const fielderPhase = seq.phases.find((p) => p.kind === 'fielderMove');
    if (fielderPhase?.data.kind === 'fielderMove') {
      expect(['first', 'second']).toContain(fielderPhase.data.fielderPosKey);
    }
  });

  it('throw フェーズの to は一塁方向（x > 0）', () => {
    const seq = buildGroundOutSequence(groundBallCenter, true);
    const throwPhase = seq.phases.find((p) => p.kind === 'throw');
    if (throwPhase?.data.kind === 'throw') {
      expect(throwPhase.data.to.x).toBeGreaterThan(0);
      expect(throwPhase.data.to.y).toBeGreaterThan(0);
    }
  });

  it('batterRun フェーズの from は (0, 0) ホームプレート', () => {
    const seq = buildGroundOutSequence(groundBallCenter, true);
    const runPhase = seq.phases.find((p) => p.kind === 'batterRun');
    if (runPhase?.data.kind === 'batterRun') {
      expect(runPhase.data.from.x).toBeCloseTo(0);
      expect(runPhase.data.from.y).toBeCloseTo(0);
    }
  });

  it('batterRun フェーズの to は一塁方向（x > 0, y > 0）', () => {
    const seq = buildGroundOutSequence(groundBallCenter, true);
    const runPhase = seq.phases.find((p) => p.kind === 'batterRun');
    if (runPhase?.data.kind === 'batterRun') {
      expect(runPhase.data.to.x).toBeGreaterThan(0);
      expect(runPhase.data.to.y).toBeGreaterThan(0);
    }
  });

  it('bunt_ground でも同様のシーケンスを生成できる', () => {
    const bunt: BatContactForAnimation = {
      contactType: 'bunt_ground',
      direction: 45,
      speed: 'weak',
      distance: 30,
    };
    const seq = buildGroundOutSequence(bunt, true);
    expect(seq.phases.length).toBe(5);
    expect(seq.totalMs).toBeGreaterThan(0);
  });
});

// ============================================================
// computePitchTrajPos
// ============================================================

describe('computePitchTrajPos', () => {
  const startX = 150;
  const startY = 5;
  const endX = 120;
  const endY = 200;

  it('t=0 → 開始点', () => {
    const pos = computePitchTrajPos(startX, startY, endX, endY, null, false, 0);
    expect(pos.x).toBeCloseTo(startX);
    expect(pos.y).toBeCloseTo(startY);
  });

  it('t=1 → 終点付近（変化なし）', () => {
    const pos = computePitchTrajPos(startX, startY, endX, endY, null, false, 1);
    expect(pos.x).toBeCloseTo(endX);
    expect(pos.y).toBeCloseTo(endY);
  });

  it('t=0.5 で中間点', () => {
    const pos = computePitchTrajPos(startX, startY, endX, endY, null, false, 0.5);
    // t=0.5 で eased = 0.25 (t*t)
    const expectedX = startX + (endX - startX) * 0.25;
    expect(pos.x).toBeCloseTo(expectedX);
  });

  it('スライダー（dx>0）→ 中間で右に曲がる', () => {
    const slider = { dx: 1, dy: 0.3 };
    const straight = computePitchTrajPos(startX, startY, endX, endY, null, false, 0.5);
    const sliderPos = computePitchTrajPos(startX, startY, endX, endY, slider, false, 0.5);
    // slider は右（x+）にオフセット
    expect(sliderPos.x).toBeGreaterThan(straight.x);
  });

  it('カーブ（dy>0）→ 中間で下に曲がる', () => {
    const curve = { dx: 0.3, dy: 1 };
    const straight = computePitchTrajPos(startX, startY, endX, endY, null, false, 0.5);
    const curvePos = computePitchTrajPos(startX, startY, endX, endY, curve, false, 0.5);
    // curve は下（y+）にオフセット
    expect(curvePos.y).toBeGreaterThan(straight.y);
  });

  it('ストレート（isFastball=true）→ 中間で少し上にホップ', () => {
    const straight = computePitchTrajPos(startX, startY, endX, endY, null, false, 0.5);
    const fastball = computePitchTrajPos(startX, startY, endX, endY, null, true, 0.5);
    // fastball は上（y-）にオフセット
    expect(fastball.y).toBeLessThan(straight.y);
  });

  it('変化球の変化は中間（t=0.5）が最大', () => {
    const slider = { dx: 1, dy: 0 };
    const posAt0 = computePitchTrajPos(startX, startY, endX, endY, slider, false, 0);
    const posAt05 = computePitchTrajPos(startX, startY, endX, endY, slider, false, 0.5);
    const posAt1 = computePitchTrajPos(startX, startY, endX, endY, slider, false, 1);

    // x 方向のオフセット: t=0.5 が最大
    const offsetAt0 = posAt0.x - (startX + (endX - startX) * (0 * 0));
    const offsetAt05 = posAt05.x - (startX + (endX - startX) * (0.5 * 0.5));
    const offsetAt1 = posAt1.x - endX;

    expect(Math.abs(offsetAt05)).toBeGreaterThan(Math.abs(offsetAt0));
    expect(Math.abs(offsetAt05)).toBeGreaterThan(Math.abs(offsetAt1));
  });
});

// ============================================================
// computeTrajectory (Phase 12-G: ホームラン場外修正)
// ============================================================

describe('computeTrajectory ホームラン場外修正', () => {
  it('ホームラン (400ft) の endPos はフィールドのかなり遠方（> 400ft）', () => {
    const hr: BatContactForAnimation = {
      contactType: 'fly_ball',
      direction: 45,
      speed: 'bullet',
      distance: 400,
    };
    const traj = computeTrajectory(hr);
    const dist = Math.sqrt(traj.endPos.x ** 2 + traj.endPos.y ** 2);
    // 場外: スケール 2.8 で 400 * 2.8 = 1120ft 相当
    expect(dist).toBeGreaterThan(400);
  });

  it('通常フライ (300ft) の endPos はフィールド内（< 400ft）', () => {
    const fly: BatContactForAnimation = {
      contactType: 'fly_ball',
      direction: 45,
      speed: 'hard',
      distance: 300,
    };
    const traj = computeTrajectory(fly);
    const dist = Math.sqrt(traj.endPos.x ** 2 + traj.endPos.y ** 2);
    expect(dist).toBeLessThan(400);
  });

  it('ホームランの endPos > 通常フライの endPos（より遠くへ）', () => {
    const hr: BatContactForAnimation = {
      contactType: 'fly_ball',
      direction: 45,
      speed: 'bullet',
      distance: 400,
    };
    const fly: BatContactForAnimation = {
      contactType: 'fly_ball',
      direction: 45,
      speed: 'hard',
      distance: 300,
    };
    const hrTraj = computeTrajectory(hr);
    const flyTraj = computeTrajectory(fly);
    const hrDist = Math.sqrt(hrTraj.endPos.x ** 2 + hrTraj.endPos.y ** 2);
    const flyDist = Math.sqrt(flyTraj.endPos.x ** 2 + flyTraj.endPos.y ** 2);
    expect(hrDist).toBeGreaterThan(flyDist);
  });

  it('ホームランの type は home_run', () => {
    const hr: BatContactForAnimation = {
      contactType: 'fly_ball',
      direction: 45,
      speed: 'bullet',
      distance: 400,
    };
    expect(computeTrajectory(hr).type).toBe('home_run');
  });
});
