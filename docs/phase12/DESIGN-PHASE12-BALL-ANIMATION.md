# Phase 12-D: 投球・打球アニメーション詳細仕様

**担当フェーズ:** Phase 12-D
**実装目標:** 3〜5日（Phase 12-C完了後）

---

## 1. 目的

Phase 12-C でグラウンドに選手が配置された後、次のステップとして
**ボールが実際に動く**ことで「球場で見ている感」を完成させる。

### 実現するアニメーション

1. **投球**: マウンド → ホームベースへボールが移動
2. **打球**: ホームベース → 落下地点へ Bezier 曲線で飛ぶ
3. **ボールの影**: 高さに応じた影サイズ・透明度の変化
4. **速度表現**: 速い球は「一瞬で通過」、遅い球は「ゆっくり」

---

## 2. アニメーション仕様サマリー

| シーン | 開始状態 | 終了状態 | duration | easing |
|---|---|---|---|---|
| 投球（ストレート） | マウンド位置、小さい | ホームベース、大きい | 0.25s | ease-in |
| 投球（変化球） | マウンド位置 | ホームベース、Bezier 曲線 | 0.4s | ease-in-out |
| 打球（フライ） | ホームベース、小さい | 落下点、着地後消える | 0.8s | ease-out |
| 打球（ゴロ） | ホームベース | フィールド上を転がる | 0.5s | linear |
| 打球（ホームラン） | ホームベース | 外野スタンドへ消える | 1.2s | ease-out |
| 着地リング | 着地点（半径0） | 着地点（半径20px、消える） | 0.4s | ease-out |

---

## 3. 型定義

### `BallAnimationState`

```typescript
// src/ui/match-visual/useBallAnimation.ts

/** ボールアニメーションの現在状態 */
export interface BallAnimationState {
  /** フィールド上のボール現在位置 */
  currentPosition: FieldPoint;
  /** 高さの正規化値（0=地面、1=最高点） */
  heightNorm: number;
  /** アニメーション実行中か */
  isAnimating: boolean;
  /** 打球の場合: 落下軌跡 */
  trajectory?: BallTrajectory;
}

/** 打球軌跡データ */
export interface BallTrajectory {
  /** 開始位置（ホームベース付近） */
  startPos: FieldPoint;
  /** 着弾予測地点 */
  endPos: FieldPoint;
  /** 制御点（Bezier 曲線の中間点、高さ表現） */
  controlPoint: FieldPoint;
  /** 最高到達点の正規化高さ（0〜1） */
  peakHeightNorm: number;
  /** 飛行時間（ms） */
  durationMs: number;
  /** 打球種別 */
  type: 'fly' | 'grounder' | 'line_drive' | 'home_run';
}
```

### `BallTrajectory` の自動計算

```typescript
/**
 * PitchResult.batContact から BallTrajectory を計算する。
 * エンジンの BatContactResult を視覚情報に変換する。
 */
export function computeTrajectory(
  batContact: import('../../engine/match/types').BatContactResult,
): BallTrajectory {
  const { contactType, direction, speed, distance } = batContact;

  // direction: 0=左翼線, 45=センター, 90=右翼線（度）
  const angleRad = ((direction - 45) * Math.PI) / 180; // センターを0度に補正

  // distance: フィート単位（エンジン内部の推定距離）
  // 簡易スケール: 400ft = フィールドの外野最深部
  const scale = Math.min(distance / 400, 1.0); // 0〜1

  const endX = Math.sin(angleRad) * distance * 0.8; // 鳥瞰での水平距離
  const endY = Math.cos(angleRad) * distance * 0.8; // 縦距離（センター方向）

  const endPos: FieldPoint = { x: endX, y: endY };

  // 制御点: 中間高さ
  const peakHeightNorm =
    contactType === 'fly_ball' ? 0.8 :
    contactType === 'line_drive' ? 0.4 :
    contactType === 'ground_ball' ? 0.1 :
    0.6;

  const controlPoint: FieldPoint = {
    x: endX / 2,
    y: endY / 2 + (endY * peakHeightNorm * 0.5), // 中間で高く
  };

  const durationMs =
    speed === 'bullet' ? 500 :
    speed === 'hard'   ? 700 :
    speed === 'normal' ? 900 :
    1100; // weak

  return {
    startPos: { x: 0, y: 0 },
    endPos,
    controlPoint,
    peakHeightNorm,
    durationMs,
    type: contactType === 'fly_ball' ? 'fly' :
          contactType === 'ground_ball' ? 'grounder' :
          contactType === 'line_drive' ? 'line_drive' :
          'fly',
  };
}
```

---

## 4. アニメーションループ実装

### `useBallAnimation` フック

```typescript
// src/ui/match-visual/useBallAnimation.ts

import { useState, useCallback, useRef } from 'react';

/**
 * ボールアニメーションを管理するフック。
 * requestAnimationFrame を使って 60fps でボール位置を更新する。
 */
export function useBallAnimation(): {
  ballState: BallAnimationState | null;
  triggerPitchAnimation: (pitchResult: PitchResultVisual) => void;
  triggerHitAnimation: (trajectory: BallTrajectory) => void;
  resetBall: () => void;
} {
  const [ballState, setBallState] = useState<BallAnimationState | null>(null);
  const rafRef = useRef<number | null>(null);

  /** 投球アニメーション */
  const triggerPitchAnimation = useCallback((pitch: PitchResultVisual) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const startTime = performance.now();
    const duration = 250; // ms (ストレート)

    // 投球コースに応じた終了位置（ホームベース付近）
    const endPos = pitchLocationToFieldPoint(pitch.actualLocation);

    const animate = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = easeIn(t);

      // マウンド → ホームベース 線形補間
      const pos: FieldPoint = {
        x: lerp(FIELD_POSITIONS.pitcher.x, endPos.x, eased),
        y: lerp(FIELD_POSITIONS.pitcher.y, endPos.y, eased),
      };

      // 高さ: マウンドでは低め、空中で少し上がってから下がる
      const heightNorm = Math.sin(eased * Math.PI) * 0.15;

      setBallState({ currentPosition: pos, heightNorm, isAnimating: t < 1 });

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
  }, []);

  /** 打球アニメーション */
  const triggerHitAnimation = useCallback((trajectory: BallTrajectory) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const startTime = performance.now();

    const animate = (now: number) => {
      const t = Math.min((now - startTime) / trajectory.durationMs, 1);
      const eased = easeOut(t);

      // 2次 Bezier 曲線補間
      const pos = bezier2(trajectory.startPos, trajectory.controlPoint, trajectory.endPos, eased);

      // 高さ: 放物線（sin曲線で近似）
      const heightNorm = Math.sin(eased * Math.PI) * trajectory.peakHeightNorm;

      setBallState({
        currentPosition: pos,
        heightNorm,
        isAnimating: t < 1,
        trajectory,
      });

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        // 着地後0.3秒でボール消える
        setTimeout(() => setBallState(null), 300);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
  }, []);

  const resetBall = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setBallState(null);
  }, []);

  return { ballState, triggerPitchAnimation, triggerHitAnimation, resetBall };
}
```

### 補間ユーティリティ

```typescript
/** 線形補間 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** easeIn: ゆっくり始まって加速（投球=ドライブ感） */
function easeIn(t: number): number {
  return t * t;
}

/** easeOut: 速く始まって減速（打球=最高速度から着地へ） */
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** 2次 Bezier 曲線 */
function bezier2(p0: FieldPoint, p1: FieldPoint, p2: FieldPoint, t: number): FieldPoint {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}
```

---

## 5. 投球速度とアニメーション duration の対応

```typescript
/**
 * 投球速度（km/h）→ アニメーション duration（ms）
 * 快速球は短く（一瞬で通過）、遅い球は長く。
 *
 * 試算:
 * - マウンド〜ホームベース ≈ 18.44m
 * - 150km/h = 41.7m/s → 18.44m / 41.7m/s ≈ 0.44s（実際の飛行時間）
 * - 120km/h = 33.3m/s → 0.55s
 *
 * ゲーム上の視覚表現としては実際より短く（0.2〜0.5s）、
 * テンポを損なわない範囲で速度差が伝わる程度にする。
 */
export function pitchSpeedToDuration(speedKmh: number): number {
  // 160km/h → 200ms, 100km/h → 450ms の線形補間
  const clipped = Math.max(80, Math.min(170, speedKmh));
  return Math.round(450 - ((clipped - 80) / 90) * 250);
}
```

---

## 6. 影の高さ表現

```typescript
/**
 * ボール高さ（0〜1）から影のパラメータを計算する。
 *
 * heightNorm = 0 (地面):
 *   影サイズ = ボール半径と同じ
 *   影透明度 = 0.5（濃い）
 *   影Y オフセット ≈ 0
 *
 * heightNorm = 1 (最高点):
 *   影サイズ = ボール半径 × 0.4（小さい）
 *   影透明度 = 0.15（薄い）
 *   影Y オフセット ≈ 0（真下）
 */
export interface ShadowParams {
  radiusX: number;
  radiusY: number;
  alpha: number;
}

export function computeShadowParams(ballRadius: number, heightNorm: number): ShadowParams {
  const shrinkFactor = 1 - heightNorm * 0.6;
  return {
    radiusX: ballRadius * shrinkFactor,
    radiusY: ballRadius * shrinkFactor * 0.35, // 楕円形にする
    alpha: 0.5 * (1 - heightNorm * 0.7),
  };
}
```

---

## 7. ホームラン演出

```typescript
/** ホームラン検知時の追加演出 */
export function triggerHomeRunEffect(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
): void {
  // ファウルポール発光（黄色グロー）
  ctx.shadowColor = '#ffee58';
  ctx.shadowBlur = 30;
  // 左右のファウルポールを再描画（発光込み）
  drawFoulPoles(ctx, canvasWidth, canvasHeight);
  ctx.shadowBlur = 0;

  // 軌跡のトレイル（ボール軌道に点線）
  // Phase 12-E で実装予定
}

// Phase 12-E でのcanvas-confetti による紙吹雪（オプション）
// import confetti from 'canvas-confetti';
// confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
```

---

## 8. アニメーションと match-store の連携

### イベント駆動アニメーション

```typescript
// page.tsx 内での連携例

const { ballState, triggerPitchAnimation, triggerHitAnimation } = useBallAnimation();

// pitchLog の更新を監視してアニメーショントリガー
useEffect(() => {
  const latest = pitchLog[pitchLog.length - 1];
  if (!latest) return;

  // 投球アニメーション
  triggerPitchAnimation({
    actualLocation: latest.location,
    speedKmh: latest.pitchSpeed ?? 130,
    pitchType: latest.pitchTypeLabel,
  });

  // 打球アニメーション（in_play の場合）
  if (latest.outcome === 'in_play' && latest.batContact) {
    const trajectory = computeTrajectory(latest.batContact);
    // 投球アニメーション完了後（0.25s後）に打球アニメーション開始
    setTimeout(() => triggerHitAnimation(trajectory), 300);
  }
}, [pitchLog.length]);
```

### `PitchLogEntry` への `batContact` 追加

現状の `PitchLogEntry` には `batContact` が含まれていない。
Phase 12-D の前提として、`match-store.ts` の `stepOneAtBat` / `stepOnePitch` で
`pitchResult.batContact` を `PitchLogEntry` に含める必要がある。

→ **データモデル設計書（DESIGN-PHASE12-DATA-MODEL.md）を参照**

---

## 9. `prefers-reduced-motion` 対応

```typescript
// useBallAnimation.ts 内でモーション設定を確認

function shouldReduceMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// triggerPitchAnimation 内で
if (shouldReduceMotion()) {
  // アニメーションなし: ボールを最終位置に即時配置
  setBallState({ currentPosition: endPos, heightNorm: 0, isAnimating: false });
  return;
}
```

---

## 10. パフォーマンス目標

### フレームレート目標

| デバイス | 目標 fps | 備考 |
|---|---|---|
| デスクトップ（Chrome/Firefox） | 120fps | requestAnimationFrame 上限 |
| タブレット（iPad等） | 60fps | デフォルト目標 |
| スマートフォン（iPhone 12+） | 60fps | 達成可能と試算 |
| 低スペックスマホ | 30fps | 許容下限（それ以下はアニメーション省略） |

### 実装での配慮

- Canvas 全体を毎フレーム再描画（`clearRect` → 全要素描画）
- 静止要素（フィールド背景）の **オフスクリーン Canvas キャッシュ**（Phase 12-E で最適化）
  ```typescript
  // Phase 12-E 最適化予定
  const bgCanvas = document.createElement('canvas');
  renderStaticBackground(bgCanvas.getContext('2d')!); // 1回だけ描画
  // アニメーションフレームでは bgCanvas を drawImage で転写
  ctx.drawImage(bgCanvas, 0, 0);
  ```
- `requestAnimationFrame` を複数並行させない（1つの RAF ループで全描画を管理）

---

## 11. テスト戦略

```typescript
// src/ui/match-visual/__tests__/useBallAnimation.test.ts
import { renderHook, act } from '@testing-library/react';
import { useBallAnimation } from '../useBallAnimation';

test('triggerPitchAnimation: isAnimating が true になる', () => {
  const { result } = renderHook(() => useBallAnimation());
  act(() => {
    result.current.triggerPitchAnimation({ actualLocation: { row: 2, col: 2 }, speedKmh: 145, pitchType: 'fastball' });
  });
  expect(result.current.ballState?.isAnimating).toBe(true);
});

test('pitchSpeedToDuration: 160km/h は 200ms 以下', () => {
  expect(pitchSpeedToDuration(160)).toBeLessThanOrEqual(220);
});

test('bezier2: t=0 は始点', () => {
  const p = bezier2({ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 0 }, 0);
  expect(p.x).toBeCloseTo(0);
  expect(p.y).toBeCloseTo(0);
});
```

---

## 12. リスク・トレードオフ

| リスク | 内容 | 対応 |
|---|---|---|
| RAF ループの memory leak | コンポーネントアンマウント時に RAF が走り続ける | useEffect cleanup で `cancelAnimationFrame` |
| 自動進行との競合 | 自動進行（autoPlay）が高速の場合、アニメーション完了前に次の打席へ | アニメーション完了まで次の stepOneAtBat を遅延するか、アニメーションは途中で打ち切る（後者推奨） |
| 打球方向の精度 | エンジンの `direction` がシンプルな角度なので外野の詳細配置と合わない | 近似で十分（視覚的「あっちに飛んだ」が伝わればOK） |
| 60fps 下回り | 古いスマホで Canvas 描画が重い | オフスクリーンキャッシュ（Phase 12-E）+ FPS モニタリングで判定後に最適化 |
