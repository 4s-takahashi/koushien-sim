# Phase 7-A 実装レポート

**実装日**: 2026-04-19
**バージョン**: v0.18.5 → v0.19.0
**担当**: Claude Code (Sonnet 4.6)

---

## 1. 実装した変更点

### 7-A-1: デフォルト1球モード化

- `INITIAL_STATE.runnerMode` はすでに `{ time: 'standard', pitch: 'on' }` だった（v0.18.5 で先行実装済み）
- 今回は **PitchLogEntry に新フィールドを追加** して投球データの充実を図った
- `pitchSpeed?`, `pitchLocation?`, `pitchTypeLabel?` はすべて `optional` — 旧セーブデータとの後方互換性を維持

### 7-A-2: 実況ログ詳細化

投球ログエントリに3フィールドを追加:

| フィールド | 型 | 説明 |
|---|---|---|
| `pitchSpeed` | `number?` | 球速 km/h（`pitchSelection.velocity` を四捨五入）|
| `pitchLocation` | `PitchLocationLabel?` | コース9区分（例: `'inside_low'`）|
| `pitchTypeLabel` | `EnrichedPitchType?` | 統一球種ラベル（例: `'slider'`）|

実況テキスト形式を変更:
- **変更前**: `⚾ 鈴木 → 田中: スライダー … 空振り`
- **変更後**: `⚾ 鈴木 → 田中: 内角低めのスライダー 138km/h … 空振り`

### 7-A-3: 実況ログアコーディオンUI

- 通常表示: 最大48文字に切り詰め + `▼` アイコン
- クリック/タップで全文展開（`▲` で折りたたみ）
- **最新10件**をメイン表示、11件目以降は「▼ もっと見る（N件）」ボタンで折りたたみ
- useState でエントリ単位の展開状態 (`expandedIds: Set<string>`) と「もっと見る」状態 (`showAll`) を管理

---

## 2. 変更/追加ファイル一覧

| ファイル | 種別 | 変更概要 |
|---|---|---|
| `src/ui/projectors/view-state-types.ts` | 変更 | `PitchLocationLabel`, `EnrichedPitchType` 型を追加; `PitchLogEntry` に3フィールドを追加 |
| `src/stores/match-store.ts` | 変更 | `PitchLocationLabel`, `EnrichedPitchType` をインポート; `toPitchLocationLabel()`, `toEnrichedPitchType()`, `toPitchSpeedKmh()` ヘルパー追加; `stepOnePitch`/`stepOneAtBat` の logEntry に3フィールドを追加 |
| `src/ui/narration/buildNarration.ts` | 変更 | `PITCH_TYPE_JP` に `curveball`/`splitter`/`cutter`/`sinker` を追加; `PITCH_LOCATION_JP` マップと `pitchLocationJP()` 関数を追加; 実況テキストにコース・球速を組み込み |
| `src/app/play/match/[matchId]/page.tsx` | 変更 | `NarrationPanel` コンポーネントをアコーディオン対応に刷新; `useState` で展開状態と「もっと見る」状態を管理 |
| `src/app/play/match/[matchId]/match.module.css` | 変更 | アコーディオン用 CSS クラスを追加 (`.narrationEntryAccordion`, `.narrationSummary`, `.narrationFull`, `.narrationChevron`, `.narrationMoreBtn`) |
| `src/version.ts` | 変更 | VERSION を `0.18.5` → `0.19.0` に bump; CHANGELOG 先頭に Phase 7-A エントリを追加 |
| `PHASE7A_REPORT.md` | 新規 | 本レポート |

---

## 3. テスト結果

```
 Test Files  74 passed (74)
      Tests  817 passed (817)
   Duration  364.82s
```

**既存の 817 件すべてパス。新規テストの追加なし。**

### 特に確認した影響テスト

| テストファイル | 結果 | 備考 |
|---|---|---|
| `tests/ui/narration/pitch-narration.test.ts` | ✅ 5件全パス | テストは `toContain('チェンジアップ')` 等のサブストリングマッチのため、新形式の「〜のチェンジアップ 120km/h」でも合格 |
| `tests/ui/projectors/matchProjector.test.ts` | ✅ 全パス | `PitchLogEntry` の新フィールドはすべて `optional` のため互換性維持 |
| `tests/engine/match/runner.test.ts` | ✅ 全パス | `runner.ts` 自体を変更していないため無影響 |
| `tests/engine/match/stepOneAtBat-integration.test.ts` | ✅ 全パス | `stepOneAtBat` の logEntry 生成を拡張したが既存動作に変更なし |

---

## 4. 技術的決定事項

### 4-1: PitchLocation の row/col クランプ

`PitchResult.actualLocation` は `row: 0-4`, `col: 0-4` の5段階グリッドで、0と4はボールゾーン。
コース9区分（`PitchLocationLabel`）はゾーン内の3段階しかないため、`Math.max(1, Math.min(3, val))` でクランプして最近傍のゾーンに割り当てた。

### 4-2: `import type` の位置

当初ヘルパー関数の直前に `import type` を書いてしまった（TypeScript エラーになる）ため、ファイル先頭の既存 import 群に統合して修正した。

### 4-3: テキスト長の「真ん中」

「真ん中のストレート 130km/h … 見逃しストライク」のような文字列は全体で38文字程度で、48文字制限内に収まる。
コース + 球種 + 速度 + 結果の典型的な組み合わせはほぼ48文字以下に収まることを確認した。

---

## 5. 既知の課題 / 次フェーズへの引き継ぎ

### 5-1: PitchLogEntry の pitchSpeed が能力値ベース

現在 `pitchSpeed` は `pitchSelection.velocity` を単純に四捨五入しているが、
実球速は投手の能力値（velocity: 0-100程度）そのままではない可能性がある。
`select-pitch.ts` を確認すると変化球時は `velocity * 0.9` が渡されるため、
速球は velocity≒km/h、変化球は約10%遅くなる表示になっている。
→ 次フェーズで投手能力値から実際の km/h への換算式を精査すること。

### 5-2: NarrationPanel の展開状態とエントリ件数の同期

新しいエントリが追加されても `expandedIds` は保持される（意図的）。
ただし試合リセット時には `NarrationPanel` の状態もリセットされる（コンポーネントが再マウントされる）ため問題なし。

### 5-3: 次フェーズの候補

- **Phase 7-B**: 球種・コース別集計表示（試合中のピッチャーデータ）
- **Phase 7-C**: 打者の状況に応じた投球推奨（ヒートマップ表示）
- **実況ログのスクロール**: 最新エントリが追加されたとき自動スクロール

---

*このレポートは Phase 7-A 完了時点（2026-04-19）に自動生成されました。*
