/**
 * motivation.ts — 選手モチベーション計算 (Phase 11-A3 2026-04-19)
 *                  Phase S1-C C1 (2026-04-29): tickMotivation() 追加
 *
 * モチベーション: 0-100、デフォルト 50
 * - 試合出場 → +5（ホームラン +3追加、好投 +5追加）
 * - ベンチ（試合日なのに出場せず）→ -2
 * - 休養日 → +5〜+10 回復（曜日ボーナス込み）
 * - 練習日で効果あり → +2
 * - 連続練習で疲労あり → -1
 * - 日曜休息ボーナス → +3 追加
 * - 同ポジションライバル多い (同ポジション3人以上) → -1/日
 * - 疲労80以上 → -3/日
 *
 * 影響:
 * - 試合パフォーマンス: motivation >=70 で +10%, <=30 で -10%
 * - 練習効率: motivation >=70 で growth rate +20%, <=30 で -20%
 */

import type { Player, Position } from '../types/player';
import type { MatchBatterStat, MatchPitcherStat } from '../match/types';

// ============================================================
// ユーティリティ
// ============================================================

/** motivation の実効値を返す（undefined は 50 相当） */
export function getMotivation(player: Player): number {
  return player.motivation ?? 50;
}

/** motivation を 0-100 に clamp する */
function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

// ============================================================
// 日次モチベーション更新
// ============================================================

export interface DailyMotivationContext {
  /** 今日が試合日（tournament_day）かどうか */
  isMatchDay: boolean;
  /** 試合に出場したか（isMatchDay=true のとき意味を持つ） */
  didPlay: boolean;
  /** 今日が休養日（off_day）かどうか */
  isRestDay: boolean;
  /** 同じポジションの選手数（自分を含む） */
  samePositionCount: number;
  /** 現在の疲労度 */
  fatigue: number;
}

/**
 * 日次の基本モチベーション変化量を計算する。
 * 試合出場ボーナスは applyMatchMotivationBonus で別途加算。
 */
export function calcDailyMotivationDelta(ctx: DailyMotivationContext): number {
  let delta = 0;

  if (ctx.isRestDay) {
    delta += 3; // 休養日
  } else if (ctx.isMatchDay) {
    if (!ctx.didPlay) {
      delta -= 2; // ベンチ（試合日なのに出場なし）
    }
    // 出場時のボーナスは applyMatchMotivationBonus で加算
  }

  // 同ポジションライバルが3人以上（自分含む）
  if (ctx.samePositionCount >= 3) {
    delta -= 1;
  }

  // 疲労が高い
  if (ctx.fatigue >= 80) {
    delta -= 3;
  }

  return delta;
}

/**
 * 試合出場後のモチベーション変化量を計算する。
 * 試合日に出場した選手に対して呼ぶ。
 *
 * - 出場: +5
 * - ホームラン: +3追加
 * - 好投（QS以上: 6回以上 & 自責2以下）: +5追加
 */
export function calcMatchMotivationBonus(
  batterStat: MatchBatterStat | undefined,
  pitcherStat: MatchPitcherStat | undefined,
): number {
  let bonus = 5; // 出場ボーナス

  if (batterStat) {
    if (batterStat.homeRuns > 0) {
      bonus += 3; // ホームラン
    }
  }

  if (pitcherStat) {
    // 好投判定: 投球回6以上 & 自責2以下
    const ip = pitcherStat.inningsPitched;
    const er = pitcherStat.earnedRuns;
    if (ip >= 6.0 && er <= 2) {
      bonus += 5;
    }
  }

  return bonus;
}

// ============================================================
// 選手への適用
// ============================================================

/**
 * 選手の motivation を delta 分変化させ、0-100 にクランプして返す。
 */
export function applyMotivationDelta(player: Player, delta: number): Player {
  const current = getMotivation(player);
  return { ...player, motivation: clamp(current + delta) };
}

/**
 * 全選手に日次のモチベーション更新を適用する。
 *
 * @param players       全選手リスト
 * @param playedIds     今日出場した選手IDのセット（試合日のみ使用）
 * @param isMatchDay    今日が試合日かどうか
 * @param isRestDay     今日が休養日かどうか
 */
export function applyDailyMotivation(
  players: Player[],
  playedIds: Set<string>,
  isMatchDay: boolean,
  isRestDay: boolean,
): Player[] {
  // ポジション別人数を集計
  const positionCount = new Map<Position, number>();
  for (const p of players) {
    positionCount.set(p.position, (positionCount.get(p.position) ?? 0) + 1);
  }

  return players.map((player) => {
    const ctx: DailyMotivationContext = {
      isMatchDay,
      didPlay: playedIds.has(player.id),
      isRestDay,
      samePositionCount: positionCount.get(player.position) ?? 1,
      fatigue: player.condition.fatigue,
    };
    const delta = calcDailyMotivationDelta(ctx);
    return applyMotivationDelta(player, delta);
  });
}

/**
 * 試合出場選手にモチベーションボーナスを適用する。
 * result.ts の applyMatchToPlayers の後に呼ぶ。
 *
 * @param players       全選手リスト（キャリア更新済み）
 * @param batterStats   打者成績一覧
 * @param pitcherStats  投手成績一覧
 */
export function applyMatchMotivation(
  players: Player[],
  batterStats: MatchBatterStat[],
  pitcherStats: MatchPitcherStat[],
): Player[] {
  const batterMap = new Map(batterStats.map((s) => [s.playerId, s]));
  const pitcherMap = new Map(pitcherStats.map((s) => [s.playerId, s]));

  return players.map((player) => {
    const bs = batterMap.get(player.id);
    const ps = pitcherMap.get(player.id);

    // 出場選手のみボーナス付与
    if (!bs && !ps) return player;

    const bonus = calcMatchMotivationBonus(bs, ps);
    return applyMotivationDelta(player, bonus);
  });
}

// ============================================================
// 試合・練習への影響係数
// ============================================================

/**
 * モチベーションによる試合パフォーマンス補正係数を返す。
 * - motivation >= 70 → 1.10 (+10%)
 * - motivation <= 30 → 0.90 (-10%)
 * - それ以外       → 1.00
 */
export function getMatchPerformanceMultiplier(motivation: number): number {
  if (motivation >= 70) return 1.10;
  if (motivation <= 30) return 0.90;
  return 1.00;
}

/**
 * モチベーションによる練習効率補正係数を返す。
 * - motivation >= 70 → 1.20 (+20%)
 * - motivation <= 30 → 0.80 (-20%)
 * - それ以外       → 1.00
 */
export function getPracticeEfficiencyMultiplier(motivation: number): number {
  if (motivation >= 70) return 1.20;
  if (motivation <= 30) return 0.80;
  return 1.00;
}

// ============================================================
// C1: tickMotivation — world-ticker 専用の日次 motivation 更新
// ============================================================

/**
 * world-ticker から呼ばれる日次 motivation 更新コンテキスト。
 * (Phase S1-C C1 2026-04-29)
 */
export interface TickMotivationContext {
  /** 今日が休養日（off_day）か */
  isRestDay: boolean;
  /** 今日が日曜日か（0=日曜） */
  isSunday: boolean;
  /** 今日が練習日で効果が出たか */
  practiceHadEffect: boolean;
  /** 連続練習による疲労蓄積があるか（fatigue >= 60） */
  hasFatiguePressure: boolean;
  /** 同じポジションの選手数（自分含む） */
  samePositionCount: number;
  /** 現在の疲労度 */
  fatigue: number;
}

/**
 * tickMotivation — 日次 motivation 変化量を計算する。
 *
 * world-ticker.ts の全高校処理から呼ばれる。
 * day-processor.ts の applyDailyMotivation と役割を分離し、
 * world-ticker 側で確実に呼ばれることを保証する（C1 バグ修正）。
 *
 * 変化量:
 * - 休養日: +5（基本）+ isSunday ? +3 : 0 → 合計 +5〜+8
 * - 練習日で効果あり: +2
 * - 連続練習で疲労蓄積: -1
 * - 同ポジション3人以上: -1
 * - 疲労80以上: -3
 */
export function tickMotivation(ctx: TickMotivationContext): number {
  let delta = 0;

  if (ctx.isRestDay) {
    delta += 5; // 休養日基本回復
    if (ctx.isSunday) {
      delta += 3; // 日曜休息ボーナス
    }
  } else {
    // 練習日
    if (ctx.practiceHadEffect) {
      delta += 2; // 練習効果あり
    }
    if (ctx.hasFatiguePressure) {
      delta -= 1; // 連続練習・疲労蓄積
    }
  }

  // 共通ペナルティ
  if (ctx.samePositionCount >= 3) {
    delta -= 1;
  }
  if (ctx.fatigue >= 80) {
    delta -= 3;
  }

  return delta;
}

/**
 * 全選手に tickMotivation を適用する。
 * world-ticker の advanceSchoolFull / advanceSchoolStandard から呼ぶ。
 *
 * @param players     全選手リスト
 * @param isRestDay   今日が休養日か
 * @param isSunday    今日が日曜か
 * @param practiceEffectPlayerIds 練習効果が出た選手IDセット
 */
export function applyTickMotivation(
  players: Player[],
  isRestDay: boolean,
  isSunday: boolean,
  practiceEffectPlayerIds: Set<string>,
): Player[] {
  // ポジション別人数を集計
  const positionCount = new Map<import('../types/player').Position, number>();
  for (const p of players) {
    positionCount.set(p.position, (positionCount.get(p.position) ?? 0) + 1);
  }

  return players.map((player) => {
    const ctx: TickMotivationContext = {
      isRestDay,
      isSunday,
      practiceHadEffect: practiceEffectPlayerIds.has(player.id),
      hasFatiguePressure: player.condition.fatigue >= 60,
      samePositionCount: positionCount.get(player.position) ?? 1,
      fatigue: player.condition.fatigue,
    };
    const delta = tickMotivation(ctx);
    return applyMotivationDelta(player, delta);
  });
}
