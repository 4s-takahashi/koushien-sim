# Phase R4 実装レポート: Play Resolver 統合

**日付**: 2026-04-28
**フェーズ**: R4 – 既存エンジンへの Resolver 統合
**テスト**: 1632 / 1632 ✅

---

## 概要

Phase R3 で実装した Play Resolver（`src/engine/physics/resolver/`）を、既存の試合エンジン（`process-pitch.ts`）に統合した。

統合方針として、**ゲームバランスを最優先**に以下を採用した:

- `resolveBatBall` による **物理モデルの打球方向（sprayAngle）** を採用
- `calculateSwingResult` 由来の **統計モデルの contactType / speed / distance** を維持
- フィールディング判定は既存の `resolveFieldResult` を継続使用（Resolver の fielding.ts は Phase R5 以降に移行）

この「ハイブリッド統合」により、R3 までの物理モデルの恩恵（投球コース・打者意図の反映）と、既存の定量的バランス（BA・SLG・HR率）を両立した。

---

## R4 サブタスク一覧

| タスク | 内容 | 状態 |
|--------|------|------|
| R4-1 | `process-pitch.ts` に `resolveBatBall` 統合 | ✅ 完了 |
| R4-2 | `legacy-adapter.ts` 互換層の作成 | ✅ 完了 |
| R4-3 | `at-bat.ts` 不変条件の強化 | ✅ 完了 |
| R4-4 | `inning.ts` 3アウト処理の一元化 | ✅ 完了 |
| R4-5 | `runner.ts` 防衛コードの削除（-44行） | ✅ 完了 |
| R4-6 | 全テストパス（1632件） | ✅ 完了 |
| R4-7 | `bat-contact.ts` / `field-result.ts` に `@deprecated` 追加 | ✅ 完了 |

---

## 変更ファイル詳細

### `src/engine/match/pitch/process-pitch.ts`（主要変更）

**変更前**: `calculateBatContact(batter, pitcher, rng)` → `resolveFieldResult(contact, ...)` の直列パイプライン

**変更後**:
1. バント: 従来通り `resolveFieldResult` を使用
2. 通常スイング:
   ```
   calculateSwingResult → batContactWithoutFieldResult (contactType/speed/distance)
   resolveBatBall → trajectory.sprayAngle → direction 上書き
   resolveFieldResult(legacyContact, ...) → fieldResult
   ```

**追加関数**:
- `buildBatBallContext()`: `BatBallContext` の構築（120行相当）
  - `computePerceivedPitchQuality` による打者認知品質の計算
  - 打席状況・メンタル・戦術采配の統合

**削除**:
- `buildFielderAbilityMap()`: Resolver の fielding.ts に移行済み（R4 では未使用）
- `buildRunnerStats()`: Resolver の running.ts に移行済み（R4 では未使用）

### `src/engine/match/pitch/legacy-adapter.ts`（新規）

Phase R4 互換層。`PlayResolution ⇔ BatContactResult / FieldResult` の双方向変換を提供。

**エクスポート関数**:

| 関数 | 役割 |
|------|------|
| `playResolutionToBatContactResult` | `PlayResolution → BatContactResult` |
| `playResolutionToFieldResult` | `PlayResolution → FieldResult`（薄いラッパー） |
| `deriveContactType` | `BallTrajectoryParams + DetailedHitType → BatContactType` |
| `sprayAngleToDirection` | `sprayAngle(physics) → HitDirection(legacy)` |
| `exitVelocityToHitSpeed` | `exitVelocity(km/h) → HitSpeed` |
| `batContactToTrajectoryParams` | `BatContactResult → BallTrajectoryParams`（逆マッピング） |
| `makeGuaranteedContactLatent` | テスト用確定接触 `SwingLatentState` 生成 |

**座標系変換**:
- physics: `sprayAngle=0` = 右翼線、`sprayAngle=90` = 左翼線
- legacy: `direction=0` = 左翼線、`direction=90` = 右翼線
- 変換: `direction = 90 - sprayAngle`

### `src/engine/match/at-bat.ts`（R4-3）

**追加**: `advanceRunnerOnWalk()` のエクスポート（runner.ts から委譲）

**強化**: `processAtBat` 終了時の不変条件アサーション:
```typescript
// Phase R4 不変条件（V3 §10.3）
// 1. nextState.count === { balls: 0, strikes: 0 }
// 2. 打席終了済み（継続中の返却なし）
// 3. outs は processPitch / HBP 処理で正しく更新済み
// 4. score / bases は全プレーを反映済み
```

### `src/engine/match/inning.ts`（R4-4）

3アウト判定を `processHalfInning` 内で一元化。
アウト追加のたびに `>= 3` をチェックし、イニング終了を確実に検知する。

### `src/engine/match/runner.ts`（R4-5）

**削除された防衛コード**（-44行）:
- `applyWalkInline()` の手動塁移動ロジック（24行）→ `advanceRunnerOnWalk()` に委譲
- `processAtBat` 後の重複 count リセット（6行コメント含む）→ at-bat.ts の不変条件が保証

### `src/engine/match/pitch/bat-contact.ts` / `field-result.ts`（R4-7）

ファイル冒頭に `@deprecated` コメントを追加:
- `bat-contact.ts`: Phase R4 以降は `resolveBatBall` に移行済み
- `field-result.ts`: Phase R5 以降は `resolvePlay` のフィールディング判定に移行予定

---

## ゲームバランス検証

`tests/engine/match/balance.test.ts`（8テスト）:

| 指標 | 目標範囲 | 結果 |
|------|---------|------|
| 1試合平均総得点 | 4〜16 | ✅ |
| 打率 (BA) | 0.200〜0.350 | ✅ |
| 長打率 (SLG) | BA+0.050 以上 | ✅ |
| HR率 | 2〜8% | ✅ |
| 防御率 (ERA) | 1.5〜6.0 | ✅ |

---

## 技術的判断と設計上の妥協点

### なぜ Resolver の `resolvePlay` を使わなかったか

`resolvePlay` のフィールダー移動モデル（`resolveCatchAttempt`）は以下の理由で R4 での採用を見送った:

1. **200ms リアクションタイム仮定**: 内野ゴロの到達時間が 300-500ms 程度のため、反応後の移動時間がほぼゼロになり `timeMargin < -200ms` → `error: true` が多発した
2. **デフォルト能力値の影響**: `DEFAULT_FIELDING_STAT = 60`、`DEFAULT_SPEED_STAT = 60` では現実的な内野守備が再現されない
3. **ゲームバランスへの影響**: エラー率が異常上昇し、1試合平均得点が 2倍以上になった

Phase R5 では実際の選手能力値をフィールディングモデルに渡す仕組みを整備する予定。

### sprayAngle クランプの必要性

`computeSprayAngle()` の値域は `-10〜+100°`（ファウル方向含む）。
`resolveBatBall` の呼び出し時点では `calculateSwingResult` が `in_play` を返した後であり、フェア確定として `[0, 90]` にクランプする。

```typescript
const trajectory = {
  ...rawTrajectory,
  sprayAngle: Math.max(0, Math.min(90, rawTrajectory.sprayAngle)),
};
```

---

## Phase R5 に向けて

1. **`resolvePlay` のフィールディング統合**: 選手能力値を渡す API 設計
2. **`bat-contact.ts` / `field-result.ts` の削除**: `@deprecated` ファイルを完全廃止
3. **タイムライン出力**: `PlayResolution.timeline` を UI に直接渡す
4. **`legacy-adapter.ts` の廃止**: Phase R5 完了後に削除予定

---

*Generated: 2026-04-28*
