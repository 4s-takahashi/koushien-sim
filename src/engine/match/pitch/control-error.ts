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
  const errorRange = ((100 - control) / 100) * MATCH_CONSTANTS.CONTROL_ERROR_SCALE;
  const stddev = errorRange * 0.5;

  const rowError = rng.gaussian(0, stddev);
  const colError = rng.gaussian(0, stddev);

  const actualRow = Math.max(0, Math.min(4, Math.round(target.row + rowError)));
  const actualCol = Math.max(0, Math.min(4, Math.round(target.col + colError)));

  return { row: actualRow, col: actualCol };
}
