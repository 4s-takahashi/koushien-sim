/**
 * Phase 12-C: グラウンド座標変換ユーティリティ
 *
 * 座標系:
 *   - 原点 (0,0) = ホームプレート
 *   - X: 右が正（一塁方向）
 *   - Y: 上が正（センター方向）
 *   - 単位: feet（MLB 標準）
 */

export interface FieldPoint {
  x: number; // feet（右=正）
  y: number; // feet（上=正）
}

export interface CanvasPoint {
  cx: number; // Canvas x（右=正）
  cy: number; // Canvas y（下=正、フィールド Y と逆）
}

/** 1 フィート当たりのピクセル数（450px ÷ 450 feet） */
export const FIELD_SCALE = 1.0; // px per foot

/**
 * フィールド座標 → Canvas 座標への変換
 *
 * ホームプレートを canvas の中央下（85% の高さ）に配置
 */
export function fieldToCanvas(
  p: FieldPoint,
  canvasWidth: number,
  canvasHeight: number,
): CanvasPoint {
  const cx = canvasWidth / 2 + p.x * FIELD_SCALE;
  const cy = canvasHeight * 0.85 - p.y * FIELD_SCALE;
  return { cx, cy };
}

/**
 * Canvas 座標 → フィールド座標への逆変換
 */
export function canvasToField(
  cp: CanvasPoint,
  canvasWidth: number,
  canvasHeight: number,
): FieldPoint {
  const x = (cp.cx - canvasWidth / 2) / FIELD_SCALE;
  const y = (canvasHeight * 0.85 - cp.cy) / FIELD_SCALE;
  return { x, y };
}

// ============================================================
// 主要ポジション座標（feet）
// ============================================================

/** 塁・ポジションの標準座標 */
export const FIELD_POSITIONS: Record<string, FieldPoint> = {
  // 塁
  home: { x: 0, y: 0 },
  first: { x: 90, y: 0 },
  second: { x: 0, y: 127 },
  third: { x: -90, y: 0 },

  // 守備ポジション
  pitcher: { x: 0, y: 60 },
  catcher: { x: 0, y: -8 },
  firstBase: { x: 70, y: 30 },
  secondBase: { x: 35, y: 85 },
  shortstop: { x: -30, y: 85 },
  thirdBase: { x: -70, y: 30 },
  leftField: { x: -130, y: 200 },
  centerField: { x: 0, y: 250 },
  rightField: { x: 130, y: 200 },

  // フェンス参考点
  leftFoulPole: { x: -330, y: 5 },
  rightFoulPole: { x: 330, y: 5 },
  leftCenterFence: { x: -200, y: 385 },
  rightCenterFence: { x: 200, y: 385 },
  centerFence: { x: 0, y: 400 },
};

/** ポジション名 → 標準フィールド座標のマッピング */
export const POSITION_TO_FIELD: Record<string, FieldPoint> = {
  pitcher: FIELD_POSITIONS.pitcher,
  catcher: FIELD_POSITIONS.catcher,
  first_base: FIELD_POSITIONS.firstBase,
  second_base: FIELD_POSITIONS.secondBase,
  shortstop: FIELD_POSITIONS.shortstop,
  third_base: FIELD_POSITIONS.thirdBase,
  left_field: FIELD_POSITIONS.leftField,
  center_field: FIELD_POSITIONS.centerField,
  right_field: FIELD_POSITIONS.rightField,
  // エンジンのポジション名にも対応
  p: FIELD_POSITIONS.pitcher,
  c: FIELD_POSITIONS.catcher,
  '1b': FIELD_POSITIONS.firstBase,
  '2b': FIELD_POSITIONS.secondBase,
  ss: FIELD_POSITIONS.shortstop,
  '3b': FIELD_POSITIONS.thirdBase,
  lf: FIELD_POSITIONS.leftField,
  cf: FIELD_POSITIONS.centerField,
  rf: FIELD_POSITIONS.rightField,
};

/**
 * 打球飛方向（角度 0=左翼ライン, 45=センター, 90=右翼ライン）と
 * 飛距離（feet）からフィールド座標を計算
 */
export function hitDirectionToField(
  directionDeg: number,
  distanceFeet: number,
): FieldPoint {
  // 角度を中心線（センター=0度）基準に変換
  const adjustedDeg = directionDeg - 45;
  const rad = (adjustedDeg * Math.PI) / 180;
  return {
    x: Math.sin(rad) * distanceFeet,
    y: Math.cos(rad) * distanceFeet,
  };
}

/**
 * ピッチのエンジン座標（5×5グリッド）→ ホームプレート付近のフィールド座標
 * ストライクゾーンは概ねホームプレートの直上
 */
export function pitchLocationToFieldPoint(location: {
  row: number;
  col: number;
}): FieldPoint {
  // ホームプレートはほぼ固定位置（投球がどこに来ても、フィールド上の表示はほぼ同じ場所）
  return { x: 0, y: 2 };
}
