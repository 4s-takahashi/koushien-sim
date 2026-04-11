import type { StorageAdapter, SaveData } from './adapter';
import type { SaveSlotMeta } from '../../engine/types/game-state';

export function createMemoryStorageAdapter(): StorageAdapter {
  const saves = new Map<string, SaveData>();
  const metas = new Map<string, SaveSlotMeta>();

  return {
    putSave: async (slotId, data) => { saves.set(slotId, data); },
    getSave: async (slotId) => saves.get(slotId) ?? null,
    deleteSave: async (slotId) => { saves.delete(slotId); },
    listMeta: async () => Array.from(metas.values()),
    putMeta: async (meta) => { metas.set(meta.slotId, meta); },
    deleteMeta: async (slotId) => { metas.delete(slotId); },
  };
}
