/**
 * tests/engine/world/integration.test.ts
 *
 * 統合テスト:
 * - 1年（365日）進行テスト: 全48校が日次進行、大会全試合実行、年度替わりが完走
 * - 5年進行テスト: メモリ使用量とパフォーマンスを計測
 * - 中学生→高校進学で同一ID維持テスト
 * - セーブサイズ確認
 * - パフォーマンス指標
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { advanceWorldDay } from '@/engine/world/world-ticker';
import { createWorldState } from '@/engine/world/create-world';
import { generatePlayer } from '@/engine/player/generate';
import type { WorldState } from '@/engine/world/world-state';

// ============================================================
// テストヘルパー
// ============================================================

function makeFullWorld(): WorldState {
  const rng = createRNG('integration-test-seed');
  const team = {
    id: 'player-school',
    name: '新潟明訓高校',
    prefecture: '新潟',
    reputation: 65,
    players: [],
    lineup: null,
    facilities: { ground: 5, bullpen: 5, battingCage: 5, gym: 5 },
  };

  // generatePlayer で選手を生成
  const players = Array.from({ length: 20 }, (_, i) =>
    generatePlayer(rng.derive(`init-p${i}`), { enrollmentYear: 1, schoolReputation: 65 })
  );
  team.players = players;

  const manager = {
    name: '中村監督',
    yearsActive: 0,
    fame: 10,
    totalWins: 0,
    totalLosses: 0,
    koshienAppearances: 0,
    koshienWins: 0,
  };

  return createWorldState(team as any, manager, '新潟', 'integration-test-seed', rng);
}

function advanceNDays(world: WorldState, n: number, seed: string): {
  world: WorldState;
  elapsedMs: number;
} {
  const rng = createRNG(seed);
  const menus = ['batting_basic', 'pitching_basic', 'fielding_drill', 'running', 'rest',
                  'batting_live', 'strength', 'mental', 'rest'] as const;
  let currentWorld = world;
  const start = Date.now();

  for (let d = 0; d < n; d++) {
    const menu = menus[d % menus.length];
    const dayRng = rng.derive(`day-${d}`);
    const { nextWorld } = advanceWorldDay(currentWorld, menu, dayRng);
    currentWorld = nextWorld;
  }

  return { world: currentWorld, elapsedMs: Date.now() - start };
}

// ============================================================
// テスト
// ============================================================

describe('統合テスト: 1年（365日）進行', () => {
  it('365日の進行が完走する（クラッシュなし）', { timeout: 120000 }, () => {
    const world = makeFullWorld();
    const start = Date.now();

    const { world: finalWorld, elapsedMs } = advanceNDays(world, 365, 'year1-seed');

    const elapsedSec = elapsedMs / 1000;
    console.log(`\n=== 1年進行テスト ===`);
    console.log(`処理時間: ${elapsedSec.toFixed(2)}秒`);
    console.log(`最終日付: Year ${finalWorld.currentDate.year}, ${finalWorld.currentDate.month}月${finalWorld.currentDate.day}日`);
    console.log(`高校数: ${finalWorld.schools.length}`);
    console.log(`総選手数: ${finalWorld.schools.reduce((n, s) => n + s.players.length, 0)}`);
    console.log(`中学生プール: ${finalWorld.middleSchoolPool.length}人`);

    // 年度替わりが実行されたことを確認（4月1日に戻る）
    expect(finalWorld.currentDate.month).toBe(4);
    expect(finalWorld.currentDate.day).toBe(1);

    // 全高校が存在する
    expect(finalWorld.schools.length).toBe(48);

    // 全高校に最低3人の選手がいる
    for (const school of finalWorld.schools) {
      expect(school.players.length).toBeGreaterThanOrEqual(3);
    }

    // セーブデータサイズを確認
    const saveData = JSON.stringify({
      ...finalWorld,
      personRegistry: { entries: [] }, // Map は JSON化できないので除外
    });
    const saveSizeKB = saveData.length / 1024;
    console.log(`セーブデータサイズ: ${saveSizeKB.toFixed(1)} KB`);
    expect(saveSizeKB).toBeGreaterThan(100); // 最低 100KB
  });
});

describe('統合テスト: 5年進行', () => {
  it('5年（1825日）の進行が完走し、パフォーマンス指標を出力する', { timeout: 300000 }, () => {
    const world = makeFullWorld();
    const start = Date.now();

    let currentWorld = world;
    const yearResults: Array<{ year: number; schools: number; players: number; ms: number; elapsed: number }> = [];

    for (let year = 1; year <= 5; year++) {
      const yearStart = Date.now();
      const { world: yearWorld } = advanceNDays(currentWorld, 365, `year${year}-seed`);
      currentWorld = yearWorld;

      yearResults.push({
        year,
        schools: currentWorld.schools.length,
        players: currentWorld.schools.reduce((n, s) => n + s.players.length, 0),
        ms: currentWorld.middleSchoolPool.length,
        elapsed: Date.now() - yearStart,
      });
    }

    const totalElapsed = Date.now() - start;

    console.log(`\n=== 5年進行テスト ===`);
    console.log(`合計処理時間: ${(totalElapsed / 1000).toFixed(2)}秒`);
    console.log(`\n年次サマリ:`);
    for (const yr of yearResults) {
      console.log(`  Year ${yr.year}: 高校${yr.schools}校, 選手${yr.players}人, 中学生${yr.ms}人, ${(yr.elapsed/1000).toFixed(2)}秒`);
    }

    // メモリ使用量の確認
    const saveData = JSON.stringify({
      ...currentWorld,
      personRegistry: { entries: [] },
    });
    const saveSizeKB = saveData.length / 1024;
    console.log(`\n5年後セーブデータサイズ: ${saveSizeKB.toFixed(1)} KB`);

    // 5年後でも全高校が存在する
    expect(currentWorld.schools.length).toBe(48);

    // 5年分の処理が規定時間内（300秒）に完了
    expect(totalElapsed).toBeLessThan(300000);
  });
});

describe('統合テスト: 中学生→高校進学で同一ID維持', () => {
  it('中学3年生が高校入学後もIDが変わらない', () => {
    const world = makeFullWorld();

    // 中学3年生のIDを記録
    const grade3Ids = world.middleSchoolPool
      .filter((ms) => ms.middleSchoolGrade === 3)
      .map((ms) => ms.id)
      .slice(0, 5); // 5人分チェック

    expect(grade3Ids.length).toBeGreaterThan(0);

    // 年度末まで進行（3月31日 → 4月1日）
    const rng = createRNG('id-consistency');
    let currentWorld = world;

    // 3/31まで進める
    for (let d = 0; d < 364; d++) {
      const { nextWorld } = advanceWorldDay(currentWorld, 'batting_basic', rng.derive(`d${d}`));
      currentWorld = nextWorld;
    }

    // 4/1（年度替わり）を実行
    const { nextWorld: afterTransition } = advanceWorldDay(currentWorld, 'batting_basic', rng.derive('final'));

    // 各 grade3Id が高校の選手として存在するか確認
    const allPlayerIds = afterTransition.schools.flatMap((s) => s.players.map((p) => p.id));

    let foundCount = 0;
    for (const msId of grade3Ids) {
      if (allPlayerIds.includes(msId)) {
        foundCount++;
      }
    }

    console.log(`\n=== ID一貫性テスト ===`);
    console.log(`中学3年生 ${grade3Ids.length}人中 ${foundCount}人が高校生として確認`);

    // 少なくとも一部の中学生が高校に入学している
    expect(foundCount).toBeGreaterThan(0);
  });
});

describe('統合テスト: forgotten 降格（PersonRegistry）', () => {
  it('WorldState の personRegistry が初期化されている', () => {
    const world = makeFullWorld();
    expect(world.personRegistry).toBeDefined();
    expect(world.personRegistry.entries).toBeDefined();
  });
});

describe('統合テスト: セーブデータサイズ確認', () => {
  it('初期 WorldState のサイズを出力する', () => {
    const world = makeFullWorld();
    const saveData = JSON.stringify({
      ...world,
      personRegistry: { entries: [] }, // Map は除外
    });
    const sizeKB = saveData.length / 1024;
    const sizeMB = sizeKB / 1024;

    console.log(`\n=== セーブデータサイズ ===`);
    console.log(`初期 WorldState: ${sizeKB.toFixed(1)} KB (${sizeMB.toFixed(2)} MB)`);
    console.log(`高校数: ${world.schools.length}`);
    console.log(`総選手数: ${world.schools.reduce((n, s) => n + s.players.length, 0)}`);
    console.log(`中学生プール: ${world.middleSchoolPool.length}人`);

    // 初期データは少なくとも100KB（48校 × 20選手）
    expect(sizeKB).toBeGreaterThan(100);
    // 初期データは 50MB 未満（設計目標 5-20MB）
    expect(sizeMB).toBeLessThan(50);
  });
});
