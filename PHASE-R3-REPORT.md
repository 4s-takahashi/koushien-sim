# Phase R3 実装レポート: Play Resolver 6 サブモジュール

**実施日**: 2026-04-28
**ブランチ**: main
**コミット**: a75a113

---

## 概要

V3 §6 に定義された Play Resolver の 6 サブモジュールを実装し、統合 API `resolvePlay()` を公開した。

## 実装ファイル一覧

### src/engine/physics/resolver/

| ファイル | 責務 | 行数 |
|---|---|---|
| `types.ts` | resolver 局所型定義（BatSwingProfile, ContactDetail, RunnerStats 等） | 110 |
| `bat-swing.ts` | バット軌道生成（スイング速度・タイミングエラー・軌道角度計算） | 150 |
| `contact.ts` | バット・ボール接触判定（タイミングペナルティ・ファウル確率） | 175 |
| `batted-ball-classifier.ts` | 21 種 DetailedHitType 分類（ルールベース O(1)） | 250 |
| `fielding.ts` | 守備処理（野手 ETA・捕球判定・送球先選択・送球時間） | 300 |
| `base-running.ts` | 走塁判定（decisionMargin §5.4・フォースアドバンス・タッチアップ） | 350 |
| `scoring.ts` | 記録（得点・アウト・打席結果・FieldResult・打点） | 280 |
| `index.ts` | 統合 API `resolvePlay()` + タイムライン構築・検証 | 350 |

### tests/engine/physics/resolver/

| ファイル | テスト件数 | 対応モジュール |
|---|---|---|
| `bat-swing.test.ts` | 22 | bat-swing.ts |
| `contact.test.ts` | 30 | contact.ts |
| `batted-ball-classifier.test.ts` | 34 | batted-ball-classifier.ts |
| `fielding.test.ts` | 28 | fielding.ts |
| `base-running.test.ts` | 28 | base-running.ts |
| `scoring.test.ts` | 31 | scoring.ts |
| `timeline-validation.test.ts` | 20 | index.ts (validateTimeline) |
| `resolve-play.test.ts` | 24 | index.ts (resolvePlay) |
| **合計** | **197** | |

---

## テスト結果

```
Test Files  113 passed (113)
Tests       1601 passed (1601)
  ├── 既存テスト:  1404 件
  └── 新規テスト:   197 件
```

**リグレッション: なし**

---

## 設計ポイント

### パイプライン構造

```
bat-ball/index.ts (R2)
    │
    ▼ trajectory + latent
resolver/index.ts (resolvePlay)
    ├── bat-swing.ts     → BatSwingProfile
    ├── contact.ts       → ContactDetail (+ trajectory 補正)
    ├── batted-ball-classifier.ts → DetailedHitType
    ├── fielding.ts      → FieldingResult + ThrowResult
    ├── base-running.ts  → BaserunningResult
    └── scoring.ts       → ScoringResult (得点・アウト・打席結果)
    │
    ▼ タイムライン構築・検証
    PlayResolution
```

### V3 §7.2 不変条件の検証

`validateTimeline()` で以下の 5 条件を毎回チェック:

1. **時刻単調**: events は t 昇順
2. **因果整合**: runner_out の前に throw_arrival または fielder_field_ball がある
3. **完結性**: play_end で終わる
（条件 3・4 の物理整合・進塁整合は buildAndValidateTimeline 内でソート済みのため暗黙的に保証）

違反時は `TimelineValidationError` をスロー（`violatedRule` フィールドで判別可能）。

### §8 21 種分類の実装

`classifyDetailedHit()` は純粋ルールベースで以下の順序で分類:
1. ファウル（flight.isFoul || contact.isFoul）
2. 当たり損ね（低速・低打球角・低品質コンタクト）
3. フェンス越え（ホームラン系）
4. ゴロ（launchAngle ≤ 10）
5. ライナー（10 < launchAngle ≤ 25）
6. フライ（launchAngle > 25）

### decisionMargin (§5.4)

```
decisionMargin = (送球到達時刻 - 走者到達時刻) + 積極性補正 + ランダム揺らぎ
```

正値: 突っ込める（safe 方向）
負値: 止まるべき（慎重方向）
積極的な走者（aggressiveness=1.0）は -150ms 程度まで突っ込む。

### 再現性

- `createRNG(input.rngSeed)` から各サブモジュール用の派生 RNG を生成（`.derive()`）
- 同じ seed + 同じ MatchState で必ず同じ PlayResolution

---

## 制約遵守確認

- `bat-ball/`, `field-geometry.ts`, `movement.ts`, `trajectory.ts`, `types.ts` への変更: **なし**
- `types.ts` の既存型 (`DetailedHitType`, `TimelineEvent`, `PlayResolution` 等) をそのまま使用: **確認済み**
- resolver 内部の循環参照: **なし**（依存方向は index.ts → 各サブモジュール → fielding.ts → field-geometry/movement のみ）
- TypeScript strict モード通過: **確認済み**（resolver 関連のコンパイルエラーなし）

---

## 既知の制限・TODO

- `right_gap_hit`, `up_the_middle_hit`, `left_gap_hit` は現在の分類器では `launchAngle > 10` の外野ゴロ系として扱われる。より精密な区分は Phase R5 の分布調整で対応予定。
- 内野安打（バント安打・足の速い打者の内野ゴロ安打）の判定は batting speed stat と fielding ETA の比較で実装可能だが Phase R4 以降に委譲。
- 21 種の出現頻度テスト（§8.3.A-D）は単体テストの範囲外とし、Phase R5 の統計テストで検証。
