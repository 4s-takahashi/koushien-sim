/**
 * tests/ui/narration/batter-handedness-narration.test.ts
 *
 * Phase 12-L: 課題3 — 左打者の内角・外角ナレーション反転テスト
 *
 * 問題:
 * 右打者では col=1 が内角、col=3 が外角（投手視点で同じ）。
 * 左打者では内角と外角が逆転するはずだが、従来の pitchLocationJP() は
 * 打者の左右を考慮していなかった。
 *
 * 修正:
 * pitchLocationJPForBatter() を追加し、左打者 (battingSide='left') の場合に
 * col=1 ↔ col=3 を反転して内角・外角テキストを生成する。
 * ストライクゾーン描画（投手視点）は変更なし、ナレーションテキストのみ反転。
 *
 * テスト:
 * - 右打者: col=1 → 内角, col=3 → 外角
 * - 左打者: col=1 → 外角, col=3 → 内角（ミラー）
 * - スイッチ打者: 右打者と同じ扱い
 * - 真中 (col=2): 左右関係なく「真ん中」
 */

import { describe, it, expect } from 'vitest';
import { buildNarrationForPitch } from '@/ui/narration/buildNarration';
import type { MatchState, PitchResult } from '@/engine/match/types';
import type { BattingSide } from '@/engine/types/player';

// ============================================================
// テストフィクスチャ
// ============================================================

function makePlayerWithBattingSide(id: string, battingSide: BattingSide) {
  return {
    player: {
      id,
      firstName: '太郎',
      lastName: '打者',
      stats: { base: { mental: 50 }, batting: {}, pitching: null },
      condition: { mood: 'normal' },
      mentalState: { flags: [] },
      traits: [],
      battingSide,
      throwingHand: 'right' as const,
      // 最低限必要な Player フィールド
      enrollmentYear: 2024,
      position: 'first' as const,
      subPositions: [],
      height: 175,
      weight: 70,
      potential: {},
      background: {},
      careerStats: {},
    },
    pitchCountInGame: 0,
    stamina: 100,
    confidence: 50,
    isWarmedUp: false,
  } as unknown as import('@/engine/match/types').MatchPlayer;
}

function makePitcher(id: string) {
  return {
    player: {
      id,
      firstName: '投手',
      lastName: '投手',
      stats: {
        base: { mental: 50 },
        batting: {},
        pitching: { velocity: 140, control: 60, pitchStamina: 70, pitches: {} },
      },
      condition: { mood: 'normal' },
      mentalState: { flags: [] },
      traits: [],
      battingSide: 'right' as const,
      throwingHand: 'right' as const,
      enrollmentYear: 2024,
      position: 'pitcher' as const,
      subPositions: [],
      height: 180,
      weight: 80,
      potential: {},
      background: {},
      careerStats: {},
    },
    pitchCountInGame: 10,
    stamina: 80,
    confidence: 50,
    isWarmedUp: true,
  } as unknown as import('@/engine/match/types').MatchPlayer;
}

function makeState(battingSide: BattingSide = 'right'): MatchState {
  const batterId = 'batter-1';
  const pitcherId = 'pitcher-1';
  const batter = makePlayerWithBattingSide(batterId, battingSide);
  const pitcher = makePitcher(pitcherId);

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
      name: 'ホーム',
      players: [batter],
      battingOrder: [batterId],
      fieldPositions: new Map(),
      currentPitcherId: pitcherId,
      benchPlayerIds: [],
      usedPlayerIds: new Set(),
    } as unknown as import('@/engine/match/types').MatchTeam,
    awayTeam: {
      id: 'away',
      name: 'アウェイ',
      players: [pitcher],
      battingOrder: [pitcherId],
      fieldPositions: new Map(),
      currentPitcherId: pitcherId,
      benchPlayerIds: [],
      usedPlayerIds: new Set(),
    } as unknown as import('@/engine/match/types').MatchTeam,
    currentInning: 1,
    currentHalf: 'bottom', // home が攻撃 = batter が打者
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

function makeStrikePitch(col: number): PitchResult {
  return {
    pitchSelection: {
      type: 'fastball',
      velocity: 140,
    } as PitchResult['pitchSelection'],
    targetLocation: { row: 2, col } as PitchResult['targetLocation'],
    actualLocation: { row: 2, col } as PitchResult['actualLocation'],
    batterAction: 'take',
    outcome: 'called_strike',
    batContact: null,
  };
}

// ============================================================
// テスト
// ============================================================

describe('打者の左右による内角・外角ナレーション反転 (Phase 12-L)', () => {
  // ── 右打者 ──
  describe('右打者 (battingSide=right)', () => {
    it('col=1 の投球 → 「内角」を含む実況テキスト', () => {
      const state = makeState('right');
      const pitch = makeStrikePitch(1);
      const entries = buildNarrationForPitch(state, state, pitch);
      const text = entries.map((e) => e.text).join(' ');
      expect(text).toContain('内角');
      expect(text).not.toContain('外角');
    });

    it('col=3 の投球 → 「外角」を含む実況テキスト', () => {
      const state = makeState('right');
      const pitch = makeStrikePitch(3);
      const entries = buildNarrationForPitch(state, state, pitch);
      const text = entries.map((e) => e.text).join(' ');
      expect(text).toContain('外角');
      expect(text).not.toContain('内角');
    });

    it('col=2 の投球 → 「真ん中」を含む実況テキスト', () => {
      const state = makeState('right');
      const pitch = makeStrikePitch(2);
      const entries = buildNarrationForPitch(state, state, pitch);
      const text = entries.map((e) => e.text).join(' ');
      expect(text).toContain('真ん中');
    });
  });

  // ── 左打者 ──
  describe('左打者 (battingSide=left)', () => {
    it('col=1 の投球 → 左打者には「外角」(ミラー反転)', () => {
      const state = makeState('left');
      const pitch = makeStrikePitch(1);
      const entries = buildNarrationForPitch(state, state, pitch);
      const text = entries.map((e) => e.text).join(' ');
      // 左打者では col=1 は外角（投手から見て右側 = 左打者の外側）
      expect(text).toContain('外角');
      expect(text).not.toContain('内角');
    });

    it('col=3 の投球 → 左打者には「内角」(ミラー反転)', () => {
      const state = makeState('left');
      const pitch = makeStrikePitch(3);
      const entries = buildNarrationForPitch(state, state, pitch);
      const text = entries.map((e) => e.text).join(' ');
      // 左打者では col=3 は内角（投手から見て左側 = 左打者の内側）
      expect(text).toContain('内角');
      expect(text).not.toContain('外角');
    });

    it('col=2 の投球 → 左打者でも「真ん中」（反転しない）', () => {
      const state = makeState('left');
      const pitch = makeStrikePitch(2);
      const entries = buildNarrationForPitch(state, state, pitch);
      const text = entries.map((e) => e.text).join(' ');
      expect(text).toContain('真ん中');
    });
  });

  // ── スイッチ打者 ──
  describe('スイッチ打者 (battingSide=switch)', () => {
    it('スイッチ打者は右打者と同じ扱い: col=1 → 「内角」', () => {
      const state = makeState('switch');
      const pitch = makeStrikePitch(1);
      const entries = buildNarrationForPitch(state, state, pitch);
      const text = entries.map((e) => e.text).join(' ');
      // switch は right と同じ基準（現在の実装）
      expect(text).toContain('内角');
    });
  });

  // ── 左右で正反対であることの確認 ──
  describe('右打者と左打者のコース表現が正反対', () => {
    it('col=1 で右と左の内外角表現が異なる', () => {
      const rightState = makeState('right');
      const leftState = makeState('left');
      const pitch = makeStrikePitch(1);

      const rightText = buildNarrationForPitch(rightState, rightState, pitch)
        .map((e) => e.text)
        .join(' ');
      const leftText = buildNarrationForPitch(leftState, leftState, pitch)
        .map((e) => e.text)
        .join(' ');

      // 右打者は内角、左打者は外角
      expect(rightText).toContain('内角');
      expect(leftText).toContain('外角');
      // 逆は含まない
      expect(rightText).not.toContain('外角');
      expect(leftText).not.toContain('内角');
    });

    it('col=3 で右と左の内外角表現が異なる', () => {
      const rightState = makeState('right');
      const leftState = makeState('left');
      const pitch = makeStrikePitch(3);

      const rightText = buildNarrationForPitch(rightState, rightState, pitch)
        .map((e) => e.text)
        .join(' ');
      const leftText = buildNarrationForPitch(leftState, leftState, pitch)
        .map((e) => e.text)
        .join(' ');

      // 右打者は外角、左打者は内角
      expect(rightText).toContain('外角');
      expect(leftText).toContain('内角');
      expect(rightText).not.toContain('内角');
      expect(leftText).not.toContain('外角');
    });
  });
});
