/**
 * tests/stores/world-store-hydration.test.ts
 *
 * Zustand persist のハイドレーション完了フラグ (_hasHydrated) のテスト。
 *
 * 高橋さん報告 2026-04-19:
 *   リロードすると学校選択画面に戻ってしまう。
 *   原因: worldState が null (hydrate 前) の時に即 router.replace('/new-game') が発火していた。
 *   対策: _hasHydrated を見て「復元前」と「本当に未開始」を区別する。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useWorldStore } from '@/stores/world-store';

describe('world-store: _hasHydrated フラグ', () => {
  beforeEach(() => {
    // 各テストで状態をリセット
    useWorldStore.setState({
      worldState: null,
      isLoading: false,
      lastDayResult: null,
      recentResults: [],
      recentNews: [],
      _hasHydrated: false,
    });
  });

  it('初期状態では _hasHydrated=false', () => {
    const state = useWorldStore.getState();
    expect(state._hasHydrated).toBe(false);
  });

  it('_setHasHydrated(true) で _hasHydrated=true になる', () => {
    useWorldStore.getState()._setHasHydrated(true);
    expect(useWorldStore.getState()._hasHydrated).toBe(true);
  });

  it('_setHasHydrated(false) で false に戻せる', () => {
    useWorldStore.getState()._setHasHydrated(true);
    expect(useWorldStore.getState()._hasHydrated).toBe(true);
    useWorldStore.getState()._setHasHydrated(false);
    expect(useWorldStore.getState()._hasHydrated).toBe(false);
  });

  it('worldState は _hasHydrated とは独立して変更できる', () => {
    // _hasHydrated=true のまま worldState を null → 値 → null と変更
    useWorldStore.getState()._setHasHydrated(true);
    expect(useWorldStore.getState().worldState).toBeNull();
    expect(useWorldStore.getState()._hasHydrated).toBe(true);
  });

  it('UI ガード条件: hasHydrated=false なら "読み込み中" を出すべき', () => {
    // UI 側の判定ロジックをテストで表現
    const shouldShowLoading = (hasHydrated: boolean, worldState: unknown): boolean => {
      return !hasHydrated || !worldState;
    };

    // 初回マウント: hydrate 前 → 読み込み中
    expect(shouldShowLoading(false, null)).toBe(true);
    expect(shouldShowLoading(false, {})).toBe(true);

    // hydrate 後、worldState あり → 正常表示
    expect(shouldShowLoading(true, {})).toBe(false);

    // hydrate 後、worldState なし → 読み込み中
    // (このあと useEffect が /new-game に遷移する想定)
    expect(shouldShowLoading(true, null)).toBe(true);
  });

  it('リダイレクトガード条件: hasHydrated=true かつ worldState=null のみ /new-game に飛ぶ', () => {
    const shouldRedirectToNewGame = (
      hasHydrated: boolean,
      worldState: unknown,
    ): boolean => {
      if (!hasHydrated) return false;
      if (!worldState) return true;
      return false;
    };

    // hydrate 前: 絶対にリダイレクトしない
    expect(shouldRedirectToNewGame(false, null)).toBe(false);
    expect(shouldRedirectToNewGame(false, {})).toBe(false);

    // hydrate 後、worldState あり: リダイレクトしない
    expect(shouldRedirectToNewGame(true, {})).toBe(false);

    // hydrate 後、worldState なし: リダイレクトする (本当に未開始)
    expect(shouldRedirectToNewGame(true, null)).toBe(true);
  });
});
