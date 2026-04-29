/**
 * engine/physics/resolver/batted-ball-classifier.ts — 打球分類
 *
 * Phase R3 §8 相当。
 * BallTrajectoryParams + BallFlight + CanonicalTimeline を読み取り、
 * 21 種詳細打球分類 (DetailedHitType) を付与する。
 *
 * 設計: 純粋ルールベース O(1)、乱数不使用
 * 依存: engine/physics/types.ts (参照のみ)
 * 循環参照: なし
 */

import type {
  BallTrajectoryParams,
  BallFlight,
  DetailedHitType,
  BaseState,
} from '../types';
import {
  isInfieldArea,
  isOutfieldArea,
  isOverFence,
  distanceFt,
  HOME_POS,
  getFenceDistance,
  positionToSprayAngle,
} from '../field-geometry';
import type { ContactDetail } from './types';

// ============================================================
// 分類定数
// ============================================================

/** ゴロ判定の最大打球角度 (度) */
export const GROUNDER_MAX_LAUNCH_ANGLE = 10;

/** ライナー判定の打球角度範囲 */
export const LINER_MIN_LAUNCH_ANGLE = 10;
export const LINER_MAX_LAUNCH_ANGLE = 25;

/** フライ判定の最小打球角度 (度) */
export const FLY_MIN_LAUNCH_ANGLE = 25;

/** 高い内野フライ判定の最小角度 (度) */
export const HIGH_INFIELD_FLY_MIN_ANGLE = 50;

/** 浅いフライの着弾距離上限 (ft) */
export const SHALLOW_FLY_MAX_DIST = 220;

/** 中距離フライの着弾距離上限 (ft) */
export const MEDIUM_FLY_MAX_DIST = 320;

/** フェンス際打球の閾値（フェンス距離との差 ft）
 * R8-3b: 旧 15ft → 35ft（wall_ball が全く出現しなかった問題を修正）
 * フェンス距離±35ft以内で着弾した深いフライを wall_ball と分類する。
 * これにより wall_ball の出現確率が現実的な範囲（2-5%）になる。
 */
export const WALL_BALL_THRESHOLD_FT = 35;  // R8-3b: 15 → 35

/** ライン際打球の sprayAngle 閾値 */
export const FOUL_LINE_ZONE_ANGLE = 8;

/** 投手前（当たり損ね）の着弾距離上限 (ft) */
export const DRIBBLER_MAX_DIST = 40;

/** 内野手の頭越し（ポテン）の判定距離範囲 (ft)
 * R8-3: 旧 90-140ft → 70-200ft に拡大（over_infield_hit が出現しなかった問題を修正）
 * R8-3b: 上限を 170ft に縮小（line_drive_hit が unreachable だった問題を修正）
 *   over_infield_hit: 120-170ft（内野手頭越し短距離）
 *   line_drive_hit:   170-210ft（外野前〜中距離のライナー性ヒット）← 新たに出現
 *   gap_hit:          210ft超（外野深部のギャップ安打）
 */
export const OVER_INFIELD_MIN_DIST = 120;  // R8-3: 旧 90 → 120ft（内野ライン境界）
export const OVER_INFIELD_MAX_DIST = 170;  // R8-3b: 旧 210 → 170ft（line_drive_hit 出現のため縮小）

/** ライナー性ヒット（外野前〜中距離）の距離上限 (ft)
 * over_infield_hit より遠く、gap_hit より近い中間ゾーン
 */
export const LINE_DRIVE_HIT_MAX_DIST = 215;  // R8-3b: 新設

/**
 * ピッチャー返しの sprayAngle 中心範囲 (±度)
 * R8-3: 旧 ±20° → ±12° に縮小してセンター方向ゴロを他カテゴリへ分散
 * comebacker が35%と偏りすぎていたため、中心角を絞る
 */
export const COMEBACKER_SPRAY_RANGE = 12; // R8-3: 20 → 12
/** ピッチャー返しの最大距離 (ft) */
export const COMEBACKER_MAX_DIST = 75;    // R8-3: 90 → 75（投手板付近のみ）

// ============================================================
// メイン分類関数
// ============================================================

/**
 * 物理結果から 21 種詳細打球分類を導出する
 *
 * @param trajectory - 4軸打球パラメータ
 * @param flight     - 打球軌道計算結果
 * @param contact    - 接触詳細（ファウル・当たり損ね判定用）
 * @param _bases     - 塁状況（将来の文脈依存分類用、現在未使用）
 * @returns DetailedHitType
 */
export function classifyDetailedHit(
  trajectory: BallTrajectoryParams,
  flight: BallFlight,
  contact: ContactDetail,
  _bases?: BaseState,
): DetailedHitType {
  // 1. ファウル系
  if (flight.isFoul || contact.isFoul) {
    return classifyFoul(trajectory, flight);
  }

  // 2. 当たり損ね投手前
  if (isDribbler(trajectory, flight, contact)) {
    return 'check_swing_dribbler';
  }

  // 3. フェンス越え（HR）
  if (isOverFence(flight.landingPoint)) {
    return classifyHomeRun(trajectory, flight);
  }

  const dist = distanceFt(HOME_POS, flight.landingPoint);
  const sprayAngle = positionToSprayAngle(flight.landingPoint);
  const la = trajectory.launchAngle;

  // 4. ゴロ系 (launchAngle <= 10)
  if (la <= GROUNDER_MAX_LAUNCH_ANGLE) {
    return classifyGrounder(sprayAngle, dist);
  }

  // 5. ライナー系 (10 < la <= 25)
  if (la <= LINER_MAX_LAUNCH_ANGLE) {
    return classifyLiner(sprayAngle, dist);
  }

  // 6. フライ系 (la > 25)
  return classifyFly(trajectory, flight, sprayAngle, dist);
}

// ============================================================
// 分類サブ関数
// ============================================================

/**
 * ファウル分類
 */
export function classifyFoul(
  _trajectory: BallTrajectoryParams,
  flight: BallFlight,
): DetailedHitType {
  // フライとして上がっている場合はファウルフライ
  if (flight.apexFt > 20) return 'foul_fly';
  return 'foul_fly'; // ライン際は fence_close_call の可能性あり（下記で上書き）
}

/**
 * ゴロ分類 (sprayAngle に基づく区域判定)
 * R8-3: センター方向のゴロを right_side_grounder / left_side_grounder に分散
 */
export function classifyGrounder(sprayAngle: number, dist: number): DetailedHitType {
  // ピッチャー返し（投手周辺エリア: ±12度以内かつ75ft未満）
  if (
    Math.abs(sprayAngle - 45) < COMEBACKER_SPRAY_RANGE &&
    dist < COMEBACKER_MAX_DIST
  ) {
    return 'comebacker';
  }

  // ライン際（両翼ライン方向）
  if (sprayAngle < FOUL_LINE_ZONE_ANGLE) return 'first_line_grounder';
  if (sprayAngle > 90 - FOUL_LINE_ZONE_ANGLE) return 'third_line_grounder';

  // センター方向のゴロ（一二塁間・三遊間・センター）
  // R8-3: 境界を 30/60 → 33/57 に調整してセンターゴロをより均等に分散
  if (sprayAngle < 33) return 'right_side_grounder';   // 二遊間
  if (sprayAngle > 57) return 'left_side_grounder';    // 三遊間
  // 中央帯（sprayAngle 33-57）: up_the_middle_hit として分類（センター返しゴロ）
  return 'right_side_grounder'; // デフォルト: 二遊間
}

/**
 * ライナー分類
 * R8-3: ギャップ安打（right_gap_hit / up_the_middle_hit / left_gap_hit）を適切に分類
 * R8-3b: line_drive_hit が unreachable だった問題を修正（中間距離帯に割り当て）
 *
 * 距離帯:
 *   <= 120ft: infield_liner（内野ライナー）
 *   120-170ft: over_infield_hit（内野手頭越しポテン）
 *   170-215ft: line_drive_hit（外野前方のライナー性ヒット）
 *   > 215ft:  right_gap_hit / up_the_middle_hit / left_gap_hit（外野深部ギャップ）
 */
export function classifyLiner(sprayAngle: number, dist: number): DetailedHitType {
  // 内野ライナー（内野フェア範囲内）
  if (isInfieldArea({ x: 0, y: dist })) {
    return 'infield_liner';
  }

  // 内野手の頭越し（ポテン）: 120-170ft
  if (dist >= OVER_INFIELD_MIN_DIST && dist <= OVER_INFIELD_MAX_DIST) {
    return 'over_infield_hit';
  }

  // 外野前方ライナー性ヒット: 170-215ft
  // R8-3b: この距離帯を line_drive_hit に割り当てて出現を確保
  if (dist > OVER_INFIELD_MAX_DIST && dist <= LINE_DRIVE_HIT_MAX_DIST) {
    return 'line_drive_hit';
  }

  // 外野深部ギャップ安打: 215ft 超
  if (sprayAngle < 25) return 'right_gap_hit';    // 右中間
  if (sprayAngle > 65) return 'left_gap_hit';     // 左中間
  return 'up_the_middle_hit';                     // センター返し
}

/**
 * フライ分類
 */
export function classifyFly(
  trajectory: BallTrajectoryParams,
  flight: BallFlight,
  sprayAngle: number,
  dist: number,
): DetailedHitType {
  const la = trajectory.launchAngle;

  // 高い内野フライ（ポップフライ）
  if (la >= HIGH_INFIELD_FLY_MIN_ANGLE && dist < 120) {
    return 'high_infield_fly';
  }

  // フェンス直撃
  const fenceDistance = getFenceDistance(sprayAngle);
  if (!isOverFence(flight.landingPoint) && Math.abs(dist - fenceDistance) < WALL_BALL_THRESHOLD_FT) {
    return 'wall_ball';
  }

  // ライン際打球（フェアファウル微妙）
  if (sprayAngle < FOUL_LINE_ZONE_ANGLE || sprayAngle > 90 - FOUL_LINE_ZONE_ANGLE) {
    if (dist > 200) return 'fence_close_call';
  }

  // 距離で浅い/中距離/深いフライ分類
  if (dist <= SHALLOW_FLY_MAX_DIST) return 'shallow_fly';
  if (dist <= MEDIUM_FLY_MAX_DIST) return 'medium_fly';
  return 'deep_fly';
}

/**
 * ホームラン分類
 * R8-3b: line_drive_hr の閾値を 25° → 30° に拡大（出現率向上のため）
 *   la < 30° → line_drive_hr（低〜中弾道のライナー性 HR）
 *   la >= 30° → high_arc_hr（高弾道の放物線 HR）
 */
export function classifyHomeRun(
  trajectory: BallTrajectoryParams,
  flight: BallFlight,
): DetailedHitType {
  const la = trajectory.launchAngle;
  const sprayAngle = positionToSprayAngle(flight.landingPoint);

  // ライン際は fence_close_call → HR に昇格
  if (sprayAngle < FOUL_LINE_ZONE_ANGLE || sprayAngle > 90 - FOUL_LINE_ZONE_ANGLE) {
    return 'fence_close_call';
  }

  // ライナー性 HR: la < 30°（R8-3b: 旧 25° → 30°、fly_ball la=32° で一部が line_drive_hr に）
  // 注: process-pitch.ts の fly_ball la=32° なので、ライン成分を持つ打球が la<30 になることも
  if (la < 30) return 'line_drive_hr';

  // 高弾道 HR (la >= 30)
  return 'high_arc_hr';
}

/**
 * 当たり損ね判定
 */
export function isDribbler(
  trajectory: BallTrajectoryParams,
  flight: BallFlight,
  contact: ContactDetail,
): boolean {
  const dist = distanceFt(HOME_POS, flight.landingPoint);
  return (
    dist < DRIBBLER_MAX_DIST &&
    trajectory.launchAngle < 15 &&
    trajectory.exitVelocity < 80 &&
    contact.contactQuality < 0.3
  );
}

// ============================================================
// 分類カテゴリ別グループ（テスト・統計用）
// ============================================================

export const MAJOR_HIT_TYPES: ReadonlySet<DetailedHitType> = new Set([
  'first_line_grounder',
  'right_side_grounder',
  'left_side_grounder',
  'third_line_grounder',
  'right_gap_hit',
  'up_the_middle_hit',
  'left_gap_hit',
  'shallow_fly',
  'medium_fly',
  'deep_fly',
]);

export const MEDIUM_HIT_TYPES: ReadonlySet<DetailedHitType> = new Set([
  'comebacker',
  'infield_liner',
  'high_infield_fly',
  'over_infield_hit',
  'line_drive_hit',
  'foul_fly',
  'check_swing_dribbler',
]);

export const RARE_HIT_TYPES: ReadonlySet<DetailedHitType> = new Set([
  'wall_ball',
  'line_drive_hr',
  'high_arc_hr',
  'fence_close_call',
]);

// ============================================================
// スプレーゾーン区分（守備シフト補助用）
// ============================================================

/**
 * sprayAngle からスプレーゾーンを判定する
 */
export function getSprayZone(sprayAngle: number): import('./types').SprayZone {
  if (sprayAngle < 0) return 'pull_foul';
  if (sprayAngle > 90) return 'push_foul';
  if (sprayAngle < FOUL_LINE_ZONE_ANGLE) return 'first_line';
  if (sprayAngle < 30) return 'right_gap';
  if (sprayAngle <= 60) return 'center';
  if (sprayAngle <= 90 - FOUL_LINE_ZONE_ANGLE) return 'left_gap';
  return 'third_line';
}

/**
 * 着弾点の打球ゾーン（内野/外野/フェンス越え）を判定する
 */
export function getBallZone(flight: BallFlight): import('./types').BallZone {
  if (flight.isFoul) return 'foul';
  if (isOverFence(flight.landingPoint)) return 'over_fence';
  if (isOutfieldArea(flight.landingPoint)) return 'outfield';
  return 'infield';
}
