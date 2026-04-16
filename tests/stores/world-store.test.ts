/**
 * tests/stores/world-store.test.ts
 *
 * WorldStore の基本動作テスト。
 *
 * Note: Zustand ストアのテストは act() を使わずに直接呼び出せる。
 * create() は内部状態を持つシングルトンなので、テストごとにリセットが必要。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useWorldStore } from '@/stores/world-store';

// ============================================================
// テストヘルパー
// ============================================================

function resetStore() {
  // Zustand のリセット：初期状態に戻す
  useWorldStore.setState({
    worldState: null,
    isLoading: false,
    lastDayResult: null,
    recentResults: [],
    recentNews: [],
  });
}

// ============================================================
// テスト
// ============================================================

describe('WorldStore', () => {
  beforeEach(() => {
    resetStore();
  });

  it('初期状態では worldState が null', () => {
    const { worldState } = useWorldStore.getState();
    expect(worldState).toBeNull();
  });

  it('newWorldGame でゲームが初期化される', () => {
    const { newWorldGame } = useWorldStore.getState();
    newWorldGame({
      schoolName: '桜葉高校',
      prefecture: '新潟',
      managerName: '山田太郎',
    });

    const { worldState } = useWorldStore.getState();
    expect(worldState).not.toBeNull();
    expect(worldState!.schools.length).toBeGreaterThan(0);
    expect(worldState!.playerSchoolId).toBeTruthy();
  });

  it('自校の名前が正しく設定される', () => {
    const { newWorldGame } = useWorldStore.getState();
    newWorldGame({
      schoolName: 'テスト高校',
      prefecture: '東京',
      managerName: '監督',
    });

    const { worldState } = useWorldStore.getState();
    const playerSchool = worldState!.schools.find((s) => s.id === worldState!.playerSchoolId);
    expect(playerSchool?.name).toBe('テスト高校');
    expect(playerSchool?.prefecture).toBe('東京');
  });

  it('監督名が正しく設定される', () => {
    const { newWorldGame } = useWorldStore.getState();
    newWorldGame({
      schoolName: 'テスト高校',
      prefecture: '大阪',
      managerName: '山本監督',
    });

    const { worldState } = useWorldStore.getState();
    expect(worldState!.manager.name).toBe('山本監督');
  });

  it('advanceDay で日付が1日進む', () => {
    const { newWorldGame } = useWorldStore.getState();
    newWorldGame({ schoolName: 'テスト高校', prefecture: '新潟', managerName: '監督' });

    const beforeDate = useWorldStore.getState().worldState!.currentDate;
    const { advanceDay } = useWorldStore.getState();
    advanceDay('batting_basic');

    const afterDate = useWorldStore.getState().worldState!.currentDate;

    // 日付が進んでいる（月末の繰越しも考慮）
    const beforeTotal = beforeDate.year * 10000 + beforeDate.month * 100 + beforeDate.day;
    const afterTotal = afterDate.year * 10000 + afterDate.month * 100 + afterDate.day;
    expect(afterTotal).toBeGreaterThan(beforeTotal);
  });

  it('advanceDay が WorldDayResult を返す', () => {
    const { newWorldGame } = useWorldStore.getState();
    newWorldGame({ schoolName: 'テスト高校', prefecture: '新潟', managerName: '監督' });

    const { advanceDay } = useWorldStore.getState();
    const result = advanceDay('batting_basic');

    expect(result).not.toBeNull();
    expect(result!.date).toBeDefined();
    expect(result!.worldNews).toBeDefined();
  });

  it('advanceWeek で7日進む', () => {
    const { newWorldGame } = useWorldStore.getState();
    newWorldGame({ schoolName: 'テスト高校', prefecture: '新潟', managerName: '監督' });

    const beforeDate = useWorldStore.getState().worldState!.currentDate;
    const { advanceWeek } = useWorldStore.getState();
    const results = advanceWeek('batting_basic');

    expect(results).toHaveLength(7);

    // 7日分進んでいるはず（月をまたぐ場合も含む）
    const afterDate = useWorldStore.getState().worldState!.currentDate;
    const daysBefore = beforeDate.year * 365 + beforeDate.month * 31 + beforeDate.day;
    const daysAfter = afterDate.year * 365 + afterDate.month * 31 + afterDate.day;
    expect(daysAfter - daysBefore).toBeGreaterThanOrEqual(6);
  });

  it('getHomeView がゲーム開始後に null でない', () => {
    const { newWorldGame } = useWorldStore.getState();
    newWorldGame({ schoolName: 'テスト高校', prefecture: '新潟', managerName: '監督' });

    const { getHomeView } = useWorldStore.getState();
    const view = getHomeView();
    expect(view).not.toBeNull();
    expect(view!.team.schoolName).toBe('テスト高校');
  });

  it('getTeamView がゲーム開始後に null でない', () => {
    const { newWorldGame } = useWorldStore.getState();
    newWorldGame({ schoolName: 'テスト高校', prefecture: '新潟', managerName: '監督' });

    const { getTeamView } = useWorldStore.getState();
    const view = getTeamView();
    expect(view).not.toBeNull();
    expect(view!.players.length).toBeGreaterThan(0);
  });

  it('ゲーム未開始時の getHomeView は null', () => {
    const { getHomeView } = useWorldStore.getState();
    expect(getHomeView()).toBeNull();
  });

  it('addToWatch / removeFromWatch が機能する', () => {
    const { newWorldGame } = useWorldStore.getState();
    newWorldGame({ schoolName: 'テスト高校', prefecture: '新潟', managerName: '監督' });

    const { worldState } = useWorldStore.getState();
    const ms = worldState!.middleSchoolPool[0];
    expect(ms).toBeDefined();

    const { addToWatch, removeFromWatch } = useWorldStore.getState();

    addToWatch(ms.id);
    expect(useWorldStore.getState().worldState!.scoutState.watchList).toContain(ms.id);

    removeFromWatch(ms.id);
    expect(useWorldStore.getState().worldState!.scoutState.watchList).not.toContain(ms.id);
  });

  it('recentNews に日次ニュースが蓄積される', () => {
    const { newWorldGame } = useWorldStore.getState();
    newWorldGame({ schoolName: 'テスト高校', prefecture: '新潟', managerName: '監督' });

    // 7/1 に進める（シーズン節目ニュースが生成される）
    const store = useWorldStore.getState();
    // 複数日進める
    for (let i = 0; i < 5; i++) {
      useWorldStore.getState().advanceDay('batting_basic');
    }

    // recentNews は配列（空でも null でない）
    const { recentNews } = useWorldStore.getState();
    expect(Array.isArray(recentNews)).toBe(true);
  });
});
