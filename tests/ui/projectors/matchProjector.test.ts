/**
 * tests/ui/projectors/matchProjector.test.ts
 *
 * matchProjector のユニットテスト。
 *
 * テストケース:
 * - プレイヤーがホーム側のとき
 * - プレイヤーがアウェイ側のとき
 * - スコアボード情報が正しく変換される
 * - 采配可能性フラグ
 * - ランナー情報の変換
 */

import { describe, it, expect } from 'vitest';
import type {
  MatchState,
  MatchTeam,
  MatchPlayer,
  MatchConfig,
} from '../../../src/engine/match/types';
import { EMPTY_BASES } from '../../../src/engine/match/types';
import { projectMatch } from '../../../src/ui/projectors/matchProjector';
import type { RunnerMode, PauseReason } from '../../../src/engine/match/runner-types';
import type { PitchLogEntry } from '../../../src/ui/projectors/view-state-types';
import { createRNG } from '../../../src/engine/core/rng';
import { generatePlayer, type PlayerGenConfig } from '../../../src/engine/player/generate';

// ============================================================
// テストヘルパー
// ============================================================

function createTestTeam(name: string, seed: string, teamId: string): MatchTeam {
  const rng = createRNG(seed);
  const config: PlayerGenConfig = { enrollmentYear: 1, schoolReputation: 50 };
  const players: MatchPlayer[] = [];

  let pitcherFound = false;
  for (let i = 0; i < 50 && !pitcherFound; i++) {
    const player = generatePlayer(rng.derive(`${name}-find-pitcher-${i}`), config);
    if (player.position === 'pitcher' && player.stats.pitching) {
      players.push({
        player,
        pitchCountInGame: 0,
        stamina: 100,
        confidence: 50,
        isWarmedUp: true,
      });
      pitcherFound = true;
    }
  }
  if (!pitcherFound) throw new Error('Could not generate pitcher');

  for (let i = 1; i < 14; i++) {
    const player = generatePlayer(rng.derive(`${name}-player-${i}`), config);
    players.push({
      player,
      pitchCountInGame: 0,
      stamina: 100,
      confidence: 50,
      isWarmedUp: false,
    });
  }

  const battingPlayers = players.slice(0, 9);
  const benchPlayers = players.slice(9);
  const positions = [
    'pitcher', 'catcher', 'first', 'second', 'third',
    'shortstop', 'left', 'center', 'right',
  ] as const;

  return {
    id: teamId,
    name,
    players,
    battingOrder: battingPlayers.map((p) => p.player.id),
    fieldPositions: new Map(
      battingPlayers.map((p, i) => [p.player.id, positions[i]]),
    ),
    currentPitcherId: players[0].player.id,
    benchPlayerIds: benchPlayers.map((p) => p.player.id),
    usedPlayerIds: new Set(),
  };
}

function createTestState(
  homeTeam: MatchTeam,
  awayTeam: MatchTeam,
  overrides: Partial<MatchState> = {},
): MatchState {
  const config: MatchConfig = {
    innings: 9,
    maxExtras: 3,
    useDH: false,
    isTournament: false,
    isKoshien: false,
  };

  return {
    config,
    homeTeam,
    awayTeam,
    currentInning: 1,
    currentHalf: 'top',
    outs: 0,
    count: { balls: 0, strikes: 0 },
    bases: EMPTY_BASES,
    score: { home: 0, away: 0 },
    inningScores: { home: [], away: [] },
    currentBatterIndex: 0,
    pitchCount: 0,
    log: [],
    isOver: false,
    result: null,
    ...overrides,
  };
}

const defaultRunnerMode: RunnerMode = { time: 'standard', pitch: 'off' };
const emptyPitchLog: PitchLogEntry[] = [];

// ============================================================
// テスト
// ============================================================

describe('matchProjector', () => {

  describe('basic structure', () => {
    it('returns a valid MatchViewState for home player', () => {
      const homeTeam = createTestTeam('桜葉高校', 'proj-home-1', 'sakuraba');
      const awayTeam = createTestTeam('佐渡北商業', 'proj-away-1', 'sadokita');
      const state = createTestState(homeTeam, awayTeam);

      const view = projectMatch(state, 'sakuraba', defaultRunnerMode, emptyPitchLog, null);

      expect(view).toBeDefined();
      expect(view.homeSchoolName).toBe('桜葉高校');
      expect(view.awaySchoolName).toBe('佐渡北商業');
      expect(view.score.home).toBe(0);
      expect(view.score.away).toBe(0);
    });

    it('returns a valid MatchViewState for away player', () => {
      const homeTeam = createTestTeam('桜葉高校', 'proj-home-2', 'sakuraba');
      const awayTeam = createTestTeam('佐渡北商業', 'proj-away-2', 'sadokita');
      const state = createTestState(homeTeam, awayTeam);

      const view = projectMatch(state, 'sadokita', defaultRunnerMode, emptyPitchLog, null);

      expect(view).toBeDefined();
      expect(view.homeSchoolName).toBe('桜葉高校');
      expect(view.awaySchoolName).toBe('佐渡北商業');
    });
  });

  describe('inningLabel', () => {
    it('shows correct inning label for top half', () => {
      const homeTeam = createTestTeam('Home', 'proj-inn-home', 'h');
      const awayTeam = createTestTeam('Away', 'proj-inn-away', 'a');
      const state = createTestState(homeTeam, awayTeam, {
        currentInning: 7,
        currentHalf: 'top',
      });
      const view = projectMatch(state, 'h', defaultRunnerMode, emptyPitchLog, null);
      expect(view.inningLabel).toBe('7回表');
    });

    it('shows correct inning label for bottom half', () => {
      const homeTeam = createTestTeam('Home', 'proj-inn2-home', 'h');
      const awayTeam = createTestTeam('Away', 'proj-inn2-away', 'a');
      const state = createTestState(homeTeam, awayTeam, {
        currentInning: 9,
        currentHalf: 'bottom',
      });
      const view = projectMatch(state, 'h', defaultRunnerMode, emptyPitchLog, null);
      expect(view.inningLabel).toBe('9回裏');
    });
  });

  describe('outsLabel', () => {
    it('shows ノーアウト for 0 outs', () => {
      const homeTeam = createTestTeam('Home', 'proj-outs0-home', 'h');
      const awayTeam = createTestTeam('Away', 'proj-outs0-away', 'a');
      const state = createTestState(homeTeam, awayTeam, { outs: 0 });
      const view = projectMatch(state, 'h', defaultRunnerMode, emptyPitchLog, null);
      expect(view.outsLabel).toBe('ノーアウト');
    });

    it('shows 2アウト for 2 outs', () => {
      const homeTeam = createTestTeam('Home', 'proj-outs2-home', 'h');
      const awayTeam = createTestTeam('Away', 'proj-outs2-away', 'a');
      const state = createTestState(homeTeam, awayTeam, { outs: 2 });
      const view = projectMatch(state, 'h', defaultRunnerMode, emptyPitchLog, null);
      expect(view.outsLabel).toBe('2アウト');
    });
  });

  describe('isPlayerBatting', () => {
    it('is true when player is home team and half is bottom', () => {
      const homeTeam = createTestTeam('Home', 'proj-pb-home', 'home-school');
      const awayTeam = createTestTeam('Away', 'proj-pb-away', 'away-school');
      const state = createTestState(homeTeam, awayTeam, { currentHalf: 'bottom' });
      const view = projectMatch(state, 'home-school', defaultRunnerMode, emptyPitchLog, null);
      expect(view.isPlayerBatting).toBe(true);
    });

    it('is false when player is home team and half is top', () => {
      const homeTeam = createTestTeam('Home', 'proj-pb2-home', 'home-school');
      const awayTeam = createTestTeam('Away', 'proj-pb2-away', 'away-school');
      const state = createTestState(homeTeam, awayTeam, { currentHalf: 'top' });
      const view = projectMatch(state, 'home-school', defaultRunnerMode, emptyPitchLog, null);
      expect(view.isPlayerBatting).toBe(false);
    });

    it('is true when player is away team and half is top', () => {
      const homeTeam = createTestTeam('Home', 'proj-pb3-home', 'home-school');
      const awayTeam = createTestTeam('Away', 'proj-pb3-away', 'away-school');
      const state = createTestState(homeTeam, awayTeam, { currentHalf: 'top' });
      const view = projectMatch(state, 'away-school', defaultRunnerMode, emptyPitchLog, null);
      expect(view.isPlayerBatting).toBe(true);
    });

    it('is false when player is away team and half is bottom', () => {
      const homeTeam = createTestTeam('Home', 'proj-pb4-home', 'home-school');
      const awayTeam = createTestTeam('Away', 'proj-pb4-away', 'away-school');
      const state = createTestState(homeTeam, awayTeam, { currentHalf: 'bottom' });
      const view = projectMatch(state, 'away-school', defaultRunnerMode, emptyPitchLog, null);
      expect(view.isPlayerBatting).toBe(false);
    });
  });

  describe('bases', () => {
    it('shows null for empty bases', () => {
      const homeTeam = createTestTeam('Home', 'proj-bases-home', 'h');
      const awayTeam = createTestTeam('Away', 'proj-bases-away', 'a');
      const state = createTestState(homeTeam, awayTeam);
      const view = projectMatch(state, 'h', defaultRunnerMode, emptyPitchLog, null);
      expect(view.bases.first).toBeNull();
      expect(view.bases.second).toBeNull();
      expect(view.bases.third).toBeNull();
    });

    it('shows runner on first base', () => {
      const homeTeam = createTestTeam('Home', 'proj-bases2-home', 'h');
      const awayTeam = createTestTeam('Away', 'proj-bases2-away', 'a');
      const runnerId = awayTeam.battingOrder[0];
      const state = createTestState(homeTeam, awayTeam, {
        currentHalf: 'top',
        bases: {
          first: { playerId: runnerId, speed: 70 },
          second: null,
          third: null,
        },
      });
      const view = projectMatch(state, 'h', defaultRunnerMode, emptyPitchLog, null);
      expect(view.bases.first).not.toBeNull();
      expect(view.bases.first?.speedClass).toBe('fast');
      expect(view.bases.second).toBeNull();
      expect(view.bases.third).toBeNull();
    });
  });

  describe('canBunt', () => {
    it('is true when runner on first and less than 2 outs', () => {
      const homeTeam = createTestTeam('Home', 'proj-bunt-home', 'h');
      const awayTeam = createTestTeam('Away', 'proj-bunt-away', 'a');
      const runnerId = awayTeam.battingOrder[1];
      const state = createTestState(homeTeam, awayTeam, {
        currentHalf: 'top',
        outs: 0,
        bases: {
          first: { playerId: runnerId, speed: 50 },
          second: null,
          third: null,
        },
      });
      const view = projectMatch(state, 'h', defaultRunnerMode, emptyPitchLog, null);
      expect(view.canBunt).toBe(true);
    });

    it('is false when no runners on base', () => {
      const homeTeam = createTestTeam('Home', 'proj-bunt2-home', 'h');
      const awayTeam = createTestTeam('Away', 'proj-bunt2-away', 'a');
      const state = createTestState(homeTeam, awayTeam);
      const view = projectMatch(state, 'h', defaultRunnerMode, emptyPitchLog, null);
      expect(view.canBunt).toBe(false);
    });

    it('is false when 2 outs', () => {
      const homeTeam = createTestTeam('Home', 'proj-bunt3-home', 'h');
      const awayTeam = createTestTeam('Away', 'proj-bunt3-away', 'a');
      const runnerId = awayTeam.battingOrder[1];
      const state = createTestState(homeTeam, awayTeam, {
        outs: 2,
        bases: {
          first: { playerId: runnerId, speed: 50 },
          second: null,
          third: null,
        },
      });
      const view = projectMatch(state, 'h', defaultRunnerMode, emptyPitchLog, null);
      expect(view.canBunt).toBe(false);
    });
  });

  describe('pitcher info', () => {
    it('shows pitcher name and pitch count', () => {
      const homeTeam = createTestTeam('Home', 'proj-pitcher-home', 'h');
      const awayTeam = createTestTeam('Away', 'proj-pitcher-away', 'a');
      // top: home が守備 → home の投手が表示
      const state = createTestState(homeTeam, awayTeam, { currentHalf: 'top' });

      // 投手に球数を設定
      const pitcherId = homeTeam.currentPitcherId;
      const updatedHome = {
        ...homeTeam,
        players: homeTeam.players.map((mp) =>
          mp.player.id === pitcherId
            ? { ...mp, pitchCountInGame: 42 }
            : mp,
        ),
      };
      const stateWithPitchCount = { ...state, homeTeam: updatedHome };

      const view = projectMatch(stateWithPitchCount, 'h', defaultRunnerMode, emptyPitchLog, null);
      expect(view.pitcher.pitchCount).toBe(42);
      expect(view.pitcher.name).toBeTruthy();
    });

    it('shows correct staminaClass for fresh pitcher', () => {
      const homeTeam = createTestTeam('Home', 'proj-fresh-home', 'h');
      const awayTeam = createTestTeam('Away', 'proj-fresh-away', 'a');
      const state = createTestState(homeTeam, awayTeam, { currentHalf: 'top' });
      const view = projectMatch(state, 'h', defaultRunnerMode, emptyPitchLog, null);
      expect(view.pitcher.staminaClass).toBe('fresh');
      expect(view.pitcher.staminaPct).toBe(1.0);
    });

    it('shows exhausted for very low stamina pitcher', () => {
      const homeTeam = createTestTeam('Home', 'proj-exhaust-home', 'h');
      const awayTeam = createTestTeam('Away', 'proj-exhaust-away', 'a');
      const pitcherId = homeTeam.currentPitcherId;
      const updatedHome = {
        ...homeTeam,
        players: homeTeam.players.map((mp) =>
          mp.player.id === pitcherId
            ? { ...mp, stamina: 5 }
            : mp,
        ),
      };
      const state = createTestState(updatedHome, awayTeam, { currentHalf: 'top' });
      const view = projectMatch(state, 'h', defaultRunnerMode, emptyPitchLog, null);
      expect(view.pitcher.staminaClass).toBe('exhausted');
    });
  });

  describe('pauseReason passthrough', () => {
    it('passes pauseReason through to view', () => {
      const homeTeam = createTestTeam('Home', 'proj-pause-home', 'h');
      const awayTeam = createTestTeam('Away', 'proj-pause-away', 'a');
      const state = createTestState(homeTeam, awayTeam);
      const pauseReason: PauseReason = { kind: 'close_and_late', inning: 9 };
      const view = projectMatch(state, 'h', defaultRunnerMode, emptyPitchLog, pauseReason);
      expect(view.pauseReason).not.toBeNull();
      expect(view.pauseReason?.kind).toBe('close_and_late');
    });

    it('passes null pauseReason through to view', () => {
      const homeTeam = createTestTeam('Home', 'proj-nopause-home', 'h');
      const awayTeam = createTestTeam('Away', 'proj-nopause-away', 'a');
      const state = createTestState(homeTeam, awayTeam);
      const view = projectMatch(state, 'h', defaultRunnerMode, emptyPitchLog, null);
      expect(view.pauseReason).toBeNull();
    });
  });

  describe('runnerMode passthrough', () => {
    it('passes runnerMode through to view', () => {
      const homeTeam = createTestTeam('Home', 'proj-mode-home', 'h');
      const awayTeam = createTestTeam('Away', 'proj-mode-away', 'a');
      const state = createTestState(homeTeam, awayTeam);
      const mode: RunnerMode = { time: 'short', pitch: 'on' };
      const view = projectMatch(state, 'h', mode, emptyPitchLog, null);
      expect(view.runnerMode.time).toBe('short');
      expect(view.runnerMode.pitch).toBe('on');
    });
  });

  describe('recentPitches', () => {
    it('returns last 10 pitches from log', () => {
      const homeTeam = createTestTeam('Home', 'proj-log-home', 'h');
      const awayTeam = createTestTeam('Away', 'proj-log-away', 'a');
      const state = createTestState(homeTeam, awayTeam);

      const pitchLog: PitchLogEntry[] = Array.from({ length: 15 }, (_, i) => ({
        inning: 1,
        half: 'top' as const,
        pitchType: 'fastball',
        outcome: 'ball',
        location: { row: 2, col: 2 },
        batterId: `batter-${i}`,
        batterName: `打者${i}`,
      }));

      const view = projectMatch(state, 'h', defaultRunnerMode, pitchLog, null);
      expect(view.recentPitches.length).toBe(10);
    });

    it('returns all pitches if fewer than 10', () => {
      const homeTeam = createTestTeam('Home', 'proj-log2-home', 'h');
      const awayTeam = createTestTeam('Away', 'proj-log2-away', 'a');
      const state = createTestState(homeTeam, awayTeam);

      const pitchLog: PitchLogEntry[] = Array.from({ length: 5 }, (_, i) => ({
        inning: 1,
        half: 'top' as const,
        pitchType: 'fastball',
        outcome: 'ball',
        location: { row: 2, col: 2 },
        batterId: `batter-${i}`,
        batterName: `打者${i}`,
      }));

      const view = projectMatch(state, 'h', defaultRunnerMode, pitchLog, null);
      expect(view.recentPitches.length).toBe(5);
    });
  });

  describe('score and inningScores', () => {
    it('reflects current score', () => {
      const homeTeam = createTestTeam('Home', 'proj-score-home', 'h');
      const awayTeam = createTestTeam('Away', 'proj-score-away', 'a');
      const state = createTestState(homeTeam, awayTeam, {
        score: { home: 3, away: 5 },
        inningScores: { home: [0, 1, 2], away: [2, 2, 1] },
      });
      const view = projectMatch(state, 'h', defaultRunnerMode, emptyPitchLog, null);
      expect(view.score.home).toBe(3);
      expect(view.score.away).toBe(5);
      expect(view.inningScores.home).toEqual([0, 1, 2]);
      expect(view.inningScores.away).toEqual([2, 2, 1]);
    });
  });
});
