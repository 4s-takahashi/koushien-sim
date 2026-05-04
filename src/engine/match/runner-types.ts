/**
 * runner-types.ts — MatchRunner 用の型定義
 *
 * インタラクティブ試合画面（Phase 10）のエンジン層で使用する型。
 * 既存の engine/match/types.ts は変更しない。
 */

// ============================================================
// MatchOverrides（Phase 7-E: 心理システム補正）
// ============================================================

/**
 * モノローグのメンタル補正を試合エンジンに渡すためのオーバーライド。
 * stepOnePitch / stepOneAtBat の第2引数として渡す。
 * 未指定（undefined）の場合は従来通りの挙動。
 *
 * 補正値はすべて相対係数または加算値で表現する:
 *   - contactBonus / powerBonus: 0.0 = 補正なし、+0.1 = +10%、-0.1 = -10%
 *   - velocityBonus: km/h 加算（+3 = 3km/h アップ）
 *   - controlBonus: 0.0 = 補正なし、+0.1 = +10%
 *   - swingAggressionBonus: 積極性補正（+0.1 = ボール球スイング率+10%）
 *
 * 上限クリップ: clamp(bonus, -0.3, +0.3) で極端な補正を防ぐ。
 */
export interface MatchOverrides {
  batterMental?: {
    /** ミート補正 (相対係数: -0.3 ~ +0.3) */
    contactBonus?: number;
    /** パワー補正 (相対係数: -0.3 ~ +0.3) */
    powerBonus?: number;
    /** スイング積極性補正 (-0.3 ~ +0.3) */
    swingAggressionBonus?: number;
  };
  pitcherMental?: {
    /** 球速補正 (km/h 加算: -5 ~ +5) */
    velocityBonus?: number;
    /** 制球補正 (相対係数: -0.3 ~ +0.3) */
    controlBonus?: number;
  };
  /**
   * Phase S2: キャッチャーの配球方針による補正
   * generateCatcherThought() の結果から生成される。
   * selectPitch() に渡されて球種・コース選択に影響する。
   */
  catcherPitchingBias?: {
    /** ストレート確率補正 (-0.3〜+0.3): 正=ストレート多め、負=変化球多め */
    fastballRatioBias: number;
    /** ゾーン内狙い率補正 (-0.3〜+0.3): 正=ストライクゾーン重視 */
    strikeZoneBias: number;
    /** 外角コース優先 (true = 外角側シフト) */
    preferOutside: boolean;
    /** 内角コース優先 (true = 内角側シフト) */
    preferInside: boolean;
  };
}

// ============================================================
// RunnerMode（2軸の直交設計）
// ============================================================

/**
 * 時間モード: 自動進行の間隔を決める主軸
 *   slow     = ⏮ ゆっくり: 10秒ごとに自動進行
 *   standard = ▶ 標準: 5秒ごとに自動進行
 *   fast     = ⏭ 高速: 3秒ごとに自動進行
 */
export type TimeMode = 'slow' | 'standard' | 'fast';

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
 *   slow/standard/fast + off → 打席単位で自動進行
 *   slow/standard/fast + on  → 1球単位で自動進行
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
