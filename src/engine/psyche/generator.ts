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
  MentalEffect,
  SituationCondition,
  OrderCondition,
  CountCondition,
} from './types';
import { MONOLOGUE_DB } from './monologue-db';
import type { TraitId } from '../types/player';

// ============================================================
// Phase 7-E1: MentalEffect 集計用の拡張戻り値
// ============================================================

/**
 * generatePitchMonologues の拡張戻り値。
 * 通常のモノローグエントリに加え、集計したメンタル補正効果と選択されたIDを返す。
 */
export interface PitchMonologuesWithEffects extends PitchMonologues {
  /** 打者に適用される全メンタル補正の合計 */
  batterEffects: MentalEffect[];
  /** 投手に適用される全メンタル補正の合計 */
  pitcherEffects: MentalEffect[];
  /** Phase 7-E3: 今回選ばれたパターンの ID 一覧（重複回避用） */
  pickedIds: string[];
}

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

/**
 * 重み付きランダム選択。
 * @param candidates 選択候補
 * @param excludeIds Phase 7-E3: 除外するパターン ID セット（連続重複回避）
 *   全候補が除外される場合は excludeIds を無視してフォールバック。
 */
function weightedPick(
  candidates: MonologuePattern[],
  excludeIds?: ReadonlySet<string>,
): MonologuePattern | null {
  if (candidates.length === 0) return null;

  // Phase 7-E3: 除外フィルタリング
  let filtered = candidates;
  if (excludeIds && excludeIds.size > 0) {
    const nonExcluded = candidates.filter((p) => !excludeIds.has(p.id));
    // 全候補が除外される場合はフォールバック（除外を無視）
    if (nonExcluded.length > 0) {
      filtered = nonExcluded;
    }
  }

  const total = filtered.reduce((sum, p) => sum + p.weight, 0);
  // 決定論的ではなく Math.random() を使用（試合状態非依存）
  const r = Math.random() * total;
  let acc = 0;
  for (const p of filtered) {
    acc += p.weight;
    if (r <= acc) return p;
  }
  return filtered[filtered.length - 1];
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
 * @param excludeIds Phase 7-E3: 連続重複回避のための除外 ID セット（省略可）
 * @returns 打者 / 投手 / 捕手 それぞれのモノローグ + メンタル補正効果
 */
export function generatePitchMonologues(
  ctx: PitchContext,
  excludeIds?: ReadonlySet<string>,
): PitchMonologuesWithEffects {
  const batterPatterns = MONOLOGUE_DB.filter((p) => p.role === 'batter');
  const pitcherPatterns = MONOLOGUE_DB.filter((p) => p.role === 'pitcher');
  const catcherPatterns = MONOLOGUE_DB.filter((p) => p.role === 'catcher');

  const batterCandidates = filterPatterns(batterPatterns, ctx, ctx.batterTraits);
  const pitcherCandidates = filterPatterns(pitcherPatterns, ctx, ctx.pitcherTraits);
  const catcherCandidates = filterPatterns(catcherPatterns, ctx, ctx.pitcherTraits); // 捕手特性は投手と同軍と仮定

  const batterPick = weightedPick(batterCandidates, excludeIds);
  const pitcherPick = weightedPick(pitcherCandidates, excludeIds);
  const catcherPick = weightedPick(catcherCandidates, excludeIds);

  // Phase 7-E1: メンタル補正効果を収集する
  // - 打者モノローグ（batter/catcher は打者側の補正に含める）
  // - 投手モノローグは投手側
  const batterEffects: MentalEffect[] = [];
  const pitcherEffects: MentalEffect[] = [];

  if (batterPick) batterEffects.push(batterPick.mentalEffect);
  if (catcherPick) batterEffects.push(catcherPick.mentalEffect); // 捕手のサインも打者に影響
  if (pitcherPick) pitcherEffects.push(pitcherPick.mentalEffect);

  // Phase 7-E3: 選ばれたパターンの ID を収集
  const pickedIds: string[] = [];
  if (batterPick) pickedIds.push(batterPick.id);
  if (pitcherPick) pickedIds.push(pitcherPick.id);
  if (catcherPick) pickedIds.push(catcherPick.id);

  return {
    batter: batterPick ? toEntry(batterPick) : null,
    pitcher: pitcherPick ? toEntry(pitcherPick) : null,
    catcher: catcherPick ? toEntry(catcherPick) : null,
    batterEffects,
    pitcherEffects,
    pickedIds,
  };
}

/**
 * モノローグパターンのメンタル補正を取得する。
 * match-store.ts からコンテキストに応じた補正値参照に使用。
 */
export function getMonologueEffect(pattern: MonologuePattern) {
  return pattern.mentalEffect;
}

// ============================================================
// Phase 7-E1: MentalEffect → MatchOverrides 変換
// ============================================================

/**
 * MentalEffect の配列を集計して、打者側の MatchOverrides を構築する。
 * 複数のモノローグがある場合は各補正を加算する（上限クリップは runner 側で行う）。
 */
export function buildBatterOverridesFromEffects(
  effects: MentalEffect[],
): { contactBonus: number; powerBonus: number; swingAggressionBonus: number } {
  let contactBonus = 0;
  let powerBonus = 0;
  let swingAggressionBonus = 0;

  for (const e of effects) {
    // contactMultiplier: 1.0 = 変化なし、1.1 = +10% → bonus = mult - 1
    if (e.contactMultiplier !== undefined) {
      contactBonus += e.contactMultiplier - 1;
    }
    // powerMultiplier: 同上
    if (e.powerMultiplier !== undefined) {
      powerBonus += e.powerMultiplier - 1;
    }
    // batterFocusDisrupt: 集中乱れ → ミート/パワーにマイナス補正
    if (e.batterFocusDisrupt) {
      contactBonus -= 0.08;
      powerBonus -= 0.05;
    }
    // eyeMultiplier が高い（選球眼アップ）→ 積極性を下げる（ボール球を振りにくくする）
    if (e.eyeMultiplier !== undefined) {
      swingAggressionBonus -= (e.eyeMultiplier - 1) * 0.5;
    }
  }

  return { contactBonus, powerBonus, swingAggressionBonus };
}

/**
 * MentalEffect の配列を集計して、投手側の MatchOverrides を構築する。
 */
export function buildPitcherOverridesFromEffects(
  effects: MentalEffect[],
): { velocityBonus: number; controlBonus: number } {
  let velocityBonus = 0;
  let controlBonus = 0;

  for (const e of effects) {
    if (e.velocityBonus !== undefined) {
      velocityBonus += e.velocityBonus;
    }
    if (e.controlMultiplier !== undefined) {
      controlBonus += e.controlMultiplier - 1;
    }
  }

  return { velocityBonus, controlBonus };
}

/**
 * モノローグの効果から ignoreOrder フラグを持つものがあるかチェックする。
 */
export function hasIgnoreOrderEffect(effects: MentalEffect[]): boolean {
  return effects.some((e) => e.ignoreOrder === true);
}
