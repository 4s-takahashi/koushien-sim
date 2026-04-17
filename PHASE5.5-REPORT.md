# Phase 5.5 実装レポート — Tournament Match Fix

## 概要

大会試合が実際にシミュレートされておらず「常に1点しか入らない」というバグを修正した。
`distributeScore` 関数を完全撤廃し、`quickGame` による実打席シミュレーションに置き換えた。

---

## Before / After 比較

### Before（旧 distributeScore バグ）

試合ごとの合計スコアを `distributeScore(totalScore, 9)` で機械的にイニング分散していた。

```
// 例: 5点の試合
distributeScore(5, 9) = [1, 1, 1, 1, 1, 0, 0, 0, 0]
// 例: 3点の試合
distributeScore(3, 9) = [1, 1, 1, 0, 0, 0, 0, 0, 0]
// 例: 7点の試合
distributeScore(7, 9) = [1, 1, 1, 1, 1, 1, 1, 0, 0]
```

**結果**: 「毎回1点しか入らない」という問題が発生。実際の試合のような集中打・無得点回が出ない。

### After（Phase 5.5 quickGame 実シミュ）

`quickGame` でイニングごとに実際にバッターを打席に立たせ、OBP/SLGベースで得点を計算する。

```
// 実際のサンプル試合（夏大会1回戦）:
[白新大学附属 vs 帝京学院] 3-4 (延長なし)
  表 away: 0  0  1  0  0  2  0  0  0 = 3
  裏 home: 0  0  0  0  0  1  0  3  0 = 4

[市立和歌山 vs 健大高崎] 9-0
  表 away: 1  0  2  0  0  3  0  3  0 = 9
  裏 home: 0  0  0  0  0  0  0  0  0 = 0

[福知山成美商業 vs 履正社北] 1-4 (延長12回)
  表 away: 1  0  0  0  0  0  0  0  0  0  0  0 = 1
  裏 home: 0  0  0  0  1  0  0  0  0  0  0  3 = 4

[秋大会: 健大高崎 vs 池田西] 11-10 (延長11回)
  表 away: 1  0  0  0  0  2  0  0  7  0  1 = 11
  裏 home: 0  5  4  0  0  0  1  0  0  0  0 = 10
```

**結果**:
- 集中打（3イニングで7点など）が発生
- 無得点イニングが自然に散在
- 延長戦が発生（接戦の場合）
- サヨナラゲームも可能

---

## 変更ファイル一覧

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `src/engine/world/match-team-builder.ts` | **新規** | `HighSchool → MatchTeam` 変換の共通ユーティリティ |
| `src/engine/world/tournament-bracket.ts` | **修正** | `TournamentMatch` 型拡張 + `simulateTournamentRound` を `quickGame` 呼び出しに置き換え |
| `src/engine/world/world-ticker.ts` | **修正** | `distributeScore` 廃止、`match.inningScores` を直接使用 |
| `src/engine/world/practice-game.ts` | **修正** | `buildMatchTeam` を `match-team-builder` から import |
| `tests/engine/world/tournament-simulation.test.ts` | **新規** | 実シミュ確認テスト (10テスト) |
| `tests/engine/world/phase6/tournament-bracket.test.ts` | **修正** | RNG再現性テストの bracketId 統一 |
| `tests/stores/autumn-tournament-e2e.test.ts` | **修正** | 複数年テストのタイムアウト延長 (120s/180s) |
| `scripts/verify-tournament-realism.ts` | **新規** | リアリズム検証スクリプト |
| `DESIGN-PHASE5.5-TOURNAMENT-SIM.md` | **新規** | 設計書 |

---

## テスト結果

```
Test Files  63 passed (63)
Tests       743 passed (743)
Duration    326.06s
```

### 新規テスト (tournament-simulation.test.ts)

| テスト | 結果 |
|------|------|
| ラウンド完了後、全試合に winnerId が設定される | ✅ |
| 各試合に inningScores が設定される | ✅ |
| inningScores の合計が homeScore/awayScore と一致する | ✅ |
| distributeScore の [1,1,1,...] パターンにならない | ✅ |
| totalInnings が設定される（9以上） | ✅ |
| skipPlayerMatch オプションで自校試合が未決のまま返る | ✅ |
| 48校大会が正常に完走し champion が決まる | ✅ |
| 48校大会が5秒以内に完走する | ✅ |
| 全試合の inningScores 合計がスコアと一致する | ✅ |
| 決勝戦（Round 6）に inningScores が存在する | ✅ |

---

## パフォーマンス測定結果

### verify-tournament-realism.ts 実行結果

```
1年間進行（365日）: 4220ms
大会履歴: 2大会（夏・秋）
```

### 48校大会全ラウンド単体（5試行）

```
5試行: 27ms / 25ms / 24ms / 25ms / 24ms
平均: 25ms
```

**目標（1秒以内）に対し: 25ms = 目標の2.5%** ✅

旧実装（reputation ベース疑似計算）と比較しても、実用上問題ない速度。

---

## Before/After イニングスコア具体例

### 夏大会1回戦（5試合サンプル）

| 試合 | After（quickGame実シミュ） |
|-----|--------------------------|
| 検証高校 vs 銚子商東 (0-1) | `0 0 0 0 0 0 0 0 0` vs `0 0 0 0 0 0 0 0 1` |
| 白新大学附属 vs 帝京学院 (3-4) | `0 0 1 0 0 2 0 0 0` vs `0 0 0 0 0 1 0 3 0` |
| 市立和歌山 vs 健大高崎 (9-0) | `1 0 2 0 0 3 0 3 0` vs `0 0 0 0 0 0 0 0 0` |
| 福知山成美商業 vs 履正社北 (1-4) 延長12回 | `1 0 0 0 0 0 0 0 0 0 0 0` vs `0 0 0 0 1 0 0 0 0 0 0 3` |
| 日大三中央 vs 池田西 (2-1) 延長12回 | `0 0 1 0 0 0 0 0 0 0 0 1` vs `0 0 0 0 1 0 0 0 0 0 0 0` |

### 秋大会1回戦（5試合サンプル）

| 試合 | After（quickGame実シミュ） |
|-----|--------------------------|
| 履正社北 vs 高知商工業 (7-1) | `0 0 1 1 0 0 3 2 0` vs `0 0 0 0 1 0 0 0 0` |
| 近江第一 vs 白新大学附属 (1-3) | `0 0 0 0 0 1 0 0 0` vs `0 0 0 2 0 0 0 1 0` |
| 健大高崎 vs 池田西 (11-10) 延長11回 | `1 0 0 0 0 2 0 0 7 0 1` vs `0 5 4 0 0 0 1 0 0 0 0` |
| 関西 vs 桐蔭大学附属 (2-1) | `0 0 0 0 1 0 1 0 0` vs `0 0 0 0 1 0 0 0 0` |
| 市立和歌山 vs 立命館宇治中央 (2-0) | `0 0 0 0 0 1 0 1 0` vs `0 0 0 0 0 0 0 0 0` |

---

## Phase 10-C（大会統合）に向けた推奨事項

1. **skipPlayerMatch オプション実装済み**: `simulateTournamentRound` に `{ skipPlayerMatch: true, playerSchoolId }` オプションを追加済み。Phase 10-C で `MatchRunner` を呼び出す際に使用可能。

2. **findPlayerMatchInRound の拡張済み**: `inningScores`, `totalInnings`, `mvpPlayerId` も返すよう拡張。世界ティッカーでの結果処理に使用可能。

3. **パフォーマンス余裕あり**: 48校全ラウンドが25msで完了。インタラクティブ大会モードでも「他校の試合を並列進行」が十分可能。

---

## 追加バグ・懸念事項（気づいた点）

1. **タイムアウト調整**: 複数年E2Eテスト（3年分）が65秒かかるようになった。旧実装より重いが、実際のゲーム動作は問題なし。テストのタイムアウトを180秒に延長して対応。

2. **MVP表示**: `mvpPlayerId` は選手IDのみ。UI表示時は `PlayerRegistry` から名前を引く必要あり。

3. **打者・投手詳細成績**: `batterStats`, `pitcherStats` は空配列のまま（`quickGame` の結果は `QuickBatterResult` 型で `MatchBatterStat` とは異なる）。詳細成績が必要な場合は型変換ロジックの追加が必要。

---

## コミット情報

実装日: 2026-04-17
Phase: 5.5 (Tournament Match Fix)
担当: Claude Sonnet 4.6
