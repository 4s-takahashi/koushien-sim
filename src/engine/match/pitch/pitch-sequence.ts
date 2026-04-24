/**
 * pitch-sequence.ts — v0.40.0
 *
 * 配球学習ロジック。打席内の投球履歴に基づく次球への効果を計算する。
 *
 * 実装する効果:
 *   1. 緩急効果 — 前球との球速差が大きいほどタイミングずれ
 *   2. 出し入れ効果 — 前球と現球のコース差が大きいほど接触率低下
 *   3. 同一コース連続ペナルティ — 目付けされて接触率上昇
 *   4. 高めの甘い球の被弾 — line_drive / fly_ball が強くなる
 */

import type { PitchHistoryEntry, PitchLocation, PitchSelection } from '../types';

// ============================================================
// 効果モジュール
// ============================================================

/**
 * 緩急効果を計算する。
 * 前球との球速差 |Δv| が大きいほどタイミング攪乱効果がある。
 *
 * 返り値: 0.0（効果なし）〜 0.08（最大、Δv=30km/h 以上で飽和）
 *
 * 調整経緯:
 *   v0.40.0 初版: 0.25（投手有利に振れすぎ）
 *   v0.40.0 第2版: 0.15（まだ投手有利寄り）
 *   v0.40.0 最終: 0.08（balance test 通過）
 */
export function computeVelocityChangeEffect(
  currentVelocity: number,
  history: readonly PitchHistoryEntry[] | undefined,
): number {
  if (!history || history.length === 0) return 0;
  const prev = history[history.length - 1];
  const deltaV = Math.abs(currentVelocity - prev.velocity);
  // 10km/h 未満は効果なし、30km/h 以上で飽和
  if (deltaV < 10) return 0;
  const normalized = Math.min((deltaV - 10) / 20, 1); // 0-1
  return normalized * 0.08;
}

/**
 * 出し入れ効果を計算する。
 * 前球と現球のコース差（ユークリッド距離）が大きいほど、接触率にペナルティ。
 *
 * PitchLocation は 5x5 グリッド（0-4）で、距離は最大で √(4² + 4²) ≈ 5.66
 * 返り値: 0.0 〜 0.04（接触率ペナルティ）
 *
 * 調整経緯: 0.15 → 0.08 → 0.04（balance test 通過のため投手有利要素を抑制）
 */
export function computeLocationShiftEffect(
  currentLocation: PitchLocation,
  history: readonly PitchHistoryEntry[] | undefined,
): number {
  if (!history || history.length === 0) return 0;
  const prev = history[history.length - 1];
  const dRow = currentLocation.row - prev.location.row;
  const dCol = currentLocation.col - prev.location.col;
  const dist = Math.sqrt(dRow * dRow + dCol * dCol);
  // 1 以下の差は効果なし、4 以上で飽和
  if (dist < 1.5) return 0;
  const normalized = Math.min((dist - 1.5) / 2.5, 1); // 0-1
  return normalized * 0.04;
}

/**
 * 同一コース連続ペナルティ。
 * 直近 2 球が同じ位置付近（距離 1.5 以下）なら、打者が目付けして接触率が上がる。
 *
 * 返り値: 0.0（効果なし）〜 0.15（接触率ボーナス＝投手にペナルティ）
 *
 * v0.40.0: 0.12 → 0.15（投手有利要素を弱めたのとバランス）
 */
export function computeRepeatLocationEffect(
  currentLocation: PitchLocation,
  history: readonly PitchHistoryEntry[] | undefined,
): number {
  if (!history || history.length < 2) return 0;
  const prev = history[history.length - 1];
  const prev2 = history[history.length - 2];

  const d1 = distLocation(currentLocation, prev.location);
  const d2 = distLocation(prev.location, prev2.location);

  // 直近 3 球が同じ付近（距離 ≤ 1.5）なら目付け効果
  if (d1 <= 1.5 && d2 <= 1.5) {
    return 0.15;
  }
  // 直近 2 球が同じ付近なら軽い効果
  if (d1 <= 1.5) {
    return 0.08;
  }
  return 0;
}

/**
 * 高めの甘い球効果。
 * 高め（row 0-1）のストライクゾーン内（col 1-3）かつ速球（>135km/h）でない場合、
 * 打球が line_drive / fly_ball に寄りやすくなる（長打・HR リスク UP）。
 *
 * 返り値: 0.0（効果なし）〜 0.18（fly/line ブースト）
 */
export function computeHighMiddleBoost(
  location: PitchLocation,
  pitch: PitchSelection,
): number {
  // 高めゾーン内
  const isHighZone = location.row <= 1 && location.col >= 1 && location.col <= 3;
  if (!isHighZone) return 0;

  // 遅い甘い球ほど被弾
  const velocityFactor = Math.max(0, 1 - (pitch.velocity - 120) / 40); // 120km/h=1.0, 160km/h=0
  return 0.18 * velocityFactor;
}

/**
 * 総合的な接触率補正を計算する。
 * 投手にとって: 正の値は接触率が**上がる**（不利）、負の値は**下がる**（有利）。
 *
 * 返り値: -0.25 〜 +0.12 程度
 */
export function computeContactRateAdjustment(
  currentLocation: PitchLocation,
  currentPitch: PitchSelection,
  history: readonly PitchHistoryEntry[] | undefined,
): {
  delta: number;
  breakdown: {
    velocityChange: number;
    locationShift: number;
    repeatLocation: number;
  };
} {
  const velocityChange = computeVelocityChangeEffect(currentPitch.velocity, history);
  const locationShift = computeLocationShiftEffect(currentLocation, history);
  const repeatLocation = computeRepeatLocationEffect(currentLocation, history);

  // 緩急・出し入れは接触率を下げる（投手有利）
  // 同一コース連続は接触率を上げる（投手不利）
  const delta = -velocityChange - locationShift + repeatLocation;

  return {
    delta,
    breakdown: { velocityChange, locationShift, repeatLocation },
  };
}

// ============================================================
// ヘルパー
// ============================================================

function distLocation(a: PitchLocation, b: PitchLocation): number {
  const dRow = a.row - b.row;
  const dCol = a.col - b.col;
  return Math.sqrt(dRow * dRow + dCol * dCol);
}

// ============================================================
// 履歴管理
// ============================================================

/** 打席内の投球履歴リングバッファサイズ（直近 N 球を保持） */
export const AT_BAT_HISTORY_MAX = 10;

/**
 * 履歴にエントリを追加して（リングバッファ）返す。
 */
export function appendPitchHistory(
  history: readonly PitchHistoryEntry[] | undefined,
  entry: PitchHistoryEntry,
): PitchHistoryEntry[] {
  const base = history ?? [];
  const next = [...base, entry];
  if (next.length > AT_BAT_HISTORY_MAX) {
    return next.slice(-AT_BAT_HISTORY_MAX);
  }
  return next;
}
