# Phase 8 完了レポート: 重大バグ修正 + UI 機能拡張

**日付**: 2026-04-17  
**テスト結果**: 544 passed (51 test files, 505 既存 + 39 新規)  
**ビルド**: `npx next build` 成功

---

## 重大バグ修正

### バグ1修正: シーズンフェーズ遷移

**ファイル**: `src/engine/world/world-ticker.ts`

**問題**: `advanceWorldDay()` に seasonState.phase の更新ロジックが全くなかった。

**修正内容**:
- `computeSeasonPhase(date: GameDate): SeasonPhase` 関数を追加（エクスポート済み）
- 日付に基づく明確なフェーズ判定:
  - 4/1〜7/9: `spring_practice`
  - 7/10〜7/30: `summer_tournament`
  - 7/31〜9/14: `post_summer`
  - 9/15〜10/14: `autumn_tournament`
  - 10/15〜1/31: `off_season`
  - 2/1〜3/31: `pre_season`
- `advanceWorldDay()` 内で newDate のフェーズを計算し `nextWorld.seasonState.phase` を更新
- `result.seasonTransition` に変更があった場合のみフェーズを設定
- 年度替わり（3/31→4/1）時に `spring_practice` に強制リセット

### バグ2修正: 大会が自動で始まらない・進行しない

**ファイル**: `src/engine/world/world-ticker.ts`

**問題**: tournament-bracket.ts の関数が world-ticker.ts から呼ばれていなかった。

**修正内容**:
- `createTournamentBracket` と `simulateTournamentRound` をインポート
- 夏大会: newDate が 7/10 の時に自動で `createTournamentBracket('summer', ...)` を実行
- 秋大会: newDate が 9/15 の時に自動で `createTournamentBracket('autumn', ...)` を実行
- `getTodayRound(date, tournamentType)` 関数で今日のラウンド番号を計算
  - 夏大会: 7/10, 7/13, 7/17, 7/21, 7/25, 7/28 にラウンド1〜6
  - 秋大会: 9/15, 9/19, 9/24, 9/29, 10/5, 10/10 にラウンド1〜6
- `simulateTournamentRound()` で1日1ラウンドずつ消化
- 大会終了後: `activeTournament → tournamentHistory` に移動、`yearResults` 更新
- `seasonState.currentTournamentId` を常に最新化

### バグ3修正: 試合結果が反映されない

**ファイル**: `src/engine/world/world-ticker.ts`

**問題**: `playerMatchResult`, `playerMatchOpponent`, `playerMatchSide` が常に未設定。

**修正内容**:
- `findPlayerMatchInRound()` で自校の試合を各ラウンドから検索
- 試合がある日は `WorldDayResult` に以下を設定:
  - `playerMatchResult`: スコアベースの簡易 MatchResult
  - `playerMatchOpponent`: 対戦相手の学校名
  - `playerMatchSide`: 'home' | 'away'
  - `playerMatchInnings`: null（詳細シミュレーション未実装）
- 勝敗に応じてニュースを生成し `worldNews` に追加

---

## UI 機能拡張

### 機能1: ホーム画面 チーム概要に選手リンク追加

**ファイル**: `src/app/page.tsx`, `src/app/page.module.css`

- チーム概要セクションに注目選手（上位3名）を表示
- 各選手名をクリックすると `/team/[playerId]` へ遷移
- ランク（S/A/B/C）と総合力を表示
- `.startersList`, `.starterItem` などの CSS クラスを追加

### 機能2: ニュース詳細画面

#### a. `/news` ページ新規作成
**ファイル**: `src/app/news/page.tsx`, `src/app/news/page.module.css`

- 全ニュース一覧（重要度順）
- 各ニュースはクリックで展開（詳細表示）
- 関連校名 → `/school/[schoolId]` へのリンク
- 関連選手ID → `/player/[playerId]` へのリンク
- `importance` に応じた視覚的区別（赤・緑・灰の左ボーダー）

#### b. ナビゲーション更新
**全ページ** (home, team, team/[playerId], scout, tournament, results, ob, news) に「ニュース」タブを追加

#### c. ホーム画面「もっと見る」リンク追加
- ニュースセクションに `もっと見る →` リンクを追加 (`/news` へ遷移)
- ホーム画面のニュース表示を最新5件に制限

### 機能3（新規ページ）: /school/[schoolId]

**ファイル**: `src/app/school/[schoolId]/page.tsx`, `src/app/school/[schoolId]/page.module.css`

- 高校名、都道府県、評判（星5段階）
- チーム戦力の概要（総合力スコア + バー）
- 自校の場合は「詳細データを見る」リンク
- 今年の大会成績（夏・秋・甲子園）
- 主要選手（名前 + 学年 + ポジション + スタイル分類 + ランク S/A/B/C のみ、数値非表示）
- 自校選手は `/team/[playerId]`、他校選手は `/player/[playerId]` へリンク

### 機能4（新規ページ）: /player/[playerId]

**ファイル**: `src/app/player/[playerId]/page.tsx`, `src/app/player/[playerId]/page.module.css`

- 自校の選手は `/team/[playerId]` へリダイレクト（フルデータ表示）
- 他校の選手は概要のみ表示:
  - 所属校（クリックで `/school/[schoolId]`）
  - 学年・ポジション・体格
  - 総合力ランク（S/A/B/C のみ。数値非表示）
  - 投手: 速球派/変化球派/バランス型 + 最速表示
  - 野手: 長距離打者/巧打者/俊足/守備型/バランス型
  - スカウトレポートがある場合はコメントを表示

---

## 新規テスト

**ファイル**: `tests/engine/world/world-ticker-phase8.test.ts`

21テストケースを追加:

### シーズンフェーズ遷移テスト (8件)
- 4月は `spring_practice` フェーズ
- 7/10 に `summer_tournament` フェーズに遷移
- 7/31 以降は `post_summer` フェーズ
- 9/15 に `autumn_tournament` フェーズに遷移
- 10/15 に `off_season` フェーズに遷移
- 12月は `off_season` フェーズ
- 2/1 に `pre_season` フェーズに遷移
- 4月〜7月〜9月〜12月の連続遷移確認

### トーナメント自動生成・進行テスト (5件)
- 7/10 に夏大会が自動開始
- 夏大会は48校で構成
- 夏大会開始後に `currentTournamentId` が設定される
- 夏大会は6ラウンド構成
- 夏大会期間中にラウンドが消化される

### 試合結果反映テスト (3件)
- 大会期間外は `playerMatchResult` が undefined
- 7/10 に自校の試合がある場合 `playerMatchResult` が設定される
- 試合結果の `finalScore` が正しい数値型

### 年度替わりシーズンリセットテスト (3件)
- 3/31→4/1 で `spring_practice` になる
- 年度替わりで `currentTournamentId` がリセット
- 年度替わりで `manager.yearsActive` が増加

---

## 完了条件の確認

| 条件 | 状態 |
|------|------|
| `npx vitest run` で全テスト（544件）がパス | ✅ |
| `npx next build` が成功 | ✅ |
| シーズンが 7/10 以降に `summer_tournament` に遷移 | ✅ |
| 大会が自動開始・進行し、試合結果が表示 | ✅ |
| ホーム画面から選手詳細に遷移できる | ✅ |
| ニュース詳細画面が動作する | ✅ |
| 高校詳細画面が動作する | ✅ |
