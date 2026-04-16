/**
 * Phase 6 — WorldState セーブ/ロードシステムテスト
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { createWorldState } from '@/engine/world/create-world';
import { generatePlayer } from '@/engine/player/generate';
import {
  serializeWorldState,
  deserializeWorldState,
  validateWorldSaveData,
} from '@/engine/save/world-serializer';
import {
  saveWorldState,
  loadWorldState,
  deleteWorldSave,
  listWorldSaves,
  autoSaveMonthly,
  autoSaveYearEnd,
  autoSavePreTournament,
  clearAllWorldSaves,
  WORLD_SAVE_SLOTS,
} from '@/engine/save/world-save-manager';
import type { FacilityLevel } from '@/engine/types/team';

// ============================================================
// テスト前後のクリア
// ============================================================

beforeEach(() => {
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
  clearAllWorldSaves();
});

// ============================================================
// テスト用 WorldState 生成
// ============================================================

function createTestWorldState(schoolName = 'テスト高校', yearOffset = 0) {
  const rng = createRNG('phase6-test-seed');
  const players = Array.from({ length: 15 }, (_, i) =>
    generatePlayer(rng.derive(`p${i}`), { enrollmentYear: 1, schoolReputation: 60 })
  );

  const facilities: FacilityLevel = { ground: 3, bullpen: 3, battingCage: 3, gym: 3 };
  const team = {
    id: 'team-test',
    name: schoolName,
    prefecture: '新潟',
    reputation: 60,
    players,
    lineup: null,
    facilities,
  };

  const manager = {
    name: '田中監督',
    yearsActive: yearOffset,
    fame: 20,
    totalWins: yearOffset * 5,
    totalLosses: yearOffset * 3,
    koshienAppearances: yearOffset > 2 ? 1 : 0,
    koshienWins: 0,
  };

  const world = createWorldState(team, manager, '新潟', 'phase6-test-seed', rng);
  if (yearOffset > 0) {
    return { ...world, currentDate: { year: yearOffset + 1, month: 4, day: 1 } };
  }
  return world;
}

// ============================================================
// シリアライザテスト
// ============================================================

describe('worldSerializer', () => {
  it('serializeWorldState / deserializeWorldState がラウンドトリップする', () => {
    const world = createTestWorldState();
    const json = serializeWorldState(world);
    const restored = deserializeWorldState(json);

    expect(restored.version).toBe(world.version);
    expect(restored.seed).toBe(world.seed);
    expect(restored.currentDate).toEqual(world.currentDate);
    expect(restored.playerSchoolId).toBe(world.playerSchoolId);
    expect(restored.manager.name).toBe(world.manager.name);
    expect(restored.schools).toHaveLength(world.schools.length);
    expect(restored.prefecture).toBe(world.prefecture);
  });

  it('Map フィールド（scoutReports, recruitAttempts, personRegistry.entries）が復元される', () => {
    const world = createTestWorldState();
    const json = serializeWorldState(world);
    const restored = deserializeWorldState(json);

    expect(restored.scoutState.scoutReports).toBeInstanceOf(Map);
    expect(restored.scoutState.recruitAttempts).toBeInstanceOf(Map);
    expect(restored.personRegistry.entries).toBeInstanceOf(Map);
  });

  it('日付が正確に復元される', () => {
    const world = createTestWorldState();
    const modified = { ...world, currentDate: { year: 3, month: 8, day: 15 } };
    const json = serializeWorldState(modified);
    const restored = deserializeWorldState(json);

    expect(restored.currentDate.year).toBe(3);
    expect(restored.currentDate.month).toBe(8);
    expect(restored.currentDate.day).toBe(15);
  });

  it('schools 配列（全48校）が正確に復元される', () => {
    const world = createTestWorldState();
    const json = serializeWorldState(world);
    const restored = deserializeWorldState(json);

    expect(restored.schools).toHaveLength(48);
    const playerSchool = restored.schools.find((s) => s.id === restored.playerSchoolId);
    expect(playerSchool).toBeDefined();
    expect(playerSchool?.name).toBe('テスト高校');
  });

  it('middleSchoolPool が復元される', () => {
    const world = createTestWorldState();
    const json = serializeWorldState(world);
    const restored = deserializeWorldState(json);

    expect(restored.middleSchoolPool.length).toBeGreaterThan(0);
  });

  it('validateWorldSaveData が有効なデータを受け入れる', () => {
    const world = createTestWorldState();
    const json = serializeWorldState(world);
    const raw = JSON.parse(json);
    expect(validateWorldSaveData(raw)).toBe(true);
  });

  it('validateWorldSaveData が無効なデータを拒否する', () => {
    expect(validateWorldSaveData(null)).toBe(false);
    expect(validateWorldSaveData({})).toBe(false);
    // playerSchoolId がない
    expect(validateWorldSaveData({ version: '1.0', seed: 'x', currentDate: {}, schools: [{}], manager: {}, seasonState: {} })).toBe(false);
    // version が文字列でない
    expect(validateWorldSaveData({ version: 1, seed: 'x', playerSchoolId: 'id', currentDate: {}, schools: [{}], manager: {}, seasonState: {} })).toBe(false);
    // schools が空
    expect(validateWorldSaveData({ version: '1.0', seed: 'x', playerSchoolId: 'id', currentDate: {}, schools: [], manager: {}, seasonState: {} })).toBe(false);
  });
});

// ============================================================
// セーブマネージャーテスト
// ============================================================

describe('WorldSaveManager', () => {
  it('手動スロットにセーブ → ロードができる', async () => {
    const world = createTestWorldState('桜葉高校');
    const slotId = WORLD_SAVE_SLOTS.SLOT_1;

    const saveResult = await saveWorldState(slotId, world, 'スロット1');
    expect(saveResult.success).toBe(true);

    const loadResult = await loadWorldState(slotId);
    expect(loadResult.success).toBe(true);
    expect(loadResult.world).toBeDefined();
    const playerSchool = loadResult.world!.schools.find(
      (s) => s.id === loadResult.world!.playerSchoolId
    );
    expect(playerSchool?.name).toBe('桜葉高校');
  });

  it('複数スロットにセーブできる', async () => {
    const world1 = createTestWorldState('Alpha高校');
    const world2 = createTestWorldState('Beta高校');

    await saveWorldState(WORLD_SAVE_SLOTS.SLOT_1, world1, 'Alpha');
    await saveWorldState(WORLD_SAVE_SLOTS.SLOT_2, world2, 'Beta');

    const list = listWorldSaves();
    expect(list.length).toBe(2);
    const slotIds = list.map((m) => m.slotId);
    expect(slotIds).toContain(WORLD_SAVE_SLOTS.SLOT_1);
    expect(slotIds).toContain(WORLD_SAVE_SLOTS.SLOT_2);
  });

  it('存在しないスロットのロードは失敗する', async () => {
    const result = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_3);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('セーブを削除できる', async () => {
    const world = createTestWorldState();
    await saveWorldState(WORLD_SAVE_SLOTS.SLOT_1, world, 'Test');
    deleteWorldSave(WORLD_SAVE_SLOTS.SLOT_1);

    const result = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_1);
    expect(result.success).toBe(false);

    const list = listWorldSaves();
    expect(list.find((m) => m.slotId === WORLD_SAVE_SLOTS.SLOT_1)).toBeUndefined();
  });

  it('autoSaveMonthly が AUTO_MONTHLY スロットに保存する', async () => {
    const world = createTestWorldState();
    const result = await autoSaveMonthly(world);
    expect(result.success).toBe(true);

    const loaded = await loadWorldState(WORLD_SAVE_SLOTS.AUTO_MONTHLY);
    expect(loaded.success).toBe(true);
    expect(loaded.world).toBeDefined();
  });

  it('autoSaveYearEnd が AUTO_YEAR スロットに保存する', async () => {
    const world = createTestWorldState();
    const result = await autoSaveYearEnd(world);
    expect(result.success).toBe(true);

    const loaded = await loadWorldState(WORLD_SAVE_SLOTS.AUTO_YEAR);
    expect(loaded.success).toBe(true);
    expect(loaded.world).toBeDefined();
  });

  it('autoSavePreTournament が PRE_TOURNAMENT スロットに保存する', async () => {
    const world = createTestWorldState();
    const result = await autoSavePreTournament(world);
    expect(result.success).toBe(true);

    const loaded = await loadWorldState(WORLD_SAVE_SLOTS.PRE_TOURNAMENT);
    expect(loaded.success).toBe(true);
  });

  it('セーブメタデータが正確に保存される', async () => {
    const world = createTestWorldState('テスト高校');
    const modified = { ...world, currentDate: { year: 2, month: 7, day: 10 } };
    await saveWorldState(WORLD_SAVE_SLOTS.SLOT_1, modified, 'Year 2 夏');

    const list = listWorldSaves();
    const meta = list.find((m) => m.slotId === WORLD_SAVE_SLOTS.SLOT_1);
    expect(meta).toBeDefined();
    expect(meta!.schoolName).toBe('テスト高校');
    expect(meta!.currentDate.year).toBe(2);
    expect(meta!.currentDate.month).toBe(7);
    expect(meta!.displayName).toBe('Year 2 夏');
    expect(meta!.version).toBe('6.0.0');
  });

  it('バリデーション失敗データはロード失敗を返す', async () => {
    if (typeof localStorage !== 'undefined') {
      const invalidState = { version: '1.0', seed: 'x' }; // playerSchoolId 欠け
      const entry = {
        slotId: WORLD_SAVE_SLOTS.SLOT_1,
        meta: {},
        stateJson: JSON.stringify(invalidState),
        checksum: 'dummy',
      };
      localStorage.setItem('koushien_save_' + WORLD_SAVE_SLOTS.SLOT_1, JSON.stringify(entry));
      const result = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_1);
      expect(result.success).toBe(false);
    }
  });
});

// ============================================================
// 複数年度テスト
// ============================================================

describe('複数年度にまたがるセーブ/復元', () => {
  it('Year 1 → Year 3 と進行した WorldState が各スロットから復元できる', async () => {
    const worldYear1 = createTestWorldState('紅葉高校', 0);
    const worldYear2 = { ...createTestWorldState('紅葉高校', 1), currentDate: { year: 2, month: 4, day: 1 } };
    const worldYear3 = { ...createTestWorldState('紅葉高校', 2), currentDate: { year: 3, month: 8, day: 20 } };

    await saveWorldState(WORLD_SAVE_SLOTS.SLOT_1, worldYear1, 'Year 1 開始');
    await saveWorldState(WORLD_SAVE_SLOTS.SLOT_2, worldYear2, 'Year 2 開始');
    await saveWorldState(WORLD_SAVE_SLOTS.SLOT_3, worldYear3, 'Year 3 夏大会中');

    const r1 = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_1);
    const r2 = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_2);
    const r3 = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_3);

    expect(r1.success).toBe(true);
    expect(r1.world!.currentDate.year).toBe(1);

    expect(r2.success).toBe(true);
    expect(r2.world!.currentDate.year).toBe(2);

    expect(r3.success).toBe(true);
    expect(r3.world!.currentDate.year).toBe(3);

    // 全3スロットが存在
    const list = listWorldSaves();
    expect(list.length).toBe(3);
  });
});
