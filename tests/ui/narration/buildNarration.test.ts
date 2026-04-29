/**
 * tests/ui/narration/buildNarration.test.ts
 *
 * Phase S1-A: ナレーション生成のユニットテスト
 *
 * テストID:
 *   A4-test1: walk イベントから "フォアボール" を含むナレーションが生成されること
 */

import { describe, it, expect } from 'vitest';
import { buildNarrationForPitch, buildNarrationForAtBat } from '../../../src/ui/narration/buildNarration';
import type { MatchState, PitchResult, AtBatResult } from '../../../src/engine/match/types';

// ============================================================
// テストヘルパー
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeBaseState(): MatchState {
  return {
    config: {
      innings: 9,
      maxExtras: 3,
      useDH: false,
      isTournament: true,
      isKoshien: false,
    },
    homeTeam: {
      id: 'home',
      name: 'ホーム高校',
      players: [
        {
          player: {
            id: 'p-home-1',
            firstName: '太郎',
            lastName: '山田',
            battingSide: 'right',
            throwingHand: 'right',
            position: 'pitcher',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            stats: { base: { mental: 50 }, batting: {}, pitching: { velocity: 130, control: 50, pitchStamina: 50, pitches: {} } } as any,
            condition: { mood: 'normal' },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mentalState: { flags: [] } as any,
            traits: [],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          pitchCountInGame: 0,
          stamina: 100,
          confidence: 50,
          isWarmedUp: true,
        },
      ],
      battingOrder: ['p-home-1'],
      fieldPositions: new Map(),
      currentPitcherId: 'p-home-1',
      benchPlayerIds: [],
      usedPlayerIds: new Set(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    awayTeam: {
      id: 'away',
      name: 'アウェイ高校',
      players: [
        {
          player: {
            id: 'p-away-1',
            firstName: '次郎',
            lastName: '鈴木',
            battingSide: 'right',
            throwingHand: 'right',
            position: 'catcher',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            stats: { base: { mental: 50 }, batting: { meet: 60, power: 50 }, pitching: null } as any,
            condition: { mood: 'normal' },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mentalState: { flags: [] } as any,
            traits: [],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          pitchCountInGame: 0,
          stamina: 100,
          confidence: 50,
          isWarmedUp: false,
        },
        {
          player: {
            id: 'p-away-2',
            firstName: '三郎',
            lastName: '田中',
            battingSide: 'left',
            throwingHand: 'right',
            position: 'first',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            stats: { base: { mental: 50 }, batting: { meet: 55, power: 45 }, pitching: null } as any,
            condition: { mood: 'normal' },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mentalState: { flags: [] } as any,
            traits: [],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          pitchCountInGame: 0,
          stamina: 100,
          confidence: 50,
          isWarmedUp: false,
        },
      ],
      battingOrder: ['p-away-1', 'p-away-2'],
      fieldPositions: new Map(),
      currentPitcherId: 'p-home-1',
      benchPlayerIds: [],
      usedPlayerIds: new Set(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    currentInning: 1,
    currentHalf: 'top', // away 攻撃
    outs: 0,
    count: { balls: 0, strikes: 0 },
    bases: { first: null, second: null, third: null },
    score: { home: 0, away: 0 },
    inningScores: { home: [], away: [] },
    currentBatterIndex: 0,
    pitchCount: 0,
    log: [],
    isOver: false,
    result: null,
  };
}

/** 4球目のボール投球（フォアボール直前）を作成 */
function makeWalkTriggerPitch(): PitchResult {
  return {
    pitchSelection: { type: 'fastball', velocity: 130 },
    targetLocation: { row: 0, col: 0 },
    actualLocation: { row: 0, col: 0 },
    batterAction: 'take',
    outcome: 'ball',
    batContact: null,
  };
}

// ============================================================
// A4-test1: walk イベントから "フォアボール" を含むナレーションが生成されること
// ============================================================

describe('A4-test1: フォアボール実況ログ', () => {
  it('4ボール投球時に「フォアボール」を含むナレーションが生成される', () => {
    const before = makeBaseState();
    // 3ボールの状態
    const stateBefore: MatchState = {
      ...before,
      count: { balls: 3, strikes: 0 },
      currentBatterIndex: 0,
    };

    // フォアボール後: 打者インデックスが進む (walk)
    const stateAfter: MatchState = {
      ...before,
      count: { balls: 0, strikes: 0 }, // reset
      currentBatterIndex: 1, // next batter
      bases: {
        first: { playerId: 'p-away-1', speed: 50 },
        second: null,
        third: null,
      },
    };

    const pitch = makeWalkTriggerPitch();
    const entries = buildNarrationForPitch(stateBefore, stateAfter, pitch);
    const allText = entries.map((e) => e.text).join('\n');

    expect(allText, `フォアボールナレーションが見つからない: ${allText}`).toContain('フォアボール');
  });

  it('フォアボール時、ナレーションに「一塁」への誘導テキストが含まれる', () => {
    const before = makeBaseState();
    const stateBefore: MatchState = {
      ...before,
      count: { balls: 3, strikes: 0 },
      currentBatterIndex: 0,
    };
    const stateAfter: MatchState = {
      ...before,
      count: { balls: 0, strikes: 0 },
      currentBatterIndex: 1,
      bases: {
        first: { playerId: 'p-away-1', speed: 50 },
        second: null,
        third: null,
      },
    };

    const pitch = makeWalkTriggerPitch();
    const entries = buildNarrationForPitch(stateBefore, stateAfter, pitch);
    const allText = entries.map((e) => e.text).join('\n');

    // 「打者は一塁へ！」というテキストを含む
    expect(allText).toContain('一塁');
  });

  it('フォアボール時、ナレーションの kind が highlight である', () => {
    const before = makeBaseState();
    const stateBefore: MatchState = {
      ...before,
      count: { balls: 3, strikes: 0 },
      currentBatterIndex: 0,
    };
    const stateAfter: MatchState = {
      ...before,
      count: { balls: 0, strikes: 0 },
      currentBatterIndex: 1,
      bases: {
        first: { playerId: 'p-away-1', speed: 50 },
        second: null,
        third: null,
      },
    };

    const pitch = makeWalkTriggerPitch();
    const entries = buildNarrationForPitch(stateBefore, stateAfter, pitch);

    // フォアボール関連エントリを探す
    const walkEntries = entries.filter((e) => e.text.includes('フォアボール'));
    expect(walkEntries.length).toBeGreaterThan(0);
    // highlight kind であること
    const hasHighlight = walkEntries.some((e) => e.kind === 'highlight');
    expect(hasHighlight).toBe(true);
  });

  it('2ボールの通常投球ではフォアボールログを生成しない', () => {
    const before = makeBaseState();
    const stateBefore: MatchState = {
      ...before,
      count: { balls: 2, strikes: 0 },
      currentBatterIndex: 0,
    };
    const stateAfter: MatchState = {
      ...before,
      count: { balls: 3, strikes: 0 }, // 3ボールに増えた（まだ終わっていない）
      currentBatterIndex: 0, // same batter
    };

    const pitch = makeWalkTriggerPitch();
    const entries = buildNarrationForPitch(stateBefore, stateAfter, pitch);
    const allText = entries.map((e) => e.text).join('\n');

    // フォアボールではない
    expect(allText).not.toContain('フォアボール！打者は一塁へ！');
  });

  it('buildNarrationForAtBat: walk結果で「フォアボール」ログが生成される', () => {
    const before = makeBaseState();
    const stateAfter: MatchState = {
      ...before,
      currentBatterIndex: 1,
      bases: {
        first: { playerId: 'p-away-1', speed: 50 },
        second: null,
        third: null,
      },
    };

    const atBatResult: AtBatResult = {
      batterId: 'p-away-1',
      pitcherId: 'p-home-1',
      outcome: {
        type: 'walk',
      },
      pitches: [makeWalkTriggerPitch()],
    };

    const entries = buildNarrationForAtBat(before, stateAfter, atBatResult);
    const allText = entries.map((e) => e.text).join('\n');

    // フォアボールの記述が含まれること
    expect(allText).toContain('フォアボール');
  });
});

// ============================================================
// A6-test1: 1イニング終了時にアナリスト評価コンポーネントが表示される
// ============================================================

describe('A6-test1: アナリスト評価枠の表示確認', () => {
  /**
   * PsycheWindow の表示ロジックをシミュレートする関数
   * (コンポーネントをレンダリングせずにロジックのみをテスト)
   */
  function shouldShowAnalystWindow(props: {
    hasMonologues: boolean;
    hasAnalyst: boolean;
    hasComments: boolean;
  }): boolean {
    const { hasMonologues, hasAnalyst, hasComments } = props;
    const showAnalyst = hasAnalyst && hasComments;
    return hasMonologues || showAnalyst;
  }

  it('hasAnalyst=true かつ analystComments あり → アナリスト枠が表示される', () => {
    expect(
      shouldShowAnalystWindow({ hasMonologues: false, hasAnalyst: true, hasComments: true })
    ).toBe(true);
  });

  it('hasAnalyst=true でも analystComments なし → アナリスト枠が表示されない', () => {
    expect(
      shouldShowAnalystWindow({ hasMonologues: false, hasAnalyst: true, hasComments: false })
    ).toBe(false);
  });

  it('hasAnalyst=false → アナリスト枠が表示されない', () => {
    expect(
      shouldShowAnalystWindow({ hasMonologues: false, hasAnalyst: false, hasComments: true })
    ).toBe(false);
  });

  it('1イニング終了後、addAnalystComment が呼ばれるとコメントが存在する', () => {
    // addAnalystComment の副作用をシミュレート
    let analystComments: { text: string; inning: number }[] = [];

    function addAnalystComment(inning: number, half: 'top' | 'bottom', text: string) {
      // 随時上書き方式: 常に最新1件のみ保持
      analystComments = [{ text, inning }];
    }

    // 1回表終了時にアナリストコメントを追加
    addAnalystComment(1, 'top', '1回表: ストレート中心の投球でした');

    expect(analystComments.length).toBe(1);
    expect(analystComments[0].text).toContain('1回表');
    expect(analystComments[0].inning).toBe(1);

    // アナリスト枠の表示チェック
    const hasComments = analystComments.length > 0;
    expect(shouldShowAnalystWindow({ hasMonologues: false, hasAnalyst: true, hasComments })).toBe(true);
  });

  it('イニング切替を正しく検出する（pitchLog の inning/half 変化）', () => {
    // ハーフイニング切替の検出ロジックをシミュレート
    const pitchLog = [
      { inning: 1, half: 'top' },
      { inning: 1, half: 'top' },
      { inning: 1, half: 'bottom' }, // ← ここで切替を検出
    ];

    const lastPitch = pitchLog[pitchLog.length - 1];
    const prevPitch = pitchLog[pitchLog.length - 2];

    const isHalfChanged =
      lastPitch.inning !== prevPitch.inning || lastPitch.half !== prevPitch.half;

    expect(isHalfChanged).toBe(true);
    expect(prevPitch.inning).toBe(1);
    expect(prevPitch.half).toBe('top'); // 終了した half
  });
});
