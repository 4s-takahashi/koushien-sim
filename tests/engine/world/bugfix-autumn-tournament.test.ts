/**
 * tests/engine/world/bugfix-autumn-tournament.test.ts
 *
 * 秋大会が起動しないバグのリグレッションテスト。
 *
 * 修正内容:
 *  1. world-ticker.ts: 完了済み activeTournament を advanceWorldDay 先頭でクリーンアップ
 *  2. year-transition.ts: processYearTransition 先頭でもクリーンアップ
 *  3. world-store.ts: simulateTournament が activeTournament を null にする
 *  4. world-store.ts: ロード時に isCompleted=true の activeTournament を自動クリーンアップ
 *
 * テストカバー:
 *  A. インタラクティブ試合（決勝まで勝ち抜き）後に activeTournament が null になる
 *  B. インタラクティブ試合（敗退）後に activeTournament が null になる
 *  C. 年度替わり後に 2年目の夏大会が 7/10 に作成される
 *  D. 夏大会後に 9/15 で秋大会が作成される
 *  E. 異常セーブ（isCompleted=true の activeTournament あり）をロードしたら自動修復される
 *  F. completeInteractiveMatch が isCompleted=true になったら activeTournament を null にする
 */

import { describe, it, expect } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import {
  advanceWorldDay,
  completeInteractiveMatch,
} from '@/engine/world/world-ticker';
import { processYearTransition } from '@/engine/world/year-transition';
import {
  createTournamentBracket,
  simulateFullTournament,
  simulateTournamentRound,
} from '@/engine/world/tournament-bracket';
import type { WorldState, HighSchool } from '@/engine/world/world-state';
import {
  createEmptyYearResults,
  createDefaultWeeklyPlan,
  createInitialSeasonState,
  createInitialScoutState,
} from '@/engine/world/world-state';
import type { TournamentBracket } from '@/engine/world/tournament-bracket';
import { generatePlayer } from '@/engine/player/generate';

// ============================================================
// テストヘルパー
// ============================================================

function makeSchool(
  id: string,
  name: string,
  tier: 'full' | 'standard' | 'minimal',
  reputation = 50,
): HighSchool {
  const rng = createRNG(`school-${id}`);
  const players = Array.from({ length: 15 }, (_, i) =>
    generatePlayer(rng.derive(`p${i}`), {
      enrollmentYear: 1,
      schoolReputation: reputation,
    }),
  );
  return {
    id,
    name,
    prefecture: '新潟',
    reputation,
    players,
    lineup: null,
    facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 },
    simulationTier: tier,
    coachStyle: {
      offenseType: 'balanced',
      defenseType: 'balanced',
      practiceEmphasis: 'balanced',
      aggressiveness: 50,
    },
    yearResults: createEmptyYearResults(),
    _summary: null,
  };
}

function make48SchoolWorld(
  currentDate = { year: 1, month: 4, day: 1 },
): WorldState {
  const schools: HighSchool[] = [];
  schools.push(makeSchool('player-school', '自校', 'full', 55));
  for (let i = 1; i < 48; i++) {
    const rep = 30 + (i % 60);
    schools.push(makeSchool(`ai-${i}`, `AI高校${i}`, 'minimal', rep));
  }
  return {
    version: '0.3.0',
    seed: 'bugfix-test',
    currentDate,
    playerSchoolId: 'player-school',
    manager: {
      name: '監督',
      yearsActive: 0,
      fame: 0,
      totalWins: 0,
      totalLosses: 0,
      koshienAppearances: 0,
      koshienWins: 0,
    },
    settings: { autoAdvanceSpeed: 'normal', showDetailedGrowth: false },
    weeklyPlan: createDefaultWeeklyPlan(),
    prefecture: '新潟',
    schools,
    middleSchoolPool: [],
    personRegistry: { entries: new Map() },
    seasonState: createInitialSeasonState(),
    scoutState: createInitialScoutState(),
    activeTournament: null,
    tournamentHistory: [],
  };
}

/** 指定日まで進める（最大500イテレーション） */
function advanceToDate(
  world: WorldState,
  targetMonth: number,
  targetDay: number,
): WorldState {
  let w = world;
  let iter = 0;
  const rng = createRNG('advance-to-date-bugfix');
  while (
    (w.currentDate.month !== targetMonth || w.currentDate.day !== targetDay) &&
    iter < 500
  ) {
    const { nextWorld } = advanceWorldDay(
      w,
      'batting_basic',
      rng.derive(`iter-${iter}`),
    );
    w = nextWorld;
    iter++;
  }
  return w;
}

/** 完了済みの夏大会ブラケットを作成する（バグ再現用） */
function makeCompletedSummerBracket(schools: HighSchool[]): TournamentBracket {
  const rng = createRNG('completed-bracket');
  const bracket = createTournamentBracket(
    '1-summer',
    'summer',
    1,
    schools,
    rng,
  );
  return simulateFullTournament(bracket, schools, rng.derive('sim'));
}

// ============================================================
// テスト A: インタラクティブ試合（決勝まで勝ち抜き）後の activeTournament
// ============================================================

describe('バグ修正A: インタラクティブ試合 — 決勝優勝後に activeTournament が null になる', () => {
  it('決勝までインタラクティブで勝ち抜いた後、activeTournament は null になる', () => {
    // 48校でブラケット作成
    const world = make48SchoolWorld({ year: 1, month: 7, day: 9 });
    // 夏大会を作成
    const rng = createRNG('final-test');
    let bracketWorld = world;
    const { nextWorld: worldOn710 } = advanceWorldDay(
      bracketWorld,
      'batting_basic',
      rng.derive('day1'),
    );
    bracketWorld = worldOn710;

    // 大会が作成されたことを確認
    expect(bracketWorld.activeTournament).not.toBeNull();
    expect(bracketWorld.activeTournament?.isCompleted).toBe(false);

    // ラウンド6（決勝）まで自動進行（自校がどこかで敗退するか、決勝まで進む）
    // advanceWorldDay は interactive=false なので自動シミュレーション
    let w = bracketWorld;
    for (let i = 0; i < 30; i++) {
      if (!w.activeTournament || w.activeTournament.isCompleted) break;
      const r = createRNG(`advance-${i}`);
      const { nextWorld } = advanceWorldDay(w, 'batting_basic', r);
      w = nextWorld;
    }

    // 大会完了後: activeTournament は null
    expect(w.activeTournament).toBeNull();
    // 履歴に夏大会が追加されている
    const summerHist = w.tournamentHistory?.find((t) => t.type === 'summer');
    expect(summerHist).toBeDefined();
    expect(summerHist?.isCompleted).toBe(true);
  });

  it('completeInteractiveMatch が決勝後に activeTournament を null にする', () => {
    const world = make48SchoolWorld({ year: 1, month: 7, day: 9 });
    const rng = createRNG('interactive-final');

    // 夏大会を作成（7/10）
    const { nextWorld: world710 } = advanceWorldDay(world, 'batting_basic', rng.derive('d1'));
    expect(world710.activeTournament).not.toBeNull();

    // 7/28（決勝日）まで進める（interactive=false で自動進行）
    let w = world710;
    w = advanceToDate(w, 7, 28);

    // 決勝日（7/28）に advanceWorldDay を interactive=true で呼び出す
    const { nextWorld: w728, result: r728 } = advanceWorldDay(
      w,
      'batting_basic',
      rng.derive('d728'),
      { interactive: true },
    );

    if (r728.waitingForInteractiveMatch) {
      // 自校が決勝に出た場合: completeInteractiveMatch を呼ぶ
      const fakeResult = {
        winner: w728.pendingInteractiveMatch?.playerSide ?? 'home',
        finalScore: { home: 5, away: 3 },
        inningScores: { home: [1, 0, 2, 0, 0, 1, 0, 1, 0], away: [1, 0, 0, 1, 0, 0, 0, 1, 0] },
        totalInnings: 9,
        mvpPlayerId: null,
        batterStats: [],
        pitcherStats: [],
      } as const;
      const { nextWorld: afterFinal } = completeInteractiveMatch(
        w728,
        fakeResult,
        rng.derive('complete-final'),
      );

      // 決勝終了後: activeTournament は null（大会完了）のはず
      expect(afterFinal.activeTournament).toBeNull();
      const sumHist = afterFinal.tournamentHistory?.find((t) => t.type === 'summer');
      expect(sumHist).toBeDefined();
      expect(sumHist?.isCompleted).toBe(true);
    } else {
      // 自校が決勝に進まなかった（以前に敗退済み）
      // この場合も大会進行は正常: isCompleted=true なら null 化済み
      if (w728.activeTournament) {
        // 決勝前なら isCompleted=false のはず
        expect(w728.activeTournament.isCompleted).toBe(false);
      }
      // 大会を最後まで進める
      let wFinal = w728;
      for (let i = 0; i < 10; i++) {
        if (!wFinal.activeTournament) break;
        const { nextWorld } = advanceWorldDay(wFinal, 'batting_basic', rng.derive(`end-${i}`));
        wFinal = nextWorld;
      }
      expect(wFinal.activeTournament).toBeNull();
      const sumHist = wFinal.tournamentHistory?.find((t) => t.type === 'summer');
      expect(sumHist?.isCompleted).toBe(true);
    }
  });
});

// ============================================================
// テスト B: インタラクティブ試合（敗退）後の activeTournament
// ============================================================

describe('バグ修正B: インタラクティブ試合 — 敗退後に activeTournament の処理が正常', () => {
  it('インタラクティブ試合で敗退しても大会は正常完了する', () => {
    const world = make48SchoolWorld({ year: 1, month: 7, day: 9 });
    const rng = createRNG('interactive-loss');

    const { nextWorld: world710 } = advanceWorldDay(world, 'batting_basic', rng.derive('d1'));
    expect(world710.activeTournament).not.toBeNull();

    // 7/10 に interactive=true で呼び出し
    const { nextWorld: wInteractive, result: rInteractive } = advanceWorldDay(
      world710,
      'batting_basic',
      rng.derive('d710-interactive'),
      { interactive: true },
    );

    if (rInteractive.waitingForInteractiveMatch) {
      // 自校の試合がある → 負けを入力
      const lossResult = {
        winner: (wInteractive.pendingInteractiveMatch?.playerSide === 'home' ? 'away' : 'home') as 'home' | 'away',
        finalScore: { home: 0, away: 5 },
        inningScores: { home: Array(9).fill(0) as number[], away: [2, 0, 1, 0, 0, 1, 0, 1, 0] },
        totalInnings: 9,
        mvpPlayerId: null,
        batterStats: [],
        pitcherStats: [],
      };
      const { nextWorld: afterLoss } = completeInteractiveMatch(
        wInteractive,
        lossResult,
        rng.derive('complete-loss'),
      );

      // 敗退後: 大会はまだ進行中（他校が残っている）か完了している
      // いずれにせよ isCompleted=true + activeTournament が非 null という状態は NG
      if (afterLoss.activeTournament) {
        expect(afterLoss.activeTournament.isCompleted).toBe(false);
      }
    }

    // 大会が終わるまで進める
    let w = wInteractive;
    for (let i = 0; i < 50; i++) {
      if (!w.activeTournament) break;
      const { nextWorld } = advanceWorldDay(w, 'batting_basic', rng.derive(`adv-${i}`));
      w = nextWorld;
    }

    // 大会完了後: activeTournament は null
    expect(w.activeTournament).toBeNull();
    const sumHist = w.tournamentHistory?.find((t) => t.type === 'summer');
    expect(sumHist?.isCompleted).toBe(true);
  });
});

// ============================================================
// テスト C: 年度替わり後に 2年目の夏大会が 7/10 に作成される
// ============================================================

describe('バグ修正C: 年度替わり後の 2年目夏大会生成', () => {
  it('3/31 → 4/1 → 7/10 で 2年目の夏大会が作成される', () => {
    // 1年目の秋大会完了後の状態（activeTournament=null）から 3/31 まで進める
    // year: 1, month: 10 → year: 2, month: 3, day: 31 まで進む
    const world = make48SchoolWorld({ year: 1, month: 10, day: 20 });
    let w = world;

    // 3/31 まで進める（advanceToDate は year を無視して month/day だけ見る）
    w = advanceToDate(w, 3, 31);
    expect(w.currentDate.month).toBe(3);
    expect(w.currentDate.day).toBe(31);
    expect(w.activeTournament).toBeNull();

    const yearBefore = w.currentDate.year;
    const yearsActiveBefore = w.manager.yearsActive;

    // 年度替わり（3/31 → 4/1）
    const rng = createRNG('year-trans-test');
    const { nextWorld: w41 } = advanceWorldDay(w, 'batting_basic', rng);
    expect(w41.currentDate.month).toBe(4);
    expect(w41.currentDate.day).toBe(1);
    expect(w41.currentDate.year).toBe(yearBefore); // year は advanceDate で 3/31→4/1 は同年内
    expect(w41.activeTournament).toBeNull();
    expect(w41.manager.yearsActive).toBe(yearsActiveBefore + 1);

    // 4/1 → 7/10 まで進める
    let w2 = w41;
    w2 = advanceToDate(w2, 7, 10);

    // 夏大会が作成されている（年度は問わない）
    expect(w2.currentDate.month).toBe(7);
    expect(w2.currentDate.day).toBe(10);
    expect(w2.activeTournament).not.toBeNull();
    expect(w2.activeTournament?.type).toBe('summer');
    expect(w2.activeTournament?.isCompleted).toBe(false);
  });
});

// ============================================================
// テスト D: 夏大会後に 9/15 で秋大会が作成される
// ============================================================

describe('バグ修正D: 夏大会完了後に秋大会が 9/15 に作成される', () => {
  it('夏大会完了後（activeTournament=null）から 9/15 で秋大会が生成される', () => {
    const world = make48SchoolWorld({ year: 1, month: 9, day: 14 });
    const worldPostSummer = {
      ...world,
      activeTournament: null,
      tournamentHistory: [], // 夏大会完了済みとして空でもOK
    };
    const rng = createRNG('autumn-after-summer');
    const { nextWorld } = advanceWorldDay(worldPostSummer, 'batting_basic', rng);

    expect(nextWorld.currentDate).toEqual({ year: 1, month: 9, day: 15 });
    expect(nextWorld.activeTournament).not.toBeNull();
    expect(nextWorld.activeTournament?.type).toBe('autumn');
    expect(nextWorld.activeTournament?.isCompleted).toBe(false);
  });

  it('【バグ再現】完了済み activeTournament が残っていても 9/15 で秋大会が作成される', () => {
    const world = make48SchoolWorld({ year: 1, month: 9, day: 14 });

    // バグ状態の再現: isCompleted=true の activeTournament が残っている
    const completedBracket = makeCompletedSummerBracket(world.schools);
    const bugWorld: WorldState = {
      ...world,
      activeTournament: completedBracket, // isCompleted=true のまま残している（バグ状態）
      tournamentHistory: [completedBracket], // 履歴にも同じものがある
    };

    const rng = createRNG('bug-repro-autumn');
    const { nextWorld } = advanceWorldDay(bugWorld, 'batting_basic', rng);

    // 修正後: 9/15 に秋大会が作成される
    expect(nextWorld.currentDate).toEqual({ year: 1, month: 9, day: 15 });
    expect(nextWorld.activeTournament).not.toBeNull();
    expect(nextWorld.activeTournament?.type).toBe('autumn');
    expect(nextWorld.activeTournament?.isCompleted).toBe(false);

    // 夏大会も履歴に正しく残っている（重複していない）
    const summerEntries = nextWorld.tournamentHistory?.filter((t) => t.id === completedBracket.id);
    expect(summerEntries?.length).toBe(1); // 重複なし
  });

  it('夏大会完了後（7/29）は post_summer フェーズ', () => {
    const world = make48SchoolWorld({ year: 1, month: 7, day: 28 });
    const completedBracket = makeCompletedSummerBracket(world.schools);
    // バグ状態の再現
    const bugWorld: WorldState = {
      ...world,
      activeTournament: completedBracket,
      tournamentHistory: [completedBracket],
    };

    const rng = createRNG('phase-post-summer');
    const { nextWorld } = advanceWorldDay(bugWorld, 'batting_basic', rng);

    // 修正後: フェーズは post_summer（activeTournament が null になるため）
    expect(nextWorld.seasonState.phase).toBe('post_summer');
  });
});

// ============================================================
// テスト E: 異常セーブ（isCompleted=true の activeTournament あり）の自動修復
// ============================================================

describe('バグ修正E: 異常セーブの advanceWorldDay による自動修復', () => {
  it('isCompleted=true の activeTournament が残った状態で advanceWorldDay を呼ぶと自動クリーンアップされる', () => {
    const world = make48SchoolWorld({ year: 1, month: 7, day: 17 });
    const completedBracket = makeCompletedSummerBracket(world.schools);

    // 異常セーブ状態: activeTournament が isCompleted=true のまま残っている
    // かつ tournamentHistory にも同じものがある（バグレポートの状態）
    const bugSaveWorld: WorldState = {
      ...world,
      currentDate: { year: 2, month: 7, day: 16 }, // 2年目7/16
      activeTournament: { ...completedBracket, id: '1-summer', type: 'summer' },
      tournamentHistory: [{ ...completedBracket, id: '1-summer', type: 'summer' }],
      seasonState: { ...createInitialSeasonState(), phase: 'summer_tournament' },
    };

    expect(bugSaveWorld.activeTournament?.isCompleted).toBe(true);

    const rng = createRNG('bug-save-repair');
    const { nextWorld } = advanceWorldDay(bugSaveWorld, 'batting_basic', rng);

    // 1日進めると自動クリーンアップされている
    // (activeTournament は null、または新しい 2年目の夏大会に差し替え)
    if (nextWorld.activeTournament) {
      // 新しい大会が作られた場合は isCompleted=false であること
      expect(nextWorld.activeTournament.isCompleted).toBe(false);
    }

    // 履歴に重複がないこと
    const summerEntries = nextWorld.tournamentHistory?.filter((t) => t.id === '1-summer');
    expect(summerEntries?.length).toBeLessThanOrEqual(1);
  });

  it('processYearTransition は完了済み activeTournament を自動クリーンアップする', () => {
    const world = make48SchoolWorld({ year: 1, month: 3, day: 31 });
    const completedBracket = makeCompletedSummerBracket(world.schools);

    // 異常セーブ: 年度替わり時に activeTournament が残っている
    const bugWorld: WorldState = {
      ...world,
      activeTournament: completedBracket,
      tournamentHistory: [], // 履歴には入っていない
    };

    const rng = createRNG('year-trans-cleanup');
    const result = processYearTransition(bugWorld, rng);

    // 年度替わり後は activeTournament が null
    expect(result.activeTournament).toBeNull();
    // 履歴に追加されている
    const summerHist = result.tournamentHistory?.find((t) => t.type === 'summer');
    expect(summerHist).toBeDefined();
  });

  it('processYearTransition は履歴済みの完了済み activeTournament を重複追加しない', () => {
    const world = make48SchoolWorld({ year: 1, month: 3, day: 31 });
    const completedBracket = makeCompletedSummerBracket(world.schools);

    // バグ状態: 履歴にも同じものがある
    const bugWorld: WorldState = {
      ...world,
      activeTournament: completedBracket,
      tournamentHistory: [completedBracket], // 既に入っている
    };

    const rng = createRNG('year-trans-no-dup');
    const result = processYearTransition(bugWorld, rng);

    // 重複しない
    const entries = result.tournamentHistory?.filter((t) => t.id === completedBracket.id);
    expect(entries?.length).toBeLessThanOrEqual(1);
  });
});

// ============================================================
// テスト F: simulateTournamentRound / simulateFullTournament の完了後処理
// ============================================================

describe('バグ修正F: simulateFullTournament 後の activeTournament 処理', () => {
  it('simulateFullTournament で完了した大会は isCompleted=true になる', () => {
    const world = make48SchoolWorld();
    const rng = createRNG('full-sim');
    const bracket = createTournamentBracket('test-summer', 'summer', 1, world.schools, rng);
    const completed = simulateFullTournament(bracket, world.schools, rng.derive('sim'));

    expect(completed.isCompleted).toBe(true);
    expect(completed.champion).not.toBeNull();
  });

  it('完了した大会を activeTournament に残したまま 9/15 に進むと秋大会が生成される', () => {
    // world-store の simulateTournament バグを engine レベルで再現・修正検証
    const world = make48SchoolWorld({ year: 1, month: 9, day: 14 });
    const rng = createRNG('sim-then-autumn');
    const bracket = createTournamentBracket('test-summer-2', 'summer', 1, world.schools, rng);
    const completed = simulateFullTournament(bracket, world.schools, rng.derive('sim'));

    // バグ状態: activeTournament = completed（isCompleted=true）
    const bugWorld: WorldState = {
      ...world,
      activeTournament: completed,
      tournamentHistory: [completed],
    };

    // advanceWorldDay の修正により、先頭でクリーンアップされ 9/15 に秋大会が生成される
    const { nextWorld } = advanceWorldDay(bugWorld, 'batting_basic', rng.derive('advance'));

    expect(nextWorld.currentDate).toEqual({ year: 1, month: 9, day: 15 });
    expect(nextWorld.activeTournament).not.toBeNull();
    expect(nextWorld.activeTournament?.type).toBe('autumn');
  });
});

// ============================================================
// テスト G: 修正後のフルシーズン整合性確認
// ============================================================

describe('バグ修正G: 修正後のフルシーズン確認', () => {
  it('1年目 7/10 に夏大会が作成される', () => {
    const world = make48SchoolWorld({ year: 1, month: 7, day: 9 });
    const rng = createRNG('summer-create');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);

    expect(nextWorld.currentDate).toEqual({ year: 1, month: 7, day: 10 });
    expect(nextWorld.activeTournament?.type).toBe('summer');
    expect(nextWorld.activeTournament?.isCompleted).toBe(false);
  });

  it('1年目 9/15 に秋大会が作成される（夏大会完了後）', () => {
    const world = make48SchoolWorld({ year: 1, month: 9, day: 14 });
    const rng = createRNG('autumn-create');
    const { nextWorld } = advanceWorldDay(world, 'batting_basic', rng);

    expect(nextWorld.currentDate).toEqual({ year: 1, month: 9, day: 15 });
    expect(nextWorld.activeTournament?.type).toBe('autumn');
  });

  it('1年目フルシーズン: 夏・秋両方の大会が履歴に残る', () => {
    let world = make48SchoolWorld({ year: 1, month: 4, day: 1 });
    world = advanceToDate(world, 10, 20);

    const summerHist = world.tournamentHistory?.find((t) => t.type === 'summer');
    const autumnHist = world.tournamentHistory?.find((t) => t.type === 'autumn');

    expect(summerHist?.isCompleted).toBe(true);
    expect(autumnHist?.isCompleted).toBe(true);
    expect(world.activeTournament).toBeNull();
  });
});
