# キャッチャー性格システム & バッテリー戦術設計書

**Phase S2 設計書**
作成日: 2026-05-03
担当: Claude Sonnet 4.6

---

## 1. 概要・目的

現状の試合エンジンでは「監督 → 直接ピッチャー/バッターへ指示」となっているが、
今フェーズでは以下の変更を行う：

| 場面 | 変更前 | 変更後 |
|------|--------|--------|
| 攻撃時 | 監督 → バッター | 監督 → バッター（現状維持） |
| 守備時 | 監督 → ピッチャー | 監督 → **キャッチャー** → ピッチャー |

キャッチャーの「性格」と「能力値」が配球に影響し、PsycheWindowでは
**自チームの思考のみ表示**する（相手チーム非表示）。

---

## 2. 現状アーキテクチャ分析

### 2.1 打席進行フロー

```
processAtBat(state, order, rng, overrides?)
  └─ processPitch(state, order, rng, overrides?)
       ├─ getEffectivePitcherParams(pitcherMP, overrides.pitcherMental)
       ├─ getEffectiveBatterParams(batterMP, overrides.batterMental)
       ├─ selectPitch(velocity, control, availablePitches, balls, strikes, rng)
       ├─ applyControlError(target, control, rng)
       ├─ decideBatterAction(batter, pitch, location, count, order, rng)
       └─ calculateSwingResult / resolveBatBall / resolveFieldResult
```

### 2.2 心理システムフロー（現状）

```
generatePitchMonologues(ctx, excludeIds?)
  ├─ batterPatterns → filterPatterns → weightedPick → MonologueEntry
  ├─ pitcherPatterns → filterPatterns → weightedPick → MonologueEntry
  └─ catcherPatterns → filterPatterns → weightedPick → MonologueEntry

PitchMonologuesWithEffects {
  batter, pitcher, catcher: MonologueEntry | null
  batterEffects: MentalEffect[]  ← batter+catcherPick の合計
  pitcherEffects: MentalEffect[] ← pitcherPick の合計
}
```

**現状のキャッチャーモノローグ**：既存の `monologue-db.ts` に捕手パターンが4件（`catcher_leading`等）存在。
`generator.ts` では `catcherCandidates` を `ctx.pitcherTraits` でフィルタリング（捕手特性は投手と同軍と仮定）。

### 2.3 監督指示UI（現状）

```tsx
// page.tsx TacticsBar
const mode = isPlayerBatting ? 'batter' : 'pitcher';
setSelectMode({ type: 'detailed_order', mode });
// DetailedOrderModal に mode='batter' or mode='pitcher' を渡す

// DetailedOrderModal.tsx
// mode='batter' → BatterDetailedOrder (focusArea, pitchType, aggressiveness)
// mode='pitcher' → PitcherDetailedOrder (focusArea, pitchMix, intimidation)
```

### 2.4 PsycheWindow（現状）

```tsx
// page.tsx 2094-2107
<PsycheWindow
  monologues={pitchLog.length > 0 ? pitchLog[pitchLog.length - 1].monologues : undefined}
  batterName={...}
  pitcherName={view.pitcher.name}
  ...
/>
// monologues は pitchLog の最後のエントリから取得
// 自チーム/相手チーム判定ロジック未実装（全員表示）
```

---

## 3. 型設計

### 3.1 CatcherProfile（`src/engine/types/player.ts` に追加）

```typescript
/** キャッチャーの性格タイプ */
export type CatcherPersonality = 'aggressive' | 'cautious' | 'analytical';

/** キャッチャーのバッテリー特性（Player.catcherProfile? として追加） */
export interface CatcherProfile {
  /** 性格タイプ */
  personality: CatcherPersonality;
  /** リーダーシップ: 投手を引っ張る力 0-100 */
  leadershipScore: number;
  /** 配球精度: 弱点を突く正確さ 0-100 */
  callingAccuracy: number;
}
```

**追加箇所**: `Player` インターフェースに `catcherProfile?: CatcherProfile` を追加
（optional = 後方互換、捕手ポジション以外は `undefined`）

### 3.2 CatcherThought（新規型）

```typescript
/** キャッチャーの打席前思考 */
export interface CatcherThought {
  /** キャッチャーが選んだ配球方針 */
  callingStrategy: CallingStrategy;
  /** 思考テキスト（PsycheWindow 表示用） */
  thoughtText: string;
  /** 配球に与える補正値 */
  pitchingBias: PitchingBias;
}

/** 配球方針 */
export type CallingStrategy =
  | 'fastball_heavy'   // ストレート中心
  | 'breaking_heavy'   // 変化球中心
  | 'outside_focus'    // 外角攻め
  | 'inside_focus'     // 内角攻め
  | 'mixed'            // バランス型
  | 'high_low'         // 高低の揺さぶり
  | 'careful';         // カウント重視（慎重）

/** 配球補正 */
export interface PitchingBias {
  /** ストレート確率補正 (-0.3〜+0.3) */
  fastballRatioBias: number;
  /** ゾーン内狙い率補正 (-0.3〜+0.3) */
  strikeZoneBias: number;
  /** 外角コース優先 (true = 外角50%増し) */
  preferOutside: boolean;
  /** 内角コース優先 */
  preferInside: boolean;
}
```

**配置先**: `src/engine/psyche/catcher-thinking.ts`（新規ファイル）

---

## 4. キャッチャー思考生成ロジック

### 4.1 新規ファイル `src/engine/psyche/catcher-thinking.ts`

```typescript
export interface CatcherThinkingContext {
  // キャッチャー情報
  catcherPersonality: CatcherPersonality;
  catcherLeadership: number;    // 0-100
  catcherCallingAccuracy: number; // 0-100

  // ピッチャー状況
  pitcherStamina: number;       // 0-100
  pitcherControl: number;       // 1-100
  pitcherBreakingBallSharpness: number; // 0-1 (変化球キレ)
  pitcherMental: number;        // 0-100
  pitcherVelocity: number;      // km/h

  // 相手バッター情報（分析用）
  batterTraits: TraitId[];
  batterContact: number;
  batterPower: number;
  batterEye: number;

  // ゲーム状況
  inning: number;
  scoreDiff: number;            // 守備チーム視点（正=リード）
  outs: number;
  runnersOn: 'none' | 'some' | 'scoring' | 'bases_loaded';
  isKoshien: boolean;
  consecutiveHits: number;      // 連続安打数
}

export function generateCatcherThought(ctx: CatcherThinkingContext): CatcherThought;
```

### 4.2 配球戦術マトリクス

| 条件 | 方針 | 思考テキスト例 |
|------|------|---------------|
| `aggressive` + `callingAccuracy >= 70` | `fastball_heavy` or `outside_focus` | 「積極的に攻めよう。ストレートで押してやる」 |
| `aggressive` + `callingAccuracy < 70` | `mixed` | 「攻めたいが、今日の制球じゃ無理はできない」 |
| `cautious` + `leadershipScore >= 70` | `careful` → `high_low` | 「まずカウントを整えよう。焦らず丁寧に」 |
| `cautious` + `leadershipScore < 70` | `careful` | 「慎重に行こう。ボールから入って様子を見る」 |
| `analytical` + `callingAccuracy >= 70` | `outside_focus` or `inside_focus` | 「外角が苦手なはず。そこを徹底的に突こう」 |
| `analytical` + `callingAccuracy < 70` | `mixed` | 「相手の癖は分かるが、ピッチャーの状態が...」 |

### 4.3 ピッチャー状況による上書き

| 条件 | 上書き方針 | 思考テキスト追加 |
|------|------------|-----------------|
| `pitcherBreakingBallSharpness < 0.5` | `fastball_heavy` 強制 | 「今日の変化球はキレがない。ストレート中心でいこう」 |
| `pitcherControl < 50` | `strikeZoneBias += 0.2` | 「コントロールが悪い。ゾーンで勝負させよう」 |
| `pitcherStamina < 40` | `careful` + 変化球減少 | 「スタミナが落ちてきた。球数を少なくする組み立てで」 |
| `pitcherMental < 40` | メンタル励まし思考 | 「ピッチャーが追い込まれている。落ち着かせなきゃ」 |

### 4.4 能力値が低い場合のミス発生

- `callingAccuracy < 40`: `PitchingBias` の値が不安定になる（±0.1 のランダム誤差）
- `leadershipScore < 40`: ピッチャーのメンタル補正効果が半減

---

## 5. 配球ロジック改修

### 5.1 改修対象: `selectPitch()` 関数

**現状**: `selectPitch(velocity, control, availablePitches, balls, strikes, rng)`
**変更後**: `selectPitch(velocity, control, availablePitches, balls, strikes, rng, pitchingBias?)`

```typescript
export function selectPitch(
  velocity: number,
  control: number,
  availablePitches: Partial<Record<PitchType, number>>,
  balls: number,
  strikes: number,
  rng: RNG,
  pitchingBias?: PitchingBias,  // 追加 (optional)
): SelectPitchResult
```

`pitchingBias` を適用:
- `fastballRatioBias`: `fastballRatio += bias.fastballRatioBias`
- `preferOutside`: ゾーン内狙いのとき `col` を `2-3` 寄りにシフト
- `preferInside`: ゾーン内狙いのとき `col` を `1-2` 寄りにシフト
- `strikeZoneBias`: `strikeZoneTargetRate += bias.strikeZoneBias`

### 5.2 改修対象: `processPitch()` の呼び出し

`processPitch` に `catcherThought?: CatcherThought` を渡す経路を追加:
- `MatchOverrides` に `catcherPitchingBias?: PitchingBias` フィールドを追加
- `processPitch` 内で `selectPitch` を呼ぶとき `overrides.catcherPitchingBias` を渡す

### 5.3 改修対象: `processAtBat()` の呼び出し元

`match-store.ts` 等の呼び出し元で:
1. `generateCatcherThought(ctx)` を呼んで `CatcherThought` を取得
2. `overrides.catcherPitchingBias = catcherThought.pitchingBias` をセット
3. `processAtBat(state, order, rng, overrides)` を呼ぶ

---

## 6. 監督指示UI改修

### 6.1 改修対象: `TacticsBar` コンポーネント (`page.tsx`)

**現状**:
```tsx
// 「⚙ 細かく指示」ボタンのラベル
{isPlayerBatting ? '打者指示' : '投手指示'}
```

**変更後**:
```tsx
{isPlayerBatting ? '打者指示' : 'キャッチャーへ指示'}
```

**モーダル呼び出し**:
```tsx
// 現状: mode = isPlayerBatting ? 'batter' : 'pitcher'
// 変更後:
const mode = isPlayerBatting ? 'batter' : 'catcher';
setSelectMode({ type: 'detailed_order', mode });
```

### 6.2 `SelectMode` 型の変更

```typescript
// 現状
type SelectMode =
  | { type: 'detailed_order'; mode: 'batter' | 'pitcher' };

// 変更後
type SelectMode =
  | { type: 'detailed_order'; mode: 'batter' | 'catcher' };
```

### 6.3 `DetailedOrderModal` の変更

**新しい mode: `'catcher'`** のUIを追加:

```tsx
// mode='catcher' の場合の入力項目（キャッチャーへの指示）
interface CatcherDetailedOrder {
  type: 'catcher_detailed';
  /** 配球方針 */
  callingStyle?: 'attack' | 'careful' | 'mixed';
  /** コース指定 */
  focusArea?: 'outside' | 'inside' | 'any';
  /** 積極度 */
  aggressiveness?: 'aggressive' | 'normal' | 'passive';
}
```

UIラベル:
- `attack` → 「攻める配球」
- `careful` → 「慎重な配球」
- `mixed` → 「バランス型」

### 6.4 `TacticalOrder` 型への追加

```typescript
// src/engine/match/types.ts に追加
export interface CatcherDetailedOrder {
  type: 'catcher_detailed';
  callingStyle?: 'attack' | 'careful' | 'mixed';
  focusArea?: 'outside' | 'inside' | 'any';
  aggressiveness?: 'aggressive' | 'normal' | 'passive';
}

export type TacticalOrder =
  | ... (既存)
  | CatcherDetailedOrder;  // 追加
```

### 6.5 キャッチャー指示の効果

`generateCatcherThought` では監督からの `CatcherDetailedOrder` も受け取り:
- `callingStyle: 'attack'` → `aggressive` 性格時に `fastball_heavy` 強化
- `callingStyle: 'careful'` → 全性格で `careful` 方針に上書き
- `focusArea: 'outside'` → `preferOutside: true` にセット

---

## 7. PsycheWindow 改修

### 7.1 自チームのみ表示ルール

**表示条件**:
- `isPlayerBatting === true` (自チームが攻撃中): バッターのモノローグを表示
- `isPlayerBatting === false` (自チームが守備中): キャッチャーの思考を表示

**非表示条件**:
- 相手チームのバッター・投手の心理は一切表示しない

### 7.2 改修: `PsycheWindow` へのプロパティ追加

```tsx
interface PsycheWindowProps {
  // 既存プロパティ...

  /** Phase S2: 自チームが攻撃中かどうか */
  isPlayerBatting: boolean;

  /** Phase S2: キャッチャーの思考テキスト（守備時） */
  catcherThought?: string;

  /** Phase S2: キャッチャー名 */
  catcherName?: string;
}
```

### 7.3 表示ロジック

```tsx
// 守備時: キャッチャー思考を優先表示
if (!isPlayerBatting && catcherThought) {
  // キャッチャー思考を表示
  // activeBubbles に catcherThought を追加
}

// 攻撃時: バッターのモノローグを表示（現状維持）
// 相手チームの投手・捕手のモノローグは表示しない
```

### 7.4 ローテーション表示の変更

**守備時のローテーション順序**:
1. キャッチャー思考（generateCatcherThought のテキスト）
2. ピッチャーのモノローグ（pitcher role のみ）

**攻撃時**（現状維持）:
1. バッターのモノローグ
2. （キャッチャーの采配コメントは削除 = 相手チームのキャッチャーのため非表示）

### 7.5 `page.tsx` の PsycheWindow 呼び出し変更

```tsx
<PsycheWindow
  monologues={isPlayerBatting
    ? pitchLog[pitchLog.length - 1].monologues  // 攻撃時: 全モノローグ
    : filterMonologuesForFielding(pitchLog[pitchLog.length - 1].monologues) // 守備時: 自チームpitcherのみ
  }
  batterName={...}
  pitcherName={view.pitcher.name}
  isPlayerBatting={view.isPlayerBatting}
  catcherThought={currentCatcherThought}
  catcherName={currentCatcherName}
  ...
/>
```

---

## 8. 既存コードへの影響範囲

### 8.1 型変更（破壊的変更なし）

| ファイル | 変更内容 | 破壊的変更 |
|----------|----------|-----------|
| `src/engine/types/player.ts` | `CatcherPersonality`, `CatcherProfile` 型追加; `Player.catcherProfile?` 追加 | ❌ (optional) |
| `src/engine/match/types.ts` | `CatcherDetailedOrder` 追加; `TacticalOrder` union に追加 | ❌ |
| `src/engine/match/runner-types.ts` | `MatchOverrides.catcherPitchingBias?` 追加 | ❌ (optional) |

### 8.2 関数シグネチャ変更

| ファイル | 変更内容 | 既存テスト影響 |
|----------|----------|--------------|
| `src/engine/match/pitch/select-pitch.ts` | `pitchingBias?` 引数追加 (optional) | ❌ (optional引数) |
| `src/engine/match/pitch/process-pitch.ts` | `MatchOverrides` に `catcherPitchingBias?` 参照追加 | ❌ |

### 8.3 新規ファイル

| ファイル | 内容 |
|----------|------|
| `src/engine/psyche/catcher-thinking.ts` | `CatcherThought`, `CatcherThinkingContext`, `generateCatcherThought()` |

### 8.4 UI変更

| ファイル | 変更内容 |
|----------|----------|
| `src/app/play/match/[matchId]/page.tsx` | TacticsBar のラベル変更、PsycheWindow プロパティ追加 |
| `src/app/play/match/[matchId]/PsycheWindow.tsx` | `isPlayerBatting`, `catcherThought`, `catcherName` プロパティ追加 |
| `src/app/play/match/[matchId]/DetailedOrderModal.tsx` | `mode='catcher'` 追加 |

---

## 9. 段階的実装計画

### Phase 2: 型定義 + CatcherProfile (60分)

1. `src/engine/types/player.ts` に `CatcherPersonality`, `CatcherProfile` 追加
2. `src/engine/match/types.ts` に `CatcherDetailedOrder` 追加
3. `src/engine/match/runner-types.ts` に `MatchOverrides.catcherPitchingBias?` 追加
4. `src/engine/psyche/catcher-thinking.ts` 新設 - 型定義のみ

### Phase 3: キャッチャー思考生成 + 配球ロジック (90分)

1. `src/engine/psyche/catcher-thinking.ts` に `generateCatcherThought()` 実装
2. `src/engine/match/pitch/select-pitch.ts` に `pitchingBias?` 引数追加
3. `src/engine/match/pitch/process-pitch.ts` で `catcherPitchingBias` を `selectPitch` に渡す

### Phase 4: 監督指示UI (90分)

1. `src/app/play/match/[matchId]/DetailedOrderModal.tsx` に `mode='catcher'` 追加
2. `src/app/play/match/[matchId]/page.tsx` の TacticsBar ラベル変更 + mode変更
3. キャッチャー指示を `generateCatcherThought` に反映する経路追加

### Phase 5: PsycheWindow 改修 (60分)

1. `PsycheWindow.tsx` に `isPlayerBatting`, `catcherThought`, `catcherName` プロパティ追加
2. 表示ロジック: 攻撃時=バッター心理、守備時=キャッチャー思考
3. `page.tsx` の PsycheWindow 呼び出し更新

### Phase 6: テスト追加 (60分)

1. `src/engine/psyche/catcher-thinking.test.ts` 新設
   - 性格3種 × 能力値（高/低）のマトリクステスト
   - ピッチャー状況（スタミナ低・変化球キレ低・コントロール悪）の上書きテスト
2. `src/engine/match/pitch/select-pitch.test.ts` に `pitchingBias` テスト追加
3. 既存 1629 テスト全通過確認

---

## 10. テスト戦略

### 10.1 ユニットテスト: `catcher-thinking.test.ts`

```typescript
describe('generateCatcherThought', () => {
  // 性格 × 能力値マトリクス
  it('aggressive + callingAccuracy:80 → fastball_heavy or outside_focus')
  it('aggressive + callingAccuracy:30 → mixed (ability limitation)')
  it('cautious + leadershipScore:80 → careful then high_low')
  it('analytical + callingAccuracy:80 → outside_focus or inside_focus')

  // ピッチャー状況上書き
  it('pitcherBreakingBallSharpness:0.3 → forced fastball_heavy')
  it('pitcherControl:40 → increased strikeZoneBias')
  it('pitcherStamina:30 → careful strategy')
  it('pitcherMental:35 → mental support thought text')

  // 能力値低の場合のミス
  it('callingAccuracy:30 → PitchingBias has random error')
})
```

### 10.2 統合テスト: 既存テストの維持

- `selectPitch` の既存テスト: `pitchingBias` 省略時（undefined）は従来通り動作
- `processAtBat` の既存テスト: `overrides` 省略時は従来通り動作

---

## 11. データフロー図（Phase S2 完成後）

```
監督指示UI
 ├─ [攻撃時] バッターへの指示 → BatterDetailedOrder
 │    └─ processAtBat の order として渡される
 │
 └─ [守備時] キャッチャーへの指示 → CatcherDetailedOrder
      └─ generateCatcherThought(ctx, managerOrder) → CatcherThought
           ├─ thoughtText → PsycheWindow (キャッチャー思考として表示)
           └─ pitchingBias → MatchOverrides.catcherPitchingBias
                └─ processPitch → selectPitch(... pitchingBias)
                     └─ 配球方針に反映

PsycheWindow 表示
 ├─ [自チーム攻撃時] バッターのモノローグ表示
 └─ [自チーム守備時] キャッチャー思考テキスト + 自チーム投手モノローグ表示
     (相手チームの心理は一切表示しない)
```

---

## 12. 注意事項・制約

1. **既存テスト 1629件 全パス必須**: すべての変更は optional 追加とし破壊的変更を回避
2. **CatcherProfile の初期値**: 既存ゲームデータにはフィールドなし → `undefined` の場合は
   デフォルト値 `{personality: 'cautious', leadershipScore: 50, callingAccuracy: 50}` を使用
3. **相手チーム非表示**: PsycheWindowの自チーム判定は `view.isPlayerBatting` を使用
4. **ピッチャーへの直接指示廃止**: 守備時の `PitcherDetailedOrder` は使用停止し
   `CatcherDetailedOrder` に置き換える（型は残存してよい）
5. **選手生成**: 既存の `generate.ts` で捕手生成時に `catcherProfile` を追加するか検討
   → 今フェーズでは省略し、捕手位置に `undefined` でも正常動作させる

---

## 13. ファイル変更リスト（最終確認）

### 変更ファイル（既存）
- `src/engine/types/player.ts` — CatcherPersonality, CatcherProfile 追加
- `src/engine/match/types.ts` — CatcherDetailedOrder 追加
- `src/engine/match/runner-types.ts` — MatchOverrides 拡張
- `src/engine/match/pitch/select-pitch.ts` — pitchingBias? 引数追加
- `src/engine/match/pitch/process-pitch.ts` — catcherPitchingBias 反映
- `src/app/play/match/[matchId]/page.tsx` — TacticsBar + PsycheWindow 呼び出し変更
- `src/app/play/match/[matchId]/PsycheWindow.tsx` — isPlayerBatting + catcherThought 追加
- `src/app/play/match/[matchId]/DetailedOrderModal.tsx` — catcher mode 追加

### 新規ファイル
- `src/engine/psyche/catcher-thinking.ts` — CatcherThought, generateCatcherThought()
- `src/engine/psyche/catcher-thinking.test.ts` — ユニットテスト

---

*設計書 End*
