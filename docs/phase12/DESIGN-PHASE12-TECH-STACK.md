# Phase 12: 技術選定 — Canvas 2D vs SVG vs ライブラリ

**作成日:** 2026-04-21

---

## 1. 選択肢の概要

| 案 | 技術 | バンドルサイズ増加 | 難易度 | 主な用途 |
|---|---|---|---|---|
| A | Pure Canvas 2D | ゼロ（ブラウザ標準） | 中 | フィールド全体・アニメーション |
| B | Pure SVG + CSS | ゼロ（ブラウザ標準） | 低 | 静的レイアウト・マーカー |
| C | Canvas + SVG **ハイブリッド（推奨）** | ゼロ | 中 | フィールド=Canvas / ストライクゾーン=SVG |
| D | Pixi.js | +430KB（min） | 高 | リッチゲームエンジン |
| E | Three.js | +600KB+（min） | 非常に高 | 3D表現（却下） |

---

## 2. 各案の詳細評価

### A: Pure Canvas 2D

**メリット**
- ブラウザ標準 API のみ、依存追加ゼロ
- 多数オブジェクトのアニメーション（選手9人 + ボール + 影）で高パフォーマンス
- `requestAnimationFrame` との親和性が高い
- Retina 対応が容易（`devicePixelRatio`）

**デメリット**
- DOM がないためデバッグが難しい（ブラウザの DevTools で要素検査不可）
- テキスト描画が SVG より面倒（位置計算が必要）
- イベントハンドリング（クリック等）は座標計算が必要

**グラウンド描画への適性: ★★★★★**
**ストライクゾーン描画への適性: ★★★☆☆**（グリッドと数値テキストが面倒）

---

### B: Pure SVG + CSS animation

**メリット**
- React コンポーネントとして自然に組み込める
- DOM があるのでデバッグしやすい
- テキスト（番号等）の配置が簡単
- CSS transition でアニメーションが記述しやすい

**デメリット**
- 多数オブジェクトのアニメーションでパフォーマンス劣化リスク
  - 目安: SVG要素が 100個を超えるとモバイルで 60fps が危うい
  - フィールド（選手9人 + ボール + 軌跡 + 影）は 30〜50要素 → 許容範囲
  - ただしボールの 60fps アニメーションは Canvas のほうが確実
- 打球軌跡（Bezier）は `<animateMotion>` で可能だが記述が複雑

**グラウンド描画への適性: ★★☆☆☆**（ボールアニメが重くなりうる）
**ストライクゾーン描画への適性: ★★★★★**（マーカー・テキスト・グリッドが簡単）

---

### C: Canvas + SVG ハイブリッド（推奨）

```
[グラウンド鳥瞰エリア]
  └─ Canvas 2D
       ├─ フィールド背景（扇形・多角形）
       ├─ 選手マーカー（丸）
       ├─ ボール + 影（requestAnimationFrame アニメーション）
       └─ 打球軌跡（Bezier、毎フレーム再描画）

[ストライクゾーンエリア]
  └─ SVG（inline SVG / React コンポーネント）
       ├─ 3×3 グリッド線
       ├─ 投球マーカー（◯/△、CSS animation）
       ├─ バット位置（rect）
       └─ 番号テキスト（text）
```

**メリット**
- 役割分担が明確: アニメーションは Canvas、静的レイアウトは SVG
- どちらも依存追加ゼロ
- Canvas はパフォーマンス、SVG はデバッグ容易性という各得意分野を活かせる
- 既存の CSS スタイリングと SVG が自然に共存する

**デメリット**
- 2つの技術を習得・管理する必要がある
- Canvas と SVG の座標系が異なる（変換ロジックが必要）
- Canvas と SVG の視覚的整合性（カラーパレット等）を手動で維持する

**グラウンド + ストライクゾーンへの適性: ★★★★★**

**→ Phase 12 推奨案**

---

### D: Pixi.js

**メリット**
- WebGL ベースで最高パフォーマンス（特に多数スプライト）
- スプライトシート対応でアセット管理が楽
- フィルター・エフェクトが豊富

**デメリット**
- バンドルサイズ: 約 430KB（min）→ 現在のバンドルを大幅に圧迫
- React との統合に追加の wrapper が必要（`@pixi/react` 等）
- 学習コスト高い（WebGL 概念の理解が必要）
- 高校野球シムの規模には明らかにオーバースペック

**採用判断: ❌ 採用しない**
理由: バンドルサイズとオーバースペックが理由。Canvas 2D で要件を満たせる。

---

### E: Three.js（3D）

**採用判断: ❌ 却下**
理由:
- 本要件は **鳥瞰2D** であり、3D表現は不要
- バンドルサイズ 600KB+ は許容範囲外
- 学習コスト・実装コストが Phase 12 の工数予算を大幅に超える
- `Three.js` が真に必要な場面（3D球場・選手の3D立ち絵等）は今後の Phase で別途検討

---

## 3. 推奨案 C の詳細選定理由

### バンドルサイズへの影響

| 案 | 追加サイズ | 現在のバンドル比 |
|---|---|---|
| A, B, C（Pure） | 0KB（ブラウザ標準） | 変化なし |
| D（Pixi.js） | 約 430KB | +40%以上 |
| E（Three.js） | 約 600KB+ | +60%以上 |

Canvas 2D + SVG はいずれもブラウザ標準 API であり、**バンドルサイズへの影響はゼロ**。

### パフォーマンス目標達成見込み

スマホ（iPhone 12相当）での Canvas 2D 描画コスト試算:

```
フィールド背景描画: 約 0.5ms/frame
選手マーカー9個:   約 0.5ms/frame
ボール + 影:       約 0.2ms/frame
打球軌跡:          約 0.3ms/frame
─────────────────────────────────
合計:              約 1.5ms/frame

60fps 予算:        16.7ms/frame
余裕率:            約 91%（十分な余裕あり）
```

### React との統合

```typescript
// Canvas: useRef + useEffect パターン（確立された実装方法）
const canvasRef = useRef<HTMLCanvasElement>(null);
useEffect(() => {
  const ctx = canvasRef.current?.getContext('2d');
  if (ctx) renderBallpark(ctx, state, w, h);
}, [state]);

// SVG: JSX で直接記述（React コンポーネントとして完全統合）
<svg viewBox="0 0 300 240">
  <StrikeZoneGrid />
  {markers.map(m => <PitchMarkerSvg key={m.seq} marker={m} />)}
</svg>
```

---

## 4. 既存ライブラリとの関係

### framer-motion（検討）

- 現在未導入
- Phase 12 での使用箇所: スコア票のスライドイン演出（DESIGN-PHASE12-SCOREBOARD.md 参照）
- **Phase 12-A では CSS animation で対応**し、Phase 12-E での評価後に導入を検討
- サイズ: 約 40KB（min+gzip）→ 必要と判断すれば許容範囲

### canvas-confetti（Phase 12-E のみ）

- ホームラン演出の紙吹雪
- サイズ: 約 4KB（非常に軽量）
- Phase 12-E で必要と判断した場合のみ導入

### @types/jest-canvas-mock（devDependency）

- Canvas テスト用モック
- devDependency なのでバンドルサイズに影響なし
- Phase 12-A で導入予定

---

## 5. 技術選定の最終決定

| 要素 | 採用技術 | 理由 |
|---|---|---|
| グラウンド鳥瞰 | **Canvas 2D** | 多数オブジェクト + アニメーション最適 |
| ストライクゾーン | **SVG（inline）** | グリッド・テキスト・CSS animation との親和性 |
| スコア票アニメーション | **CSS animation** | シンプル・軽量。framer-motion は Phase 12-E で再検討 |
| ボールアニメーション | **Canvas 2D + requestAnimationFrame** | 60fps 維持に最適 |
| テスト | **jest-canvas-mock** (devDep) | Canvas のユニットテスト |
| ホームラン演出 | **canvas-confetti**（Phase 12-E のみ） | 4KB の軽量ライブラリ |

---

## 6. パフォーマンス検証計画（Phase 12-A）

Phase 12-A の完了条件として、以下の FPS テストを実施する。

### テスト手順

1. Phase 12-A 完了後、Ballpark コンポーネントのプロトタイプを作成
2. Chrome DevTools の Performance タブで FPS を計測
3. iPhone Safari で実機テスト（または BrowserStack）
4. 基準:
   - デスクトップ Chrome: 60fps 以上 → ✅
   - iPhone Safari（iPhone 12以上）: 60fps 以上 → ✅
   - iPhone Safari（iPhone X相当）: 30fps 以上 → ⚠️（Phase 12-E で最適化）
   - 30fps 以下 → 🚨（設計見直し、SVG フォールバックを検討）

### フォールバック戦略（基準未達時）

```
60fps 未達の場合の段階的対応:

1. オフスクリーン Canvas キャッシュ（静的背景を事前描画）
2. ボールアニメーション無効化オプション（reduce-motion に準ずる）
3. 描画要素の削減（影の省略等）
4. Canvas → SVG フォールバック（最終手段）
```
