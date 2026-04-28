/**
 * engine/physics/field-geometry.ts — Layer 1: 球場座標系・距離計算
 *
 * Phase R1-2: 骨格 + 主要関数のインタフェース
 * 本実装の数値詳細は ACP（または後続実装）で埋める。
 *
 * 設計指針:
 * - 全関数は純粋関数（副作用なし）
 * - 座標系: 原点=ホームベース、x=右翼方向(+)、y=センター方向(+)、単位 feet
 * - 90 ft 塁間の標準球場（甲子園相当）
 */

import type { FieldPosition, FieldLandmarks, BaseId } from './types';
import type { Position } from '../types/player';

// ============================================================
// 球場定数
// ============================================================

/** 塁間距離 (ft) */
export const BASE_DISTANCE_FT = 90;

/** ホームから二塁までの直線距離 (ft) — 90 * sqrt(2) */
export const HOME_TO_SECOND_FT = 127.28;

/** 投手板からホームまでの距離 (ft) — 高校野球: 18.44m = 60.5ft */
export const MOUND_TO_HOME_FT = 60.5;

/** 外野フェンスまでの最短距離 (ft) — 両翼 */
export const FENCE_DOWN_LINE_FT = 325;

/** 外野フェンスまでの最長距離 (ft) — 中堅 */
export const FENCE_CENTER_FT = 400;

/** ファウルライン長 (ft) — フェンス到達まで */
export const FOUL_LINE_LENGTH_FT = 330;

// ============================================================
// 主要地点の座標
// ============================================================

export const HOME_POS: FieldPosition = { x: 0, y: 0 };
export const FIRST_BASE_POS: FieldPosition = { x: 63.64, y: 63.64 };  // 90 * cos(45°), sin(45°)
export const SECOND_BASE_POS: FieldPosition = { x: 0, y: 127.28 };
export const THIRD_BASE_POS: FieldPosition = { x: -63.64, y: 63.64 };
export const MOUND_POS: FieldPosition = { x: 0, y: 60.5 };

/** 標準守備位置 */
export const STANDARD_FIELDER_POSITIONS: ReadonlyMap<Position, FieldPosition> = new Map([
  ['pitcher', MOUND_POS],
  ['catcher', { x: 0, y: -3 }],
  ['first', { x: 80, y: 75 }],
  ['second', { x: 35, y: 145 }],
  ['third', { x: -80, y: 75 }],
  ['shortstop', { x: -35, y: 145 }],
  ['left', { x: -180, y: 280 }],
  ['center', { x: 0, y: 320 }],
  ['right', { x: 180, y: 280 }],
]);

// ============================================================
// 距離・角度
// ============================================================

/** 2点間のユークリッド距離 */
export function distanceFt(p1: FieldPosition, p2: FieldPosition): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * sprayAngle (0=右翼線, 45=センター, 90=左翼線) を球場座標方向ベクトルに変換
 * @param sprayAngle 度
 * @returns 単位ベクトル
 */
export function sprayAngleToDirection(sprayAngle: number): { x: number; y: number } {
  // 右翼線方向 (sprayAngle=0) は +x、センター (45) は +y、左翼線 (90) は -x
  // angle = 0 → (1, 0), angle = 45 → (0.707, 0.707), angle = 90 → (-1, 0)
  // ただし球場上は y > 0 なので、x = cos(2*angle), y = sin(2*angle*pi/180) のような形にはならない
  // 実際は angle 0 → x=cos(0°)=1, y=sin(0°)=0 ではなく、ファウルラインに沿うので
  // angle 0 (右翼線): direction = (cos(45°), sin(45°)) = (0.707, 0.707)
  // angle 45 (CF):    direction = (0, 1)
  // angle 90 (左翼線): direction = (-cos(45°), sin(45°)) = (-0.707, 0.707)
  const fieldAngleDeg = 45 - sprayAngle; // 0 → +45°(右翼線), 45 → 0°(CF基準), 90 → -45°(左翼線)
  // 球場の y 軸を基準とする極座標系
  const rad = (fieldAngleDeg * Math.PI) / 180;
  return { x: Math.sin(rad), y: Math.cos(rad) };
}

/**
 * 球場座標から sprayAngle (度) を逆算
 * @param pos 着弾点
 * @returns 0=右翼線, 45=CF, 90=左翼線
 */
export function positionToSprayAngle(pos: FieldPosition): number {
  // x=0, y>0 ならセンター方向 (sprayAngle=45)
  // x>0, y>0 なら右翼方向 (sprayAngle<45)
  // x<0, y>0 なら左翼方向 (sprayAngle>45)
  const angleFromYAxisDeg = (Math.atan2(pos.x, pos.y) * 180) / Math.PI;
  return 45 - angleFromYAxisDeg;
}

// ============================================================
// 塁の座標取得
// ============================================================

export function getBasePos(base: BaseId): FieldPosition {
  switch (base) {
    case 'home': return HOME_POS;
    case 'first': return FIRST_BASE_POS;
    case 'second': return SECOND_BASE_POS;
    case 'third': return THIRD_BASE_POS;
  }
}

// ============================================================
// ファウル判定
// ============================================================

/**
 * 着弾点がフェアかファウルか判定
 * 簡易版: x >= 0 で y >= -|x| なら右側フェア、x <= 0 で y >= |x| なら左側フェア
 * (45度のファウルラインを基準)
 */
export function isInFairTerritory(pos: FieldPosition): boolean {
  if (pos.y <= 0) return false;
  // ファウルラインは home から 45度方向に伸びる
  // 右ファウルライン: y = x (x > 0)
  // 左ファウルライン: y = -x (x < 0)
  // フェア領域は y > |x|
  return pos.y >= Math.abs(pos.x);
}

/**
 * sprayAngle がファウルか判定
 * 0-90 の範囲外（< 0 or > 90）はファウル
 */
export function isFoulSprayAngle(sprayAngle: number): boolean {
  return sprayAngle < 0 || sprayAngle > 90;
}

// ============================================================
// フェンス判定
// ============================================================

/**
 * 着弾点がフェンス越えか判定
 * 簡易楕円フェンスモデル: 両翼 325ft、中堅 400ft で線形補間
 */
export function isOverFence(pos: FieldPosition): boolean {
  if (!isInFairTerritory(pos)) return false;
  const distance = distanceFt(HOME_POS, pos);
  const sprayAngle = positionToSprayAngle(pos);
  const fenceDistance = getFenceDistance(sprayAngle);
  return distance > fenceDistance;
}

/**
 * sprayAngle における外野フェンスまでの距離
 * 0 (右翼線)= 325, 45 (CF) = 400, 90 (左翼線) = 325
 * 簡易: 二次関数で内挿
 */
export function getFenceDistance(sprayAngle: number): number {
  if (sprayAngle < 0 || sprayAngle > 90) return FENCE_DOWN_LINE_FT;
  // 二次関数: 中央 45° で最大、両端で最小
  const normalized = (sprayAngle - 45) / 45; // -1 〜 +1
  const lerp = 1 - normalized * normalized;  // 0 〜 1
  return FENCE_DOWN_LINE_FT + (FENCE_CENTER_FT - FENCE_DOWN_LINE_FT) * lerp;
}

// ============================================================
// 守備位置決定
// ============================================================

/**
 * 着弾点の最寄り守備位置を返す
 */
export function getNearestFieldingPosition(landingPoint: FieldPosition): Position {
  let minDist = Infinity;
  let nearest: Position = 'shortstop';
  for (const [pos, fielderPos] of STANDARD_FIELDER_POSITIONS) {
    const d = distanceFt(landingPoint, fielderPos);
    if (d < minDist) {
      minDist = d;
      nearest = pos;
    }
  }
  return nearest;
}

/**
 * 着弾点が内野範囲内か（塁線上を含む扇形領域内、120 ft 以内）
 */
export function isInfieldArea(pos: FieldPosition): boolean {
  return isInFairTerritory(pos) && distanceFt(HOME_POS, pos) <= 120;
}

/**
 * 着弾点が外野範囲（内野外、フェンス内）か
 */
export function isOutfieldArea(pos: FieldPosition): boolean {
  if (!isInFairTerritory(pos)) return false;
  const d = distanceFt(HOME_POS, pos);
  return d > 120 && !isOverFence(pos);
}

// ============================================================
// 球場ランドマーク統合
// ============================================================

export const STANDARD_FIELD_LANDMARKS: FieldLandmarks = {
  home: HOME_POS,
  first: FIRST_BASE_POS,
  second: SECOND_BASE_POS,
  third: THIRD_BASE_POS,
  mound: MOUND_POS,
  standardFielderPositions: STANDARD_FIELDER_POSITIONS,
  outfieldFence: generateFenceArc(),
  leftFoulLine: [HOME_POS, { x: -FOUL_LINE_LENGTH_FT * Math.cos(Math.PI / 4), y: FOUL_LINE_LENGTH_FT * Math.sin(Math.PI / 4) }],
  rightFoulLine: [HOME_POS, { x: FOUL_LINE_LENGTH_FT * Math.cos(Math.PI / 4), y: FOUL_LINE_LENGTH_FT * Math.sin(Math.PI / 4) }],
};

function generateFenceArc(samples = 19): FieldPosition[] {
  // sprayAngle 0〜90 を等間隔サンプリング
  const result: FieldPosition[] = [];
  for (let i = 0; i < samples; i++) {
    const sprayAngle = (i * 90) / (samples - 1);
    const dist = getFenceDistance(sprayAngle);
    const dir = sprayAngleToDirection(sprayAngle);
    result.push({ x: dir.x * dist, y: dir.y * dist });
  }
  return result;
}
