/**
 * src/lib/cloud-save.ts — クラウドセーブ操作（サーバーサイド）
 *
 * KV キー設計:
 *   save:{userId}:cloud_1  → CloudSaveEntry
 *   save:{userId}:cloud_2  → CloudSaveEntry
 *   save:{userId}:cloud_3  → CloudSaveEntry
 *   save_meta:{userId}     → CloudSaveSlotMeta[] (一覧キャッシュ)
 */

import { db } from './kv';

// ============================================================
// 型定義
// ============================================================

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

// ============================================================
// KV キー
// ============================================================

const kvKey = {
  save: (userId: string, slotId: CloudSlotId) => `save:${userId}:${slotId}`,
  meta: (userId: string) => `save_meta:${userId}`,
};

// ============================================================
// 操作
// ============================================================

/**
 * クラウドセーブ保存
 */
export async function cloudSave(
  userId: string,
  slotId: CloudSlotId,
  entry: CloudSaveEntry,
): Promise<void> {
  await db.set(kvKey.save(userId, slotId), entry);
  // メタキャッシュ更新
  const metas = await listCloudSavesMeta(userId);
  const idx = metas.findIndex((m) => m.slotId === slotId);
  if (idx >= 0) {
    metas[idx] = entry.meta;
  } else {
    metas.push(entry.meta);
  }
  await db.set(kvKey.meta(userId), metas);
}

/**
 * クラウドセーブ取得
 */
export async function cloudLoad(
  userId: string,
  slotId: CloudSlotId,
): Promise<CloudSaveEntry | null> {
  return db.get<CloudSaveEntry>(kvKey.save(userId, slotId));
}

/**
 * クラウドセーブ削除
 */
export async function cloudDelete(
  userId: string,
  slotId: CloudSlotId,
): Promise<void> {
  await db.del(kvKey.save(userId, slotId));
  const metas = await listCloudSavesMeta(userId);
  await db.set(
    kvKey.meta(userId),
    metas.filter((m) => m.slotId !== slotId),
  );
}

/**
 * クラウドセーブ一覧（メタのみ）
 */
export async function listCloudSavesMeta(userId: string): Promise<CloudSaveSlotMeta[]> {
  return (await db.get<CloudSaveSlotMeta[]>(kvKey.meta(userId))) ?? [];
}
