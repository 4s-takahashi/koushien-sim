import type { GameState } from '../types/game-state';

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState {
  try {
    const data = JSON.parse(json);
    if (!validateSaveData(data)) {
      throw new Error('Invalid save data structure');
    }
    return data as GameState;
  } catch (e) {
    throw new Error(`Failed to deserialize save data: ${e}`);
  }
}

export function validateSaveData(data: unknown): data is GameState {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;

  if (typeof d.version !== 'string') return false;
  if (typeof d.seed !== 'string') return false;
  if (typeof d.currentDate !== 'object' || d.currentDate === null) return false;
  if (typeof d.team !== 'object' || d.team === null) return false;
  if (typeof d.manager !== 'object' || d.manager === null) return false;
  if (!Array.isArray(d.graduates)) return false;
  if (typeof d.settings !== 'object' || d.settings === null) return false;

  return true;
}

/** Compute SHA-256 checksum using Web Crypto API */
export async function computeChecksum(json: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(json);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback: simple hash for environments without crypto.subtle
    let hash = 0;
    for (let i = 0; i < json.length; i++) {
      const char = json.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}

/** Migrate save data from old versions (placeholder for future use) */
export function migrateSaveData(data: unknown, fromVersion: string): GameState {
  // Currently no migrations needed
  if (!validateSaveData(data)) {
    throw new Error(`Cannot migrate invalid save data from version ${fromVersion}`);
  }
  return data as GameState;
}
