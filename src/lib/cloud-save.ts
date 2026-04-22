/**
 * src/lib/cloud-save.ts — クラウドセーブ操作（サーバーサイド専用）
 *
 * ⚠️ このファイルはサーバー専用。
 * Client Component から import すると Prisma がクライアントバンドルに
 * 混入してビルドエラーになる。型と定数が欲しいだけなら
 * `./cloud-save-types` を import すること。
 *
 * Prisma SaveData テーブル設計:
 *   SaveData { userId, slot, data (JSON), updatedAt, createdAt }
 *   ユニーク制約: (userId, slot)
 */

// テスト環境では server-only をスキップ
if (typeof process !== 'undefined' && !process.env.VITEST) {
  require('server-only');
}
import { prisma } from './prisma';

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
  await prisma.saveData.upsert({
    where: { userId_slot: { userId, slot: slotId } },
    create: {
      userId,
      slot: slotId,
      data: entry as unknown as import('@prisma/client').Prisma.InputJsonValue,
    },
    update: {
      data: entry as unknown as import('@prisma/client').Prisma.InputJsonValue,
    },
  });
}

/**
 * クラウドセーブ取得
 */
export async function cloudLoad(
  userId: string,
  slotId: CloudSlotId,
): Promise<CloudSaveEntry | null> {
  const row = await prisma.saveData.findUnique({
    where: { userId_slot: { userId, slot: slotId } },
  });
  if (!row) return null;
  return row.data as unknown as CloudSaveEntry;
}

/**
 * クラウドセーブ削除
 */
export async function cloudDelete(
  userId: string,
  slotId: CloudSlotId,
): Promise<void> {
  try {
    await prisma.saveData.delete({
      where: { userId_slot: { userId, slot: slotId } },
    });
  } catch {
    // 存在しない場合は無視
  }
}

/**
 * クラウドセーブ一覧（メタのみ）
 */
export async function listCloudSavesMeta(userId: string): Promise<CloudSaveSlotMeta[]> {
  const rows = await prisma.saveData.findMany({
    where: { userId },
    orderBy: { slot: 'asc' },
  });

  const metas: CloudSaveSlotMeta[] = [];
  for (const row of rows) {
    const entry = row.data as unknown as CloudSaveEntry;
    // slot が有効なスロット ID かを確認
    if ((CLOUD_SAVE_SLOTS as readonly string[]).includes(row.slot) && entry?.meta) {
      metas.push(entry.meta);
    }
  }
  return metas;
}
