/**
 * Phase 6.1 — WorldState セーブ/ロード追加テスト
 *
 * 以下のシナリオを検証:
 * 1. createWorld → advanceWorldDay × 30日 → save → load → 状態一致
 * 2. 複数スロットへの同時セーブ/ロード
 * 3. 年度替わり後のセーブ/ロード
 * 4. 破損データ（チェックサム不一致）の検出
 * 5. 未定義スロットへのアクセス
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { createWorldState } from '@/engine/world/create-world';
import { advanceWorldDay } from '@/engine/world/world-ticker';
import { generatePlayer } from '@/engine/player/generate';
import {
  serializeWorldState,
  deserializeWorldState,
} from '@/engine/save/world-serializer';
import {
  saveWorldState,
  loadWorldState,
  deleteWorldSave,
  listWorldSaves,
  clearAllWorldSaves,
  WORLD_SAVE_SLOTS,
} from '@/engine/save/world-save-manager';
import type { FacilityLevel } from '@/engine/types/team';
import type { WorldState } from '@/engine/world/world-state';

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

function createTestWorldState(schoolName = 'テスト高校'): WorldState {
  const rng = createRNG('phase6-ext-seed');
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
    name: '鈴木監督',
    yearsActive: 0,
    fame: 20,
    totalWins: 0,
    totalLosses: 0,
    koshienAppearances: 0,
    koshienWins: 0,
  };

  return createWorldState(team, manager, '新潟', 'phase6-ext-seed', rng);
}

// ============================================================
// 1. advanceWorldDay × 30日 → セーブ/ロード整合性
// ============================================================

describe('30日間進行後のセーブ/ロード', () => {
  it('30日進行した WorldState がセーブ/ロードで完全に復元される', async () => {
    let world = createTestWorldState('進行高校');
    const rng = createRNG('phase6-ext-advance');

    // 30日分進める（4月1日スタート → 4月30日）
    for (let i = 0; i < 30; i++) {
      const result = advanceWorldDay(world, 'batting_basic', rng.derive(`day${i}`));
      world = result.nextWorld;
    }

    // 30日後の日付を確認
    expect(world.currentDate.month).toBeGreaterThanOrEqual(4);
    const dayAfter = world.currentDate.day;

    // セーブ
    const saveResult = await saveWorldState(WORLD_SAVE_SLOTS.SLOT_1, world, '30日進行後');
    expect(saveResult.success).toBe(true);

    // ロード
    const loadResult = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_1);
    expect(loadResult.success).toBe(true);
    expect(loadResult.world).toBeDefined();

    const restored = loadResult.world!;
    // 日付が一致
    expect(restored.currentDate.day).toBe(dayAfter);
    expect(restored.currentDate.month).toBe(world.currentDate.month);
    expect(restored.currentDate.year).toBe(world.currentDate.year);

    // 選手数が一致
    const origSchool = world.schools.find(s => s.id === world.playerSchoolId)!;
    const restoredSchool = restored.schools.find(s => s.id === restored.playerSchoolId)!;
    expect(restoredSchool.players.length).toBe(origSchool.players.length);

    // Map フィールドが正しく復元される
    expect(restored.scoutState.scoutReports).toBeInstanceOf(Map);
    expect(restored.scoutState.recruitAttempts).toBeInstanceOf(Map);
    expect(restored.personRegistry.entries).toBeInstanceOf(Map);
  });

  it('進行後の選手能力値がセーブ/ロードで保持される', async () => {
    let world = createTestWorldState('能力確認高校');
    const rng = createRNG('phase6-ext-ability');

    // 30日進める
    for (let i = 0; i < 30; i++) {
      const result = advanceWorldDay(world, 'batting_basic', rng.derive(`day${i}`));
      world = result.nextWorld;
    }

    const origSchool = world.schools.find(s => s.id === world.playerSchoolId)!;
    const origFirstPlayer = origSchool.players[0];

    const saveResult = await saveWorldState(WORLD_SAVE_SLOTS.SLOT_2, world, '能力値確認');
    expect(saveResult.success).toBe(true);

    const loadResult = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_2);
    expect(loadResult.success).toBe(true);

    const restoredSchool = loadResult.world!.schools.find(s => s.id === loadResult.world!.playerSchoolId)!;
    const restoredFirstPlayer = restoredSchool.players[0];

    expect(restoredFirstPlayer.id).toBe(origFirstPlayer.id);
    expect(restoredFirstPlayer.stats.batting.contact).toBe(origFirstPlayer.stats.batting.contact);
    expect(restoredFirstPlayer.stats.batting.power).toBe(origFirstPlayer.stats.batting.power);
    expect(restoredFirstPlayer.stats.base.stamina).toBe(origFirstPlayer.stats.base.stamina);
  });
});

// ============================================================
// 2. 複数スロットへのセーブ/ロード
// ============================================================

describe('複数スロットへの同時セーブ/ロード', () => {
  it('3スロット全てにセーブしてそれぞれ独立してロードできる', async () => {
    const worldA = createTestWorldState('Alpha高校');
    const worldB = { ...createTestWorldState('Beta高校'), currentDate: { year: 1, month: 6, day: 15 } };
    const worldC = { ...createTestWorldState('Gamma高校'), currentDate: { year: 2, month: 8, day: 1 } };

    await saveWorldState(WORLD_SAVE_SLOTS.SLOT_1, worldA, 'Alpha-Start');
    await saveWorldState(WORLD_SAVE_SLOTS.SLOT_2, worldB, 'Beta-June');
    await saveWorldState(WORLD_SAVE_SLOTS.SLOT_3, worldC, 'Gamma-Year2');

    const rA = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_1);
    const rB = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_2);
    const rC = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_3);

    expect(rA.success).toBe(true);
    expect(rB.success).toBe(true);
    expect(rC.success).toBe(true);

    // 学校名で各スロットが独立していることを確認
    const schoolA = rA.world!.schools.find(s => s.id === rA.world!.playerSchoolId)!;
    const schoolB = rB.world!.schools.find(s => s.id === rB.world!.playerSchoolId)!;
    const schoolC = rC.world!.schools.find(s => s.id === rC.world!.playerSchoolId)!;

    expect(schoolA.name).toBe('Alpha高校');
    expect(schoolB.name).toBe('Beta高校');
    expect(schoolC.name).toBe('Gamma高校');

    // 日付が独立していることを確認
    expect(rA.world!.currentDate.month).toBe(4);  // 4月
    expect(rB.world!.currentDate.month).toBe(6);  // 6月
    expect(rC.world!.currentDate.year).toBe(2);   // Year 2
  });

  it('スロット上書き時に新しいデータが返る', async () => {
    const worldV1 = createTestWorldState('上書き高校');
    const worldV2 = { ...createTestWorldState('上書き高校'), currentDate: { year: 1, month: 9, day: 1 } };

    await saveWorldState(WORLD_SAVE_SLOTS.SLOT_1, worldV1, 'Version1');
    await saveWorldState(WORLD_SAVE_SLOTS.SLOT_1, worldV2, 'Version2-Sep');

    const result = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_1);
    expect(result.success).toBe(true);
    // 上書き後の日付（9月）が返る
    expect(result.world!.currentDate.month).toBe(9);

    // listWorldSaves に重複エントリがない
    const list = listWorldSaves();
    const slot1Entries = list.filter(m => m.slotId === WORLD_SAVE_SLOTS.SLOT_1);
    expect(slot1Entries).toHaveLength(1);
  });

  it('スロットを削除すると他のスロットに影響しない', async () => {
    const worldA = createTestWorldState('削除テストA');
    const worldB = createTestWorldState('削除テストB');

    await saveWorldState(WORLD_SAVE_SLOTS.SLOT_1, worldA, 'A');
    await saveWorldState(WORLD_SAVE_SLOTS.SLOT_2, worldB, 'B');

    deleteWorldSave(WORLD_SAVE_SLOTS.SLOT_1);

    const rA = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_1);
    const rB = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_2);

    expect(rA.success).toBe(false);  // 削除済み
    expect(rB.success).toBe(true);   // 影響なし

    const schoolB = rB.world!.schools.find(s => s.id === rB.world!.playerSchoolId)!;
    expect(schoolB.name).toBe('削除テストB');
  });
});

// ============================================================
// 3. 年度替わり後のセーブ/ロード
// ============================================================

describe('年度替わり後のセーブ/ロード', () => {
  it('Year 2 開始の WorldState がセーブ/ロードできる', async () => {
    const world = {
      ...createTestWorldState('年度替わり高校'),
      currentDate: { year: 2, month: 4, day: 1 },
    };

    const saveResult = await saveWorldState(WORLD_SAVE_SLOTS.SLOT_1, world, 'Year2開始');
    expect(saveResult.success).toBe(true);

    const loadResult = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_1);
    expect(loadResult.success).toBe(true);
    expect(loadResult.world!.currentDate.year).toBe(2);
    expect(loadResult.world!.currentDate.month).toBe(4);
  });

  it('Year 3 夏大会期間中のセーブ/ロードができる', async () => {
    const world = {
      ...createTestWorldState('夏大会高校'),
      currentDate: { year: 3, month: 7, day: 20 },
    };

    const saveResult = await saveWorldState(WORLD_SAVE_SLOTS.SLOT_2, world, 'Year3-夏大会');
    expect(saveResult.success).toBe(true);

    const loadResult = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_2);
    expect(loadResult.success).toBe(true);
    expect(loadResult.world!.currentDate.year).toBe(3);
    expect(loadResult.world!.currentDate.month).toBe(7);
    expect(loadResult.world!.currentDate.day).toBe(20);
  });

  it('シリアライザが年度情報を正確に保持する', () => {
    const world = {
      ...createTestWorldState('シリアライズ高校'),
      currentDate: { year: 5, month: 3, day: 31 },
    };

    const json = serializeWorldState(world);
    const restored = deserializeWorldState(json);

    expect(restored.currentDate.year).toBe(5);
    expect(restored.currentDate.month).toBe(3);
    expect(restored.currentDate.day).toBe(31);
  });
});

// ============================================================
// 4. 破損データの検出
// ============================================================

describe('破損データの検出', () => {
  it('チェックサム不一致データはロード失敗を返す', async () => {
    if (typeof localStorage === 'undefined') return;

    const world = createTestWorldState();
    await saveWorldState(WORLD_SAVE_SLOTS.SLOT_1, world, 'TestForCorrupt');

    // localStorage の内容を取り出して改ざん
    const key = 'koushien_save_' + WORLD_SAVE_SLOTS.SLOT_1;
    const raw = localStorage.getItem(key);
    expect(raw).not.toBeNull();

    const entry = JSON.parse(raw!);
    // 改ざん: stateJson の末尾に文字を追加してチェックサムを無効化
    entry.stateJson = entry.stateJson.slice(0, -5) + '"XXXX}';
    localStorage.setItem(key, JSON.stringify(entry));

    const result = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_1);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('空JSON文字列はロード失敗を返す', async () => {
    if (typeof localStorage === 'undefined') return;

    const key = 'koushien_save_' + WORLD_SAVE_SLOTS.SLOT_2;
    const entry = {
      slotId: WORLD_SAVE_SLOTS.SLOT_2,
      meta: {},
      stateJson: '',
      checksum: 'invalid',
    };
    localStorage.setItem(key, JSON.stringify(entry));

    const result = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_2);
    expect(result.success).toBe(false);
  });

  it('完全に壊れた JSON はロード失敗を返す', async () => {
    if (typeof localStorage === 'undefined') return;

    const key = 'koushien_save_' + WORLD_SAVE_SLOTS.SLOT_3;
    localStorage.setItem(key, '{{invalid-json-data}}}');

    const result = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_3);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('必須フィールド欠けのデータはロード失敗を返す', async () => {
    if (typeof localStorage === 'undefined') return;

    const invalidState = {
      version: '6.0.0',
      seed: 'test',
      // playerSchoolId 欠け
      currentDate: { year: 1, month: 4, day: 1 },
      schools: [{ id: 'school-1' }],
      manager: {},
      seasonState: {},
    };
    const entry = {
      slotId: WORLD_SAVE_SLOTS.SLOT_1,
      meta: {},
      stateJson: JSON.stringify(invalidState),
      checksum: 'dummy-checksum',
    };
    const key = 'koushien_save_' + WORLD_SAVE_SLOTS.SLOT_1;
    localStorage.setItem(key, JSON.stringify(entry));

    const result = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_1);
    expect(result.success).toBe(false);
  });

  it('schools が空配列のデータはロード失敗を返す', async () => {
    if (typeof localStorage === 'undefined') return;

    const invalidState = {
      version: '6.0.0',
      seed: 'test',
      playerSchoolId: 'school-1',
      currentDate: { year: 1, month: 4, day: 1 },
      schools: [],  // 空 = 無効
      manager: { name: 'Test' },
      seasonState: {},
    };
    const entry = {
      slotId: WORLD_SAVE_SLOTS.SLOT_1,
      meta: {},
      stateJson: JSON.stringify(invalidState),
      checksum: 'dummy',
    };
    localStorage.setItem('koushien_save_' + WORLD_SAVE_SLOTS.SLOT_1, JSON.stringify(entry));

    const result = await loadWorldState(WORLD_SAVE_SLOTS.SLOT_1);
    expect(result.success).toBe(false);
  });
});

// ============================================================
// 5. シリアライザの追加ケース
// ============================================================

describe('シリアライザ追加ケース', () => {
  it('middleSchoolPool の各エントリが復元される', () => {
    const world = createTestWorldState();
    const json = serializeWorldState(world);
    const restored = deserializeWorldState(json);

    expect(restored.middleSchoolPool).toBeDefined();
    expect(Array.isArray(restored.middleSchoolPool)).toBe(true);
    expect(restored.middleSchoolPool.length).toBeGreaterThan(0);

    // 各エントリの必須フィールド確認
    const first = restored.middleSchoolPool[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('firstName');
    expect(first).toHaveProperty('lastName');
  });

  it('全48校が復元される', () => {
    const world = createTestWorldState();
    const json = serializeWorldState(world);
    const restored = deserializeWorldState(json);

    expect(restored.schools).toHaveLength(48);
  });

  it('personRegistry の Map が空でも復元できる', () => {
    const world = createTestWorldState();
    // personRegistry.entries が空 Map の場合
    const modifiedWorld = {
      ...world,
      personRegistry: {
        ...world.personRegistry,
        entries: new Map(),
      },
    };

    const json = serializeWorldState(modifiedWorld);
    const restored = deserializeWorldState(json);

    expect(restored.personRegistry.entries).toBeInstanceOf(Map);
    expect(restored.personRegistry.entries.size).toBe(0);
  });
});
