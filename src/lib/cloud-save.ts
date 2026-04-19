/**
 * src/lib/cloud-save.ts — クラウドセーブ操作（サーバーサイド専用）
 *
 * ⚠️ このファイルは db (Redis/KV) を読むためサーバー専用。
 * Client Component から import すると ioredis がクライアントバンドルに
 * 混入してビルドエラーになる。型と定数が欲しいだけなら
 * `./cloud-save-types` を import すること。
 *
 * KV キー設計:
 *   save:{userId}:cloud_1  → CloudSaveEntry
 *   save:{userId}:cloud_2  → CloudSaveEntry
 *   save:{userId}:cloud_3  → CloudSaveEntry
 *   save_meta:{userId}     → CloudSaveSlotMeta[] (一覧キャッシュ)
 */

// テスト環境では server-only をスキップ
if (typeof process !== 'undefined' && !process.env.VITEST) {
  require('server-only');
}
import { db } from './kv';

// ============================================================
// 型定義（再エクスポート: 既存コードとの互換維持）
// ============================================================

export {
  CLOUD_SAVE_SLOTS,
} from './cloud-save-types';

export type {
  CloudSlotId,
  CloudSaveSlotMeta,
  CloudSaveEntry,
} from './cloud-save-types';

// ローカル参照用（import type なしで使える）
import type {
  CloudSlotId,
  CloudSaveSlotMeta,
  CloudSaveEntry,
} from './cloud-save-types';
import { CLOUD_SAVE_SLOTS } from './cloud-save-types';

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
