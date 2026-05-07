# PHASE-PITCH-LOCATION-REPORT: 投球マーカーピクセル散布バグ修正 最終報告

作成日: 2026-05-07

## 1. 問題の概要

### バグ

高校野球シミュレータ「甲子園シム」の試合画面において、投球マーカー（ストライクゾーンの SVG 上にプロットされる球の軌跡）が 25 種類の固定ピクセル位置にしか描画されなかった。

- **現象**: センターストライク（row=2, col=2）への 100 球連続投球が、全て同一のピクセル座標 `(150.00, 130.00)` にプロットされた
- **期待動作**: 同じグリッドセル内でも、制球誤差の連続座標に基づくピクセルレベルのばらつきが生じるべきである

### 影響範囲

- 視覚的フィードバックのみ（投球結果の判定・打撃統計・ゲームバランスへの影響なし）

---

## 2. 根本原因

### 2段階量子化（Double Quantization）

```
目標位置 (row=2, col=2)
    ↓
applyControlError(): Gaussian誤差を加算
    ↓ Math.round()（ここで量子化①）
整数グリッド座標 (row=2, col=2)  ← 連続値が失われる
    ↓
pitchLocationToUV(): 固定ルックアップ配列 [0.05, 0.2, 0.5, 0.8, 0.95]
    ↓ 配列インデックス参照（量子化②）
固定 UV 座標 (x=0.5, y=0.5)  ← 5×5=25 点のみ
    ↓
SVG ピクセル座標 (150.00, 130.00)  ← 25 固定点
```

### 具体的なコード（修正前）

**`src/engine/match/pitch/control-error.ts`**:
```typescript
// 修正前: 連続値を Math.round で捨てていた
return {
  row: Math.max(0, Math.min(4, Math.round(target.row + rowError))),
  col: Math.max(0, Math.min(4, Math.round(target.col + colError))),
};
```

**`src/ui/match-visual/pitch-marker-types.ts`**:
```typescript
// 修正前: 5つの固定値からのルックアップのみ
const cellCenters = [0.05, 0.2, 0.5, 0.8, 0.95];
return { x: cellCenters[col], y: cellCenters[row] };
```

---

## 3. 修正内容

### 方針

- **後方互換性を維持**: `PitchLocation.row/col`（整数）はゲームロジックで引き続き使用
- **UI 専用の連続座標を追加**: `rowExact/colExact` フィールドで丸め前の値を保持
- **段階的フォールバック**: `rowExact/colExact` がない場合は従来の25点ルックアップに戻る

### 修正ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/engine/match/types.ts` | `PitchLocation` に `rowExact?: number`, `colExact?: number` を追加 |
| `src/engine/match/pitch/control-error.ts` | 丸め前の連続座標を `rowExact`/`colExact` として返す |
| `src/ui/match-visual/pitch-marker-types.ts` | `pitchLocationToUV()` を線形補間式に更新 |
| `src/ui/projectors/view-state-types.ts` | `PitchLogEntry.location` に `rowExact`/`colExact` を追加 |
| `src/stores/match-store.ts` | ローカル `pitchLocationToUV()` を補間式に更新、`rowExact`/`colExact` を伝播 |
| `src/ui/match-visual/useBallAnimation.ts` | `PitchResultVisual.actualLocation` に `rowExact`/`colExact` を追加 |
| `src/app/play/match/[matchId]/page.tsx` | `pitchLocationToUV()` 呼び出しに `rowExact`/`colExact` を追加 |

### キーとなる修正

**`applyControlError()` — 連続座標の保持**:
```typescript
const rowRaw = target.row + rowError;
const colRaw = target.col + colError;
const actualRow = Math.max(0, Math.min(4, Math.round(rowRaw)));
const actualCol = Math.max(0, Math.min(4, Math.round(colRaw)));
const rowExact = Math.max(0, Math.min(4, rowRaw));
const colExact = Math.max(0, Math.min(4, colRaw));
return { row: actualRow, col: actualCol, rowExact, colExact };
```

**`pitchLocationToUV()` — 線形補間式**:
```typescript
const cellCenters = [0.05, 0.2, 0.5, 0.8, 0.95] as const;
function continuousToUV(v: number): number {
  const clamped = Math.max(0, Math.min(4, v));
  const cellIdx = Math.floor(clamped);
  if (cellIdx >= 4) return cellCenters[4];
  const frac = clamped - cellIdx;
  return cellCenters[cellIdx]! + frac * (cellCenters[cellIdx + 1]! - cellCenters[cellIdx]!);
}
```

---

## 4. テスト

### 新規追加テスト

**`tests/ui/match-visual/pitch-pixel-scatter.test.ts`** — 5テスト:

| テスト | 内容 | 期待値 | 結果 |
|--------|------|--------|------|
| 中心散布 | control=70、100球投球のユニーク位置数 | ≥50 | PASS (100) |
| 後方互換 | `rowExact` なしで 5×5 グリッド全点 | =25 | PASS |
| 完璧制球 | control=100（stddev=0）でユニーク位置数 | =1 | PASS |
| ボールゾーン | row=0 へ control=60、100球投球 | ≥25 | PASS |
| 補間方向 | `colExact` 大→ UV x 大、`rowExact` 大→ UV y 大 | 方向正確 | PASS |

### 既存テスト

修正前から存在する全テスト（418件）が引き続き PASS。`isInStrikeZone()`、打撃判定、シーズン統計、その他エンジンロジックへの影響なし。

---

## 5. ゲームバランスへの影響

**なし**。

- `isInStrikeZone(row, col)` は整数 `row`/`col` のみ参照（変更なし）
- 打撃判定・アウトカウント・得点計算は `rowExact`/`colExact` を参照しない
- `applyControlError()` の Gaussian 分布パラメータは変更なし（ゲームの制球力バランス維持）

---

## 6. 効果

- **修正前**: 全投球が 25 固定ピクセル点のいずれかに集中
- **修正後**: control=70 の投手で 100 球投球時に 100 ユニーク位置（ピクセル散布が連続的）
- ストライクゾーン SVG 上でのマーカー分布が投手の制球力を視覚的に正確に反映するようになった

---

## 7. 参考

- 診断レポート: `PHASE-PITCH-LOCATION-DIAGNOSIS.md`
- 経過ログ: `processes/pitch-pixel-jitter.md`
- 新規テスト: `tests/ui/match-visual/pitch-pixel-scatter.test.ts`
