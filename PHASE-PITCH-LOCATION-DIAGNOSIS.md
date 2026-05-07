# Pitch Location Pixel Quantization — Diagnosis Report

**Date**: 2026-05-07
**Investigator**: Claude Code

---

## Summary

Pitch location markers on the match screen always snap to one of 25 fixed pixel positions (a 5×5 grid) regardless of pitcher control ability. The root cause is a two-stage quantization pipeline:

1. **Engine stage** (`control-error.ts`): Continuous Gaussian error is applied to target row/col, then `Math.round()` snaps the result to the nearest integer (0–4). This discards the sub-cell fractional offset entirely.

2. **UI stage** (`pitch-marker-types.ts` + `match-store.ts`): `pitchLocationToUV()` maps the 5-integer values through fixed lookup arrays `[0.05, 0.2, 0.5, 0.8, 0.95]`, producing exactly 25 discrete UV coordinates — no sub-cell variation is possible.

---

## Affected Files and Line Numbers

### 1. `src/engine/match/pitch/control-error.ts` — Lines 25–26

```typescript
const actualRow = Math.max(0, Math.min(4, Math.round(target.row + rowError)));
const actualCol = Math.max(0, Math.min(4, Math.round(target.col + colError)));
```

- **Problem**: `Math.round()` discards the fractional part of the Gaussian error (e.g., `2 + 0.3` → `2`, losing the `+0.3` offset).
- The `PitchLocation` returned always has integer `row`/`col` values (0, 1, 2, 3, or 4).

### 2. `src/ui/match-visual/pitch-marker-types.ts` — Lines 44–55

```typescript
export function pitchLocationToUV(row: number, col: number): { x: number; y: number } {
  const rowMap = [0.05, 0.2, 0.5, 0.8, 0.95];
  const colMap = [0.05, 0.2, 0.5, 0.8, 0.95];
  return {
    x: colMap[col] ?? 0.5,
    y: rowMap[row] ?? 0.5,
  };
}
```

- **Problem**: Integer array lookup — only 5 possible x values and 5 possible y values, yielding exactly 25 possible pixel positions.
- Cannot represent sub-cell variation even if fractional row/col were passed.

### 3. `src/stores/match-store.ts` — Lines 384–391

```typescript
function pitchLocationToUV(row: number, col: number): { x: number; y: number } {
  const rowMap = [0.05, 0.2, 0.5, 0.8, 0.95];
  const colMap = [0.05, 0.2, 0.5, 0.8, 0.95];
  ...
}
```

- **Problem**: Same issue — private copy of the same array-lookup function.
- Used for `swingLocation` UV calculation (line 789) and step-mode display (line 930).

---

## Current Behavior Description

1. `applyControlError()` draws Gaussian errors and rounds them: e.g., for center (row=2, col=2) with control=70, both `rowError` and `colError` are drawn from Gaussian(0, 0.3), then `Math.round()` snaps to the nearest integer.

2. The resulting `PitchLocation` has only integer values. For a high-control pitcher targeting center (2,2), nearly all pitches get `actualRow = 2, actualCol = 2`.

3. `pitchLocationToUV(2, 2)` always returns exactly `{ x: 0.5, y: 0.5 }`.

4. The SVG marker in `StrikeZone.tsx` is always plotted at the same SVG coordinate — `uvToSvg(0.5, 0.5)` = `{ x: 170, y: 130 }` (center of the 5×5 SVG DRAW area).

5. For a pitcher with control=80 throwing 100 center strikes, all 100 markers will land at exactly pixel `(170, 130)` — appearing as a single stacked circle.

---

## Why It's Happening

The engine's Gaussian sampling was designed to model **which grid cell** the pitch lands in, not **where within that cell** it lands. The `Math.round()` snapping was intentionally conservative — it ensures a consistent strike/ball determination. However, this also eliminates all sub-cell position information that would make the visual display realistic.

The UV lookup table was designed to pair with integer grid values. It has never had a sub-cell interpolation path.

The net result: even though the Gaussian distribution correctly models the probability of landing in different cells, the visual marker always shows the center point of whichever cell was selected.

---

## Statistics Impact Assessment

Removing `Math.round()` directly from `applyControlError()` **would change game statistics**: a pitch targeting row=1 (high strike) with a +0.6 Gaussian error would yield `row = 1.6`, which still passes `isInStrikeZone()` (1.6 ≥ 1 ✓), but a +0.9 error would give `row = 1.9` (still strike), whereas with rounding it would give `row = 2` (still strike). The boundary issue: a target of row=3 with error +0.8 → row=3.8 → `3.8 ≤ 3` = **false** (ball), but with rounding → `round(3.8) = 4` → ball also. These coincide in most cases.

However, there are subtle differences for row=3 with error 0.6: fractional gives 3.6 (ball), rounded gives round(3.6) = 4 (ball) — same. For row=1 with error -0.6: fractional gives 0.4 (ball), rounded gives round(0.4) = 0 (ball) — same. The zone boundary issue is actually minimal because `isInStrikeZone()` checks integer ranges and fractional values near the boundary (e.g., 0.7 → ball in both cases since 0.7 < 1).

**Safest approach**: Keep the rounded integer for game logic, but additionally store the pre-round fractional offset (`rowExact`, `colExact`) in the `PitchLocation` so the UI can use it for display. This guarantees zero change to batting statistics.

---

## Proposed Fix

### Engine fix (`control-error.ts`)

Add `rowExact` / `colExact` optional fields to `PitchLocation` carrying the continuous pre-round values. The existing rounded `row`/`col` fields are unchanged (game logic is unaffected).

### UI fix (`pitch-marker-types.ts`)

Update `pitchLocationToUV()` to use fractional linear interpolation when `rowExact`/`colExact` are present, instead of the integer lookup table.

### Store fix (`match-store.ts`)

Update the private `pitchLocationToUV()` to use the same fractional path.

---

## Expected Outcome After Fix

- 100 center-strike pitches from a control=80 pitcher → ~50+ unique pixel coordinates (sub-cell scatter within the center cell)
- 100 center-strike pitches from a control=100 pitcher → ~1 unique pixel coordinate (perfect control, no scatter)
- Strike/ball statistics unchanged
