# Phase 12 実装レポート — 試合画面ビジュアル化

**バージョン:** 0.24.0
**実装日:** 2026-04-22
**テスト数:** 971件 (全パス)

---

## 概要

Phase 12「試合画面ビジュアル化」として、試合画面に Canvas + SVG ハイブリッドのビジュアル層を実装しました。
既存のエンジン（915テスト）には一切変更を加えず、すべての Phase 12 追加フィールドは `optional` として後方互換を維持しています。

---

## サブフェーズ別実装内容

### Phase 12-A: アニメーション付きスコアボード基盤

**コミット:** `feat(phase12-A)`

#### 新規ファイル

| ファイル | 概要 |
|---------|------|
| `src/ui/match-visual/AnimatedScoreboard.tsx` | スライドイン/アウト付きスコアボードオーバーレイ |
| `src/ui/match-visual/AnimatedScoreboard.module.css` | CSS transform アニメーション (translateY) |
| `src/ui/match-visual/useScoreboardVisibility.ts` | フェーズ管理フック (hidden→sliding_in→visible→sliding_out) |
| `src/ui/match-visual/MatchHUD.tsx` | 常時表示コンパクトHUD |
| `src/ui/match-visual/MatchHUD.module.css` | HUDスタイル |
| `src/ui/match-visual/StrikeZone.tsx` | SVG製ストライクゾーン骨格 |
| `src/ui/match-visual/StrikeZone.module.css` | ストライクゾーンスタイル |

#### 設計のポイント
- スコアボードは DOM から除外せず `transform: translateY(-100%)` で隠す → レイアウトシフトなし
- `prefers-reduced-motion` メディアクエリでアニメーション省略
- `inningLabel` の変化でイニング開始を自動検出
- MatchHUD は `scoreboardVisible` prop でスコアボード表示中に薄くなる

#### 変更ファイル
- `src/ui/projectors/view-state-types.ts`: `outs`, `currentInning`, `pitcherHand` フィールドを optional 追加

---

### Phase 12-B: ストライクゾーンマーカー

**コミット:** `feat(phase12-B)`

#### 新規ファイル

| ファイル | 概要 |
|---------|------|
| `src/ui/match-visual/pitch-marker-types.ts` | PitchMarker / SwingMarker 型、UV座標変換、ブレイク方向 |
| `src/stores/match-visual-store.ts` | Zustandストア (マーカー管理、最大10件、古いものは透明度が下がる) |
| `tests/ui/match-visual/pitch-marker-types.test.ts` | 16件のユニットテスト |

#### ストライクゾーン座標系
```
viewBox: 300×260
ストライクゾーン: left=60, right=240, top=40, bottom=220
描画領域（ボール含む）: left=20, right=280, top=10, bottom=250
```

#### マーカー種類
| 種類 | 表示 | 条件 |
|------|------|------|
| ◯ (Circle) | 青/赤/緑/黄 | 速球系 (fastball) |
| △ (Triangle) | 同上 | 変化球系 (breaking) |
| 点線矩形 | グレー | バットスイング位置 |

#### ブレイク方向（getBreakDirection）
- 右投手カーブ: `{ dx: -0.2, dy: 0.3 }`
- 左投手カーブ: `{ dx: 0.2, dy: 0.3 }` (dx 反転)
- 三角形の頂点が変化方向を指す (`Math.atan2(dy, dx)` で回転)

---

### Phase 12-C: グラウンド鳥瞰Canvas

**コミット:** `feat(phase12-C)`

#### 新規ファイル

| ファイル | 概要 |
|---------|------|
| `src/ui/match-visual/field-coordinates.ts` | フィールド座標 ↔ Canvas座標変換 |
| `src/ui/match-visual/BallparkCanvas.ts` | Canvas 2D 描画ロジック (純粋関数) |
| `src/ui/match-visual/Ballpark.tsx` | React Canvas ラッパー |
| `src/ui/match-visual/Ballpark.module.css` | Canvasコンテナスタイル |
| `src/ui/match-visual/index.ts` | barrel export |
| `src/app/play/match/[matchId]/match-visual.module.css` | 2カラムレイアウト |
| `tests/ui/match-visual/field-coordinates.test.ts` | 20件のユニットテスト |

#### 座標系
```
原点: ホームプレート (0, 0)
X軸: 右方向が正 (ライト側)
Y軸: 上方向が正 (センター側)
FIELD_SCALE = 1.0 (1px = 1フィート)
Canvas Y = H * 0.85 - y * FIELD_SCALE (Y軸反転)
```

#### 描画レイヤー（下から上）
1. スタンド（グレー背景）
2. 外野（緑の扇形）
3. ファウルライン（白点線）
4. 内野（ベージュ円＋ダイヤモンド）
5. ピッチャーマウンド
6. ベースライン
7. ベース（白菱形）＋ホームプレート（五角形）
8. フェアポール
9. 守備選手（青/赤丸）
10. ランナー（オレンジ丸＋グロー）
11. ボール＋影（アニメーション中のみ）

#### Ballpark.tsx 機能
- `ResizeObserver` でコンテナ幅を監視、正方形 (width=height) を維持
- `devicePixelRatio` 対応（Retina ディスプレイで鮮明）
- アニメーション中は RAF ループ、静止時は effect のみ

#### matchProjector.ts 変更
- `getPitcherHand()`: 投手の `throwingHand` から `'left' | 'right'` を返す
- `buildRunnerTeams()`: ランナーのチーム所属を判定
- `projectMatch()` の返却値に `outs`, `currentInning`, `pitcherHand`, `runnerTeams` を追加

---

### Phase 12-D: ボール・打球アニメーション

**コミット:** `feat(phase12-D)`

#### 新規ファイル

| ファイル | 概要 |
|---------|------|
| `src/ui/match-visual/useBallAnimation.ts` | RAF アニメーションフック |
| `tests/ui/match-visual/useBallAnimation.test.ts` | 20件のユニットテスト |

#### アニメーション種類

**投球アニメーション（triggerPitchAnimation）**
- 経路: ピッチャーマウンド → ホームプレート付近
- イージング: `easeIn` (加速)
- 高さ: `sin(t) * 0.15` の微妙な弧
- 時間: `pitchSpeedToDuration(speedKmh)` — 160km/h≒228ms, 80km/h=450ms

**打球アニメーション（triggerHitAnimation）**
- 経路: ホームプレート → 着弾点（2次ベジェ曲線）
- イージング: `easeOut` (減速)、ゴロは linear
- 高さ: `sin(eased * PI) * peakHeightNorm`
- 時間: bullet=500ms, hard=700ms, normal=900ms, weak=1200ms

**影（drawBallWithShadow）**
- 影サイズ: `7 * (1 - h * 0.55)` — 高くなるほど小さく
- 影透明度: `0.5 * (1 - h * 0.65)` — 高くなるほど薄く
- ボール位置: `cy - h * 38` — 高さに応じて画面上部に移動

#### match-store.ts 変更
- `PitchLogEntry` に `breakDirection?`, `swingLocation?`, `batContact?` を追加
- `computeBreakDirection()`, `pitchLocationToUV()`, `isSwingAction()` ヘルパー追加
- `stepOnePitch()` / `stepOneAtBat()` でフィールドを自動設定

---

### Phase 12-E: ホームランエフェクト・パフォーマンス最適化

**コミット:** `feat(phase12-E)`

#### ホームランパーティクルエフェクト

```
実行時間: 1.4秒
パーティクル数: 32個（確定的シードで生成）
エフェクト:
  - 0-0.3s: 中央フラッシュ（黄→橙のラジアルグラジエント）
  - 0-1.4s: パーティクル放射（HSL色相を均等分割で全色表示）
  - 0.1-0.8s: 「ホームラン！」テキスト（scale アニメーション）
フェード: alphaIn = min(progress*5, 1), alphaOut = (0.7以降で急速フェード)
```

#### オフスクリーン Canvas 背景キャッシュ

静的な背景（スタンド/外野/内野/ファウルライン/ベース等）を初回のみ描画してキャッシュ。
`OffscreenCanvas` 対応環境では GPU テクスチャとして保持。

```typescript
// キャッシュ判定: サイズが同じなら再利用
if (_bgCache && _bgCache.width === w && _bgCache.height === h) {
  return _bgCache;
}
```

- ResizeObserver でサイズ変更を検知 → `invalidateBackgroundCache()` でキャッシュ無効化
- SSR / OffscreenCanvas 非対応環境では `HTMLCanvasElement` にフォールバック

#### FPS 30 上限フレームスキップ

```typescript
const TARGET_FRAME_MS = 33; // ~30fps
const loop = (now: number) => {
  if (now - lastDrawTimeRef.current >= TARGET_FRAME_MS) {
    draw(now);
  }
  animFrameRef.current = requestAnimationFrame(loop);
};
```

RAF は常に 60fps で呼ばれるが、実際の Canvas 描画は 30fps に制限。
モバイル端末のバッテリー消費を抑制しつつ、スムーズな視覚体験を維持。

---

## テスト追加

| テストファイル | 件数 | テスト内容 |
|--------------|------|-----------|
| `tests/ui/match-visual/pitch-marker-types.test.ts` | 16件 | pitchLocationToUV / getBreakDirection / isFastballClass |
| `tests/ui/match-visual/field-coordinates.test.ts` | 20件 | fieldToCanvas / canvasToField / hitDirectionToField / FIELD_POSITIONS |
| `tests/ui/match-visual/useBallAnimation.test.ts` | 20件 | pitchSpeedToDuration / bezier2 / computeTrajectory |
| **合計** | **56件** | |

**全テスト:** 971件 (915既存 + 56新規) — 全パス ✅

---

## TypeScript 対応

Phase 12 で追加したすべてのソースコードは `npx tsc --noEmit` でエラーなし（`src/` 以下）。

残存する TypeScript エラーはすべて既存テストファイル（`tests/` 以下）の pre-existing 問題であり、
Vitest の実行には影響しない。

---

## ファイル一覧

### 新規作成 (18ファイル)

```
src/ui/match-visual/
  AnimatedScoreboard.tsx          # Phase 12-A
  AnimatedScoreboard.module.css   # Phase 12-A
  MatchHUD.tsx                    # Phase 12-A
  MatchHUD.module.css             # Phase 12-A
  StrikeZone.tsx                  # Phase 12-A/B
  StrikeZone.module.css           # Phase 12-A/B
  useScoreboardVisibility.ts      # Phase 12-A
  pitch-marker-types.ts           # Phase 12-B
  field-coordinates.ts            # Phase 12-C
  BallparkCanvas.ts               # Phase 12-C/E
  Ballpark.tsx                    # Phase 12-C/E
  Ballpark.module.css             # Phase 12-C
  useBallAnimation.ts             # Phase 12-D/E
  index.ts                        # barrel export

src/stores/match-visual-store.ts  # Phase 12-B

src/app/play/match/[matchId]/
  match-visual.module.css         # Phase 12-C

tests/ui/match-visual/
  pitch-marker-types.test.ts      # Phase 12-B
  field-coordinates.test.ts       # Phase 12-C
  useBallAnimation.test.ts        # Phase 12-D
```

### 変更 (5ファイル)

```
src/ui/projectors/view-state-types.ts  # optional フィールド追加
src/ui/projectors/matchProjector.ts    # outs/currentInning/pitcherHand/runnerTeams 出力
src/stores/match-store.ts              # breakDirection/swingLocation/batContact 追加
src/app/play/match/[matchId]/page.tsx  # Phase 12 コンポーネント統合
src/version.ts / package.json          # v0.24.0 バンプ
```

---

## Git コミット履歴

```
507a6c0 chore: bump version 0.23.0 → 0.24.0 (Phase 12)
dc57a8f feat(phase12-E): ホームランエフェクト・オフスクリーンCanvasキャッシュ・FPS最適化
d977798 feat(phase12-D): ボール・打球アニメーション (requestAnimationFrame)
a46d088 feat(phase12-C): グラウンド鳥瞰Canvas・選手マーカー・ランナー表示
de1f7fd feat(phase12-B): ストライクゾーンマーカー (◯/△)・ブレイク方向・打席マーカー履歴
4c3b3a5 feat(phase12-A): アニメーション付きスコアボード・MatchHUD・StrikeZone骨格
```
