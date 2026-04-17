/**
 * Phase 9 — クラウドセーブ操作 テスト
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.mock はトップに巻き上げられるため vi.hoisted() を使う
const mockDb = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  async get<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T) ?? null;
  },
  async set(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  },
  async del(key: string): Promise<void> {
    this.store.delete(key);
  },
}));

vi.mock('../../src/lib/kv', () => ({
  db: mockDb,
}));

import {
  cloudSave,
  cloudLoad,
  cloudDelete,
  listCloudSavesMeta,
  CLOUD_SAVE_SLOTS,
  type CloudSaveEntry,
  type CloudSaveSlotMeta,
} from '../../src/lib/cloud-save';

function makeMeta(slotId: (typeof CLOUD_SAVE_SLOTS)[number]): CloudSaveSlotMeta {
  return {
    slotId,
    displayName: `テストスロット ${slotId}`,
    schoolName: 'テスト高校',
    managerName: '山田監督',
    currentDate: { year: 1, month: 4, day: 1 },
    seasonPhase: 'spring_practice',
    savedAt: new Date().toISOString(),
    version: '6.0.0',
  };
}

function makeEntry(slotId: (typeof CLOUD_SAVE_SLOTS)[number]): CloudSaveEntry {
  return {
    slotId,
    meta: makeMeta(slotId),
    stateJson: '{"test": true}',
    checksum: 'abc123',
    savedAt: new Date().toISOString(),
    version: '6.0.0',
  };
}

describe('cloudSave / cloudLoad / cloudDelete', () => {
  const userId = 'user-test-001';

  beforeEach(() => {
    mockDb.store.clear();
  });

  it('セーブデータを保存・取得できる', async () => {
    const entry = makeEntry('cloud_1');
    await cloudSave(userId, 'cloud_1', entry);

    const loaded = await cloudLoad(userId, 'cloud_1');
    expect(loaded).not.toBeNull();
    expect(loaded?.meta.schoolName).toBe('テスト高校');
    expect(loaded?.stateJson).toBe('{"test": true}');
  });

  it('存在しないスロットは null を返す', async () => {
    const loaded = await cloudLoad(userId, 'cloud_2');
    expect(loaded).toBeNull();
  });

  it('削除後はロードできない', async () => {
    const entry = makeEntry('cloud_1');
    await cloudSave(userId, 'cloud_1', entry);
    await cloudDelete(userId, 'cloud_1');
    const loaded = await cloudLoad(userId, 'cloud_1');
    expect(loaded).toBeNull();
  });

  it('上書き保存できる', async () => {
    const entry1 = makeEntry('cloud_1');
    await cloudSave(userId, 'cloud_1', entry1);

    const entry2: CloudSaveEntry = {
      ...makeEntry('cloud_1'),
      meta: { ...makeMeta('cloud_1'), schoolName: '新高校' },
      stateJson: '{"updated": true}',
    };
    await cloudSave(userId, 'cloud_1', entry2);

    const loaded = await cloudLoad(userId, 'cloud_1');
    expect(loaded?.meta.schoolName).toBe('新高校');
  });
});

describe('listCloudSavesMeta', () => {
  const userId = 'user-list-001';

  beforeEach(() => {
    mockDb.store.clear();
  });

  it('初期状態では空配列を返す', async () => {
    const metas = await listCloudSavesMeta(userId);
    expect(metas).toEqual([]);
  });

  it('保存後はメタ一覧に反映される', async () => {
    await cloudSave(userId, 'cloud_1', makeEntry('cloud_1'));
    await cloudSave(userId, 'cloud_2', makeEntry('cloud_2'));

    const metas = await listCloudSavesMeta(userId);
    expect(metas).toHaveLength(2);
    const slotIds = metas.map((m) => m.slotId);
    expect(slotIds).toContain('cloud_1');
    expect(slotIds).toContain('cloud_2');
  });

  it('削除後はメタ一覧から除外される', async () => {
    await cloudSave(userId, 'cloud_1', makeEntry('cloud_1'));
    await cloudSave(userId, 'cloud_2', makeEntry('cloud_2'));
    await cloudDelete(userId, 'cloud_1');

    const metas = await listCloudSavesMeta(userId);
    expect(metas).toHaveLength(1);
    expect(metas[0].slotId).toBe('cloud_2');
  });

  it('ユーザーIDが異なると別データになる', async () => {
    await cloudSave('userA', 'cloud_1', makeEntry('cloud_1'));
    const metasB = await listCloudSavesMeta('userB');
    expect(metasB).toHaveLength(0);
  });
});

describe('CLOUD_SAVE_SLOTS', () => {
  it('3スロット存在する', () => {
    expect(CLOUD_SAVE_SLOTS).toHaveLength(3);
    expect(CLOUD_SAVE_SLOTS).toContain('cloud_1');
    expect(CLOUD_SAVE_SLOTS).toContain('cloud_2');
    expect(CLOUD_SAVE_SLOTS).toContain('cloud_3');
  });
});
