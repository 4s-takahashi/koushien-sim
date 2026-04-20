# Phase 7-E 完了レポート — 心理システム仕上げ

**バージョン**: v0.21.0
**実装日**: 2026-04-20
**ベース**: v0.20.0 (Phase 7-B/C/D + i18n 済み)

---

## 概要

Phase 7-E は Phase 7-B/C/D で構築した心理（モノローグ）システムの「引き継ぎ課題」を全て実装し、
モノローグが実際にゲームプレイへ影響するようにした。

| タスク | 内容 | 規模 |
|--------|------|------|
| 7-E1 | MentalEffect → MatchOverrides → 試合ロジック反映 | 中 |
| 7-E2 | `ignoreOrder` フラグの実装（頑固特性） | 小 |
| 7-E3 | モノローグ連続重複回避（リングバッファ） | 小 |
| 7-E4 | 新特性10種を選手生成確率テーブルに追加 | 小 |

---

## タスク 7-E1: MentalEffect → 試合ロジック反映

### 追加した API

#### `MatchOverrides` インターフェース (`src/engine/match/runner-types.ts`)

```typescript
export interface MatchOverrides {
  batterMental?: {
    contactBonus?: number;        // -0.3 ~ +0.3 (相対係数)
    powerBonus?: number;          // -0.3 ~ +0.3
    swingAggressionBonus?: number; // -0.3 ~ +0.3 (選球眼の逆補正)
  };
  pitcherMental?: {
    velocityBonus?: number;  // -5 ~ +5 km/h (加算)
    controlBonus?: number;   // -0.3 ~ +0.3 (相対係数)
  };
}
```

#### `MatchRunner.stepOnePitch` / `stepOneAtBat` (拡張シグネチャ)

```typescript
// runner.ts
stepOnePitch(rng: RNG, overrides?: MatchOverrides): { pitchResult, events, atBatEnded }
stepOneAtBat(rng: RNG, overrides?: MatchOverrides): { atBatResult, events }
```

**既存テストへの影響**: なし（`overrides` は完全に省略可能）

### 補正の伝達フロー

```
match-store.ts
  └─ generatePitchMonologues() → PitchMonologuesWithEffects
       └─ batterEffects[] / pitcherEffects[]
           └─ buildBatterOverridesFromEffects() / buildPitcherOverridesFromEffects()
               └─ MatchOverrides
                   └─ runner.stepOnePitch(rng, overrides)
                       └─ processPitch(state, order, rng, overrides)
                           ├─ getEffectivePitcherParams(mp, overrides.pitcherMental)
                           └─ getEffectiveBatterParams(mp, overrides.batterMental)
```

### 補正係数の範囲とクリップロジック

| 補正種別 | 入力範囲 | クリップ |
|----------|----------|--------|
| `contactBonus` | 任意 | `clamp(-0.3, +0.3)` |
| `powerBonus` | 任意 | `clamp(-0.3, +0.3)` |
| `swingAggressionBonus` | 任意 | `clamp(-0.3, +0.3)` |
| `velocityBonus` | 任意 | `Math.max(-5, Math.min(5, v))` |
| `controlBonus` | 任意 | `clamp(-0.3, +0.3)` |

### MentalEffect → MatchOverrides 変換ロジック

```typescript
// src/engine/psyche/generator.ts

buildBatterOverridesFromEffects(effects: MentalEffect[]):
  contactBonus  = Σ (effect.contactMultiplier - 1)
  powerBonus    = Σ (effect.powerMultiplier   - 1)
  swingAggressionBonus = Σ -(effect.eyeMultiplier - 1) * 0.5
  // batterFocusDisrupt: contactBonus -= 0.08, powerBonus -= 0.05

buildPitcherOverridesFromEffects(effects: MentalEffect[]):
  velocityBonus = Σ effect.velocityBonus
  controlBonus  = Σ (effect.controlMultiplier - 1)
```

### ミニシミュレーション: 補正の影響

以下は contact=70, power=60 の打者への補正サンプル（ベース値を 1.0 とした比率）:

| シナリオ | contactBonus | 実効 contact | 対ベース比 |
|----------|-------------|-------------|---------|
| 「ここで決めてやる！」passionate 満塁 | +0.08 | 75.6 | +8.0% |
| 「集中が乱れる」focusDisrupt | -0.08 | 64.4 | -8.0% |
| 「ボールをよく見よう」calm | 0 (eyeMulti) | 70.0 | — |
| 補正なし（ベース） | 0 | 70.0 | — |

---

## タスク 7-E2: `ignoreOrder` 実装（頑固特性）

### 実装内容

`match-store.ts` の `stepOnePitch` / `stepOneAtBat` で:

1. `generatePitchMonologues()` 後に `hasIgnoreOrderEffect([...batterEffects, ...pitcherEffects])` を呼ぶ
2. `ignoreOrder: true` が検出された場合:
   - `runner.applyPlayerOrder({ type: 'none' })` で采配をキャンセル
   - 実況ログに「**[打者名]は監督の指示を無視した！**」を追加（kind: 'highlight'）
3. `shouldIgnoreOrder && currentOrder.type !== 'none'` の場合のみ動作

### 対象特性

- `stubborn`（頑固）— monologue-db.ts で `ignoreOrder: true` フラグを持つパターンが存在

---

## タスク 7-E3: モノローグ連続重複回避

### 実装内容

**`src/engine/psyche/generator.ts`** の変更:

- `weightedPick(candidates, excludeIds?)` に除外セット引数を追加
- 全候補が除外される場合: フォールバック（除外を無視して選択）
- `generatePitchMonologues(ctx, excludeIds?)` に第2引数を追加
- 戻り値に `pickedIds: string[]` を追加（選ばれたパターン ID 一覧）

**`src/stores/match-store.ts`** の変更:

- state に `recentMonologueIds: string[]` を追加（初期値: `[]`）
- `updateRecentMonologueIds()`: リングバッファ（最新5件）
- `stepOnePitch` / `stepOneAtBat` で `excludeIds = new Set(recentMonologueIds)` を渡し、終了後に更新

**設定値**: `RECENT_MONOLOGUE_RING_SIZE = 5`（最新5件の ID を除外）
**セーブ/ロード**: `recentMonologueIds` は保存しない（セッションメモリのみ）

---

## タスク 7-E4: 新特性10種の選手生成割り当て

### 確率テーブル設計 (`src/engine/player/generate.ts`)

| 特性 | 種別 | 付与確率（概算） | ポジション制限 |
|------|------|--------------|------------|
| `hotblooded` | 中頻度 | ~7.5% | なし |
| `stoic` | 中頻度 | ~7.5% | なし |
| `cautious` | 中頻度 | ~7.5% | なし |
| `scatterbrained` | 中頻度 | ~7.5% | なし |
| `steady` | 中頻度 | ~7.5% | なし |
| `timid` | 中頻度 | ~7.5% | なし |
| `stubborn` | 希少 | ~1% | なし |
| `clutch_hitter` | 希少 | ~2% | 野手のみ |
| `big_game_player` | 希少 | ~2% | なし |
| `ace` | 希少 | ~2% | 投手のみ |

### コンフリクトルール（新規追加分）

```typescript
['hotblooded', 'stoic'],    // 熱血 ↔ 冷静
['cautious', 'timid'],      // 慎重 ↔ 臆病（似すぎ）
['hotblooded', 'cautious'], // 熱血 ↔ 慎重
['stoic', 'scatterbrained'], // 鉄心 ↔ 気分屋
```

### API の変更

```typescript
// 変更前
export function generateTraits(rng: RNG): TraitId[]

// 変更後（後方互換: position は省略可能）
export function generateTraits(rng: RNG, position?: Position): TraitId[]
```

`generatePlayer()` では `generateTraits(rng, position)` を呼ぶように更新。

---

## テスト

### 追加テスト

**新規テストファイル**: `tests/engine/psyche/phase7e.test.ts` — **26テスト**

| テストグループ | テスト数 |
|-------------|---------|
| 7-E1: MentalEffect → MatchOverrides → 試合パラメータ | 13 |
| 7-E2: ignoreOrder フラグ検出 | 3 |
| 7-E3: 連続重複回避（excludeIds） | 4 |
| 7-E4: 新特性10種の選手生成 | 6 |

### テスト結果

```
Test Files  75 passed (75)  [74 既存 + 1 新規]
     Tests  843 passed (843) [817 既存 + 26 新規]
```

**既存テスト全パス確認済み**

---

## ファイル変更一覧

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `src/engine/match/runner-types.ts` | 追加 | `MatchOverrides` インターフェース |
| `src/engine/match/runner.ts` | API 拡張 | `stepOnePitch/stepOneAtBat` に `overrides?` 追加 |
| `src/engine/match/at-bat.ts` | 追加 | `processAtBat` に `overrides?` 追加 |
| `src/engine/match/pitch/process-pitch.ts` | 拡張 | `processPitch/getEffectiveBatterParams/getEffectivePitcherParams` に補正追加 |
| `src/engine/psyche/generator.ts` | 拡張 | `PitchMonologuesWithEffects`、`excludeIds`、ビルダー関数 |
| `src/engine/psyche/types.ts` | 変更なし | — |
| `src/engine/psyche/monologue-db.ts` | 変更なし | — |
| `src/engine/player/generate.ts` | 拡張 | 新特性10種の確率テーブル + コンフリクト |
| `src/stores/match-store.ts` | 拡張 | `recentMonologueIds`、overrides 伝搬、ignoreOrder 処理 |
| `tests/engine/psyche/phase7e.test.ts` | 新規 | Phase 7-E 専用テスト 26件 |

---

## 残存課題

現時点で既知の未実装事項はなし。

以下は将来のフェーズで対応可能な改善案:

1. **モノローグ効果の可視化**: 「ミート+8% 適用中」を投球ログに明示する UI 要素
2. **連続三振・連続ヒット時のモノローグ**: `consecutiveStrikeouts` / `consecutiveRetired` を PitchContext に実装
3. **捕手特性の追加**: 現状は投手と同軍として扱っているが、捕手独自の特性セットを持てるようにする
4. **モノローグ発生率チューニング**: 実際のプレイヤーフィードバックを得た上で weight 調整

---

*Generated by Phase 7-E implementation — 2026-04-20*
