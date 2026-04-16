/**
 * tests/ui/projectors/playerProjector.test.ts
 *
 * playerProjector のユニットテスト。
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { generatePlayer } from '@/engine/player/generate';
import type { WorldState, HighSchool } from '@/engine/world/world-state';
import {
  createEmptyYearResults,
  createInitialSeasonState,
  createInitialScoutState,
  createDefaultWeeklyPlan,
} from '@/engine/world/world-state';
import { projectPlayer, projectPlayerList } from '@/ui/projectors/playerProjector';

function makeWorldWithPlayer(): { world: WorldState; playerId: string } {
  const rng = createRNG('player-projector-test');
  const player = generatePlayer(rng.derive('p0'), { enrollmentYear: 1, schoolReputation: 60 });

  const playerSchool: HighSchool = {
    id: 'ps',
    name: 'テスト高校',
    prefecture: '東京',
    reputation: 60,
    players: [player],
    lineup: null,
    facilities: { ground: 5, bullpen: 5, battingCage: 5, gym: 5 },
    simulationTier: 'full',
    coachStyle: { offenseType: 'balanced', defenseType: 'balanced', practiceEmphasis: 'balanced', aggressiveness: 50 },
    yearResults: createEmptyYearResults(),
    _summary: null,
  };

  const world: WorldState = {
    version: '0.3.0',
    seed: 'test',
    currentDate: { year: 1, month: 5, day: 1 },
    playerSchoolId: 'ps',
    manager: { name: '監督', yearsActive: 0, fame: 0, totalWins: 0, totalLosses: 0, koshienAppearances: 0, koshienWins: 0 },
    settings: { autoAdvanceSpeed: 'normal', showDetailedGrowth: false },
    weeklyPlan: createDefaultWeeklyPlan(),
    prefecture: '東京',
    schools: [playerSchool],
    middleSchoolPool: [],
    personRegistry: { entries: new Map() },
    seasonState: createInitialSeasonState(),
    scoutState: createInitialScoutState(),
  };

  return { world, playerId: player.id };
}

describe('projectPlayer', () => {
  it('存在しないIDにはnullを返す', () => {
    const { world } = makeWorldWithPlayer();
    expect(projectPlayer(world, 'nonexistent')).toBeNull();
  });

  it('選手情報が正しく射影される', () => {
    const { world, playerId } = makeWorldWithPlayer();
    const view = projectPlayer(world, playerId);

    expect(view).not.toBeNull();
    expect(view!.id).toBe(playerId);
    expect(view!.grade).toBe(1);
    expect(view!.gradeLabel).toBe('1年');
  });

  it('総合力は 0-100 の範囲内', () => {
    const { world, playerId } = makeWorldWithPlayer();
    const view = projectPlayer(world, playerId);

    expect(view!.overall).toBeGreaterThanOrEqual(0);
    expect(view!.overall).toBeLessThanOrEqual(100);
  });

  it('baseStats は 6 項目', () => {
    const { world, playerId } = makeWorldWithPlayer();
    const view = projectPlayer(world, playerId);

    expect(view!.baseStats).toHaveLength(6);
  });

  it('battingStats は 4 項目', () => {
    const { world, playerId } = makeWorldWithPlayer();
    const view = projectPlayer(world, playerId);

    expect(view!.battingStats).toHaveLength(4);
  });

  it('barPercent は 0-100 の範囲内', () => {
    const { world, playerId } = makeWorldWithPlayer();
    const view = projectPlayer(world, playerId);

    for (const stat of [...view!.baseStats, ...view!.battingStats]) {
      expect(stat.barPercent).toBeGreaterThanOrEqual(0);
      expect(stat.barPercent).toBeLessThanOrEqual(100);
    }
  });

  it('通算成績の打率は .XXX 形式', () => {
    const { world, playerId } = makeWorldWithPlayer();
    const view = projectPlayer(world, playerId);

    expect(view!.battingRecord.battingAverage).toMatch(/^\.\d{3}$/);
  });

  it('fullName が lastName + firstName を含む', () => {
    const { world, playerId } = makeWorldWithPlayer();
    const view = projectPlayer(world, playerId);

    expect(view!.fullName).toContain(view!.lastName);
    expect(view!.fullName).toContain(view!.firstName);
  });
});

describe('projectPlayerList', () => {
  it('全選手のリストを返す', () => {
    const { world } = makeWorldWithPlayer();
    const list = projectPlayerList(world);

    expect(list).toHaveLength(1);
  });
});
