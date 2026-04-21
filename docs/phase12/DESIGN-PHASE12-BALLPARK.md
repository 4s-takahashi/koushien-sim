# Phase 12-C: グラウンド鳥瞰ビジュアル — 描画仕様・選手配置・HUD

**担当フェーズ:** Phase 12-C
**実装目標:** 3〜5日
**リファレンス:** [`assets/ballpark-reference.png`](./assets/ballpark-reference.png)

---

## 1. 目的

### なぜ鳥瞰グラウンドを追加するか

現状の試合画面はダイヤモンドアイコン（走者の有無）しかない。
プレイヤーには「守備陣がどこにいるか」「打球がどこに飛んでいるか」が伝わらず、
外野手の配置転換・シフトといった戦略的文脈が失われている。

鳥瞰グラウンド追加後:
- 9選手の守備位置が常時視覚化される
- 打球がどの方向に飛んだかが Bezier アニメで一目瞭然
- 左上HUDでスコア・カウントを常時確認できる

---

## 2. ワイヤーフレーム

### グラウンド描画エリア（デスクトップ）

```
┌────────────────────────────────────────────┐  450×450px
│                                            │
│                [観客席 グレー]              │
│         ┌─────────────────────┐            │
│         │   センター(CF)●     │            │
│         │   左翼(LF)●  右翼(RF)●           │
│  [ファ  │         [外野]          [ファ    │
│  ウル   │    三塁(3B)● ● 遊(SS)    ウル   │
│  ポール │    ●二塁(2B)    ● 一塁(1B)  ポ │
│  左黄]  │        ●投手(P)          ール   │
│         │           ▼             右黄]    │
│         │      [ホームベース]              │
│         │        捕手(C)●                 │
│         └─────────────────────┘            │
│                                            │
│  ┌─────────────────────────┐              │
│  │  左上HUD（オーバーレイ） │              │
│  │  B:2  S:1  O:1          │              │
│  │  7回表  佐渡北 1点      │              │
│  └─────────────────────────┘              │
└────────────────────────────────────────────┘
```

### 凡例（色分け）

| 要素 | 色 | 説明 |
|---|---|---|
| フィールド | #4caf50（鮮やかなグリーン） | 天然芝ゾーン |
| 内野土 | #e8c88a（ベージュ） | 内野スキンゾーン |
| ファウルゾーン | #4caf50（薄め） | 内野外周 |
| 観客席 | #9e9e9e（グレー） | 外周 |
| ファウルポール | #ffee58（黄色） | 左右の柱 |
| 自校選手 | #1565c0（青系） | 丸マーカー |
| 相手選手 | #c62828（赤系） | 丸マーカー |
| ボール | #ffffff（白）+ 影 | 小さい丸 |
| 走者（強調） | #f57f17（橙）+ グロー | 塁上の選手 |

---

## 3. Canvas 2D 描画仕様

### 3.1 座標系定義

```typescript
// src/ui/match-visual/field-coordinates.ts

/**
 * グラウンド座標系:
 * - 原点 (0, 0) = ホームベース位置
 * - X軸: 右方向がプラス（一塁方向）
 * - Y軸: 上方向がプラス（センター方向）
 * - 1単位 ≒ 1フィート（実際の野球グラウンドに準拠）
 * - スケール: Canvas 450px で 450フィート をカバー
 */
export const FIELD_SCALE = 450 / 450; // px per foot

/** フィールド上の論理座標（フィート単位） */
export interface FieldPoint {
  x: number; // フィートでの横座標（右=正）
  y: number; // フィートでの縦座標（上=正）
}

/** Canvas上のピクセル座標 */
export interface CanvasPoint {
  cx: number; // Canvas x（右=正）
  cy: number; // Canvas y（下=正、Canvas座標系はY反転）
}

/**
 * フィールド座標 → Canvas座標変換
 * ホームベースを Canvas の下中央に配置する
 */
export function fieldToCanvas(
  p: FieldPoint,
  canvasWidth: number,
  canvasHeight: number,
): CanvasPoint {
  const cx = canvasWidth / 2 + p.x * FIELD_SCALE;
  const cy = canvasHeight * 0.85 - p.y * FIELD_SCALE; // Y軸反転 + オフセット
  return { cx, cy };
}

/** 主要ポイントの定義（フィート単位） */
export const FIELD_POSITIONS = {
  home:    { x:   0, y:   0 },
  first:   { x:  90, y:   0 }, // 1塁ベース
  second:  { x:   0, y: 127 }, // 2塁ベース（実際は対角線）
  third:   { x: -90, y:   0 }, // 3塁ベース
  pitcher: { x:   0, y:  60 }, // マウンド
  // 守備位置（概算）
  catcher:     { x:   0, y:  -5 },
  firstBase:   { x:  70, y:  30 },
  secondBase:  { x:  35, y:  85 },
  shortstop:   { x: -30, y:  85 },
  thirdBase:   { x: -70, y:  30 },
  leftField:   { x:-130, y: 200 },
  centerField: { x:   0, y: 250 },
  rightField:  { x: 130, y: 200 },
} as const;
```

### 3.2 フィールド描画ロジック（純関数）

```typescript
// src/ui/match-visual/BallparkCanvas.ts

export interface BallparkRenderState {
  /** 自チームか否か（色分けのため） */
  isPlayerHome: boolean;
  /** 守備位置 Map<position, {x, y}> */
  fieldPositions: Map<string, FieldPoint>;
  /** 塁上の走者 */
  runners: { base: 'first' | 'second' | 'third'; isPlayerTeam: boolean }[];
  /** ボール現在位置（アニメーション中） */
  ballPosition?: FieldPoint;
  /** ボール高さ（影サイズ計算用、0=地面、1=最高点） */
  ballHeightNorm?: number;
}

/**
 * グラウンドを Canvas に描画する純関数。
 * React からは useRef で Canvas を取得し、この関数を呼ぶだけ。
 */
export function renderBallpark(
  ctx: CanvasRenderingContext2D,
  state: BallparkRenderState,
  canvasWidth: number,
  canvasHeight: number,
): void {
  // 1. 背景クリア
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // 2. 観客席（外周グレー）
  drawStands(ctx, canvasWidth, canvasHeight);

  // 3. 外野グリーン
  drawOutfield(ctx, canvasWidth, canvasHeight);

  // 4. 内野ダイヤモンド（ベージュ）
  drawInfield(ctx, canvasWidth, canvasHeight);

  // 5. ベースライン
  drawBaselines(ctx, canvasWidth, canvasHeight);

  // 6. ファウルポール（黄色）
  drawFoulPoles(ctx, canvasWidth, canvasHeight);

  // 7. ベース（白い四角）
  drawBases(ctx, canvasWidth, canvasHeight);

  // 8. 選手マーカー（丸）
  drawFielders(ctx, state, canvasWidth, canvasHeight);

  // 9. ボール + 影
  if (state.ballPosition) {
    drawBallWithShadow(ctx, state.ballPosition, state.ballHeightNorm ?? 0, canvasWidth, canvasHeight);
  }
}
```

### 3.3 フィールド描画の各要素

#### 外野グリーン（扇形）

```typescript
function drawOutfield(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const home = fieldToCanvas({ x: 0, y: 0 }, w, h);
  ctx.beginPath();
  ctx.moveTo(home.cx, home.cy);
  // 半径 250フィート、±45度の扇形（概算）
  ctx.arc(home.cx, home.cy, 250 * FIELD_SCALE, -Math.PI * 1.1, -Math.PI * 0.1);
  ctx.closePath();
  ctx.fillStyle = '#4caf50';
  ctx.fill();
}
```

#### 内野ダイヤモンド（ベージュ）

```typescript
function drawInfield(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const toC = (p: FieldPoint) => fieldToCanvas(p, w, h);
  ctx.beginPath();
  ctx.moveTo(toC(FIELD_POSITIONS.home).cx, toC(FIELD_POSITIONS.home).cy);
  ctx.lineTo(toC(FIELD_POSITIONS.first).cx, toC(FIELD_POSITIONS.first).cy);
  ctx.lineTo(toC(FIELD_POSITIONS.second).cx, toC(FIELD_POSITIONS.second).cy);
  ctx.lineTo(toC(FIELD_POSITIONS.third).cx, toC(FIELD_POSITIONS.third).cy);
  ctx.closePath();
  ctx.fillStyle = '#e8c88a';
  ctx.fill();
}
```

#### 選手マーカー（丸）

```typescript
function drawFielders(
  ctx: CanvasRenderingContext2D,
  state: BallparkRenderState,
  w: number,
  h: number,
): void {
  const FIELDER_POSITIONS: Record<string, FieldPoint> = {
    pitcher:    FIELD_POSITIONS.pitcher,
    catcher:    FIELD_POSITIONS.catcher,
    first_base: FIELD_POSITIONS.firstBase,
    // ... 全9ポジション
  };

  for (const [pos, fieldPt] of Object.entries(FIELDER_POSITIONS)) {
    const cp = fieldToCanvas(fieldPt, w, h);
    const isPlayer = state.isPlayerHome; // 色分け判定は別途

    ctx.beginPath();
    ctx.arc(cp.cx, cp.cy, 8, 0, Math.PI * 2); // 半径8px
    ctx.fillStyle = isPlayer ? '#1565c0' : '#c62828';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
```

#### ボール + 影（高さ表現）

```typescript
function drawBallWithShadow(
  ctx: CanvasRenderingContext2D,
  pos: FieldPoint,
  heightNorm: number, // 0.0（地面）〜1.0（最高点）
  w: number,
  h: number,
): void {
  const cp = fieldToCanvas(pos, w, h);

  // 影（ボールの真下、高さに応じて薄く小さく）
  const shadowRadius = 6 * (1 - heightNorm * 0.6); // 高いほど小さい
  const shadowAlpha = 0.5 * (1 - heightNorm * 0.5); // 高いほど薄い
  ctx.beginPath();
  ctx.ellipse(cp.cx, cp.cy + 2, shadowRadius, shadowRadius * 0.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
  ctx.fill();

  // ボール本体（高さに応じて上にオフセット + サイズ変化）
  const ballY = cp.cy - heightNorm * 40; // 最大40px上にオフセット
  const ballRadius = 5 + heightNorm * 3; // 近く=大きい（高い=遠い→小さい）
  // ※ 鳥瞰なので「高い = 遠い = 小さい」が物理的に正しい
  ctx.beginPath();
  ctx.arc(cp.cx, ballY, ballRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 1;
  ctx.stroke();
}
```

---

## 4. 選手配置ロジック

### 守備位置と FieldPositions のマッピング

```typescript
// src/ui/match-visual/field-coordinates.ts

import type { Position } from '../../engine/types/player';

/** エンジンの Position 型 → フィールド座標 マッピング */
export const POSITION_TO_FIELD: Record<Position, FieldPoint> = {
  pitcher:      { x:   0, y:  60 },
  catcher:      { x:   0, y:  -5 },
  first_base:   { x:  75, y:  25 },
  second_base:  { x:  35, y:  90 },
  shortstop:    { x: -30, y:  90 },
  third_base:   { x: -75, y:  25 },
  left_field:   { x:-135, y: 195 },
  center_field: { x:   0, y: 255 },
  right_field:  { x: 135, y: 195 },
  designated_hitter: { x: 0, y: -30 }, // DH は描画しない（非表示）
};
```

### 走者強調表示

```typescript
// 塁上に走者がいる場合、その選手マーカーをオレンジ色・グロー付きで強調

function drawRunnerHighlight(ctx: CanvasRenderingContext2D, base: FieldPoint, w: number, h: number): void {
  const cp = fieldToCanvas(base, w, h);
  // グロー効果
  ctx.shadowColor = '#ff9800';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(cp.cx, cp.cy, 10, 0, Math.PI * 2);
  ctx.fillStyle = '#f57f17';
  ctx.fill();
  ctx.strokeStyle = '#ff9800';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0; // リセット
}
```

---

## 5. 左上HUD コンポーネント

```typescript
// src/ui/match-visual/MatchHUD.tsx

interface MatchHUDProps {
  view: MatchViewState;
}

/**
 * グラウンドCanvas 左上に絶対配置されるコンパクトHUD。
 * スコア票非表示中も常時このHUDでスコアを確認できる。
 */
export function MatchHUD({ view }: MatchHUDProps): JSX.Element {
  return (
    <div className={styles.hud}>
      {/* カウント行 */}
      <div className={styles.hudCount}>
        <span className={styles.hudBalls}>B:{view.count.balls}</span>
        <span className={styles.hudSep}> </span>
        <span className={styles.hudStrikes}>S:{view.count.strikes}</span>
        <span className={styles.hudSep}> </span>
        <span className={styles.hudOuts}>
          {[0,1,2].map(i => (
            <span
              key={i}
              className={`${styles.hudOutDot} ${parseInt(view.outsLabel) > i ? styles.hudOutDotFilled : ''}`}
            />
          ))}
        </span>
      </div>
      {/* イニング行 */}
      <div className={styles.hudInning}>{view.inningLabel}</div>
      {/* スコア行 */}
      <div className={styles.hudScore}>
        <span className={styles.hudAway}>{view.awaySchoolShortName ?? view.awaySchoolName}</span>
        <span className={styles.hudScoreNum}>{view.score.away}</span>
        <span className={styles.hudDash}>-</span>
        <span className={styles.hudScoreNum}>{view.score.home}</span>
        <span className={styles.hudHome}>{view.homeSchoolShortName ?? view.homeSchoolName}</span>
      </div>
    </div>
  );
}
```

### HUD CSS

```css
/* HUD: Canvas左上にオーバーレイ */
.hud {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(10, 22, 40, 0.82);
  border: 1px solid rgba(42, 74, 110, 0.8);
  border-radius: 6px;
  padding: 6px 10px;
  pointer-events: none; /* クリック透過 */
  user-select: none;
}

.hudCount {
  font-size: 12px;
  color: #b0bec5;
  display: flex;
  align-items: center;
  gap: 4px;
}

.hudBalls  { color: #66bb6a; }
.hudStrikes { color: #ef5350; }
.hudInning  { font-size: 11px; color: #90a4ae; margin-top: 2px; }

.hudScore {
  font-size: 13px;
  font-weight: bold;
  color: #e8eaf0;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
}
```

---

## 6. Ballpark コンポーネント（React ラッパー）

```typescript
// src/ui/match-visual/Ballpark.tsx

interface BallparkProps {
  view: MatchViewState;
  ballAnimState?: BallAnimationState; // Phase 12-D で追加
  className?: string;
}

export function Ballpark({ view, ballAnimState, className }: BallparkProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 450, h: 450 });

  // ResizeObserver でサイズを動的計算
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const w = entry.contentRect.width;
      setCanvasSize({ w, h: w }); // 正方形を維持
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // 描画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderState = buildBallparkRenderState(view, ballAnimState);
    renderBallpark(ctx, renderState, canvasSize.w, canvasSize.h);
  }, [view, ballAnimState, canvasSize]);

  return (
    <div ref={containerRef} className={`${styles.ballparkContainer} ${className ?? ''}`}>
      <canvas
        ref={canvasRef}
        width={canvasSize.w}
        height={canvasSize.h}
        className={styles.ballparkCanvas}
        aria-label="グラウンド鳥瞰ビュー"
        role="img"
      />
      {/* HUD オーバーレイ */}
      <MatchHUD view={view} />
    </div>
  );
}

/** MatchViewState → BallparkRenderState の変換（純関数） */
function buildBallparkRenderState(
  view: MatchViewState,
  ballAnim?: BallAnimationState,
): BallparkRenderState {
  // TODO: view から守備位置情報を取得
  // Phase 12-C 時点では固定配置（全選手が標準守備位置）
  // Phase 12-D 以降で実際の守備位置に切り替え
  return {
    isPlayerHome: view.homeSchoolId === view.homeSchoolId, // 仮
    fieldPositions: new Map(), // Phase 12-C では固定
    runners: buildRunnersFromView(view),
    ballPosition: ballAnim?.currentPosition,
    ballHeightNorm: ballAnim?.heightNorm,
  };
}
```

---

## 7. 既存コードへの影響

| ファイル | 変更内容 | 影響度 |
|---|---|---|
| `page.tsx` | `<Diamond>` コンポーネントを `<Ballpark>` に置き換え（またはBallparkと並置） | 中 |
| `match.module.css` | グラウンドエリアの2カラムレイアウト追加 | 中 |
| `matchProjector.ts` | `fieldPositions` マップを MatchViewState に追加（オプショナル） | 小 |
| 新規: `Ballpark.tsx` | グラウンドコンポーネント | 新規 |
| 新規: `BallparkCanvas.ts` | Canvas描画純関数 | 新規 |
| 新規: `MatchHUD.tsx` | 左上HUD | 新規 |
| 新規: `field-coordinates.ts` | 座標変換ユーティリティ | 新規 |

### Phase 12-C 完了後の移行方針

既存の `<Diamond>` コンポーネント（走者表示アイコン）は:
- **Phase 12-C 実装時点では `<Ballpark>` が走者表示を内包するため、`<Diamond>` は非表示に**
- ただし DOM から完全に除去するのではなく、`<Diamond>` は残しておく（スマホで Ballpark が非表示の場合のフォールバック用）

---

## 8. パフォーマンス目標と事前試算

### 描画コスト試算（1フレーム）

| 描画要素 | Canvas 操作回数 | 推定時間 |
|---|---|---|
| フィールド背景（扇形・多角形） | 約 10 path | 0.5ms |
| ベースライン 4本 | 4 stroke | 0.2ms |
| 選手マーカー 9個 | 9 arc + fill + stroke | 0.5ms |
| 走者強調 最大3個 | 3 shadow + arc | 0.3ms |
| ボール + 影 | 2 ellipse/arc | 0.2ms |
| **合計** | | **約 1.7ms/frame** |

→ **60fps = 16.7ms/frame の中で余裕あり**。スマホでも 60fps 達成可能と見込む。

### アニメーション中の負荷

- Phase 12-D でボールアニメーション追加後も、requestAnimationFrame で毎フレーム全描画
- 1フレームの Canvas 操作は軽量（DOM 操作なし）なので 60fps 維持の見通し

---

## 9. テスト戦略

### 純関数テスト

```typescript
// src/ui/match-visual/__tests__/field-coordinates.test.ts
test('fieldToCanvas: ホームベースがCanvas中央下部に配置される', () => {
  const result = fieldToCanvas({ x: 0, y: 0 }, 450, 450);
  expect(result.cx).toBe(225); // 中央
  expect(result.cy).toBeCloseTo(450 * 0.85); // 下85%
});

test('fieldToCanvas: 一塁ベースが中央より右に配置される', () => {
  const first = fieldToCanvas({ x: 90, y: 0 }, 450, 450);
  const home = fieldToCanvas({ x: 0, y: 0 }, 450, 450);
  expect(first.cx).toBeGreaterThan(home.cx);
});
```

### Canvas描画テスト（Jest + jest-canvas-mock）

```typescript
// src/ui/match-visual/__tests__/BallparkCanvas.test.ts
import 'jest-canvas-mock';
import { renderBallpark } from '../BallparkCanvas';

test('renderBallpark は例外を throw しない', () => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const state = { isPlayerHome: true, fieldPositions: new Map(), runners: [] };
  expect(() => renderBallpark(ctx, state, 450, 450)).not.toThrow();
});
```

---

## 10. リスク・トレードオフ

| リスク | 内容 | 対応 |
|---|---|---|
| フィールドデザインの品質 | デザイナーなしで見栄え良くできるか | ballpark-reference.png のカラーパレットを厳守。グリーン/ベージュの配色で清潔感 |
| ResizeObserver の互換性 | 古いブラウザ未対応 | polyfill 追加 or CSS aspect-ratio で固定サイズにフォールバック |
| 守備位置の実際データ未整備 | `MatchState` に fieldPositions の詳細なし | Phase 12-C は固定座標。将来は matchProjector 拡張で動的化 |
| Canvas の高DPI対応 | Retina ディスプレイで滲む | `devicePixelRatio` を考慮した canvas.width/height 設定 |
