# Phase 10-A 実装レポート

**完了日**: 2026-04-17
**ブランチ**: main
**実施者**: Claude Sonnet 4.6

---

## 追加ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/engine/match/runner-types.ts` | 新規 | `TimeMode`, `PitchMode`, `RunnerMode`, `PauseReason` 型定義 |
| `src/engine/match/runner.ts` | 新規 | `MatchRunner` クラス + `detectKeyMoment` 関数 |
| `src/ui/projectors/matchProjector.ts` | 新規 | `projectMatch` 関数（MatchState → MatchViewState） |
| `src/ui/projectors/view-state-types.ts` | 変更 | `MatchViewState`, `PitchLogEntry` 等の型を追加 |
| `tests/engine/match/runner.test.ts` | 新規 | MatchRunner ユニットテスト（29テスト） |
| `tests/ui/projectors/matchProjector.test.ts` | 新規 | matchProjector ユニットテスト（25テスト） |

---

## テスト結果

| 区分 | テスト数 |
|------|---------|
| 既存テスト（変更前）| 523件 |
| 新規テスト（Phase 10-A）| 54件 |
| **合計** | **657件** |
| **全パス** | ✅ |

```
Test Files  58 passed (58)
     Tests  657 passed (657)
  Duration  92.97s
```

---

## ビルド結果

`npx next build` は既存の pre-existing TypeScript エラー（`../../core/rng` モジュール解決問題）により失敗するが、これは **Phase 10-A 実装前から存在するエラー**。実装前後で同じエラーのみが出力されており、新規ファイルによる新たなエラーはなし。

確認方法: `git stash && npx next build` でも同じエラーで失敗することを確認済み。

---

## 実装内容

### 1. `runner-types.ts`

設計書 4.2、4.3 に準拠して以下を定義:

```typescript
type TimeMode = 'short' | 'standard';
type PitchMode = 'off' | 'on';
interface RunnerMode { time: TimeMode; pitch: PitchMode; }
type PauseReason = | { kind: 'at_bat_start'; batterId: string } | ...;
```

### 2. `runner.ts` — MatchRunner クラス

設計書 5.1 のインターフェイスに完全準拠。主な実装ポイント:

- **`constructor(initialState, opponentTactics, playerSchoolId)`**: 3引数でプレイヤー校 ID を明示
- **`shouldPause(mode: RunnerMode)`**: 優先順位: match_end → detectKeyMoment → pitch_start → at_bat_start → null
- **`applyPlayerOrder(order)`**: 即時適用（代打・継投・マウンド訪問）と pending 格納（バント・盗塁等）を分離
- **`stepOnePitch(rng)`**: `processPitch` を1回呼び出し
- **`stepOneAtBat(rng)`**: `processAtBat` を1回呼び出し、打順自動進行
- **`stepOneInning(rng)`**: 表裏処理 + サヨナラ判定
- **`runToEnd(rng)`**: 試合終了まで全自動進行
- **`detectKeyMoment(state, playerSchoolId)`**: 勝負所検知（エクスポート済み・テスト可能）

#### 勝負所検知の優先順位

1. 投手スタミナ < 20%（自校守備時のみ）
2. 7回以降かつ1点差以内 → `close_and_late`
3. 自校攻撃中に得点圏走者 → `scoring_chance`
4. 相手攻撃中に得点圏走者 → `pinch`

#### 攻守判定ロジック

```typescript
// top (表) = away 攻撃、bottom (裏) = home 攻撃
// プレイヤー = home の場合: bottom のとき攻撃
// プレイヤー = away の場合: top のとき攻撃
```

### 3. `view-state-types.ts` への追加

`MatchViewState` 型に以下を含む:
- スコアボード情報（イニング・アウト・カウント・得点）
- ダイヤモンド走者情報
- 投手パネル（スタミナ%・投球数・球種一覧）
- 打者パネル（今日の成績・総合力）
- ベンチ情報（リリーフ候補・代打候補）
- 采配フラグ（canBunt, canSteal, canPinchHit, canChangePitcher）
- `pauseReason`, `runnerMode`, `isPlayerBatting`

### 4. `matchProjector.ts`

純関数 `projectMatch(state, playerSchoolId, runnerMode, pitchLog, pauseReason): MatchViewState` を実装。

- 既存の `teamProjector.ts` パターンに倣い、全て純関数・副作用なし
- `detectKeyMoment` の呼び出しはせず（Store 側で管理）、`pauseReason` は引数で受け取る
- 投球ログは外部で管理して引数として渡すアーキテクチャ（MatchState には含まれないため）

---

## 設計書との齟齬・気になった点

### 1. `playerSchoolId` 引数の追加

設計書 5.1 の `MatchRunner` コンストラクタは `(initialState, opponentTactics)` の2引数だが、`shouldPause` と `detectKeyMoment` が「自校 vs 相手」を判定するために `playerSchoolId` が必要。第3引数として追加した。

```typescript
// 設計書
constructor(initialState: MatchState, opponentTactics: ...) {}

// 実装（第3引数追加）
constructor(initialState: MatchState, opponentTactics: ..., playerSchoolId: string) {}
```

Phase 10-B の `useMatchStore` 実装時は、Store 初期化時に `playerSchoolId` を渡す想定。

### 2. `projectMatch` の引数設計

設計書では `projectMatch(state, playerSchoolId): MatchViewState` だが、実際の UI には以下も必要:
- `runnerMode: RunnerMode`（現在の進行モード）
- `pitchLog: PitchLogEntry[]`（投球ログ - MatchState 外で管理）
- `pauseReason: PauseReason | null`（停止理由 - Store で管理）

これらを引数に追加した。`useMatchStore` 側でこれらを管理し、projector に渡す設計が適切。

### 3. `stepOneInning` の打席結果蓄積

`processHalfInning` は内部で `allAtBatResults` を返すが、`stepOneInning` での処理後に `runner.allAtBatResults` へ蓄積する必要がある。`runToEnd` との一貫性を保つため、`stepOneInning` でも打席結果を蓄積している。

### 4. `runToEnd` の RNG パス

`runGame` の RNG derive パス（`inning-${n}` → `top-${n}` → `at-bat-${i}`）と `MatchRunner.runToEnd` の derive パス（`run-top-${n}` → `run-bottom-${n}`）は意図的に**異なる**。同一種のシミュレーションだが別系統の乱数を使用するため、スコアは一致しない。これは設計上の要件（既存 `runGame` を壊さない）から来る制約。

---

## Phase 10-B/C で注意すべき点

### Phase 10-B（UI）で注意

1. **`MatchRunner` インスタンスの管理**: `MatchRunner` は Zustand store 内で保持する。ただし Zustand の `persist` ミドルウェアとは相性が悪いため、セッション中のみメモリ保持（`isOver` になったら `MatchResult` だけ残す）

2. **`stepOneAtBat` の打順管理**: `stepOneAtBat` は1打席処理後に `currentBatterIndex` を自動インクリメントするが、ハーフイニング終了後の次イニング移行（`outs >= 3`）のタイミングを UI 側で明示的に管理する必要がある

3. **`shouldPause` の呼び出しタイミング**: UI は `stepOnePitch` / `stepOneAtBat` 実行後に `shouldPause(mode)` を呼び出し、停止すべきかを判断する

4. **`isPlayerBatting` の利用**: UI は `MatchViewState.isPlayerBatting` を見てどの采配ボタンを表示するか判断する（true=バント/盗塁/代打、false=継投/マウンド訪問）

### Phase 10-C（大会統合）で注意

1. **`MatchState` の `homeTeam.id` / `awayTeam.id` の整合性**: 現在の `MatchTeam` 型の `id` フィールドが `worldState.playerSchoolId` と一致するよう、試合初期化時に確実に設定すること

2. **試合中断・再開**: `MatchRunner` の `state` + `allAtBatResults` を永続化すれば中断再開可能。ただし `Set` / `Map` のシリアライズに注意（既存の `world-store.ts` 参照）

3. **サヨナラ判定**: `stepOneInning` のサヨナラ処理は `processHalfInning`（通常）を使っており、厳密なサヨナラ（得点と同時終了）は `processHalfInningSayonara`（`inning.ts` 内部関数）とは異なる。Phase 10-C でサヨナラ演出が必要な場合はこの点に注意。

---

## ファイル構成まとめ

```
src/
├── engine/match/
│   ├── runner-types.ts     ← NEW: TimeMode/PitchMode/RunnerMode/PauseReason
│   └── runner.ts           ← NEW: MatchRunner クラス + detectKeyMoment
└── ui/projectors/
    ├── view-state-types.ts ← MODIFIED: MatchViewState/PitchLogEntry 追加
    └── matchProjector.ts   ← NEW: projectMatch 純関数

tests/
├── engine/match/
│   └── runner.test.ts      ← NEW: 29テスト
└── ui/projectors/
    └── matchProjector.test.ts ← NEW: 25テスト
```
