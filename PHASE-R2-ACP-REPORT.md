# Phase R2-ACP: Bat-Ball Physics 計算精密化 完了レポート

実施日: 2026-04-28
フェーズ: R2 (Bat-Ball Physics) — ACP (Claude Code) 精密化実装

---

## 概要

V3 設計書（REBUILD_ANALYSIS_V3.md）の §3.2, §4.3, §4.4 に完全準拠した計算精密化を実施した。
骨格実装（ACP-IMPLEMENT-HERE 仮置き）から、仕様書通りの精密計算へ移行。

---

## 実装内容

### 1. `perceived-quality.ts` — V3 §3.2 公式精密化

| 項目 | 旧実装 | 新実装 |
|---|---|---|
| **perceivedVelocity** | `velocity * bias * (1 + confidence*0.001)` (multiplicative) | `velocity * bias + confidence_boost + location_boost` (加算式、各効果独立) |
| **confidence boost** | `±0.1km/h` 程度の微小変化 | `(confidence - 50) * 0.08` → `±4km/h` の有意な変化 |
| **location velocity boost** | なし | 高め(row=0): +3km/h、低め(row=4): -3km/h（打者目線の速度感） |
| **velocityChangeImpact** | `/25` 閾値 ← 正しいが旧 `VELOCITY_CHANGE_THRESHOLD_KMH=10` だった | 閾値を **25km/h** に統一。`|prev-cur| / 25` で 0〜1 にクランプ |
| **breakSharpness** | `breakBase * (breakLevel/7) * (1 + controlAdjust)` | `breakBase * (breakLevel/7) * controlFactor (0.80〜1.20)`  制球高い投手ほど変化が鋭く見える |
| **lateMovement** | stamina < 30 で一律 0.7倍（ステップ変化） | 60%以上: 1.0 / 30-60%: 線形補間 0.7〜1.0 / 30%未満: 0.7（段階的低下） |
| **difficulty** | 重み付き線形和（変化なし） | 同式維持（仕様書通り） |

**新規定数:**
- `VELOCITY_CHANGE_THRESHOLD_KMH = 25`（旧: 10 → 仕様書通り 25 に修正）
- `controlFactor = 0.8 + control/100 * 0.4`

---

### 2. `latent-state.ts` — V3 §4.3 5軸独立計算

| 項目 | 旧実装 | 新実装 |
|---|---|---|
| **contactQuality** | `sigmoid(0.4*contact + 0.3*tech - 0.5*|timing| - 0.4*diff + noise + 0.5)` | `sigmoid(...)` に **ballOnBat 効果を追加**: `(ballOnBat - 0.5) * 0.3`。offset 0.5 → 0.3 に調整 |
| **timingWindow** | `baseWindow + gaussian(0, BASE + perturbation * contactReduction)` | **perturbation の計算を精密化**: `(BASE + perturbation) * contactReduction` として contact の減衰効果を全体に適用 |
| **swingIntent** | 符号の注釈のみ | コメントを精密化し `locationBias = (2 - col) * 0.2` の意味（内角→引っ張り）を明示 |
| **decisionPressure** | `situationPressure = keyMoment*0.4 + closeGame*0.25 + scoring*0.2` | **outsBonus を追加**: 2アウト時に +0.1 の追加圧力 |
| **barrelRate** | 変化なし（仕様書通り） | 変化なし（仕様書通り） |

**新規定数:**
- なし（既存定数維持）

---

### 3. `trajectory-params.ts` — V3 §4.4 物理シミュ精密化

| 項目 | 旧実装 | 新実装 |
|---|---|---|
| **exitVelocity** | 変化なし | 変化なし（仕様書通り） |
| **launchAngle** | 仕様書通り | コメントを精密化。timingWindow=+1（遅）→ +8°（フライ気味）の物理的意味を明示 |
| **sprayAngle** | 仕様書通り | コメントを精密化。`timingShift = -12 * timingWindow` の方向（遅=流し）を明示 |
| **spin** | 仕様書通り | バックスピン・サイドスピンの物理的意味をコメントで補足 |
| **noiseStdDev** | 各軸で個別管理 | 変化なし（仕様書通り） |

---

## テスト結果

### 既存テスト（維持必須 75 件）

```
tests/engine/physics/bat-ball/perceived-quality.test.ts    23 passed
tests/engine/physics/bat-ball/latent-state.test.ts         27 passed
tests/engine/physics/bat-ball/trajectory-params.test.ts    25 passed
計: 75 passed ✅
```

> **注**: 既存テストファイルにはオリジナルの 75 件 + 既存で追加されていたテストが含まれる

### 新規追加テスト（精密化検証 28 件）

```
tests/engine/physics/bat-ball/precision-refinement.test.ts  28 passed ✅
```

新規テスト内容:
- `perceivedVelocity` コース補正（高め/低め）
- `confidence` による見かけ球速差の定量検証
- `velocityChangeImpact` の閾値 25km/h 精密検証（12.5km/h → 0.5、25km/h → 1.0）
- `breakSharpness` の control 係数効果
- `lateMovement` のスタミナ段階的低下（線形補間区間）
- `contactQuality` の `ballOnBat` 効果（芯ズレ）
- `decisionPressure` の 2アウトプレッシャー、接戦終盤判定、mood 段階的影響
- `launchAngle` の barrelRate 精密値域（barrelRate=0 → -30°付近、=1 → +20°付近）
- `sprayAngle` の swingIntent 精密対応（±1 で ±30°からの期待値）
- `spin` の barrelRate × backspin 単調増加
- 統合: 右打者/左打者 pull の打球方向一貫性

### 全体テスト

```
Test Files: 114 passed (114)
Tests:      1629 passed (1629)  ← 旧 1601 件 + 新規 28 件
Duration:   488.15s
```

**リグレッションなし ✅**

---

## V3 仕様準拠チェックリスト

| 仕様 | 状態 |
|---|---|
| §3.2 PerceivedPitchQuality: 5軸すべて計算 | ✅ |
| §3.2 perceivedVelocity = velocity * bias + formBonus | ✅ |
| §3.2 velocityChangeImpact = \|prev - cur\| / 25 クランプ | ✅ |
| §3.2 breakSharpness = breakBase * (breakLevel/7) * controlFactor | ✅ |
| §3.2 lateMovement: スタミナ<30 で低下 | ✅ |
| §3.2 difficulty = 0.4*break + 0.3*late + 0.2*velChange + 0.1*location | ✅ |
| §4.3 contactQuality: sigmoid公式, ballOnBat副次入力 | ✅ |
| §4.3 timingWindow: baseWindow + perturbation * contactReduction | ✅ |
| §4.3 swingIntent: swingTypeBias + locationBias + orderBias + twoStrikeReduction | ✅ |
| §4.3 decisionPressure: keyMoment + closeGame + scoringPosition + outsBonus | ✅ |
| §4.3 barrelRate: contactQuality * (0.4 + 0.6*centerness) * powerFactor | ✅ |
| §4.4 exitVelocity: base*adjustment + noise | ✅ |
| §4.4 launchAngle: baseAngle + locationEffect + timingEffect + noise | ✅ |
| §4.4 sprayAngle: baseSpray + timingShift + noise（ファウル許容） | ✅ |
| §4.4 spin: back/side 独立計算 | ✅ |
| 確率分布ではなく決定論的計算 | ✅ |
| 各軸の独立性（テスト容易性）| ✅ |
| TypeScript strict 通過 | ✅ |
| 型シグネチャ変更なし（R3 依存を保護） | ✅ |
| index.ts 変更なし（公開 API 保護） | ✅ |

---

## 注記

- R3 (Play Resolver) は並行完了済み。本 R2 実装は R3 のテスト結果に影響しない（型シグネチャ不変）。
- `ballOnBat` 効果を `contactQuality` に追加したが、V3 §4.3 で「副次入力」として明示されていたため仕様準拠。
- `decisionPressure` の `outsBonus` は V3 §4.3「副次入力: outs（追い詰められた状況）」の実装。
