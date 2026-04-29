/**
 * Phase R5: engine/physics/* の UI 向け再エクスポート
 *
 * UI 側で重複実装していた物理計算関数を engine 側のものに統一する。
 * 本ファイルは UI レイヤーから engine の純粋関数へのアダプタとして機能し、
 * UI コードの import パスを安定させる。
 *
 * 使用方針:
 * - 軌道計算 (simulateTrajectory) → engine の解析式実装を使用
 * - 移動時間計算 (timeToTraverseFt) → engine の解析式実装を使用
 * - UI 独自の physics.ts にある関数は引き続き使用可（後方互換）
 *
 * 禁止: engine 結果の改変、engine の型定義の再定義
 */

// ============================================================
// 型再エクスポート（engine/physics/types.ts から）
// ============================================================

export type {
  PlayResolution,
  CanonicalTimeline,
  TimelineEvent,
  BallFlight,
  BallTrajectoryParams,
  FieldPosition,
  FieldPosition3D,
  DetailedHitType,
  BaseId,
  MovementProfile,
  MovementResult,
  ThrowProfile,
} from '../../engine/physics/types';

// ============================================================
// 関数再エクスポート（engine/physics/trajectory.ts から）
// ============================================================

export {
  simulateTrajectory,
  simulateBounces,
  GRAVITY_FT_PER_SEC2,
  KMH_TO_FT_PER_SEC,
  AIR_DRAG_COEFFICIENT,
  BACKSPIN_HANG_FACTOR,
} from '../../engine/physics/trajectory';

// ============================================================
// 関数再エクスポート（engine/physics/field-geometry.ts から）
// ============================================================

export {
  distanceFt as engineDistanceFt,
  sprayAngleToDirection,
  positionToSprayAngle,
  isInFairTerritory,
  isFoulSprayAngle,
  isOverFence,
  isInfieldArea,
  isOutfieldArea,
  getFenceDistance,
  HOME_POS,
  FIRST_BASE_POS,
  SECOND_BASE_POS,
  THIRD_BASE_POS,
  MOUND_POS,
  STANDARD_FIELDER_POSITIONS,
  BASE_DISTANCE_FT as ENGINE_BASE_DISTANCE_FT,
  FENCE_DOWN_LINE_FT,
  FENCE_CENTER_FT,
} from '../../engine/physics/field-geometry';

// ============================================================
// 関数再エクスポート（engine/physics/movement.ts から）
// ============================================================

export {
  speedStatToFtPerSec,
  armStatToFtPerSec,
  timeToTraverseFt,
  simulateMovement,
  makeRunnerProfile,
  makeFielderProfile,
  makeThrowProfile,
  timeToThrowFt,
  simulateThrow,
  batterRunCumulativeTimes,
} from '../../engine/physics/movement';
