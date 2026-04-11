import type { SaveSlotMeta } from '../../engine/types/game-state';

/** 保存データの構造 */
export interface SaveData {
  slotId: string;
  state: string;        // JSON文字列
  checksum: string;     // 改ざん検出用ハッシュ
}

/** ストレージアダプターのインターフェース */
export interface StorageAdapter {
  putSave(slotId: string, data: SaveData): Promise<void>;
  getSave(slotId: string): Promise<SaveData | null>;
  deleteSave(slotId: string): Promise<void>;
  listMeta(): Promise<SaveSlotMeta[]>;
  putMeta(meta: SaveSlotMeta): Promise<void>;
  deleteMeta(slotId: string): Promise<void>;
}
