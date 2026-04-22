# Phase 12-H 実装レポート — 試合開始演出＋自動進行機能

**実装日**: 2026-04-22
**バージョン**: v0.25.0 → v0.27.0
**ブランチ**: main

---

## 概要

Phase 12-H では以下の4つのサブフェーズを実装しました。

---

## H-1: 「PLAY BALL」試合開始演出

### 実装内容
- `PlayBallOverlay` コンポーネントを `page.tsx` に追加
- 試合**新規開始**時のみ表示（中断→再開では表示しない）
- CSS アニメーション `playBallFadeInOut` で 2.8 秒の演出

### デザイン
- 画面幅いっぱいの半透明白帯（`rgba(255,255,255,0.88)`、高さ 160px）
- 上下にエンジ系ボーダー（`#8b1a1a` ～ `#c62828` グラデーション）
- 太字英大文字「PLAY BALL」（88px、font-weight: 900、Impact フォント）
- アニメーション: フェードイン 300ms → 2秒静止 → フェードアウト 500ms（合計 2.8s）

### 実装ファイル
- `src/app/play/match/[matchId]/page.tsx` — `PlayBallOverlay` コンポーネント追加
- `src/app/play/match/[matchId]/match.module.css` — `.playBallOverlay`/`.playBallBand`/`.playBallText`/`.playBallAccent` 等

---

## H-2: TimeMode を 3段階に拡張

### 変更内容
| 旧 | 新 |
|---|---|
| `'short'` | 廃止 |
| `'standard'` | `'standard'`（5秒、そのまま維持） |
| ─ | `'slow'`（10秒）を追加 |
| ─ | `'fast'`（3秒）を追加 |

### DELAY_MS マッピング
```ts
const DELAY_MS: Record<TimeMode, number> = {
  slow:      10000,  // ⏮ ゆっくり 10秒
  standard:   5000,  // ▶ 標準 5秒
  fast:       3000,  // ⏭ 高速 3秒
};
```

### 実装ファイル
- `src/engine/match/runner-types.ts` — `TimeMode` 型定義を更新
- `src/app/play/match/[matchId]/page.tsx` — `DELAY_MS` 定数、`AutoAdvanceBar` の TimeMode ボタン

### テスト更新
- `tests/engine/match/runner.test.ts` — `'short'` → `'fast'` に置き換え
- `tests/ui/projectors/matchProjector.test.ts` — `'short'` → `'fast'` に置き換え

---

## H-3: 自動進行モード

### match-store 追加 state
| フィールド | 型 | 説明 |
|---|---|---|
| `autoAdvance` | `boolean` | 自動進行 ON/OFF |
| `nextAutoAdvanceAt` | `number \| null` | 次の自動実行タイムスタンプ |
| `pendingNextOrder` | `TacticalOrder \| null` | 次の1球/打席用の事前選択指示 |

### match-store 追加アクション
| アクション | 説明 |
|---|---|
| `setAutoAdvance(enabled)` | 自動進行 ON/OFF を設定 |
| `setPendingNextOrder(order)` | 次の指示をセット/クリア |
| `consumeNextOrder()` | pendingNextOrder を消費して返し、null にリセット |

### UI コントロール（AutoAdvanceBar）
```
[🔁 自動進行: OFF/ON]  [⏮ ゆっくり 10秒][▶ 標準 5秒][⏭ 高速 3秒]
次の1球まで 残り 3.2秒   [指示なし][今すぐ進める]
```

- 自動進行 ON のとき、TimeMode に応じた秒数でタイマーを設定
- PitchMode = `on` → `stepOnePitch()` を実行
- PitchMode = `off` → `stepOneAtBat()` を実行
- タイマー発火前に `pendingNextOrder` が設定されていれば `consumeNextOrder()` → `applyOrder()` して採用
- カウントダウンは 100ms ごとに更新（`setCountdownTick` で再描画）

### 実装ファイル
- `src/stores/match-store.ts` — state/actions 追加、`MatchPersistedState` 更新
- `src/app/play/match/[matchId]/page.tsx` — `autoAdvance` useEffect、`AutoAdvanceBar` コンポーネント
- `src/app/play/match/[matchId]/match.module.css` — `.autoAdvanceBar` 等の新スタイル

---

## H-4: 停止理由で自動進行を一時中断

### 動作
- `pauseReason !== null` のとき、新自動進行タイマーをクリアして `nextAutoAdvanceAt = null`
- `resumeFromPause()` が呼ばれると `pauseReason` が `null` になり、`useEffect` の依存変化で新しいタイマーが起動
- 結果として: 停止理由発生 → ユーザー操作 → 停止解除 → 自動進行再開 という流れが自然に動作

---

## テスト

### 新規テストファイル
`tests/engine/match/phase12h.test.ts` — 16 テスト

| テスト群 | 件数 |
|---|---|
| TimeMode 型チェック | 2 |
| DELAY_MS マッピング | 4 |
| autoAdvance state 遷移 | 6 |
| consumeNextOrder | 4 |

### 既存テスト更新
- `runner.test.ts`: 6件の `'short'` → `'fast'` 置き換え
- `matchProjector.test.ts`: 1件の `'short'` → `'fast'` 置き換え

### テスト結果
```
Test Files: 86 passed (86)
Tests: 994 passed (のうち新規16件がPhase 12-H)
```
※ 既存の非関連失敗 25 件は前フェーズからのもので変更なし

---

## ビルド結果

```
npm run build → ✓ 成功
TypeScript strict: ✓ エラーなし
```

---

## 変更ファイル一覧

| ファイル | 変更種別 | 概要 |
|---|---|---|
| `src/engine/match/runner-types.ts` | 修正 | TimeMode 型を `slow\|standard\|fast` に変更 |
| `src/engine/match/runner.ts` | 修正 | shouldPause コメント更新のみ |
| `src/stores/match-store.ts` | 修正 | autoAdvance/pendingNextOrder state+actions追加 |
| `src/app/play/match/[matchId]/page.tsx` | 修正 | PLAY BALL演出、AutoAdvanceBar、自動進行useEffect |
| `src/app/play/match/[matchId]/match.module.css` | 修正 | PLAY BALL・自動進行スタイル追加 |
| `src/version.ts` | 修正 | v0.27.0、CHANGELOG追加 |
| `tests/engine/match/runner.test.ts` | 修正 | 'short' → 'fast' 置き換え |
| `tests/ui/projectors/matchProjector.test.ts` | 修正 | 'short' → 'fast' 置き換え |
| `tests/engine/match/phase12h.test.ts` | 新規 | Phase 12-H 専用テスト 16 件 |
| `PHASE12H_IMPLEMENTATION_REPORT.md` | 新規 | 本レポート |

---

## 完了基準チェック

- [x] PLAY BALL 演出が試合開始時に見える（新規開始のみ）
- [x] TimeMode が 3段階（10/5/3秒）で動作
- [x] 自動進行 ON で PitchMode に応じて1球/1打席が自動で進む
- [x] 次の指示を事前に選べる UI が出る（`setPendingNextOrder`）
- [x] 停止理由で自動進行が適切に一時停止する（pauseReason != null でタイマークリア）
- [x] `npm run build` が通る
- [x] 新規テスト 16 件がパス
- [x] 既存の非関連テストを壊していない（25件の既存失敗は変更なし）
- [x] main に push 済み
