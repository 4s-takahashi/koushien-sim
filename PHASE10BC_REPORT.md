# Phase 10-B/C 実装レポート

**実装日**: 2026-04-18
**ブランチ**: main
**担当**: Phase 10-B（試合画面UI） + Phase 10-C（大会統合）

---

## 概要

甲子園シミュレーターに「インタラクティブ試合モード」を実装した。
夏季・秋季大会で自校の試合日になると、AI自動シミュレーションではなく
プレイヤーが1球ずつ采配しながら観戦できる試合画面に移行する。

---

## Phase 10-B: 試合画面UI

### 新規ファイル

#### `src/stores/match-store.ts`

Zustand ストアによるインタラクティブ試合状態管理。

- **保持データ**: MatchRunner インスタンス（メモリのみ、persist なし）
- **RunnerMode**: `{ time: 'short' | 'standard', pitch: 'off' | 'on' }` 2軸直交設計
- **アクション**:
  - `initMatch(initialState, playerSchoolId, seed)` — 試合初期化
  - `resetMatch()` — 試合状態クリア（ホーム遷移前）
  - `getMatchView()` — `projectMatch()` 経由で MatchViewState を取得
  - `setTimeMode(time)` / `setPitchMode(pitch)` — モード切り替え + pauseReason 再評価
  - `applyOrder(order)` — 采配適用（代打・継投・バント・盗塁・マウンド訪問）
  - `stepOnePitch()` / `stepOneAtBat()` / `stepOneInning()` / `runToEnd()` — 進行制御
  - `resumeFromPause()` — 停止解除

#### `src/app/play/match/[matchId]/page.tsx`

インタラクティブ試合画面（Next.js App Router クライアントコンポーネント）。

**UIコンポーネント構成**:
- `Scoreboard` — チーム名・得点・イニング・アウト・カウント
- `InningScoreTable` — 回別得点表（9回分 + 合計）
- `Diamond` — 塁占有ダイアモンド（走者名表示付き）
- `PitcherPanel` — 投手情報（スタミナバー・球数・球種）
- `BatterPanel` — 打者情報（成績・総合力・特性）
- `PauseBanner` — 停止理由表示（場面別カラーリング）
- `TacticsBar` — 采配ボタン群（そのまま/バント/盗塁/代打/投手交代/マウンド訪問）
- `SelectPanel` — 代打・継投・盗塁走者選択モーダル
- `RecentLog` — 直近8球の投球ログ
- `ResultModal` — 試合終了モーダル（ホームへ/ブラケットへ）

**TimeMode（速度）**:
- ⚡ 短縮: 通常の停止条件を緩和
- 🎯 標準: フルの停止条件（チャンス・ピンチ・疲労・クロスゲーム等）

**PitchMode（1球モード）**:
- ON: 1球ボタンが表示される
- OFF: 最小単位は1打席

**試合終了フロー**:
1. `matchResult` が非 null になるとモーダルを表示
2. 「ホームへ」→ `finishInteractiveMatch(matchResult)` → `resetMatch()` → `/play` へ
3. 「ブラケットへ」→ `finishInteractiveMatch(matchResult)` → `resetMatch()` → `/play/tournament` へ

#### `src/app/play/match/[matchId]/match.module.css`

暗色テーマ（背景 `#0a1628`）のCSSモジュール。

- スコアボード・イニング表・ダイヤモンド・投打者パネル
- スタミナバー（fresh/normal/tired/exhausted の4段階カラー）
- 停止バナー（チャンス=緑/ピンチ=赤/疲労=橙/クロスゲーム=紫/試合終了=金）
- 采配・進行ボタン
- 選択モーダルオーバーレイ

---

## Phase 10-C: 大会統合

### 変更ファイル

#### `src/engine/world/world-state.ts`

`WorldState` に `pendingInteractiveMatch` フィールドを追加:

```typescript
export interface PendingInteractiveMatch {
  opponentSchoolId: string;
  round: number;
  tournamentId: string;
  playerSide: 'home' | 'away';
  matchDate: GameDate;
}

export interface WorldState {
  // ...
  pendingInteractiveMatch?: PendingInteractiveMatch | null;
}
```

#### `src/engine/world/world-ticker.ts`

**変更内容**:

1. `AdvanceWorldDayOptions` インターフェースを追加:
   ```typescript
   export interface AdvanceWorldDayOptions {
     interactive?: boolean; // デフォルト false
   }
   ```

2. `advanceWorldDay()` に第4引数 `options` を追加:
   - `interactive: true` の場合: 自校の未決試合を検出 → `pendingInteractiveMatch` 設定 → 日付を進めずに早期リターン
   - `interactive: false`（デフォルト）: 既存通り全試合を自動シミュレーション（テスト互換性維持）

3. `WorldDayResult` に `waitingForInteractiveMatch?: boolean` を追加

4. `completeInteractiveMatch(world, matchResult, rng)` を追加（export）:
   - ブラケットに試合結果を反映（winnerId・スコア・イニング詳細）
   - `propagateWinnersPublic()` で次ラウンドへ勝者を伝播
   - 大会終了チェック → `activeTournament: null` / `tournamentHistory` 更新
   - 日付を1日進める（通常進行に合流）
   - `pendingInteractiveMatch: null` をセット

5. `propagateWinnersPublic()` プライベートヘルパーを追加（tournament-bracket.ts の内部実装を模倣）

#### `src/stores/world-store.ts`

**変更内容**:

1. `completeInteractiveMatch` / `simulateTournamentRound` をインポート追加

2. `advanceDay()` を更新:
   - `pendingInteractiveMatch` が設定済みの場合、`simulateTournamentRound()` で自校の試合を自動シミュレーションして消化してから進行（テスト・自動進行との互換性）
   - `advanceWorldDay(worldState, menuId, rng, { interactive: true })` で呼び出し（UI では試合日に停止）
   - `result.waitingForInteractiveMatch` を `advanceWeek()` のループ停止条件に追加

3. `advanceWeek()` を更新:
   - `result.waitingForInteractiveMatch` が true の場合ループ停止

4. `finishInteractiveMatch(matchResult)` を追加:
   - `completeInteractiveMatch()` を呼んでブラケット更新 + 日付進行
   - ニュース・結果履歴を蓄積してストア更新

5. `WorldStore` 型定義に `finishInteractiveMatch` を追加

#### `src/app/play/page.tsx`

**変更内容**:

1. `worldState` セレクタと `useRouter()` を `HomeContent` に追加

2. `pendingInteractiveMatch` 導出変数を追加

3. `handleStartInteractiveMatch` コールバック: `/play/match/current` へ遷移

4. インタラクティブ試合待機バナーを追加:
   ```tsx
   {pendingInteractiveMatch && (
     <div className={`${styles.card} ${styles.cardFull} ${styles.matchDayCard}`}>
       <div className={styles.matchDayTitle}>⚾ 試合の準備ができました！</div>
       {/* 対戦相手名 + 回戦 */}
       <button onClick={handleStartInteractiveMatch}>▶ 試合を始める</button>
     </div>
   )}
   ```

5. 従来の試合日バナーに `!pendingInteractiveMatch &&` 条件を追加（重複表示防止）

---

## テスト結果

### 全テスト: 743 / 743 パス ✅

```
Test Files  63 passed (63)
     Tests  743 passed (743)
  Duration  436.85s
```

既存の657テストを含む全テストがパス。Phase 10-B/C で新たにテストが破損したケースなし。

### 修正が必要だったリグレッション

Phase 10-C の `advanceWorldDay` への変更により、既存の E2E テストが 7/10（夏大会1回戦）で停止するリグレッションが発生した。

**原因**: `advanceWorldDay({ interactive: true })` を常に呼ぶと、自校の試合日に `pendingInteractiveMatch` が設定され日付が進まなくなる。テストの `advanceToDate` ループが無限に同じ日に留まる。

**修正**:
- `advanceWorldDay` にオプション引数 `{ interactive?: boolean }` を追加（デフォルト false）
- テスト直接呼び出し（`advanceWorldDay` 単体）では interactive=false で動作
- Store 経由の `advanceDay` では `{ interactive: true }` を渡すが、**既に `pendingInteractiveMatch` が設定済みの場合は `simulateTournamentRound` で自動消化してから進行**
- これにより、テストが `advanceDay` を繰り返し呼んでも自動的に試合を消化して前進できる

---

## 動作フロー

```
プレイヤー操作:
  advanceDay(「練習して1日進む」)
    ↓
  world-ticker: 今日が試合日 & interactiveMode=true
    ↓
  他校の試合を auto-simulate (skipPlayerMatch)
    ↓
  pendingInteractiveMatch 設定 + 日付停止
    ↓
  UI: ホーム画面に「▶ 試合を始める」バナー表示
    ↓
  プレイヤーが「試合を始める」クリック
    ↓
  /play/match/current に遷移
    ↓
  MatchPage: pendingInteractiveMatch から MatchState 構築
  initMatch(initialState, playerSchoolId, seed)
    ↓
  試合進行（1球 / 1打席 / 1イニング / 最後まで）
  采配（バント / 盗塁 / 代打 / 投手交代 / マウンド訪問）
    ↓
  試合終了 → ResultModal
    ↓
  「ホームへ戻る」or「ブラケットへ」クリック
    ↓
  finishInteractiveMatch(matchResult)
    ↓
  completeInteractiveMatch: ブラケット更新 + 日付進行
    ↓
  pendingInteractiveMatch = null → 通常進行に復帰
```

---

## セーブ/ロード対応

`pendingInteractiveMatch` は `WorldState` の一部として `world-store.ts` の `persist` ミドルウェアに含まれる。

- セーブ時: `pendingInteractiveMatch` も JSON にシリアライズされる
- ロード時: `pendingInteractiveMatch` が復元され、ホーム画面に「試合を始める」バナーが再表示される
- `MatchRunner` はメモリのみ（persist なし）のため、ロード後に試合画面へ遷移すると `initMatch` が再度呼ばれる

---

## 実装制約の遵守

| 制約 | 状態 |
|------|------|
| `engine/match/` を変更しない | ✅ 変更なし |
| 既存テスト全パス | ✅ 743/743 パス |
| TypeScript strict モード | ✅ Phase 10 ファイルにエラーなし（既存のプレ実装エラーは除く） |
| `useParams()` でルートパラメータ取得 | ✅ 既存パターンと一致 |

---

## ファイル一覧

### 新規作成
- `src/stores/match-store.ts`
- `src/app/play/match/[matchId]/page.tsx`
- `src/app/play/match/[matchId]/match.module.css`

### 変更
- `src/engine/world/world-state.ts` — `PendingInteractiveMatch` 型追加
- `src/engine/world/world-ticker.ts` — インタラクティブ分岐・`completeInteractiveMatch` 追加
- `src/stores/world-store.ts` — `finishInteractiveMatch`・`advanceDay` 更新
- `src/app/play/page.tsx` — 「試合を始める」バナー追加
