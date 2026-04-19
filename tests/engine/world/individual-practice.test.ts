/**
 * tests/engine/world/individual-practice.test.ts
 *
 * Phase 11-A1 Issue #4: 個別練習メニューのテスト。
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { createWorldState } from '@/engine/world/create-world';
import { generatePlayer } from '@/engine/player/generate';
import { advanceWorldDay } from '@/engine/world/world-ticker';
import { processDay } from '@/engine/calendar/day-processor';
import type { WorldState } from '@/engine/world/world-state';

function makeWorld(seed: string): WorldState {
  const rng = createRNG(seed);
  const team = {
    id: 'player-school',
    name: 'テスト高校',
    prefecture: '新潟',
    reputation: 65,
    players: [] as ReturnType<typeof generatePlayer>[],
    lineup: null,
    facilities: { ground: 5, bullpen: 5, battingCage: 5, gym: 5 },
  };
  team.players = Array.from({ length: 20 }, (_, i) =>
    generatePlayer(rng.derive(`p${i}`), { enrollmentYear: 1, schoolReputation: 65 }),
  );
  const manager = {
    name: 'T', yearsActive: 0, fame: 10, totalWins: 0, totalLosses: 0,
    koshienAppearances: 0, koshienWins: 0,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createWorldState(team as any, manager, '新潟', seed, rng);
}

describe('Phase 11-A1 Issue #4: 個別練習メニュー', () => {
  it('個別メニュー未設定なら全員チーム共通メニュー', () => {
    const world = makeWorld('ip-1');
    const rng = createRNG('tick-1');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);
    // 処理が正常終了することだけ確認（全員チームメニューで processDay される）
    const school = nextWorld.schools.find((s) => s.id === nextWorld.playerSchoolId)!;
    expect(school.players.length).toBe(20);
  });

  it('processDay に individualMenus を渡すと該当選手だけ異なるメニューで練習', () => {
    const world = makeWorld('ip-2');
    const school = world.schools.find((s) => s.id === world.playerSchoolId)!;
    const targetId = school.players[0].id;

    // チーム common = rest (能力変化なし), target 選手 = batting_live (能力向上)
    const gameState = {
      version: world.version,
      seed: world.seed,
      currentDate: world.currentDate,
      team: {
        id: school.id,
        name: school.name,
        prefecture: school.prefecture,
        reputation: school.reputation,
        players: school.players,
        lineup: school.lineup,
        facilities: school.facilities,
      },
      manager: world.manager,
      graduates: [],
      settings: world.settings,
    };

    const rng = createRNG('ip-2-rng');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = processDay(gameState as any, 'rest', rng, { [targetId]: 'batting_live' });
    expect(result.nextState.team.players.length).toBe(20);
    // targetPlayer の疲労が他と違うことを確認（batting_live は fatigue load 大）
    const target = result.nextState.team.players.find((p) => p.id === targetId)!;
    const other = result.nextState.team.players.find((p) => p.id !== targetId)!;
    // target は練習した、other は休養
    expect(target.condition.fatigue).toBeGreaterThan(other.condition.fatigue);
  });

  it('HighSchool.individualPracticeMenus が advanceWorldDay に渡される', () => {
    const world = makeWorld('ip-3');
    const school = world.schools.find((s) => s.id === world.playerSchoolId)!;
    const targetId = school.players[0].id;

    // individualPracticeMenus セット
    const modifiedWorld: WorldState = {
      ...world,
      schools: world.schools.map((s) =>
        s.id === world.playerSchoolId
          ? { ...s, individualPracticeMenus: { [targetId]: 'batting_live' } }
          : s,
      ),
    };

    const rng = createRNG('tick-3');
    // チーム共通 = rest、対象選手 = batting_live
    const { nextWorld } = advanceWorldDay(modifiedWorld, 'rest', rng);
    const afterSchool = nextWorld.schools.find((s) => s.id === nextWorld.playerSchoolId)!;
    const target = afterSchool.players.find((p) => p.id === targetId)!;
    const other = afterSchool.players.find((p) => p.id !== targetId)!;

    // 個別メニューで練習したので fatigue が他より高い
    expect(target.condition.fatigue).toBeGreaterThan(other.condition.fatigue);
  });
});
