# PHASE 11-A2 実装レポート: 監督戦術スタイル

**日時:** 2026-04-19
**バージョン:** v0.18.0 → v0.18.1
**状態:** 完了・本番デプロイ済み

---

## 概要

監督に戦術スタイル（`ManagerStyle`）フィールドを追加し、
試合エンジンの打撃・守備・CPU 采配に影響を与えるシステムを実装した。
後方互換性を保ちつつ、既存テスト 619 件が全件パスすることを確認済み。

---

## 実装内容

### 1. 型定義 — `src/engine/types/team.ts`

```ts
export type ManagerStyle = 'aggressive' | 'balanced' | 'defensive' | 'small_ball';

export interface Manager {
  // 既存フィールド（省略）
  style?: ManagerStyle;  // ← 追加 (optional, 後方互換)
}
```

`style` は optional のため、既存セーブデータは `balanced` と同等に動作する。

---

### 2. スタイル効果定義 — `src/engine/match/manager-style-effects.ts` (新規)

```
aggressive:  longHitMultiplier=1.05, cpuBuntBias=-0.10, cpuStealBias=-0.10
balanced:    全補正なし（デフォルト）
defensive:   errorRateMultiplier=0.9, cpuBuntBias=+0.10
small_ball:  cpuBuntBias=+0.25, stealSuccessBonus=+0.05
```

公開 API: `getStyleEffects(style?: ManagerStyle): StyleEffects`
`undefined` を渡すと `balanced` と同等の値を返す（後方互換保証）。

---

### 3. 打撃補正 — `src/engine/match/pitch/bat-contact.ts`

- `generateBatContact()` に `longHitMultiplier: number = 1.0` 引数を追加
- `fly_ball` / `line_drive` の `distance` に乗数を適用
- aggressive (1.05) → 長打飛距離 +5%

### 3b. スイング結果経由 — `src/engine/match/pitch/swing-result.ts`

- `calculateSwingResult()` に `managerStyle?: ManagerStyle` 引数を追加
- `getStyleEffects(managerStyle).longHitMultiplier` を `generateBatContact` に渡す

---

### 4. CPU 采配補正 — `src/engine/match/tactics.ts`

- `cpuAutoTactics()` に `managerStyle?: ManagerStyle` 引数を追加（既存呼び出しはデフォルト値で互換）
- `getStyleEffects()` からバント確率補正 (`cpuBuntBias`) を取得
- `baseBuntChance = 1.0 + effects.cpuBuntBias` で確率計算
  - aggressive: 確率 0.90（条件成立でも 10% でバントしない）
  - small_ball: 追加バント機会（5回以降・2点差以内でも 35% 確率でバント）

---

### 5. エラー率補正 — `src/engine/match/at-bat.ts`

- `processAtBat()` に `managerStyle?: ManagerStyle` 引数を追加
- `error` 結果が出た際、`getStyleEffects(managerStyle).errorRateMultiplier` を参照
- defensive (0.9): 10% の確率でエラーをアウトに変換（好守備再現）

---

### 6. ストアアクション — `src/stores/world-store.ts`

```ts
setManagerStyle: (style: ManagerStyle | undefined) => void;
```

`worldState.manager.style` を更新。`undefined` で style フィールドを削除。

---

### 7. UI — `src/app/play/team/page.tsx`

チーム画面に監督セクションを追加:
- 監督名・通算成績表示
- 戦術スタイルドロップダウン（4 択）
- 変更時トースト通知
- スタイルの説明文を表示

ViewState: `TeamViewState.manager: ManagerView` を追加
Projector: `teamProjector.ts` で `manager` フィールドを生成

---

## 変更ファイル一覧

| ファイル | 種別 | 変更内容 |
|---------|------|---------|
| `src/engine/types/team.ts` | 修正 | `ManagerStyle` 型と `Manager.style` フィールド追加 |
| `src/engine/match/manager-style-effects.ts` | **新規** | スタイル効果定義・`getStyleEffects()` |
| `src/engine/match/pitch/bat-contact.ts` | 修正 | `longHitMultiplier` 引数追加 |
| `src/engine/match/pitch/swing-result.ts` | 修正 | `managerStyle` 引数追加、effects 経由で乗数適用 |
| `src/engine/match/tactics.ts` | 修正 | `managerStyle` 引数追加、バント確率補正 |
| `src/engine/match/at-bat.ts` | 修正 | `managerStyle` 引数追加、エラー率補正 |
| `src/stores/world-store.ts` | 修正 | `setManagerStyle()` アクション追加 |
| `src/ui/projectors/view-state-types.ts` | 修正 | `ManagerView` 型と `TeamViewState.manager` 追加 |
| `src/ui/projectors/teamProjector.ts` | 修正 | `managerView` 生成・返却 |
| `src/app/play/team/page.tsx` | 修正 | 監督セクション・スタイルドロップダウン追加 |
| `src/version.ts` | 修正 | v0.18.1 / CHANGELOG 追加 |
| `tests/engine/match/manager-style.test.ts` | **新規** | スタイル効果テスト (9 件) |

---

## テスト結果

```
Test Files  57 passed (57)
     Tests  619 passed (619)   ← 旧 610 + 新規 9 = 619
   Duration  103.26s
```

### 新規テスト (9 件)

- `getStyleEffects()` — undefined は balanced と同等
- aggressive: longHitMultiplier=1.05、cpuBuntBias=-0.10
- balanced: 全補正なし
- defensive: errorRateMultiplier=0.9、cpuBuntBias=+0.10
- small_ball: cpuBuntBias=+0.25、stealSuccessBonus=+0.05
- aggressive では balanced より少ないバント（確率的検証: 200 試行）
- small_ball では balanced より多いバント（追加バント機会）
- undefined は balanced と同一シード同一結果
- defensive は balanced より低い errorRateMultiplier

---

## 後方互換性

- `Manager.style` は optional → 既存セーブデータは balanced 相当で動作
- `cpuAutoTactics()`, `processAtBat()`, `calculateSwingResult()`, `generateBatContact()` の引数は全て optional/デフォルト値あり → 既存呼び出しは変更不要
- runner.ts は変更していない（設計制約を遵守）

---

## デプロイ

```
✅ デプロイ成功 (v0.18.1 / dfa1d7e-dirty)
   → https://kokoyakyu-days.jp/
```
