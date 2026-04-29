# PHASE-S1-A2 完了レポート

## 概要

試合画面で「自動進行 ON」+「1球モード ON」などを同時設定した際、毎球ごとに「投球前 / 指示を選択してください」のバナーで自動進行が止まるバグを根本修正。

**対応バージョン**: v0.45.2 に向けた事前修正
**完了日**: 2026-04-29

---

## 問題

| 設定 | 期待動作 | 実際の動作（修正前） |
|------|---------|-----------------|
| 自動進行 ON + 1球モード ON | チャンス/ピンチ/試合終了以外は自動進行 | 毎球「投球前」で停止 |
| 自動進行 ON + 標準5秒モード | 打席開始では止まらず演出ディレイのみ | 毎打席開始で停止 |
| 自動進行 OFF + 1球モード ON | 毎球停止（従来動作） | 正常 |

---

## 根本原因

1. `runner.ts:shouldPause()` が `mode.pitch === 'on'` のとき**常に** `{kind:'pitch_start'}` を返す
2. `runner.ts:shouldPause()` が `mode.time === 'standard'` かつカウント 0-0 のとき**常に** `{kind:'at_bat_start'}` を返す
3. `match-store.ts:evaluatePause()` はこれをそのまま `pauseReason` にセットする
4. `page.tsx` の autoAdvance useEffect (Phase 12-H) は `routineKinds = ['pitch_start','at_bat_start','inning_end']` を検出して「無視して進める」ロジックがあるが、`pauseReason` が変化しないためタイマーが再起動されない（デッドロック）

---

## 修正方針

**「自動進行 ON のときは shouldPause() が pitch_start / at_bat_start を返さない」** ようにすることで、pauseReason が null → タイマーが正常に動作する。

- `scoring_chance` / `pinch` / `match_end` などのキーモーメントは autoplay=true でも必ず返す
- `pitch_start` / `at_bat_start` は autoplay=true のときは null を返す

---

## 変更ファイル一覧

### 1. `src/engine/match/runner.ts`

**変更内容**: `shouldPause()` に `autoplay: boolean = false` 引数を追加

```typescript
// Before
shouldPause(mode: RunnerMode): PauseReason | null {
  // ...
  if (mode.pitch === 'on') {
    return { kind: 'pitch_start' }; // autoplay=true でも返していた
  }
  if (mode.time === 'standard' && isAtBatStart(this.state)) {
    return { kind: 'at_bat_start', batterId }; // autoplay=true でも返していた
  }
}

// After
shouldPause(mode: RunnerMode, autoplay: boolean = false): PauseReason | null {
  // ...（勝負所・試合終了は autoplay に関わらず優先）
  if (autoplay) {
    return null; // 自動進行中は pitch_start / at_bat_start を返さない
  }
  if (mode.pitch === 'on') {
    return { kind: 'pitch_start' };
  }
  if (mode.time === 'standard' && isAtBatStart(this.state)) {
    return { kind: 'at_bat_start', batterId };
  }
}
```

### 2. `src/stores/match-store.ts`

**変更内容**: `evaluatePause()` に `autoplay: boolean = false` 引数を追加し、全呼び出し箇所で `autoAdvance` を渡す

修正した呼び出し箇所（7箇所 + setAutoAdvance 1箇所）:
- `evaluatePause()` 関数シグネチャ変更
- `initMatch()` 内
- `restoreFromSnapshot()` 内
- `setTimeMode()` 内
- `setPitchMode()` 内
- `applyOrder()` 内
- `stepOnePitch()` 内
- `stepOneAtBat()` 内
- `stepOneInning()` 内
- `setAutoAdvance()` 内（ON/OFF 切り替え時に pauseReason を再評価）

### 3. `tests/engine/match/runner.test.ts`

**追加テスト**（4件）:

| テスト名 | 確認内容 |
|---------|---------|
| `returns null for pitch_start when autoplay=true (pitch-on mode)` | autoplay=true のとき pitch_start を返さない |
| `returns null for at_bat_start when autoplay=true (standard mode)` | autoplay=true のとき at_bat_start を返さない |
| `still returns scoring_chance even when autoplay=true` | autoplay=true でも scoring_chance は返す |
| `still returns match_end even when autoplay=true` | autoplay=true でも match_end は返す |

---

## 修正前後の挙動比較

| シナリオ | 修正前 | 修正後 |
|---------|-------|-------|
| 自動進行 ON + 1球モード ON → 通常の投球前 | `pauseReason = {kind:'pitch_start'}` → タイマーデッドロック → **停止** | `pauseReason = null` → タイマー正常動作 → **自動進行** |
| 自動進行 ON + 標準5秒 → 打席開始カウント 0-0 | `pauseReason = {kind:'at_bat_start'}` → **停止** | `pauseReason = null` → **自動進行** |
| 自動進行 ON → チャンス（得点圏走者あり） | `pauseReason = {kind:'scoring_chance'}` → **停止** ✓ | `pauseReason = {kind:'scoring_chance'}` → **停止** ✓（変化なし） |
| 自動進行 OFF + 1球モード ON → 投球前 | `pauseReason = {kind:'pitch_start'}` → **停止** ✓ | `pauseReason = {kind:'pitch_start'}` → **停止** ✓（変化なし） |
| 自動進行 OFF + 標準5秒 → 打席開始 | `pauseReason = {kind:'at_bat_start'}` → **停止** ✓ | `pauseReason = {kind:'at_bat_start'}` → **停止** ✓（変化なし） |

---

## 動作確認手順

1. `/play/match/<matchId>` を開く
2. 「自動進行」ボタンを ON にする
3. 「1球モード」(PitchMode) を ON にする
4. **確認**: チャンス/ピンチ以外の投球前で停止しないこと
5. 「標準 5秒」モードに切り替える
6. **確認**: 打席開始（カウント 0-0）では止まらないこと
7. 「自動進行」を OFF にした状態で「1球モード ON」を確認
8. **確認**: 毎球ごとに停止すること（従来動作）

---

## テスト結果

```
Tests  37 passed (37)  ← runner.test.ts（新規4件 + 既存33件）
Build  成功（エラーなし）
```

---

## 注意事項

- `page.tsx` の autoAdvance useEffect にある `routineKinds` フィルタはこの修正後も残存するが、`pauseReason` が null になるため実質不使用になる（念のため残置、害はない）
- 既存の手動操作（采配ボタン・継投・代打）は `applyOrder()` を経由するため影響なし
- 1球モードのバナー表示（「投球前 / 指示を選択してください」）は UI 表示ロジック側（page.tsx の pauseInfo 関数）に依存するため、今回の修正でバナーは**表示されなくなる**（`pauseReason` が null のため）。これは仕様通り：自動進行 ON のときはバナーを出さずに自動進行する。
