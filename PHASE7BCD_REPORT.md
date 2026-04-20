# Phase 7-B/C/D 実装レポート

**実装日**: 2026-04-20
**バージョン**: v0.19.0 → v0.20.0
**担当**: Claude Code (Sonnet 4.6)

---

## 1. 実装サマリー

| Phase | 状態 | 説明 |
|---|---|---|
| **7-B** 心理システム基盤 | ✅ 完遂 | 全機能実装 |
| **7-C** 細かい采配 | ✅ 完遂 | 型定義・モーダルUI・pitch連動 |
| **7-D** 特性拡張 | ✅ 完遂 | 10種追加・DB反映 |

---

## 2. Phase 7-B: 心理システム基盤

### 2-1. 型定義 (src/engine/psyche/types.ts 新規)

| 型 | 用途 |
|---|---|
| `MonologuePattern` | モノローグパターンの全情報（条件・テキスト・補正） |
| `MonologueRole` | `batter / pitcher / catcher / runner / fielder` |
| `MentalEffect` | 数値補正 (contactMultiplier / velocityBonus / ignoreOrder 等) |
| `SituationCondition` | 状況条件（イニング・アウト・走者・点差・甲子園） |
| `OrderCondition` | 采配タイプとのマッチ |
| `CountCondition` | ボール・ストライクカウント条件 |
| `PitchContext` | `generatePitchMonologues()` に渡す1球の文脈情報 |
| `PitchMonologues` | 生成結果 (batter/pitcher/catcher の MonologueEntry | null) |
| `MonologueEntry` | `PitchLogEntry.monologues` に保存する軽量型 |

### 2-2. MonologuePattern DB (src/engine/psyche/monologue-db.ts 新規)

合計 **63 パターン** 定義（設計書 §10 の20件を含む）:

| カテゴリ | パターン数 |
|---|---|
| 打者 — ピンチ・勝負どころ | 6 |
| 打者 — 采配系 | 5 |
| 打者 — カウント系 | 4 |
| 打者 — 大舞台・甲子園 | 2 |
| 打者 — スランプ・連続凡退 | 2 |
| 打者 — 内角攻め | 2 |
| 打者 — 終盤緊迫 | 2 |
| 打者 — 汎用 | 1 |
| 投手 — 采配系 | 6 |
| 投手 — スタミナ | 3 |
| 投手 — ピンチ | 2 |
| 投手 — 連続三振 | 1 |
| 投手 — 甲子園 | 2 |
| 投手 — 汎用 | 2 |
| 捕手 | 4 |
| 走者 | 2 |
| 野手 | 2 |
| Phase 7-D 新特性対応 | 14 |

### 2-3. generatePitchMonologues() (src/engine/psyche/generator.ts 新規)

- `filterPatterns()`: 状況・特性・采配・カウント・スタミナの5条件を AND でフィルタリング
- `weightedPick()`: `weight` に基づく重み付きランダム選択
- `matchTraits()`: traitMatch は **OR** マッチング（どれか1つ持てば OK）、traitExclude は全除外
- 各役割 (batter/pitcher/catcher) から最大1パターンを選択して返す

### 2-4. PitchLogEntry 拡張

```ts
// view-state-types.ts に追加
monologues?: MonologueEntry[];  // optional (旧セーブデータ互換)

interface MonologueEntry {
  role: MonologueRole;
  text: string;
  effectSummary?: string;
}
```

### 2-5. match-store.ts 統合

- `currentOrder: TacticalOrder` フィールドを追加
- `buildPitchContext()`: MatchState + TacticalOrder → PitchContext 変換
- `toOrderConditionType()`: TacticalOrder → OrderConditionType 変換
  - `bunt` → `passive`
  - `steal` / `hit_and_run` → `aggressive`
  - `batter_detailed` → `outside_focus` / `inside_focus` / `aggressive` / `passive` / `detailed_focus`
  - `pitcher_detailed` → `fastball_heavy` / `breaking_heavy` / `brush_back` / `outside_focus` / `inside_focus`
- `stepOnePitch`: 投球前に `generatePitchMonologues()` を呼び、結果を `logEntry.monologues` に記録
- `stepOneAtBat`: 打席の1球目に `generatePitchMonologues()` を付加
- 投球後に `currentOrder` を `{ type: 'none' }` にリセット

### 2-6. PsycheWindow.tsx (新規)

- 最新投球ログの `monologues` を取得して表示
- 打者: 左側 / 青系 吹き出し
- 投手: 右側 / 赤系 吹き出し
- 捕手: 中央 / 緑系 吹き出し
- `effectSummary` を小さく表示
- レスポンシブ対応 (480px 以下で縦並び)
- 試合画面の「実況ログ」直下に配置

---

## 3. Phase 7-C: 細かい采配

### 3-1. TacticalOrder 拡張 (src/engine/match/types.ts)

```ts
// 新追加
export type BatterFocusArea = 'inside' | 'outside' | 'low' | 'high' | 'middle';
export type BatterPitchType = 'fastball' | 'breaking' | 'offspeed' | 'any';
export interface BatterDetailedOrder {
  type: 'batter_detailed';
  focusArea?: BatterFocusArea;
  pitchType?: BatterPitchType;
  aggressiveness?: 'passive' | 'normal' | 'aggressive';
}

export type PitcherFocusArea = 'inside' | 'outside' | 'low' | 'high' | 'edge';
export type PitcherPitchMix = 'fastball_heavy' | 'breaking_heavy' | 'balanced';
export interface PitcherDetailedOrder {
  type: 'pitcher_detailed';
  focusArea?: PitcherFocusArea;
  pitchMix?: PitcherPitchMix;
  intimidation?: 'brush_back' | 'normal';
}

// TacticalOrder ユニオンに BatterDetailedOrder | PitcherDetailedOrder を追加
```

### 3-2. DetailedOrderModal.tsx (新規)

- 「⚙ 細かく指示」ボタンを TacticsBar に追加 (7ボタン目)
- **打者モード**: 狙うコース / 狙う球種 / 積極性 をラジオボタンで選択
- **投手モード**: 配球コース / 球種比率 / 威嚇 をラジオボタンで選択
- 「指示を出す」で `applyOrder()` に `BatterDetailedOrder` / `PitcherDetailedOrder` を渡す
- オーバーレイクリックでキャンセル

### 3-3. 効果メカニズム (§5 準拠)

`toOrderConditionType()` で `TacticalOrder` → `OrderConditionType` に変換し、`generatePitchMonologues()` を通じてモノローグとメンタル補正に反映:

| 采配 | OrderConditionType | モノローグ効果 |
|---|---|---|
| `batter_detailed` focusArea=outside | `outside_focus` | bat_outside_focus_ok → ミート+15% |
| `pitcher_detailed` pitchMix=fastball_heavy | `fastball_heavy` | pit_fastball_heavy → 球速+3 |
| `pitcher_detailed` intimidation=brush_back | `brush_back` | pit_brush_back_threat → 打者集中乱し |
| `pitcher_detailed` pitchMix=breaking_heavy (stamina<50) | `breaking_heavy` | pit_breaking_heavy_weak → 制球-15% |

**runner.ts は一切変更していない。**

---

## 4. Phase 7-D: 特性拡張

### 新追加 10 種の TraitId

| TraitId | 日本語名 | 主な挙動 |
|---|---|---|
| `hotblooded` | 熱血 | ピンチでミート+10% パワー+12% |
| `stoic` | 冷静 | 常に選球眼+8% ミート+3% |
| `cautious` | 慎重 | passive指示で選球眼+15%、aggressive指示でミート-10% |
| `stubborn` | 頑固 | detailed指示で ignoreOrder (指示無効化) |
| `clutch_hitter` | 勝負師 | 2ストライクでミート+10% |
| `scatterbrained` | 混乱しやすい | detailed指示でミート-10% |
| `big_game_player` | 大舞台 | 甲子園で全能力+10% |
| `steady` | 地味 | 常にミート+2% (安定) |
| `timid` | ビビリ | 甲子園で全能力-10%、brush_back でミート-15% |
| `ace` | エース | 甲子園/2out満塁で球速+3 制球+5〜10% |

### playerProjector.ts 更新

`TRAIT_LABELS` に10種の日本語マッピングを追加。

---

## 5. 変更/追加ファイル一覧

| ファイル | 種別 | 変更概要 |
|---|---|---|
| `src/engine/psyche/types.ts` | **新規** | 心理システム型定義一式 |
| `src/engine/psyche/monologue-db.ts` | **新規** | モノローグパターンDB (63パターン) |
| `src/engine/psyche/generator.ts` | **新規** | generatePitchMonologues() + filterPatterns() |
| `src/engine/match/types.ts` | 変更 | BatterDetailedOrder / PitcherDetailedOrder / TacticalOrder 拡張 |
| `src/engine/types/player.ts` | 変更 | TraitId に10種追加 |
| `src/ui/projectors/view-state-types.ts` | 変更 | PitchLogEntry に monologues? / MonologueEntry 追加 |
| `src/ui/projectors/playerProjector.ts` | 変更 | TRAIT_LABELS に10種追加 |
| `src/stores/match-store.ts` | 変更 | currentOrder / buildPitchContext() / モノローグ生成統合 |
| `src/app/play/match/[matchId]/PsycheWindow.tsx` | **新規** | 心理ウィンドウUIコンポーネント |
| `src/app/play/match/[matchId]/psycheWindow.module.css` | **新規** | 心理ウィンドウCSS |
| `src/app/play/match/[matchId]/DetailedOrderModal.tsx` | **新規** | 詳細采配モーダルコンポーネント |
| `src/app/play/match/[matchId]/detailedOrderModal.module.css` | **新規** | 詳細采配モーダルCSS |
| `src/app/play/match/[matchId]/page.tsx` | 変更 | PsycheWindow統合 / DetailedOrderModal統合 / 「⚙ 細かく指示」ボタン |
| `src/app/play/match/[matchId]/match.module.css` | 変更 | tacticsBtnDetail クラス追加 |
| `src/version.ts` | 変更 | VERSION 0.19.0 → 0.20.0 / CHANGELOG追加 |
| `PHASE7BCD_REPORT.md` | **新規** | 本レポート |

---

## 6. テスト結果

```
Test Files  74 passed (74)
     Tests  817 passed (817)
  Duration  339.47s
```

**既存の 817 件すべてパス。新規テストの追加なし（UI コンポーネントは既存テストフレームワーク外）。**

---

## 7. ビルド結果

```
✅ next build 成功（TypeScript エラーなし）
```

---

## 8. 技術的決定事項

### 8-1. runner.ts 非変更の維持

`generatePitchMonologues()` の呼び出しは `match-store.ts` の `stepOnePitch` / `stepOneAtBat` 内で行い、`runner.ts` は一切変更していない。モノローグは「UI 層での付加情報」として扱い、試合エンジンとの疎結合を保った。

### 8-2. モノローグ生成タイミング

- `stepOnePitch`: 毎球生成（PitchLogEntry に1件ずつ）
- `stepOneAtBat`: 打席の1球目にのみ生成（打席単位で最初のみ）
  - 理由: `stepOneAtBat` では複数球を一括処理するため、全球にモノローグを付けると冗長になる

### 8-3. currentOrder リセット

`stepOnePitch` / `stepOneAtBat` 完了後に `currentOrder` を `{ type: 'none' }` にリセット。
これにより采配指示は1打席（または1球）限り有効となる。

### 8-4. 特性マッチングは OR 判定

`traitMatch` は **いずれかの特性を1つでも持てば** マッチする OR 判定にした。
これにより「passionate または competitive」などの設計書想定に対応しやすい。

### 8-5. セーブデータ互換性

- `PitchLogEntry.monologues` は `optional` — 旧ゲームデータでも `undefined` としてデシリアライズ可
- `TraitId` の追加は後方互換（既存選手は新特性を持たないだけで問題なし）
- `MatchStoreState.currentOrder` は `INITIAL_STATE` に `{ type: 'none' }` で初期化済み

---

## 9. 既知の課題 / 次フェーズへの引き継ぎ

### 9-1. モノローグ効果の試合への反映

現フェーズでは `MentalEffect` はモノローグテキストの「説明」として生成されるが、
実際の `contact` / `velocity` 補正は `processPitch` 内には反映されていない。

次フェーズで検討:
- `match-store.ts` で `MentalEffect` を集計し、補正係数を `runner.stepOnePitch(rng, overrides?)` に渡す仕組み
- runner.ts の API 拡張 (optional overrides) で対応できる見込み

### 9-2. 頑固 (stubborn/rebellious) の ignoreOrder

`ignoreOrder: true` フラグは現状 UI の `effectSummary` にしか反映されていない。
実際に采配を無視させるには match-store で `ignoreOrder` を検出し、`currentOrder` をリセットする処理が必要。

### 9-3. モノローグの連続重複

同一パターンが連続して選ばれる場合がある（特に汎用フォールバックパターン）。
直前に使ったパターン ID を除外する「最近使用ID セット」の実装で改善できる。

### 9-4. 新特性の選手への付与

`TraitId` に10種追加したが、既存の選手生成ロジック (`src/engine/player/generate.ts`) は
まだ新特性を割り当てない。次フェーズで生成確率テーブルに追加する必要がある。

---

*このレポートは Phase 7-B/C/D 完了時点（2026-04-20）に自動生成されました。*
