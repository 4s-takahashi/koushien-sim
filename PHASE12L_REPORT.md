# Phase 12-L 実装レポート

**バージョン**: v0.31.0
**実装日**: 2026-04-23
**担当**: Phase 12-L — バグ修正4件 + アナリスト心理統合

---

## 概要

Phase 12-K で発見されていたバグ4件の修正と、アナリストコメントの PsycheWindow への統合を行った。

---

## 課題1: 秋大会が「1週間進む」で生成されないバグ (Bug 1)

### 症状
- 9/15〜10/14 の秋大会期間中に「1週間進む」ボタンを押しても `activeTournament` が `null` のまま
- 秋大会タブが表示されない

### 根本原因
2026-04-22 のバグ修正（大会期間内なら `activeTournament=null` の場合に自動生成）に副作用があった。

夏大会が 7/28（最終ラウンド6）で完了すると:
1. 完了した大会が `tournamentHistory` に追加される
2. `activeTournament = null` にリセットされる
3. `advanceDate(7/28) = 7/29` → `isSummerWindow(7/29) = true`
4. **新しい夏大会が同じ ID (`tournament-summer-1`) で再作成される**
5. この不完全な新大会が `activeTournament` を占有し続ける
6. 9/15 に到達しても `!activeTournament` が false のため秋大会が作られない

### 修正内容
**ファイル**: `src/engine/world/world-ticker.ts`

大会自動生成ブロック（`advanceWorldDay` と `completeInteractiveMatch` の2箇所）に「同年の大会が既に `tournamentHistory` に存在する場合は再作成しない」チェックを追加した。

```typescript
// Phase 12-L: 同じ年の夏大会が既に履歴に存在する場合は再作成しない
const alreadyDone = nextWorld.tournamentHistory?.some((t) => t.id === id) ?? false;
if (!alreadyDone) {
  // 大会を生成する
}
```

### 検証結果
デバッグテストで修正前後を確認:
- **修正前**: AT 7/30: `activeTournament={id:tournament-summer-1, completed:false}`, AT 9/15: `activeTournament=null`（秋大会未生成）
- **修正後**: AT 7/30: `activeTournament=null`, AT 9/15: `activeTournament={id:tournament-autumn-1, type:autumn}`

### 新規テスト
`tests/stores/autumn-tournament-advanceweek.test.ts` (5テスト)
- 9/1 から `advanceWeek` 連続で秋大会が生成される
- 夏大会終了後の 8/10 から `advanceWeek` で秋大会が生成される
- `isCompleted=true` な stale な `activeTournament` があっても秋大会が生成される
- 9/14 から `advanceWeek` 1回で秋大会がある状態で停止する
- 秋大会期間中（9/20）に `advanceWeek` で `activeTournament` が維持される

---

## 課題2: 投球・ヒット・ホームランアニメーションが固まるバグ (Bug 2)

### 症状
投球 → プレイシーケンス → 投球 と連続して呼ぶと `seqRafRef` が停止されず RAF 競合でアニメーションが固まる。

### 根本原因
`useBallAnimation.ts` の各トリガー関数が自身の RAF のみを停止していた:
- `triggerPitchAnimation`: `stopAnimation()` のみ（`stopHomeRunEffect`, `stopPlaySequence` を呼ばない）
- `triggerHitAnimation`: 同様
- `triggerPlaySequence`: `stopPlaySequence()` のみ

### 修正内容
**ファイル**: `src/ui/match-visual/useBallAnimation.ts`

各トリガー関数で全 RAF を停止してから新しいアニメーションを開始するよう修正。また `mountedRef` パターンを追加してアンマウント後の `setBallState` 呼び出しを防止。

```typescript
// triggerPitchAnimation, triggerHitAnimation, triggerPlaySequence の全て
stopAnimation();
stopHomeRunEffect(); // NEW
stopPlaySequence();  // NEW
```

### 新規テスト
`tests/ui/match-visual/animation-multitrigger.test.ts` (5テスト)

---

## 課題3: 左打者の内角・外角ナレーションが反転しないバグ (Bug 3)

### 症状
左打者 (`battingSide='left'`) でも右打者と同じ内角・外角テキストが表示される。

### 根本原因
`pitchLocationJP(row, col)` が打者の左右を考慮せず、投手視点の固定マッピングを使用していた（`col=1` は常に「内角」、`col=3` は常に「外角」）。

### 修正内容
**ファイル**: `src/ui/narration/buildNarration.ts`

`pitchLocationJPForBatter(row, col, battingSide)` 関数を追加。左打者の場合は `col=1 ↔ col=3` を反転してから場所テキストを生成。ストライクゾーン描画（投手視点）は変更なし。

```typescript
function pitchLocationJPForBatter(row, col, battingSide) {
  let c = Math.max(1, Math.min(3, col));
  if (battingSide === 'left') {
    if (c === 1) c = 3;
    else if (c === 3) c = 1;
  }
  // ...
}
```

### 新規テスト
`tests/ui/narration/batter-handedness-narration.test.ts` (9テスト)

---

## 課題4: 試合画面が「試合を準備中...」「読み込み中...」で固まるバグ (Bug 4)

### 症状
`localStorage` が破損している場合、または通常の hydration タイムアウト時に `_hasHydrated` が `true` にならず「読み込み中...」で固まる。

### 根本原因
- `onRehydrateStorage` の `state=null` ケース（localStorage 破損）で `_hasHydrated=true` が設定されない
- `deserializeMatchState` 失敗時に破損データが残ったまま

### 修正内容
**ファイル**: `src/stores/match-store.ts`
- `onRehydrateStorage`: `state=null` 時も `_hasHydrated=true` をセット
- `onRehydrateStorage`: `deserializeMatchState` 失敗時に `localStorage.removeItem()` で自動クリア + `runner=null`, `matchStateJson=null` にリセット

**ファイル**: `src/app/play/match/[matchId]/page.tsx`
- 3秒タイムアウトで `_hasHydrated` を強制 `true` に設定する `useEffect` を追加

### 新規テスト
`tests/stores/match-store-hydration.test.ts` (5テスト)

---

## 課題5: アナリストコメントを PsycheWindow に統合 (Feature 5)

### 変更概要
Phase 12-K で追加された `AnalystPanel` コンポーネントを廃止し、既存の `PsycheWindow` コンポーネントに統合した。

### 変更内容
**ファイル**: `src/app/play/match/[matchId]/PsycheWindow.tsx`
- `analystComments?: AnalystComment[]` と `hasAnalyst?: boolean` props を追加
- Rules of Hooks 違反修正: 全フック呼び出しを条件分岐の前に移動
- `AnalystSection` サブコンポーネントを追加（自動スクロール ref 付き）
- `ANALYST_KIND_ICON` マッピングを追加
- `!hasBubble && !showAnalyst` のとき `null` を返すよう統一

**ファイル**: `src/app/play/match/[matchId]/psycheWindow.module.css`
- アナリストセクション用スタイルを追加

**ファイル**: `src/app/play/match/[matchId]/page.tsx`
- 分離されていた `<AnalystPanel>` を削除し、`<PsycheWindow>` に統合

### 新規テスト
`tests/ui/match-visual/psyche-window-analyst.test.ts` (11テスト)

---

## テスト結果サマリー

| カテゴリ | テストファイル | 結果 |
|---------|--------------|------|
| Bug 1 | autumn-tournament-advanceweek.test.ts | 5/5 ✓ |
| Bug 2 | animation-multitrigger.test.ts | 5/5 ✓ |
| Bug 3 | batter-handedness-narration.test.ts | 9/9 ✓ |
| Bug 4 | match-store-hydration.test.ts | 5/5 ✓ |
| Feature 5 | psyche-window-analyst.test.ts | 11/11 ✓ |

**全体**: 1138/1141 テスト通過（残り3件は Phase 12-L 以前からの既存失敗）

---

## 変更ファイル一覧

| ファイル | 変更種別 | 説明 |
|---------|---------|------|
| `src/engine/world/world-ticker.ts` | 修正 | Bug 1: 大会再生成防止 |
| `src/ui/match-visual/useBallAnimation.ts` | 修正 | Bug 2: RAF クリーンアップ |
| `src/ui/narration/buildNarration.ts` | 修正 | Bug 3: 左打者ナレーション反転 |
| `src/stores/match-store.ts` | 修正 | Bug 4: hydration フォールバック |
| `src/app/play/match/[matchId]/page.tsx` | 修正 | Bug 4 + Feature 5 |
| `src/app/play/match/[matchId]/PsycheWindow.tsx` | 修正 | Feature 5: アナリスト統合 |
| `src/app/play/match/[matchId]/psycheWindow.module.css` | 修正 | Feature 5: スタイル追加 |
| `src/version.ts` | 修正 | v0.31.0 バージョン更新 |
| `package.json` | 修正 | v0.31.0 バージョン更新 |
| `tests/stores/autumn-tournament-advanceweek.test.ts` | 新規 | Bug 1 回帰テスト |
| `tests/stores/match-store-hydration.test.ts` | 新規 | Bug 4 テスト |
| `tests/ui/match-visual/animation-multitrigger.test.ts` | 新規 | Bug 2 テスト |
| `tests/ui/match-visual/psyche-window-analyst.test.ts` | 新規 | Feature 5 テスト |
| `tests/ui/narration/batter-handedness-narration.test.ts` | 新規 | Bug 3 テスト |
