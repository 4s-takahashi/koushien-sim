/**
 * engine/physics/types.ts — 物理レイヤー型定義（v3 / Phase R1-1）
 *
 * 試合エンジン再構築のための物理シミュ層の型を一元定義する。
 * 既存 engine/match/types.ts は維持し、本ファイルは新規追加。
 *
 * Layer 1: Field Geometry（座標系・距離）
 * Layer 2: Player Movement（野手・走者・送球の到達時刻）
 * Layer 3: Bat-Ball Physics（25入力 → 中間潜在量 → 4軸打球パラメータ）
 * Layer 4: Ball Trajectory（解析式の打球軌道）
 * Layer 5: Play Resolver（タイムライン構築 + out/safe 判定）
 *
 * 設計指針:
 * - 全て readonly / immutable
 * - 連続値は number、離散カテゴリは string union
 * - 物理単位は SI 系をベースに、野球慣習で feet/mph も併用
 * - 全ての時刻は ms 単位、t=0 は「打球発生時刻」または「ピッチリリース時刻」（イベントごとに明記）
 */

import type { BatterParams, PitcherParams, BaseState, Count, MatchState, FieldResult } from '../match/types';
import type { Position, BattingSide } from '../types/player';

// ============================================================
// Layer 1: Field Geometry
// ============================================================

/**
 * 球場座標 (feet)
 * 原点: ホームベース、x: 右翼方向(+), y: センター方向(+), z: 鉛直上(+)
 */
export interface FieldPosition {
  readonly x: number;
  readonly y: number;
}

/** 3D 座標（軌道計算用） */
export interface FieldPosition3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 塁の識別子 */
export type BaseId = 'home' | 'first' | 'second' | 'third';

/** 球場上の固定地点 */
export interface FieldLandmarks {
  readonly home: FieldPosition;
  readonly first: FieldPosition;
  readonly second: FieldPosition;
  readonly third: FieldPosition;
  readonly mound: FieldPosition;
  /** 標準守備位置（9 ポジション） */
  readonly standardFielderPositions: ReadonlyMap<Position, FieldPosition>;
  /** 外野フェンス（円弧近似のサンプリング） */
  readonly outfieldFence: ReadonlyArray<FieldPosition>;
  /** ファウルライン（左右 2 本、各 [home, fenceCorner]） */
  readonly leftFoulLine: readonly [FieldPosition, FieldPosition];
  readonly rightFoulLine: readonly [FieldPosition, FieldPosition];
}

// ============================================================
// Layer 2: Player Movement
// ============================================================

/**
 * 移動エージェント（野手・走者・送球の中継野手など）の動作モデル
 * 反応時間後に等加速度で目標方向に直進、最高速で巡航
 */
export interface MovementProfile {
  /** 最高速度 (ft/s) */
  readonly topSpeedFtPerSec: number;
  /** 加速度 (ft/s²) */
  readonly accelerationFtPerSec2: number;
  /** 反応時間 (ms) — 打球判断や送球判断にかかる時間 */
  readonly reactionTimeMs: number;
}

/** 移動結果: 目標地点への到達時刻と任意時刻の位置 */
export interface MovementResult {
  /** 目標地点への到達時刻 (ms) */
  readonly etaMs: number;
  /** 移動距離 (ft) */
  readonly distanceFt: number;
  /** 任意時刻の位置を返す関数（補間用） */
  readonly positionAt: (tMs: number) => FieldPosition;
}

/** 送球の動作モデル */
export interface ThrowProfile {
  /** 送球速度 (ft/s) — 80-110 程度 */
  readonly throwSpeedFtPerSec: number;
  /** 送球品質 (0-1) — 暴投・ショートバウンド回避率 */
  readonly throwQuality: number;
  /** 送球準備時間 (ms) — 捕球→リリースまで */
  readonly releaseDelayMs: number;
}

// ============================================================
// Layer 3: Bat-Ball Physics
// ============================================================

/**
 * 投球の打者認知抽象品質パラメータ（v3 §3.2 新規）
 * 投球の3D軌道は持たないが、打者認知に効く抽象指標として連続値で持つ。
 */
export interface PerceivedPitchQuality {
  /** 見かけ球速感 (km/h 換算) — 球速 + 投手フォームの圧 */
  readonly perceivedVelocity: number;
  /** 緩急差 — 直前球との球速差をどれだけ強く感じるか (0-1) */
  readonly velocityChangeImpact: number;
  /** ブレイク強度 — 変化の急峻さ (0-1) */
  readonly breakSharpness: number;
  /** 終盤変化 — 手元での落ち・伸び (0-1) */
  readonly lateMovement: number;
  /** 打ちにくさ総合 (0-1) — 上記の合成 + コース難度 */
  readonly difficulty: number;
}

/**
 * 中間潜在量 5 軸（v3 §4.2 新規）
 * 25 入力を一度この 5 軸に圧縮してから 4 軸打球パラメータに変換する。
 * 各軸は独立にチューニング可能で、デバッグ・テストしやすい。
 */
export interface SwingLatentState {
  /** 接触品質 0-1 — どれだけ芯で捉えたか */
  readonly contactQuality: number;
  /** タイミング窓 -1〜+1 — 早すぎ(-)/遅すぎ(+)/ジャスト(0) */
  readonly timingWindow: number;
  /** スイング意図 -1〜+1 — 流し(-)/普通(0)/引っ張り(+) */
  readonly swingIntent: number;
  /** 判断プレッシャー 0-1 — 状況による緊張度 */
  readonly decisionPressure: number;
  /** バレル率 0-1 — 強い打球になる確率（contactQuality と power の複合） */
  readonly barrelRate: number;
}

/**
 * 4 軸打球パラメータ（v3 §4.4 確定）
 * Layer 4 Trajectory への入力となる物理量。
 */
export interface BallTrajectoryParams {
  /** 打球初速 (km/h) — 50-180 連続 */
  readonly exitVelocity: number;
  /** 打球角度 (度) — -20 〜 +60 連続、0=水平、90=真上 */
  readonly launchAngle: number;
  /** 水平角度 (度) — 0=右翼線、45=センター、90=左翼線、それ以外はファウル */
  readonly sprayAngle: number;
  /** スピン (rpm) */
  readonly spin: {
    readonly back: number;  // -3000〜+3000、+ がバックスピン
    readonly side: number;  // -3000〜+3000、+ が右回転
  };
}

/**
 * Layer 3 への入力: 1球分の状況コンテキスト
 * §3.3 の 25 変数 + perceivedPitchQuality を集約
 */
export interface BatBallContext {
  // カテゴリ A: 投球品質
  readonly pitcher: PitcherParams;
  readonly perceivedPitch: PerceivedPitchQuality;
  readonly pitchVelocity: number;
  readonly pitchType: string;
  readonly pitchBreakLevel: number;
  readonly pitchActualLocation: { row: number; col: number };

  // カテゴリ B: 打者特性
  readonly batter: BatterParams;
  readonly batterSwingType: 'pull' | 'spray' | 'opposite';

  // カテゴリ C: タイミング状態
  readonly timingError: number;        // -100 〜 +100 ms
  readonly ballOnBat: number;          // 0.0 - 1.0
  readonly previousPitchVelocity: number | null;
  readonly count: Count;

  // カテゴリ D: 状況補正
  readonly inning: number;
  readonly scoreDiff: number;          // home - away
  readonly outs: number;
  readonly bases: BaseState;
  readonly isKeyMoment: boolean;

  // カテゴリ E: 采配・性格
  readonly orderFocusArea: 'inside' | 'outside' | 'low' | 'high' | 'middle' | 'none';
  readonly orderAggressiveness: 'passive' | 'normal' | 'aggressive';
  readonly batterTraits: ReadonlyArray<string>;
  readonly batterMood: number;         // -1 〜 +1（負=悪い、正=良い）
}

// ============================================================
// Layer 4: Ball Trajectory
// ============================================================

/** 打球軌道の計算結果 */
export interface BallFlight {
  /** 着弾点 */
  readonly landingPoint: FieldPosition;
  /** 滞空時間 (ms) — 打球発生から最初の地面接触まで */
  readonly hangTimeMs: number;
  /** 最高到達点の高さ (ft) */
  readonly apexFt: number;
  /** 最高到達点に達する時刻 (ms) */
  readonly apexTimeMs: number;
  /** 最終的な飛距離 (ft) — landingPoint と原点の距離（バウンド後の最終停止点ではない） */
  readonly distanceFt: number;
  /** 任意時刻の3D位置を返す関数 */
  readonly positionAt: (tMs: number) => FieldPosition3D;
  /** ファウルか（sprayAngle で判定済み） */
  readonly isFoul: boolean;
}

// ============================================================
// Layer 5: Play Resolver — TimelineEvent
// ============================================================

/**
 * Canonical Timeline のイベント型（v3 §7.1）
 * 全イベントは絶対時刻 (ms)、t=0 は通常 ball_contact 時刻
 */
export type TimelineEvent =
  | { readonly t: number; readonly kind: 'pitch_release'; readonly pitcherId: string }
  | { readonly t: number; readonly kind: 'ball_at_plate' }
  | { readonly t: number; readonly kind: 'swing_start'; readonly batterId: string; readonly timingError: number }
  | { readonly t: number; readonly kind: 'ball_contact'; readonly trajectory: BallTrajectoryParams }
  | { readonly t: number; readonly kind: 'foul'; readonly reason: 'line' | 'tip' | 'late_swing' }
  | { readonly t: number; readonly kind: 'ball_landing'; readonly pos: FieldPosition }
  | { readonly t: number; readonly kind: 'ball_bounce'; readonly pos: FieldPosition; readonly remainingEnergy: number }
  | { readonly t: number; readonly kind: 'fielder_react'; readonly fielderId: string }
  | { readonly t: number; readonly kind: 'fielder_field_ball'; readonly fielderId: string; readonly pos: FieldPosition; readonly cleanCatch: boolean }
  | { readonly t: number; readonly kind: 'fielder_throw'; readonly fromId: string; readonly toBase: BaseId; readonly throwQuality: number }
  | { readonly t: number; readonly kind: 'throw_arrival'; readonly toBase: BaseId; readonly pos: FieldPosition }
  | { readonly t: number; readonly kind: 'runner_lead_off'; readonly runnerId: string; readonly fromBase: BaseId }
  | { readonly t: number; readonly kind: 'runner_advance'; readonly runnerId: string; readonly fromBase: BaseId; readonly toBase: BaseId }
  | { readonly t: number; readonly kind: 'runner_safe'; readonly runnerId: string; readonly base: BaseId }
  | { readonly t: number; readonly kind: 'runner_out'; readonly runnerId: string; readonly base: BaseId; readonly cause: 'force_out' | 'tag_out' | 'caught_stealing' }
  | { readonly t: number; readonly kind: 'fence_hit'; readonly pos: FieldPosition }
  | { readonly t: number; readonly kind: 'home_run'; readonly runnerId: string }
  | { readonly t: number; readonly kind: 'play_end' };

/** Canonical Timeline */
export interface CanonicalTimeline {
  /** 時刻昇順ソート済み・整合性検証済み */
  readonly events: ReadonlyArray<TimelineEvent>;
  /** 開始時刻のオフセット（リプレイ・resume 用） */
  readonly baseTimestamp?: number;
  /** RNG seed（リプレイ再現用） */
  readonly rngSeed?: string;
}

// ============================================================
// Layer 5: Play Resolver — サブモジュール出力
// ============================================================

/** fielding-resolver の出力 */
export interface FieldingResult {
  readonly primaryFielder: {
    readonly id: string;
    readonly position: Position;
    readonly arrivalTimeMs: number;
    readonly arrivalPos: FieldPosition;
  };
  readonly catchAttempt: {
    readonly success: boolean;       // クリーン捕球?
    readonly error: boolean;         // エラー発生?
    readonly bobble: boolean;        // ボブル（ファンブル後拾い直し）?
    readonly handleTimeMs: number;   // 捕球→送球準備までの時間
  };
  /** バウンド後の各バウンド点と時刻（ゴロの場合） */
  readonly bouncePoints?: ReadonlyArray<{ readonly pos: FieldPosition; readonly t: number }>;
}

/** throw-resolver の出力 */
export interface ThrowResult {
  /** 送球するか（しないなら走者を見送る） */
  readonly willThrow: boolean;
  /** 送球先 */
  readonly toBase: BaseId | 'cutoff';
  /** カットオフ経由の場合の中継野手 */
  readonly cutoffFielder?: string;
  /** 送球リリース時刻 (ms) */
  readonly releaseTimeMs: number;
  /** 送球到達時刻 (ms) */
  readonly arrivalTimeMs: number;
  /** 送球品質 (0-1) — 暴投・短い送球の確率 */
  readonly throwQuality: number;
}

/** baserunning-resolver の単一走者の判定 */
export interface RunnerDecision {
  readonly runnerId: string;
  readonly fromBase: BaseId;
  readonly targetBase: BaseId;
  /** §5 decisionMargin（ms 単位、+で慎重、-で積極的） */
  readonly decisionMargin: number;
  readonly willAdvance: boolean;
  readonly arrivalTimeMs: number;
  readonly outcome: 'safe' | 'out' | 'still_running';
}

/** baserunning-resolver の出力 */
export interface BaserunningResult {
  readonly decisions: ReadonlyArray<RunnerDecision>;
}

// ============================================================
// 21 種詳細打球分類（v3 §8 確定）
// ============================================================

export type DetailedHitType =
  // 内野ゴロ系（4）
  | 'first_line_grounder'      // 一塁線ゴロ
  | 'right_side_grounder'      // 二遊間ゴロ
  | 'left_side_grounder'       // 三遊間ゴロ
  | 'third_line_grounder'      // 三塁線ゴロ
  // 投手周辺（1）
  | 'comebacker'               // ピッチャー返し
  // 内野フライ・ライナー系（3）
  | 'infield_liner'            // 内野ライナー
  | 'high_infield_fly'         // 高い内野フライ
  | 'over_infield_hit'         // 内野手の頭越しヒット（ポテン）
  // 外野ゴロ抜けヒット（3）
  | 'right_gap_hit'            // 一二塁間抜けヒット
  | 'up_the_middle_hit'        // センター前ヒット
  | 'left_gap_hit'             // 三遊間抜けヒット
  // 外野フライ系（3）
  | 'shallow_fly'              // 浅いフライ
  | 'medium_fly'               // 中距離フライ
  | 'deep_fly'                 // 深いフライ
  // ライナー性（1）
  | 'line_drive_hit'           // ライナー性のヒット
  // 長打系（4）
  | 'wall_ball'                // 外野フェンス直撃
  | 'line_drive_hr'            // ライナー性HR
  | 'high_arc_hr'              // 高弾道HR
  | 'fence_close_call'         // ライン際打球（フェアファウル微妙）
  // ファウル・特殊（2）
  | 'foul_fly'                 // ファウルフライ（捕球可能）
  | 'check_swing_dribbler';    // 当たり損ね投手前

// ============================================================
// Layer 5: 最終出力 PlayResolution
// ============================================================

/**
 * 1球の物理解決の最終出力
 * Layer 6 Orchestrator はこれを受けて MatchState を更新する
 */
export interface PlayResolution {
  readonly trajectory: BallTrajectoryParams;
  readonly flight: BallFlight;
  readonly timeline: CanonicalTimeline;
  /** 既存型（後方互換） */
  readonly fieldResult: FieldResult;
  /** 21 種詳細分類 */
  readonly detailedHitType: DetailedHitType;
  readonly rbiCount: number;
  readonly baseStateAfter: BaseState;
  /** 中間潜在量（デバッグ・テスト用） */
  readonly latentState?: SwingLatentState;
}

// ============================================================
// バリデーションエラー
// ============================================================

/** play-validator が投げる例外 */
export class TimelineValidationError extends Error {
  constructor(
    message: string,
    public readonly violatedRule: 'time_monotonic' | 'causality' | 'physical_consistency' | 'advance_consistency' | 'completeness',
    public readonly events?: ReadonlyArray<TimelineEvent>,
  ) {
    super(message);
    this.name = 'TimelineValidationError';
  }
}

// ============================================================
// 補助型: re-export
// ============================================================

export type { Position, BattingSide, MatchState, BatterParams, PitcherParams, BaseState, Count, FieldResult };
