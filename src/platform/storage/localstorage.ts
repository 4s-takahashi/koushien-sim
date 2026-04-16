/**
 * localStorage ストレージアダプター
 *
 * ブラウザの localStorage を使用するアダプター実装。
 * Next.js の場合 client-side only なので SSR 時は no-op。
 */

import type { StorageAdapter, SaveData } from './adapter';
import type { SaveSlotMeta } from '../../engine/types/game-state';

const KEY_PREFIX = 'koushien_gs_';
const META_KEY = 'koushien_gs_meta';

function isAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem('__ls_test__', '1');
    localStorage.removeItem('__ls_test__');
    return true;
  } catch {
    return false;
  }
}

export function createLocalStorageAdapter(): StorageAdapter {
  function loadMetas(): SaveSlotMeta[] {
    if (!isAvailable()) return [];
    try {
      const raw = localStorage.getItem(META_KEY);
      return raw ? (JSON.parse(raw) as SaveSlotMeta[]) : [];
    } catch {
      return [];
    }
  }

  function saveMetas(metas: SaveSlotMeta[]): void {
    if (!isAvailable()) return;
    localStorage.setItem(META_KEY, JSON.stringify(metas));
  }

  return {
    putSave: async (slotId, data) => {
      if (!isAvailable()) return;
      localStorage.setItem(KEY_PREFIX + slotId, JSON.stringify(data));
    },

    getSave: async (slotId) => {
      if (!isAvailable()) return null;
      const raw = localStorage.getItem(KEY_PREFIX + slotId);
      return raw ? (JSON.parse(raw) as SaveData) : null;
    },

    deleteSave: async (slotId) => {
      if (!isAvailable()) return;
      localStorage.removeItem(KEY_PREFIX + slotId);
    },

    listMeta: async () => loadMetas(),

    putMeta: async (meta) => {
      const metas = loadMetas();
      const idx = metas.findIndex((m) => m.slotId === meta.slotId);
      if (idx >= 0) {
        metas[idx] = meta;
      } else {
        metas.push(meta);
      }
      saveMetas(metas);
    },

    deleteMeta: async (slotId) => {
      saveMetas(loadMetas().filter((m) => m.slotId !== slotId));
    },
  };
}
