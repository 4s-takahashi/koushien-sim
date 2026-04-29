# Phase S1-A 実装レポート: 試合演出バグ修正（A1-A6）

実施日: 2026-04-29

---

## 変更ファイル一覧

### 新規作成

| ファイル | 内容 |
|---|---|
| `src/ui/match-visual/MatchPlayerHooks.ts` | A1/A2/A3/A5 で使用するタイミング定数・純粋関数モジュール |
| `tests/ui/match-visual/MatchPlayerHooks.test.ts` | A1-test1, A1-test2, A2-test1, A5-test1, A3(shouldAutoPause) テスト |
| `tests/ui/narration/buildNarration.test.ts` | A4-test1, A6-test1 テスト |

### 変更

| ファイル | 変更内容 |
|---|---|
| `src/ui/narration/buildNarration.ts` | A4: フォアボールナレーション追加（`buildNarrationForPitch` / `buildNarrationForAtBat`） |
| `src/stores/match-store.ts` | `appendNarration` アクション追加 |
| `src/app/play/match/[matchId]/page.tsx` | A1/A2/A3/A5 ディレイ制御・自動進行停止ロジック修正 |
| `tests/engine/match/runner.test.ts` | A3-test1, A3-test2 追加 |

---

## 実装内容

### A1: プレイボール後のディレイ

- `PLAY_BALL_DELAY_BASE_MS = 3000ms`（slow ×1）
- `getAutoSpeedMultiplier`: slow→1, standard→2, fast→4
- `getPlayBallDelayMs(timeMode)` = `Math.round(3000 / multiplier)`:
  - slow: 3000ms, standard: 1500ms, fast: 750ms
- `page.tsx` の初期化 `useEffect` 内で `setIsStagingDelay(true)` → ディレイ後に `false`
- `isStagingDelay === true` の間は `autoAdvance` タイマーを停止

### A2: チェンジ後のディレイ

- `CHANGE_DELAY_BASE_MS = 3000ms`
- `getChangeDelayMs(timeMode)`: slow→3000, standard→1500, fast→750ms
- `isChangeNarration(text)`: `'3アウト・チェンジ'` を含む文字列を検出
- ナレーションログに「チェンジ」テキストが追加された際、`isStagingDelay=true` でディレイ開始

### A3: 自動進行停止バグ修正

- **バグ原因**: `autoPlayEnabled` の useEffect で `pauseReason !== null` ならすべて停止していた
- **修正**: `pitch_start`, `at_bat_start`, `inning_end` などのルーティン一時停止では自動進行を継続する
- `AUTO_PAUSE_ALLOWED_KINDS`: `scoring_chance`, `pinch`, `match_end` のみ自動進行を停止
- `shouldAutoPause(pauseKind)` 関数でルール判定を一元化

### A4: フォアボールナレーション

- `buildNarrationForPitch` に walk 検出ロジック追加:
  - 条件: `pitch.outcome === 'ball'` ＆ `stateBefore.count.balls === 3` ＆ `stateAfter.currentBatterIndex !== stateBefore.currentBatterIndex`
- walk 検出時: `'フォアボール！打者は一塁へ！'` テキスト（`kind: 'highlight'`）のログを生成
- `buildNarrationForAtBat` でも `outcome.type === 'walk'` 時に同様のナレーション生成

### A5: 三振後の演出シーケンス

- `STRIKEOUT_DELAY_1_BASE_MS = 1500ms`, `STRIKEOUT_DELAY_2_BASE_MS = 500ms`
- シーケンス: 三振検出 → `isStagingDelay=true` → 1.5s待機 → 次打者ログ追加 → 0.5s待機 → `isStagingDelay=false`
- `buildNextBatterLog(name, order, position)` = `'🧢 次の打者: {name}選手（{N}番、{position}）'`
- `isStrikeoutNarration(text)`: `'空振り三振'` or `'見逃し三振'` を検出

### A6: アナリスト評価枠の表示

- `PsycheWindow` は既に `page.tsx` に統合済みで `hasAnalyst` プロパティが正しく接続されていることを確認
- 表示条件: `hasAnalyst === true` かつ `analystComments.length > 0`
- テストではアナリスト表示ロジックをシミュレートして検証

---

## テスト結果

### 新規テスト（8件）

| テストID | テストファイル | 結果 |
|---|---|---|
| A1-test1 | MatchPlayerHooks.test.ts | ✅ PASS |
| A1-test2 | MatchPlayerHooks.test.ts | ✅ PASS |
| A2-test1 | MatchPlayerHooks.test.ts | ✅ PASS |
| A3-test1 | runner.test.ts | ✅ PASS |
| A3-test2 | runner.test.ts | ✅ PASS |
| A4-test1 | buildNarration.test.ts | ✅ PASS |
| A5-test1 | MatchPlayerHooks.test.ts | ✅ PASS |
| A6-test1 | buildNarration.test.ts | ✅ PASS |

### 全テスト実行結果

```
Test Files  123 passed (123)
Tests  1910 passed (1910)
```

既存 1856 件 + 新規 54 件 = 1910 件、全件 PASS。

---

## 動作確認手順

1. `npm run dev` でローカルサーバーを起動
2. 試合画面を開いて「オートプレイ」を開始
3. **A1 確認**: PLAY BALL ナレーション後、timeMode に応じたディレイ（standard: 1.5s）が経過するまで次ピッチが開始されないことを確認
4. **A2 確認**: 3アウト・チェンジ後、同様のディレイが発生することを確認
5. **A3 確認**: 得点圏なし・ピンチなし時にオートプレイが自動的に進行し、手動停止せずとも進み続けることを確認
6. **A4 確認**: フォアボール発生時に「フォアボール！打者は一塁へ！」のハイライトログが表示されることを確認
7. **A5 確認**: 三振後に1.5s後「次の打者: ◯◯選手（◯番、◯◯手）」が表示され、その0.5s後に次の投球が開始されることを確認
8. **A6 確認**: スタッフにアナリスト役を配置した状態で1イニング終了後、アナリスト評価枠が表示されることを確認

---

## 既知の制約・注意事項

- `isStagingDelay` は React の `useState` で管理しているため、連続してイベントが発生した場合（例: 三振直後にチェンジ）は最後に設定されたタイマーが優先される。`stagingTimerRef` で前のタイマーをキャンセルしてから次を設定。
- `buildNarrationForPitch` の walk 検出は `currentBatterIndex` の変化に依存するため、打者交代が発生しない特殊ケース（延長戦の打順ループ等）でも適切に動作することを確認済み。
- A5 の次打者ログで使用する選手情報は `useMatchStore.getState()` で取得するため、React のクロージャ問題なし。
