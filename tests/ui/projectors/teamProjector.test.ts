/**
 * tests/ui/projectors/teamProjector.test.ts
 *
 * teamProjector のユニットテスト。
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { generatePlayer } from '@/engine/player/generate';
import { autoGenerateLineup } from '@/engine/team/lineup';
import type { WorldState, HighSchool } from '@/engine/world/world-state';
import {
  createEmptyYearResults,
  createInitialSeasonState,
  createInitialScoutState,
  createDefaultWeeklyPlan,
} from '@/engine/world/world-state';
import { projectTeam, positionToLabel, overallToRank } from '@/ui/projectors/teamProjector';

// ============================================================
// テストヘルパー
// ============================================================

function makeTeamWorld(playerCount = 15): WorldState {
  const rng = createRNG('team-projector-test');
  const players = Array.from({ length: playerCount }, (_, i) =>
    generatePlayer(rng.derive(`p${i}`), { enrollmentYear: 1, schoolReputation: 60 })
  );

  const team = {
    id: 'ps',
    name: '桜葉高校',
    prefecture: '新潟',
    reputation: 70,
    players,
    lineup: null as null,
    facilities: { ground: 5, bullpen: 5, battingCage: 5, gym: 5 },
  };
  const lineup = autoGenerateLineup(team, 1);

  const playerSchool: HighSchool = {
    ...team,
    lineup,
    simulationTier: 'full',
    coachStyle: { offenseType: 'balanced', defenseType: 'balanced', practiceEmphasis: 'balanced', aggressiveness: 50 },
    yearResults: createEmptyYearResults(),
    _summary: null,
  };

  return {
    version: '0.3.0',
    seed: 'test',
    currentDate: { year: 1, month: 5, day: 1 },
    playerSchoolId: 'ps',
    manager: { name: '監督', yearsActive: 0, fame: 10, totalWins: 0, totalLosses: 0, koshienAppearances: 0, koshienWins: 0 },
    settings: { autoAdvanceSpeed: 'normal', showDetailedGrowth: false },
    weeklyPlan: createDefaultWeeklyPlan(),
    prefecture: '新潟',
    schools: [playerSchool],
    middleSchoolPool: [],
    personRegistry: { entries: new Map() },
    seasonState: createInitialSeasonState(),
    scoutState: createInitialScoutState(),
  };
}

// ============================================================
// テスト
// ============================================================

describe('projectTeam', () => {
  it('学校名・都道府県が正しく反映される', () => {
    const world = makeTeamWorld();
    const view = projectTeam(world);

    expect(view.schoolName).toBe('桜葉高校');
    expect(view.prefecture).toBe('新潟');
  });

  it('評判ラベルが適切な値を返す', () => {
    const world = makeTeamWorld();
    const view = projectTeam(world);

    // reputation=70 → "強豪"
    expect(view.reputationLabel).toBe('強豪');
  });

  it('選手数が正しい', () => {
    const world = makeTeamWorld(18);
    const view = projectTeam(world);

    expect(view.players).toHaveLength(18);
  });

  it('選手の総合力は 0-100 の範囲内', () => {
    const world = makeTeamWorld();
    const view = projectTeam(world);

    for (const player of view.players) {
      expect(player.overall).toBeGreaterThanOrEqual(0);
      expect(player.overall).toBeLessThanOrEqual(100);
    }
  });

  it('背番号が連番で付与される', () => {
    const world = makeTeamWorld(5);
    const view = projectTeam(world);

    expect(view.players[0].uniformNumber).toBe(1);
    expect(view.players[4].uniformNumber).toBe(5);
  });

  it('チーム総合力は 0-100 の範囲内', () => {
    const world = makeTeamWorld();
    const view = projectTeam(world);

    expect(view.totalStrength).toBeGreaterThanOrEqual(0);
    expect(view.totalStrength).toBeLessThanOrEqual(100);
  });

  it('ラインナップが存在する場合 lineup が null でない', () => {
    const world = makeTeamWorld();
    const view = projectTeam(world);

    expect(view.lineup).not.toBeNull();
  });

  it('学年ラベルが正しい', () => {
    const world = makeTeamWorld();
    const view = projectTeam(world);

    // enrollmentYear=1, currentYear=1 → grade=1
    const grade1Players = view.players.filter((p) => p.grade === 1);
    expect(grade1Players.length).toBeGreaterThan(0);
    expect(grade1Players[0].gradeLabel).toBe('1年');
  });
});

describe('positionToLabel', () => {
  it('投手が正しく変換される', () => {
    expect(positionToLabel('pitcher')).toBe('投手');
  });
  it('捕手が正しく変換される', () => {
    expect(positionToLabel('catcher')).toBe('捕手');
  });
  it('遊撃手が正しく変換される', () => {
    expect(positionToLabel('shortstop')).toBe('遊撃手');
  });
});

describe('overallToRank', () => {
  it('75以上はSランク', () => {
    expect(overallToRank(75)).toBe('S');
    expect(overallToRank(100)).toBe('S');
  });
  it('60-74はAランク', () => {
    expect(overallToRank(60)).toBe('A');
    expect(overallToRank(74)).toBe('A');
  });
  it('45-59はBランク', () => {
    expect(overallToRank(50)).toBe('B');
  });
  it('0以下はEランク', () => {
    expect(overallToRank(0)).toBe('E');
  });
});
