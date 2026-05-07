import type { RNG } from '../../core/rng';
import type { PitchLocation } from '../types';
import { MATCH_CONSTANTS } from '../constants';

/**
 * 投手の制球誤差を適用して実際の着弾コースを算出する
 *
 * errorRange = (100 - control) / 100 × 2.0
 * rowError / colError = gaussian(0, errorRange × 0.5)
 * actualRow / actualCol = clamp(round(target ± error), 0, 4)
 */
export function applyControlError(
  target: PitchLocation,
  control: number, // 実効コントロール値 (0-100)
  rng: RNG,
): PitchLocation {
  // 最低有効コントロールを10として極端な暴投を抑制
  const effectiveControl = Math.max(10, control);
  const errorRange = ((100 - effectiveControl) / 100) * MATCH_CONSTANTS.CONTROL_ERROR_SCALE;
  const stddev = errorRange * 0.5;

  const rowError = rng.gaussian(0, stddev);
  const colError = rng.gaussian(0, stddev);

  const rowRaw = target.row + rowError;
  const colRaw = target.col + colError;

  const actualRow = Math.max(0, Math.min(4, Math.round(rowRaw)));
  const actualCol = Math.max(0, Math.min(4, Math.round(colRaw)));

  // rowExact / colExact: 丸め前の連続座標（UI のサブセル散布描画用）
  // ゲームロジック（ストライク/ボール判定）は actualRow / actualCol の整数値のみ使用する。
  const rowExact = Math.max(0, Math.min(4, rowRaw));
  const colExact = Math.max(0, Math.min(4, colRaw));

  return { row: actualRow, col: actualCol, rowExact, colExact };
}
