/**
 * MatchPlayerHooks.ts — 試合演出タイミング制御ユーティリティ
 *
 * Phase S1-A: 試合演出バグ修正
 *
 * A1: プレイボール後 3秒待機（autoSpeedMultiplier 連動）
 * A2: チェンジ（3アウト）後 3秒待機（同上）
 * A5: 三振後 1.5秒待機 → 次打者ログ → 0.5秒待機 → 投球開始
 *
 * 設計:
 * - autoSpeedMultiplier は runnerMode.time から算出:
 *     slow     → x1  (3000ms / 1 = 3000ms)
 *     standard → x2  (3000ms / 2 = 1500ms)
 *     fast     → x4  (3000ms / 4 = 750ms)
 * - 純粋関数のみを export してテスト可能にする
 * - React hook は page.tsx 側で useEffect を使って呼び出す
 */

import type { TimeMode } from '../../engine/match/runner-types';

// ============================================================
// 定数
// ============================================================

/** プレイボール後の基本待機時間 (ms) — x1 スピード時 */
export const PLAY_BALL_DELAY_BASE_MS = 3000;

/** チェンジ後の基本待機時間 (ms) — x1 スピード時 */
export const CHANGE_DELAY_BASE_MS = 3000;

/** 三振後の待機時間 パート1: 三振演出表示 (ms) — x1 スピード時 */
export const STRIKEOUT_DELAY_1_BASE_MS = 1500;

/** 三振後の待機時間 パート2: 次打者ログ → 投球開始 (ms) — x1 スピード時 */
export const STRIKEOUT_DELAY_2_BASE_MS = 500;

// ============================================================
// autoSpeedMultiplier の取得
// ============================================================

/**
 * TimeMode から autoSpeedMultiplier を計算する。
 * - slow     → 1 (3秒)
 * - standard → 2 (1.5秒)
 * - fast     → 4 (0.75秒)
 */
export function getAutoSpeedMultiplier(timeMode: TimeMode): 1 | 2 | 4 {
  switch (timeMode) {
    case 'slow':     return 1;
    case 'standard': return 2;
    case 'fast':     return 4;
  }
}

// ============================================================
// 待機時間計算
// ============================================================

/**
 * プレイボール後の待機時間 (ms) を計算する。
 * @param timeMode 現在の TimeMode
 * @returns 待機時間 (ms)
 */
export function getPlayBallDelayMs(timeMode: TimeMode): number {
  const multiplier = getAutoSpeedMultiplier(timeMode);
  return Math.round(PLAY_BALL_DELAY_BASE_MS / multiplier);
}

/**
 * チェンジ後の待機時間 (ms) を計算する。
 * @param timeMode 現在の TimeMode
 * @returns 待機時間 (ms)
 */
export function getChangeDelayMs(timeMode: TimeMode): number {
  const multiplier = getAutoSpeedMultiplier(timeMode);
  return Math.round(CHANGE_DELAY_BASE_MS / multiplier);
}

/**
 * 三振後の待機時間パート1 (三振演出表示の ms) を計算する。
 * @param timeMode 現在の TimeMode
 * @returns 待機時間 (ms)
 */
export function getStrikeoutDelay1Ms(timeMode: TimeMode): number {
  const multiplier = getAutoSpeedMultiplier(timeMode);
  return Math.round(STRIKEOUT_DELAY_1_BASE_MS / multiplier);
}

/**
 * 三振後の待機時間パート2 (次打者ログ表示後、投球開始までの ms) を計算する。
 * @param timeMode 現在の TimeMode
 * @returns 待機時間 (ms)
 */
export function getStrikeoutDelay2Ms(timeMode: TimeMode): number {
  const multiplier = getAutoSpeedMultiplier(timeMode);
  return Math.round(STRIKEOUT_DELAY_2_BASE_MS / multiplier);
}

/**
 * 三振後の合計待機時間 (ms) を計算する (パート1 + パート2)。
 * @param timeMode 現在の TimeMode
 * @returns 合計待機時間 (ms)
 */
export function getStrikeoutTotalDelayMs(timeMode: TimeMode): number {
  return getStrikeoutDelay1Ms(timeMode) + getStrikeoutDelay2Ms(timeMode);
}

// ============================================================
// 実況ナレーション判定
// ============================================================

/**
 * ナレーションエントリがプレイボールイベントかを判定する。
 * buildNarrationForPitch の playball エントリを検出する。
 *
 * @param text ナレーションテキスト
 * @returns true = プレイボールイベント
 */
export function isPlayBallNarration(text: string): boolean {
  return text.includes('PLAY BALL') || text.includes('プレイボール');
}

/**
 * ナレーションエントリがチェンジ（3アウト）イベントかを判定する。
 * buildNarrationForPitch の change エントリを検出する。
 *
 * @param text ナレーションテキスト
 * @returns true = チェンジイベント
 */
export function isChangeNarration(text: string): boolean {
  return text.includes('3アウト・チェンジ');
}

/**
 * ナレーションエントリが三振イベントかを判定する。
 * buildNarrationForPitch の strikeout エントリを検出する。
 *
 * @param text ナレーションテキスト
 * @returns true = 三振イベント
 */
export function isStrikeoutNarration(text: string): boolean {
  return text.includes('空振り三振') || text.includes('見逃し三振');
}

// ============================================================
// 次打者ログ生成
// ============================================================

/**
 * 次打者登場のナレーションテキストを生成する。
 * A5: 三振後に表示する次打者情報。
 *
 * @param batterName 打者名
 * @param order 打順（1-9）
 * @param position ポジション日本語
 * @returns ナレーションテキスト
 */
export function buildNextBatterLog(
  batterName: string,
  order: number,
  position: string,
): string {
  return `🧢 次の打者: ${batterName}選手（${order}番、${position}）`;
}

// ============================================================
// A3: 自動進行を止めるべきかの判定
// ============================================================

/**
 * A3: 自動進行を止めるべき PauseReason の kind セット。
 * これ以外の kind は自動進行を継続する（自動再開する）。
 *
 * 設計書: 停止理由を chance|pinch|bunt-decision|substitution|manual-pause に限定
 */
export const AUTO_PAUSE_ALLOWED_KINDS = new Set([
  'scoring_chance',    // チャンス（自校攻撃時の得点圏走者）
  'pinch',             // ピンチ（自校守備時）
  'bunt_decision',     // バント決定待ち（将来拡張用）
  'substitution',      // 選手交代待ち（将来拡張用）
  'manual_pause',      // 手動一時停止（将来拡張用）
  'match_end',         // 試合終了（必ず停止）
] as const);

/**
 * A3: 指定の PauseReason で自動進行を停止すべきかを判定する。
 * true = 停止すべき / false = 自動再開すべき
 *
 * @param pauseKind PauseReason の kind
 * @returns true なら停止、false なら自動再開
 */
export function shouldAutoPause(pauseKind: string): boolean {
  return AUTO_PAUSE_ALLOWED_KINDS.has(
    pauseKind as typeof AUTO_PAUSE_ALLOWED_KINDS extends Set<infer T> ? T : never,
  );
}
