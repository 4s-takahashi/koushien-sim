/**
 * tests/stores/autumn-tournament-advanceweek.test.ts
 *
 * Phase 12-L: 秋大会 advanceWeek 回帰テスト
 *
 * 課題1の具体的な再現ケース:
 * 「▶▶ 1週間進む を連続で押しながら進めると、秋大会期間（9/15〜10/14）に入っても
 *  activeTournament が null のままで秋大会タブが『読み込み中』になる」
 *
 * 主な検証内容:
 * - advanceWeek を連続して呼び出しても秋大会が必ず生成される
 * - 自校がすでに夏大会で敗退している状態でも秋大会が生成される（stale tournament シナリオ）
 * - 9/15〜10/14 の任意の日に advanceWeek を押しても activeTournament が存在する
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useWorldStore } from '@/stores/world-store';

const LONG_TEST_TIMEOUT = 60_000;

function resetStore() {
  useWorldStore.setState({
    worldState: null,
    isLoading: false,
    lastDayResult: null,
    recentResults: [],
    recentNews: [],
  });
}

function getDate() {
  return useWorldStore.getState().worldState!.currentDate;
}

function advanceToDate(targetMonth: number, targetDay: number, maxIters = 800) {
  const { advanceDay } = useWorldStore.getState();
  let iters = 0;
  while (iters < maxIters) {
    const d = getDate();
    if (d.month === targetMonth && d.day === targetDay) return;
    advanceDay('batting_basic');
    iters++;
  }
  throw new Error(
    `advanceToDate(${targetMonth}/${targetDay}) 到達できず (current: ${JSON.stringify(getDate())})`,
  );
}

function newGame(seed?: string) {
  const { newWorldGame } = useWorldStore.getState();
  newWorldGame({
    schoolName: 'advanceWeek回帰テスト高校',
    prefecture: '新潟',
    managerName: '監督',
    ...(seed ? { seed } : {}),
  });
}

describe('advanceWeek 秋大会 回帰テスト (Phase 12-L)', { timeout: LONG_TEST_TIMEOUT }, () => {
  beforeEach(() => {
    resetStore();
  });

  /**
   * 最もシンプルなシナリオ:
   * 9/1 から advanceWeek を連続で押して秋大会が生成されることを確認する。
   */
  it('9/1 から advanceWeek を連続で押すと 9/15〜10/14 で秋大会が生成される', () => {
    newGame();
    advanceToDate(9, 1);

    const { advanceWeek } = useWorldStore.getState();

    let foundAutumn = false;
    for (let i = 0; i < 15; i++) {
      advanceWeek('batting_basic');
      const w = useWorldStore.getState().worldState!;
      const d = w.currentDate;

      // 秋大会期間内かチェック
      const inAutumnWindow =
        (d.month === 9 && d.day >= 15) || (d.month === 10 && d.day <= 14);

      if (inAutumnWindow) {
        expect(w.activeTournament).not.toBeNull();
        expect(w.activeTournament?.type).toBe('autumn');
        foundAutumn = true;
        break;
      }

      // 10/15 以降は秋大会が終わっているはずなので停止
      if (d.month === 10 && d.day > 14) break;
      if (d.month === 11) break;
    }

    expect(foundAutumn).toBe(true);
  });

  /**
   * 夏大会後 (8/1〜9/14) の期間から advanceWeek を押して秋大会が生成されることを確認。
   * 夏大会が完了して activeTournament が null になった後、advanceWeek で 9/15 を跨ぐケース。
   */
  it('夏大会終了後の 8/10 から advanceWeek を連続で押すと秋大会が生成される', () => {
    newGame();
    advanceToDate(8, 10);

    // 夏大会はすでに終わっているはず (7/28 頃に完了)
    const wBefore = useWorldStore.getState().worldState!;
    // activeTournament は夏大会が完了して null になっているはず
    expect(wBefore.activeTournament?.isCompleted !== false).toBe(true); // null or isCompleted=true

    const { advanceWeek } = useWorldStore.getState();
    let foundAutumn = false;

    for (let i = 0; i < 20; i++) {
      advanceWeek('batting_basic');
      const w = useWorldStore.getState().worldState!;
      const d = w.currentDate;

      const inAutumnWindow =
        (d.month === 9 && d.day >= 15) || (d.month === 10 && d.day <= 14);

      if (inAutumnWindow) {
        expect(w.activeTournament).not.toBeNull();
        expect(w.activeTournament?.type).toBe('autumn');
        foundAutumn = true;
        break;
      }

      if (d.month === 10 && d.day > 14) break;
      if (d.month === 11) break;
    }

    expect(foundAutumn).toBe(true);
  });

  /**
   * 「stale な activeTournament」シナリオ:
   * 意図的に activeTournament を isCompleted=true な夏大会のオブジェクトに設定し、
   * advanceDay が秋大会を正しく上書き生成するかを確認。
   *
   * world-ticker.ts の L512: if (activeTournament && activeTournament.isCompleted) で
   * 完了済み大会を null 化してから秋大会を生成するロジックが機能することを検証。
   */
  it('isCompleted=true な stale な activeTournament があっても advanceDay で秋大会が生成される', () => {
    newGame();
    advanceToDate(9, 14);

    // 夏大会が完了している状態を取得
    const w = useWorldStore.getState().worldState!;

    // 意図的に isCompleted=true な stale tournament を activeTournament に注入
    // (世界が 9/14 で夏大会の activeTournament を保持しているケースのシミュレーション)
    const staleCompletedTournament = {
      id: 'stale-summer-2025',
      type: 'summer' as const,
      year: w.currentDate.year,
      rounds: [],
      isCompleted: true,
      champion: 'some-school-id',
      createdAt: { year: w.currentDate.year, month: 7, day: 10 },
    };

    useWorldStore.setState({
      worldState: {
        ...w,
        activeTournament: staleCompletedTournament,
      },
    });

    const { advanceDay } = useWorldStore.getState();
    advanceDay('batting_basic');

    const wAfter = useWorldStore.getState().worldState!;
    // stale な夏大会は null 化され、秋大会が生成されているはず
    expect(wAfter.activeTournament).not.toBeNull();
    expect(wAfter.activeTournament?.type).toBe('autumn');
    expect(wAfter.activeTournament?.isCompleted).toBe(false);
    expect(wAfter.currentDate.month).toBe(9);
    expect(wAfter.currentDate.day).toBe(15);
  });

  /**
   * advanceWeek を 9/14 から呼ぶと 9/15 で秋大会が作成される（スナップショットテスト）。
   * activeTournament.type が autumn であること、isCompleted が false であることを確認。
   */
  it('9/14 から advanceWeek を1回押すと秋大会が存在する状態で停止する', () => {
    newGame();
    advanceToDate(9, 14);

    const { advanceWeek } = useWorldStore.getState();
    advanceWeek('batting_basic');

    const w = useWorldStore.getState().worldState!;
    const d = w.currentDate;

    // 9/15〜9/21 の範囲で停止しているはず（試合日 9/19 で停止 or その前）
    expect(d.month).toBe(9);
    expect(d.day).toBeGreaterThanOrEqual(15);
    expect(d.day).toBeLessThanOrEqual(21);

    // 秋大会が存在していること
    expect(w.activeTournament).not.toBeNull();
    expect(w.activeTournament?.type).toBe('autumn');
    expect(w.activeTournament?.isCompleted).toBe(false);
  });

  /**
   * 秋大会期間中（9/20）に advanceWeek を押しても activeTournament が null にならない。
   */
  it('秋大会期間中（9/20）に advanceWeek を押しても activeTournament が維持される', () => {
    newGame();
    advanceToDate(9, 20);

    const w1 = useWorldStore.getState().worldState!;
    expect(w1.activeTournament?.type).toBe('autumn');

    const { advanceWeek } = useWorldStore.getState();
    advanceWeek('batting_basic');

    const w2 = useWorldStore.getState().worldState!;
    // activeTournament が null になっていてはいけない（大会期間中）
    // 完了している可能性はある（10/10 以降の場合）が null 以外
    const d = w2.currentDate;
    const stillInWindow = (d.month === 9 && d.day >= 15) || (d.month === 10 && d.day <= 14);
    if (stillInWindow) {
      expect(w2.activeTournament).not.toBeNull();
    }
    // 少なくとも1回は advanceWeek が機能していること
    expect(w2.currentDate).not.toEqual(w1.currentDate);
  });
});
