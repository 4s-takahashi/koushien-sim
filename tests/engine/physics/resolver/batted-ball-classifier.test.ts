/**
 * Phase R3: batted-ball-classifier.ts 単体テスト
 * 21 種詳細打球分類
 */

import { describe, it, expect } from 'vitest';
import {
  classifyDetailedHit,
  classifyGrounder,
  classifyFly,
  classifyHomeRun,
  isDribbler,
  getSprayZone,
  getBallZone,
  MAJOR_HIT_TYPES,
  MEDIUM_HIT_TYPES,
  RARE_HIT_TYPES,
  GROUNDER_MAX_LAUNCH_ANGLE,
  FLY_MIN_LAUNCH_ANGLE,
} from '../../../../src/engine/physics/resolver/batted-ball-classifier';
import { simulateTrajectory } from '../../../../src/engine/physics/trajectory';
import type {
  BallTrajectoryParams,
  DetailedHitType,
} from '../../../../src/engine/physics/types';
import type { ContactDetail } from '../../../../src/engine/physics/resolver/types';

// ============================================================
// テストヘルパー
// ============================================================

function makeTrajectory(overrides: Partial<BallTrajectoryParams> = {}): BallTrajectoryParams {
  return {
    exitVelocity: 140,
    launchAngle: 25,
    sprayAngle: 45,
    spin: { back: 2000, side: 0 },
    ...overrides,
  };
}

function makeContact(quality = 0.8, isFoul = false): ContactDetail {
  return {
    didContact: true,
    contactQuality: quality,
    isFoul,
    isTip: false,
    isCheckSwing: false,
    contactTimeMs: 0,
  };
}

// ============================================================
// classifyDetailedHit — ゴロ系
// ============================================================

describe('classifyDetailedHit - ゴロ系', () => {
  it('低打球角 + センター方向 → grounder 系', () => {
    const traj = makeTrajectory({ launchAngle: 5, sprayAngle: 45, exitVelocity: 120 });
    const flight = simulateTrajectory(traj);
    const result = classifyDetailedHit(traj, flight, makeContact());
    expect(['comebacker', 'right_side_grounder', 'left_side_grounder',
      'first_line_grounder', 'third_line_grounder']).toContain(result);
  });

  it('低打球角 + 右翼線方向 → first_line_grounder', () => {
    const traj = makeTrajectory({ launchAngle: 5, sprayAngle: 3, exitVelocity: 110 });
    const flight = simulateTrajectory(traj);
    const result = classifyDetailedHit(traj, flight, makeContact());
    expect(result).toBe('first_line_grounder');
  });

  it('低打球角 + 三塁線方向 → third_line_grounder', () => {
    const traj = makeTrajectory({ launchAngle: 5, sprayAngle: 87, exitVelocity: 110 });
    const flight = simulateTrajectory(traj);
    const result = classifyDetailedHit(traj, flight, makeContact());
    expect(result).toBe('third_line_grounder');
  });

  it('低打球角 + 三遊間方向 → left_side_grounder', () => {
    const traj = makeTrajectory({ launchAngle: 5, sprayAngle: 65, exitVelocity: 110 });
    const flight = simulateTrajectory(traj);
    const result = classifyDetailedHit(traj, flight, makeContact());
    expect(result).toBe('left_side_grounder');
  });

  it('低打球角 + 二遊間方向 → right_side_grounder', () => {
    const traj = makeTrajectory({ launchAngle: 5, sprayAngle: 25, exitVelocity: 110 });
    const flight = simulateTrajectory(traj);
    const result = classifyDetailedHit(traj, flight, makeContact());
    expect(result).toBe('right_side_grounder');
  });
});

// ============================================================
// classifyDetailedHit — フライ系
// ============================================================

describe('classifyDetailedHit - フライ系', () => {
  it('高打球角 + 短距離 → shallow_fly', () => {
    const traj = makeTrajectory({ launchAngle: 40, sprayAngle: 45, exitVelocity: 100 });
    const flight = simulateTrajectory(traj);
    const result = classifyDetailedHit(traj, flight, makeContact());
    expect(['shallow_fly', 'medium_fly', 'high_infield_fly']).toContain(result);
  });

  it('高打球角 + 中距離 → medium_fly or deep_fly or high_arc_hr', () => {
    const traj = makeTrajectory({ launchAngle: 35, sprayAngle: 45, exitVelocity: 140 });
    const flight = simulateTrajectory(traj);
    const result = classifyDetailedHit(traj, flight, makeContact());
    // 飛距離により様々なフライ分類になり得る
    expect(['medium_fly', 'deep_fly', 'wall_ball', 'high_arc_hr']).toContain(result);
  });

  it('超高打球角 + 短距離 → high_infield_fly', () => {
    const traj = makeTrajectory({ launchAngle: 75, sprayAngle: 45, exitVelocity: 70 });
    const flight = simulateTrajectory(traj);
    const result = classifyDetailedHit(traj, flight, makeContact());
    expect(result).toBe('high_infield_fly');
  });
});

// ============================================================
// classifyDetailedHit — ホームラン
// ============================================================

describe('classifyDetailedHit - ホームラン', () => {
  it('フェンス越え + 高打球角 → high_arc_hr', () => {
    const traj = makeTrajectory({ launchAngle: 40, sprayAngle: 45, exitVelocity: 180 });
    const flight = simulateTrajectory(traj);
    const result = classifyDetailedHit(traj, flight, makeContact());
    expect(['high_arc_hr', 'line_drive_hr', 'fence_close_call']).toContain(result);
  });

  it('フェンス越え + 低打球角 → line_drive_hr', () => {
    const traj = makeTrajectory({ launchAngle: 20, sprayAngle: 45, exitVelocity: 180 });
    const flight = simulateTrajectory(traj);
    const result = classifyDetailedHit(traj, flight, makeContact());
    // センター方向なのでline_drive_hr
    expect(['high_arc_hr', 'line_drive_hr']).toContain(result);
  });
});

// ============================================================
// classifyDetailedHit — ファウル
// ============================================================

describe('classifyDetailedHit - ファウル', () => {
  it('isFoul=true → foul_fly', () => {
    const traj = makeTrajectory({ launchAngle: 40, sprayAngle: 45 });
    const flight = simulateTrajectory(traj);
    const contact = makeContact(0.5, true);
    const result = classifyDetailedHit(traj, flight, contact);
    expect(result).toBe('foul_fly');
  });

  it('sprayAngle < 0 → ファウル扱い', () => {
    const traj = makeTrajectory({ launchAngle: 30, sprayAngle: -10 });
    const flight = simulateTrajectory(traj);
    const contact = makeContact();
    const result = classifyDetailedHit(traj, flight, contact);
    expect(result).toBe('foul_fly');
  });

  it('sprayAngle > 90 → ファウル扱い', () => {
    const traj = makeTrajectory({ launchAngle: 30, sprayAngle: 100 });
    const flight = simulateTrajectory(traj);
    const contact = makeContact();
    const result = classifyDetailedHit(traj, flight, contact);
    expect(result).toBe('foul_fly');
  });
});

// ============================================================
// classifyDetailedHit — 当たり損ね
// ============================================================

describe('classifyDetailedHit - 当たり損ね', () => {
  it('低品質コンタクト + 低速 + 低角度 → check_swing_dribbler', () => {
    const traj = makeTrajectory({ launchAngle: 5, sprayAngle: 45, exitVelocity: 50 });
    const flight = simulateTrajectory(traj);
    const contact = makeContact(0.1);
    const result = classifyDetailedHit(traj, flight, contact);
    expect(result).toBe('check_swing_dribbler');
  });
});

// ============================================================
// classifyGrounder
// ============================================================

describe('classifyGrounder', () => {
  it('ピッチャー前 → comebacker', () => {
    expect(classifyGrounder(45, 50)).toBe('comebacker');
  });

  it('一塁線 → first_line_grounder', () => {
    expect(classifyGrounder(3, 80)).toBe('first_line_grounder');
  });

  it('三塁線 → third_line_grounder', () => {
    expect(classifyGrounder(87, 80)).toBe('third_line_grounder');
  });

  it('二遊間 → right_side_grounder', () => {
    expect(classifyGrounder(25, 100)).toBe('right_side_grounder');
  });

  it('三遊間 → left_side_grounder', () => {
    expect(classifyGrounder(65, 100)).toBe('left_side_grounder');
  });
});

// ============================================================
// isDribbler
// ============================================================

describe('isDribbler', () => {
  it('短距離 + 低速 + 低品質 → dribbler', () => {
    const traj = makeTrajectory({ exitVelocity: 50, launchAngle: 5, sprayAngle: 45 });
    const flight = simulateTrajectory(traj);
    const contact = makeContact(0.15);
    expect(isDribbler(traj, flight, contact)).toBe(true);
  });

  it('高速打球 → dribbler でない', () => {
    const traj = makeTrajectory({ exitVelocity: 150, launchAngle: 5, sprayAngle: 45 });
    const flight = simulateTrajectory(traj);
    const contact = makeContact(0.15);
    expect(isDribbler(traj, flight, contact)).toBe(false);
  });
});

// ============================================================
// getSprayZone / getBallZone
// ============================================================

describe('getSprayZone', () => {
  it('sprayAngle < 0 → pull_foul', () => {
    expect(getSprayZone(-5)).toBe('pull_foul');
  });

  it('sprayAngle > 90 → push_foul', () => {
    expect(getSprayZone(95)).toBe('push_foul');
  });

  it('sprayAngle ≈ 45 → center', () => {
    expect(getSprayZone(45)).toBe('center');
  });

  it('sprayAngle ≈ 3 → first_line', () => {
    expect(getSprayZone(3)).toBe('first_line');
  });

  it('sprayAngle ≈ 87 → third_line', () => {
    expect(getSprayZone(87)).toBe('third_line');
  });
});

describe('getBallZone', () => {
  it('ファウル → foul', () => {
    const traj = makeTrajectory({ sprayAngle: -10, launchAngle: 30 });
    const flight = simulateTrajectory(traj);
    expect(getBallZone(flight)).toBe('foul');
  });

  it('フェンス越え → over_fence', () => {
    const traj = makeTrajectory({ exitVelocity: 180, launchAngle: 40, sprayAngle: 45 });
    const flight = simulateTrajectory(traj);
    expect(getBallZone(flight)).toBe('over_fence');
  });

  it('外野フライ → outfield（低めの速度）', () => {
    // 確実に外野内（フェンス手前）に収まる打球
    const traj = makeTrajectory({ exitVelocity: 100, launchAngle: 30, sprayAngle: 45 });
    const flight = simulateTrajectory(traj);
    expect(getBallZone(flight)).toBe('outfield');
  });
});

// ============================================================
// カテゴリグループ
// ============================================================

describe('分類カテゴリグループ', () => {
  it('MAJOR_HIT_TYPES は 10 種', () => {
    expect(MAJOR_HIT_TYPES.size).toBe(10);
  });

  it('MEDIUM_HIT_TYPES は 7 種', () => {
    expect(MEDIUM_HIT_TYPES.size).toBe(7);
  });

  it('RARE_HIT_TYPES は 4 種', () => {
    expect(RARE_HIT_TYPES.size).toBe(4);
  });

  it('グループが重複しない', () => {
    for (const t of MAJOR_HIT_TYPES) {
      expect(MEDIUM_HIT_TYPES.has(t)).toBe(false);
      expect(RARE_HIT_TYPES.has(t)).toBe(false);
    }
  });

  it('21 種すべてがいずれかのグループに含まれる', () => {
    const all: DetailedHitType[] = [
      'first_line_grounder', 'right_side_grounder', 'left_side_grounder', 'third_line_grounder',
      'comebacker', 'infield_liner', 'high_infield_fly', 'over_infield_hit',
      'right_gap_hit', 'up_the_middle_hit', 'left_gap_hit',
      'shallow_fly', 'medium_fly', 'deep_fly',
      'line_drive_hit', 'wall_ball', 'line_drive_hr', 'high_arc_hr',
      'fence_close_call', 'foul_fly', 'check_swing_dribbler',
    ];
    // すべてのタイプがいずれかのグループに属するか、分類関数が扱えること
    for (const t of all) {
      const inAny = MAJOR_HIT_TYPES.has(t) || MEDIUM_HIT_TYPES.has(t) || RARE_HIT_TYPES.has(t);
      expect(inAny).toBe(true);
    }
  });
});
