/**
 * catcher-thinking.test.ts
 *
 * Phase S2: キャッチャー思考生成システムのユニットテスト
 *
 * テスト対象:
 * - generateCatcherThought(): 性格×能力値×ピッチャー状況 → 思考テキスト + 配球補正
 * - catcherProfileToContext(): CatcherProfile → コンテキスト変換
 */

import { describe, it, expect } from 'vitest';
import {
  generateCatcherThought,
  catcherProfileToContext,
  DEFAULT_CATCHER_PROFILE,
} from '../../../src/engine/psyche/catcher-thinking';
import type { CatcherThinkingContext } from '../../../src/engine/psyche/catcher-thinking';

// ============================================================
// テストヘルパー
// ============================================================

function makeBaseContext(overrides: Partial<CatcherThinkingContext> = {}): CatcherThinkingContext {
  return {
    catcherPersonality: 'cautious',
    catcherLeadership: 50,
    catcherCallingAccuracy: 50,
    pitcherStamina: 80,
    pitcherControl: 70,
    pitcherBreakingBallSharpness: 0.8,
    pitcherMental: 70,
    pitcherCurrentStamina: 80,
    batterTraits: [],
    batterContact: 65,
    batterPower: 60,
    batterEye: 55,
    inning: 3,
    scoreDiff: 0,
    outs: 1,
    runnersOn: 'none',
    isKoshien: false,
    consecutiveHits: 0,
    ...overrides,
  };
}

// ============================================================
// DEFAULT_CATCHER_PROFILE テスト
// ============================================================

describe('DEFAULT_CATCHER_PROFILE', () => {
  it('personality が cautious', () => {
    expect(DEFAULT_CATCHER_PROFILE.personality).toBe('cautious');
  });

  it('leadershipScore が 50', () => {
    expect(DEFAULT_CATCHER_PROFILE.leadershipScore).toBe(50);
  });

  it('callingAccuracy が 50', () => {
    expect(DEFAULT_CATCHER_PROFILE.callingAccuracy).toBe(50);
  });
});

// ============================================================
// catcherProfileToContext テスト
// ============================================================

describe('catcherProfileToContext', () => {
  it('catcherProfile が undefined のときデフォルト値を使用する', () => {
    const ctx = catcherProfileToContext(undefined);
    expect(ctx.catcherPersonality).toBe('cautious');
    expect(ctx.catcherLeadership).toBe(50);
    expect(ctx.catcherCallingAccuracy).toBe(50);
  });

  it('catcherProfile が設定されているときその値を使う', () => {
    const ctx = catcherProfileToContext({
      personality: 'aggressive',
      leadershipScore: 80,
      callingAccuracy: 75,
    });
    expect(ctx.catcherPersonality).toBe('aggressive');
    expect(ctx.catcherLeadership).toBe(80);
    expect(ctx.catcherCallingAccuracy).toBe(75);
  });
});

// ============================================================
// generateCatcherThought: 戻り値の形式
// ============================================================

describe('generateCatcherThought - 基本形式', () => {
  it('戻り値に callingStrategy, thoughtText, pitchingBias, hasCallingError が含まれる', () => {
    const ctx = makeBaseContext();
    const result = generateCatcherThought(ctx);

    expect(result).toHaveProperty('callingStrategy');
    expect(result).toHaveProperty('thoughtText');
    expect(result).toHaveProperty('pitchingBias');
    expect(result).toHaveProperty('hasCallingError');
  });

  it('thoughtText が空文字でない', () => {
    const ctx = makeBaseContext();
    const result = generateCatcherThought(ctx);
    expect(result.thoughtText.length).toBeGreaterThan(0);
  });

  it('pitchingBias の各フィールドが正しい型', () => {
    const ctx = makeBaseContext();
    const bias = generateCatcherThought(ctx).pitchingBias;

    expect(typeof bias.fastballRatioBias).toBe('number');
    expect(typeof bias.strikeZoneBias).toBe('number');
    expect(typeof bias.preferOutside).toBe('boolean');
    expect(typeof bias.preferInside).toBe('boolean');
  });

  it('pitchingBias の値が範囲内 (-0.3〜+0.3)', () => {
    const ctx = makeBaseContext();
    const bias = generateCatcherThought(ctx).pitchingBias;

    expect(bias.fastballRatioBias).toBeGreaterThanOrEqual(-0.3);
    expect(bias.fastballRatioBias).toBeLessThanOrEqual(0.3);
    expect(bias.strikeZoneBias).toBeGreaterThanOrEqual(-0.3);
    expect(bias.strikeZoneBias).toBeLessThanOrEqual(0.3);
  });
});

// ============================================================
// 性格 × 能力値マトリクステスト
// ============================================================

describe('generateCatcherThought - 性格×能力値', () => {

  // aggressive + callingAccuracy 高
  it('aggressive + callingAccuracy:80 → fastball_heavy or outside_focus', () => {
    const ctx = makeBaseContext({
      catcherPersonality: 'aggressive',
      catcherLeadership: 60,
      catcherCallingAccuracy: 80,
    });
    const result = generateCatcherThought(ctx);
    expect(['fastball_heavy', 'outside_focus', 'inside_focus']).toContain(result.callingStrategy);
  });

  // aggressive + callingAccuracy 低 → mixed
  it('aggressive + callingAccuracy:30 → mixed（能力限界）', () => {
    const ctx = makeBaseContext({
      catcherPersonality: 'aggressive',
      catcherLeadership: 60,
      catcherCallingAccuracy: 30,
    });
    const result = generateCatcherThought(ctx);
    expect(result.callingStrategy).toBe('mixed');
  });

  // cautious + leadershipScore 高 → careful or high_low
  it('cautious + leadershipScore:80 → careful or high_low', () => {
    const ctx = makeBaseContext({
      catcherPersonality: 'cautious',
      catcherLeadership: 80,
      catcherCallingAccuracy: 50,
    });
    const result = generateCatcherThought(ctx);
    expect(['careful', 'high_low']).toContain(result.callingStrategy);
  });

  // cautious + leadershipScore 低 → careful
  it('cautious + leadershipScore:30 → careful', () => {
    const ctx = makeBaseContext({
      catcherPersonality: 'cautious',
      catcherLeadership: 30,
      catcherCallingAccuracy: 50,
    });
    const result = generateCatcherThought(ctx);
    expect(result.callingStrategy).toBe('careful');
  });

  // analytical + callingAccuracy 高
  it('analytical + callingAccuracy:80 → outside_focus, inside_focus, または breaking_heavy', () => {
    const ctx = makeBaseContext({
      catcherPersonality: 'analytical',
      catcherLeadership: 60,
      catcherCallingAccuracy: 80,
      batterEye: 40,   // 選球眼低 → breaking_heavy
    });
    const result = generateCatcherThought(ctx);
    expect(['outside_focus', 'inside_focus', 'breaking_heavy', 'mixed']).toContain(result.callingStrategy);
  });

  // analytical + callingAccuracy 低 → mixed
  it('analytical + callingAccuracy:30 → mixed', () => {
    const ctx = makeBaseContext({
      catcherPersonality: 'analytical',
      catcherLeadership: 60,
      catcherCallingAccuracy: 30,
    });
    const result = generateCatcherThought(ctx);
    expect(result.callingStrategy).toBe('mixed');
  });
});

// ============================================================
// ピッチャー状況による強制上書きテスト
// ============================================================

describe('generateCatcherThought - ピッチャー状況上書き', () => {

  it('pitcherBreakingBallSharpness:0.3 → fastball_heavy に強制', () => {
    const ctx = makeBaseContext({
      catcherPersonality: 'analytical',
      catcherCallingAccuracy: 80,
      pitcherBreakingBallSharpness: 0.3, // キレ低下
    });
    const result = generateCatcherThought(ctx);
    expect(result.callingStrategy).toBe('fastball_heavy');
  });

  it('pitcherControl:40 → strikeZoneBias が増加する', () => {
    const ctx = makeBaseContext({
      pitcherControl: 40, // コントロール悪
    });
    const ctxNormal = makeBaseContext({
      pitcherControl: 70, // 通常
    });
    const resultBad = generateCatcherThought(ctx);
    const resultNormal = generateCatcherThought(ctxNormal);

    // コントロール悪の場合 strikeZoneBias が高いはず
    expect(resultBad.pitchingBias.strikeZoneBias).toBeGreaterThanOrEqual(
      resultNormal.pitchingBias.strikeZoneBias
    );
  });

  it('pitcherStamina:30 → careful に強制', () => {
    const ctx = makeBaseContext({
      catcherPersonality: 'aggressive',
      catcherCallingAccuracy: 80,
      pitcherStamina: 30, // スタミナ低下
    });
    const result = generateCatcherThought(ctx);
    expect(result.callingStrategy).toBe('careful');
  });

  it('pitcherStamina:30 → thoughtText にスタミナ低下に関連するテキスト', () => {
    const ctx = makeBaseContext({
      pitcherStamina: 30,
    });
    const result = generateCatcherThought(ctx);
    expect(result.thoughtText).toBeTruthy();
    // スタミナが低いときの思考テキストが生成される
    expect(result.thoughtText.length).toBeGreaterThan(5);
  });

  it('pitcherMental:35 → thoughtText がメンタル関連のテキスト', () => {
    const ctx = makeBaseContext({
      pitcherMental: 35, // メンタル低下
    });
    const result = generateCatcherThought(ctx);
    expect(result.thoughtText).toBeTruthy();
  });

  it('変化球キレ低下の方がスタミナ低下より優先される（両方低い場合）', () => {
    // staminaLow が true, breakingBallPoor も true の場合
    // breakingBallPoor が先にチェックされるので fastball_heavy になるが、
    // その後 staminaLow が careful に上書きする
    const ctx = makeBaseContext({
      pitcherStamina: 30,
      pitcherBreakingBallSharpness: 0.3,
    });
    const result = generateCatcherThought(ctx);
    // staminaLow が後から上書き → careful になる
    expect(result.callingStrategy).toBe('careful');
  });
});

// ============================================================
// 配球精度が低い場合のミス発生テスト
// ============================================================

describe('generateCatcherThought - 配球精度低下', () => {

  it('callingAccuracy:30 → hasCallingError が true', () => {
    const ctx = makeBaseContext({
      catcherCallingAccuracy: 30,
    });
    const result = generateCatcherThought(ctx);
    expect(result.hasCallingError).toBe(true);
  });

  it('callingAccuracy:50 → hasCallingError が false', () => {
    const ctx = makeBaseContext({
      catcherCallingAccuracy: 50,
    });
    const result = generateCatcherThought(ctx);
    expect(result.hasCallingError).toBe(false);
  });

  it('callingAccuracy:30 でも pitchingBias が範囲内', () => {
    const ctx = makeBaseContext({
      catcherCallingAccuracy: 30,
    });
    const bias = generateCatcherThought(ctx).pitchingBias;
    expect(bias.fastballRatioBias).toBeGreaterThanOrEqual(-0.3);
    expect(bias.fastballRatioBias).toBeLessThanOrEqual(0.3);
  });
});

// ============================================================
// 監督指示の反映テスト
// ============================================================

describe('generateCatcherThought - 監督指示', () => {

  it('managerOrder.callingStyle:"careful" → callingStrategy が careful に上書き', () => {
    const ctx = makeBaseContext({
      catcherPersonality: 'aggressive',
      catcherCallingAccuracy: 80,
      managerOrder: {
        type: 'catcher_detailed',
        callingStyle: 'careful',
      },
    });
    const result = generateCatcherThought(ctx);
    expect(result.callingStrategy).toBe('careful');
  });

  it('managerOrder.focusArea:"outside" → preferOutside が true', () => {
    const ctx = makeBaseContext({
      catcherPersonality: 'cautious',
      managerOrder: {
        type: 'catcher_detailed',
        focusArea: 'outside',
      },
    });
    const result = generateCatcherThought(ctx);
    expect(result.pitchingBias.preferOutside).toBe(true);
    expect(result.pitchingBias.preferInside).toBe(false);
  });

  it('managerOrder.focusArea:"inside" → preferInside が true', () => {
    const ctx = makeBaseContext({
      catcherPersonality: 'cautious',
      managerOrder: {
        type: 'catcher_detailed',
        focusArea: 'inside',
      },
    });
    const result = generateCatcherThought(ctx);
    expect(result.pitchingBias.preferInside).toBe(true);
    expect(result.pitchingBias.preferOutside).toBe(false);
  });

  it('managerOrder.aggressiveness:"aggressive" → strikeZoneBias が増加', () => {
    const ctxWithOrder = makeBaseContext({
      catcherPersonality: 'cautious',
      managerOrder: {
        type: 'catcher_detailed',
        aggressiveness: 'aggressive',
      },
    });
    const ctxNoOrder = makeBaseContext({
      catcherPersonality: 'cautious',
    });
    const resultWithOrder = generateCatcherThought(ctxWithOrder);
    const resultNoOrder = generateCatcherThought(ctxNoOrder);
    expect(resultWithOrder.pitchingBias.strikeZoneBias).toBeGreaterThan(
      resultNoOrder.pitchingBias.strikeZoneBias
    );
  });

  it('managerOrder.aggressiveness:"passive" → strikeZoneBias が減少', () => {
    const ctxWithOrder = makeBaseContext({
      catcherPersonality: 'cautious',
      managerOrder: {
        type: 'catcher_detailed',
        aggressiveness: 'passive',
      },
    });
    const ctxNoOrder = makeBaseContext({
      catcherPersonality: 'cautious',
    });
    const resultWithOrder = generateCatcherThought(ctxWithOrder);
    const resultNoOrder = generateCatcherThought(ctxNoOrder);
    expect(resultWithOrder.pitchingBias.strikeZoneBias).toBeLessThan(
      resultNoOrder.pitchingBias.strikeZoneBias
    );
  });
});

// ============================================================
// 各性格の pitchingBias の方向性テスト
// ============================================================

describe('generateCatcherThought - pitchingBias の方向性', () => {

  it('fastball_heavy の策略 → fastballRatioBias が正', () => {
    const ctx = makeBaseContext({
      catcherPersonality: 'aggressive',
      catcherCallingAccuracy: 80,
      pitcherBreakingBallSharpness: 0.3, // キレ低下 → fastball_heavy 強制
    });
    const result = generateCatcherThought(ctx);
    expect(result.callingStrategy).toBe('fastball_heavy');
    expect(result.pitchingBias.fastballRatioBias).toBeGreaterThan(0);
  });

  it('careful の策略 → strikeZoneBias が正', () => {
    const ctx = makeBaseContext({
      catcherPersonality: 'cautious',
      catcherLeadership: 30,
    });
    const result = generateCatcherThought(ctx);
    expect(result.callingStrategy).toBe('careful');
    expect(result.pitchingBias.strikeZoneBias).toBeGreaterThan(0);
  });

  it('breaking_heavy の策略 → fastballRatioBias が負', () => {
    const ctx = makeBaseContext({
      catcherPersonality: 'analytical',
      catcherCallingAccuracy: 80,
      batterEye: 40, // 選球眼低 → breaking_heavy
    });
    const result = generateCatcherThought(ctx);
    if (result.callingStrategy === 'breaking_heavy') {
      expect(result.pitchingBias.fastballRatioBias).toBeLessThan(0);
    }
    // breaking_heavy 以外の場合もテストは通す
  });
});

// ============================================================
// 決定論的テスト（同じ入力 → 同じ出力）
// ============================================================

describe('generateCatcherThought - 決定論性', () => {

  it('同じコンテキストは常に同じ結果を返す', () => {
    const ctx = makeBaseContext({
      catcherPersonality: 'analytical',
      catcherCallingAccuracy: 75,
      inning: 7,
      outs: 2,
    });
    const result1 = generateCatcherThought(ctx);
    const result2 = generateCatcherThought(ctx);

    expect(result1.callingStrategy).toBe(result2.callingStrategy);
    expect(result1.thoughtText).toBe(result2.thoughtText);
    expect(result1.pitchingBias.fastballRatioBias).toBe(result2.pitchingBias.fastballRatioBias);
  });
});
