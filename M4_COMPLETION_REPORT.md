# M4 完了レポート: 「試合が完走する」

## 概要
M4フェーズ「試合が完走する」の実装が完了しました。
9イニング完走、サヨナラ判定、延長判定がすべて機能しています。

## テスト結果
- **全テスト: 202/202 Pass** (20ファイル)
- M4新規テスト: 10テスト (inning.test.ts: 4, game.test.ts: 6)

## 実装ファイル

### 新規
- `src/engine/match/inning.ts` — イニング処理エンジン
- `src/engine/match/game.ts` — 試合全体の進行エンジン
- `tests/engine/match/inning.test.ts` — イニングテスト (4テスト)
- `tests/engine/match/game.test.ts` — 試合テスト (6テスト)

## 主要関数一覧

### inning.ts

| 関数名 | 引数 | 返り値 | 説明 |
|--------|------|--------|------|
| `processHalfInning` | `(state: MatchState, rng: RNG, tacticsProvider?)` | `{ nextState, result: InningResult }` | 1ハーフイニング処理（3アウトまで打席ループ） |
| `processFullInning` | `(state: MatchState, rng: RNG, homeTactics?, awayTactics?)` | `{ nextState, isSayonara: boolean }` | 1回全体（表+裏）処理、サヨナラ判定付き |

### game.ts

| 関数名 | 引数 | 返り値 | 説明 |
|--------|------|--------|------|
| `runGame` | `(config: MatchConfig, homeTeam, awayTeam, rng, homeTactics?, awayTactics?)` | `{ finalState, result: MatchResult }` | 試合全体を実行 |

## 9イニング完走サンプル

```
Seed: 'game-test-9inn'
Config: { innings: 9, maxExtras: 3, isTournament: false }

結果:
  totalInnings: 9
  finalScore: { home: XX, away: YY }
  winner: 'home' or 'away'
  inningScores: 各回の得点が記録
  isOver: true
  
特徴:
  - 表→裏を9回繰り返し
  - 各ハーフイニングで3アウトまで打席処理
  - 打順は9人でループ（0-8）
  - 采配は cpuAutoTactics が自動判定
```

## サヨナラ試合サンプル

```
processFullInning 内の processHalfInningSayonara:
  - 9回裏以降、ホームが得点してリードした時点で即座に終了
  - isSayonara = true を返す
  - runGame は即座に finishGame() を呼ぶ

判定条件:
  currentInning >= config.innings
  && score.home > score.away  (裏で逆転または勝ち越し)
```

## 延長試合サンプル

```
Config: { innings: 9, maxExtras: 3 }

延長判定:
  - 9回終了時に同点 → 10回へ
  - 最大12回まで（9 + maxExtras=3）
  - 12回終了時に同点 → 引き分け (winner: 'draw')

トーナメントモード:
  - config.isTournament = true
  - maxExtras を超えても続行（最大15回追加の安全弁）
  - 決着がつくまで延長
```

## テスト結果

### inning.test.ts (4/4 Pass)
```
✓ should process a half inning and end with 3 outs
✓ should reset outs and bases at start of half inning
✓ should process a full inning (top + bottom)
✓ should have seed reproducibility
```

### game.test.ts (6/6 Pass)
```
✓ should complete a 9-inning game
✓ should produce inning scores matching final score
✓ should handle extra innings when tied
✓ should always produce a winner in tournament mode
✓ should have seed reproducibility for full game
✓ should score a reasonable number of runs
```

## 現時点で未対応の試合ルール

### 簡易実装（M5以降で拡張）
- 🔶 得点バランス: 現在の平均得点が高め（調整中）
- 🔶 batterStats / pitcherStats: 集計ロジック未実装（空配列を返す）
- 🔶 MVP選出: null を返す

### 未実装（M5以降）
- ❌ タイブレーク（延長戦の特別ルール）
- ❌ コールドゲーム（7回10点差ルール等）
- ❌ 代打・代走の采配実行連携（tactics→inning→at-bat の連結）
- ❌ 投手の球数制限による自動交代（inning内での交代判定）
- ❌ 打者成績・投手成績の個人集計
- ❌ 試合MVP選出ロジック
- ❌ 観戦ログの充実（実況テキスト生成）

## M3 Claude Code 改善提案について

M3実装中、Claude Codeが並行して改善版 tactics.ts（653行）を作成しました。
主な改善提案:
- `applyPinchRun()` / `applyDefensiveSub()` の完全実装
- `willObeySign()` のシグネチャ改善（MatchPlayer → Player）
- `attemptSteal()` の走力 vs 肩力計算
- マウンド訪問のログ判定改善（description依存 → data.kind判定）
- テストの拡充（14→30+テスト）

これらの改善は M5 で採用を検討します。

## 累積テスト

| フェーズ | テスト数 | 累積 |
|----------|----------|------|
| Phase 1 (M0) | 99 | 99 |
| M1 打席開始 | 50 | 149 |
| M2 打席終了 | 31 | 180 |
| M3 采配 | 12 | 192 |
| **M4 試合完走** | **10** | **202** |

## 次ステップ: M5「結果が残る」
- 打者成績・投手成績の集計
- MVP選出
- 試合サマリー生成
- 得点バランス調整
