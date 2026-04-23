# Phase 12-M 実装レポート

**バージョン**: v0.32.0
**作業日**: 2026-04-23
**ブランチ**: main

---

## 概要

Phase 12-M では以下の4つのタスクを実施した。

| # | 種別 | タイトル | 状態 |
|---|------|----------|------|
| Bug #1 | 高優先度バグ | 試合画面に遷移せず自動で結果が出る | ✅ 修正完了 |
| Bug #2 | 高優先度バグ | 試合中断時に夏大会が終わらない | ✅ 修正完了 |
| Feature #3 | 中優先度機能 | ホーム画面に練習メニュー常時表示 | ✅ 実装完了 |
| Feature #4 | 中優先度機能 | ニュース画面選手リンク名前表示 | ✅ 実装完了 |

---

## Bug #1: 試合画面に遷移せず自動で結果が出る

### 根本原因

`advanceWeek()` の初回イテレーション（`i=0`）は大会試合日チェックをスキップしていた。
その結果、`pendingInteractiveMatch` が既にストアにセットされている状態で `advanceDay()` が呼ばれ、
`advanceDay` 内部の auto-sim ブロックがインタラクティブ試合を消費してしまっていた。

### 修正内容

`src/stores/world-store.ts` — `advanceWeek()` の各イテレーション冒頭に
`pendingInteractiveMatch` チェックを追加。既に待機中の試合があれば即 `break` する。

```typescript
// Bug #1 修正: インタラクティブ試合が既に待機中の場合は即座に停止
if (currentWorld.pendingInteractiveMatch) {
  break;
}
```

`advanceDay()` の auto-sim 挙動は既存テスト互換性のため維持。
`advanceWeek()` が停止することで UI 側の「試合へ進む」ボタン表示フローが正常に機能する。

### テスト

`tests/stores/interactive-match-bug12m.test.ts` に回帰テスト追加:
- `pendingInteractiveMatch` がある状態で `advanceWeek` を呼ぶと即停止する
- `advanceWeek` を複数回呼んでも試合が消費されない
- 試合日に `advanceDay` を呼ぶと `waitingForInteractiveMatch` が設定される

---

## Bug #2: 試合中断時に夏大会が終わらない

### 根本原因

Bug #1 の auto-sim により試合ラウンドが不完全に処理された場合、
`activeTournament.isCompleted` が `false` のまま残ることがある。
日付が大会ウィンドウ（夏: 7/10-7/30、秋: 9/15-10/14）を過ぎると、
秋大会生成の条件チェックが通らず `activeTournament` が永久に残留する。

### 修正内容

**エンジンレベル** (`src/engine/world/world-ticker.ts`):
`advanceWorldDay()` 内で、日付が大会ウィンドウ外になった `isCompleted=false` の
`activeTournament` を検出し、履歴に移動して `null` にする救済処理を追加。

**セーブデータ移行** (`src/stores/world-store.ts` — `onRehydrateStorage`):
ゲーム起動時（localStorage 読み込み時）に既存セーブデータの stale tournament を
同様に救済する処理を追加。

### 対象ウィンドウ

| 大会種別 | stale 判定条件 |
|----------|---------------|
| summer | 月 > 7 または (月 = 7 かつ 日 > 30) |
| autumn | 月 > 10 または 月 < 7 または (月 = 10 かつ 日 > 14) |

### テスト

- 夏大会期間外（8月）に stale な summer tournament → `advanceDay` で救済される
- 秋大会期間外（11月）に stale な autumn tournament → `advanceDay` で救済される

---

## Feature #3: ホーム画面に練習メニュー常時表示

### 実装内容

1. **`src/ui/projectors/view-state-types.ts`**
   `HomeViewState` に `teamPracticeMenuId` と `teamPracticeMenuLabel` フィールドを追加。

2. **`src/ui/projectors/homeProjector.ts`**
   `playerSchool.practiceMenu` から現在の練習メニューIDを取得し、
   日本語ラベルマップ（`PRACTICE_MENU_LABELS`）でラベルに変換して `HomeViewState` に含める。

3. **`src/app/play/page.tsx`**
   「今日やること」カードの下部に練習メニューセクションを追加:
   - 設定済みの場合: メニュー名バッジ + 「変更 →」リンク
   - 未設定の場合: 「未設定」テキスト + 「練習メニューを設定する」ボタン

---

## Feature #4: ニュース画面選手リンク名前表示

### 修正内容

**`src/app/news/page.tsx`**:
- `NewsPage` で全学校の選手情報から `Map<playerId, playerName>` を構築。
- `NewsItemView` に `playerNameMap` を渡し、選手リンクのテキストを
  「選手詳細」→ 実際の選手名に変更。

---

## テスト結果

| 項目 | 数値 |
|------|------|
| 総テスト数 | 1150 |
| 通過 | 1148 |
| 失敗（既存の事前失敗） | 2 |
| 新規追加テスト | 9 |

### 失敗テスト（Phase 12-M 前から存在する既存の失敗）

1. `autumn-tournament.test.ts` > 夏大会終了後（7/29-7/30）は `post_summer` フェーズを返す
2. `autumn-tournament.test.ts` > 秋大会終了後（10/11-10/14）は `off_season` フェーズを返す

これら2件は Phase 12-M の変更とは無関係のフェーズ遷移ロジックに関するテストで、
Phase 12-M 実施前から失敗していた。

---

## 変更ファイル一覧

| ファイル | 変更種別 | 内容 |
|---------|----------|------|
| `src/engine/world/world-ticker.ts` | 修正 | Bug #2: stale tournament 救済処理 |
| `src/stores/world-store.ts` | 修正 | Bug #1: advanceWeek 停止条件追加; Bug #2: rehydrate 時救済処理 |
| `src/ui/projectors/view-state-types.ts` | 修正 | Feature #3: HomeViewState に練習メニューフィールド追加 |
| `src/ui/projectors/homeProjector.ts` | 修正 | Feature #3: 練習メニューラベル算出 |
| `src/app/play/page.tsx` | 修正 | Feature #3: 練習メニューセクション UI |
| `src/app/news/page.tsx` | 修正 | Feature #4: 選手リンク名前表示 |
| `tests/stores/interactive-match-bug12m.test.ts` | 新規 | Bug #1/#2 回帰テスト (9テスト) |
| `src/version.ts` | 更新 | v0.31.0 → v0.32.0 |
| `package.json` | 更新 | version: "0.32.0" |
