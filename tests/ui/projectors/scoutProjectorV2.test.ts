/**
 * tests/ui/projectors/scoutProjectorV2.test.ts
 *
 * Phase 4.1 の scoutProjector 改善テスト。
 * - statusBadge フィールド
 * - scoutCommentBrief フィールド
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import type { WorldState, HighSchool, MiddleSchoolPlayer } from '@/engine/world/world-state';
import {
  createEmptyYearResults,
  createInitialSeasonState,
  createDefaultWeeklyPlan,
} from '@/engine/world/world-state';
import { generatePlayer } from '@/engine/player/generate';
import { projectScout } from '@/ui/projectors/scoutProjector';

function makeTestStats() {
  return {
    base: { stamina: 15, speed: 20, armStrength: 12, fielding: 14, focus: 16, mental: 18 },
    batting: { contact: 15, power: 12, eye: 13, technique: 14 },
    pitching: null,
  };
}

function makeTestWorld(opts: {
  withReport?: boolean;
  targetSchoolId?: string | null;
  scoutedBy?: string[];
} = {}): WorldState {
  const {
    withReport = false,
    targetSchoolId = null,
    scoutedBy = [],
  } = opts;

  const rng = createRNG('scout-projector-v2-test');
  const player = generatePlayer(rng.derive('p'), { enrollmentYear: 1, schoolReputation: 60 });

  const playerSchool: HighSchool = {
    id: 'ps',
    name: '桜葉高校',
    prefecture: '新潟',
    reputation: 60,
    players: [player],
    lineup: null,
    facilities: { ground: 4, bullpen: 4, battingCage: 4, gym: 4 },
    simulationTier: 'full',
    coachStyle: { offenseType: 'balanced', defenseType: 'balanced', practiceEmphasis: 'balanced', aggressiveness: 50 },
    yearResults: createEmptyYearResults(),
    _summary: null,
  };

  const ms1: MiddleSchoolPlayer = {
    id: 'ms-1',
    firstName: '太郎',
    lastName: '田中',
    middleSchoolGrade: 3,
    middleSchoolName: '新潟第一中学',
    prefecture: '新潟',
    currentStats: makeTestStats(),
    targetSchoolId,
    scoutedBy,
  };

  const scoutReports = new Map<string, {
    estimatedQuality: 'S' | 'A' | 'B' | 'C' | 'D';
    confidence: number;
    scoutComment: string;
    observedStats: ReturnType<typeof makeTestStats>;
  }>();

  if (withReport) {
    scoutReports.set('ms-1', {
      estimatedQuality: 'A',
      confidence: 0.8,
      scoutComment: 'これは40文字を超える長いスカウトコメントのサンプルです。ここは省略されるはずです。',
      observedStats: makeTestStats(),
    });
  }

  return {
    version: '0.3.0',
    seed: 'test',
    currentDate: { year: 1, month: 5, day: 1 },
    playerSchoolId: 'ps',
    manager: { name: '監督', yearsActive: 0, fame: 0, totalWins: 0, totalLosses: 0, koshienAppearances: 0, koshienWins: 0 },
    settings: { autoAdvanceSpeed: 'normal', showDetailedGrowth: false },
    weeklyPlan: createDefaultWeeklyPlan(),
    prefecture: '新潟',
    schools: [playerSchool],
    middleSchoolPool: [ms1],
    personRegistry: { entries: new Map() },
    seasonState: createInitialSeasonState(),
    scoutState: {
      watchList: ['ms-1'],
      scoutReports,
      recruitAttempts: new Map(),
      monthlyScoutBudget: 4,
      usedScoutThisMonth: 1,
    },
  };
}

// ============================================================
// テスト
// ============================================================

describe('scoutProjector Phase 4.1', () => {
  describe('statusBadge', () => {
    it('視察なし・スカウトレポートなし → unvisited', () => {
      const world = makeTestWorld({ withReport: false, scoutedBy: [] });
      const view = projectScout(world);
      const p = view.watchList.find((w) => w.id === 'ms-1');
      expect(p?.statusBadge).toBe('unvisited');
    });

    it('スカウトレポートあり → visited', () => {
      const world = makeTestWorld({ withReport: true, scoutedBy: [] });
      const view = projectScout(world);
      const p = view.watchList.find((w) => w.id === 'ms-1');
      expect(p?.statusBadge).toBe('visited');
    });

    it('勧誘済み（scoutedBy に含まれる） → recruited', () => {
      const world = makeTestWorld({ scoutedBy: ['ps'] });
      const view = projectScout(world);
      const p = view.watchList.find((w) => w.id === 'ms-1');
      expect(p?.statusBadge).toBe('recruited');
    });

    it('自校が targetSchoolId → confirmed', () => {
      const world = makeTestWorld({ targetSchoolId: 'ps' });
      const view = projectScout(world);
      const p = view.watchList.find((w) => w.id === 'ms-1');
      expect(p?.statusBadge).toBe('confirmed');
    });

    it('他校が targetSchoolId → competing', () => {
      const world = makeTestWorld({ targetSchoolId: 'other-school' });
      const view = projectScout(world);
      const p = view.watchList.find((w) => w.id === 'ms-1');
      expect(p?.statusBadge).toBe('competing');
    });
  });

  describe('scoutCommentBrief', () => {
    it('スカウトレポートなし → scoutCommentBrief は null', () => {
      const world = makeTestWorld({ withReport: false });
      const view = projectScout(world);
      const p = view.watchList.find((w) => w.id === 'ms-1');
      expect(p?.scoutCommentBrief).toBeNull();
    });

    it('スカウトレポートあり → scoutCommentBrief は 40 文字以内', () => {
      const world = makeTestWorld({ withReport: true });
      const view = projectScout(world);
      const p = view.watchList.find((w) => w.id === 'ms-1');
      expect(p?.scoutCommentBrief).not.toBeNull();
      // 40文字 + "…" で最大41文字
      expect(p!.scoutCommentBrief!.length).toBeLessThanOrEqual(41);
    });

    it('短いコメントはそのまま返る', () => {
      const world = makeTestWorld({ withReport: false });
      // scoutReports を手動で追加
      const shortComment = '短いコメント';
      world.scoutState.scoutReports.set('ms-1', {
        estimatedQuality: 'B',
        confidence: 0.6,
        scoutComment: shortComment,
        observedStats: makeTestStats() as any,
      });
      const view = projectScout(world);
      const p = view.watchList.find((w) => w.id === 'ms-1');
      expect(p?.scoutCommentBrief).toBe(shortComment);
    });
  });
});
