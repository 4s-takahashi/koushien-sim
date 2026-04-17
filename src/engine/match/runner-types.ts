/**
 * runner-types.ts — MatchRunner 用の型定義
 *
 * インタラクティブ試合画面（Phase 10）のエンジン層で使用する型。
 * 既存の engine/match/types.ts は変更しない。
 */

// ============================================================
// RunnerMode（2軸の直交設計）
// ============================================================

/**
 * 時間モード: プレイ時間の目安を決める主軸
 *   short    = ⚡ 短縮: 勝負所のみ停止（目標5分）
 *   standard = 🎯 標準: 打席ごとに停止（目標15分）
 */
export type TimeMode = 'short' | 'standard';

/**
 * ピッチモード: 1球ごとの詳細介入
 *   off = 打席単位で結果を見る
 *   on  = 1球ごとに停止＆詳細指示可能
 */
export type PitchMode = 'off' | 'on';

/**
 * 進行モード（直交する2軸）
 *
 * 実効的な停止タイミング:
 *   short    + off → 勝負所のみ
 *   short    + on  → 勝負所 + 1球ごと
 *   standard + off → 打席開始ごと + 勝負所
 *   standard + on  → 全投球 + 勝負所
 */
export interface RunnerMode {
  time: TimeMode;
  pitch: PitchMode;
}

// ============================================================
// PauseReason（なぜ止まったか）
// ============================================================

/**
 * 一時停止の理由を表す判別可能ユニオン型。
 * shouldPause() の戻り値として使用する。
 */
export type PauseReason =
  | { kind: 'at_bat_start'; batterId: string }
  | { kind: 'pitch_start' }
  | { kind: 'inning_end' }
  | { kind: 'scoring_chance'; detail: string }  // 得点圏走者（自校攻撃）
  | { kind: 'pinch'; detail: string }           // ピンチ（自校守備）
  | { kind: 'pitcher_tired'; staminaPct: number }
  | { kind: 'close_and_late'; inning: number }  // 7回以降で1点差以内
  | { kind: 'match_end' };
