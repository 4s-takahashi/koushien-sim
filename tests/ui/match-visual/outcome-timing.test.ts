/**
 * v0.42.0: アウト/セーフ判定と物理タイミングの整合性テスト
 *
 * 目的:
 *   engine の判定（isOut=true/false）に応じて、build*Sequence が
 *   「送球到達 ETA vs 走者到達 ETA」の先着順を正しく設定しているかを検証する。
 *
 * テスト観点:
 *   1. isOut=true  → throw フェーズの endMs < batterRun フェーズの endMs（送球先着）
 *   2. isOut=false → batterRun フェーズの endMs < throw フェーズの endMs（走者先着）
 *   3. 内野安打 (buildInfieldHitSequence) → 常に走者先着
 *   4. 足の速い打者 (speed=95) / 遅い打者 (speed=20) 両ケースで整合する
 *   5. 先着マージン ≥ 100ms を保証（ギリギリすぎて見えない、とはならない）
 */

import { describe, it, expect } from 'vitest';
import {
  buildGroundOutSequence,
  buildInfieldHitSequence,
} from '../../../src/ui/match-visual/useBallAnimation';
import type { BatContactForAnimation, PlayPhase } from '../../../src/ui/match-visual/useBallAnimation';

// ============================================================
// ヘルパー
// ============================================================

/** throw フェーズの endMs を取得 */
function getThrowEnd(phases: PlayPhase[]): number {
  const phase = phases.find((p) => p.kind === 'throw');
  if (!phase) throw new Error('throw フェーズが見つからない');
  return phase.endMs;
}

/** batterRun フェーズの最後の endMs を取得（複数ある場合は最後） */
function getBatterRunEnd(phases: PlayPhase[]): number {
  const runPhases = phases.filter((p) => p.kind === 'batterRun');
  if (runPhases.length === 0) throw new Error('batterRun フェーズが見つからない');
  // 1塁到達（最初のbatterRun）を見る
  return runPhases[0].endMs;
}

/** result フェーズを取得 */
function getResultPhase(phases: PlayPhase[]) {
  return phases.find((p) => p.kind === 'result');
}

// ============================================================
// テストデータ
// ============================================================

const groundNormal: BatContactForAnimation = {
  contactType: 'ground_ball',
  direction: 30, // ショート方向
  speed: 'normal',
  distance: 65,
};

const groundHard: BatContactForAnimation = {
  contactType: 'ground_ball',
  direction: 20, // サード方向
  speed: 'hard',
  distance: 70,
};

const groundWeak: BatContactForAnimation = {
  contactType: 'ground_ball',
  direction: 45, // セカンド方向
  speed: 'weak',
  distance: 40,
};

// ============================================================
// buildGroundOutSequence: isOut=true (アウト)
// ============================================================

describe('buildGroundOutSequence - アウト (isOut=true)', () => {
  it('通常打球・通常打者: 送球到達 < 走者到達（送球先着）', () => {
    const seq = buildGroundOutSequence(groundNormal, true, 50);
    const throwEnd = getThrowEnd(seq.phases);
    const batterEnd = getBatterRunEnd(seq.phases);
    expect(throwEnd).toBeLessThan(batterEnd);
  });

  it('足の速い打者(speed=95)でも: 送球先着が保証される', () => {
    const seq = buildGroundOutSequence(groundNormal, true, 95);
    const throwEnd = getThrowEnd(seq.phases);
    const batterEnd = getBatterRunEnd(seq.phases);
    expect(throwEnd).toBeLessThan(batterEnd);
  });

  it('足の遅い打者(speed=20): 送球先着が保証される', () => {
    const seq = buildGroundOutSequence(groundNormal, true, 20);
    const throwEnd = getThrowEnd(seq.phases);
    const batterEnd = getBatterRunEnd(seq.phases);
    expect(throwEnd).toBeLessThan(batterEnd);
  });

  it('強い打球(speed=hard): 送球先着が保証される', () => {
    const seq = buildGroundOutSequence(groundHard, true, 50);
    const throwEnd = getThrowEnd(seq.phases);
    const batterEnd = getBatterRunEnd(seq.phases);
    expect(throwEnd).toBeLessThan(batterEnd);
  });

  it('弱い打球(speed=weak): 送球先着が保証される', () => {
    const seq = buildGroundOutSequence(groundWeak, true, 50);
    const throwEnd = getThrowEnd(seq.phases);
    const batterEnd = getBatterRunEnd(seq.phases);
    expect(throwEnd).toBeLessThan(batterEnd);
  });

  it('先着マージンが 100ms 以上（ギリギリすぎて見えないアニメにならない）', () => {
    const seq = buildGroundOutSequence(groundNormal, true, 50);
    const throwEnd = getThrowEnd(seq.phases);
    const batterEnd = getBatterRunEnd(seq.phases);
    expect(batterEnd - throwEnd).toBeGreaterThanOrEqual(100);
  });

  it('result フェーズが「アウト！」で isOut=true', () => {
    const seq = buildGroundOutSequence(groundNormal, true, 50);
    const result = getResultPhase(seq.phases);
    expect(result).toBeDefined();
    if (result?.data.kind === 'result') {
      expect(result.data.text).toBe('アウト！');
      expect(result.data.isOut).toBe(true);
    }
  });

  it('result フェーズが throw 完了後すぐに始まる（送球先着が trigger）', () => {
    const seq = buildGroundOutSequence(groundNormal, true, 50);
    const throwEnd = getThrowEnd(seq.phases);
    const result = getResultPhase(seq.phases);
    if (result) {
      // result は throwEnd と同時 or それ以降
      expect(result.startMs).toBeGreaterThanOrEqual(throwEnd);
    }
  });
});

// ============================================================
// buildGroundOutSequence: isOut=false (セーフ)
// ============================================================

describe('buildGroundOutSequence - セーフ (isOut=false)', () => {
  it('通常打球・通常打者: 走者到達 < 送球到達（走者先着）', () => {
    const seq = buildGroundOutSequence(groundNormal, false, 50);
    const throwEnd = getThrowEnd(seq.phases);
    const batterEnd = getBatterRunEnd(seq.phases);
    expect(batterEnd).toBeLessThan(throwEnd);
  });

  it('足の速い打者(speed=95): 走者先着が保証される', () => {
    const seq = buildGroundOutSequence(groundNormal, false, 95);
    const throwEnd = getThrowEnd(seq.phases);
    const batterEnd = getBatterRunEnd(seq.phases);
    expect(batterEnd).toBeLessThan(throwEnd);
  });

  it('足の遅い打者(speed=20): 走者先着が保証される（セーフ判定なのだから）', () => {
    const seq = buildGroundOutSequence(groundNormal, false, 20);
    const throwEnd = getThrowEnd(seq.phases);
    const batterEnd = getBatterRunEnd(seq.phases);
    expect(batterEnd).toBeLessThan(throwEnd);
  });

  it('先着マージンが 100ms 以上', () => {
    const seq = buildGroundOutSequence(groundNormal, false, 50);
    const throwEnd = getThrowEnd(seq.phases);
    const batterEnd = getBatterRunEnd(seq.phases);
    expect(throwEnd - batterEnd).toBeGreaterThanOrEqual(100);
  });

  it('result フェーズが「セーフ！」で isOut=false', () => {
    const seq = buildGroundOutSequence(groundNormal, false, 50);
    const result = getResultPhase(seq.phases);
    if (result?.data.kind === 'result') {
      expect(result.data.text).toBe('セーフ！');
      expect(result.data.isOut).toBe(false);
    }
  });

  it('result フェーズが batterRun 完了後すぐに始まる（走者先着が trigger）', () => {
    const seq = buildGroundOutSequence(groundNormal, false, 50);
    const batterEnd = getBatterRunEnd(seq.phases);
    const result = getResultPhase(seq.phases);
    if (result) {
      expect(result.startMs).toBeGreaterThanOrEqual(batterEnd);
    }
  });
});

// ============================================================
// buildInfieldHitSequence: 常にセーフ
// ============================================================

describe('buildInfieldHitSequence - 内野安打（常にセーフ）', () => {
  it('通常打者: 走者到達 < 送球到達（走者先着）', () => {
    const seq = buildInfieldHitSequence(groundNormal, 50);
    const throwEnd = getThrowEnd(seq.phases);
    const batterEnd = getBatterRunEnd(seq.phases);
    expect(batterEnd).toBeLessThan(throwEnd);
  });

  it('足の速い打者(speed=95): 走者先着が保証される', () => {
    const seq = buildInfieldHitSequence(groundNormal, 95);
    const throwEnd = getThrowEnd(seq.phases);
    const batterEnd = getBatterRunEnd(seq.phases);
    expect(batterEnd).toBeLessThan(throwEnd);
  });

  it('足の遅い打者(speed=20): 走者先着が保証される（内野安打なのだから）', () => {
    const seq = buildInfieldHitSequence(groundNormal, 20);
    const throwEnd = getThrowEnd(seq.phases);
    const batterEnd = getBatterRunEnd(seq.phases);
    expect(batterEnd).toBeLessThan(throwEnd);
  });

  it('先着マージンが 100ms 以上', () => {
    const seq = buildInfieldHitSequence(groundNormal, 50);
    const throwEnd = getThrowEnd(seq.phases);
    const batterEnd = getBatterRunEnd(seq.phases);
    expect(throwEnd - batterEnd).toBeGreaterThanOrEqual(100);
  });

  it('result フェーズが「内野安打！」で isOut=false', () => {
    const seq = buildInfieldHitSequence(groundNormal, 50);
    const result = getResultPhase(seq.phases);
    if (result?.data.kind === 'result') {
      expect(result.data.text).toBe('内野安打！');
      expect(result.data.isOut).toBe(false);
    }
  });

  it('サード方向の強い打球でも走者先着が保証される', () => {
    const seq = buildInfieldHitSequence(groundHard, 50, 70, 70);
    const throwEnd = getThrowEnd(seq.phases);
    const batterEnd = getBatterRunEnd(seq.phases);
    expect(batterEnd).toBeLessThan(throwEnd);
  });
});

// ============================================================
// 先着順が変わらないこと (各 speed×isOut の組み合わせ)
// ============================================================

describe('先着順の組み合わせ検証', () => {
  const speeds = [20, 50, 75, 95] as const;
  const contacts: BatContactForAnimation[] = [groundNormal, groundHard, groundWeak];

  for (const speed of speeds) {
    for (const contact of contacts) {
      it(`speed=${speed}, direction=${contact.direction}, contactSpeed=${contact.speed}: isOut=true → 送球先着`, () => {
        const seq = buildGroundOutSequence(contact, true, speed);
        const throwEnd = getThrowEnd(seq.phases);
        const batterEnd = getBatterRunEnd(seq.phases);
        expect(throwEnd).toBeLessThan(batterEnd);
      });

      it(`speed=${speed}, direction=${contact.direction}, contactSpeed=${contact.speed}: isOut=false → 走者先着`, () => {
        const seq = buildGroundOutSequence(contact, false, speed);
        const throwEnd = getThrowEnd(seq.phases);
        const batterEnd = getBatterRunEnd(seq.phases);
        expect(batterEnd).toBeLessThan(throwEnd);
      });
    }
  }
});

// ============================================================
// 全フェーズの startMs < endMs 保証
// ============================================================

describe('全フェーズの時刻整合性', () => {
  it('buildGroundOutSequence(isOut=true) の全フェーズで startMs < endMs', () => {
    const seq = buildGroundOutSequence(groundNormal, true, 50);
    for (const phase of seq.phases) {
      expect(phase.startMs).toBeLessThan(phase.endMs);
    }
  });

  it('buildGroundOutSequence(isOut=false) の全フェーズで startMs < endMs', () => {
    const seq = buildGroundOutSequence(groundNormal, false, 50);
    for (const phase of seq.phases) {
      expect(phase.startMs).toBeLessThan(phase.endMs);
    }
  });

  it('buildInfieldHitSequence の全フェーズで startMs < endMs', () => {
    const seq = buildInfieldHitSequence(groundNormal, 50);
    for (const phase of seq.phases) {
      expect(phase.startMs).toBeLessThan(phase.endMs);
    }
  });

  it('buildGroundOutSequence(isOut=true, speed=95) の全フェーズで startMs < endMs', () => {
    const seq = buildGroundOutSequence(groundNormal, true, 95);
    for (const phase of seq.phases) {
      expect(phase.startMs).toBeLessThan(phase.endMs);
    }
  });

  it('buildGroundOutSequence(isOut=false, speed=20) の全フェーズで startMs < endMs', () => {
    const seq = buildGroundOutSequence(groundNormal, false, 20);
    for (const phase of seq.phases) {
      expect(phase.startMs).toBeLessThan(phase.endMs);
    }
  });

  it('totalMs が全フェーズの endMs より大きい', () => {
    const seqs = [
      buildGroundOutSequence(groundNormal, true, 50),
      buildGroundOutSequence(groundNormal, false, 50),
      buildInfieldHitSequence(groundNormal, 50),
    ];
    for (const seq of seqs) {
      const maxEnd = Math.max(...seq.phases.map((p) => p.endMs));
      expect(seq.totalMs).toBeGreaterThanOrEqual(maxEnd);
    }
  });
});
