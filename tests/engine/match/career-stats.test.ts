/**
 * tests/engine/match/career-stats.test.ts
 *
 * Issue #6: applyMatchToPlayers で careerStats + bySeason が積まれることを検証。
 */

import { describe, it, expect } from 'vitest';
import { applyMatchToPlayers } from '@/engine/match/result';
import type { Player, CareerRecord } from '@/engine/types/player';

function emptyCareer(): CareerRecord {
  return {
    gamesPlayed: 0, atBats: 0, hits: 0, homeRuns: 0, rbis: 0, stolenBases: 0,
    gamesStarted: 0, inningsPitched: 0, wins: 0, losses: 0, strikeouts: 0, earnedRuns: 0,
  };
}

function makePlayer(id: string, enrollmentYear = 1): Player {
  return {
    id,
    firstName: '太郎',
    lastName: 'テスト',
    enrollmentYear,
    position: 'right',
    subPositions: [],
    battingSide: 'right',
    throwingHand: 'right',
    height: 170,
    weight: 65,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stats: { batting: { contact: 50, power: 50, eye: 50, technique: 50 }, base: { mental: 50 } as any, pitching: null } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    potential: {} as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    condition: { fatigue: 0, injury: null, mood: 'normal' } as any,
    traits: [],
    mentalState: { flags: [] },
    background: { hometown: '', middleSchool: '' },
    careerStats: emptyCareer(),
  };
}

describe('Issue #6: careerStats + bySeason 反映', () => {
  it('打者成績が careerStats に加算される', () => {
    const players = [makePlayer('p1')];
    const batterStats = [{
      playerId: 'p1',
      atBats: 4, hits: 2, homeRuns: 1, rbis: 3, stolenBases: 0,
      walks: 0, strikeouts: 0, doubles: 0, triples: 0, sacrifices: 0,
    }];
    const result = applyMatchToPlayers(players, batterStats, [], 1);
    expect(result[0].careerStats.gamesPlayed).toBe(1);
    expect(result[0].careerStats.atBats).toBe(4);
    expect(result[0].careerStats.hits).toBe(2);
    expect(result[0].careerStats.homeRuns).toBe(1);
    expect(result[0].careerStats.rbis).toBe(3);
  });

  it('currentYear 指定で bySeason に grade 別に積まれる', () => {
    const players = [makePlayer('p1', 1)];
    const batterStats = [{
      playerId: 'p1',
      atBats: 3, hits: 1, homeRuns: 0, rbis: 0, stolenBases: 0,
      walks: 0, strikeouts: 0, doubles: 0, triples: 0, sacrifices: 0,
    }];
    // 入学年 1、現在年 1 → grade 1
    const result = applyMatchToPlayers(players, batterStats, [], 1);
    expect(result[0].careerStats.bySeason?.[1].gamesPlayed).toBe(1);
    expect(result[0].careerStats.bySeason?.[1].atBats).toBe(3);
    expect(result[0].careerStats.bySeason?.[1].hits).toBe(1);
    // 他の学年は 0 の空レコード
    expect(result[0].careerStats.bySeason?.[2].gamesPlayed).toBe(0);
    expect(result[0].careerStats.bySeason?.[3].gamesPlayed).toBe(0);
  });

  it('2年連続で同じ選手が出場すると bySeason[1] → bySeason[2] に振り分けられる', () => {
    let players = [makePlayer('p1', 1)]; // 入学年1

    // 1年時の試合 (currentYear=1, grade=1)
    const season1Stats = [{
      playerId: 'p1',
      atBats: 3, hits: 1, homeRuns: 0, rbis: 0, stolenBases: 0,
      walks: 0, strikeouts: 0, doubles: 0, triples: 0, sacrifices: 0,
    }];
    players = applyMatchToPlayers(players, season1Stats, [], 1);
    expect(players[0].careerStats.bySeason?.[1].atBats).toBe(3);

    // 2年時の試合 (currentYear=2, grade=2)
    const season2Stats = [{
      playerId: 'p1',
      atBats: 4, hits: 2, homeRuns: 0, rbis: 1, stolenBases: 0,
      walks: 0, strikeouts: 0, doubles: 0, triples: 0, sacrifices: 0,
    }];
    players = applyMatchToPlayers(players, season2Stats, [], 2);
    // bySeason[1] は据え置き
    expect(players[0].careerStats.bySeason?.[1].atBats).toBe(3);
    // bySeason[2] に積まれる
    expect(players[0].careerStats.bySeason?.[2].atBats).toBe(4);
    // 通算 (careerStats) は両方合算
    expect(players[0].careerStats.atBats).toBe(7);
    expect(players[0].careerStats.gamesPlayed).toBe(2);
  });

  it('currentYear 未指定なら bySeason は積まれない (後方互換)', () => {
    const players = [makePlayer('p1')];
    const batterStats = [{
      playerId: 'p1',
      atBats: 3, hits: 1, homeRuns: 0, rbis: 0, stolenBases: 0,
      walks: 0, strikeouts: 0, doubles: 0, triples: 0, sacrifices: 0,
    }];
    const result = applyMatchToPlayers(players, batterStats, []);
    expect(result[0].careerStats.gamesPlayed).toBe(1);
    expect(result[0].careerStats.bySeason).toBeUndefined();
  });
});
