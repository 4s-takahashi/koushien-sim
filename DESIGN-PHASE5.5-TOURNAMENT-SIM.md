# Phase 5.5: Tournament Match Fix — 設計書

## 1. 現状の問題点

### 1.1 「1点しか入らない」バグの正体

ユーザー（高橋さん）の実プレイで発見:
> 「試合が行われた際に、1回表裏で点が入る際に1点しか入らない形で全試合なっている」

原因は `distributeScore(totalScore, 9)` 関数にある：

```typescript
function distributeScore(totalScore: number, innings: number): number[] {
  const result = Array(innings).fill(0);
  let remaining = totalScore;
  for (let i = 0; i < innings && remaining > 0; i++) {
    const run = Math.min(remaining, Math.ceil(remaining / (innings - i)));
    remaining -= run;
    result[i] = run;
  }
  return result;
}
```

`ceil(remaining / (innings - i))` の計算で、例えば `totalScore = 5, innings = 9` の場合:
- i=0: ceil(5/9) = 1, remaining=4
- i=1: ceil(4/8) = 1, remaining=3
- i=2: ceil(3/7) = 1, remaining=2
- i=3: ceil(2/6) = 1, remaining=1
- i=4: ceil(1/5) = 1, remaining=0
- i=5〜8: 0

→ **結果: [1,1,1,1,1,0,0,0,0]** （常に前半に均等分散）

### 1.2 実シミュレーション未実行問題

`simulateTournamentRound` は **reputation差 + 乱数** で勝敗と合計スコアだけ決めており、1球も、1打席も、1イニングも実際にシミュレートしていない。既存の `quickGame()` / `runGame()` が大会では一切呼ばれていない。

---

## 2. 解決方針: 3層 Tier シミュレーション

| 対象 | 手法 | 理由 |
|------|------|------|
| **自校の試合** | `quickGame()` 呼び出し（将来は Phase 10-C で MatchRunner）| 詳細な個人成績が必要 |
| **近隣校・対戦予定校** | `quickGame()` | 個人成績含む打席ごとシミュレーション |
| **その他の他校** | `quickGame()` | 48校規模なら速度的に許容（全47試合で1秒以内目標） |

Phase 5.5 では全試合 `quickGame()` 統一。速度問題が発生した場合のみ tier分けを追加（Step 8参照）。

---

## 3. データ拡張方針

### 3.1 TournamentMatch 型の拡張（追加のみ・破壊的変更なし）

```typescript
export interface TournamentMatch {
  // --- 既存フィールド（変更なし） ---
  matchId: string;
  round: number;
  matchIndex: number;
  homeSchoolId: string | null;
  awaySchoolId: string | null;
  winnerId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  isBye: boolean;
  isUpset: boolean;
  // --- 新規追加 ---
  inningScores: { home: number[]; away: number[] } | null;  // quickGame 実シミュ結果
  totalInnings: number | null;
  mvpPlayerId: string | null;
}
```

個人打席成績（AtBatResult[]）はメモリ量を考慮してこのフェーズでは保持しない。
必要になった時点（Phase 10-C等）で設計を再検討する。

### 3.2 QuickGameResult → TournamentMatch マッピング

```
QuickGameResult.score.home      → TournamentMatch.homeScore
QuickGameResult.score.away      → TournamentMatch.awayScore
QuickGameResult.inningScores    → TournamentMatch.inningScores
QuickGameResult.inningScores.home.length → TournamentMatch.totalInnings
QuickGameResult.mvpId           → TournamentMatch.mvpPlayerId
QuickGameResult.winnerId        → TournamentMatch.winnerId
```

---

## 4. 共通 buildMatchTeam の切り出し

現在 `buildMatchTeam` は `practice-game.ts` のプライベート関数として定義されている。
これを `src/engine/world/match-team-builder.ts` として独立したモジュールに切り出し、
`tournament-bracket.ts` と `practice-game.ts` の両方から import する。

---

## 5. Phase 10 との連携ポイント

### 5.1 skipPlayerMatch オプション

`simulateTournamentRound` に以下のオプションを追加:

```typescript
options: {
  skipPlayerMatch?: boolean;    // true なら自校試合をスキップ（未決のまま返す）
  playerSchoolId?: string;      // スキップ対象の学校 ID
}
```

### 5.2 Phase 10-C での処理フロー（将来実装）

```
world-ticker.ts
  ├─ simulateTournamentRound(bracket, round, schools, rng, { skipPlayerMatch: true, playerSchoolId })
  │    → 自校試合以外を全て quickGame で消化
  │    → 自校試合は winnerId=null のまま返す
  └─ [自校試合] → MatchRunner で観戦/介入
       → 試合終了後 bracket に結果を書き込み
       → propagateWinners を手動呼び出し
```

### 5.3 今フェーズの範囲

- `skipPlayerMatch` オプションの追加と動作確認まで
- MatchRunner の呼び出しは Phase 10-C で実装
- 自校試合も現時点では `quickGame` で処理する（Phase 10-C で差し替え）

---

## 6. world-ticker.ts の修正方針

`TournamentMatch` に `inningScores` が入ったため、`distributeScore` による捏造は不要になる：

```typescript
// Before
playerMatchResult = {
  winner,
  finalScore: { home: homeScore, away: awayScore },
  inningScores: {
    home: distributeScore(homeScore, 9),   // ← 捏造
    away: distributeScore(awayScore, 9),   // ← 捏造
  },
  totalInnings: 9,
  mvpPlayerId: null,
  batterStats: [],
  pitcherStats: [],
};

// After
playerMatchResult = {
  winner,
  finalScore: { home: homeScore, away: awayScore },
  inningScores: playerMatch.inningScores ?? { home: [], away: [] },  // ← 実データ
  totalInnings: playerMatch.totalInnings ?? 9,
  mvpPlayerId: playerMatch.mvpPlayerId ?? null,
  batterStats: [],   // 軽量化のため空（quickGame の打者成績は match に保持しない）
  pitcherStats: [],
};
```

`distributeScore` 関数は全呼び出し箇所を置き換えた後、完全削除する。

---

## 7. パフォーマンス目標

- 48校 = 47試合（6ラウンド合計）
- `quickGame` 1試合 ≈ 1-5ms の想定
- **全47試合で 1秒以内**を目標（500ms 以内を期待）
- 3秒超の場合: 遠い他校同士の試合は Minimal tier 処理にフォールバック

---

## 8. テスト方針

### 8.1 既存テストへの影響

- `autumn-tournament.test.ts`: `TournamentMatch` 型に新フィールドが追加されるが、
  既存テストは `winnerId`, `homeScore`, `awayScore` のみ参照しているので影響なし
- `world-ticker.test.ts`: `distributeScore` の挙動を前提にしているテストがあれば修正が必要

### 8.2 新規テスト

`tests/engine/world/tournament-simulation.test.ts`:
1. `simulateTournamentRound` が quickGame ベースで動作することを確認
2. イニングスコアが `[1,1,1,...,0]` パターンにならないことを確認
3. 48校全ラウンド完走テスト（5秒以内）
4. `skipPlayerMatch: true` で自校試合が未決のまま返ることを確認
5. `inningScores` の合計が `homeScore/awayScore` と一致することを確認

---

## 9. 変更ファイル一覧（予定）

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `src/engine/world/match-team-builder.ts` | **新規** | `buildMatchTeam` の共通化 |
| `src/engine/world/tournament-bracket.ts` | **修正** | 型拡張 + quickGame 呼び出し |
| `src/engine/world/world-ticker.ts` | **修正** | distributeScore 撤廃、実データ使用 |
| `src/engine/world/practice-game.ts` | **修正** | buildMatchTeam を match-team-builder から import |
| `tests/engine/world/tournament-simulation.test.ts` | **新規** | 実シミュ確認テスト |
| `scripts/verify-tournament-realism.ts` | **新規** | 実プレイ検証スクリプト |
| `PHASE5.5-REPORT.md` | **新規** | Before/After 比較レポート |
