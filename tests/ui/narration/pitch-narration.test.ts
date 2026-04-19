/**
 * pitch-narration.test.ts
 *
 * 実況ログから「インプレー」という内部用語が出ないことを検証。
 *
 * 高橋さん報告 2026-04-19: 「なんでインプレーでホームランなの？」
 *   → in_play という内部状態名がそのまま表示されてユーザーに理解不能。
 *   → 打球結果を直接表示するべき (ヒット！/ホームラン!! 等)。
 */

import { describe, it, expect } from 'vitest';
import { buildNarrationForPitch } from '@/ui/narration/buildNarration';
import type { MatchState, PitchResult, BatContactResult } from '@/engine/match/types';

function makeState(): MatchState {
  return {
    config: { innings: 9, maxExtras: 3, useDH: false, isTournament: true, isKoshien: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    homeTeam: {
      id: 'home',
      name: 'ホーム',
      players: [
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          player: {
            id: 'p1',
            firstName: '太郎',
            lastName: '吉川',
            stats: { base: { mental: 50 }, batting: {}, pitching: null },
            condition: { mood: 'normal' },
            mentalState: { flags: [] },
            traits: [],
          } as any,
          pitchCountInGame: 0,
          stamina: 100,
          confidence: 50,
          isWarmedUp: false,
        },
      ],
      battingOrder: ['p1'],
      fieldPositions: new Map(),
      currentPitcherId: 'p1',
      benchPlayerIds: [],
      usedPlayerIds: new Set(),
    } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    awayTeam: {
      id: 'away',
      name: 'アウェイ',
      players: [
        {
          player: {
            id: 'p2',
            firstName: '次郎',
            lastName: '石川',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            stats: { base: { mental: 50 }, batting: {}, pitching: { velocity: 130, control: 50, pitchStamina: 50, pitches: {} } } as any,
            condition: { mood: 'normal' },
            mentalState: { flags: [] },
            traits: [],
          },
          pitchCountInGame: 0,
          stamina: 100,
          confidence: 50,
          isWarmedUp: false,
        },
      ],
      battingOrder: ['p2'],
      fieldPositions: new Map(),
      currentPitcherId: 'p2',
      benchPlayerIds: [],
      usedPlayerIds: new Set(),
    } as any,
    currentInning: 1,
    currentHalf: 'bottom', // bottom = home が攻撃中 = 吉川が打者
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

function makeHomeRunPitch(): PitchResult {
  return {
    pitchSelection: { type: 'changeup', velocity: 120 } as PitchResult['pitchSelection'],
    targetLocation: { row: 1, col: 1 } as PitchResult['targetLocation'],
    actualLocation: { row: 1, col: 1 } as PitchResult['actualLocation'],
    batterAction: 'swing',
    outcome: 'in_play',
    batContact: {
      contactType: 'fly_ball',
      direction: 45,
      speed: 'strong',
      distance: 120,
      fieldResult: { type: 'home_run' },
    } as BatContactResult,
  };
}

describe('実況ログ「インプレー」という内部用語を表示しない', () => {
  it('ホームラン時「インプレー」ではなく「ホームラン！！」と表示', () => {
    const before = makeState();
    const after: MatchState = {
      ...before,
      score: { home: 1, away: 0 },
      inningScores: { home: [1], away: [] },
    };
    const entries = buildNarrationForPitch(before, after, makeHomeRunPitch());

    const allText = entries.map((e) => e.text).join('\n');
    expect(allText, `「インプレー」が実況に混じっている: ${allText}`).not.toContain('インプレー');
    expect(allText).toContain('ホームラン');
  });

  it('ヒット時「インプレー」ではなく「ヒット！」と表示', () => {
    const before = makeState();
    const after: MatchState = { ...before };
    const pitch: PitchResult = {
      ...makeHomeRunPitch(),
      batContact: {
        ...makeHomeRunPitch().batContact!,
        fieldResult: { type: 'single' },
      } as BatContactResult,
    };
    const entries = buildNarrationForPitch(before, after, pitch);
    const allText = entries.map((e) => e.text).join('\n');
    expect(allText).not.toContain('インプレー');
    expect(allText).toContain('ヒット');
  });

  it('打球アウト時「インプレー」ではなく「アウト」と表示', () => {
    const before = makeState();
    const after: MatchState = { ...before, outs: 1 };
    const pitch: PitchResult = {
      ...makeHomeRunPitch(),
      batContact: {
        ...makeHomeRunPitch().batContact!,
        fieldResult: { type: 'out' } as any,
      } as BatContactResult,
    };
    const entries = buildNarrationForPitch(before, after, pitch);
    const allText = entries.map((e) => e.text).join('\n');
    expect(allText).not.toContain('インプレー');
    expect(allText).toContain('アウト');
  });

  it('ホームラン時の1行にちゃんと球種と結果が含まれる', () => {
    const before = makeState();
    const after: MatchState = {
      ...before,
      score: { home: 1, away: 0 },
    };
    const entries = buildNarrationForPitch(before, after, makeHomeRunPitch());
    // 投球行は「石川 → 吉川: チェンジアップ … ホームラン」のはず
    const pitchLine = entries.find((e) => e.text.includes('チェンジアップ'));
    expect(pitchLine, '球種を含む行がない').toBeDefined();
    expect(pitchLine!.text).toContain('ホームラン');
    expect(pitchLine!.text).not.toContain('インプレー');
  });

  it('空振り時は従来通り「空振り」と表示', () => {
    const before = makeState();
    const after: MatchState = {
      ...before,
      count: { balls: 0, strikes: 1 },
    };
    const pitch: PitchResult = {
      pitchSelection: { type: 'fastball', velocity: 140 } as PitchResult['pitchSelection'],
      targetLocation: { row: 1, col: 1 } as PitchResult['targetLocation'],
      actualLocation: { row: 1, col: 1 } as PitchResult['actualLocation'],
      batterAction: 'swing',
      outcome: 'swinging_strike',
      batContact: null,
    };
    const entries = buildNarrationForPitch(before, after, pitch);
    const allText = entries.map((e) => e.text).join('\n');
    expect(allText).toContain('空振り');
    expect(allText).not.toContain('インプレー');
  });
});
