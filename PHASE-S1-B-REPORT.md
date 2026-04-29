# Phase S1-B 実装レポート

**バージョン**: v0.45.1
**実装日**: 2026-04-29
**コミット**: feat(phase-s1-b): UI拡張（B1-B6）

---

## 概要

Phase S1-B では、ホーム画面ナビゲーションの拡張、練習システムの強化、選手詳細画面の機能追加を実施した。

---

## 実装内容

### B1: ホーム画面ナビ 10項目化

- `src/app/play/page.tsx`: メインナビを7項目 → 10項目に拡張（ホーム/チーム/練習/スタッフ/ニュース/スカウト/大会/試合/試合結果/OB）
- `src/components/GlobalHeader.tsx`: quickNav から 練習/スタッフ/試合のリンクを削除（重複防止）、ハンバーガーメニューからも同様に削除、`useMemo` import 削除、バッジドット計算削除

### B2: ナビゲーション バッジカウント

- `src/ui/projectors/view-state-types.ts`: `NavBadgeCounts` インターフェース追加、`HomeViewState.navBadges` フィールド追加
- `src/ui/projectors/homeProjector.ts`: `buildNavBadges()` 関数追加（ニュース/スカウト/大会/試合/試合結果/OB/練習/スタッフ の各バッジ数計算）
- `src/app/play/page.tsx`: `NavBadge` コンポーネント追加、各ナビ項目にバッジ表示を統合

### B3: チーム全体練習 3スロット選択

- `src/engine/types/calendar.ts`: `TeamPracticeSlot`, `TeamPracticePlan`, `PracticeFeedback` 型追加
- `src/engine/practice/team-practice.ts` (新規): 3スロット練習プラン計算ロジック実装
  - `computePlanStatEffects()`: 各スロット効果 × 1/3 で合算
  - `computePlanFatigueLoad()`: 疲労負荷の 1/3 合算
  - `createTeamPracticePlan()`, `menuIdToPlan()`, `getPlanLabel()`, `getPrimaryMenuId()` ヘルパー
- `src/engine/world/world-state.ts`: `HighSchool` に `teamPracticePlan?` フィールド追加
- `src/stores/world-store.ts`: `setTeamPracticePlan` アクション追加（slot[0] を `practiceMenu` と同期し既存 `advanceDay()` 互換性維持）
- `src/app/play/team/page.tsx`: 3スロットドロップダウン UI に更新（`data-testid="team-practice-slot-0/1/2"`）

### B4: 個別練習メニュー 6種追加

- `src/data/practice-menus.ts` (新規): 練習メニュー定義の静的モジュール
  - 既存 9種 + 新規 6種 = 15種
  - 新規メニュー: `base_running`, `position_drill`, `pitch_study`, `pressure_mental`, `flexibility`, `video_analysis`
  - エクスポート: `PRACTICE_MENUS`, `TEAM_PRACTICE_MENUS` (9種), `INDIVIDUAL_PRACTICE_MENUS` (15種), `getPracticeMenuById()`
- `src/engine/types/calendar.ts`: `PracticeMenuId` に 6種追加

### B5: 選手詳細ページ 個別練習ドロップダウン

- `src/app/play/team/[playerId]/page.tsx`: 個別練習セクション追加
  - `data-testid="individual-practice-section"` セクション
  - `data-testid="individual-practice-dropdown"` セレクト要素（全15種表示）
  - 変更時 `setIndividualMenu()` でストアに保存
- `src/ui/projectors/view-state-types.ts`: `PlayerDetailViewState.individualMenu` フィールド追加
- `src/ui/projectors/playerProjector.ts`: `individualMenu` フィールドを `projectPlayer()` に追加

### B6: 練習成果フィードバック履歴

- `src/engine/growth/practice-feedback.ts` (新規): フィードバックメッセージ生成
  - `FEEDBACK_TEMPLATES`: 各 stat × 閾値ごとの日本語メッセージ定義
  - `buildFeedbackMessage(target, delta)`: delta に応じた最高閾値のメッセージ返却
  - `pickBestFeedback(deltas)`: 複数 delta から最大のものを選択
- `src/ui/projectors/view-state-types.ts`: `PracticeFeedbackView` インターフェース追加、`PlayerDetailViewState.practiceFeedbacks` フィールド追加
- `src/ui/projectors/playerProjector.ts`: `buildPracticeFeedbacks()` ヘルパー追加（直近10件を `practiceFeedbackHistory` から生成）
- `src/app/play/team/[playerId]/page.tsx`: 練習成果フィードバックセクション追加
  - `data-testid="practice-feedback-section"` セクション
  - `data-testid="practice-feedback-item"` 各フィードバック表示

---

## 変更ファイル一覧

| ファイル | 変更種別 | 説明 |
|---|---|---|
| `src/engine/types/calendar.ts` | 更新 | PracticeMenuId 6種追加、TeamPracticePlan/PracticeFeedback 型追加 |
| `src/engine/world/world-state.ts` | 更新 | HighSchool に teamPracticePlan, practiceFeedbackHistory 追加 |
| `src/engine/practice/team-practice.ts` | 新規 | 3スロット練習プランロジック |
| `src/engine/growth/practice-feedback.ts` | 新規 | 練習フィードバックメッセージ生成 |
| `src/data/practice-menus.ts` | 新規 | 練習メニュー静的データ（15種） |
| `src/stores/world-store.ts` | 更新 | setTeamPracticePlan アクション追加 |
| `src/components/GlobalHeader.tsx` | 更新 | quickNav/hamburger から練習/スタッフ/試合削除 |
| `src/app/play/page.tsx` | 更新 | ナビ10項目化、NavBadge コンポーネント追加 |
| `src/app/play/team/page.tsx` | 更新 | 3スロット練習選択UI |
| `src/app/play/team/[playerId]/page.tsx` | 更新 | 個別練習ドロップダウン、フィードバック履歴表示 |
| `src/ui/projectors/view-state-types.ts` | 更新 | NavBadgeCounts, PracticeFeedbackView, 関連フィールド追加 |
| `src/ui/projectors/homeProjector.ts` | 更新 | buildNavBadges() 追加 |
| `src/ui/projectors/playerProjector.ts` | 更新 | individualMenu, practiceFeedbacks フィールド追加 |

---

## テストファイル一覧

| ファイル | テストID | 内容 |
|---|---|---|
| `tests/ui/projectors/navBadges.test.ts` | B1-test1, B1-test2, B2-test1 | ナビ10項目確認、GlobalHeader検証、navBadges計算 |
| `tests/engine/practice/team-practice.test.ts` | B3-test1, B3-test2 | 3スロット効果計算 |
| `tests/data/practice-menus.test.ts` | B4-test1 | 6種新規メニュー定義確認 |
| `tests/ui/projectors/playerFeedback.test.ts` | B5-test1, B6-test2 | 個別練習メニュー反映、フィードバック履歴10件確認 |
| `tests/engine/growth/practice-feedback.test.ts` | B6-test1 | フィードバックメッセージ閾値テスト |

---

## テスト結果

```
Test Files  128 passed (128)
     Tests  1966 passed (1966)
  Start at  15:42:09
  Duration  490.68s
```

- 既存テスト: 1910件 → 全パス（破壊的変更なし）
- 新規テスト (Phase S1-B): 56件 追加 → 全パス

---

## 動作確認手順

1. `npx vitest run` でテスト全通過を確認
2. `npx next dev` で開発サーバー起動
3. `/play` ページでナビが10項目表示されることを確認
4. ニュースがある場合、ニュースナビ項目にバッジが表示されることを確認
5. `/play/team` で練習メニューが3スロット選択になっていることを確認
6. `/play/team/[playerId]` で個別練習ドロップダウンと練習成果フィードバックセクションを確認

---

## 既知の制限事項

- `practiceFeedbackHistory` はエンジン側でまだ書き込まれていない（B6 は表示UIのみ実装）。実際のフィードバック生成は Phase S1-C 以降で `advanceDay()` に統合予定。
- 3スロット練習プランは UI/Store に保存されるが、`advanceDay()` エンジンは後方互換で `practiceMenu`（slot[0]）を参照しており、3スロット完全統合も Phase S1-C 以降の対応となる。
- GlobalHeader のハンバーガーメニューから練習/スタッフを削除したため、モバイル表示でのこれらのページへのアクセスはメインナビのみとなる。
