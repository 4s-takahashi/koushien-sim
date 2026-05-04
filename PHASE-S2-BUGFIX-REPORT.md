# Phase S2 バグ修正レポート

**日付**: 2026-05-04
**バージョン**: 0.46.0 → 0.46.1
**担当**: koushien-bot
**コミット**:
- `2f928dc` fix(match): 旧自動進行UI (AutoPlayBar) を完全削除して新UIに統一
- `64ef1f3` fix(save): ロード時に match-store をリセットして旧試合状態の残留を防止

---

## バグ 1: 自動進行が止まる + UI が重複している

### 症状

試合画面に 2 系統の自動進行 UI が共存していた:

1. **旧 UI** (`AutoPlayBar`): `▶` / `⏸` トグル + 🐢/▶/⚡ 速度ボタン (右側)
2. **新 UI** (`AutoAdvanceBar`, Phase 12-H): `⏸/🔁 自動進行: ON/OFF` + ゆっくり/標準/高速 (左下)

両方が独立して match-store の異なる state フィールドを管理しており:
- 旧 UI: `autoPlayEnabled` / `autoPlaySpeed` → 旧タイマー `useEffect` が管理
- 新 UI: `autoAdvance` / `runnerMode.time` → `useAutoAdvanceController` が管理

旧 UI を ON にすると新 UI は無反応、新 UI を ON にすると旧タイマーが `autoAdvance` を見て停止する。
両方を操作すると state が食い違い、自動進行が止まる状態が発生した。

### 根本原因

Phase S1-L で新しい自動進行コントローラ (`useAutoAdvanceController`) を導入したが、
旧 `AutoPlayBar` コンポーネントと旧タイマー `useEffect` が削除されず残留していた。
旧タイマーには `if (autoAdvance) return;` のガードがあったが、
旧 UI 側を触るたびに `autoPlayEnabled` が変化して旧タイマーが起動し、
新 UI のタイミング制御と競合していた。

### 修正内容

**ファイル**: `src/app/play/match/[matchId]/page.tsx`

1. **`AutoPlayBar` コンポーネント定義を削除** (旧 L807-928)
   - `AutoPlayBarProps` インターフェース
   - `AutoPlayBar` 関数コンポーネント

2. **旧 store 購読を `MatchPage` から削除**
   ```ts
   // 削除
   const autoPlayEnabled = useMatchStore((s) => s.autoPlayEnabled);
   const autoPlaySpeed = useMatchStore((s) => s.autoPlaySpeed);
   const toggleAutoPlay = useMatchStore((s) => s.toggleAutoPlay);
   const setAutoPlaySpeed = useMatchStore((s) => s.setAutoPlaySpeed);
   ```

3. **旧自動進行タイマー `useEffect` を削除** (旧 L1477-1516)
   - `autoPlayEnabled` / `autoPlaySpeed` ベースの `setTimeout` ループ

4. **`MatchPageInnerProps` インターフェースから旧プロパティを削除**
   - `autoPlayEnabled`, `autoPlaySpeed`, `toggleAutoPlay`, `setAutoPlaySpeed`

5. **`MatchPageInner` 関数シグネチャから旧プロパティを削除**

6. **`MatchPageInner` JSX から `<AutoPlayBar />` 呼び出しを削除**

7. **`MatchPage` → `MatchPageInner` へのプロパティ渡しから旧プロパティを削除**

### 結果

`AutoAdvanceBar` (Phase 12-H) のみが自動進行を管理し、
`useAutoAdvanceController` の単一オーナー FSM が正しく動作するようになった。

---

## バグ 2: セーブデータをロードしても前の試合状態が残る

### 症状

試合中にセーブ → 別のセーブをロード → 試合ページへ遷移すると、
ロード前にプレイしていた試合の続きから始まる。

### 根本原因

`world-store.loadGame` は `worldState` (= WorldState) のみを入れ替え、
`match-store` に保持されている試合関連 state を一切クリアしていなかった。

`match-store` は Zustand の `persist` ミドルウェアで localStorage に永続化されており、
試合 runner / narration / pitchLog / autoAdvance 等が残留する。

試合ページ (`/play/match/[matchId]`) のマウント時に
`matchStoreRunner !== null` の条件が true になるため、
`initialized = true` だけ設定して既存の runner をそのまま使用してしまう。

### 修正内容

**ファイル 1**: `src/stores/world-store.ts`

```ts
loadGame: async (slotId: WorldSaveSlotId) => {
  const result = await loadWorldState(slotId);
  if (result.success && result.world) {
    set({
      worldState: result.world,
      recentResults: [],
      recentNews: [],
      lastDayResult: null,
    });
    // ロード時に試合中の状態（match-store）を必ずリセット
    const { useMatchStore } = await import('./match-store');
    useMatchStore.getState().resetMatch();
  }
  return result;
},
```

**ファイル 2**: `src/app/play/save/SaveLoadPanel.tsx` (クラウドロードパス)

クラウドロードは `useWorldStore.setState` を直接呼ぶため `loadGame` を経由しない。
同様に `resetMatch()` を追加:

```ts
// クラウドロード成功後に追加
const { useMatchStore } = await import('../../../stores/match-store');
useMatchStore.getState().resetMatch();
```

### なぜ dynamic import を使うか

`world-store` から `match-store` を静的 import すると将来の循環依存リスクがある。
`match-store` は現在 `world-store` を import していないので即時は循環しないが、
dynamic import を使うことでバンドル時の依存グラフを明確に保つ。

### 検証手順（マニュアル確認）

1. 新規ゲームを開始し、試合ページで数球進める
2. セーブ → スロット1に保存
3. 別のセーブデータをスロット2からロード
4. 試合ページへ遷移
5. **期待結果**: スロット2 の状態から新規試合が始まる（前の試合の続きではない）

---

## テスト結果

| テストスイート | ファイル数 | テスト件数 | 結果 |
|---|---|---|---|
| engine/match | 28 | 309 | ✅ PASS |
| engine/save | 3 | 42 | ✅ PASS |
| engine/world + player + growth | 29 | 367 | ✅ PASS |
| engine/psyche + evaluator + practice + team + staff + scouting + narrative + physics + calendar + integration | 27 | 666 | ✅ PASS |
| engine/core | 2 | 10 | ✅ PASS |
| stores/match-store-hydration + world-store-hydration + world-store | 3 | 24 | ✅ PASS |
| stores/interactive-match-bug12m | 1 | 9 | ✅ PASS (73s) |
| stores/autumn-tournament-advanceweek | 1 | 5 | ✅ PASS (53s) |
| stores/autumn-tournament-e2e | 1 | 14 | ✅ PASS (235s, 重いテスト) |
| ui + platform + data + phase9 | 37 | 598 | ✅ PASS |

ビルド: `npm run build` → ✅ 型エラーなし、28ページ全生成成功

---

## 完了チェックリスト

- [x] 旧自動進行 UI と関連ロジック完全削除
- [x] 新自動進行 UI だけで自動進行が問題なく動く
- [x] セーブロード後に試合データが残らない
- [x] ビルド成功 (npm run build)
- [x] テスト全 PASS
- [x] コミット完了 (2コミット)
- [x] PHASE-S2-BUGFIX-REPORT.md 作成
- [ ] デプロイ（高橋さん手動確認後）
