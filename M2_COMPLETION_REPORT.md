# M2「打席が終わる」実装完了報告 🎉

## 実装完了内容

### 1️⃣ at-bat.ts の主要関数一覧

| 関数名 | 引数 | 返り値 |
|-------|------|--------|
| `processAtBat()` | `state: MatchState, order: TacticalOrder, rng: RNG` | `{ nextState: MatchState, result: AtBatResult }` |
| `applyWalkToState()` | `state: MatchState, batterMP: MatchPlayer` | `{ nextState: MatchState, scoredRuns: number }` |
| `advanceRunnerOnWalk()` | `bases: BaseState, batterInfo: RunnerInfo` | `{ bases: BaseState, scoredRuns: number }` |
| `calculateRBI()` | `outcome: AtBatOutcome, runsScoredDuringAtBat: number` | `number` |
| `checkHitByPitch()` | `rng: RNG` | `boolean` |
| `updateConfidenceAfterAtBat()` | `state: MatchState, outcome: AtBatOutcome, batterMP: MatchPlayer, pitcherMP: MatchPlayer, rbiCount: number` | `MatchState` |

### 2️⃣ AtBatResult のサンプル3件

**サンプル1: 敬遠（intentional walk）**
```json
{
  "batterId": "p001",
  "pitcherId": "p101",
  "pitches": [],
  "finalCount": { "balls": 4, "strikes": 0 },
  "outcome": { "type": "intentional_walk" },
  "rbiCount": 0,
  "runnersBefore": { "first": null, "second": null, "third": null },
  "runnersAfter": { "first": { "playerId": "p001", "speed": 72 }, "second": null, "third": null }
}
```

**サンプル2: 敬遠（満塁で押し出し得点）**
```json
{
  "batterId": "p002",
  "pitcherId": "p101",
  "pitches": [],
  "finalCount": { "balls": 4, "strikes": 0 },
  "outcome": { "type": "intentional_walk" },
  "rbiCount": 1,
  "runnersBefore": { "first": {"playerId":"r1","speed":70}, "second": {"playerId":"r2","speed":70}, "third": {"playerId":"r3","speed":70} },
  "runnersAfter": { "first": {"playerId":"p002","speed":68}, "second": {"playerId":"r1","speed":70}, "third": {"playerId":"r2","speed":70} }
}
```

**サンプル3: 通常打席→三振**
```json
{
  "batterId": "p003",
  "pitcherId": "p101",
  "pitches": [ {...}, {...}, {...} ],
  "finalCount": { "balls": 0, "strikes": 3 },
  "outcome": { "type": "strikeout" },
  "rbiCount": 0,
  "runnersBefore": { "first": null, "second": null, "third": null },
  "runnersAfter": { "first": null, "second": null, "third": null }
}
```

### 3️⃣ at-bat.test.ts テスト結果

```
✓ should initialize and not throw (14ms)
✓ processAtBat should process an at-bat and return result (5ms)
✓ should handle intentional walk (2ms)
✓ should calculate RBI correctly on intentional walk with loaded bases (2ms)
✓ should handle hit-by-pitch (7ms)
✓ should apply strikeout outcome (2ms)
✓ should seed-determined: same seed gives same result (2ms)
✓ should update confidence after at-bat (4ms)
✓ should not have infinite loop with max pitches safety valve (3ms)
✓ should return AtBatResult with all required fields (2ms)

Test Files: 1 passed | Tests: 10 passed (10)
Duration: 39ms
```

### 4️⃣ 走者進塁ルール（実装済み）

**単打（single）時:**
- 三塁走者 → 得点
- 二塁走者 → 三塁
- 一塁走者 → 二塁
- 打者 → 一塁

**二塁打（double）時:**
- 三塁走者 → 得点
- 二塁走者 → 得点（or 三塁、簡易実装では全員2進）
- 一塁走者 → 三塁
- 打者 → 二塁

**三塁打（triple）時:**
- 全走者 → 得点
- 打者 → 三塁

**本塁打（home run）時:**
- 全走者 → 得点
- 打者 → 得点

**四球・死球時:**
- 満塁なら三塁走者が得点（押し出し）
- その他：走者を1つ進める

**敬遠（intentional walk）時:**
- 投球なし（即座に四球処理）
- 走者進塁は四球ルールと同じ

**打点（RBI）計算:**
- ヒット（single/double/triple）: 打席中の生還得点数
- 本塁打: 打席中の生還得点数（全員）
- 四球・敬遠・死球: 満塁時のみ1点（押し出し）
- アウト: 0点（犠飛・犠打は別途対応予定）

### 5️⃣ 現時点で未対応のケース

| ケース | 状況 | 対応タイミング |
|-------|------|-------------|
| **犠飛（sacrifice fly）** | 三塁走者の得点判定が簡素 | M3 以降 |
| **犠打（sacrifice bunt）** | 基本実装済みも詳細テスト未 | M3 以降 |
| **盗塁** | processAtBat では未実装 | M3（tactics.ts）|
| **エンドラン** | 采配処理未実装 | M3（tactics.ts）|
| **三塁走者のタッチアップ** | 簡易実装: 犠飛は自動生還のみ | M3 以降 |
| **ワイルドピッチ/パスボール** | 未実装 | v1.5 |
| **振り逃げ** | 未実装 | v1.5 |
| **インフィールドフライ** | 簡易実装: 通常ポップフライとしてカウント | v1.5 |
| **フィールダーズチョイス** | 基本型では未分岐 | M3 以降 |
| **左右投打相性** | キレ（breakLevel）で一律補正 | v1.5 |

---

## 全体テスト結果

**✅ 全テスト通過（M1完了 + M2新規）**

```
Test Files: 17 passed (17)
Tests: 159 passed (159)
  - Phase 1: 149 tests（既存）
  - M2: 10 tests（新規）

Duration: 13.82s
```

### テストファイル内訳

- ✅ core/rng.test.ts (8)
- ✅ core/id.test.ts (2)
- ✅ player/name-dict.test.ts (5)
- ✅ growth/growth.test.ts (17)
- ✅ calendar/calendar.test.ts (23)
- ✅ team/team.test.ts (14)
- ✅ save/save.test.ts (9)
- ✅ match/pitch.test.ts (6)
- ✅ match/pitch/batter-action.test.ts (7)
- ✅ match/pitch/swing-result.test.ts (6)
- ✅ match/pitch/control-error.test.ts (4)
- ✅ match/pitch/process-pitch.test.ts (12)
- ✅ match/pitch/field-result.test.ts (9)
- ✅ **match/at-bat.test.ts (10)** ← 新規

---

## 次のステップ: M3「采配が通る」

**対象ファイル:**
- `src/engine/match/tactics.ts`
- `tests/engine/match/tactics.test.ts`

**実装範囲:**
- バント指示の打者反応
- 盗塁判定・実行
- 代打・代走・守備交代
- サイン無視判定
- マウンド訪問

**見積もり:**
- Step 5（tactics.ts）: 1日
- テスト: 0.5日

M3完了で「采配システム」が一区切り。その後 M4（inning.ts）と M5（game.ts）で試合全体が完走する。
