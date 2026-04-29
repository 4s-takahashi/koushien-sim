# Phase R7: 戦術・感情・思考への接続 — 完了レポート

**実施日**: 2026-04-29
**ブランチ**: main
**ベース**: Phase R6（NarrativeHook システム完成）

---

## 概要

Phase R7 は既存システムを Layer 3 / NarrativeHook に接続し、ドラマ性を強化する。
`BatterDetailedOrder`、心理システム（v0.21.0）、思考コメント生成、実況テンプレートの4系統を統合した。

---

## 実装サマリー

### R7-1. BatterDetailedOrder → Layer 3 入力 E 接続強化

**変更ファイル**: `src/engine/physics/bat-ball/latent-state.ts`

**追加定数**:

| 定数 | 説明 |
|------|------|
| `AGGRESSIVENESS_CONTACT_BIAS` | `orderAggressiveness` → `contactQuality` への補正マップ |
| `AGGRESSIVENESS_PRESSURE_BIAS` | `orderAggressiveness` → `decisionPressure` への補正マップ |

**補正値**:

- `aggressive`: contactQuality `-0.04`、decisionPressure `-0.05`
- `passive`: contactQuality `+0.03`、decisionPressure `+0.03`
- `normal`: 補正なし

既存の `orderFocusArea` → `FOCUS_AREA_INTENT_BIAS` → `swingIntent` (±0.2) も確認済み。
`BatterDetailedOrder` は `buildBatBallContext()` で既に抽出されており、R7-1 は補正値の実装で完結。

---

### R7-2. NarrativeHook 購読インターフェース整備

**変更ファイル**: `src/engine/narrative/psyche-bridge.ts`, `src/engine/narrative/index.ts`

**追加 API**:

```typescript
type NarrativeHookSubscriber = (input: NarrativeHookSubscribeInput) => void;

function notifyNarrativeHookSubscribers(
  subscribers: ReadonlyArray<NarrativeHookSubscriber>,
  hook: NarrativeHook,
  options?: { suggestedBatterConfidenceDelta?: number; suggestedPitcherConfidenceDelta?: number },
): void;

function computeConfidenceDelta(hook: NarrativeHook, role: 'batter' | 'pitcher'): number;
function extractConfidenceDeltas(input: NarrativeHookSubscribeInput): { batter: number; pitcher: number };
```

drama level 倍率: `dramatic=2.0`, `high=1.5`, `medium=1.0`, `low=0.5`。
confidence delta は ±10 にクランプ。

---

### R7-3. 1球ごと思考コメント生成拡張

**変更ファイル**: `src/engine/narrative/thought-comment-generator.ts`

**パターン数**: 40 → **63** パターン（+23）

新規追加カテゴリ:
- hook 連動（打者/投手/捕手）: 打球結果への感情的反応
- 球種認識（打者）: fastball/breaking 球への戦略思考
- 速度認識（打者）: 145km/h 以上への反応
- 連続凡退（打者）: スランプ状態の内的葛藤
- 好調感・速球自信（投手）: スタミナ高時・143km/h 以上
- 終盤粘投（投手）: 8回以降・スタミナ低下
- 捕手の配球見直し・初球戦略・ドラマ演出

---

### R7-4. 実況パターン拡張（21種 × 投球種 × カウント）

**変更ファイル**: `src/engine/narrative/hook-generator.ts`, `src/engine/narrative/index.ts`

**追加型**:

```typescript
interface CommentaryContext {
  pitchType?: string;
  balls?: number;
  strikes?: number;
  recentCommentaryIds?: ReadonlySet<string>;
}
```

**テンプレートDB**: 45 テンプレート（hitType × pitchType × count の組み合わせ）

優先順位: hitType+pitchType+count 全一致 > hitType+count > hitType+pitchType > hitType のみ

代表例:
- HR × fastball: 「ストレートを完璧に捉えた！弾丸ライナーがそのままスタンドへ！」
- HR × 2strikes: 「追い込まれてからのホームラン！逆転劇に会場が沸く！」
- HR × fullcount: 「フルカウントからの長打！ドラマチックな一打がスタンドへ！」
- 当たり損ね × fork: 「フォークに引っかかった！当たり損ねで投手前へ！」

`${pitchLabel}` プレースホルダーで投球種ラベルを動的置換。
`recentCommentaryIds` で直近使用済みテンプレートを除外し単調さを回避。

---

## テスト結果

**新規テスト**: `tests/engine/narrative/phase-r7.test.ts` — **48 件** 全パス

| テストグループ | 件数 |
|-------------|------|
| R7-1: orderAggressiveness/focusArea 接続 | 9 件 |
| R7-2: 購読インターフェース | 9 件 |
| R7-3: 思考コメント生成 | 15 件 |
| R7-4: 実況テンプレート | 15 件 |

**既存テスト**: 714 件全パス確認済み

---

## 完了条件チェック

| 条件 | 結果 |
|------|------|
| 同じ打席でも心理状態・采配が違えば結果が変わる | ✅ orderAggressiveness → contactQuality/decisionPressure 補正 |
| 思考コメントが状況に応じて多様化（1試合内で同じが連発しない） | ✅ recentCommentIds + 63 パターン |
| 既存テスト全パス + 新規テスト 30 件以上 | ✅ 714 件 + 48 件 |
| main にプッシュ済み | ✅ |
| PHASE-R7-REPORT.md 作成 | ✅ 本ファイル |

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/engine/physics/bat-ball/latent-state.ts` | AGGRESSIVENESS_CONTACT/PRESSURE_BIAS 追加、computeContactQuality/computeDecisionPressure に反映 |
| `src/engine/narrative/psyche-bridge.ts` | NarrativeHookSubscriber 型、notify/computeDelta/extractDeltas 追加 |
| `src/engine/narrative/thought-comment-generator.ts` | 40 → 63 パターン（+23）追加 |
| `src/engine/narrative/hook-generator.ts` | CommentaryContext 型、COMMENTARY_TEMPLATE_DB（45 件）、selectCommentaryTemplate 追加 |
| `src/engine/narrative/index.ts` | 新規エクスポート追加 |
| `tests/engine/narrative/phase-r7.test.ts` | 新規テスト 48 件 |

---

## 次フェーズへの引き継ぎ（Phase R8）

- `AGGRESSIVENESS_CONTACT_BIAS` (-0.04/+0.03) は 1000 試合シミュ後に調整が必要
- `computeConfidenceDelta` の乗数（5 倍）は統計測定後に最適化
- `recentCommentaryIds` のリングバッファサイズ（デフォルト 6）は多様性指標測定後に調整
