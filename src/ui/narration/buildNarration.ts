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
  fastball:  'ストレート',
  slider:    'スライダー',
  curve:     'カーブ',
  curveball: 'カーブ',
  changeup:  'チェンジアップ',
  fork:      'フォーク',
  splitter:  'スプリット',
  cutter:    'カット',
  sinker:    'シンカー',
};

function pitchTypeJP(type: string): string {
  return PITCH_TYPE_JP[type] ?? type;
}

// ============================================================
// Phase 7-A-2: 投球コース → 日本語
// ============================================================

const PITCH_LOCATION_JP: Record<string, string> = {
  inside_high:    '内角高め',
  inside_middle:  '内角',
  inside_low:     '内角低め',
  middle_high:    '高め',
  middle_middle:  '真ん中',
  middle_low:     '低め',
  outside_high:   '外角高め',
  outside_middle: '外角',
  outside_low:    '外角低め',
};

/**
 * PitchLocation の row/col（0-4 の5段階グリッド）からコース日本語を返す。
 * row: 1=高め, 2=中段, 3=低め（ゾーン内）; col: 1=内角, 2=真中, 3=外角
 */
function pitchLocationJP(row: number, col: number): string {
  const r = Math.max(1, Math.min(3, row));
  const c = Math.max(1, Math.min(3, col));
  const vertical = r === 1 ? 'high' : r === 3 ? 'low' : 'middle';
  const horizontal = c === 1 ? 'inside' : c === 3 ? 'outside' : 'middle';
  const key = `${horizontal}_${vertical}`;
  return PITCH_LOCATION_JP[key] ?? '';
}

function outcomeJP(outcome: string): string {
  switch (outcome) {
    case 'called_strike': return '見逃しストライク';
    case 'swinging_strike': return '空振り';
    case 'ball': return 'ボール';
    case 'foul': return 'ファウル';
    case 'foul_bunt': return 'ファウルバント（ストライク）';
    // in_play はここには来ない想定（buildNarrationForPitch 側で
    // 打球結果に展開して表示する）。念のためのフォールバック。
    case 'in_play': return '打球';
    default: return outcome;
  }
}

// ============================================================
// 守備位置 → 日本語 (Phase 7-F: アウト実況詳細化)
// ============================================================

const POSITION_JP: Record<string, string> = {
  pitcher: '投手',
  catcher: '捕手',
  first: '一塁手',
  second: '二塁手',
  third: '三塁手',
  shortstop: '遊撃手',
  left: '左翼手',
  center: '中堅手',
  right: '右翼手',
};

function positionJP(pos: string): string {
  return POSITION_JP[pos] ?? pos;
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
    case 'strikeout': {
      // Phase 7-F: 最後の投球から空振り/見逃しを判定
      const lastPitch = atBat.pitches[atBat.pitches.length - 1];
      const strikeoutType = lastPitch?.outcome === 'swinging_strike' ? '空振り三振' : '見逃し三振';
      return { text: `⚡ ${strikeoutType}`, kind: 'out' };
    }
    case 'ground_out': {
      // Phase 7-F: どこへのゴロかを表示
      const pos = o.fielder ? positionJP(o.fielder) : '';
      return { text: pos ? `${pos}ゴロ` : 'ゴロアウト', kind: 'out' };
    }
    case 'fly_out': {
      // Phase 7-F: どこへのフライかを表示
      const pos = o.fielder ? positionJP(o.fielder) : '';
      return { text: pos ? `${pos}フライ` : 'フライアウト', kind: 'out' };
    }
    case 'line_out': {
      // Phase 7-F: ライナー方向を表示
      const pos = o.fielder ? positionJP(o.fielder) : '';
      return { text: pos ? `${pos}ライナー` : 'ライナーアウト', kind: 'out' };
    }
    case 'double_play': {
      return { text: '🔄 ゲッツー（ダブルプレー）', kind: 'out' };
    }
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

  // ── Phase 7-F: 盗塁イベントの実況（投球前に差し込む） ──
  const prevLogLen = stateBefore.log.length;
  const newLogEvents = stateAfter.log.slice(prevLogLen);
  for (const evt of newLogEvents) {
    if (evt.type === 'stolen_base') {
      entries.push({
        id: `${baseId}-steal-ok`,
        text: `🏃 盗塁成功！`,
        kind: 'highlight',
        inning: stateBefore.currentInning,
        half: stateBefore.currentHalf,
        at: Date.now(),
      });
    } else if (evt.type === 'caught_stealing') {
      entries.push({
        id: `${baseId}-steal-ng`,
        text: `❌ 盗塁失敗！タッチアウト`,
        kind: 'out',
        inning: stateBefore.currentInning,
        half: stateBefore.currentHalf,
        at: Date.now(),
      });
    }
  }

  // 打席開始時（count 0-0）は「N番 打者 登場」を前に出す
  const isAtBatStart =
    stateBefore.count.balls === 0 && stateBefore.count.strikes === 0;
  if (isAtBatStart) {
    const order = stateBefore.currentBatterIndex + 1;
    entries.push({
      id: `${baseId}-atbat-start`,
      text: `🧢 ${order}番打者 ${batter} 登場`,
      kind: 'normal',
      inning: stateBefore.currentInning,
      half: stateBefore.currentHalf,
      at: Date.now(),
    });
  }

  // ── 投球結果のテキスト生成 ──
  // in_play の場合は「インプレー」という内部用語を出さず、打球結果を直接表示する
  let resultText: string;
  let resultKind: NarrationEntry['kind'] = 'normal';
  let scoreLine: { text: string; kind: NarrationEntry['kind'] } | null = null;

  if (pitch.outcome === 'in_play' && pitch.batContact) {
    const fr = pitch.batContact.fieldResult;
    const isTop = stateBefore.currentHalf === 'top';
    const scoredRuns = isTop
      ? stateAfter.score.away - stateBefore.score.away
      : stateAfter.score.home - stateBefore.score.home;

    // 打球結果マップ（人間が読める日本語）
    const getOutText = () => {
      if (!pitch.batContact) return 'アウト';
      const ct = pitch.batContact.contactType;
      const fielder = positionJP(fr.fielder);
      if (ct === 'fly_ball' || ct === 'popup') return `${fielder}フライ`;
      if (ct === 'line_drive') return `${fielder}ライナー`;
      return `${fielder}ゴロ`;
    };

    const resultMap: Record<string, { text: string; kind: NarrationEntry['kind'] }> = {
      single: { text: 'ヒット！', kind: 'highlight' },
      double: { text: '二塁打！', kind: 'highlight' },
      triple: { text: '三塁打！！', kind: 'highlight' },
      home_run: { text: '🔥 ホームラン！！', kind: 'score' },
      error: { text: 'エラー出塁', kind: 'normal' },
      out: { text: getOutText(), kind: 'out' },
      double_play: { text: '🔄 ゲッツー！', kind: 'out' },
      sacrifice: { text: '犠打', kind: 'normal' },
      sacrifice_fly: { text: '犠牲フライ', kind: 'normal' },
    };
    const r = resultMap[fr.type] ?? { text: fr.type, kind: 'normal' as const };
    resultText = r.text;
    resultKind = r.kind;

    // 得点があれば別行で出す（目立たせる）
    if (scoredRuns > 0) {
      scoreLine = {
        text: `   ⚾ ${scoredRuns}点追加！`,
        kind: 'score',
      };
    }
  } else {
    resultText = outcomeJP(pitch.outcome);
    resultKind = 'normal';
  }

  // 1行で: 投手 → 打者: コース + 球種 + 球速 … 結果
  // 例: ⚾ 鈴木 → 田中: 内角低めのスライダー 138km/h … 空振り
  const speedKmh = Math.round(pitch.pitchSelection.velocity);
  const locationText = pitchLocationJP(
    pitch.actualLocation.row,
    pitch.actualLocation.col,
  );
  const pitchDetail = locationText
    ? `${locationText}の${pitchType} ${speedKmh}km/h`
    : `${pitchType} ${speedKmh}km/h`;

  entries.push({
    id: `${baseId}-p`,
    text: `⚾ ${pitcher} → ${batter}: ${pitchDetail} … ${resultText}`,
    kind: resultKind,
    inning: stateBefore.currentInning,
    half: stateBefore.currentHalf,
    at: Date.now(),
  });

  // 得点があれば続けて
  if (scoreLine) {
    entries.push({
      id: `${baseId}-score`,
      text: scoreLine.text,
      kind: scoreLine.kind,
      inning: stateBefore.currentInning,
      half: stateBefore.currentHalf,
      at: Date.now(),
    });
  }

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
  const pitchCount = atBat.pitches.length;

  // ── Phase 7-F: 盗塁イベントの実況（打席ログより前に差し込む） ──
  // stateAfter.log に stolen_base / caught_stealing イベントがあれば実況追加
  const prevLogLen = stateBefore.log.length;
  const newLogEvents = stateAfter.log.slice(prevLogLen);
  for (const evt of newLogEvents) {
    if (evt.type === 'stolen_base') {
      entries.push({
        id: `${baseId}-steal-ok`,
        text: `🏃 盗塁成功！`,
        kind: 'highlight',
        inning: stateBefore.currentInning,
        half: stateBefore.currentHalf,
        at: Date.now(),
      });
    } else if (evt.type === 'caught_stealing') {
      entries.push({
        id: `${baseId}-steal-ng`,
        text: `❌ 盗塁失敗！タッチアウト`,
        kind: 'out',
        inning: stateBefore.currentInning,
        half: stateBefore.currentHalf,
        at: Date.now(),
      });
    }
  }

  // 打席開始 + 投球数（1行にまとめる。ログが縦に長くなりすぎないよう）
  entries.push({
    id: `${baseId}-start`,
    text: `🧢 ${ordinalJP(order)}打者 ${batter} vs ${pitcher}${pitchCount > 0 ? `（${pitchCount}球）` : ''}`,
    kind: 'normal',
    inning: stateBefore.currentInning,
    half: stateBefore.currentHalf,
    at: Date.now(),
  });

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
