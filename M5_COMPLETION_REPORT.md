# M5 完了レポート: 「結果が残る」

## 概要
M5フェーズ「結果が残る」の実装が完了しました。
打者・投手の個人成績集計、CareerRecord反映、試合後成長、MVP選出が機能しています。

## テスト結果
- **全テスト: 215/215 Pass** (21ファイル)
- M5新規テスト: 13テスト (result.test.ts)

## 実装ファイル

### 新規
- `src/engine/match/result.ts` — 成績集計・CareerRecord反映・成長・MVP選出 (380行)
- `tests/engine/match/result.test.ts` — 成績テスト (13テスト)

### 更新
- `src/engine/match/game.ts` — result.tsの関数を使用するように更新
- `src/engine/match/inning.ts` — atBatResultsを返すように拡張

## 1. result.ts 主要関数一覧

| 関数名 | 引数 | 返り値 | 説明 |
|--------|------|--------|------|
| `collectBatterStats` | `(atBatResults: AtBatResult[], allPlayerIds: string[])` | `MatchBatterStat[]` | 打者個人成績集計 |
| `collectPitcherStats` | `(atBatResults: AtBatResult[], allPitcherIds, winner, homePitcherIds, awayPitcherIds)` | `MatchPitcherStat[]` | 投手個人成績集計 |
| `applyBatterStatToCareer` | `(career: CareerRecord, stat: MatchBatterStat)` | `CareerRecord` | 打者成績→Career加算 |
| `applyPitcherStatToCareer` | `(career: CareerRecord, stat: MatchPitcherStat)` | `CareerRecord` | 投手成績→Career加算 |
| `applyMatchToPlayers` | `(players: Player[], batterStats, pitcherStats)` | `Player[]` | 全選手にCareer一括反映 |
| `applyPostMatchGrowth` | `(player: Player, batterStat?, pitcherStat?, isKoshien, rng)` | `Player` | 試合後成長適用 |
| `selectMVP` | `(batterStats, pitcherStats, winner, homeBatterIds, awayBatterIds)` | `string \| null` | MVP選出 |

## 2. MatchResult サンプル

```typescript
{
  winner: 'home',
  finalScore: { home: 7, away: 3 },
  inningScores: {
    home: [0, 2, 0, 1, 0, 0, 3, 0, 1],
    away: [1, 0, 0, 0, 2, 0, 0, 0, 0],
  },
  totalInnings: 9,
  mvpPlayerId: 'abc123-...',
  batterStats: [ /* MatchBatterStat[] */ ],
  pitcherStats: [ /* MatchPitcherStat[] */ ],
}
```

## 3. 打者成績サンプル

```typescript
{
  playerId: 'abc123',
  atBats: 4,        // 打数（四球・犠打除く）
  hits: 2,          // 安打
  doubles: 1,       // 二塁打
  triples: 0,       // 三塁打
  homeRuns: 0,      // 本塁打
  rbis: 1,          // 打点
  walks: 1,         // 四球
  strikeouts: 1,    // 三振
  stolenBases: 0,   // 盗塁
  errors: 0,        // 失策
}
// 打率 = hits / atBats = 2/4 = .500
```

## 投手成績サンプル

```typescript
{
  playerId: 'xyz789',
  inningsPitched: 7.0,  // 投球回
  pitchCount: 95,       // 投球数
  hits: 5,              // 被安打
  runs: 2,              // 失点
  earnedRuns: 2,        // 自責点
  walks: 3,             // 与四球
  strikeouts: 8,        // 奪三振
  homeRunsAllowed: 1,   // 被本塁打
  isWinner: true,       // 勝利投手
  isLoser: false,       // 敗戦投手
  isSave: false,        // セーブ
}
```

## 4. CareerRecord 反映前後の差分サンプル

```
Before (初試合前):
  gamesPlayed: 0
  atBats: 0
  hits: 0
  homeRuns: 0
  rbis: 0

After (1試合後):
  gamesPlayed: 1  (+1)
  atBats: 4       (+4)
  hits: 2         (+2)
  homeRuns: 0     (+0)
  rbis: 1         (+1)

After (3試合後):
  gamesPlayed: 3  (+3累計)
  atBats: 12      (+12累計)
  hits: 6         (+6累計)
  rbis: 3         (+3累計)
```

## 5. result.test.ts テスト結果 (13/13 Pass)

```
collectBatterStats:
  ✓ should count hits, walks, strikeouts correctly
  ✓ should exclude sacrifice from at-bats

collectPitcherStats:
  ✓ should count pitcher hits, walks, strikeouts
  ✓ should assign win/loss correctly

CareerRecord:
  ✓ should apply batter stats to career
  ✓ should apply pitcher stats to career
  ✓ should accumulate over multiple games

selectMVP:
  ✓ should select MVP from winning team
  ✓ should return null for draw

applyPostMatchGrowth:
  ✓ should grow batter stats after match

Full game integration:
  ✓ should produce batter and pitcher stats from full game
  ✓ should select MVP in a non-draw game
  ✓ should have seed reproducibility for stats
```

## 6. 得点バランス

現時点では得点が高め（両チーム合計で平均100点超）。
原因: processPitch → batContact → fieldResult の確率パラメータがまだ粗い。

### 調整候補パラメータ (constants.ts)
- `BASE_CONTACT_RATE`: 0.85 → 0.70（接触率を下げる）
- `FAIR_BASE_RATE`: 0.55 → 0.45（フェアゾーン率を下げる）
- `GROUND_OUT_BASE`: 0.55 → 0.70（ゴロアウト率を上げる）
- `FLY_CATCH_BASE`: 0.80 → 0.90（フライアウト率を上げる）

**→ バランス調整は Phase 2 完了後に一括実施予定**

## 累積テスト

| フェーズ | テスト数 | 累積 |
|----------|----------|------|
| Phase 1 (M0) | 99 | 99 |
| M1 打席開始 | 50 | 149 |
| M2 打席終了 | 31 | 180 |
| M3 采配 | 12 | 192 |
| M4 試合完走 | 10 | 202 |
| **M5 結果が残る** | **13** | **215** |
