/**
 * world-save-manager — WorldState のセーブ/ロード管理
 *
 * localStorage を使った複数スロット管理。
 * - 手動スロット: slot_1, slot_2, slot_3
 * - 自動セーブスロット: auto_save（年度替わり前）
 * - 月次自動セーブ: monthly_auto（毎月1日ローテーション）
 * - 大会前セーブ: pre_tournament
 */

import type { WorldState } from '../world/world-state';
import {
  serializeWorldState,
  deserializeWorldState,
  validateWorldSaveData,
  computeWorldChecksum,
} from './world-serializer';

// ============================================================
// 定数
// ============================================================

export const WORLD_SAVE_VERSION = '6.0.0';

export const WORLD_SAVE_SLOTS = {
  SLOT_1: 'world_slot_1',
  SLOT_2: 'world_slot_2',
  SLOT_3: 'world_slot_3',
  AUTO_YEAR: 'world_auto_year',    // 年度替わり前自動保護セーブ（上書き不可）
  AUTO_MONTHLY: 'world_auto_monthly', // 毎月1日ローテーション
  PRE_TOURNAMENT: 'world_pre_tournament', // 大会前セーブ
} as const;

export type WorldSaveSlotId = typeof WORLD_SAVE_SLOTS[keyof typeof WORLD_SAVE_SLOTS];

/** セーブスロットのメタデータ */
export interface WorldSaveSlotMeta {
  slotId: WorldSaveSlotId;
  displayName: string;  // 表示名
  schoolName: string;
  managerName: string;
  currentDate: { year: number; month: number; day: number };
  currentYear: number;
  seasonPhase: string;
  winRate: string;     // "X勝Y敗" 形式サマリー
  savedAt: number;     // Unix timestamp
  version: string;
  isProtected: boolean; // true = 上書き不可（年度セーブ）
}

/** セーブデータの保存形式 */
interface WorldSaveEntry {
  slotId: string;
  meta: WorldSaveSlotMeta;
  stateJson: string;
  checksum: string;
}

// ============================================================
// localStorage キー
// ============================================================

const STORAGE_KEY_PREFIX = 'koushien_save_';
const META_LIST_KEY = 'koushien_save_meta_list';
const STORAGE_SIZE_LIMIT_BYTES = 4 * 1024 * 1024; // 4MB 警告閾値

// ============================================================
// localStorage ユーティリティ（SSR 安全）
// ============================================================

function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem('__test__', '1');
    localStorage.removeItem('__test__');
    return true;
  } catch {
    return false;
  }
}

function lsSet(key: string, value: string): void {
  if (!isLocalStorageAvailable()) return;
  localStorage.setItem(key, value);
}

function lsGet(key: string): string | null {
  if (!isLocalStorageAvailable()) return null;
  return localStorage.getItem(key);
}

function lsRemove(key: string): void {
  if (!isLocalStorageAvailable()) return;
  localStorage.removeItem(key);
}

function estimateStorageUsed(): number {
  if (!isLocalStorageAvailable()) return 0;
  let total = 0;
  for (const key of Object.keys(localStorage)) {
    total += (localStorage.getItem(key)?.length ?? 0) * 2; // UTF-16: 2 bytes per char
  }
  return total;
}

// ============================================================
// メタリスト管理
// ============================================================

function loadMetaList(): WorldSaveSlotMeta[] {
  const raw = lsGet(META_LIST_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as WorldSaveSlotMeta[];
  } catch {
    return [];
  }
}

function saveMetaList(list: WorldSaveSlotMeta[]): void {
  lsSet(META_LIST_KEY, JSON.stringify(list));
}

function upsertMeta(meta: WorldSaveSlotMeta): void {
  const list = loadMetaList();
  const idx = list.findIndex((m) => m.slotId === meta.slotId);
  if (idx >= 0) {
    list[idx] = meta;
  } else {
    list.push(meta);
  }
  saveMetaList(list);
}

function removeMeta(slotId: string): void {
  const list = loadMetaList();
  saveMetaList(list.filter((m) => m.slotId !== slotId));
}

// ============================================================
// WorldState → WorldSaveSlotMeta 生成
// ============================================================

function buildMeta(
  slotId: WorldSaveSlotId,
  displayName: string,
  world: WorldState,
  isProtected: boolean,
): WorldSaveSlotMeta {
  const playerSchool = world.schools.find((s) => s.id === world.playerSchoolId);
  const yr = world.seasonState.yearResults;
  const wins = yr.summerBestRound + yr.autumnBestRound; // 簡易勝率サマリー
  const winRate = `夏${yr.summerBestRound}回戦 秋${yr.autumnBestRound}回戦`;

  return {
    slotId,
    displayName,
    schoolName: playerSchool?.name ?? '不明',
    managerName: world.manager.name,
    currentDate: {
      year: world.currentDate.year,
      month: world.currentDate.month,
      day: world.currentDate.day,
    },
    currentYear: world.currentDate.year,
    seasonPhase: world.seasonState.phase,
    winRate,
    savedAt: Date.now(),
    version: WORLD_SAVE_VERSION,
    isProtected,
  };
}

// ============================================================
// 公開 API
// ============================================================

export interface WorldSaveResult {
  success: boolean;
  error?: string;
  storageWarning?: string; // 容量警告
}

export interface WorldLoadResult {
  success: boolean;
  world?: WorldState;
  error?: string;
  checksumMismatch?: boolean;
}

/**
 * 手動セーブ
 */
export async function saveWorldState(
  slotId: WorldSaveSlotId,
  world: WorldState,
  displayName: string,
): Promise<WorldSaveResult> {
  try {
    if (!isLocalStorageAvailable()) {
      return { success: false, error: 'ブラウザのローカルストレージが利用できません' };
    }

    const stateJson = serializeWorldState(world);
    const checksum = await computeWorldChecksum(stateJson);

    const entry: WorldSaveEntry = {
      slotId,
      meta: buildMeta(slotId, displayName, world, false),
      stateJson,
      checksum,
    };

    lsSet(STORAGE_KEY_PREFIX + slotId, JSON.stringify(entry));
    upsertMeta(entry.meta);

    // 容量チェック
    const used = estimateStorageUsed();
    if (used > STORAGE_SIZE_LIMIT_BYTES) {
      return {
        success: true,
        storageWarning: `ストレージ使用量が ${Math.round(used / 1024)}KB に達しています。古いセーブデータを削除することをお勧めします。`,
      };
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: `セーブ失敗: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * 年度替わり前の自動保護セーブ（上書き不可スロット）
 */
export async function autoSaveYearEnd(world: WorldState): Promise<WorldSaveResult> {
  const slotId = WORLD_SAVE_SLOTS.AUTO_YEAR;

  try {
    if (!isLocalStorageAvailable()) return { success: false, error: 'ストレージ利用不可' };

    const stateJson = serializeWorldState(world);
    const checksum = await computeWorldChecksum(stateJson);
    const displayName = `Year ${world.currentDate.year} 年度終了前 自動保護`;

    const entry: WorldSaveEntry = {
      slotId,
      meta: buildMeta(slotId, displayName, world, true),
      stateJson,
      checksum,
    };

    lsSet(STORAGE_KEY_PREFIX + slotId, JSON.stringify(entry));
    upsertMeta(entry.meta);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * 毎月1日の自動セーブ
 */
export async function autoSaveMonthly(world: WorldState): Promise<WorldSaveResult> {
  const displayName = `Year ${world.currentDate.year} ${world.currentDate.month}月1日 自動`;
  return saveWorldState(WORLD_SAVE_SLOTS.AUTO_MONTHLY, world, displayName);
}

/**
 * 大会前自動セーブ
 */
export async function autoSavePreTournament(world: WorldState): Promise<WorldSaveResult> {
  const displayName = `Year ${world.currentDate.year} 大会前 自動`;
  return saveWorldState(WORLD_SAVE_SLOTS.PRE_TOURNAMENT, world, displayName);
}

/**
 * ロード
 */
export async function loadWorldState(slotId: WorldSaveSlotId): Promise<WorldLoadResult> {
  try {
    if (!isLocalStorageAvailable()) {
      return { success: false, error: 'ストレージ利用不可' };
    }

    const raw = lsGet(STORAGE_KEY_PREFIX + slotId);
    if (!raw) {
      return { success: false, error: 'セーブデータが見つかりません' };
    }

    const entry = JSON.parse(raw) as WorldSaveEntry;

    // チェックサム検証
    const expectedChecksum = await computeWorldChecksum(entry.stateJson);
    const checksumMismatch = expectedChecksum !== entry.checksum;
    if (checksumMismatch) {
      console.warn(`[WorldSave] Checksum mismatch for slot ${slotId} — data may be corrupted`);
    }

    // バリデーション
    const rawParsed = JSON.parse(entry.stateJson);
    if (!validateWorldSaveData(rawParsed)) {
      return {
        success: false,
        error: 'セーブデータの形式が不正です。データが破損している可能性があります。',
      };
    }

    // デシリアライズ
    const world = deserializeWorldState(entry.stateJson);

    return { success: true, world, checksumMismatch };
  } catch (e) {
    return {
      success: false,
      error: `ロード失敗: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * セーブ削除
 */
export function deleteWorldSave(slotId: WorldSaveSlotId): void {
  lsRemove(STORAGE_KEY_PREFIX + slotId);
  removeMeta(slotId);
}

/**
 * セーブ一覧（メタデータのみ）
 */
export function listWorldSaves(): WorldSaveSlotMeta[] {
  return loadMetaList().sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * 特定スロットのメタデータ取得
 */
export function getWorldSaveMeta(slotId: WorldSaveSlotId): WorldSaveSlotMeta | null {
  return loadMetaList().find((m) => m.slotId === slotId) ?? null;
}

/**
 * ストレージ使用量（バイト）
 */
export function getStorageUsedBytes(): number {
  return estimateStorageUsed();
}

/**
 * 全世界セーブデータをクリア（デバッグ用）
 */
export function clearAllWorldSaves(): void {
  if (!isLocalStorageAvailable()) return;
  for (const slotId of Object.values(WORLD_SAVE_SLOTS)) {
    lsRemove(STORAGE_KEY_PREFIX + slotId);
  }
  lsRemove(META_LIST_KEY);
}
