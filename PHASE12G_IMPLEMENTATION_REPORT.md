# Phase 12-G「試合画面ビジュアル リファイン」実装レポート

**バージョン**: v0.25.0
**完了日**: 2026-04-22
**テスト数**: 978 pass (うち新規 +25)

---

## 実装サマリ

高橋さんの依頼「試合画面ビジュアル リファイン」を G-1〜G-4 の全4タスクで実装。

---

## G-1: グラウンド・ストライクゾーン 40% 縮小

### 変更ファイル
- `src/ui/match-visual/Ballpark.module.css`
- `src/ui/match-visual/StrikeZone.module.css`
- `src/app/play/match/[matchId]/match-visual.module.css`
- `src/app/play/match/[matchId]/page.tsx`

### 実装内容
| 対象 | 変更前 | 変更後 |
|------|--------|--------|
| Ballpark max-width | 450px | 270px |
| StrikeZone max-width | 300px | 180px |
| レイアウト | 2カラム（グラウンド + ゾーン） | 3カラム（グラウンド + ゾーン + 情報パネル） |

縮小で生まれたスペースに **右カラム（infoColumn）** を追加し、実況ログ・心理ウィンドウ等を移動。
モバイル（<600px）では 2カラム × 2行にフォールバック。

---

## G-2: 打球アニメーション拡張

### G-2a: ホームラン = 場外まで飛ぶ

**変更ファイル**: `src/ui/match-visual/useBallAnimation.ts`

`computeTrajectory()` のホームラン判定時に `scaledDist` を `distance * 2.8` に変更。
350ft の HR は `350 * 2.8 = 980ft` 相当の座標に設定 → フィールド最大半径 400ft を大幅に超えるため Canvas 外へ消える。

```typescript
const scaledDist = isHomeRun
  ? distance * 2.8   // フェンスを超えてキャンバス外まで
  : distance * 0.8;
```

### G-2b: 内野ゴロ = 守備→送球→走塁 プレイシーケンス

**変更ファイル**:
- `src/ui/match-visual/useBallAnimation.ts`（PlaySequence 型・buildGroundOutSequence・triggerPlaySequence 追加）
- `src/ui/match-visual/BallparkCanvas.ts`（drawBatterRunner / drawResultFlash / フィールダーアニメ対応）
- `src/ui/match-visual/Ballpark.tsx`（playSequenceState を buildBallparkRenderState に渡す）
- `src/app/play/match/[matchId]/page.tsx`（内野ゴロ時に triggerPlaySequence 呼び出し）

#### シーケンスタイムライン

```
0ms ─────────────────────────────────────────────── 1500ms
0  ████ groundRoll (0〜400ms)          ボールが内野へ転がる
100    ████ fielderMove (100〜500ms)   内野手がボールへ移動→キャッチ
550          ████ throw (550〜900ms)   内野手から一塁へ送球
400      ██████████ batterRun (400〜1300ms) バッター → 一塁へ走塁
950                  ████ result (950〜1500ms) アウト！ or セーフ！
```

#### ポジション判定ロジック
```
direction < 25°  → 三塁手 (thirdBase)
direction < 45°  → 遊撃手 (shortstop)
direction < 70°  → 二塁手 (secondBase)
それ以外          → 一塁手 (firstBase)
```

---

## G-3: ストライクゾーン 投球軌道アニメーション

**変更ファイル**: `src/ui/match-visual/StrikeZone.tsx`

### 実装内容

1. `computePitchTrajPos()`: 始点・終点・変化方向・ストレートフラグ・進行度 t から現在座標を計算
   - イーズイン（t²）で加速させる投球感覚
   - 変化量は `sin(π*t)` で t=0.5 が最大、着弾時はゼロに収束
   - 変化球の最大変化量: 28 SVG px

2. `PitchBallAnimSvg`: 投球中の白い発光ボールを描画（グロー付き二重円）

3. `StrikeZone` 本体の改修:
   - `hiddenSeq`: アニメーション中は最新マーカーを非表示
   - アニメーション完了後にマーカーを表示（`markerScaleIn` アニメーション付き）

### 球種別軌道
| 球種 | dx | dy | 視覚効果 |
|------|----|----|----------|
| ストレート（高速） | 0 | -10（ホップ） | 上方向にわずかに浮く |
| スライダー | +1 | +0.3 | 右に曲がる |
| カーブ | +0.3 | +1 | 下に大きく曲がる |
| フォーク | 0 | +1.2 | まっすぐ急落下 |
| チェンジアップ | +0.2 | +0.8 | 軽く落ちる |

---

## G-4: スイング位置マーカー = バット形状

**変更ファイル**: `src/ui/match-visual/StrikeZone.tsx`

`SwingMarkerSvg` を小矩形からバット形状（台形 + バレル端円）に変更。

```
形状: 台形（trapezoid）
バット長: 80 SVG px
グリップ端太さ: 3px
バレル端太さ: 8px
角度: -25°（アッパースイング）
バットの中央 = スイング位置
```

- インプレー: fillOpacity 0.6（より鮮明）
- ファウル/空振り: fillOpacity 0.35（やや透明）

---

## テスト

### 新規テストファイル
`tests/ui/match-visual/phase12g.test.ts` (22 テスト)

| テストグループ | 件数 |
|--------------|------|
| buildGroundOutSequence | 10件 |
| computePitchTrajPos | 7件 |
| computeTrajectory ホームラン場外修正 | 4件 |
| (phase12gの合計) | 22件 |

### 修正テスト
`tests/ui/match-visual/field-coordinates.test.ts` (3件修正)

Phase 12-F で座標系が変更されていたが更新されていなかったテストを修正:
- ホームプレートの高さ: `H * 0.85` → `H * 0.92`
- 一塁の位置: 水平 `(90, 0)` → 斜め `(63.64, 63.64)` (45°方向)
- スケール計算: `FIELD_SCALE` → 実際の動的スケール

### テスト結果
```
Test Files: 86 total (5 failed[pre-existing], 81 passed)
Tests: 1003 total (25 failed[pre-existing], 978 passed)
```

pre-existing の失敗はすべて Phase 12-G 以前から存在するエンジンテストの型エラー（engine tests）であり、今回の変更とは無関係。

---

## 主要ファイル変更一覧

| ファイル | 変更種別 | 概要 |
|---------|---------|------|
| `src/ui/match-visual/Ballpark.module.css` | 修正 | max-width 450px → 270px |
| `src/ui/match-visual/StrikeZone.module.css` | 修正 | max-width 300px → 180px |
| `src/ui/match-visual/StrikeZone.tsx` | 拡張 | バット形状・投球軌道アニメ |
| `src/ui/match-visual/useBallAnimation.ts` | 拡張 | PlaySequence・ホームラン場外 |
| `src/ui/match-visual/BallparkCanvas.ts` | 拡張 | 走者描画・判定テキスト |
| `src/ui/match-visual/Ballpark.tsx` | 修正 | playSequenceState 伝搬 |
| `src/ui/match-visual/index.ts` | 修正 | 新型・関数エクスポート追加 |
| `src/app/play/match/[matchId]/match-visual.module.css` | 修正 | 3カラムレイアウト |
| `src/app/play/match/[matchId]/page.tsx` | 修正 | infoColumn統合・sequence呼出 |
| `src/version.ts` | 修正 | v0.25.0 + CHANGELOG |
| `tests/ui/match-visual/phase12g.test.ts` | 新規 | 22件のテスト |
| `tests/ui/match-visual/field-coordinates.test.ts` | 修正 | Phase12-F座標更新 |

---

## ビルド確認

```
✅ npm run build: 成功
✅ TypeScript: エラーなし（src/ 以下）
✅ テスト: 978/1003 pass（pre-existing 失敗は別途）
```
