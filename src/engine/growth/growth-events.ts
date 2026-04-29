/**
 * growth-events.ts — 選手成長イベント生成・適用ロジック
 * Phase S1-C C3 (2026-04-29)
 *
 * 成長イベントは稀に発生する特別な選手変化。
 * 基本確率 0.5%/日、練習継続・適性ボーナス付き。
 */

import type { RNG } from '../core/rng';
import type { Player, PitchType } from '../types/player';
import type { GameDate } from '../types/calendar';
import type { GrowthEvent, GrowthEffect } from '../types/growth';

// ============================================================
// 確率計算
// ============================================================

/**
 * 成長イベント発生確率を計算する。
 *
 * @param player              対象選手
 * @param practiceConsecutiveDays 同じ練習メニューを連続した日数（省略時 0）
 * @returns 発生確率 (0.0 - 1.0)
 */
export function calcGrowthEventProbability(
  player: Player,
  practiceConsecutiveDays = 0,
): number {
  // 基本確率 0.5%/日
  let probability = 0.005;

  // 練習継続ボーナス: 5日以上連続で +0.3%
  if (practiceConsecutiveDays >= 5) {
    probability += 0.003;
  }

  // 適性ボーナス: growthRate >= 0.7 なら +0.2%
  const growthRate = player.potential?.growthRate ?? 1.0;
  if (growthRate >= 0.7) {
    probability += 0.002;
  }

  // モチベーション高いと確率微増
  const motivation = player.motivation ?? 50;
  if (motivation >= 70) {
    probability += 0.001;
  }

  return probability;
}

/**
 * イベント発生判定。
 *
 * @param player              対象選手
 * @param practiceConsecutiveDays 練習継続日数
 * @param rng                 乱数生成器
 */
export function shouldGenerateEvent(
  player: Player,
  practiceConsecutiveDays: number,
  rng: RNG,
): boolean {
  const prob = calcGrowthEventProbability(player, practiceConsecutiveDays);
  return rng.next() < prob;
}

// ============================================================
// イベント内容生成
// ============================================================

/**
 * 対象選手に適したイベント種別を選ぶ。
 * - 投手: pitch_acquired を優先
 * - 野手: opposite_field / breakthrough を優先
 * - 怪我中: injury_recover
 * - 高疲労・低モチベ: mental_shift
 */
function selectEventType(player: Player, rng: RNG): import('../types/growth').GrowthEventType {
  const isPitcher = player.position === 'pitcher';
  const isInjured = player.condition.injury !== null;
  const motivation = player.motivation ?? 50;

  if (isInjured) return 'injury_recover';

  if (motivation <= 30) return 'mental_shift';

  if (isPitcher && rng.next() < 0.5) return 'pitch_acquired';

  const roll = rng.next();
  if (roll < 0.3) return 'opposite_field';
  if (roll < 0.7) return 'breakthrough';
  return 'mental_shift';
}

/** ランダムに変化球を選ぶ */
function pickPitchType(rng: RNG): PitchType {
  const types: PitchType[] = ['curve', 'slider', 'fork', 'changeup', 'cutter', 'sinker'];
  return types[Math.floor(rng.next() * types.length)];
}

/** 変化球の日本語名 */
function pitchTypeName(t: PitchType): string {
  const map: Record<PitchType, string> = {
    curve: 'カーブ',
    slider: 'スライダー',
    fork: 'フォーク',
    changeup: 'チェンジアップ',
    cutter: 'カット',
    sinker: 'シンカー',
  };
  return map[t];
}

/**
 * イベント本体を生成する。
 */
function buildGrowthEvent(
  player: Player,
  date: GameDate,
  rng: RNG,
): GrowthEvent {
  const type = selectEventType(player, rng);
  const id = `ge-${player.id}-${date.year}-${date.month}-${date.day}-${type}`;
  const name = `${player.lastName} ${player.firstName}`;

  switch (type) {
    case 'pitch_acquired': {
      // 既に持っていない変化球を選ぶ
      const existing = new Set(Object.keys(player.stats.pitching?.pitches ?? {}));
      const candidates: PitchType[] = ['curve', 'slider', 'fork', 'changeup', 'cutter', 'sinker']
        .filter((t) => !existing.has(t)) as PitchType[];
      const pitchType = candidates.length > 0
        ? candidates[Math.floor(rng.next() * candidates.length)]
        : pickPitchType(rng);

      return {
        id,
        playerId: player.id,
        date,
        type,
        description: `${name}が${pitchTypeName(pitchType)}を習得した！`,
        effects: [
          { statPath: 'pitching.velocity', delta: 2 },
          { statPath: 'pitching.control', delta: 1 },
          { statPath: `pitching.pitches.${pitchType}`, delta: 50 },
          { statPath: 'mentalState.confidence', delta: 5 },
        ],
      };
    }

    case 'opposite_field': {
      return {
        id,
        playerId: player.id,
        date,
        type,
        description: `${name}が流し打ちを得意にした！`,
        effects: [
          { statPath: 'batting.contact', delta: 3 },
          { statPath: 'batting.technique', delta: 2 },
          { statPath: 'mentalState.confidence', delta: 3 },
        ],
      };
    }

    case 'breakthrough': {
      // 最も低い能力を +1〜2 上げる
      const stats = player.stats;
      const pairs: Array<{ path: string; val: number }> = [
        { path: 'base.stamina', val: stats.base.stamina },
        { path: 'base.speed', val: stats.base.speed },
        { path: 'batting.contact', val: stats.batting.contact },
        { path: 'batting.power', val: stats.batting.power },
        { path: 'base.fielding', val: stats.base.fielding },
      ];
      pairs.sort((a, b) => a.val - b.val);
      const target = pairs[0];
      const delta = 1 + Math.floor(rng.next() * 2); // 1 or 2

      return {
        id,
        playerId: player.id,
        date,
        type,
        description: `${name}の調子が一段と上がった！`,
        effects: [
          { statPath: target.path, delta },
          { statPath: 'mentalState.confidence', delta: 2 },
        ],
      };
    }

    case 'injury_recover': {
      return {
        id,
        playerId: player.id,
        date,
        type,
        description: `${name}が怪我から完全に復帰した！`,
        effects: [
          { statPath: 'condition.fatigue', delta: -20 },
          { statPath: 'mentalState.confidence', delta: -2 }, // 不安残り
        ],
      };
    }

    case 'mental_shift': {
      return {
        id,
        playerId: player.id,
        date,
        type,
        description: `${name}がプレッシャーに強くなった！`,
        effects: [
          { statPath: 'mentalState.confidence', delta: 3 },
          { statPath: 'base.mental', delta: 3 },
        ],
      };
    }
  }
}

// ============================================================
// メイン: イベント生成
// ============================================================

/**
 * 全選手に対してイベント発生判定を行い、発生したイベントを返す。
 * 1日1選手1イベントまで。
 *
 * @param players 全選手リスト
 * @param date    現在の日付
 * @param rng     乱数生成器
 */
export function generateGrowthEvents(
  players: Player[],
  date: GameDate,
  rng: RNG,
): GrowthEvent[] {
  const events: GrowthEvent[] = [];
  const usedPlayers = new Set<string>(); // 1日1選手まで

  for (const player of players) {
    if (usedPlayers.has(player.id)) continue;

    const playerRng = rng.derive(player.id);
    if (shouldGenerateEvent(player, 0, playerRng)) {
      const event = buildGrowthEvent(player, date, playerRng.derive('build'));
      events.push(event);
      usedPlayers.add(player.id);
    }
  }

  return events;
}

// ============================================================
// イベント適用
// ============================================================

/**
 * 成長イベントの効果を選手に適用する。
 *
 * @param players 全選手リスト
 * @param events  適用するイベント一覧
 * @returns 更新された選手リストと適用済みイベント
 */
export function applyGrowthEvents(
  players: Player[],
  events: GrowthEvent[],
): { updatedPlayers: Player[]; appliedEvents: GrowthEvent[] } {
  const eventMap = new Map<string, GrowthEvent[]>();
  for (const evt of events) {
    const list = eventMap.get(evt.playerId) ?? [];
    list.push(evt);
    eventMap.set(evt.playerId, list);
  }

  const updatedPlayers = players.map((player) => {
    const playerEvents = eventMap.get(player.id);
    if (!playerEvents || playerEvents.length === 0) return player;

    let updated = player;
    for (const evt of playerEvents) {
      updated = applyEffects(updated, evt.effects);
    }
    return updated;
  });

  return { updatedPlayers, appliedEvents: events };
}

/**
 * GrowthEffect[] を選手に適用する。
 * statPath は ドット区切りで Player プロパティを指定。
 * 例: 'batting.contact', 'pitching.velocity', 'mentalState.confidence'
 */
function applyEffects(player: Player, effects: GrowthEffect[]): Player {
  // 深いコピーを取りながら適用
  let updated = { ...player };

  for (const effect of effects) {
    updated = applyEffect(updated, effect);
  }

  return updated;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function applyEffect(player: Player, effect: GrowthEffect): Player {
  const { statPath, delta } = effect;
  const parts = statPath.split('.');

  // 主要パスのみ対応（型安全に処理）
  if (parts[0] === 'batting' && parts.length === 2) {
    const key = parts[1] as keyof typeof player.stats.batting;
    if (key in player.stats.batting) {
      return {
        ...player,
        stats: {
          ...player.stats,
          batting: {
            ...player.stats.batting,
            [key]: clamp((player.stats.batting[key] as number) + delta),
          },
        },
      };
    }
  }

  if (parts[0] === 'pitching' && parts.length === 2 && player.stats.pitching) {
    const key = parts[1] as keyof NonNullable<typeof player.stats.pitching>;
    if (key === 'velocity' || key === 'control' || key === 'pitchStamina') {
      return {
        ...player,
        stats: {
          ...player.stats,
          pitching: {
            ...player.stats.pitching,
            [key]: clamp((player.stats.pitching[key] as number) + delta),
          },
        },
      };
    }
  }

  // pitching.pitches.<type>
  if (parts[0] === 'pitching' && parts[1] === 'pitches' && parts.length === 3 && player.stats.pitching) {
    const pitchType = parts[2] as PitchType;
    const currentVal = player.stats.pitching.pitches[pitchType] ?? 0;
    return {
      ...player,
      stats: {
        ...player.stats,
        pitching: {
          ...player.stats.pitching,
          pitches: {
            ...player.stats.pitching.pitches,
            [pitchType]: clamp(currentVal + delta),
          },
        },
      },
    };
  }

  if (parts[0] === 'base' && parts.length === 2) {
    const key = parts[1] as keyof typeof player.stats.base;
    if (key in player.stats.base) {
      return {
        ...player,
        stats: {
          ...player.stats,
          base: {
            ...player.stats.base,
            [key]: clamp((player.stats.base[key] as number) + delta),
          },
        },
      };
    }
  }

  if (parts[0] === 'mentalState' && parts.length === 2) {
    const key = parts[1] as keyof typeof player.mentalState;
    if (key === 'confidence' || key === 'stress' || key === 'teamChemistry') {
      return {
        ...player,
        mentalState: {
          ...player.mentalState,
          [key]: clamp((player.mentalState[key] as number) + delta),
        },
      };
    }
  }

  if (parts[0] === 'condition' && parts.length === 2) {
    if (parts[1] === 'fatigue') {
      return {
        ...player,
        condition: {
          ...player.condition,
          fatigue: clamp(player.condition.fatigue + delta),
        },
      };
    }
  }

  // 未対応パス: そのまま返す
  return player;
}
