import { describe, it, expect } from 'vitest';
import { addPlayer, removePlayer, getPlayersByGrade, getActiveRoster, getRosterSize, findPlayerById } from '@/engine/team/roster';
import { autoGenerateLineup, validateLineup, createLineup, swapBattingOrder, substitutePlayer } from '@/engine/team/lineup';
import { processGraduation, processEnrollment, toGraduateRecord, processYearTransition } from '@/engine/team/enrollment';
import { generatePlayer, type PlayerGenConfig } from '@/engine/player/generate';
import { createRNG } from '@/engine/core/rng';
import type { Team } from '@/engine/types/team';
import type { GameState } from '@/engine/types/game-state';

function makeTeam(playerCount: number, seed: string, enrollmentYear = 1): Team {
  const rng = createRNG(seed);
  const players = Array.from({ length: playerCount }, (_, i) =>
    generatePlayer(rng.derive(`p${i}`), { enrollmentYear, schoolReputation: 50 })
  );
  return {
    id: 'team-1',
    name: 'テスト高校',
    prefecture: '新潟',
    reputation: 50,
    players,
    lineup: null,
    facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 },
  };
}

describe('roster 管理', () => {
  it('addPlayer が選手を追加する', () => {
    const team = makeTeam(5, 'roster-add');
    const rng = createRNG('new-player');
    const newPlayer = generatePlayer(rng, { enrollmentYear: 1, schoolReputation: 50 });
    const updated = addPlayer(team, newPlayer);
    expect(updated.players).toHaveLength(6);
    expect(updated.players[5].id).toBe(newPlayer.id);
  });

  it('removePlayer が選手を削除する', () => {
    const team = makeTeam(5, 'roster-remove');
    const targetId = team.players[2].id;
    const updated = removePlayer(team, targetId);
    expect(updated.players).toHaveLength(4);
    expect(updated.players.find(p => p.id === targetId)).toBeUndefined();
  });

  it('getPlayersByGrade が学年でフィルタする', () => {
    const rng = createRNG('grade-filter');
    const year1 = Array.from({ length: 5 }, (_, i) =>
      generatePlayer(rng.derive(`y1-${i}`), { enrollmentYear: 1, schoolReputation: 50 })
    );
    const year2 = Array.from({ length: 4 }, (_, i) =>
      generatePlayer(rng.derive(`y2-${i}`), { enrollmentYear: 0, schoolReputation: 50 })
    );
    const team: Team = {
      ...makeTeam(0, 'empty'),
      players: [...year1, ...year2],
    };
    const grade1 = getPlayersByGrade(team, 1, 1);
    expect(grade1).toHaveLength(5);
    const grade2 = getPlayersByGrade(team, 2, 1);
    expect(grade2).toHaveLength(4);
  });

  it('getActiveRoster が怪我していない選手を返す', () => {
    const team = makeTeam(10, 'active-roster');
    // 2人を怪我状態にする
    const injuredTeam = {
      ...team,
      players: team.players.map((p, i) =>
        i < 2 ? {
          ...p,
          condition: {
            ...p.condition,
            injury: { type: 'テスト', severity: 'minor' as const, remainingDays: 3, startDate: { year: 1, month: 4, day: 1 } },
          },
        } : p
      ),
    };
    expect(getActiveRoster(injuredTeam)).toHaveLength(8);
  });

  it('getRosterSize が正しい人数を返す', () => {
    const team = makeTeam(15, 'size-test');
    expect(getRosterSize(team)).toBe(15);
  });

  it('findPlayerById が正しい選手を返す', () => {
    const team = makeTeam(10, 'find-test');
    const target = team.players[5];
    expect(findPlayerById(team, target.id)?.id).toBe(target.id);
  });

  it('findPlayerById が存在しないIDで undefined を返す', () => {
    const team = makeTeam(5, 'notfound-test');
    expect(findPlayerById(team, 'nonexistent')).toBeUndefined();
  });
});

describe('lineup', () => {
  it('autoGenerateLineup が9人のスターターを生成する', () => {
    const team = makeTeam(15, 'lineup-auto');
    const lineup = autoGenerateLineup(team, 1);
    expect(lineup.starters).toHaveLength(9);
    expect(lineup.battingOrder.length).toBeGreaterThanOrEqual(9);
  });

  it('autoGenerateLineup が投手を含む', () => {
    // 投手を確実に含むチームを生成
    const rng = createRNG('lineup-pitcher');
    const pitchers = Array.from({ length: 3 }, (_, i) =>
      generatePlayer(rng.derive(`pitcher-${i}`), { enrollmentYear: 1, schoolReputation: 50, forcePosition: 'pitcher' })
    );
    const fielders = Array.from({ length: 12 }, (_, i) =>
      generatePlayer(rng.derive(`fielder-${i}`), { enrollmentYear: 1, schoolReputation: 50, forcePosition: 'shortstop' })
    );
    const team: Team = {
      ...makeTeam(0, 'empty'),
      players: [...pitchers, ...fielders],
    };
    const lineup = autoGenerateLineup(team, 1);
    const hasPitcher = lineup.starters.some(s => s.position === 'pitcher');
    expect(hasPitcher).toBe(true);
  });

  it('validateLineup が有効なラインナップを受け入れる', () => {
    const team = makeTeam(15, 'validate-test');
    const lineup = autoGenerateLineup(team, 1);
    const result = validateLineup(lineup, team);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('swapBattingOrder が打順を入れ替える', () => {
    const team = makeTeam(15, 'swap-test');
    const lineup = autoGenerateLineup(team, 1);
    const swapped = swapBattingOrder(lineup, 0, 3);
    expect(swapped.battingOrder[0]).toBe(lineup.battingOrder[3]);
    expect(swapped.battingOrder[3]).toBe(lineup.battingOrder[0]);
  });
});

describe('enrollment / graduation', () => {
  it('toGraduateRecord が軽量サマリを生成する', () => {
    const rng = createRNG('grad-record');
    const player = generatePlayer(rng, { enrollmentYear: 1, schoolReputation: 50 });
    const record = toGraduateRecord(player, 3);

    expect(record.playerId).toBe(player.id);
    expect(record.firstName).toBe(player.firstName);
    expect(record.lastName).toBe(player.lastName);
    expect(record.graduationYear).toBe(3);
    expect(record.finalStats.overall).toBeGreaterThan(0);
    expect(record.careerStats).toEqual(player.careerStats);
    // Player丸ごとではなく必要フィールドのみ
    expect((record as any).stats).toBeUndefined();
    expect((record as any).potential).toBeUndefined();
    expect((record as any).mentalState).toBeUndefined();
    expect((record as any).condition).toBeUndefined();
  });

  it('processGraduation が3年生を卒業させる', () => {
    const rng = createRNG('graduation-test');
    // enrollmentYear=1 → currentYear=3 で grade=3 → 卒業対象
    const thirdYears = Array.from({ length: 5 }, (_, i) =>
      generatePlayer(rng.derive(`3rd-${i}`), { enrollmentYear: 1, schoolReputation: 50 })
    ).map(p => ({ ...p, enrollmentYear: 1 }));
    // enrollmentYear=2 → currentYear=3 で grade=2 → 卒業対象外
    const underclass = Array.from({ length: 10 }, (_, i) =>
      generatePlayer(rng.derive(`under-${i}`), { enrollmentYear: 2, schoolReputation: 50 })
    ).map(p => ({ ...p, enrollmentYear: 2 }));
    const team: Team = {
      ...makeTeam(0, 'empty'),
      players: [...thirdYears, ...underclass],
    };

    const { team: newTeam, graduates } = processGraduation(team, 3);
    expect(graduates).toHaveLength(5);
    expect(newTeam.players).toHaveLength(10);
  });

  it('processEnrollment が新入生を追加する', () => {
    const rng = createRNG('enrollment-test');
    const team = makeTeam(10, 'enroll-base');
    const { team: newTeam, newPlayers } = processEnrollment(team, 2, 50, rng);
    expect(newTeam.players.length).toBeGreaterThan(10);
    expect(newPlayers.length).toBeGreaterThanOrEqual(3);
    // 新入生の入学年がcurrentYear
    for (const p of newPlayers) {
      expect(p.enrollmentYear).toBe(2);
    }
  });
});
