# Phase 12-B: ストライクゾーン描画・マーカー仕様・履歴管理

**担当フェーズ:** Phase 12-B
**実装目標:** 3〜5日
**リファレンス:** [`assets/strike-zone-reference.png`](./assets/strike-zone-reference.png)

---

## 1. 目的

### なぜストライクゾーンを追加するか

現状は投球コースが「高め内角」などのテキストラベルのみ。
配球の流れ（外→内、高→低と揺さぶる等）がプレイヤーには見えない。

ストライクゾーン追加後:
- 各球の着弾点をマーカー（◯/△）で可視化
- ストレート=◯、変化球=△（頂点方向が変化方向）で球種判別可能
- 打席内の配球履歴が蓄積 → 「あと1球でどこに投げるか」という読み合いができる
- 色分け（ストライク=赤系、ボール=緑系）と番号で視覚的にわかりやすい

---

## 2. ワイヤーフレーム

### ストライクゾーン表示エリア

```
投手視点（キャッチャー後方カメラ）

        内角          外角
         ←              →
  ┌─────┬─────┬─────┐     ← 高め
  │     │①◯  │     │
  ├─────┼─────┼─────┤     ← 中段
  │②△→ │     │③◯  │
  ├─────┼─────┼─────┤     ← 低め
  │     │⑤△↓ │④△↑ │
  └─────┴─────┴─────┘

■  = バット振った位置（グレーの四角）

凡例:
  ◯ = ストレート（赤=ストライク、緑=ボール）
  △ = 変化球（頂点の向き = 変化方向）
  番号 = 投球順（①②③...）
```

### 境界外（ボール）の描画

ストライクゾーン3×3の外側に±30%マージンを設けた「描画エリア」を確保。
ゾーン外のボール球もこのマージン内に描画する。

```
┌─────────────────────────────┐  ← 描画エリア外境界
│  (ボール球マーカーが入る)    │
│   ┌─────┬─────┬─────┐      │  ← 3×3 ストライクゾーン
│   │     │     │     │      │
│   ├─────┼─────┼─────┤      │
│   │     │     │     │      │
│   ├─────┼─────┼─────┤      │
│   │     │     │     │      │
│   └─────┴─────┴─────┘      │
│                              │
└─────────────────────────────┘
```

---

## 3. 型定義

### `PitchMarker`（着弾点マーカー）

```typescript
// src/ui/match-visual/pitch-marker-types.ts

/** 1球あたりのマーカー情報 */
export interface PitchMarker {
  /** 投球番号（打席内での順番、1始まり） */
  seq: number;

  /** ストライクゾーン正規化座標 (0,0)=左上 (1,1)=右下 */
  position: { x: number; y: number };

  /** 球種分類: ストレート系 or 変化球系 */
  pitchClass: 'fastball' | 'breaking';

  /**
   * 変化球の場合の変化方向（ベクトル）。
   * 正規化済み（長さ1）。例: 右スライダーは { dx: 1, dy: 0 }
   * ストレートの場合は null。
   */
  breakDirection: { dx: number; dy: number } | null;

  /** 結果: strike（赤系）or ball（緑系）or foul（グレー）*/
  result: 'strike' | 'ball' | 'foul' | 'in_play';

  /** 古い球ほど透明度を下げるための係数（1.0 = 最新、0.3 = 古い）*/
  opacity: number;
}

/** バットスイング位置 */
export interface SwingMarker {
  /** ストライクゾーン正規化座標 */
  position: { x: number; y: number };
  /** スイングした打球結果 */
  swingResult: 'miss' | 'foul' | 'in_play';
}

/** 打席の着弾履歴（1打席分） */
export interface AtBatMarkerHistory {
  pitchMarkers: PitchMarker[];
  swingMarker: SwingMarker | null;
}
```

### `PitchLocation` → 正規化座標変換

```typescript
/**
 * エンジンの PitchLocation（5×5 グリッド）を
 * ストライクゾーン正規化UV座標（0〜1）に変換する。
 *
 * エンジン:  row/col 0-4 (ストライクゾーン中央 = row:2, col:2)
 * UV座標:    ストライクゾーン = (0.1, 0.1)〜(0.9, 0.9)
 *            外の境界マージン = ±0.3（ボール球は 0.0〜0.1, 0.9〜1.0 に配置）
 */
export function pitchLocationToUV(row: number, col: number): { x: number; y: number } {
  // 5段階グリッドを UV に線形マッピング
  // row 0→y=0.0, row 1→y=0.15, row 2→y=0.5, row 3→y=0.85, row 4→y=1.0
  const rowMap = [0.05, 0.2, 0.5, 0.8, 0.95];
  const colMap = [0.05, 0.2, 0.5, 0.8, 0.95];

  return {
    x: colMap[col] ?? 0.5,
    y: rowMap[row] ?? 0.5,
  };
}
```

---

## 4. SVG 描画仕様

### ストライクゾーン全体構造（SVG）

```tsx
// src/ui/match-visual/StrikeZone.tsx (抜粋)

const ZONE_SVG_W = 300; // SVG 論理幅
const ZONE_SVG_H = 240; // SVG 論理高さ

/** ストライクゾーン 3×3 グリッドの描画領域 */
const ZONE = {
  left:   60,   // px（左マージン）
  right:  240,  // px
  top:    30,   // px
  bottom: 210,  // px
};

// 描画エリア（マーカー配置可能な全体 = ZONE + マージン30%）
const DRAW = {
  left:   20,
  right:  280,
  top:    10,
  bottom: 230,
};

export function StrikeZone({ history }: { history: AtBatMarkerHistory }): JSX.Element {
  return (
    <svg
      viewBox={`0 0 ${ZONE_SVG_W} ${ZONE_SVG_H}`}
      className={styles.strikeZoneSvg}
      aria-label="ストライクゾーン配球履歴"
      role="img"
    >
      {/* 背景 */}
      <rect x={0} y={0} width={ZONE_SVG_W} height={ZONE_SVG_H} fill="rgba(13,33,55,0.9)" />

      {/* ストライクゾーン 3×3 グリッド */}
      <StrikeZoneGrid />

      {/* バットスイング位置 */}
      {history.swingMarker && <SwingMarkerSvg marker={history.swingMarker} />}

      {/* 投球マーカー（古い順に描画、最新が一番上） */}
      {history.pitchMarkers.map((m) => (
        <PitchMarkerSvg key={m.seq} marker={m} />
      ))}
    </svg>
  );
}
```

### ストライクゾーングリッド描画

```tsx
function StrikeZoneGrid(): JSX.Element {
  const cellW = (ZONE.right - ZONE.left) / 3;
  const cellH = (ZONE.bottom - ZONE.top) / 3;

  return (
    <g>
      {/* 外枠 */}
      <rect
        x={ZONE.left} y={ZONE.top}
        width={ZONE.right - ZONE.left} height={ZONE.bottom - ZONE.top}
        fill="rgba(255,255,255,0.05)"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={1.5}
      />
      {/* 縦線 */}
      {[1, 2].map(i => (
        <line
          key={`v${i}`}
          x1={ZONE.left + cellW * i} y1={ZONE.top}
          x2={ZONE.left + cellW * i} y2={ZONE.bottom}
          stroke="rgba(255,255,255,0.3)" strokeWidth={1}
        />
      ))}
      {/* 横線 */}
      {[1, 2].map(i => (
        <line
          key={`h${i}`}
          x1={ZONE.left} y1={ZONE.top + cellH * i}
          x2={ZONE.right} y2={ZONE.top + cellH * i}
          stroke="rgba(255,255,255,0.3)" strokeWidth={1}
        />
      ))}
      {/* 高め/低め ラベル */}
      <text x={ZONE.left - 4} y={ZONE.top + 8}    fontSize={9} fill="#607d8b" textAnchor="end">高</text>
      <text x={ZONE.left - 4} y={ZONE.bottom - 2}  fontSize={9} fill="#607d8b" textAnchor="end">低</text>
      {/* 内角/外角 ラベル（投手視点） */}
      <text x={ZONE.left + 10}  y={ZONE.top - 4} fontSize={9} fill="#607d8b" textAnchor="middle">内</text>
      <text x={ZONE.right - 10} y={ZONE.top - 4} fontSize={9} fill="#607d8b" textAnchor="middle">外</text>
    </g>
  );
}
```

### ◯マーカー（ストレート）

```tsx
function PitchMarkerSvg({ marker }: { marker: PitchMarker }): JSX.Element {
  const { x: uvX, y: uvY } = marker.position;

  // UV → SVG座標変換
  const svgX = DRAW.left + uvX * (DRAW.right - DRAW.left);
  const svgY = DRAW.top  + uvY * (DRAW.bottom - DRAW.top);

  const color =
    marker.result === 'strike' ? '#ef5350' :
    marker.result === 'ball'   ? '#66bb6a' :
    marker.result === 'foul'   ? '#78909c' :
    '#ffd54f'; // in_play

  if (marker.pitchClass === 'fastball') {
    // ◯ マーカー
    return (
      <g opacity={marker.opacity}>
        <circle cx={svgX} cy={svgY} r={10} fill={color} fillOpacity={0.3} stroke={color} strokeWidth={2} />
        {/* 番号 */}
        <text x={svgX} y={svgY + 4} textAnchor="middle" fontSize={9} fill={color} fontWeight="bold">
          {marker.seq}
        </text>
      </g>
    );
  }

  // △ マーカー（変化球）
  return (
    <TriangleMarker
      cx={svgX} cy={svgY}
      breakDir={marker.breakDirection}
      color={color}
      seq={marker.seq}
      opacity={marker.opacity}
    />
  );
}
```

### △マーカー（変化球 — 頂点が変化方向）

```tsx
interface TriangleMarkerProps {
  cx: number;
  cy: number;
  breakDir: { dx: number; dy: number } | null;
  color: string;
  seq: number;
  opacity: number;
}

function TriangleMarker({ cx, cy, breakDir, color, seq, opacity }: TriangleMarkerProps): JSX.Element {
  const R = 10; // 外接円半径

  // breakDir から回転角を計算（ベクトルの角度）
  const angle = breakDir
    ? Math.atan2(breakDir.dy, breakDir.dx) // SVG Y軸は下向きなので注意
    : -Math.PI / 2; // デフォルト: 上向き

  // 二等辺三角形の頂点3つ（外接円半径 R、回転 angle）
  const points = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].map((offset) => {
    const a = angle + offset;
    return {
      x: cx + R * Math.cos(a),
      y: cy + R * Math.sin(a),
    };
  });

  const pointsStr = points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <g opacity={opacity}>
      <polygon
        points={pointsStr}
        fill={color}
        fillOpacity={0.3}
        stroke={color}
        strokeWidth={2}
      />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={9} fill={color} fontWeight="bold">
        {seq}
      </text>
    </g>
  );
}
```

### バットスイング位置マーカー

```tsx
function SwingMarkerSvg({ marker }: { marker: SwingMarker }): JSX.Element {
  const { x: uvX, y: uvY } = marker.position;
  const svgX = DRAW.left + uvX * (DRAW.right - DRAW.left);
  const svgY = DRAW.top  + uvY * (DRAW.bottom - DRAW.top);

  const color =
    marker.swingResult === 'in_play' ? '#ffd54f' :
    marker.swingResult === 'foul'    ? '#78909c' :
    '#455a64'; // miss

  return (
    <rect
      x={svgX - 8} y={svgY - 4}
      width={16} height={8}
      rx={2}
      fill={color}
      fillOpacity={0.4}
      stroke={color}
      strokeWidth={1.5}
    />
  );
}
```

---

## 5. アニメーション仕様

### マーカー出現アニメーション

| シーン | アニメーション | duration | easing |
|---|---|---|---|
| 新しいマーカー追加（通常） | スケールイン + フェードイン | 200ms | ease-out |
| ストライク判定 | 赤マーカーに外側リングパルス | 600ms | ease-out |
| ボール判定 | 緑マーカーに軽いバウンス（Y軸-3px → 元位置） | 300ms | bounce |

### SVG アニメーション実装

```tsx
// ストライクのパルス（SVG SMIL animation または CSS animation）
function StrikePulseRing({ cx, cy, color }: { cx: number; cy: number; color: string }): JSX.Element {
  return (
    <circle cx={cx} cy={cy} r={10} fill="none" stroke={color} strokeWidth={2}>
      <animate
        attributeName="r"
        from="10" to="20"
        dur="0.6s"
        begin="0s"
        fill="freeze"
      />
      <animate
        attributeName="opacity"
        from="1" to="0"
        dur="0.6s"
        begin="0s"
        fill="freeze"
      />
    </circle>
  );
}
```

**代替案:** CSS animation + `@keyframes`。SVG SMIL は一部環境で非推奨のため、
CSS animation 版も用意しておく。

---

## 6. 履歴管理（打席間クリア）

```typescript
// src/stores/match-visual-store.ts

import { create } from 'zustand';
import type { PitchMarker, SwingMarker, AtBatMarkerHistory } from '../ui/match-visual/pitch-marker-types';

interface MatchVisualState {
  /** 現在の打席のマーカー履歴（最大10球） */
  currentAtBatMarkers: PitchMarker[];
  /** 現在の打席のスイングマーカー（最後のスイングのみ保持） */
  swingMarker: SwingMarker | null;
  /** 前の打席のマーカー（フェードアウト演出用、オプション） */
  prevAtBatMarkers: PitchMarker[];

  /** 新しいマーカーを追加する */
  addPitchMarker: (marker: Omit<PitchMarker, 'seq' | 'opacity'>) => void;
  /** バット位置を記録する */
  setSwingMarker: (marker: SwingMarker) => void;
  /** 打席終了時にクリア（次打者に切り替え） */
  clearForNextBatter: () => void;
}

export const useMatchVisualStore = create<MatchVisualState>()((set, get) => ({
  currentAtBatMarkers: [],
  swingMarker: null,
  prevAtBatMarkers: [],

  addPitchMarker: (rawMarker) => {
    const { currentAtBatMarkers } = get();
    const newSeq = currentAtBatMarkers.length + 1;

    // 古いマーカーの透明度を下げる
    const updated = currentAtBatMarkers.map((m, i) => ({
      ...m,
      opacity: Math.max(0.3, 1 - (currentAtBatMarkers.length - i) * 0.1),
    }));

    const newMarker: PitchMarker = {
      ...rawMarker,
      seq: newSeq,
      opacity: 1.0,
    };

    // 最大10球まで保持
    set({
      currentAtBatMarkers: [...updated, newMarker].slice(-10),
    });
  },

  setSwingMarker: (marker) => set({ swingMarker: marker }),

  clearForNextBatter: () => {
    const { currentAtBatMarkers } = get();
    set({
      prevAtBatMarkers: currentAtBatMarkers, // 前打席として保持（フェードアウト用）
      currentAtBatMarkers: [],
      swingMarker: null,
    });
  },
}));
```

### 打席切り替えの検知

```typescript
// page.tsx または専用フックで pitchLog を watch

useEffect(() => {
  const { clearForNextBatter } = useMatchVisualStore.getState();
  const lastEntry = pitchLog[pitchLog.length - 1];
  const prevEntry = pitchLog[pitchLog.length - 2];

  if (!lastEntry || !prevEntry) return;

  // 打者 ID が変わったらクリア
  if (lastEntry.batterId !== prevEntry.batterId) {
    clearForNextBatter();
  }
}, [pitchLog]);
```

---

## 7. 変化球の方向マッピング

```typescript
// src/ui/match-visual/pitch-marker-types.ts

import type { EnrichedPitchType } from '../projectors/view-state-types';

/**
 * 球種 → 変化方向の標準ベクトルマッピング。
 * 投手視点（右投げ右打者 = 内角=右側）。
 *
 * dx: 正=右（外角）, 負=左（内角）
 * dy: 正=下（低め）, 負=上（高め）
 */
export const PITCH_BREAK_DIRECTION: Record<EnrichedPitchType, { dx: number; dy: number } | null> = {
  fastball:   null,           // ストレート = ◯
  slider:     { dx: 1, dy: 0.3 },   // スライダー = 右斜め下
  curveball:  { dx: 0.5, dy: 1 },   // カーブ = 右下（大きく落ちる）
  changeup:   { dx: 0, dy: 1 },     // チェンジアップ = 真下
  splitter:   { dx: 0, dy: 1.2 },   // フォーク = 真下（急落）
};

/**
 * 左投手の場合は dx を反転する。
 */
export function getBreakDirection(
  pitchType: EnrichedPitchType,
  pitcherHand: 'left' | 'right',
): { dx: number; dy: number } | null {
  const dir = PITCH_BREAK_DIRECTION[pitchType];
  if (!dir) return null;
  if (pitcherHand === 'left') {
    return { dx: -dir.dx, dy: dir.dy };
  }
  return dir;
}
```

---

## 8. 既存コードへの影響

| ファイル | 変更内容 | 影響度 |
|---|---|---|
| `match-store.ts` | `stepOneAtBat` / `stepOnePitch` 後に `matchVisualStore.addPitchMarker` を呼ぶ | 小（副作用追加） |
| `page.tsx` | ストライクゾーンコンポーネントを追加、打者切り替え検知 | 中 |
| `match.module.css` | ストライクゾーンエリアのレイアウト | 中 |
| 新規: `StrikeZone.tsx` | ストライクゾーン SVG コンポーネント | 新規 |
| 新規: `pitch-marker-types.ts` | マーカー型定義 | 新規 |
| 新規: `match-visual-store.ts` | 打席別マーカー履歴ストア | 新規 |

---

## 9. パフォーマンス目標

- SVG 要素数: 1打席最大10球 × (1マーカー + 1テキスト) + グリッド ≈ 30要素
- DOM 操作は React の差分更新に任せる
- アニメーションは CSS animation / SVG SMIL で GPU 処理
- `prefers-reduced-motion` 時はアニメーションなし（マーカーが即時表示）

---

## 10. テスト戦略

```typescript
// src/ui/match-visual/__tests__/pitch-marker-types.test.ts

test('pitchLocationToUV: ストライクゾーン中央 (row=2, col=2) が UV (0.5, 0.5) になる', () => {
  const uv = pitchLocationToUV(2, 2);
  expect(uv.x).toBeCloseTo(0.5);
  expect(uv.y).toBeCloseTo(0.5);
});

test('getBreakDirection: 右投げスライダーは右下方向', () => {
  const dir = getBreakDirection('slider', 'right');
  expect(dir).not.toBeNull();
  expect(dir!.dx).toBeGreaterThan(0); // 右
  expect(dir!.dy).toBeGreaterThan(0); // 下
});

test('getBreakDirection: 左投げスライダーは左下方向（dx反転）', () => {
  const dir = getBreakDirection('slider', 'left');
  expect(dir!.dx).toBeLessThan(0); // 左
});
```

---

## 11. リスク・トレードオフ

| リスク | 内容 | 対応 |
|---|---|---|
| 変化球方向の正確さ | 右/左投手 × 球種の組み合わせが複雑 | 標準マッピングテーブルで管理、テストで網羅 |
| 色覚多様性対応 | 赤/緑の色分けが見えにくい人がいる | ◯/△の形状区別 + 番号の3重冗長で対応済み |
| SVG SMIL 廃止懸念 | Chrome では既に非推奨扱い | CSS animation フォールバックを並行で用意 |
| 打席切り替え検知のタイミング | stepOneAtBat 後に pitchLog が更新されるタイミングズレ | useEffect の依存配列に pitchLog.length を含める |
