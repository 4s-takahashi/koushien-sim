# Phase 11-A3 実装レポート: 選手モチベーションシステム

**日付:** 2026-04-19
**バージョン:** v0.18.2
**コミット:** 58d3dbd

---

## 概要

Phase 11-A3「選手モチベーションシステム」を実装した。
選手ごとに 0-100 のモチベーション値を持ち、
試合出場・ベンチ・休養・ライバル数・疲労によって毎日変動する。
モチベーションは試合パフォーマンス（±10%）および練習効率（±20%）に影響する。

---

## 変更ファイル一覧

### 新規作成
| ファイル | 内容 |
|---|---|
| `src/engine/growth/motivation.ts` | モチベーション計算モジュール |
| `tests/engine/growth/motivation.test.ts` | モチベーション単体テスト 27件 |

### 修正
| ファイル | 変更内容 |
|---|---|
| `src/engine/types/player.ts` | `motivation?: number` フィールド追加 |
| `src/engine/world/person-state.ts` | `PersonState.motivation?: number` 追加 |
| `src/engine/world/hydrate.ts` | `hydratePlayer` / `dehydratePlayer` / `convertToHighSchoolPlayer` でデフォルト50を設定 |
| `src/engine/calendar/day-processor.ts` | `processDay` に `applyDailyMotivation` 呼び出し追加 (Phase 4.5) |
| `src/engine/match/result.ts` | `applyMatchToPlayers` に `applyMatchMotivation` 呼び出し追加 |
| `src/engine/match/pitch/process-pitch.ts` | `getEffectiveBatterParams` にモチベーション補正（±10%）追加 |
| `src/engine/growth/calculate.ts` | `applyDailyGrowth` に `getPracticeEfficiencyMultiplier` 適用（±20%） |
| `src/ui/projectors/view-state-types.ts` | `PlayerRowView.motivation`、`PlayerDetailViewState.motivation/motivationLabel` 追加 |
| `src/ui/projectors/teamProjector.ts` | `playerRows` に `motivation` を追加 |
| `src/ui/projectors/playerProjector.ts` | `projectPlayer` に `motivation/motivationLabel` を追加 |
| `src/app/play/team/page.tsx` | 「やる気」列を選手一覧に追加 (🔥/😢 アイコン) |
| `src/app/play/team/[playerId]/page.tsx` | モチベーションバーを選手詳細画面のコンディションセクションに追加 |
| `src/version.ts` | v0.18.2 / CHANGELOG 追加 |

---

## 実装詳細

### モチベーション計算ロジック

```
日次変化量:
  試合日・非出場（ベンチ）: -2
  休養日: +3
  同ポジション3人以上: -1
  疲労80以上: -3

試合後ボーナス (applyMatchToPlayers から呼び出し):
  出場: +5
  ホームラン: +3 追加
  好投（6回以上 & 自責2以下）: +5 追加

範囲: 0-100 にクランプ
```

### 試合パフォーマンス影響
`getEffectiveBatterParams` 内で contact・power に乗算:
- motivation ≥ 70: ×1.10 (+10%)
- motivation ≤ 30: ×0.90 (-10%)
- それ以外: ×1.00

### 練習効率影響
`applyDailyGrowth` の seasonMultiplier に乗算:
- motivation ≥ 70: ×1.20 (+20%)
- motivation ≤ 30: ×0.80 (-20%)
- それ以外: ×1.00

### 後方互換性
- `motivation` フィールドは `optional` であり、未定義の場合は `getMotivation()` が 50 を返す
- 既存セーブデータの読み込み時、`hydratePlayer` が `state.motivation ?? 50` を設定
- `PersonState.motivation` に永続化済み

---

## テスト結果

```
tests/engine/growth/motivation.test.ts
  ✓ getMotivation (2)
  ✓ calcDailyMotivationDelta (6)
  ✓ calcMatchMotivationBonus (4)
  ✓ applyMotivationDelta (4)
  ✓ applyDailyMotivation (3)
  ✓ applyMatchMotivation (2)
  ✓ getMatchPerformanceMultiplier (3)
  ✓ getPracticeEfficiencyMultiplier (3)

  Tests: 27 passed
```

全体テスト結果:
```
Test Files: 75 passed, 1 failed (cloud-save.test.ts — 既存の server-only エラー、A3 と無関係)
Tests: 826 passed
```

---

## UI変更

### チーム画面 `/play/team`
- 選手一覧に「やる気」列を追加
- motivation ≥70: 🔥 + オレンジ色の数値
- motivation ≤30: 😢 + 青色の数値
- hover で数値を tooltip 表示

### 選手詳細画面 `/play/team/[playerId]`
- コンディションセクションに「やる気」バーを追加
- バーの色: 高モチベ=オレンジ、低モチベ=青、普通=accent
- ラベル: 🔥 ハイモチベ / 普通 / 低め / 😢 やる気なし

---

## デプロイ

- URL: https://kokoyakyu-days.jp/
- バージョン: v0.18.2 (2026-04-19 17:24 UTC)
- HTTP確認: 307 → デプロイ成功
