# Phase S2 完了レポート: キャッチャー性格システム + 配球指揮システム

**作成日**: 2026-05-03
**フェーズ**: S2
**ステータス**: ✅ 完了

---

## 概要

Phase S2 では、監督指示アーキテクチャを変更し、守備時は「監督 → キャッチャー → ピッチャー」という指示の流れを実装した。キャッチャーに性格（積極派・慎重派・分析派）と能力値（リーダーシップ・配球精度）を付与し、配球傾向に影響するシステムを追加した。

---

## 実装内容

### Phase 1: 型定義

**`src/engine/types/player.ts`**
- `CatcherPersonality` 型を追加（`'aggressive' | 'cautious' | 'analytical'`）
- `CatcherProfile` インターフェースを追加（`personality`, `leadershipScore`, `callingAccuracy`）
- `Player` インターフェースに `catcherProfile?: CatcherProfile` を追加（後方互換: optional）

**`src/engine/match/types.ts`**
- `CatcherCallingStyle` 型を追加（`'attack' | 'careful' | 'mixed'`）
- `CatcherDetailedOrder` インターフェースを追加（`type: 'catcher_detailed'`, `callingStyle?`, `focusArea?`, `aggressiveness?`）
- `TacticalOrder` ユニオン型に `CatcherDetailedOrder` を追加

**`src/engine/match/runner-types.ts`**
- `MatchOverrides` インターフェースに `catcherPitchingBias?` を追加（配球補正オブジェクト）

### Phase 2: キャッチャー思考エンジン

**`src/engine/psyche/catcher-thinking.ts`** (新規作成)

核となるエンジン。純粋関数として実装し、`Math.random()` を一切使わず決定論的な出力を保証。

```
入力: CatcherThinkingContext（性格・能力値・ピッチャー状況・バッター情報・試合状況・監督指示）
出力: CatcherThought（callingStrategy・thoughtText・pitchingBias・hasCallingError）
```

**配球戦略決定ロジック（優先順位順）**:
1. ピッチャー状況フラグによる強制上書き
   - `breakingBallPoor`（キレ < 0.5）→ `fastball_heavy`
   - `controlBad`（コントロール < 50）→ `strikeZoneBias` 増加
   - `staminaLow`（スタミナ < 40）→ `careful`（最終上書き）
   - `mentalLow`（メンタル < 40）→ 思考テキストに反映
2. 監督指示（`CatcherDetailedOrder`）
   - `callingStyle` → 戦略を直接上書き
   - `focusArea` → `preferOutside` / `preferInside` を設定
   - `aggressiveness` → `strikeZoneBias` を増減
3. 性格 × 能力値
   - `aggressive` + `callingAccuracy >= 60` → `fastball_heavy` / `outside_focus` / `inside_focus`
   - `aggressive` + `callingAccuracy < 60` → `mixed`（能力限界）
   - `cautious` + `leadershipScore >= 60` → `careful` / `high_low`
   - `cautious` + `leadershipScore < 60` → `careful`
   - `analytical` + `callingAccuracy >= 60` → バッター分析に基づく戦略
   - `analytical` + `callingAccuracy < 60` → `mixed`

**配球精度エラー**:
- `callingAccuracy < 40` → `hasCallingError = true`（ミスサイン）

**テキスト生成**:
- `simpleHash()` による決定論的インデックス選択
- 状況別テキストプール（スタミナ低下、メンタル低下、キレ不足、戦略別）

### Phase 3: 配球選択への反映

**`src/engine/match/pitch/select-pitch.ts`**
- `pitchingBias?: PitchingBias` 引数を追加
- `fastballRatio` に `fastballRatioBias` を適用（0.1〜0.95 でクランプ）
- `strikeZoneTargetRate` に `strikeZoneBias` を適用（0.15〜0.85 でクランプ）
- ゾーン内コース選択に `preferOutside` / `preferInside` を反映

**`src/engine/match/pitch/process-pitch.ts`**
- `processPitch()` の `selectPitch()` 呼び出しに `overrides?.catcherPitchingBias` を渡す

### Phase 4: UI 変更

**`src/app/play/match/[matchId]/DetailedOrderModal.tsx`**
- `mode` 型に `'catcher'` を追加
- `CatcherForm` コンポーネントを新規追加（配球スタイル・コース重視・積極度の3項目）
- `DetailedOrderModal` のメイン分岐に catcher ケースを追加

**`src/app/play/match/[matchId]/page.tsx`**
- `handleDetailedOrder` で守備時は `mode='catcher'` を使用
- `hasContinuingDetailedOrder` チェックに `catcher_detailed` を追加
- 戦術バーのボタンラベル: 守備時は「キャッチャーへ指示」
- `catcherThoughtInfo` useMemo ブロック: フィールド位置からキャッチャーを特定し `generateCatcherThought()` を呼び出す

**`src/app/play/match/[matchId]/PsycheWindow.tsx`**
- `isPlayerBatting?`, `catcherThought?`, `catcherName?` props を追加
- 表示ルール:
  - `isPlayerBatting === true`: 自チームバッター心理のみ表示
  - `isPlayerBatting === false`: キャッチャー思考 + 自チーム投手モノローグ表示
  - `isPlayerBatting === undefined`: 従来通り（後方互換）

### Phase 5: テスト

**`tests/engine/psyche/catcher-thinking.test.ts`** (新規作成)

33 テストケース（8 describe ブロック）:

| describe | テスト内容 | 件数 |
|---|---|---|
| DEFAULT_CATCHER_PROFILE | デフォルト値の確認 | 3 |
| catcherProfileToContext | undefined / 設定値の変換 | 2 |
| 基本形式 | 戻り値の型・形式・範囲 | 4 |
| 性格×能力値 | 6パターンの戦略マトリクス | 6 |
| ピッチャー状況上書き | キレ/コントロール/スタミナ/メンタル | 6 |
| 配球精度低下 | エラー発生・範囲保証 | 3 |
| 監督指示 | 戦略上書き・コース指定・積極度 | 5 |
| 決定論性 | 同一入力→同一出力 | 1 |
| pitchingBias の方向性 | fastball/careful/breaking のバイアス | 3 |

---

## 設計ドキュメント

詳細設計は `docs/CATCHER_BATTERY_DESIGN.md` を参照。

---

## 変更ファイル一覧

### 新規作成
| ファイル | 説明 |
|---|---|
| `src/engine/psyche/catcher-thinking.ts` | キャッチャー思考エンジン（純粋関数） |
| `tests/engine/psyche/catcher-thinking.test.ts` | ユニットテスト 33 件 |
| `docs/CATCHER_BATTERY_DESIGN.md` | 設計ドキュメント |

### 変更
| ファイル | 変更概要 |
|---|---|
| `src/engine/types/player.ts` | CatcherPersonality, CatcherProfile 型追加 |
| `src/engine/match/types.ts` | CatcherDetailedOrder, TacticalOrder 拡張 |
| `src/engine/match/runner-types.ts` | MatchOverrides に catcherPitchingBias 追加 |
| `src/engine/match/pitch/select-pitch.ts` | pitchingBias パラメータ追加 |
| `src/engine/match/pitch/process-pitch.ts` | catcherPitchingBias を selectPitch に渡す |
| `src/app/play/match/[matchId]/DetailedOrderModal.tsx` | catcher モード追加 |
| `src/app/play/match/[matchId]/page.tsx` | キャッチャー思考統合 |
| `src/app/play/match/[matchId]/PsycheWindow.tsx` | isPlayerBatting 表示分岐 |

---

## テスト結果

| テストスイート | 件数 | 結果 |
|---|---|---|
| tests/engine/psyche/ | 59 件 | ✅ PASS |
| tests/engine/match/ | 309 件 | ✅ PASS |
| tests/ui/ | 559 件 | ✅ PASS |
| tests/engine/world/ | 264 件 | ✅ PASS |
| tests/engine/psyche/catcher-thinking (新規) | 33 件 | ✅ PASS |

---

## ビルド結果

```
▲ Next.js 16.2.3 (Turbopack)
✓ Compiled successfully in 21.3s
Finished TypeScript in 22.2s
✓ Generating static pages using 1 worker (28/28) in 813ms
Route (app): ƒ /play/match/[matchId] (dynamic)
```

ビルドは正常完了。全33ルート生成済み。

---

## 設計上の決定事項

### 純粋関数アーキテクチャ
`generateCatcherThought()` は `Math.random()` を使わず、`simpleHash()` による決定論的なテキスト選択を実装。これにより:
- テストの信頼性が高い（同一入力→同一出力が保証）
- デバッグが容易
- リプレイ機能との親和性が高い

### 後方互換性の確保
全新規フィールドは `optional` (`?`) として定義。既存テストへの影響ゼロ。

### 優先順位の明確化
ピッチャー状況 > 監督指示 > 性格×能力値 の優先順位で配球戦略を決定。特にスタミナ低下は最後の上書きとして設計し、疲弊時は必ず慎重な配球に切り替わる。

---

## デプロイ

**このフェーズではデプロイを実施しない**。VPS (162.43.92.107) へのデプロイは別途マギ判断で実施。
