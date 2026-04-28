/**
 * engine/physics/resolver/types.ts — Play Resolver ローカル型定義
 *
 * Phase R3: このファイルは resolver/ サブモジュール内部でのみ使用する補助型。
 * engine/physics/types.ts は編集禁止のため、ここに局所定義する。
 */

import type { BaseId, FieldPosition } from '../types';
import type { Position } from '../../types/player';

// ============================================================
// バットスイング
// ============================================================

/** バットスイング軌道の記述 */
export interface BatSwingProfile {
  /** スイング開始時刻 (ms, t=0 基準) */
  readonly startTimeMs: number;
  /** バット・ボール最接近点（コンタクトゾーン）の時刻 (ms) */
  readonly contactTimeMs: number;
  /** タイミングエラー (ms) — 負=早打ち、正=遅打ち、0=ジャスト */
  readonly timingErrorMs: number;
  /** スイング速度 (mph) */
  readonly swingSpeedMph: number;
  /** バットのヘッド位置（コンタクト時） */
  readonly batHeadPos: FieldPosition;
  /** スイング軌道の角度 (度) — 0=水平、正=アッパー */
  readonly swingPlaneAngleDeg: number;
}

// ============================================================
// コンタクト
// ============================================================

/** バット・ボール接触の詳細 */
export interface ContactDetail {
  /** 接触が発生したか */
  readonly didContact: boolean;
  /** 接触品質 0-1 (0=完全ミス, 1=完璧な芯) */
  readonly contactQuality: number;
  /** ファウル判定 */
  readonly isFoul: boolean;
  /** ファウルチップ（微かな接触） */
  readonly isTip: boolean;
  /** チェックスイング（途中で止めた） */
  readonly isCheckSwing: boolean;
  /** コンタクト時刻 (ms) */
  readonly contactTimeMs: number;
}

// ============================================================
// 守備位置マッピング
// ============================================================

/** 守備番号（公式記録用） */
export type FielderNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** Position → 守備番号変換 */
export const POSITION_TO_NUMBER: Readonly<Record<Position, FielderNumber>> = {
  pitcher: 1,
  catcher: 2,
  first: 3,
  second: 4,
  third: 5,
  shortstop: 6,
  left: 7,
  center: 8,
  right: 9,
};

// ============================================================
// 打球評価補助
// ============================================================

/** 打球の内野/外野区分 */
export type BallZone = 'pitcher_area' | 'infield' | 'outfield' | 'foul' | 'over_fence';

/** 打球の基本方向区分 */
export type SprayZone =
  | 'pull_foul'      // 引っ張りファウル
  | 'first_line'     // 一塁線
  | 'right_gap'      // 一二塁間
  | 'center'         // センター
  | 'left_gap'       // 三遊間
  | 'third_line'     // 三塁線
  | 'push_foul';     // 流しファウル

// ============================================================
// 走者情報の拡張
// ============================================================

/** 走者の走塁能力情報 */
export interface RunnerStats {
  readonly runnerId: string;
  readonly fromBase: BaseId;
  /** 走力 stat (0-100) */
  readonly speedStat: number;
  /** アグレッシブ走塁傾向 0-1 */
  readonly aggressiveness: number;
}

// ============================================================
// resolvePlay の入力
// ============================================================

/** resolvePlay() への入力 */
export interface ResolvePlayInput {
  /** 打者走者の走力 stat */
  readonly batterSpeedStat: number;
  /** 打者 ID */
  readonly batterId: string;
  /** 塁上の走者一覧 */
  readonly runners: ReadonlyArray<RunnerStats>;
  /** アウトカウント (0-2) */
  readonly outs: number;
  /** RNG seed */
  readonly rngSeed: string;
}

// ============================================================
// プレー内部状態
// ============================================================

/** Resolver パイプラインの中間状態（各サブモジュール間で引き回す） */
export interface ResolverPipelineState {
  readonly contactDetail: ContactDetail;
  readonly primaryFielderPosition: Position;
  readonly primaryFielderArrivalMs: number;
  readonly primaryFielderPos: FieldPosition;
  readonly catchSuccess: boolean;
  readonly catchError: boolean;
  readonly catchBobble: boolean;
  readonly handleTimeMs: number;
}
