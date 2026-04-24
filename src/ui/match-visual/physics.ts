/**
 * v0.41.0: 打球・守備・走塁の物理モデル
 *
 * 単位統一:
 *   - 距離: feet (MLB 標準、ホーム(0,0)基準)
 *   - 速度: feet/sec
 *   - 時間: ms
 *
 * 設計方針:
 *   各 phase の start/end を「物理的な時刻」(距離÷速度×1000) で算出し、
 *   打球・守備・走塁が同じタイムラインで動く「俯瞰リアルタイムシミュ」を実現する。
 *
 * field-result.ts の結果（single/double/out 等）を正解として扱い、
 * 物理アニメはそれに辻褄を合わせる（走塁は結果に応じた塁で止まる）。
 */

import type { FieldPoint } from './field-coordinates';

// ============================================================
// 速度マップ
// ============================================================

/**
 * 選手の走力 stat (0-100) を feet/sec に変換
 *
 * speed=50 → 25 ft/s (≈ 7.6 m/s, 野手平均)
 * speed=100 → 30 ft/s (超速)
 * speed=0   → 18 ft/s (鈍足)
 */
export function playerSpeedFtPerSec(statSpeed: number): number {
  const s = Math.max(0, Math.min(100, statSpeed));
  return 18 + (s / 100) * 12;
}

/**
 * 打球速度 HitSpeed → 打球の平均速度 (feet/sec)
 *
 * 初速から着弾までの減速を簡易平均で近似:
 *   bullet: 140 ft/s (初速150、着弾130)
 *   hard:   110 ft/s (初速120、着弾100)
 *   normal:  80 ft/s
 *   weak:    55 ft/s
 */
export function ballSpeedFtPerSec(hitSpeed: 'weak' | 'normal' | 'hard' | 'bullet'): number {
  switch (hitSpeed) {
    case 'bullet': return 140;
    case 'hard':   return 110;
    case 'normal': return  80;
    case 'weak':   return  55;
  }
}

/**
 * 送球速度 (feet/sec)
 *
 * armStrength stat (0-100) を 80〜110 ft/s にマップ。
 * stat が不明な場合は armStrength=50 (95 ft/s) を使う。
 */
export function throwSpeedFtPerSec(armStrength = 50): number {
  const a = Math.max(0, Math.min(100, armStrength));
  return 80 + (a / 100) * 30;
}

// ============================================================
// 距離・時間計算
// ============================================================

/** 2点間の直線距離 (feet) */
export function distanceFt(p1: FieldPoint, p2: FieldPoint): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 2点間を指定速度で移動するのにかかる時間 (ms)
 * 最低 80ms (1フレーム相当) を保証
 */
export function etaMs(p1: FieldPoint, p2: FieldPoint, ftPerSec: number): number {
  const dist = distanceFt(p1, p2);
  return Math.max(80, (dist / ftPerSec) * 1000);
}

// ============================================================
// 打球滞空時間 (contact type + 飛距離 → ms)
// ============================================================

/**
 * フライ打球の滞空時間 (ms)
 *
 * 物理モデル: 打球は放物線を描く。
 * fly_ball: 100ft で約 2.8s、300ft で約 4.5s → 距離に応じてスケール
 *   近似: flightMs = 1800 + distance × 9 (ms)  → clamp 1600〜5000
 * line_drive: fly より速く低く:
 *   近似: flightMs = 900 + distance × 6 (ms)
 * ground_ball: 転がり時間（短い）:
 *   近似: flightMs = 200 + distance × 5 (ms)
 * popup: 高く低い距離:
 *   近似: flightMs = 1200 + distance × 8 (ms) → clamp 1200〜2500
 */
export function ballFlightMs(
  contactType: 'ground_ball' | 'line_drive' | 'fly_ball' | 'popup' | 'bunt_ground',
  distance: number,
): number {
  switch (contactType) {
    case 'fly_ball':
      return Math.min(5000, Math.max(1600, 1800 + distance * 9));
    case 'line_drive':
      return Math.min(3000, Math.max(900, 900 + distance * 6));
    case 'ground_ball':
    case 'bunt_ground':
      return Math.min(1200, Math.max(300, 200 + distance * 5));
    case 'popup':
      return Math.min(2500, Math.max(1200, 1200 + distance * 8));
  }
}

// ============================================================
// 走塁時間ユーティリティ
// ============================================================

/**
 * 打者走者の走出し遅延 (ms)
 *
 * バットを置いてスタートするまでの遅延。
 * インパクト後 ~300ms が現実的。
 */
export const BATTER_START_DELAY_MS = 300;

/**
 * 既存走者の走出し遅延 (ms)
 *
 * リードを取っていてすぐ走れる。
 */
export const RUNNER_START_DELAY_MS = 100;

/**
 * 各塁間の距離 (feet)
 * ホーム→1塁, 1塁→2塁, 2塁→3塁, 3塁→ホーム は全て 90ft
 */
export const BASE_DISTANCE_FT = 90;

/**
 * 走者が指定塁数走るのにかかる時間 (ms)
 *
 * @param numBases  走る塁数 (1=1塁, 2=2塁, 3=3塁, 4=本塁)
 * @param statSpeed 走力 stat (0-100)
 * @param isBatter  打者走者かどうか (バット置きのロス分 0.9 倍)
 */
export function runnerTimeMs(numBases: number, statSpeed: number, isBatter = false): number {
  const speed = playerSpeedFtPerSec(statSpeed) * (isBatter ? 0.9 : 1.0);
  const totalFt = numBases * BASE_DISTANCE_FT;
  return Math.max(200, (totalFt / speed) * 1000);
}

/**
 * 塁間ごとの到達時間テーブルを生成 (ms 累積)
 *
 * 返値: { t1: ms, t2: ms, t3: ms, t4: ms }
 * それぞれイニング開始(t=0) からの経過時間 (BATTER_START_DELAY_MS 込み)
 */
export function batterRunTimes(statSpeed: number): {
  start: number;
  t1: number;
  t2: number;
  t3: number;
  t4: number;
} {
  const delay = BATTER_START_DELAY_MS;
  const t1 = delay + runnerTimeMs(1, statSpeed, true);
  const t2 = t1 + runnerTimeMs(1, statSpeed, false); // 1→2は既に全力疾走中
  const t3 = t2 + runnerTimeMs(1, statSpeed, false);
  const t4 = t3 + runnerTimeMs(1, statSpeed, false);
  return { start: delay, t1, t2, t3, t4 };
}
