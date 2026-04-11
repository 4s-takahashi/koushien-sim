import type { GameState, SaveSlotMeta } from '../types/game-state';
import type { StorageAdapter } from '../../platform/storage/adapter';
import { serialize, deserialize, computeChecksum, validateSaveData } from './serializer';

export const CURRENT_SAVE_VERSION = '1.0.0';
export const AUTO_SAVE_SLOT = 'auto';

export function createSaveManager(storage: StorageAdapter) {
  async function saveGame(slotId: string, state: GameState): Promise<void> {
    const json = serialize(state);
    const checksum = await computeChecksum(json);

    await storage.putSave(slotId, { slotId, state: json, checksum });

    const meta: SaveSlotMeta = {
      slotId,
      schoolName: state.team.name,
      currentDate: state.currentDate,
      playTimeMinutes: 0, // TODO: track play time
      savedAt: Date.now(),
      version: state.version,
    };
    await storage.putMeta(meta);
  }

  async function loadGame(slotId: string): Promise<GameState | null> {
    const saveData = await storage.getSave(slotId);
    if (!saveData) return null;

    // Verify checksum
    const expectedChecksum = await computeChecksum(saveData.state);
    if (expectedChecksum !== saveData.checksum) {
      console.warn(`Checksum mismatch for slot ${slotId} - data may be corrupted`);
      // Still attempt to load
    }

    const state = deserialize(saveData.state);
    return state;
  }

  async function deleteSave(slotId: string): Promise<void> {
    await storage.deleteSave(slotId);
    await storage.deleteMeta(slotId);
  }

  async function listSaves(): Promise<SaveSlotMeta[]> {
    return storage.listMeta();
  }

  async function exportSave(slotId: string): Promise<string> {
    const saveData = await storage.getSave(slotId);
    if (!saveData) throw new Error(`No save data in slot ${slotId}`);
    const json = JSON.stringify(saveData);
    // btoa doesn't handle multi-byte characters (e.g. Japanese)
    // Use TextEncoder + Uint8Array → base64
    const bytes = new TextEncoder().encode(json);
    const binStr = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    return btoa(binStr);
  }

  async function importSave(slotId: string, encoded: string): Promise<void> {
    const binStr = atob(encoded);
    const bytes = Uint8Array.from(binStr, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const saveData = JSON.parse(json);

    if (!saveData.state || typeof saveData.state !== 'string') {
      throw new Error('Invalid export data');
    }

    // Validate the state
    const parsed = JSON.parse(saveData.state);
    if (!validateSaveData(parsed)) {
      throw new Error('Invalid game state in export data');
    }

    await storage.putSave(slotId, { ...saveData, slotId });

    const state = parsed as GameState;
    const meta: SaveSlotMeta = {
      slotId,
      schoolName: state.team.name,
      currentDate: state.currentDate,
      playTimeMinutes: 0,
      savedAt: Date.now(),
      version: state.version,
    };
    await storage.putMeta(meta);
  }

  async function autoSave(state: GameState): Promise<void> {
    await saveGame(AUTO_SAVE_SLOT, state);
  }

  return {
    saveGame,
    loadGame,
    deleteSave,
    listSaves,
    exportSave,
    importSave,
    autoSave,
  };
}

export type SaveManager = ReturnType<typeof createSaveManager>;
