/**
 * src/lib/cloud-save-types.ts — クラウドセーブの型と定数のみ
 *
 * Client Component からも安全に import できる。
 * サーバー専用ロジック（db 操作）は src/lib/cloud-save.ts 側に置く。
 */

export const CLOUD_SAVE_SLOTS = ['cloud_1', 'cloud_2', 'cloud_3'] as const;
export type CloudSlotId = typeof CLOUD_SAVE_SLOTS[number];

export interface CloudSaveSlotMeta {
  slotId: CloudSlotId;
  displayName: string;
  schoolName: string;
  managerName: string;
  currentDate: { year: number; month: number; day: number };
  seasonPhase: string;
  savedAt: string;     // ISO 8601
  version: string;
}

export interface CloudSaveEntry {
  slotId: CloudSlotId;
  meta: CloudSaveSlotMeta;
  stateJson: string;
  checksum: string;
  savedAt: string;
  version: string;
}
