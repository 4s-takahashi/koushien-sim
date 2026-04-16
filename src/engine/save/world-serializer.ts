/**
 * world-serializer — WorldState のシリアライズ / デシリアライズ
 *
 * WorldState は Map 型フィールドを含むため、JSON.stringify/parse だけでは
 * 往復変換できない。Map → オブジェクト変換を行うカスタムシリアライザ。
 */

import type { WorldState, ScoutState } from '../world/world-state';
import type { PersonRegistry } from '../world/person-state';

// ============================================================
// Map ↔ プレーンオブジェクト変換
// ============================================================

function mapToObj<V>(m: Map<string, V>): Record<string, V> {
  const obj: Record<string, V> = {};
  for (const [k, v] of m) {
    obj[k] = v;
  }
  return obj;
}

function objToMap<V>(obj: Record<string, V>): Map<string, V> {
  return new Map(Object.entries(obj));
}

// ============================================================
// ScoutState シリアライズ
// ============================================================

interface SerializedScoutState {
  watchList: string[];
  scoutReports: Record<string, unknown>;
  recruitAttempts: Record<string, unknown>;
  monthlyScoutBudget: number;
  usedScoutThisMonth: number;
}

function serializeScoutState(s: ScoutState): SerializedScoutState {
  return {
    watchList: s.watchList,
    scoutReports: mapToObj(s.scoutReports),
    recruitAttempts: mapToObj(s.recruitAttempts),
    monthlyScoutBudget: s.monthlyScoutBudget,
    usedScoutThisMonth: s.usedScoutThisMonth,
  };
}

function deserializeScoutState(s: SerializedScoutState): ScoutState {
  return {
    watchList: s.watchList ?? [],
    scoutReports: objToMap(s.scoutReports ?? {}) as ScoutState['scoutReports'],
    recruitAttempts: objToMap(s.recruitAttempts ?? {}) as ScoutState['recruitAttempts'],
    monthlyScoutBudget: s.monthlyScoutBudget ?? 4,
    usedScoutThisMonth: s.usedScoutThisMonth ?? 0,
  };
}

// ============================================================
// PersonRegistry シリアライズ
// ============================================================

interface SerializedPersonRegistry {
  entries: Record<string, unknown>;
}

function serializePersonRegistry(r: PersonRegistry): SerializedPersonRegistry {
  return { entries: mapToObj(r.entries) };
}

function deserializePersonRegistry(r: SerializedPersonRegistry): PersonRegistry {
  return { entries: objToMap(r.entries ?? {}) as PersonRegistry['entries'] };
}

// ============================================================
// WorldState シリアライズ全体
// ============================================================

/** JSON.stringify 可能な形式に変換した WorldState */
type SerializableWorldState = Omit<WorldState, 'scoutState' | 'personRegistry'> & {
  scoutState: SerializedScoutState;
  personRegistry: SerializedPersonRegistry;
};

export function serializeWorldState(state: WorldState): string {
  const serializable: SerializableWorldState = {
    ...state,
    scoutState: serializeScoutState(state.scoutState),
    personRegistry: serializePersonRegistry(state.personRegistry),
  };
  return JSON.stringify(serializable);
}

export function deserializeWorldState(json: string): WorldState {
  const raw = JSON.parse(json) as SerializableWorldState;

  // Map フィールドを復元
  const scoutState = deserializeScoutState(raw.scoutState as SerializedScoutState);
  const personRegistry = deserializePersonRegistry(raw.personRegistry as SerializedPersonRegistry);

  return {
    ...raw,
    scoutState,
    personRegistry,
  } as WorldState;
}

// ============================================================
// バリデーション
// ============================================================

export function validateWorldSaveData(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;

  if (typeof d.version !== 'string') return false;
  if (typeof d.seed !== 'string') return false;
  if (typeof d.playerSchoolId !== 'string') return false;
  if (typeof d.currentDate !== 'object' || d.currentDate === null) return false;
  if (!Array.isArray(d.schools)) return false;
  if (typeof d.manager !== 'object' || d.manager === null) return false;
  if (typeof d.seasonState !== 'object' || d.seasonState === null) return false;
  if ((d.schools as unknown[]).length === 0) return false;

  return true;
}

/** SHA-256 チェックサム（Web Crypto API / フォールバック） */
export async function computeWorldChecksum(json: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(json);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let hash = 0;
    for (let i = 0; i < json.length; i++) {
      const char = json.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}
