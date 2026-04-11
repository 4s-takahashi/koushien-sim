import Dexie, { type Table } from 'dexie';
import type { StorageAdapter, SaveData } from './adapter';
import type { SaveSlotMeta } from '../../engine/types/game-state';

class GameDatabase extends Dexie {
  saves!: Table<SaveData>;
  meta!: Table<SaveSlotMeta>;

  constructor() {
    super('koushien-sim');
    this.version(1).stores({
      saves: 'slotId',
      meta: 'slotId',
    });
  }
}

export function createIndexedDBAdapter(): StorageAdapter {
  const db = new GameDatabase();

  return {
    putSave: async (slotId, data) => { await db.saves.put(data); },
    getSave: async (slotId) => {
      const result = await db.saves.get(slotId);
      return result ?? null;
    },
    deleteSave: async (slotId) => { await db.saves.delete(slotId); },
    listMeta: async () => db.meta.toArray(),
    putMeta: async (meta) => { await db.meta.put(meta); },
    deleteMeta: async (slotId) => { await db.meta.delete(slotId); },
  };
}
