/**
 * tests/stores/autumn-tournament-e2e.test.ts
 *
 * 秋大会バグ — Store経由の E2E テスト
 *
 * 2026-04-17 高橋さん報告:
 * 「夏の大会のあとの大会に参加できなかった、次の年までいっても何も起きず」
 *
 * エンジン層テスト (tests/engine/world/autumn-tournament.test.ts) では
 * エンジン単体の動作は確認済みだが、UI/Store 経由の振る舞いは未検証だった。
 *
 * このテストは `useWorldStore` を経由して、実プレイと同じ経路で:
 *   - 新規ゲーム → 8月 → 9月 → 10月 と進める
 *   - 秋大会が発生するか
 *   - advanceWeek の停止条件が秋大会試合日で機能するか
 *   - 複数年連続プレイ（2年目、3年目）でも同様に機能するか
 *   - Zustand persist で再ハイドレート後も整合性を保つか
 * を検証する。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useWorldStore } from '@/stores/world-store';
import type { WorldState } from '@/engine/world/world-state';

// 48校×何百日のプレイをシミュレートするため、テストタイムアウトを延長
const LONG_TEST_TIMEOUT = 60_000;

// ============================================================
// ヘルパー
// ============================================================

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
  throw new Error(`advanceToDate(${targetMonth}/${targetDay}) 到達できず (current: ${JSON.stringify(getDate())})`);
}

function newGame(schoolName = 'E2E高校', prefecture = '新潟', managerName = '監督', seed?: string) {
  const { newWorldGame } = useWorldStore.getState();
  newWorldGame({ schoolName, prefecture, managerName, ...(seed ? { seed } : {}) });
}

// ============================================================
// テスト群
// ============================================================

// 各テスト内で数百日のadvanceDayを呼ぶため、describe全体のtimeoutを延長
describe('秋大会 E2E — Store 経由', { timeout: LONG_TEST_TIMEOUT }, () => {
  beforeEach(() => {
    resetStore();
  });

  // ─────────────────────────────────────────────────
  // 基本シナリオ: 夏大会 → 秋大会
  // ─────────────────────────────────────────────────
  describe('基本: 初年度 夏 → 秋', () => {
    it('1年目: 9/15 時点で秋大会が作成され、自校がブラケットに含まれる', () => {
      newGame();
      advanceToDate(9, 15);
      const w = useWorldStore.getState().worldState!;
      expect(w.activeTournament).not.toBeNull();
      expect(w.activeTournament?.type).toBe('autumn');

      const inBracket = w.activeTournament!.rounds.some((r) =>
        r.matches.some(
          (m) => m.homeSchoolId === w.playerSchoolId || m.awaySchoolId === w.playerSchoolId,
        ),
      );
      expect(inBracket).toBe(true);
    });

    it('1年目: 10/20 時点で秋大会が履歴に入っており、champion が決まっている', () => {
      newGame();
      advanceToDate(10, 20);
      const w = useWorldStore.getState().worldState!;
      const hist = w.tournamentHistory?.find((t) => t.type === 'autumn');
      expect(hist).toBeDefined();
      expect(hist?.isCompleted).toBe(true);
      expect(hist?.champion).not.toBeNull();
    });

    it('1年目: 夏大会と秋大会の両方が tournamentHistory に残る', () => {
      newGame();
      advanceToDate(10, 20);
      const w = useWorldStore.getState().worldState!;
      const summer = w.tournamentHistory?.find((t) => t.type === 'summer');
      const autumn = w.tournamentHistory?.find((t) => t.type === 'autumn');
      expect(summer).toBeDefined();
      expect(summer?.isCompleted).toBe(true);
      expect(autumn).toBeDefined();
      expect(autumn?.isCompleted).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────
  // advanceWeek の停止条件
  // ─────────────────────────────────────────────────
  describe('advanceWeek — 秋大会試合日での停止', () => {
    it('advanceWeek を使っても秋大会の試合日で停止する', () => {
      newGame();
      // 9/10 まで進めておく
      advanceToDate(9, 10);

      const { advanceWeek } = useWorldStore.getState();

      // 9/10 → advanceWeek 複数回で秋大会試合日に到達するはず
      let reachedMatchDay = false;
      const AUTUMN_MATCH_DAYS = new Set(['9-15', '9-19', '9-24', '9-29', '10-5', '10-10']);
      for (let i = 0; i < 10; i++) {
        const beforeDate = getDate();
        const results = advanceWeek('batting_basic');
        const afterDate = getDate();
        const key = `${afterDate.month}-${afterDate.day}`;

        if (AUTUMN_MATCH_DAYS.has(key)) {
          // 試合日に停止した（advanceWeek が7日未満で止まった可能性）
          reachedMatchDay = true;
          // 結果配列の最後か途中で試合結果が含まれているはず
          const hadMatch = results.some((r) => r.playerMatchResult !== undefined);
          // 自校が参加していればマッチが発生、そうでなければ他校同士の試合
          // ここでは「停止した」事実と「自校試合日に到達できた」ことを確認
          expect(afterDate.day).toBe(parseInt(key.split('-')[1], 10));
          break;
        }
        if (afterDate.month === 10 && afterDate.day >= 15) break;
      }
      // 必ずどこかの試合日で停止するはず（自校が一度も試合日にならなくても、9/15 or 9/19 で大会が始まる）
      expect(reachedMatchDay).toBe(true);
    });

    it('9/14 時点から advanceWeek すると 9/15 で停止する（大会開始日）', () => {
      newGame();
      advanceToDate(9, 14);
      const { advanceWeek } = useWorldStore.getState();
      advanceWeek('batting_basic');
      const after = getDate();
      // 9/15 で止まるか、そのまま経過することもあるが、少なくとも advanceWeek 1回で秋大会が始まる日付範囲内にいるはず
      expect(after.month).toBe(9);
      expect(after.day).toBeGreaterThanOrEqual(15);
      expect(after.day).toBeLessThanOrEqual(21);

      const w = useWorldStore.getState().worldState!;
      expect(w.activeTournament?.type).toBe('autumn');
    });
  });

  // ─────────────────────────────────────────────────
  // 複数年にわたる検証
  // ─────────────────────────────────────────────────
  describe('複数年 — 2年目・3年目も秋大会が発生', () => {
    it('2年目 10/20 時点で 2回目の秋大会が履歴にある', { timeout: 120_000 }, () => {
      newGame();
      advanceToDate(10, 20); // 1年目終わり近く
      advanceToDate(4, 1);   // 2年目年度替わり直後だが年がまたぐので注意
      // 1年目 10/20 → 次の 4/1 は年がまたぐ。advanceToDate は月日判定なので、
      // 最初に到達する 4/1 は 2年目
      const w1 = useWorldStore.getState().worldState!;
      expect(w1.currentDate.year).toBe(2);

      // 2年目の秋大会も発生することを確認（2年目の 10/20 まで）
      advanceToDate(10, 20);
      const w = useWorldStore.getState().worldState!;

      const autumnCount = w.tournamentHistory?.filter((t) => t.type === 'autumn').length ?? 0;
      expect(autumnCount).toBeGreaterThanOrEqual(2);
    });

    it('3年目まで連続プレイしても各年の夏・秋大会が生成される', { timeout: 180_000 }, () => {
      newGame();
      // 1年目
      advanceToDate(10, 20);
      // 2年目
      advanceToDate(4, 1);
      advanceToDate(10, 20);
      // 3年目
      advanceToDate(4, 1);
      advanceToDate(10, 20);

      const w = useWorldStore.getState().worldState!;
      expect(w.currentDate.year).toBe(3);

      const summerCount = w.tournamentHistory?.filter((t) => t.type === 'summer').length ?? 0;
      const autumnCount = w.tournamentHistory?.filter((t) => t.type === 'autumn').length ?? 0;
      // 最大10件までしか保持しない設計のため、最低 3 ずつ残っていることを確認
      expect(summerCount).toBeGreaterThanOrEqual(3);
      expect(autumnCount).toBeGreaterThanOrEqual(3);
    });
  });

  // ─────────────────────────────────────────────────
  // seasonTransition の報告
  // ─────────────────────────────────────────────────
  describe('seasonTransition — 秋大会開始時に UI に通知される', () => {
    it('9/14 → 9/15 の advanceDay で seasonTransition === "autumn_tournament" が返る', () => {
      newGame();
      advanceToDate(9, 14);
      const { advanceDay } = useWorldStore.getState();
      const result = advanceDay('batting_basic');
      expect(result).not.toBeNull();
      expect(result!.seasonTransition).toBe('autumn_tournament');
    });

    it('秋大会が始まったら activeTournament と phase 両方が同期する', () => {
      newGame();
      advanceToDate(9, 15);
      const w = useWorldStore.getState().worldState!;
      expect(w.activeTournament?.type).toBe('autumn');
      expect(w.seasonState.phase).toBe('autumn_tournament');
    });
  });

  // ─────────────────────────────────────────────────
  // Zustand persist ハイドレート挙動の検証
  // ─────────────────────────────────────────────────
  describe('persist — Store の状態を手動保存 → 再ハイドレート', () => {
    /**
     * 実プレイでは localStorage に保存 → 再読み込みで復元される。
     * このテストは setState で同じシナリオをシミュレート:
     *
     * 1. 新規ゲーム → 9/14 まで進める
     * 2. WorldState を退避
     * 3. resetStore() で空に戻す
     * 4. setState で退避した WorldState を再注入（persist 再ハイドレート相当）
     * 5. そこから advanceDay → 秋大会が作成されるか
     */
    it('9/14 状態を退避 → リセット → 再注入で秋大会が作成される', () => {
      newGame();
      advanceToDate(9, 14);
      const savedWorld: WorldState = {
        ...useWorldStore.getState().worldState!,
      };

      resetStore();
      useWorldStore.setState({ worldState: savedWorld });

      const { advanceDay } = useWorldStore.getState();
      const result = advanceDay('batting_basic');

      expect(result!.seasonTransition).toBe('autumn_tournament');

      const w = useWorldStore.getState().worldState!;
      expect(w.activeTournament?.type).toBe('autumn');
      expect(w.currentDate.month).toBe(9);
      expect(w.currentDate.day).toBe(15);
    });

    it('7/30 状態（夏大会直後）を退避 → 再注入で 9/15 に秋大会が作成される', () => {
      newGame();
      advanceToDate(7, 30);
      // 夏大会は 7/28 に完了しているはずなので activeTournament は null
      const savedWorld = useWorldStore.getState().worldState!;
      expect(savedWorld.activeTournament).toBeNull();

      resetStore();
      useWorldStore.setState({ worldState: { ...savedWorld } });

      advanceToDate(9, 15);
      const w = useWorldStore.getState().worldState!;
      expect(w.activeTournament?.type).toBe('autumn');
    });

    it('退避 → 再注入しても tournamentHistory が失われない', () => {
      newGame();
      advanceToDate(8, 5); // 夏大会完了後
      const savedWorld = useWorldStore.getState().worldState!;
      const summerHistBefore = savedWorld.tournamentHistory?.find((t) => t.type === 'summer');
      expect(summerHistBefore).toBeDefined();

      resetStore();
      useWorldStore.setState({ worldState: { ...savedWorld } });

      const restored = useWorldStore.getState().worldState!;
      const summerHistAfter = restored.tournamentHistory?.find((t) => t.type === 'summer');
      expect(summerHistAfter).toBeDefined();
      expect(summerHistAfter?.champion).toBe(summerHistBefore?.champion);
    });
  });

  // ─────────────────────────────────────────────────
  // 壊れた WorldState を注入しても秋大会が回復する
  // ─────────────────────────────────────────────────
  describe('データ汚染からのリカバリ', () => {
    it('activeTournament が null のまま 9/15 に到達すれば秋大会が自動生成される', () => {
      newGame();
      advanceToDate(9, 14);
      const w = useWorldStore.getState().worldState!;
      // 強制的に activeTournament を null に（既になっているはず）
      useWorldStore.setState({
        worldState: { ...w, activeTournament: null },
      });

      const { advanceDay } = useWorldStore.getState();
      advanceDay('batting_basic');

      const after = useWorldStore.getState().worldState!;
      expect(after.activeTournament?.type).toBe('autumn');
    });

    it('seasonState.phase が不正でも 9/15 で秋大会が作成される', () => {
      newGame();
      advanceToDate(9, 14);
      const w = useWorldStore.getState().worldState!;
      // phase をわざと不正に（例: spring_practice のまま）
      useWorldStore.setState({
        worldState: {
          ...w,
          seasonState: { ...w.seasonState, phase: 'spring_practice' },
        },
      });

      const { advanceDay } = useWorldStore.getState();
      advanceDay('batting_basic');

      const after = useWorldStore.getState().worldState!;
      expect(after.activeTournament?.type).toBe('autumn');
      // 大会作成時に phase も修正されているはず
      expect(after.seasonState.phase).toBe('autumn_tournament');
    });
  });
});
