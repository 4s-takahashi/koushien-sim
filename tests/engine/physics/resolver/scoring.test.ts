/**
 * Phase R3: scoring.ts 単体テスト
 * 記録（得点・アウトカウント・打席結果・公式記録）
 */

import { describe, it, expect } from 'vitest';
import {
  computeScoring,
  countRuns,
  countOuts,
  deriveBatterOutcome,
  deriveFieldResult,
  computeRBI,
  isFlyType,
  HOME_RUN_TYPES,
} from '../../../../src/engine/physics/resolver/scoring';
import type {
  BaserunningResult,
  FieldingResult,
  DetailedHitType,
  BaseState,
} from '../../../../src/engine/physics/types';

// ============================================================
// テストヘルパー
// ============================================================

function makeBaserunning(
  decisions: BaserunningResult['decisions'] = [],
): BaserunningResult {
  return { decisions };
}

function makeSafeDecision(
  runnerId: string,
  fromBase: import('../../../../src/engine/physics/types').BaseId = 'home',
  targetBase: import('../../../../src/engine/physics/types').BaseId = 'first',
): import('../../../../src/engine/physics/types').RunnerDecision {
  return {
    runnerId, fromBase, targetBase,
    decisionMargin: 300, willAdvance: true, arrivalTimeMs: 1500, outcome: 'safe',
  };
}

function makeOutDecision(
  runnerId: string,
  fromBase: import('../../../../src/engine/physics/types').BaseId = 'home',
  targetBase: import('../../../../src/engine/physics/types').BaseId = 'first',
): import('../../../../src/engine/physics/types').RunnerDecision {
  return {
    runnerId, fromBase, targetBase,
    decisionMargin: -200, willAdvance: true, arrivalTimeMs: 1500, outcome: 'out',
  };
}

function makeFieldingSuccess(position: import('../../../../src/engine/types/player').Position = 'center'): FieldingResult {
  return {
    primaryFielder: { id: `f_${position}`, position, arrivalTimeMs: 600, arrivalPos: { x: 0, y: 320 } },
    catchAttempt: { success: true, error: false, bobble: false, handleTimeMs: 600 },
  };
}

function makeFieldingError(position: import('../../../../src/engine/types/player').Position = 'shortstop'): FieldingResult {
  return {
    primaryFielder: { id: `f_${position}`, position, arrivalTimeMs: 500, arrivalPos: { x: -35, y: 145 } },
    catchAttempt: { success: false, error: true, bobble: false, handleTimeMs: 1200 },
  };
}

const emptyBases: BaseState = { first: null, second: null, third: null };

// ============================================================
// countRuns
// ============================================================

describe('countRuns', () => {
  it('本塁生還者なし → 0', () => {
    const br = makeBaserunning([makeSafeDecision('r1', 'home', 'first')]);
    expect(countRuns(br, 'batter1')).toBe(0);
  });

  it('本塁生還者 1 人 → 1', () => {
    const br = makeBaserunning([
      { runnerId: 'r3', fromBase: 'third', targetBase: 'home', decisionMargin: 500, willAdvance: true, arrivalTimeMs: 3000, outcome: 'safe' },
    ]);
    expect(countRuns(br, 'batter1')).toBe(1);
  });

  it('満塁ホームラン → 4 点', () => {
    const br = makeBaserunning([
      { runnerId: 'batter1', fromBase: 'home', targetBase: 'home', decisionMargin: 999, willAdvance: true, arrivalTimeMs: 4000, outcome: 'safe' },
      { runnerId: 'r1', fromBase: 'first', targetBase: 'home', decisionMargin: 999, willAdvance: true, arrivalTimeMs: 3500, outcome: 'safe' },
      { runnerId: 'r2', fromBase: 'second', targetBase: 'home', decisionMargin: 999, willAdvance: true, arrivalTimeMs: 3200, outcome: 'safe' },
      { runnerId: 'r3', fromBase: 'third', targetBase: 'home', decisionMargin: 999, willAdvance: true, arrivalTimeMs: 3000, outcome: 'safe' },
    ]);
    expect(countRuns(br, 'batter1')).toBe(4);
  });
});

// ============================================================
// countOuts
// ============================================================

describe('countOuts', () => {
  it('フライ捕球 → 1 アウト', () => {
    const br = makeBaserunning([]);
    const outs = countOuts(br, makeFieldingSuccess(), 'medium_fly');
    expect(outs).toBe(1);
  });

  it('ゴロアウト（走者アウト） → 1 アウト', () => {
    const br = makeBaserunning([makeOutDecision('batter1')]);
    const outs = countOuts(br, makeFieldingSuccess('second'), 'right_side_grounder');
    expect(outs).toBe(1);
  });

  it('ダブルプレー → 2 アウト', () => {
    const br = makeBaserunning([
      makeOutDecision('batter1', 'home', 'first'),
      makeOutDecision('r1', 'first', 'second'),
    ]);
    const outs = countOuts(br, makeFieldingSuccess('second'), 'right_side_grounder');
    expect(outs).toBe(2);
  });

  it('エラー → アウトなし', () => {
    const br = makeBaserunning([]);
    const outs = countOuts(br, makeFieldingError(), 'right_side_grounder');
    expect(outs).toBe(0);
  });
});

// ============================================================
// deriveBatterOutcome
// ============================================================

describe('deriveBatterOutcome', () => {
  it('high_arc_hr → home_run', () => {
    const result = deriveBatterOutcome('high_arc_hr', 'safe', 'home', makeFieldingSuccess());
    expect(result.type).toBe('home_run');
  });

  it('line_drive_hr → home_run', () => {
    const result = deriveBatterOutcome('line_drive_hr', 'safe', 'home', makeFieldingSuccess());
    expect(result.type).toBe('home_run');
  });

  it('フライ捕球成功 → fly_out', () => {
    const result = deriveBatterOutcome('medium_fly', 'safe', 'first', makeFieldingSuccess('center'));
    expect(result.type).toBe('fly_out');
  });

  it('エラー → error', () => {
    const result = deriveBatterOutcome('right_side_grounder', 'safe', 'first', makeFieldingError());
    expect(result.type).toBe('error');
  });

  it('走者アウト（ゴロ） → ground_out', () => {
    const result = deriveBatterOutcome('right_side_grounder', 'out', 'first', makeFieldingSuccess('second'));
    expect(result.type).toBe('ground_out');
  });

  it('一塁セーフ → single', () => {
    const result = deriveBatterOutcome('up_the_middle_hit', 'safe', 'first', makeFieldingSuccess());
    expect(result.type).toBe('single');
  });

  it('二塁到達 → double', () => {
    const result = deriveBatterOutcome('wall_ball', 'safe', 'second', makeFieldingSuccess());
    expect(result.type).toBe('double');
  });

  it('三塁到達 → triple（捕球されない場合）', () => {
    // deep_fly が落球・通過した場合 → triple
    const result = deriveBatterOutcome('line_drive_hit', 'safe', 'third', makeFieldingSuccess());
    expect(result.type).toBe('triple');
  });
});

// ============================================================
// isFlyType
// ============================================================

describe('isFlyType', () => {
  it('medium_fly → フライ', () => {
    expect(isFlyType('medium_fly')).toBe(true);
  });

  it('high_arc_hr → フライ', () => {
    expect(isFlyType('high_arc_hr')).toBe(true);
  });

  it('shallow_fly → フライ', () => {
    expect(isFlyType('shallow_fly')).toBe(true);
  });

  it('right_side_grounder → フライでない', () => {
    expect(isFlyType('right_side_grounder')).toBe(false);
  });

  it('line_drive_hit → フライでない', () => {
    expect(isFlyType('line_drive_hit')).toBe(false);
  });
});

// ============================================================
// computeRBI
// ============================================================

describe('computeRBI', () => {
  it('エラーは打点なし', () => {
    const br = makeBaserunning([
      { runnerId: 'r3', fromBase: 'third', targetBase: 'home', decisionMargin: 999, willAdvance: true, arrivalTimeMs: 3000, outcome: 'safe' },
    ]);
    const rbi = computeRBI(br, 'batter1', { type: 'error', fielder: 'shortstop' });
    expect(rbi).toBe(0);
  });

  it('ソロホームラン → 打点1（打者自身の生還）', () => {
    const br = makeBaserunning([
      { runnerId: 'batter1', fromBase: 'home', targetBase: 'home', decisionMargin: 999, willAdvance: true, arrivalTimeMs: 4000, outcome: 'safe' },
    ]);
    const rbi = computeRBI(br, 'batter1', { type: 'home_run' });
    expect(rbi).toBe(1);
  });

  it('走者一塁時 HR → 打点2', () => {
    const br = makeBaserunning([
      { runnerId: 'batter1', fromBase: 'home', targetBase: 'home', decisionMargin: 999, willAdvance: true, arrivalTimeMs: 4000, outcome: 'safe' },
      { runnerId: 'r1', fromBase: 'first', targetBase: 'home', decisionMargin: 999, willAdvance: true, arrivalTimeMs: 3500, outcome: 'safe' },
    ]);
    const rbi = computeRBI(br, 'batter1', { type: 'home_run' });
    expect(rbi).toBe(2);
  });

  it('シングルで走者生還 → 打点1', () => {
    const br = makeBaserunning([
      { runnerId: 'batter1', fromBase: 'home', targetBase: 'first', decisionMargin: 200, willAdvance: true, arrivalTimeMs: 1500, outcome: 'safe' },
      { runnerId: 'r3', fromBase: 'third', targetBase: 'home', decisionMargin: 999, willAdvance: true, arrivalTimeMs: 2500, outcome: 'safe' },
    ]);
    const rbi = computeRBI(br, 'batter1', { type: 'single' });
    expect(rbi).toBe(1); // 打者以外の生還
  });
});

// ============================================================
// computeScoring (統合テスト)
// ============================================================

describe('computeScoring', () => {
  it('ホームラン → 正常な ScoringResult', () => {
    const br = makeBaserunning([
      { runnerId: 'batter1', fromBase: 'home', targetBase: 'home', decisionMargin: 999, willAdvance: true, arrivalTimeMs: 4000, outcome: 'safe' },
    ]);
    // HR は fielding.catchAttempt.success=true でもフライキャッチにはならない
    const result = computeScoring(br, makeFieldingSuccess(), 'high_arc_hr', emptyBases, 'batter1', 70);
    expect(result.runsScored).toBe(1);
    expect(result.outsRecorded).toBe(0); // HR はアウトなし
    expect(result.batterOutcome.type).toBe('home_run');
    expect(result.rbiCount).toBe(1);
  });

  it('フライアウト → アウト1', () => {
    const br = makeBaserunning([
      makeSafeDecision('batter1', 'home', 'first'), // フライなのでアウト
    ]);
    const result = computeScoring(br, makeFieldingSuccess('center'), 'medium_fly', emptyBases, 'batter1', 70);
    expect(result.outsRecorded).toBeGreaterThanOrEqual(1);
    expect(result.runsScored).toBe(0);
  });

  it('エラー → isError=true のFieldResult', () => {
    const br = makeBaserunning([makeSafeDecision('batter1')]);
    const result = computeScoring(br, makeFieldingError(), 'right_side_grounder', emptyBases, 'batter1', 70);
    expect(result.fieldResult.isError).toBe(true);
  });

  it('baseStateAfter が返ってくる', () => {
    const br = makeBaserunning([makeSafeDecision('batter1')]);
    const result = computeScoring(br, makeFieldingSuccess(), 'up_the_middle_hit', emptyBases, 'batter1', 70);
    expect(result.baseStateAfter).toBeDefined();
  });
});
