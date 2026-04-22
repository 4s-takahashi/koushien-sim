/**
 * Phase 12-B: ストライクゾーン投球マーカーの型定義
 * PitchMarker, SwingMarker, AtBatMarkerHistory
 */

/** 1球のマーカー */
export interface PitchMarker {
  /** 打席内の投球順（1始まり） */
  seq: number;
  /** UV座標 (0,0)=左上 (1,1)=右下 — ゾーン内外問わずプロット */
  position: { x: number; y: number };
  /** ストレート系 or 変化球系 */
  pitchClass: 'fastball' | 'breaking';
  /** 変化球の変化方向（正規化ベクトル）。ストレートは null */
  breakDirection: { dx: number; dy: number } | null;
  /** 球の結果 */
  result: 'strike' | 'ball' | 'foul' | 'in_play';
  /** 透明度 (1.0=最新, 0.3=最古) */
  opacity: number;
}

/** バットスイング位置マーカー */
export interface SwingMarker {
  /** UV座標 */
  position: { x: number; y: number };
  /** スイング結果 */
  swingResult: 'miss' | 'foul' | 'in_play';
}

/** 1打席分のマーカー履歴 */
export interface AtBatMarkerHistory {
  pitchMarkers: PitchMarker[];
  swingMarker: SwingMarker | null;
}

// ============================================================
// 座標変換
// ============================================================

/**
 * エンジンの 5×5 グリッド座標を UV 座標（0-1）に変換
 * row 0-4, col 0-4 → x, y ∈ [0, 1]
 */
export function pitchLocationToUV(
  row: number,
  col: number,
): { x: number; y: number } {
  // 0→0.05, 1→0.2, 2→0.5, 3→0.8, 4→0.95
  const rowMap = [0.05, 0.2, 0.5, 0.8, 0.95];
  const colMap = [0.05, 0.2, 0.5, 0.8, 0.95];
  return {
    x: colMap[col] ?? 0.5,
    y: rowMap[row] ?? 0.5,
  };
}

// ============================================================
// 変化球方向マッピング
// ============================================================

/**
 * 球種 → 変化方向ベクトル（右投げ基準）
 * dx: 正=右(外角方向), 負=左(内角方向)
 * dy: 正=下(低め), 負=上(高め)
 */
const PITCH_BREAK_DIRECTION_RHP: Record<
  string,
  { dx: number; dy: number } | null
> = {
  fastball: null,
  curve: { dx: 0.3, dy: 1 },
  curveball: { dx: 0.3, dy: 1 },
  slider: { dx: 1, dy: 0.3 },
  fork: { dx: 0, dy: 1.2 },
  changeup: { dx: 0.2, dy: 0.8 },
  cutter: { dx: -0.5, dy: 0.2 },
  sinker: { dx: 0.3, dy: 1 },
  splitter: { dx: 0, dy: 1.2 },
};

/**
 * 球種と投手の利き手から変化方向を取得
 * 左投げの場合は dx を反転
 */
export function getBreakDirection(
  pitchType: string,
  pitcherHand: 'left' | 'right',
): { dx: number; dy: number } | null {
  const key = pitchType.toLowerCase();
  const dir = PITCH_BREAK_DIRECTION_RHP[key];
  if (!dir) return null;
  if (pitcherHand === 'left') {
    return { dx: -dir.dx, dy: dir.dy };
  }
  return dir;
}

/**
 * 球種がストレート系かどうかを判定
 */
export function isFastballClass(pitchType: string): boolean {
  const key = pitchType.toLowerCase();
  return key === 'fastball' || key === 'straight';
}
