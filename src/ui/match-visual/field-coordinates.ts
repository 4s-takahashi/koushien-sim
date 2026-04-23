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

/** 1 フィート当たりのピクセル数（動的スケーリング用ベース） */
export const FIELD_SCALE = 1.0; // px per foot (450px canvas 基準)

/** フィールド全体が収まるための最大半径 (feet)。外野フェンスまで 380ft */
/**
 * フィールドの最大半径（ft）
 * Phase 12-F: Canvas スケール計算の基準
 *
 * Phase 12-M/hotfix-5.1: 400ft → 325ft に縮小
 *   緑のフィールドを拡大表示するため、フィールドの「外周マージン」を減らす
 *   実際の外野半径 380ft よりわずかに大きい値にして、canvas 全体で緑が広く見えるように
 */
const FIELD_MAX_RADIUS_FT = 325;

/** ホームプレートの canvas 上の相対位置（Y方向、下ほど 1 に近い） */
const HOME_Y_RATIO = 0.92;

/**
 * フィールド座標 → Canvas 座標への変換
 *
 * Phase 12-F: Canvas の幅に応じて動的スケーリングし、
 * どんなサイズでもフィールド全体が収まるように調整。
 * ホームプレートは canvas の中央下（92% の高さ）に配置。
 */
export function fieldToCanvas(
  p: FieldPoint,
  canvasWidth: number,
  canvasHeight: number,
): CanvasPoint {
  // canvas サイズに応じたスケール（最小辺 / 最大フィールド半径の2倍）
  const scale = Math.min(canvasWidth, canvasHeight) / (FIELD_MAX_RADIUS_FT * 2);
  const cx = canvasWidth / 2 + p.x * scale;
  const cy = canvasHeight * HOME_Y_RATIO - p.y * scale;
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
  const scale = Math.min(canvasWidth, canvasHeight) / (FIELD_MAX_RADIUS_FT * 2);
  const x = (cp.cx - canvasWidth / 2) / scale;
  const y = (canvasHeight * HOME_Y_RATIO - cp.cy) / scale;
  return { x, y };
}

// ============================================================
// 主要ポジション座標（feet）
// ============================================================

/**
 * 塁・ポジションの標準座標
 *
 * Phase 12-F 修正 (2026-04-22):
 * 実際の野球ダイヤモンドに合わせ、1塁・3塁を 45° 方向に配置し直す。
 * 従来は 1st=(90,0), 3rd=(-90,0) でホームと水平に並んでいて「三角形」に見えていた。
 * 本来のダイヤモンド: 1st と 3rd はそれぞれ 45° 前方、距離 90ft で (±63.64, 63.64)。
 */
export const FIELD_POSITIONS: Record<string, FieldPoint> = {
  // 塁（正方形 90ft を 45° 回転させたダイヤモンド）
  home: { x: 0, y: 0 },
  first: { x: 63.64, y: 63.64 },
  second: { x: 0, y: 127.28 },
  third: { x: -63.64, y: 63.64 },

  // 守備ポジション（ダイヤモンド修正に合わせて配置微調整）
  pitcher: { x: 0, y: 60.5 },
  catcher: { x: 0, y: -8 },
  firstBase: { x: 72, y: 78 },
  secondBase: { x: 30, y: 120 },
  shortstop: { x: -30, y: 120 },
  thirdBase: { x: -72, y: 78 },
  leftField: { x: -150, y: 230 },
  centerField: { x: 0, y: 280 },
  rightField: { x: 150, y: 230 },

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
