/**
 * buildNarration.ts — 試合実況テキスト生成
 *
 * MatchRunner の進行結果 (pitchResult / atBatResult) から、
 * UI に表示する日本語実況テキストを組み立てる。
 */

import type { MatchState, PitchResult, AtBatResult } from '../../engine/match/types';

export interface NarrationEntry {
  /** 一意 ID（ログの key に使う） */
  id: string;
  /** 実況テキスト */
  text: string;
  /** 種別：普通 / 重要 / 得点 / アウト / チャンス */
  kind: 'normal' | 'highlight' | 'score' | 'out' | 'chance';
  /** イニング (1-9) */
  inning: number;
  /** 表/裏 */
  half: 'top' | 'bottom';
  /** 実況発生時刻（ms） */
  at: number;
}

// ============================================================
// 球種・コース → 日本語
// ============================================================

const PITCH_TYPE_JP: Record<string, string> = {
  fastball: 'ストレート',
  slider: 'スライダー',
  curve: 'カーブ',
  changeup: 'チェンジアップ',
  fork: 'フォーク',
};

function pitchTypeJP(type: string): string {
  return PITCH_TYPE_JP[type] ?? type;
}

function outcomeJP(outcome: string): string {
  switch (outcome) {
    case 'called_strike': return '見逃しストライク';
    case 'swinging_strike': return '空振り';
    case 'ball': return 'ボール';
    case 'foul': return 'ファウル';
    case 'foul_bunt': return 'ファウルバント（ストライク）';
    case 'in_play': return 'インプレー';
    default: return outcome;
  }
}

// ============================================================
// 打席結果 → 日本語
// ============================================================

function batResultJP(atBat: AtBatResult): { text: string; kind: NarrationEntry['kind'] } {
  const o = atBat.outcome;
  switch (o.type) {
    case 'single':        return { text: 'ヒット！', kind: 'highlight' };
    case 'double':        return { text: '二塁打！', kind: 'highlight' };
    case 'triple':        return { text: '三塁打！！', kind: 'highlight' };
    case 'home_run':      return { text: '🔥 ホームラン！！', kind: 'score' };
    case 'walk':          return { text: 'フォアボール', kind: 'normal' };
    case 'intentional_walk': return { text: '敬遠', kind: 'normal' };
    case 'hit_by_pitch':  return { text: '死球', kind: 'normal' };
    case 'strikeout':     return { text: '⚡ 三振', kind: 'out' };
    case 'ground_out':    return { text: 'ゴロアウト', kind: 'out' };
    case 'fly_out':       return { text: 'フライアウト', kind: 'out' };
    case 'line_out':      return { text: 'ライナーアウト', kind: 'out' };
    case 'double_play':   return { text: 'ダブルプレー', kind: 'out' };
    case 'error':         return { text: 'エラー出塁', kind: 'normal' };
    case 'sacrifice_bunt': return { text: '犠打成功', kind: 'normal' };
    case 'sacrifice_fly':  return { text: '犠牲フライ', kind: 'normal' };
  }
  // 全てのケースを網羅したので、ここには到達しない（型的には never）
  return { text: '打席終了', kind: 'normal' };
}

// ============================================================
// 打者・投手名の取得
// ============================================================

function getBatterName(state: MatchState): string {
  const team = state.currentHalf === 'top' ? state.awayTeam : state.homeTeam;
  const id = team.battingOrder[state.currentBatterIndex];
  const mp = team.players.find((p) => p.player.id === id);
  if (!mp) return '不明';
  return `${mp.player.lastName}`;
}

function getPitcherName(state: MatchState): string {
  const team = state.currentHalf === 'top' ? state.homeTeam : state.awayTeam;
  const mp = team.players.find((p) => p.player.id === team.currentPitcherId);
  if (!mp) return '不明';
  return `${mp.player.lastName}`;
}

function ordinalJP(n: number): string {
  return `${n}番`;
}

function halfLabel(half: 'top' | 'bottom'): string {
  return half === 'top' ? '表' : '裏';
}

// ============================================================
// 1球の実況
// ============================================================

export function buildNarrationForPitch(
  stateBefore: MatchState,
  stateAfter: MatchState,
  pitch: PitchResult,
): NarrationEntry[] {
  const entries: NarrationEntry[] = [];
  const baseId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const batter = getBatterName(stateBefore);
  const pitcher = getPitcherName(stateBefore);
  const pitchType = pitchTypeJP(pitch.pitchSelection.type);
  const outcomeText = outcomeJP(pitch.outcome);

  entries.push({
    id: `${baseId}-p`,
    text: `⚾ ${pitcher} → ${batter}: ${pitchType} … ${outcomeText}`,
    kind: pitch.outcome === 'in_play' ? 'highlight' : 'normal',
    inning: stateBefore.currentInning,
    half: stateBefore.currentHalf,
    at: Date.now(),
  });

  // アウトが増えた場合（三振・インプレーアウト等）
  if (stateAfter.outs > stateBefore.outs) {
    const addOuts = stateAfter.outs - stateBefore.outs;
    // 3アウトに到達した時は switchHalfInning で outs が 0 にリセットされるので
    // stateAfter.outs < stateBefore.outs になるケースも次でハンドル
    entries.push({
      id: `${baseId}-out`,
      text: `   ${addOuts === 2 ? 'ダブルプレー！' : ''} → ${stateAfter.outs}アウト`,
      kind: 'out',
      inning: stateBefore.currentInning,
      half: stateBefore.currentHalf,
      at: Date.now(),
    });
  }

  // 攻守交代判定（3アウトでチェンジした場合、outs は 0 にリセットされている）
  const halfChanged = stateBefore.currentHalf !== stateAfter.currentHalf;
  const inningChanged = stateBefore.currentInning !== stateAfter.currentInning;

  if (halfChanged || inningChanged) {
    entries.push({
      id: `${baseId}-change`,
      text: `━━━ 🔁 3アウト・チェンジ ━━━`,
      kind: 'highlight',
      inning: stateBefore.currentInning,
      half: stateBefore.currentHalf,
      at: Date.now(),
    });

    if (stateAfter.isOver) {
      entries.push({
        id: `${baseId}-gameover`,
        text: `🏆 ゲームセット！ ${stateAfter.score.away} - ${stateAfter.score.home}`,
        kind: 'score',
        inning: stateAfter.currentInning,
        half: stateAfter.currentHalf,
        at: Date.now(),
      });
    } else {
      const inn = stateAfter.currentInning;
      const hl = halfLabel(stateAfter.currentHalf);
      entries.push({
        id: `${baseId}-half`,
        text: `⚾ ${inn}回${hl}の攻撃 開始`,
        kind: 'highlight',
        inning: stateAfter.currentInning,
        half: stateAfter.currentHalf,
        at: Date.now(),
      });
    }
  }

  return entries;
}

// ============================================================
// 1打席の実況
// ============================================================

export function buildNarrationForAtBat(
  stateBefore: MatchState,
  stateAfter: MatchState,
  atBat: AtBatResult,
): NarrationEntry[] {
  const entries: NarrationEntry[] = [];
  const baseId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const batter = getBatterName(stateBefore);
  const pitcher = getPitcherName(stateBefore);
  const order = stateBefore.currentBatterIndex + 1;

  // 打席開始
  entries.push({
    id: `${baseId}-start`,
    text: `🧢 ${ordinalJP(order)}打者 ${batter} 登場`,
    kind: 'normal',
    inning: stateBefore.currentInning,
    half: stateBefore.currentHalf,
    at: Date.now(),
  });

  // 投球要約（球数のみ簡潔に）
  const pitchCount = atBat.pitches.length;
  if (pitchCount > 0) {
    entries.push({
      id: `${baseId}-pitches`,
      text: `   ${pitcher} 投球 ${pitchCount}球`,
      kind: 'normal',
      inning: stateBefore.currentInning,
      half: stateBefore.currentHalf,
      at: Date.now(),
    });
  }

  // 結果
  const { text: resultText, kind } = batResultJP(atBat);

  // 得点があった場合
  const isTop = stateBefore.currentHalf === 'top';
  const scoredRuns = isTop
    ? (stateAfter.score.away - stateBefore.score.away)
    : (stateAfter.score.home - stateBefore.score.home);
  const scoreText = scoredRuns > 0 ? ` ${scoredRuns}点追加！` : '';

  entries.push({
    id: `${baseId}-result`,
    text: `   → ${resultText}${scoreText}`,
    kind: scoredRuns > 0 ? 'score' : kind,
    inning: stateBefore.currentInning,
    half: stateBefore.currentHalf,
    at: Date.now(),
  });

  // 攻守交代（3アウト・イニング交代）
  const halfChanged = stateBefore.currentHalf !== stateAfter.currentHalf;
  const inningChanged = stateBefore.currentInning !== stateAfter.currentInning;

  if (halfChanged || inningChanged) {
    // 3アウト・チェンジ（目立たせる：highlight）
    entries.push({
      id: `${baseId}-change`,
      text: `━━━ 🔁 3アウト・チェンジ ━━━`,
      kind: 'highlight',
      inning: stateBefore.currentInning,
      half: stateBefore.currentHalf,
      at: Date.now(),
    });

    // 試合終了チェック
    if (stateAfter.isOver) {
      entries.push({
        id: `${baseId}-gameover`,
        text: `🏆 ゲームセット！ ${stateAfter.score.away} - ${stateAfter.score.home}`,
        kind: 'score',
        inning: stateAfter.currentInning,
        half: stateAfter.currentHalf,
        at: Date.now(),
      });
    } else {
      // 次のイニングへ
      const inn = stateAfter.currentInning;
      const hl = halfLabel(stateAfter.currentHalf);
      entries.push({
        id: `${baseId}-half`,
        text: `⚾ ${inn}回${hl}の攻撃 開始`,
        kind: 'highlight',
        inning: stateAfter.currentInning,
        half: stateAfter.currentHalf,
        at: Date.now(),
      });
    }
  }

  return entries;
}
