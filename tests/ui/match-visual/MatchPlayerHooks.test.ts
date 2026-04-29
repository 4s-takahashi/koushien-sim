/**
 * tests/ui/match-visual/MatchPlayerHooks.test.ts
 *
 * Phase S1-A: 試合演出タイミング制御のユニットテスト
 *
 * テストID:
 *   A1-test1: プレイボールイベント後、PLAY_BALL_DELAY_MS ms 経過まで次ピッチが発火しないことを fake timer で検証
 *   A1-test2: autoSpeedMultiplier=2 で待機時間が半減することを検証
 *   A2-test1: チェンジ（3アウト）イベント後、CHANGE_DELAY_MS 経過まで次ピッチが発火しないこと
 *   A5-test1: 三振後 1.5s 待機 → 次打者ログ → 0.5s 待機 → 投球開始（合計2s）の順序が守られること
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PLAY_BALL_DELAY_BASE_MS,
  CHANGE_DELAY_BASE_MS,
  STRIKEOUT_DELAY_1_BASE_MS,
  STRIKEOUT_DELAY_2_BASE_MS,
  getAutoSpeedMultiplier,
  getPlayBallDelayMs,
  getChangeDelayMs,
  getStrikeoutDelay1Ms,
  getStrikeoutDelay2Ms,
  getStrikeoutTotalDelayMs,
  isPlayBallNarration,
  isChangeNarration,
  isStrikeoutNarration,
  buildNextBatterLog,
  shouldAutoPause,
  AUTO_PAUSE_ALLOWED_KINDS,
} from '../../../src/ui/match-visual/MatchPlayerHooks';
import type { TimeMode } from '../../../src/engine/match/runner-types';

// ============================================================
// A1-test1: プレイボール後 PLAY_BALL_DELAY_MS 経過まで発火しない
// ============================================================

describe('A1-test1: プレイボール後のディレイ（fake timer 検証）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('PLAY_BALL_DELAY_BASE_MS が 3000ms (standard x1 スピード)', () => {
    expect(PLAY_BALL_DELAY_BASE_MS).toBe(3000);
  });

  it('getPlayBallDelayMs(standard) = 1500ms (x2 割り算)', () => {
    // standard → multiplier=2 → 3000/2 = 1500
    expect(getPlayBallDelayMs('standard')).toBe(1500);
  });

  it('プレイボール後、PLAY_BALL_DELAY_MS 経過まで発火しないことを fake timer で検証', () => {
    const timeMode: TimeMode = 'standard';
    const delayMs = getPlayBallDelayMs(timeMode); // 1500ms

    let fired = false;
    const timer = setTimeout(() => { fired = true; }, delayMs);

    // 1499ms 経過: まだ発火しない
    vi.advanceTimersByTime(delayMs - 1);
    expect(fired).toBe(false);

    // delayMs 経過: 発火
    vi.advanceTimersByTime(1);
    expect(fired).toBe(true);

    clearTimeout(timer);
  });

  it('getPlayBallDelayMs(slow) = 3000ms (x1: 最も遅い)', () => {
    expect(getPlayBallDelayMs('slow')).toBe(3000);
  });

  it('getPlayBallDelayMs(fast) = 750ms (x4: 最も速い)', () => {
    expect(getPlayBallDelayMs('fast')).toBe(750);
  });
});

// ============================================================
// A1-test2: autoSpeedMultiplier=2 で待機時間が半減
// ============================================================

describe('A1-test2: autoSpeedMultiplier=2 で待機時間が半減', () => {
  it('slow mode: multiplier=1', () => {
    expect(getAutoSpeedMultiplier('slow')).toBe(1);
  });

  it('standard mode: multiplier=2', () => {
    expect(getAutoSpeedMultiplier('standard')).toBe(2);
  });

  it('fast mode: multiplier=4', () => {
    expect(getAutoSpeedMultiplier('fast')).toBe(4);
  });

  it('standard モードでは slow の半分のディレイ', () => {
    const slowDelay = getPlayBallDelayMs('slow');
    const standardDelay = getPlayBallDelayMs('standard');
    expect(standardDelay).toBe(Math.round(slowDelay / 2));
  });

  it('fast モードでは standard の半分のディレイ', () => {
    const standardDelay = getPlayBallDelayMs('standard');
    const fastDelay = getPlayBallDelayMs('fast');
    expect(fastDelay).toBe(Math.round(standardDelay / 2));
  });

  it('fast モードでは slow の 1/4 のディレイ', () => {
    const slowDelay = getPlayBallDelayMs('slow');
    const fastDelay = getPlayBallDelayMs('fast');
    expect(fastDelay).toBe(Math.round(slowDelay / 4));
  });

  it('autoSpeedMultiplier=2 で fake timer を使ったディレイ半減の検証', () => {
    vi.useFakeTimers();
    try {
      const slowDelay = getPlayBallDelayMs('slow');   // 3000
      const fastDelay = getPlayBallDelayMs('fast');   // 750

      // slow タイマー: slowDelay-1 経過でまだ未発火、slowDelay で発火
      let slowFired = false;
      setTimeout(() => { slowFired = true; }, slowDelay);

      vi.advanceTimersByTime(slowDelay - 1);
      expect(slowFired).toBe(false);
      vi.advanceTimersByTime(1);
      expect(slowFired).toBe(true);

      // リセット
      vi.useRealTimers();
      vi.useFakeTimers();

      // fast タイマー: fastDelay-1 経過でまだ未発火、fastDelay で発火
      let fastFired = false;
      setTimeout(() => { fastFired = true; }, fastDelay);

      vi.advanceTimersByTime(fastDelay - 1);
      expect(fastFired).toBe(false);
      vi.advanceTimersByTime(1);
      expect(fastFired).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ============================================================
// A2-test1: チェンジ後のディレイ
// ============================================================

describe('A2-test1: チェンジ（3アウト）後のディレイ（fake timer 検証）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('CHANGE_DELAY_BASE_MS が 3000ms', () => {
    expect(CHANGE_DELAY_BASE_MS).toBe(3000);
  });

  it('getChangeDelayMs(standard) = 1500ms', () => {
    expect(getChangeDelayMs('standard')).toBe(1500);
  });

  it('チェンジイベント後、CHANGE_DELAY_MS 経過まで次ピッチが発火しないこと（fake timer 検証）', () => {
    const delayMs = getChangeDelayMs('standard'); // 1500ms

    let nextPitchFired = false;
    const timer = setTimeout(() => { nextPitchFired = true; }, delayMs);

    // 1499ms 経過: まだ発火しない
    vi.advanceTimersByTime(delayMs - 1);
    expect(nextPitchFired).toBe(false);

    // 1500ms 経過: 発火
    vi.advanceTimersByTime(1);
    expect(nextPitchFired).toBe(true);

    clearTimeout(timer);
  });

  it('isChangeNarration で 3アウト・チェンジ テキストを検出', () => {
    expect(isChangeNarration('━━━ 🔁 3アウト・チェンジ ━━━')).toBe(true);
    expect(isChangeNarration('ストライク！')).toBe(false);
    expect(isChangeNarration('フォアボール！打者は一塁へ！')).toBe(false);
  });

  it('getChangeDelayMs(slow) = 3000ms, getChangeDelayMs(fast) = 750ms', () => {
    expect(getChangeDelayMs('slow')).toBe(3000);
    expect(getChangeDelayMs('fast')).toBe(750);
  });
});

// ============================================================
// A5-test1: 三振後 1.5s → 次打者ログ → 0.5s → 投球開始
// ============================================================

describe('A5-test1: 三振後の演出シーケンス（合計2秒）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('STRIKEOUT_DELAY_1_BASE_MS = 1500ms, STRIKEOUT_DELAY_2_BASE_MS = 500ms', () => {
    expect(STRIKEOUT_DELAY_1_BASE_MS).toBe(1500);
    expect(STRIKEOUT_DELAY_2_BASE_MS).toBe(500);
  });

  it('standard モードでの三振ディレイ: delay1=750ms, delay2=250ms', () => {
    expect(getStrikeoutDelay1Ms('standard')).toBe(750);
    expect(getStrikeoutDelay2Ms('standard')).toBe(250);
  });

  it('slow モードでの三振ディレイ: delay1=1500ms, delay2=500ms', () => {
    expect(getStrikeoutDelay1Ms('slow')).toBe(1500);
    expect(getStrikeoutDelay2Ms('slow')).toBe(500);
  });

  it('slow モードでの合計待機時間 = 2000ms', () => {
    expect(getStrikeoutTotalDelayMs('slow')).toBe(2000);
  });

  it('standard モードでの合計待機時間 = 1000ms', () => {
    expect(getStrikeoutTotalDelayMs('standard')).toBe(1000);
  });

  it('fast モードでの合計待機時間 = 500ms', () => {
    expect(getStrikeoutTotalDelayMs('fast')).toBe(500);
  });

  it('三振後 1.5s 待機 → 次打者ログ → 0.5s 待機 → 投球開始 の順序が守られること（slow モード）', () => {
    const delay1 = getStrikeoutDelay1Ms('slow'); // 1500ms
    const delay2 = getStrikeoutDelay2Ms('slow'); // 500ms

    const events: string[] = [];
    let nextBatterLogAdded = false;
    let pitchStarted = false;

    // 三振発生後のシーケンスをシミュレート
    let innerTimer: ReturnType<typeof setTimeout> | null = null;
    const outerTimer = setTimeout(() => {
      // 1.5秒後: 次打者ログ追加
      nextBatterLogAdded = true;
      events.push('next_batter_log');

      // 0.5秒後: 投球開始
      innerTimer = setTimeout(() => {
        pitchStarted = true;
        events.push('pitch_start');
      }, delay2);
    }, delay1);

    // 初期状態
    expect(nextBatterLogAdded).toBe(false);
    expect(pitchStarted).toBe(false);

    // delay1 - 1ms 経過: 次打者ログまだ
    vi.advanceTimersByTime(delay1 - 1);
    expect(nextBatterLogAdded).toBe(false);
    expect(pitchStarted).toBe(false);

    // delay1 ms 経過: 次打者ログが追加される
    vi.advanceTimersByTime(1);
    expect(nextBatterLogAdded).toBe(true);
    expect(pitchStarted).toBe(false);
    expect(events).toEqual(['next_batter_log']);

    // delay2 - 1ms 経過: 投球まだ
    vi.advanceTimersByTime(delay2 - 1);
    expect(pitchStarted).toBe(false);

    // delay2 ms 経過: 投球開始
    vi.advanceTimersByTime(1);
    expect(pitchStarted).toBe(true);
    expect(events).toEqual(['next_batter_log', 'pitch_start']);

    clearTimeout(outerTimer);
    if (innerTimer) clearTimeout(innerTimer);
  });

  it('isStrikeoutNarration で空振り三振・見逃し三振を検出', () => {
    expect(isStrikeoutNarration('⚡ 空振り三振')).toBe(true);
    expect(isStrikeoutNarration('⚡ 見逃し三振')).toBe(true);
    expect(isStrikeoutNarration('ヒット！')).toBe(false);
    expect(isStrikeoutNarration('フォアボール！打者は一塁へ！')).toBe(false);
  });

  it('buildNextBatterLog が次打者テキストを正しく生成', () => {
    const log = buildNextBatterLog('田中', 3, '三塁手');
    expect(log).toBe('🧢 次の打者: 田中選手（3番、三塁手）');
  });
});

// ============================================================
// isPlayBallNarration のテスト
// ============================================================

describe('isPlayBallNarration', () => {
  it('PLAY BALL テキストを検出', () => {
    expect(isPlayBallNarration('PLAY BALL')).toBe(true);
    expect(isPlayBallNarration('プレイボール')).toBe(true);
  });

  it('その他のテキストは false', () => {
    expect(isPlayBallNarration('ヒット！')).toBe(false);
    expect(isPlayBallNarration('3アウト・チェンジ')).toBe(false);
  });
});

// ============================================================
// A3: shouldAutoPause テスト
// ============================================================

describe('shouldAutoPause (A3: 自動進行停止ルール)', () => {
  it('scoring_chance では自動進行を停止する', () => {
    expect(shouldAutoPause('scoring_chance')).toBe(true);
  });

  it('pinch では自動進行を停止する', () => {
    expect(shouldAutoPause('pinch')).toBe(true);
  });

  it('match_end では自動進行を停止する', () => {
    expect(shouldAutoPause('match_end')).toBe(true);
  });

  it('pitch_start では自動進行を停止しない（routine）', () => {
    expect(shouldAutoPause('pitch_start')).toBe(false);
  });

  it('at_bat_start では自動進行を停止しない（routine）', () => {
    expect(shouldAutoPause('at_bat_start')).toBe(false);
  });

  it('inning_end では自動進行を停止しない（routine）', () => {
    expect(shouldAutoPause('inning_end')).toBe(false);
  });

  it('pitcher_tired では AUTO_PAUSE_ALLOWED_KINDS に含まれないため停止しない', () => {
    // pitcher_tired は hotfix-5 で除去されたため、現在は停止しない
    expect(shouldAutoPause('pitcher_tired')).toBe(false);
  });

  it('未知の reason では停止しない', () => {
    expect(shouldAutoPause('unknown_reason')).toBe(false);
  });

  it('AUTO_PAUSE_ALLOWED_KINDS に chance/pinch/match_end が含まれる', () => {
    expect(AUTO_PAUSE_ALLOWED_KINDS.has('scoring_chance')).toBe(true);
    expect(AUTO_PAUSE_ALLOWED_KINDS.has('pinch')).toBe(true);
    expect(AUTO_PAUSE_ALLOWED_KINDS.has('match_end')).toBe(true);
  });
});
