# M3 完了レポート: 「采配が通る」

## 概要
M3フェーズ「采配が通る」の実装が完了しました。

## テスト結果
- **全テスト: 192/192 Pass** (18ファイル)
- M3新規テスト: 12テスト (tactics.test.ts)

## 実装ファイル

### 新規
- `src/engine/match/tactics.ts` (308行)
- `tests/engine/match/tactics.test.ts` (12テスト)

### tactics.ts 主要関数一覧

| 関数名 | 引数 | 返り値 | 説明 |
|--------|------|--------|------|
| `validateOrder` | `(order: TacticalOrder, state: MatchState)` | `{ valid: boolean; reason?: string }` | 采配の妥当性チェック |
| `applyPinchHit` | `(state: MatchState, outPlayerId: string, inPlayerId: string)` | `MatchState` | 代打処理 |
| `applyPitchingChange` | `(state: MatchState, newPitcherId: string)` | `MatchState` | 投手交代 |
| `applyMoundVisit` | `(state: MatchState)` | `MatchState` | マウンド訪問（confidence +15） |
| `willObeySign` | `(player: MatchPlayer, order: TacticalOrder, state: MatchState, rng: RNG)` | `boolean` | サイン遵守判定 |
| `attemptSteal` | `(state: MatchState, runnerId: string, rng: RNG)` | `{ success: boolean; nextState: MatchState }` | 盗塁実行（簡易版） |
| `cpuAutoTactics` | `(state: MatchState, rng: RNG)` | `TacticalOrder` | CPU自動采配 |

## 代打・代走・投手交代の状態変化サンプル

### 代打（Pinch Hit）
```
Before:
  battingOrder: [P1, P2, P3, P4, ...]
  benchPlayerIds: [B1, B2, B3, ...]
  usedPlayerIds: {}

applyPinchHit(state, outPlayerId=P1, inPlayerId=B1)

After:
  battingOrder: [B1, P2, P3, P4, ...]  ← P1→B1に交代
  benchPlayerIds: [B2, B3, ...]        ← B1がベンチから削除
  usedPlayerIds: {P1}                  ← P1がマーク（再起用不可）
  log: [..., {type: 'substitution', description: 'Pinch hit: P1 → B1'}]
```

### 投手交代（Pitching Change）
```
Before:
  currentPitcherId: 投手A (stamina=15, pitchCountInGame=105)
  benchPlayerIds: [..., 投手B]

applyPitchingChange(state, newPitcherId=投手B)

After:
  currentPitcherId: 投手B
  投手B: stamina=100 (リセット), isWarmedUp=true
  usedPlayerIds: {投手A}
  log: [..., {type: 'pitching_change', ...}]
```

### マウンド訪問（Mound Visit）
```
Before:
  投手C: confidence=35

applyMoundVisit(state)

After:
  投手C: confidence=50 (+15)
  制限: 1試合3回まで
```

## サイン遵守率

### 基本遵守率: 0.90 (SIGN_COMPLIANCE_BASE)

| 性格 | 補正 | 結果 |
|------|------|------|
| honest | +0.05 | 遵守率 ≈ 95% |
| rebellious | -0.15 | 遵守率 ≈ 75% |
| overconfident | -0.08 (-0.05 if conf>80) | 遵守率 ≈ 77-82% |
| competitive (チャンス時) | -0.03 | 遵守率 ≈ 87% |

### 場面補正
- confidence > 80: -0.05
- confidence < 30: +0.05
- バント指示 + 4番打者: -0.10

### テスト結果
- ✅ honest プレイヤー: 100回中 >80回遵守
- ✅ rebellious プレイヤー: 100回中 ≤85回遵守

## 全テスト結果 (tactics.test.ts: 12/12 Pass)

```
✓ should validate none order
✓ should validate pinch_hit order
✓ should reject invalid pinch_hit (inPlayer not in bench)
✓ should apply pinch_hit
✓ should apply pitching_change
✓ should apply mound_visit and gain confidence
✓ should reject mound_visit at limit
✓ should obey sign for honest players
✓ should disobey sign for rebellious players
✓ should return cpu_auto_tactics with none order for neutral state
✓ should return cpu_auto_tactics with pitching_change for tired pitcher
✓ should have seed reproducibility
```

## 現時点で未対応の采配ケース

### 簡易実装（M4以降で拡張）
- 🔶 盗塁（attemptSteal）: 現在は常に成功。runner.speed vs catcher.armStrength の計算が必要

### 未実装（M4以降）
- ❌ 代走（applyPinchRun）: 塁上ランナー交代ロジック
- ❌ 守備交代（applyDefensiveSub）: fieldPositions更新
- ❌ バント実行: 打撃エンジンとの連携
- ❌ ヒットエンドラン: 走塁判定との複合処理
- ❌ 敬遠執行: 采配指示としての処理（at-batには実装済み）
- ❌ サイン無視イベントの記録

## 累積テスト

| フェーズ | テスト数 | 累積 |
|----------|----------|------|
| Phase 1 (M0) | 99 | 99 |
| M1 打席開始 | 50 | 149 |
| M2 打席終了 | 31 | 180 |
| **M3 采配** | **12** | **192** |

## 次ステップ: M4「イニングが終わる」
- `inning.ts`: 3アウト判定、打順送り、得点集計
- `inning.test.ts`: イニング処理テスト
- 推定: 1.5日
