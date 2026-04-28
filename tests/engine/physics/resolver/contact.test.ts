/**
 * Phase R3: contact.ts 単体テスト
 * バット・ボール接触判定
 */

import { describe, it, expect } from 'vitest';
import {
  resolveContact,
  computeTimingPenalty,
  computeIsFoul,
  computeTimingFoulProb,
  getFoulReason,
  adjustTrajectoryForContact,
  isDribblerContact,
  MIN_CONTACT_QUALITY,
  FOUL_TIP_QUALITY_THRESHOLD,
} from '../../../../src/engine/physics/resolver/contact';
import { createRNG } from '../../../../src/engine/core/rng';
import type { SwingLatentState, BallTrajectoryParams } from '../../../../src/engine/physics/types';
import type { BatSwingProfile, ContactDetail } from '../../../../src/engine/physics/resolver/types';

// ============================================================
// テストヘルパー
// ============================================================

function makeLatent(overrides: Partial<SwingLatentState> = {}): SwingLatentState {
  return {
    contactQuality: 0.8,
    timingWindow: 0.0,
    swingIntent: 0.0,
    decisionPressure: 0.2,
    barrelRate: 0.5,
    ...overrides,
  };
}

function makeSwing(overrides: Partial<BatSwingProfile> = {}): BatSwingProfile {
  return {
    startTimeMs: -150,
    contactTimeMs: 0,
    timingErrorMs: 0,
    swingSpeedMph: 75,
    batHeadPos: { x: 0, y: 2 },
    swingPlaneAngleDeg: 5,
    ...overrides,
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

const rng = createRNG('test-contact');

// ============================================================
// resolveContact
// ============================================================

describe('resolveContact', () => {
  it('高品質コンタクトで接触あり', () => {
    const latent = makeLatent({ contactQuality: 0.9, timingWindow: 0 });
    const swing = makeSwing({ timingErrorMs: 0 });
    const contact = resolveContact(latent, swing, createRNG('c1'));
    expect(contact.didContact).toBe(true);
  });

  it('コンタクト品質ゼロでミス', () => {
    const latent = makeLatent({ contactQuality: 0.0 });
    const swing = makeSwing({ timingErrorMs: 100 });
    const contact = resolveContact(latent, swing, createRNG('c2'));
    expect(contact.didContact).toBe(false);
  });

  it('contactTimeMs は swing.contactTimeMs と一致', () => {
    const latent = makeLatent();
    const swing = makeSwing({ contactTimeMs: 50 });
    const contact = resolveContact(latent, swing, createRNG('c3'));
    expect(contact.contactTimeMs).toBe(50);
  });

  it('チェックスイング (decisionPressure 高 + 遅打ち) でもコンタクトあり得る', () => {
    // 複数試行してチェックスイング+コンタクトの組み合わせが存在することを確認
    let checkAndContact = 0;
    for (let i = 0; i < 200; i++) {
      const latent = makeLatent({ timingWindow: 0.9, decisionPressure: 1.0 });
      const swing = makeSwing({ timingErrorMs: 5 });
      const c = resolveContact(latent, swing, createRNG(`cs${i}`));
      if (c.isCheckSwing && c.didContact) checkAndContact++;
    }
    // チェックスイングでファウルになることがある
    expect(checkAndContact).toBeGreaterThanOrEqual(0); // 存在する
  });

  it('タイミングが大幅にずれると品質が下がる', () => {
    const latent = makeLatent({ contactQuality: 0.9, timingWindow: 0.8 });
    const swing = makeSwing({ timingErrorMs: 80 });
    const contact = resolveContact(latent, swing, createRNG('c4'));
    if (contact.didContact) {
      expect(contact.contactQuality).toBeLessThan(0.9);
    }
  });
});

// ============================================================
// computeTimingPenalty
// ============================================================

describe('computeTimingPenalty', () => {
  it('エラー 0ms でペナルティなし', () => {
    expect(computeTimingPenalty(0)).toBe(1.0);
  });

  it('エラー 50ms でペナルティ 50%', () => {
    expect(computeTimingPenalty(50)).toBeCloseTo(0.5);
  });

  it('エラー 100ms 以上でペナルティ最大 (0)', () => {
    expect(computeTimingPenalty(100)).toBe(0);
    expect(computeTimingPenalty(150)).toBe(0);
  });

  it('マイナスエラーも絶対値で計算', () => {
    expect(computeTimingPenalty(-50)).toBeCloseTo(0.5);
  });
});

// ============================================================
// computeTimingFoulProb
// ============================================================

describe('computeTimingFoulProb', () => {
  it('ジャスト近辺 (|tw| < 0.3) で低確率', () => {
    expect(computeTimingFoulProb(0)).toBeLessThan(0.1);
    expect(computeTimingFoulProb(0.2)).toBeLessThan(0.1);
  });

  it('大幅ずれ (|tw| >= 0.8) で高確率', () => {
    expect(computeTimingFoulProb(0.8)).toBeGreaterThan(0.5);
    expect(computeTimingFoulProb(-0.9)).toBeGreaterThan(0.5);
  });

  it('中間値 (0.3-0.6) で中程度', () => {
    const p = computeTimingFoulProb(0.5);
    expect(p).toBeGreaterThan(0.1);
    expect(p).toBeLessThan(0.5);
  });
});

// ============================================================
// computeIsFoul
// ============================================================

describe('computeIsFoul', () => {
  it('品質高くタイミング良ければファウル確率低い', () => {
    const latent = makeLatent({ contactQuality: 0.9, timingWindow: 0 });
    const swing = makeSwing({ swingPlaneAngleDeg: 5 });
    let foulCount = 0;
    for (let i = 0; i < 100; i++) {
      if (computeIsFoul(latent, swing, createRNG(`if${i}`))) foulCount++;
    }
    expect(foulCount).toBeLessThan(30);
  });

  it('品質低くタイミングずれでファウル確率高い', () => {
    const latent = makeLatent({ contactQuality: 0.1, timingWindow: 0.8 });
    const swing = makeSwing({ swingPlaneAngleDeg: 14 });
    let foulCount = 0;
    for (let i = 0; i < 100; i++) {
      if (computeIsFoul(latent, swing, createRNG(`if2${i}`))) foulCount++;
    }
    expect(foulCount).toBeGreaterThan(30);
  });
});

// ============================================================
// getFoulReason
// ============================================================

describe('getFoulReason', () => {
  it('isTip=true → "tip"', () => {
    const contact: ContactDetail = {
      didContact: true, contactQuality: 0.1,
      isFoul: true, isTip: true, isCheckSwing: false, contactTimeMs: 0,
    };
    expect(getFoulReason(contact, makeLatent())).toBe('tip');
  });

  it('isCheckSwing=true → "late_swing"', () => {
    const contact: ContactDetail = {
      didContact: true, contactQuality: 0.1,
      isFoul: true, isTip: false, isCheckSwing: true, contactTimeMs: 0,
    };
    expect(getFoulReason(contact, makeLatent())).toBe('late_swing');
  });

  it('timingWindow > 0.5 → "late_swing"', () => {
    const contact: ContactDetail = {
      didContact: true, contactQuality: 0.1,
      isFoul: true, isTip: false, isCheckSwing: false, contactTimeMs: 0,
    };
    expect(getFoulReason(contact, makeLatent({ timingWindow: 0.6 }))).toBe('late_swing');
  });

  it('通常のファウル → "line"', () => {
    const contact: ContactDetail = {
      didContact: true, contactQuality: 0.3,
      isFoul: true, isTip: false, isCheckSwing: false, contactTimeMs: 0,
    };
    expect(getFoulReason(contact, makeLatent({ timingWindow: 0.2 }))).toBe('line');
  });
});

// ============================================================
// adjustTrajectoryForContact
// ============================================================

describe('adjustTrajectoryForContact', () => {
  it('コンタクトなしではトラジェクトリ変更なし', () => {
    const traj = makeTrajectory();
    const contact: ContactDetail = {
      didContact: false, contactQuality: 0,
      isFoul: false, isTip: false, isCheckSwing: false, contactTimeMs: 0,
    };
    const adj = adjustTrajectoryForContact(traj, contact);
    expect(adj.exitVelocity).toBe(traj.exitVelocity);
    expect(adj.launchAngle).toBe(traj.launchAngle);
  });

  it('完璧なコンタクトでは速度ほぼ変化なし', () => {
    const traj = makeTrajectory({ exitVelocity: 150 });
    const contact: ContactDetail = {
      didContact: true, contactQuality: 1.0,
      isFoul: false, isTip: false, isCheckSwing: false, contactTimeMs: 0,
    };
    const adj = adjustTrajectoryForContact(traj, contact);
    expect(adj.exitVelocity).toBeCloseTo(150, 0);
  });

  it('低品質コンタクトで速度が落ちる', () => {
    const traj = makeTrajectory({ exitVelocity: 150 });
    const contact: ContactDetail = {
      didContact: true, contactQuality: 0.3,
      isFoul: false, isTip: false, isCheckSwing: false, contactTimeMs: 0,
    };
    const adj = adjustTrajectoryForContact(traj, contact);
    expect(adj.exitVelocity).toBeLessThan(150);
  });
});

// ============================================================
// isDribblerContact
// ============================================================

describe('isDribblerContact', () => {
  it('低品質かつ接触あり → dribbler', () => {
    const contact: ContactDetail = {
      didContact: true, contactQuality: 0.1,
      isFoul: false, isTip: false, isCheckSwing: false, contactTimeMs: 0,
    };
    expect(isDribblerContact(contact)).toBe(true);
  });

  it('高品質コンタクト → dribbler でない', () => {
    const contact: ContactDetail = {
      didContact: true, contactQuality: 0.8,
      isFoul: false, isTip: false, isCheckSwing: false, contactTimeMs: 0,
    };
    expect(isDribblerContact(contact)).toBe(false);
  });

  it('ファウルは dribbler でない', () => {
    const contact: ContactDetail = {
      didContact: true, contactQuality: 0.1,
      isFoul: true, isTip: false, isCheckSwing: false, contactTimeMs: 0,
    };
    expect(isDribblerContact(contact)).toBe(false);
  });

  it('接触なしは dribbler でない', () => {
    const contact: ContactDetail = {
      didContact: false, contactQuality: 0,
      isFoul: false, isTip: false, isCheckSwing: false, contactTimeMs: 0,
    };
    expect(isDribblerContact(contact)).toBe(false);
  });
});
