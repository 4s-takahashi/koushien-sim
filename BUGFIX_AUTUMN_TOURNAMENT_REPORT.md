# 秋大会が起動しないバグ修正レポート

## 根本原因（コード行番号付き）

### 主原因: `world-store.ts` の `simulateTournament` アクション

**ファイル**: `src/stores/world-store.ts`（修正前の行 561〜584）

```typescript
// 旧コード（バグあり）
simulateTournament: () => {
  const completed = simulateFullTournament(...);
  const history = [...(worldState.tournamentHistory ?? []), completed].slice(-10);
  set({
    worldState: {
      ...worldState,
      activeTournament: completed,   // ← isCompleted=true のまま残す！
      tournamentHistory: history,    // ← 履歴にも追加
    },
  });
},
```

`simulateTournament()` は大会完了後に `activeTournament: completed`（`isCompleted=true`）を設定し、
かつ同じオブジェクトを `tournamentHistory` にも追加していた。

これにより保存状態が：
```
activeTournament.isCompleted = true（完了済みなのに null でない）
tournamentHistory = [同じ大会]（重複）
```

### 副次的詰まり箇所: `world-ticker.ts` のトーナメント処理ガード条件

**ファイル**: `src/engine/world/world-ticker.ts`（修正前の行 461）

```typescript
// 大会が進行中なら今日のラウンドを消化する
if (activeTournament && !activeTournament.isCompleted) {  // ← isCompleted=true ならこのブロック全体がスキップ
```

`activeTournament.isCompleted === true` のとき：
- このブロックが完全にスキップされる
- 完了チェック（line 570）でも `activeTournament = null` に更新されない
- 結果、`activeTournament` が永久に残留する

### 秋大会生成が失敗する理由

**ファイル**: `src/engine/world/world-ticker.ts`（修正前の行 735）

```typescript
// 秋大会: 9/15 開始
if (newDate.month === 9 && newDate.day === 15 && !nextWorld.activeTournament) {
```

`activeTournament` が `null` でない（完了済みだが残留）→ 秋大会が生成されない。

### 波及経路のまとめ

```
simulateTournament() 呼び出し
  └─ activeTournament = completed (isCompleted=true)
  └─ tournamentHistory = [同大会]
     ↓
advanceWorldDay() 呼び出し（毎日）
  └─ if (activeTournament && !activeTournament.isCompleted) → スキップ
  └─ activeTournament が null にならない
     ↓
9/15 到達
  └─ if (!nextWorld.activeTournament) → false（activeTournament が残っている）
  └─ 秋大会生成されない
     ↓
年度替わり (3/31 → 4/1)
  └─ processYearTransition は activeTournament を触らない
  └─ 翌年の夏大会・秋大会も生成されない
```

---

## 修正箇所リスト

### 1. `src/stores/world-store.ts` — `simulateTournament` アクション（主修正）

**修正内容**: 大会完了後に `activeTournament: null` を設定する。重複追加も防止。

```typescript
// 修正後
simulateTournament: () => {
  const completed = simulateFullTournament(...);
  const existingHistory = worldState.tournamentHistory ?? [];
  const alreadyInHistory = existingHistory.some((t) => t.id === completed.id);
  const history = alreadyInHistory ? existingHistory : [...existingHistory, completed].slice(-10);
  set({
    worldState: {
      ...worldState,
      activeTournament: null,    // ← 完了後は必ず null
      tournamentHistory: history,
    },
  });
},
```

### 2. `src/engine/world/world-ticker.ts` — `advanceWorldDay` 先頭（防衛修正）

**修正内容**: `advanceWorldDay` の冒頭で完了済み `activeTournament` を検出してクリーンアップ。

追加箇所: 行 452〜468（既存の `// 大会が進行中なら〜` コメントの前）

```typescript
// 【バグ修正】完了済み activeTournament が残存している場合は履歴に移動して null 化する。
if (activeTournament && activeTournament.isCompleted) {
  const alreadyInHistory = tournamentHistory.some((t) => t.id === activeTournament!.id);
  if (!alreadyInHistory) {
    tournamentHistory = [...tournamentHistory, activeTournament].slice(-10);
  }
  activeTournament = null;
}
```

### 3. `src/engine/world/year-transition.ts` — `processYearTransition` 先頭（保険修正）

**修正内容**: 年度替わり時に完了済み `activeTournament` が残っていても自動クリーンアップ。

追加箇所: 行 404〜426（`// Step 0` コメントの前）

```typescript
// 保険: 完了済み activeTournament が残っていたら履歴に移動して null 化
let worldForTransition = world;
if (worldForTransition.activeTournament && worldForTransition.activeTournament.isCompleted) {
  const stale = worldForTransition.activeTournament;
  const existingHistory = worldForTransition.tournamentHistory ?? [];
  const alreadyInHistory = existingHistory.some((t) => t.id === stale.id);
  const newHistory = alreadyInHistory ? existingHistory : [...existingHistory, stale].slice(-10);
  worldForTransition = {
    ...worldForTransition,
    activeTournament: null,
    tournamentHistory: newHistory,
  };
}
```

また、以降の処理で `world` → `worldForTransition` に変数を統一:
- `runAISchoolScouting(world, ...)` → `runAISchoolScouting(worldForTransition, ...)`
- `world.prefecture` → `worldForTransition.prefecture`

### 4. `src/stores/world-store.ts` — ロード時の既存セーブ救済マイグレーション

**修正内容**: `persist` の `storage.getItem` でデシリアライズ後に `isCompleted=true` の
`activeTournament` を自動クリーンアップ。

```typescript
getItem: (name) => {
  // ... 既存のデシリアライズ ...
  const deserialized = deserializeWS(JSON.stringify(ws));

  // 【セーブ移行】既存セーブ救済
  if (deserialized.activeTournament && deserialized.activeTournament.isCompleted) {
    const stale = deserialized.activeTournament;
    const existingHistory = deserialized.tournamentHistory ?? [];
    const alreadyInHistory = existingHistory.some((t) => t.id === stale.id);
    const newHistory = alreadyInHistory ? existingHistory : [...existingHistory, stale].slice(-10);
    parsed.state.worldState = {
      ...deserialized,
      activeTournament: null,
      tournamentHistory: newHistory,
    };
  }
  // ...
```

---

## 追加したテスト

**ファイル**: `tests/engine/world/bugfix-autumn-tournament.test.ts`

| テスト名 | 内容 |
|---------|------|
| バグ修正A: 決勝まで勝ち抜いた後 activeTournament が null | 夏大会完走後に null 化を確認 |
| バグ修正A: completeInteractiveMatch が決勝後に null にする | インタラクティブ決勝後の null 化確認 |
| バグ修正B: 敗退後に大会が正常完了する | 敗退後も他校の大会が完了し null 化される |
| バグ修正C: 3/31→4/1→7/10 で 2年目夏大会が作成される | 年度替わり後の夏大会生成確認 |
| バグ修正D: 夏大会完了後に秋大会が 9/15 に作成される（正常ケース） | post_summer → 秋大会生成 |
| **バグ修正D: 完了済み activeTournament が残っても 9/15 で秋大会作成** | **バグ再現 + 修正検証（核心テスト）** |
| バグ修正D: 夏大会完了後（7/29）は post_summer フェーズ | フェーズが正しく切り替わる |
| バグ修正E: isCompleted=true が残った状態で advanceWorldDay を呼ぶと修復 | 異常セーブの自動修復 |
| バグ修正E: processYearTransition は完了済み activeTournament をクリーンアップ | 年度替わり時の保険クリーンアップ |
| バグ修正E: processYearTransition は重複追加しない | 重複履歴の防止 |
| バグ修正F: simulateFullTournament 後は isCompleted=true | 大会完了フラグが正しくセットされる |
| バグ修正F: 完了大会を activeTournament に残したまま 9/15 に進むと秋大会生成 | エンジンレベルのバグ再現 + 修正検証 |
| バグ修正G: 1年目 7/10 に夏大会が作成される | 正常ケースの回帰確認 |
| バグ修正G: 1年目 9/15 に秋大会が作成される | 正常ケースの回帰確認 |
| バグ修正G: 1年目フルシーズン — 夏・秋両方が履歴に残る | フルシーズン整合性確認 |

---

## マイグレーション仕様

### 対象セーブ

`localStorage` の `koushien-active-game` キーに保存された世界状態のうち、
`state.worldState.activeTournament.isCompleted === true` であるもの。

### マイグレーション処理

- **タイミング**: ゲームロード時（`persist` の `storage.getItem` 内）
- **処理内容**:
  1. `deserialized.activeTournament.isCompleted === true` を検出
  2. `tournamentHistory` に同 ID が未登録なら追加（`slice(-10)` で最大10件）
  3. `activeTournament = null` に設定
- **IndexedDB セーブ（スロット保存）**: 現在は `loadGame` でデシリアライズ後にそのままセット。
  IndexedDB セーブからのロード (`loadWorldState`) はエンジン関数を呼ぶが、
  ロード後に `advanceWorldDay` が呼ばれる際に `advanceWorldDay` の先頭クリーンアップが動作するため
  次の日進行で自動修復される。
- **副作用なし**: マイグレーションは冪等（2回実行しても結果が変わらない）

### 手動修復が不要なケース

修正後は以下の時点で自動修復される：
1. ページリロード時（localStorage の `getItem` フック）
2. `advanceDay()` 呼び出し時（`advanceWorldDay` 冒頭）
3. 年度替わり時（`processYearTransition` 冒頭）

---

## プレイヤーセーブが治るかの検証結果

### バグレポートの状態

```
currentDate: 2年目 7/16
activeTournament.type: "summer"
activeTournament.isCompleted: true（完了済み）
activeTournament.champion: school-ai-12
tournamentHistory: ['1-summer-完了true']
phase: "summer_tournament"
```

### 修正後の動作

1. **ページリロード時**: `localStorage` の `getItem` フックが `isCompleted=true` を検出。
   - `activeTournament = null` に設定
   - `tournamentHistory` に同 ID があるので重複追加しない
   - 修復完了 ✓

2. **次の `advanceDay()` 呼び出し時**: 万一 `getItem` が効かなくても `advanceWorldDay` 冒頭でクリーンアップ。

3. **秋大会生成**: `activeTournament = null` になったので 9/15 の秋大会生成条件 `!nextWorld.activeTournament` が満たされる。
   - 2年目 9/15 に秋大会が正常生成される ✓

4. **夏大会**: 2年目 7/16 時点では既に夏大会期間を過ぎているため、2年目の夏大会は作られない（正常動作）。
   - 3年目の夏大会は 7/10 に正常生成される ✓

### テスト `bugfix-autumn-tournament.test.ts > バグ修正D: 完了済み activeTournament が残っても 9/15 で秋大会作成` で検証済み

```
PASS  tests/engine/world/bugfix-autumn-tournament.test.ts > バグ修正D > 完了済み activeTournament が残っても 9/15 で秋大会作成される
```

---

## テスト実行結果

```
Test Files  64 passed (64)
     Tests  758 passed (758)    ← 既存 743 + 新規 15
  Duration  319.72s
```

既存テスト全通過。新規テスト 15 件全通過。
