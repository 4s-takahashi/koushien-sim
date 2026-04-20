/**
 * src/engine/psyche/generator.ts
 *
 * Phase 7-B: generatePitchMonologues() 実装
 *
 * PitchContext に基づき、MonologuePattern DB から
 * 打者 / 投手 / 捕手それぞれ最大1パターンを選択して返す。
 */

import type {
  PitchContext,
  PitchMonologues,
  MonologuePattern,
  MonologueEntry,
  SituationCondition,
  OrderCondition,
  CountCondition,
} from './types';
import { MONOLOGUE_DB } from './monologue-db';
import type { TraitId } from '../types/player';

// ============================================================
// 条件マッチング
// ============================================================

function matchSituation(cond: SituationCondition, ctx: PitchContext): boolean {
  if (cond.half !== undefined && cond.half !== 'any' && cond.half !== ctx.half) return false;

  if (cond.inning !== undefined) {
    if (cond.inning.min !== undefined && ctx.inning < cond.inning.min) return false;
    if (cond.inning.max !== undefined && ctx.inning > cond.inning.max) return false;
  }

  if (cond.outs !== undefined && cond.outs !== 'any' && cond.outs !== ctx.outs) return false;

  if (cond.runnersOn !== undefined && cond.runnersOn !== 'any') {
    if (cond.runnersOn !== ctx.runnersOn) return false;
  }

  if (cond.scoreDiff !== undefined) {
    const role = cond.scoreDiff.role;
    if (role !== 'any') {
      const sdRole: 'leading' | 'tied' | 'trailing' =
        ctx.scoreDiff > 0 ? 'leading' : ctx.scoreDiff < 0 ? 'trailing' : 'tied';
      if (role !== sdRole) return false;
    }
    if (cond.scoreDiff.by !== undefined) {
      if (Math.abs(ctx.scoreDiff) < cond.scoreDiff.by) return false;
    }
  }

  if (cond.isKoshien !== undefined && cond.isKoshien !== ctx.isKoshien) return false;

  return true;
}

function matchTraits(
  traitMatch: TraitId[] | undefined,
  traitExclude: TraitId[] | undefined,
  playerTraits: TraitId[],
): boolean {
  if (traitMatch !== undefined && traitMatch.length > 0) {
    const hasAll = traitMatch.every((t) => playerTraits.includes(t));
    if (!hasAll) {
      // AND ではなく OR でマッチ（いずれかを持てば OK）
      const hasAny = traitMatch.some((t) => playerTraits.includes(t));
      if (!hasAny) return false;
    }
  }
  if (traitExclude !== undefined && traitExclude.length > 0) {
    const hasExcluded = traitExclude.some((t) => playerTraits.includes(t));
    if (hasExcluded) return false;
  }
  return true;
}

function matchOrder(cond: OrderCondition | undefined, ctx: PitchContext): boolean {
  if (cond === undefined) return true;
  if (cond.type === 'any') return true;
  if (ctx.orderType === null) {
    // 采配なし → 「none」 order 指定のパターンはマッチしない
    return false;
  }
  if (cond.type !== ctx.orderType) return false;
  if (cond.focusArea !== undefined && cond.focusArea !== ctx.orderFocusArea) return false;
  return true;
}

function matchCount(cond: CountCondition | undefined, ctx: PitchContext): boolean {
  if (cond === undefined) return true;
  if (cond.balls !== undefined && cond.balls !== ctx.balls) return false;
  if (cond.strikes !== undefined && cond.strikes !== ctx.strikes) return false;
  return true;
}

function matchStamina(pattern: MonologuePattern, ctx: PitchContext): boolean {
  if (pattern.staminaBelow !== undefined && ctx.pitcherStamina >= pattern.staminaBelow) return false;
  if (pattern.staminaAbove !== undefined && ctx.pitcherStamina < pattern.staminaAbove) return false;
  return true;
}

function filterPatterns(
  patterns: MonologuePattern[],
  ctx: PitchContext,
  playerTraits: TraitId[],
): MonologuePattern[] {
  return patterns.filter((p) => {
    if (!matchSituation(p.situation, ctx)) return false;
    if (!matchTraits(p.traitMatch, p.traitExclude, playerTraits)) return false;
    if (!matchOrder(p.orderMatch, ctx)) return false;
    if (!matchCount(p.countCondition, ctx)) return false;
    if (!matchStamina(p, ctx)) return false;
    return true;
  });
}

// ============================================================
// 重み付き選択
// ============================================================

function weightedPick(candidates: MonologuePattern[]): MonologuePattern | null {
  if (candidates.length === 0) return null;
  const total = candidates.reduce((sum, p) => sum + p.weight, 0);
  // 決定論的ではなく Math.random() を使用（試合状態非依存）
  const r = Math.random() * total;
  let acc = 0;
  for (const p of candidates) {
    acc += p.weight;
    if (r <= acc) return p;
  }
  return candidates[candidates.length - 1];
}

// ============================================================
// MonologueEntry 構築
// ============================================================

function toEntry(pattern: MonologuePattern): MonologueEntry {
  return {
    role: pattern.role,
    text: pattern.text,
    effectSummary: pattern.mentalEffect.summary,
  };
}

// ============================================================
// 公開 API
// ============================================================

/**
 * 1球ごとのモノローグを生成する。
 *
 * @param ctx 投球コンテキスト
 * @returns 打者 / 投手 / 捕手 それぞれのモノローグ（該当なしは null）
 */
export function generatePitchMonologues(ctx: PitchContext): PitchMonologues {
  const batterPatterns = MONOLOGUE_DB.filter((p) => p.role === 'batter');
  const pitcherPatterns = MONOLOGUE_DB.filter((p) => p.role === 'pitcher');
  const catcherPatterns = MONOLOGUE_DB.filter((p) => p.role === 'catcher');

  const batterCandidates = filterPatterns(batterPatterns, ctx, ctx.batterTraits);
  const pitcherCandidates = filterPatterns(pitcherPatterns, ctx, ctx.pitcherTraits);
  const catcherCandidates = filterPatterns(catcherPatterns, ctx, ctx.pitcherTraits); // 捕手特性は投手と同軍と仮定

  const batterPick = weightedPick(batterCandidates);
  const pitcherPick = weightedPick(pitcherCandidates);
  const catcherPick = weightedPick(catcherCandidates);

  return {
    batter: batterPick ? toEntry(batterPick) : null,
    pitcher: pitcherPick ? toEntry(pitcherPick) : null,
    catcher: catcherPick ? toEntry(catcherPick) : null,
  };
}

/**
 * モノローグパターンのメンタル補正を取得する。
 * match-store.ts からコンテキストに応じた補正値参照に使用。
 */
export function getMonologueEffect(pattern: MonologuePattern) {
  return pattern.mentalEffect;
}
