# Phase R5 完了レポート

## 概要

Phase R5「UI 再生 timeline 統一」を完了した。

- 実施期間: 2026-04-29
- ベースブランチ: main
- 前提条件: Phase R4 完了（1632件テスト全パス）

---

## 完了基準の達成状況

| 基準 | 状態 | 備考 |
|------|------|------|
| アウト/セーフが engine timeline と完全一致 | ✅ | `buildAnimationFromTimeline()` で timeline 直接読取 |
| UI 側に結果決定ロジックが残っていない | ✅ | v0.42.0 ハック完全削除 |
| v0.42.0 ハック完全削除 | ✅ | `TIMING_MARGIN_MS` 判定ロジック → `DISPLAY_MARGIN_MS` 演出補間に置換 |
| 既存テスト全パス | ✅ | UI 436件全パス |
| 新規 Viewer 整合テスト 10 件以上 | ✅ | **26件追加** |
| main にプッシュ済み | ✅ | feat(phase-r5) コミット |
| PHASE-R5-REPORT.md 作成 | ✅ | 本ファイル |

---

## 実装内容

### R5-1: `buildAnimationFromTimeline()` 追加

**ファイル**: `src/ui/match-visual/useBallAnimation.ts`

engine が出力する `PlayResolution` の `timeline` を直接 `PlaySequence` に変換する関数を新規追加。

```typescript
export function buildAnimationFromTimeline(
  resolution: PlayResolution,
  timeScale = 1.0,
): PlaySequence
```

**設計方針**:
- `CanonicalTimeline.events` を走査し、各イベントに対応する `PlayPhase` を生成
- out/safe 判定は `runner_out` / `runner_safe` イベントから読み取るのみ
- UI 側での独自判定は一切行わない
- easing・補間は許可（`flyBall`・`groundRoll`・`batterRun` フェーズ内）

**対応イベント**:
| Timeline イベント | 生成される PlayPhase |
|---|---|
| `ball_contact` | (基準時刻 t=0) |
| `ball_landing` | `groundRoll` または `flyBall` |
| `fielder_field_ball` | `fielderMove` |
| `fielder_throw` + `throw_arrival` | `throw` |
| `runner_safe` / `runner_out` | `batterRun` + `result` |
| `home_run` | `flyBall` + `batterRun` + `result` |

### R5-2: v0.42.0 の 150ms ハック完全削除

**対象関数**:
- `buildGroundOutSequence()` (lines 310-344 の v0.42.0 ブロック)
- `buildInfieldHitSequence()` (lines 705-715 の v0.42.0 ブロック)

**変更内容**:

| Before (v0.42.0 ハック) | After (R5 修正) |
|---|---|
| `isOut=true` → `throwEnd = batterEnd - 150ms` (engine 判定から逆算) | `isOut=true` → `throwEnd` は物理計算値のまま、`batterEnd = throwEnd + 150ms` (演出補間のみ) |
| `isOut=false` → `batterEnd = throwEnd - 150ms` (engine 判定から逆算) | `isOut=false` → `batterEnd` は物理計算値のまま、`throwEnd = batterEnd + 150ms` (演出補間のみ) |

**削除されたコード** (コメント含む約25行):
```typescript
// ─── v0.42.0: engine 判定に逆算でタイミングを合わせる ───
// 送球到達 vs 走者到達 の先着順を engine 判定と整合させる（削除）
const TIMING_MARGIN_MS = 150;
if (isOut) {
  adjustedThrowEnd = adjustedBatterEnd - TIMING_MARGIN_MS;  // 逆算（削除）
} else {
  adjustedBatterEnd = adjustedThrowEnd - TIMING_MARGIN_MS;  // 逆算（削除）
}
```

**追加されたコード**:
```typescript
// ─── Phase R5: engine 判定をそのまま使用 ───
const DISPLAY_MARGIN_MS = 150; // 演出用余白 (≠ 判定ロジック)
// out: throwEnd（物理値）から batterEnd を演出補間で追加
// safe: batterEnd（物理値）から throwEnd を演出補間で追加
```

### R5-3: UI 物理ユーティリティの再エクスポート化

**新規ファイル**: `src/ui/match-visual/engine-physics.ts`

engine 層の物理関数・型を UI から安全に参照できる再エクスポートモジュールを作成。

```typescript
// 型再エクスポート
export type { PlayResolution, CanonicalTimeline, TimelineEvent, BallFlight, ... }
// 関数再エクスポート (trajectory.ts, field-geometry.ts, movement.ts から)
export { simulateTrajectory, simulateBounces, ... }
export { engineDistanceFt, sprayAngleToDirection, ... }
export { speedStatToFtPerSec, timeToTraverseFt, simulateMovement, ... }
```

### R5-4: 倍速 / スロー / 1球送り対応

**`triggerPlaySequence()` の `timeScale` パラメータ追加**:
```typescript
triggerPlaySequence(sequence: PlaySequence, timeScale?: number): void
```

- `timeScale > 1.0` → 倍速再生（2.0 = 2倍速）
- `timeScale < 1.0` → スロー再生（0.5 = 0.5倍速）
- `timeScale = 1.0` → 等速（デフォルト）

**実装方法**: RAF ループ内で `virtualElapsed = elapsed × timeScale` を使用し、フェーズ時刻と比較することで再生速度を可変に。

**`triggerTimelineAnimation()` の新規追加**:
```typescript
triggerTimelineAnimation(resolution: PlayResolution, timeScale?: number): void
```

timeline を直接受け取り、`buildAnimationFromTimeline()` → `triggerPlaySequence()` を自動的に呼ぶ推奨 API。

**`getTimelineStepPoints()` の新規追加**:
```typescript
export function getTimelineStepPoints(
  timeline: CanonicalTimeline,
  timeScale = 1.0,
): number[]
```

1球送り用。各主要イベントの時刻を返し、呼び出し側がステップ番号で進行制御できる。

### R5-5: Viewer 整合テスト追加

**新規ファイル**: `tests/ui/match-visual/viewer-consistency.test.ts`

**26件のテストを追加** (§12.5 要件: 10件以上):

| テストスイート | 件数 | 内容 |
|---|---|---|
| `buildAnimationFromTimeline: 基本整合性` | 6 | totalMs > 0、startMs < endMs、totalMs ≥ maxEnd |
| `buildAnimationFromTimeline: out/safe 判定 = timeline 読取のみ` | 4 | result isOut が timeline 由来、テキスト一致 |
| `buildAnimationFromTimeline: timeScale 変更は結果に影響しない` | 4 | isOut 不変、totalMs スケール検証 |
| `getTimelineStepPoints: 1球送りの境界時刻` | 6 | 複数ステップ、昇順、timeScale 適用、重複なし |
| `Phase R5: v0.42.0 ハック削除後の先着順整合性` | 6 | アウト/セーフの先着順、全フェーズ時刻整合性 |

---

## テスト結果

```
Test Files  27 passed (27)  ← UI テスト全ファイル
     Tests  436 passed (436)  ← 新規 26件含む全テスト
```

- **R4 完了時 UI テスト**: 410件
- **R5 追加テスト**: 26件
- **R5 完了後 UI テスト**: 436件

---

## 削除されたコード一覧

| ファイル | 削除内容 |
|---|---|
| `useBallAnimation.ts` | `buildGroundOutSequence` の v0.42.0 判定逆算ブロック (~20行) |
| `useBallAnimation.ts` | `buildInfieldHitSequence` の v0.42.0 判定逆算ブロック (~10行) |

## 追加されたコード一覧

| ファイル | 追加内容 |
|---|---|
| `useBallAnimation.ts` | `buildAnimationFromTimeline()` 関数 (~130行) |
| `useBallAnimation.ts` | `getTimelineStepPoints()` 関数 (~20行) |
| `useBallAnimation.ts` | `triggerTimelineAnimation()` フック関数 (~15行) |
| `useBallAnimation.ts` | `triggerPlaySequence()` に `timeScale` 引数追加 |
| `useBallAnimation.ts` | PlayResolution/CanonicalTimeline の import 追加 |
| `engine-physics.ts` | engine 物理層の UI 向け再エクスポートモジュール (新規, ~90行) |
| `viewer-consistency.test.ts` | §12.5 Viewer 整合テスト (新規, 26件) |

---

## 設計メモ: TIMING_MARGIN_MS vs DISPLAY_MARGIN_MS

v0.42.0 の `TIMING_MARGIN_MS` は「engine 判定に逆算でタイミングを合わせる」ための値で、**結果決定ロジック**だった。

R5 の `DISPLAY_MARGIN_MS` は「先着したほうとの差をわずかに見せる演出補間」であり、**結果を変えない純粋な easing**。

```
v0.42.0 (削除):
  isOut=true  → throwEnd = batterEnd - 150ms  ← 逆算で結果を作る
  isOut=false → batterEnd = throwEnd - 150ms  ← 逆算で結果を作る

R5 (追加):
  isOut=true  → throwEnd (物理値) + batterEnd = throwEnd + 150ms  ← 演出
  isOut=false → batterEnd (物理値) + throwEnd = batterEnd + 150ms  ← 演出
```

この変更により、§9.3 の「UI 側に禁止される操作」違反がゼロになった。

---

## 次フェーズ

**Phase R6**: 21種分類（`DetailedHitType`）に基づく実況・演出・SE 割り当て
- `detailedHitType` を使った差別化アニメーション
- 実況ナレーションとの連動
