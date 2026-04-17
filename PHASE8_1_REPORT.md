# Phase 8.1 完了報告: 大会UX改善 — 試合日導線・自動進行・ホーム表示

**実施日**: 2026-04-17  
**ベースコミット**: 935ce7a  
**テスト結果**: 569 パス（544 → 569、+25 新規テスト）

---

## 実装概要

4つの問題点をすべて解決し、6つの改善を実装した。

---

## 修正内容

### 1. 大会画面から手動開始ボタンを削除 ✅

**変更ファイル**: `src/app/tournament/page.tsx`

- `startTournament(type)` の呼び出しボタン（夏大会を開始 / 秋大会を開始 / 甲子園を開始）を完全削除
- `TournamentStatusDisplay` コンポーネントを新設し、大会前のステータスを表示:
  - 春季練習中 → 「夏の大会まで あとN日（7月10日開始）」
  - 夏以降練習中 → 「秋の大会まで あとN日（9月15日開始）」
  - オフシーズン → 「翌年夏の大会に向けて準備を」
  - プレシーズン → 「春の練習期間 — 7月10日開幕」
- `TournamentType` インポートを削除（不要になったため）

---

### 2. ホーム画面に試合情報を追加 ✅

**変更ファイル**:
- `src/ui/projectors/view-state-types.ts`
- `src/ui/projectors/homeProjector.ts`
- `src/app/page.tsx`
- `src/app/page.module.css`

#### ViewState 型拡張

`HomeViewState` に以下を追加:
```typescript
tournament?: HomeTournamentInfo;     // 大会開催中の詳細情報
tournamentStart?: HomeTournamentStartInfo;  // 大会開始前の情報
```

#### homeProjector 拡張

`buildTournamentInfo()` — 開催中の大会情報を構築:
- `isMatchDay`: 今日が試合日かどうか（スケジュール表と照合）
- `nextMatchDate / nextMatchDaysAway`: 次の試合日と残り日数
- `playerEliminated`: 自校が敗退済みかどうか
- `currentRound`: 現在の進行ラウンド名

`buildTournamentStartInfo()` — 大会開始前の情報:
- 4月〜7月9日 → 夏の大会まで何日
- 7月31日〜9月14日 → 秋の大会まで何日

#### ホーム UI 追加要素

| 要素 | 条件 | 内容 |
|------|------|------|
| `TournamentStartBanner` | 大会開始日（季節遷移時） | 「夏の大会が始まりました！」バナー（✕で閉じる） |
| `tournamentBanner` (matchDay) | 試合日 | 「⚾ 今日は試合日です！— 夏の大会 1回戦」（赤強調） |
| `tournamentPreBanner` | 大会14日前以内 | 「夏の大会まで あとN日」バナー |
| `matchDayCard` | 試合日・未敗退 | 対戦相手表示・進行ヒント |
| `nextMatchCard` | 非試合日・大会中・未敗退 | 「次の試合: 7月13日（あと3日）」 |
| `MatchResultModal` | 試合結果あり | 得点表示・勝敗メッセージ・試合結果ページリンク |
| 大会インジケーター | 大会期間中 | ナビバー「大会」リンク横に 🔴 表示 |

---

### 3. 「1週間まとめて進む」を試合日で停止するように変更 ✅

**変更ファイル**: `src/stores/world-store.ts`

`advanceWeek()` 修正:
- 大会開催中 & 自校が未敗退 & `i > 0`（初日以外）の場合
- 現在の日付が試合日（`isTournamentMatchDay()`）なら即座に break
- 試合結果がある場合（`result.playerMatchResult`）も break

`isPlayerSchoolInTournament()` ヘルパー追加:
- TournamentBracket の全試合を確認し、一度でも負けていれば `false`

`isTournamentMatchDay()` ヘルパー追加:
- 夏大会: 7/10, 7/13, 7/17, 7/21, 7/25, 7/28
- 秋大会: 9/15, 9/19, 9/24, 9/29, 10/5, 10/10

**動作**: 自校が敗退済みの場合は大会中でも通常通り1週間進む。

---

### 4. 試合日モーダル通知 ✅

**変更ファイル**: `src/app/page.tsx`

`MatchResultModal` コンポーネント:
- 試合結果（得点表示・大きな数字）
- 勝利 → 「🎉 おめでとうございます！次の試合も頑張りましょう！」
- 敗北 → 「残念...。大会は終了です。来年こそ甲子園へ！」
- 試合結果ページへのリンク付き

`advanceDay()` / `advanceWeek()` の結果チェック:
- `playerMatchResult` があれば `setMatchResult()` でモーダル表示
- `seasonTransition` が大会開始なら `setTournamentStartBanner()` 表示

`currentView` ステート: 進行後に最新の HomeViewState を即時反映。

---

### 5. ナビゲーションの大会インジケーター ✅

**変更ファイル**: `src/app/page.tsx`

```jsx
<Link href="/tournament" className={styles.navLink}>
  大会{displayView.isInTournamentSeason && <span className={styles.navIndicator}>🔴</span>}
</Link>
```

大会期間中は「大会」リンク横に 🔴 インジケーターを表示。

---

## 新規 CSS クラス

`src/app/page.module.css` に追加:

| クラス | 用途 |
|--------|------|
| `.tournamentBannerMatchDay` | 試合日バナー（赤強調） |
| `.tournamentPreBanner` | 大会開始14日前バナー |
| `.navIndicator` | ナビの 🔴 インジケーター |
| `.tournamentStartBanner` | 大会開始通知（閉じるボタン付き） |
| `.matchDayCard` | 試合日カード |
| `.nextMatchCard` | 次の試合情報カード |
| `.modalOverlay / .modal` | 試合結果モーダル |

`src/app/tournament/page.module.css` に追加:

| クラス | 用途 |
|--------|------|
| `.statusBox` | 大会前ステータスコンテナ |
| `.statusTitle / .statusDetail / .statusNote` | テキスト表示 |

---

## 新規テスト

### `tests/ui/projectors/homeProjectorPhase8.test.ts` (17テスト)

- 春季練習中の夏大会開始前情報
- 7月9日は1日前
- 夏以降の秋大会開始前情報
- 大会期間中は tournamentStart が undefined
- 大会開催中の tournament フィールド
- 夏大会試合日 / 非試合日の isMatchDay
- 秋大会の typeName
- isInTournamentSeason フラグ
- 残り日数計算（5月/7月/8月）

### `tests/engine/world/world-store-phase8.test.ts` (9テスト)

- 夏大会は7/10に自動作成される
- 7/10→7/11 で大会進行
- 7/11 は試合なし日
- 9/15 に秋大会自動開始
- 試合日の playerMatchResult
- 大会外では playerMatchResult=undefined
- 夏大会の自動終了
- 大会後の tournamentHistory 保存
- 7/31 への post_summer 遷移

---

## 実装制約の遵守

- ✅ 既存 544 テスト維持（569 パス）
- ✅ ViewState Projector パターン維持（純粋関数 homeProjector）
- ✅ CSS Modules のみ使用
- ✅ 和風デザイン継続
- ✅ `npx next build` 成功（TypeScript エラーなし）

---

## フローの全体像（実装後）

```
通常の日: [1日進む] or [1週間進む] で日常練習
     ↓
大会14日前になると:
     ↓
ホーム画面に「夏の大会まで あとN日」バナー表示
     ↓
7月10日に1日進めると:
     ↓
「🏟️ 夏の大会が始まりました！」バナー表示
     ↓
試合日（7/10, 7/13, 7/17...）に1日進めると:
     ↓
試合結果モーダル「vs ○○高校 — 5-3 勝利！」
     ↓
「次の試合まで○日」をホームに表示
     ↓
1週間進むで試合日を跨ぐ場合:
     ↓
試合日で自動停止 → 試合結果を表示
     ↓
自校が敗退した場合:
     ↓
「残念...」モーダル → 以降は通常進行
```

---

## 削除した機能

- `startTournament()` の UIからの直接呼び出し（大会画面の「夏大会を開始」ボタン群）
  - `world-store.ts` の `startTournament()` メソッド自体は維持（内部利用可能）
  - `TournamentType` インポートの削除（`tournament/page.tsx`）
