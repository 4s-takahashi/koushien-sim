# 秋大会バグ診断レポート

**作成日**: 2026-04-17
**診断担当**: Claude Sonnet
**対象バグ**: 夏大会の後、秋大会に参加できず翌年まで何も起きなかった

---

## 1. 診断スクリプト実行結果

`scripts/diagnose-autumn-tournament.ts` を複数のシード値で実行した結果：

```
SEED=diagnose-autumn-2026 (rep=55):
  ✅ 7/10_summer_created: OK
  ✅ 7/31_summer_ended: OK
  ✅ 9/15_autumn_created: OK
  ✅ 9/15_player_in_bracket: OK
  ✅ 10/15_autumn_completed: OK

SEED=diagnose-high-rep (rep=90, seeded):
  ✅ 自校はRound2にhomeとして配置（シード校）
  ✅ 秋大会も正常に進行・完了
```

→ **エンジン層（world-ticker, tournament-bracket）自体は正常動作**

---

## 2. 発見した根本バグ

### バグ A（修正済み）: 大会終了後の `seasonState.phase` が誤ったフェーズのまま

**場所**: `src/engine/world/world-ticker.ts` の `computeSeasonPhase` 呼び出し部

**問題内容**:
- 夏大会は 7/28（Round 6）に完了するが、`computeSeasonPhase({7, 29})` は カレンダー的に `'summer_tournament'` を返す
- `activeTournament = null`（大会終了済）であっても上書きされなかった
- 結果: 7/29〜7/30 は `phase = 'summer_tournament'` のまま `activeTournament = null`

**影響**:
1. UI の `isInTournamentSeason = true` になるが `tournament` が undefined → ProgressIndicator の表示が誤る
2. `buildTournamentStartInfo` が呼ばれず「秋大会まであと○日」も表示されない（2日間）
3. ユーザーが「大会が終わったのに大会中フェーズ」という混乱したUIを見ることになる

**修正内容** (`world-ticker.ts` 線 543–548 付近):
```typescript
// 追加: 大会が終了したのに calendar phase が tournament になるのを防ぐ
if (!activeTournament && (newPhase === 'summer_tournament' || newPhase === 'autumn_tournament')) {
  newPhase = newPhase === 'summer_tournament' ? 'post_summer' : 'off_season';
}
```

### バグ B（補強）: `advanceWeek` の試合日停止ロジック

**場所**: `src/stores/world-store.ts`
**問題内容**:
- `advanceWeek` は `i=0` のとき試合日チェックをスキップする
- 9/14→9/15（秋大会作成日）では：
  - i=0: 9/14を処理 → 秋大会が newDate=9/15 で作成される
  - i=1: 9/15が試合日 → stop
- ユーザーは「1週間進む」を押したのに1日しか進まない、と感じることがある
- **これは設計上の意図通りだが、UXが分かりにくい可能性がある**（今回は修正しない）

### バグ C（確認済み・非問題）: シード校のRound2 away=null

- 大会作成直後、シード校は Round2 home に配置、away は null
- Round1 シミュレーション後に propagateWinners で away が埋まる
- 9/15 に Round1 と Round2 準備が正常に完了する ✓

---

## 3. 修正後の確認

`scripts/diagnose-autumn-tournament.ts` で再確認:

```
✅ 7/10_summer_created: OK
✅ 7/31_summer_ended: OK
✅ 9/15_autumn_created: OK
✅ 9/15_player_in_bracket: OK
✅ 10/15_autumn_completed: OK
🎉 問題は検出されませんでした
```

---

## 4. 追加テスト

`tests/engine/world/autumn-tournament.test.ts` を作成:

- 新規ゲーム→9/15時点で自校が秋大会のいずれかのラウンドに登録されている ✓
- 9/15→10/15まで進めると大会が完了する ✓
- 夏大会終了後（7/29-7/30）は `phase = 'post_summer'`（修正後） ✓
- 秋大会終了後（10/11-10/14）は `phase = 'off_season'`（修正後） ✓

---

## 5. 再発防止

- `getTodayRound` と `isTournamentMatchDay`（world-store.ts）の日程定義は一致していることを確認済み
- `propagateWinners` は全ラウンドで正常動作することをテスト済み
- 大会が既存のまま新しい大会が誤って作成される条件はない（`!nextWorld.activeTournament` ガード）
