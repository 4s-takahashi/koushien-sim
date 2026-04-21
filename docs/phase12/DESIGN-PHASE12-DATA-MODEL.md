# Phase 12: データモデル拡張仕様

**担当フェーズ:** Phase 12-A〜D（段階的に追加）
**原則:** `src/engine/match/` は変更しない。表示層のみ変更。

---

## 1. 基本方針

エンジン（`src/engine/match/`）は一切変更しない。
視覚情報はすべて **表示層（projector / match-visual-store）** で派生させる。

```
[Engine] PitchResult / AtBatResult / MatchState
    ↓ (変換: matchProjector.ts)
[ViewState] MatchViewState  ← Phase 12-A で視覚フィールドを追加
    ↓ (変換: match-visual-store / useBallAnimation)
[Visual] BallparkRenderState / AtBatMarkerHistory / BallAnimationState
    ↓
[UI Components] Ballpark.tsx / StrikeZone.tsx / AnimatedScoreboard.tsx
```

---

## 2. `PitchLogEntry` の拡張（Phase 12-D 前提）

### 現状

```typescript
// src/ui/projectors/view-state-types.ts (既存)
export interface PitchLogEntry {
  inning: number;
  half: 'top' | 'bottom';
  pitchType: string;
  outcome: PitchOutcome;
  location: { row: number; col: number };
  batterId: string;
  batterName: string;
  batterSchoolShortName?: string;
  pitchSpeed?: number;
  pitchLocation?: PitchLocationLabel;
  pitchTypeLabel?: EnrichedPitchType;
  monologues?: MonologueEntry[];
}
```

### Phase 12 での拡張案

```typescript
// src/ui/projectors/view-state-types.ts への追加フィールド（オプショナル）

export interface PitchLogEntry {
  // --- 既存フィールド（変更なし） ---
  inning: number;
  half: 'top' | 'bottom';
  pitchType: string;
  outcome: PitchOutcome;
  location: { row: number; col: number };
  batterId: string;
  batterName: string;
  batterSchoolShortName?: string;
  pitchSpeed?: number;
  pitchLocation?: PitchLocationLabel;
  pitchTypeLabel?: EnrichedPitchType;
  monologues?: MonologueEntry[];

  // --- 🆕 Phase 12 追加フィールド（すべてオプショナル） ---

  /**
   * Phase 12-B: 変化球の変化方向ベクトル（正規化済み）。
   * ストライクゾーンマーカーの三角形向き計算に使用。
   * エンジンの PitchResult から matchProjector で計算する。
   */
  breakDirection?: { dx: number; dy: number } | null;

  /**
   * Phase 12-B: 打者がスイングした場合のコース（UV座標）。
   * ストライクゾーン上のバット位置マーカー描画に使用。
   * エンジンから直接取れないため、batterAction + location から推定する。
   */
  swingLocation?: { x: number; y: number } | null;

  /**
   * Phase 12-D: 打球の詳細情報（in_play の場合のみ）。
   * BallTrajectory 計算の元データとして使用。
   */
  batContact?: {
    contactType: 'ground_ball' | 'line_drive' | 'fly_ball' | 'popup' | 'bunt_ground';
    direction: number;   // 角度（度）: 0=左翼, 45=センター, 90=右翼
    speed: 'weak' | 'normal' | 'hard' | 'bullet';
    distance: number;    // フィート（概算）
    fieldResult: {
      type: string;      // FieldResultType: 'single' | 'home_run' etc.
      isError: boolean;
    };
  } | null;
}
```

### 変換ロジック（`match-store.ts` での追記）

```typescript
// match-store.ts の stepOnePitch / stepOneAtBat 内で
// pitchResult から追加フィールドを計算して PitchLogEntry に含める

// Phase 12-B: breakDirection
const breakDirection = computeBreakDirectionFromPitch(
  pitchResult.pitchSelection,
  pitcherHand, // MatchState から取得可能
);

// Phase 12-B: swingLocation
const swingLocation =
  pitchResult.batterAction === 'swing' || pitchResult.batterAction === 'bunt'
    ? pitchLocationToUV(pitchResult.actualLocation.row, pitchResult.actualLocation.col)
    : null;

// Phase 12-D: batContact
const batContact = pitchResult.batContact
  ? {
      contactType: pitchResult.batContact.contactType,
      direction: pitchResult.batContact.direction,
      speed: pitchResult.batContact.speed,
      distance: pitchResult.batContact.distance,
      fieldResult: {
        type: pitchResult.batContact.fieldResult.type,
        isError: pitchResult.batContact.fieldResult.isError,
      },
    }
  : null;
```

---

## 3. `MatchViewState` の拡張（Phase 12-A/C）

### 現状（matchProjector.ts の出力型）

```typescript
// src/ui/projectors/view-state-types.ts (既存の MatchViewState)
export interface MatchViewState {
  inningLabel: string;
  outsLabel: string;
  count: { balls: number; strikes: number };
  score: { home: number; away: number };
  inningScores: { home: number[]; away: number[] };
  homeSchoolName: string;
  homeSchoolId: string;
  homeSchoolShortName?: string;
  awaySchoolName: string;
  awaySchoolId: string;
  awaySchoolShortName?: string;
  bases: { first: RunnerBaseView | null; second: RunnerBaseView | null; third: RunnerBaseView | null; };
  pitcher: PitcherView;
  batter: BatterView;
  availableRelievers: RelieverView[];
  availablePinchHitters: PinchHitterView[];
  recentPitches: PitchLogEntry[];
  canBunt: boolean;
  canSteal: boolean;
  canPinchHit: boolean;
  canChangePitcher: boolean;
  pauseReason: PauseReason | null;
  runnerMode: RunnerMode;
  isPlayerBatting: boolean;
}
```

### Phase 12 での拡張案

```typescript
// Phase 12-A/C で追加するオプショナルフィールド
export interface MatchViewState {
  // --- 既存フィールド（省略） ---

  // --- 🆕 Phase 12-C 追加 ---

  /**
   * 現在の守備チームの各選手の守備位置（フィールド座標）。
   * Phase 12-C の Ballpark.tsx で選手マーカーを描画するために使用。
   * 型は `FieldPoint` だが循環参照を避けるため inline 定義。
   */
  fieldPositions?: Map<string, { x: number; y: number }>;

  /**
   * 走者情報の拡張（Ballpark で isPlayerTeam による色分けに使用）。
   * 現状の bases は runnerName しか持っていないため追加。
   */
  runnerTeams?: {
    first?: 'home' | 'away';
    second?: 'home' | 'away';
    third?: 'home' | 'away';
  };

  /**
   * 現在の投手の利き腕（Phase 12-B: 変化球方向計算に使用）。
   */
  pitcherHand?: 'left' | 'right';
}
```

### `matchProjector.ts` への追記

```typescript
// projectMatch 関数末尾に追加（Phase 12-C）

const fieldPositions = buildFieldPositions(state);
const runnerTeams = buildRunnerTeams(state);
const pitcherHand = getPitcherHand(state);

return {
  // ...既存フィールド,
  fieldPositions,   // Phase 12-C
  runnerTeams,      // Phase 12-C
  pitcherHand,      // Phase 12-B
};

/** 守備チームの各選手の守備位置を Map で返す */
function buildFieldPositions(
  state: MatchState,
): Map<string, { x: number; y: number }> | undefined {
  const fieldingTeam = state.currentHalf === 'top' ? state.homeTeam : state.awayTeam;
  const result = new Map<string, { x: number; y: number }>();

  for (const [playerId, position] of fieldingTeam.fieldPositions.entries()) {
    const fieldPt = POSITION_TO_FIELD[position];
    if (fieldPt) result.set(playerId, fieldPt);
  }
  return result;
}

/** 投手の利き腕を返す */
function getPitcherHand(state: MatchState): 'left' | 'right' {
  const fieldingTeam = state.currentHalf === 'top' ? state.homeTeam : state.awayTeam;
  const pitcher = fieldingTeam.players.find(
    (mp) => mp.player.id === fieldingTeam.currentPitcherId,
  );
  // Player.hand が存在する場合（型チェック）
  const hand = pitcher?.player?.hand;
  return hand === 'left' ? 'left' : 'right';
}
```

---

## 4. `match-visual-store.ts`（新規、Phase 12-B）

試合ビジュアル専用の Zustand ストア。`match-store.ts` とは完全に分離する。

```typescript
// src/stores/match-visual-store.ts

import { create } from 'zustand';
import type { PitchMarker, SwingMarker } from '../ui/match-visual/pitch-marker-types';

export interface MatchVisualState {
  /** 現打席のマーカー（最大10球） */
  currentAtBatMarkers: PitchMarker[];
  /** 現打席のスイングマーカー */
  swingMarker: SwingMarker | null;
  /** 前打席のマーカー（フェードアウト中） */
  prevAtBatMarkers: PitchMarker[];
  /** ストライクゾーン強調セル（Phase 12-E 拡張用） */
  highlightedCell?: { row: number; col: number } | null;
}

export interface MatchVisualActions {
  /** 投球マーカーを追加 */
  addPitchMarker: (marker: Omit<PitchMarker, 'seq' | 'opacity'>) => void;
  /** バットスイング位置を記録 */
  setSwingMarker: (marker: SwingMarker) => void;
  /** 打者交代時にクリア */
  clearForNextBatter: () => void;
  /** 試合リセット時にクリア */
  resetVisual: () => void;
}

type MatchVisualStore = MatchVisualState & MatchVisualActions;

const INITIAL_STATE: MatchVisualState = {
  currentAtBatMarkers: [],
  swingMarker: null,
  prevAtBatMarkers: [],
  highlightedCell: null,
};

export const useMatchVisualStore = create<MatchVisualStore>()((set, get) => ({
  ...INITIAL_STATE,

  addPitchMarker: (rawMarker) => {
    const { currentAtBatMarkers } = get();
    const seq = currentAtBatMarkers.length + 1;

    // 既存マーカーの透明度を段階的に下げる
    const updated = currentAtBatMarkers.map((m, i) => ({
      ...m,
      opacity: Math.max(0.3, 1 - (currentAtBatMarkers.length - i) * 0.12),
    }));

    const newMarker: PitchMarker = { ...rawMarker, seq, opacity: 1.0 };
    set({ currentAtBatMarkers: [...updated, newMarker].slice(-10) });
  },

  setSwingMarker: (marker) => set({ swingMarker: marker }),

  clearForNextBatter: () => {
    const { currentAtBatMarkers } = get();
    set({
      prevAtBatMarkers: currentAtBatMarkers,
      currentAtBatMarkers: [],
      swingMarker: null,
    });
  },

  resetVisual: () => set({ ...INITIAL_STATE }),
}));
```

---

## 5. `BallTrajectory`（打球軌跡、Phase 12-D）

```typescript
// src/ui/match-visual/useBallAnimation.ts に定義

/** 打球軌跡データ（エンジンの BatContactResult から計算） */
export interface BallTrajectory {
  /** 開始位置（ホームベース） */
  startPos: { x: number; y: number };
  /** 着弾予測地点 */
  endPos: { x: number; y: number };
  /** Bezier 制御点（最高点近くに設定） */
  controlPoint: { x: number; y: number };
  /** 最高到達点の正規化高さ（0〜1） */
  peakHeightNorm: number;
  /** 飛行時間（ms） */
  durationMs: number;
  /** 打球種別（描画スタイルに影響） */
  type: 'fly' | 'grounder' | 'line_drive' | 'home_run';
}
```

---

## 6. 既存型との後方互換性確保

| フィールド | 追加方法 | 既存コードへの影響 |
|---|---|---|
| `PitchLogEntry.breakDirection` | オプショナル追加 | 既存コードは参照しないため影響なし |
| `PitchLogEntry.swingLocation` | オプショナル追加 | 影響なし |
| `PitchLogEntry.batContact` | オプショナル追加 | 影響なし |
| `MatchViewState.fieldPositions` | オプショナル追加 | matchProjector.ts の既存テストは変更不要 |
| `MatchViewState.pitcherHand` | オプショナル追加 | 影響なし |

**型安全性確保のため:**
- TypeScript strict モードで全フィールドを `?` (optional) として追加
- 既存の `projectMatch` 関数の戻り値型に追加するだけで、呼び出し側（page.tsx等）は変更不要

---

## 7. persist の影響

### `match-visual-store.ts`

- **persist しない**（試合中のビジュアル状態のみ、セッションメモリで十分）
- ページリロード時は自動クリア（次の打席から再描画される）

### `match-store.ts` の `PitchLogEntry`

- 既存の persist 対象に含まれる
- 新フィールドはすべてオプショナルなので、旧バージョンのデータを localStorage から読み込んだ場合でも `undefined` として安全に扱える

---

## 8. 移行パス

```
Phase 12-A:
  MatchViewState に pitcherHand（オプショナル）追加
  matchProjector.ts に getPitcherHand() 追加

Phase 12-B:
  PitchLogEntry に breakDirection, swingLocation（オプショナル）追加
  match-visual-store.ts 新規作成
  match-store.ts の stepOnePitch/stepOneAtBat で breakDirection/swingLocation を計算・格納

Phase 12-C:
  MatchViewState に fieldPositions, runnerTeams（オプショナル）追加
  matchProjector.ts に buildFieldPositions(), buildRunnerTeams() 追加

Phase 12-D:
  PitchLogEntry に batContact（オプショナル）追加
  match-store.ts の stepOnePitch/stepOneAtBat で batContact を格納
```
