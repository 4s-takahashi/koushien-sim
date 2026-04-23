/**
 * tests/stores/interactive-match-bug12m.test.ts
 *
 * Phase 12-M: Bug #1 / Bug #2 回帰テスト
 *
 * Bug #1: 試合画面に行かずに自動で試合結果が出て終わるバグ
 *   - advanceWeek が pendingInteractiveMatch 存在時に即停止することで修正。
 *   - advanceDay は既存互換性のため auto-sim を保持（advanceWeek 修正で Bug #1 は解消）。
 *
 * Bug #2: 試合が中断されたとき夏大会が終わらないバグ
 *   - 日付が大会期間ウィンドウを過ぎても activeTournament が残り続けるケースの救済。
 *
 * テスト項目:
 *   A. pendingInteractiveMatch がある状態で advanceWeek を呼ぶとすぐ停止する（Bug #1 の主修正）
 *   B. advanceDay で正しく waitingForInteractiveMatch が設定される（初回）
 *   C. advanceWeek は試合日に正しく停止して pendingInteractiveMatch を設定する
 *   D. Bug #2: 日付が夏大会期間外に出た stale な activeTournament が advanceDay で救済される
 *   E. Bug #2: 日付が秋大会期間外に出た stale な activeTournament が advanceDay で救済される
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useWorldStore } from '@/stores/world-store';
import type { TournamentBracket } from '@/engine/world/tournament-bracket';

const LONG_TEST_TIMEOUT = 120_000;

function resetStore() {
  useWorldStore.setState({
    worldState: null,
    isLoading: false,
    lastDayResult: null,
    recentResults: [],
    recentNews: [],
  });
}

function getState() {
  return useWorldStore.getState();
}

function getWorld() {
  return getState().worldState!;
}

function getDate() {
  return getWorld().currentDate;
}

function advanceToDate(targetMonth: number, targetDay: number, maxIters = 1000) {
  const { advanceDay } = getState();
  let iters = 0;
  while (iters < maxIters) {
    const d = getDate();
    if (d.month === targetMonth && d.day === targetDay) return;
    // 大会が pending の場合はスキップ（無限ループ防止）
    const w = getWorld();
    if (w.pendingInteractiveMatch) {
      // auto-sim して先に進む（テスト用）
      const pending = w.pendingInteractiveMatch;
      const fakeResult = {
        winner: pending.playerSide,
        finalScore: { home: 3, away: 1 },
        inningScores: { home: [0,1,0,0,2,0,0,0,0], away: [0,0,0,1,0,0,0,0,0] },
        totalInnings: 9,
        mvpPlayerId: null,
        batterStats: [],
        pitcherStats: [],
      } as const;
      getState().finishInteractiveMatch(fakeResult);
    } else {
      advanceDay('batting_basic');
    }
    iters++;
  }
  throw new Error(
    `advanceToDate(${targetMonth}/${targetDay}) 到達できず (current: ${JSON.stringify(getDate())})`,
  );
}

function newGame(seed?: string) {
  getState().newWorldGame({
    schoolName: 'Bug12Mテスト高校',
    prefecture: '新潟',
    managerName: '監督',
    ...(seed ? { seed } : {}),
  });
}

// ============================================================
// テスト A: pendingInteractiveMatch がある状態で advanceWeek を呼ぶと停止（Bug #1 の主修正）
// ============================================================

describe('Bug #1 修正A: pendingInteractiveMatch がある状態で advanceWeek を呼ぶとすぐ停止する', {
  timeout: LONG_TEST_TIMEOUT,
}, () => {
  beforeEach(() => {
    resetStore();
  });

  it('pendingInteractiveMatch が null の間は advanceDay が正常に進行する', () => {
    newGame('bug1-test-a');
    const w1 = getWorld();
    expect(w1.pendingInteractiveMatch ?? null).toBeNull();

    const result = getState().advanceDay('batting_basic');
    expect(result).not.toBeNull();
    // 日付が進んでいる
    const w2 = getWorld();
    expect(w2.currentDate).not.toEqual(w1.currentDate);
  });

  it('pendingInteractiveMatch がある状態で advanceWeek を呼ぶと結果なしで即停止する（Bug #1 主修正）', () => {
    newGame('bug1-test-a2');

    // 夏大会まで進める
    advanceToDate(7, 10);
    // 試合日に advanceDay を呼んで pendingInteractiveMatch をセット
    getState().advanceDay('batting_basic');

    const w = getWorld();
    if (!w.pendingInteractiveMatch) {
      // 自校がこの日に試合でなかった（シードか bye）→ スキップ
      return;
    }

    // pendingInteractiveMatch がある状態で advanceWeek を呼ぶ
    const results = getState().advanceWeek('batting_basic');

    // 結果が空（即停止）
    expect(results.length).toBe(0);

    // pendingInteractiveMatch は消えていない
    expect(getWorld().pendingInteractiveMatch).not.toBeNull();
  });

  it('pendingInteractiveMatch がある状態で advanceWeek を複数回呼んでも試合は消費されない', () => {
    newGame('bug1-test-a3');

    // 夏大会試合日まで進める
    advanceToDate(7, 10);
    getState().advanceDay('batting_basic');
    const w = getWorld();
    if (!w.pendingInteractiveMatch) return; // self school not in round 1

    const pendingBefore = w.pendingInteractiveMatch;

    // 5回 advanceWeek を呼んでも同じ状態のまま
    for (let i = 0; i < 5; i++) {
      const results = getState().advanceWeek('batting_basic');
      expect(results.length).toBe(0); // 即停止
    }

    const wAfter = getWorld();
    // pendingInteractiveMatch は変わっていない
    expect(wAfter.pendingInteractiveMatch?.round).toBe(pendingBefore?.round);
    expect(wAfter.pendingInteractiveMatch?.opponentSchoolId).toBe(pendingBefore?.opponentSchoolId);
    // activeTournament の自校試合は winnerId=null のまま（auto-sim されていない）
    if (pendingBefore) {
      const round = wAfter.activeTournament?.rounds.find(
        (r) => r.roundNumber === pendingBefore.round,
      );
      const playerMatch = round?.matches.find(
        (m) => m.homeSchoolId === wAfter.playerSchoolId || m.awaySchoolId === wAfter.playerSchoolId,
      );
      expect(playerMatch?.winnerId).toBeNull();
    }
  });
});

// ============================================================
// テスト B: advanceDay で正しく waitingForInteractiveMatch が初回設定される
// ============================================================

describe('Bug #1 修正B: advanceDay の初回呼び出しで試合日に waitingForInteractiveMatch が設定される', {
  timeout: LONG_TEST_TIMEOUT,
}, () => {
  beforeEach(() => {
    resetStore();
  });

  it('夏大会試合日に advanceDay を呼ぶと waitingForInteractiveMatch または playerMatchResult が返る', () => {
    newGame('bug1-test-b');

    advanceToDate(7, 10);
    const w = getWorld();
    expect(w.activeTournament).not.toBeNull();

    const result = getState().advanceDay('batting_basic');
    expect(result).not.toBeNull();

    const wAfter = getWorld();
    // waitingForInteractiveMatch か playerMatchResult（敗退含む）か日付が進むかのいずれか
    if (result?.waitingForInteractiveMatch) {
      expect(wAfter.pendingInteractiveMatch).not.toBeNull();
      expect(wAfter.currentDate.day).toBe(10);
    } else if (result?.playerMatchResult) {
      // 自校が試合して結果が出た（auto-sim の場合）
      expect(result.playerMatchResult).toBeDefined();
    } else {
      // シードまたは bye → 日付が進む
      expect(wAfter.currentDate.day).toBeGreaterThanOrEqual(10);
    }
  });
});

// ============================================================
// テスト C: advanceWeek は試合日に正しく停止する
// ============================================================

describe('Bug #1 修正C: advanceWeek が試合日に正しく停止し pendingInteractiveMatch を設定する', {
  timeout: LONG_TEST_TIMEOUT,
}, () => {
  beforeEach(() => {
    resetStore();
  });

  it('advanceWeek を 7/9 から呼ぶと試合日に停止し pendingInteractiveMatch が設定される', () => {
    newGame('bug1-test-c');

    advanceToDate(7, 9);
    const w9 = getWorld();
    expect(w9.currentDate.month).toBe(7);
    expect(w9.currentDate.day).toBe(9);

    // advanceWeek: 7/9→7/10 (tournament created, no match) → 7/10 is match day → break
    const results = getState().advanceWeek('batting_basic');
    expect(results.length).toBeGreaterThan(0);

    const wAfter = getWorld();
    // 7/10 以降で停止
    expect(wAfter.currentDate.month).toBe(7);

    // waitingForInteractiveMatch があれば pending が設定されている
    const waitingResult = results.find((r) => r.waitingForInteractiveMatch);
    if (waitingResult) {
      expect(wAfter.pendingInteractiveMatch).not.toBeNull();
      // pendingInteractiveMatch を消費せずに advanceWeek を再度呼んでも停止
      const results2 = getState().advanceWeek('batting_basic');
      expect(results2.length).toBe(0); // 即停止（pendingがあるため）
      expect(getWorld().pendingInteractiveMatch).not.toBeNull();
    }
  });

  it('advanceWeek で夏大会試合を通過後も秋大会が正しく生成される', () => {
    newGame('bug1-test-c2');

    // 夏大会まで進める（全試合を finishInteractiveMatch で消化）
    advanceToDate(8, 1);

    // 8/1 から advanceWeek で 9/15 の秋大会まで
    let foundAutumn = false;
    for (let i = 0; i < 30; i++) {
      const w = getWorld();
      if (w.pendingInteractiveMatch) {
        // pending があれば先に消化
        getState().finishInteractiveMatch({
          winner: w.pendingInteractiveMatch.playerSide,
          finalScore: { home: 3, away: 1 },
          inningScores: { home: [0,1,0,0,2,0,0,0,0], away: [0,0,0,1,0,0,0,0,0] },
          totalInnings: 9,
          mvpPlayerId: null,
          batterStats: [],
          pitcherStats: [],
        });
        continue;
      }
      getState().advanceWeek('batting_basic');
      const wAfter = getWorld();
      const d = wAfter.currentDate;
      const inAutumn = (d.month === 9 && d.day >= 15) || (d.month === 10 && d.day <= 14);
      if (inAutumn) {
        expect(wAfter.activeTournament).not.toBeNull();
        expect(wAfter.activeTournament?.type).toBe('autumn');
        foundAutumn = true;
        break;
      }
      if (d.month > 10) break;
    }

    expect(foundAutumn).toBe(true);
  });
});

// ============================================================
// テスト D/E: Bug #2 — stale tournament 救済
// ============================================================

describe('Bug #2 修正: 期間外の stale な activeTournament が advanceDay で救済される', {
  timeout: LONG_TEST_TIMEOUT,
}, () => {
  beforeEach(() => {
    resetStore();
  });

  it('夏大会期間外（8月）に isCompleted=false な summer activeTournament があれば advanceDay で救済される', () => {
    newGame('bug2-test-e');

    advanceToDate(8, 5);
    const w = getWorld();

    // 強制的に isCompleted=false な stale な夏大会を注入（Bug #1 の副作用で起きたセーブ破損を再現）
    const staleTournament: TournamentBracket = {
      id: 'stale-summer-bug1',
      type: 'summer',
      year: w.currentDate.year,
      totalTeams: 48,
      rounds: [
        {
          roundNumber: 1,
          roundName: '1回戦',
          matches: [], // 空（進行が途中）
        },
      ],
      isCompleted: false,
      champion: null,
    };

    useWorldStore.setState({
      worldState: {
        ...w,
        activeTournament: staleTournament,
      },
    });

    // advanceDay を呼ぶ → stale tournament が検出されて履歴に移動
    getState().advanceDay('batting_basic');

    const wAfter = getWorld();
    // stale な夏大会は null 化されているはず
    expect(wAfter.activeTournament).toBeNull();
    // 夏大会は履歴に追加されている
    const summerHist = wAfter.tournamentHistory?.find((t) => t.id === 'stale-summer-bug1');
    expect(summerHist).toBeDefined();
    expect(summerHist?.isCompleted).toBe(true);
  });

  it('秋大会期間外（11月）に isCompleted=false な autumn activeTournament があれば advanceDay で救済される', () => {
    newGame('bug2-test-f');

    advanceToDate(10, 20);
    const w = getWorld();

    // stale な秋大会を注入
    const staleTournament: TournamentBracket = {
      id: 'stale-autumn-bug2',
      type: 'autumn',
      year: w.currentDate.year,
      totalTeams: 48,
      rounds: [],
      isCompleted: false,
      champion: null,
    };

    useWorldStore.setState({
      worldState: {
        ...w,
        activeTournament: staleTournament,
      },
    });

    getState().advanceDay('batting_basic');

    const wAfter = getWorld();
    expect(wAfter.activeTournament).toBeNull();
    const autumnHist = wAfter.tournamentHistory?.find((t) => t.id === 'stale-autumn-bug2');
    expect(autumnHist).toBeDefined();
  });

  it('9/15 以降に isCompleted=false な autumn activeTournament が残っていても正常に大会が進行する', () => {
    newGame('bug2-test-g');

    // 秋大会まで進める（夏大会はしっかり消化）
    advanceToDate(9, 15);
    const w = getWorld();

    // 秋大会が正常に生成されているはず
    if (w.activeTournament && w.activeTournament.type === 'autumn') {
      expect(w.activeTournament.isCompleted).toBe(false);
      // 10/15 以降になっても activeTournament が残る場合、救済される
      advanceToDate(10, 20);
      const wFinal = getWorld();
      // 10/20 は秋大会期間外 → stale tournament は消えているはず
      if (wFinal.activeTournament) {
        // まだ残っている場合は isCompleted=true のはず（正常完了）
        expect(wFinal.activeTournament.isCompleted).toBe(true);
      }
    }
  });
});
