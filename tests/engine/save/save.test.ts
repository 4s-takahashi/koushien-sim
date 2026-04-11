import { describe, it, expect } from 'vitest';
import { serialize, deserialize, validateSaveData } from '@/engine/save/serializer';
import { createSaveManager, CURRENT_SAVE_VERSION } from '@/engine/save/save-manager';
import { createMemoryStorageAdapter } from '@/platform/storage/memory';
import { generatePlayer } from '@/engine/player/generate';
import { createRNG } from '@/engine/core/rng';
import type { GameState } from '@/engine/types/game-state';

function createTestState(): GameState {
  const rng = createRNG('save-test');
  const players = Array.from({ length: 15 }, (_, i) =>
    generatePlayer(rng.derive(`p${i}`), { enrollmentYear: 1, schoolReputation: 50 })
  );

  return {
    version: CURRENT_SAVE_VERSION,
    seed: 'test-seed-12345',
    currentDate: { year: 1, month: 4, day: 1 },
    team: {
      id: 'team-1',
      name: 'テスト高校',
      prefecture: '新潟',
      reputation: 50,
      players,
      lineup: null,
      facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 },
    },
    manager: {
      name: '田中監督',
      yearsActive: 0,
      fame: 10,
      totalWins: 0,
      totalLosses: 0,
      koshienAppearances: 0,
      koshienWins: 0,
    },
    graduates: [],
    settings: {
      autoAdvanceSpeed: 'normal',
      showDetailedGrowth: true,
    },
  };
}

describe('serializer', () => {
  it('serialize / deserialize がラウンドトリップする', () => {
    const state = createTestState();
    const json = serialize(state);
    const restored = deserialize(json);

    expect(restored.version).toBe(state.version);
    expect(restored.seed).toBe(state.seed);
    expect(restored.currentDate).toEqual(state.currentDate);
    expect(restored.team.name).toBe(state.team.name);
    expect(restored.team.players).toHaveLength(15);
    expect(restored.manager.name).toBe(state.manager.name);
  });

  it('validateSaveData が有効なデータを受け入れる', () => {
    const state = createTestState();
    expect(validateSaveData(state)).toBe(true);
  });

  it('validateSaveData が無効なデータを拒否する', () => {
    expect(validateSaveData(null)).toBe(false);
    expect(validateSaveData({})).toBe(false);
    expect(validateSaveData({ version: 1 })).toBe(false); // version should be string
  });
});

describe('SaveManager (MemoryAdapter)', () => {
  it('セーブとロードができる', async () => {
    const storage = createMemoryStorageAdapter();
    const manager = createSaveManager(storage);
    const state = createTestState();

    await manager.saveGame('slot_1', state);
    const loaded = await manager.loadGame('slot_1');

    expect(loaded).not.toBeNull();
    expect(loaded!.team.name).toBe('テスト高校');
    expect(loaded!.seed).toBe('test-seed-12345');
    expect(loaded!.team.players).toHaveLength(15);
  });

  it('存在しないスロットで null を返す', async () => {
    const storage = createMemoryStorageAdapter();
    const manager = createSaveManager(storage);
    const result = await manager.loadGame('nonexistent');
    expect(result).toBeNull();
  });

  it('セーブ一覧を取得できる', async () => {
    const storage = createMemoryStorageAdapter();
    const manager = createSaveManager(storage);
    const state = createTestState();

    await manager.saveGame('slot_1', state);
    await manager.saveGame('slot_2', state);

    const saves = await manager.listSaves();
    expect(saves).toHaveLength(2);
    expect(saves.map(s => s.slotId).sort()).toEqual(['slot_1', 'slot_2']);
  });

  it('セーブを削除できる', async () => {
    const storage = createMemoryStorageAdapter();
    const manager = createSaveManager(storage);
    const state = createTestState();

    await manager.saveGame('slot_1', state);
    await manager.deleteSave('slot_1');

    const loaded = await manager.loadGame('slot_1');
    expect(loaded).toBeNull();
  });

  it('autoSave が auto スロットに保存する', async () => {
    const storage = createMemoryStorageAdapter();
    const manager = createSaveManager(storage);
    const state = createTestState();

    await manager.autoSave(state);
    const loaded = await manager.loadGame('auto');
    expect(loaded).not.toBeNull();
    expect(loaded!.team.name).toBe('テスト高校');
  });

  it('エクスポート / インポートがラウンドトリップする', async () => {
    const storage = createMemoryStorageAdapter();
    const manager = createSaveManager(storage);
    const state = createTestState();

    await manager.saveGame('slot_1', state);
    const exported = await manager.exportSave('slot_1');

    // 新しいストレージにインポート
    const storage2 = createMemoryStorageAdapter();
    const manager2 = createSaveManager(storage2);
    await manager2.importSave('imported', exported);

    const loaded = await manager2.loadGame('imported');
    expect(loaded).not.toBeNull();
    expect(loaded!.team.name).toBe('テスト高校');
  });
});
