/**
 * engine/match/pitch/legacy-adapter.ts
 *
 * Phase R4 互換層: PlayResolution → BatContactResult / FieldResult への変換
 *
 * resolver/* の新出力を既存の match/types.ts 型に変換することで、
 * 既存テスト・既存呼び出しコードを一切変更せずに resolver を使えるようにする。
 *
 * 設計方針:
 * - 変換は「可逆」ではなく「互換」: 既存フィールドをすべて満たす
 * - PlayResolution.fieldResult は既に FieldResult 型互換（physics/types.ts で定義）
 * - BatContactResult の contactType / direction / speed / distance は
 *   trajectory + detailedHitType から復元する
 *
 * @deprecated This adapter is a compatibility shim for Phase R4 transition.
 *   Phase R5 以降では timeline を直接 UI に渡すため、このアダプターは不要になる予定。
 */

import type {
  BatContactResult,
  BatContactType,
  HitDirection,
  HitSpeed,
  FieldResult,
} from '../types';
import type {
  PlayResolution,
  BallTrajectoryParams,
  DetailedHitType,
  SwingLatentState,
} from '../../physics/types';

// ============================================================
// PlayResolution → BatContactResult（フィールドResult含む）変換
// ============================================================

/**
 * PlayResolution から BatContactResult を復元する。
 *
 * resolver が生成した PlayResolution には:
 * - trajectory: 4軸打球パラメータ（exitVelocity / launchAngle / sprayAngle / spin）
 * - flight: 打球軌道計算結果（distanceFt / hangTimeMs）
 * - detailedHitType: 21種分類
 * - fieldResult: FieldResult（resolver/scoring.ts が導出した後方互換フィールド）
 *
 * これらから既存の BatContactResult を再構成する。
 */
export function playResolutionToBatContactResult(
  resolution: PlayResolution,
): BatContactResult {
  const contactType = deriveContactType(resolution.trajectory, resolution.detailedHitType);
  const direction = sprayAngleToDirection(resolution.trajectory.sprayAngle);
  const speed = exitVelocityToHitSpeed(resolution.trajectory.exitVelocity);
  // distanceFt (feet) → 内部では meters 相当の数値として使用
  // 既存コードは 100m 以上でホームラン判定をしているため feet→m 変換は不要
  // (MATCH_CONSTANTS.HOME_RUN_DISTANCE = 100 を feet 基準として使う)
  const distance = resolution.flight.distanceFt;

  return {
    contactType,
    direction,
    speed,
    distance,
    fieldResult: resolution.fieldResult,
  };
}

/**
 * BallTrajectoryParams + DetailedHitType から BatContactType を復元する。
 *
 * 変換ルール:
 * - launchAngle < 5           → ground_ball
 * - launchAngle 5-20          → line_drive（ライナー系）
 * - launchAngle > 20          → fly_ball
 * - popup 系 DetailedHitType  → popup
 * - bunt 系                   → bunt_ground
 */
export function deriveContactType(
  trajectory: BallTrajectoryParams,
  detailedHit: DetailedHitType,
): BatContactType {
  // bunt / dribbler は ground_ball 扱い
  if (detailedHit === 'check_swing_dribbler') return 'ground_ball';

  // popup 系（高い内野フライ）
  if (detailedHit === 'high_infield_fly') return 'popup';

  // 打球角度ベースのフォールバック
  // computeBallTrajectoryParams は baseAngle = -5 + 50*(barrelRate-0.5) ≈ -5〜+20° が主分布。
  // 旧 bat-contact.ts との互換性を保つため、閾値は物理モデルの分布に合わせて調整:
  //   angle < 5°  → ground_ball
  //   5 〜 14°    → line_drive
  //   >= 14°      → fly_ball
  // これにより barrelRate ≥ 0.68（exitVelocity ≥ ~125km/h）の打球が fly_ball になり、
  // 旧モデルの fly_ball 比率（約 32%）に近い分布が得られる。
  const angle = trajectory.launchAngle;

  if (angle < 5) return 'ground_ball';
  if (angle < 14) return 'line_drive';
  return 'fly_ball';
}

/**
 * sprayAngle (0=右翼線, 45=センター, 90=左翼線) →
 * 既存 HitDirection (0=レフトファウルライン, 45=センター, 90=ライトファウルライン)
 *
 * physics 側では右打者基準で:
 *   sprayAngle=0  → 右翼線（RFライン）
 *   sprayAngle=45 → センター
 *   sprayAngle=90 → 左翼線（LFライン）
 *
 * 既存コードでは:
 *   direction=0  → レフト方向（LFライン付近）
 *   direction=45 → センター
 *   direction=90 → ライト方向（RFライン付近）
 *
 * → sprayAngle を反転（90 - sprayAngle）して既存座標系に合わせる。
 * ファウルゾーン（< 0 or > 90）は着弾しないため範囲クランプ。
 */
export function sprayAngleToDirection(sprayAngle: number): HitDirection {
  // 範囲クランプ（ファウル打球は processPitch 側で除外済み）
  const clamped = Math.max(0, Math.min(90, sprayAngle));
  // 座標系変換: physics(右翼=0) → legacy(左翼=0)
  return 90 - clamped;
}

/**
 * exitVelocity (km/h) → HitSpeed
 *
 * 既存の bat-contact.ts では power ベースで分類していたが、
 * resolver 出力では exitVelocity が直接得られる。
 * 対応テーブル（野球シミュの経験則):
 *   < 90 km/h  → weak
 *   < 130 km/h → normal
 *   < 160 km/h → hard
 *   >= 160     → bullet
 */
export function exitVelocityToHitSpeed(exitVelocity: number): HitSpeed {
  if (exitVelocity < 90) return 'weak';
  if (exitVelocity < 130) return 'normal';
  if (exitVelocity < 160) return 'hard';
  return 'bullet';
}

// ============================================================
// FieldResult → 既存型（playResolution.fieldResult がすでに FieldResult 型）
// ============================================================

/**
 * PlayResolution から FieldResult を取り出す。
 * resolver/scoring.ts は FieldResult 型を直接出力するため変換不要。
 * この関数は明示的な意図を示すための薄いラッパー。
 */
export function playResolutionToFieldResult(resolution: PlayResolution): FieldResult {
  return resolution.fieldResult;
}

// ============================================================
// BatContactResult → BallTrajectoryParams（R4 逆マッピング）
// ============================================================

/**
 * 既存の BatContactResult（bat-contact.ts 出力）から BallTrajectoryParams を合成する。
 *
 * Phase R4 用途: calculateSwingResult で生成された legacy contact を Resolver に渡すため、
 * 逆マッピングで BallTrajectoryParams を再構成する。
 *
 * 変換ルール:
 * - contactType → launchAngle (代表値)
 * - direction (0=left, 90=right) → sprayAngle (0=right, 90=left)
 * - speed (weak/normal/hard/bullet) → exitVelocity (km/h)
 * - distance (legacy 単位) → exitVelocity の補正に使用
 */
export function batContactToTrajectoryParams(
  contact: Omit<BatContactResult, 'fieldResult'>,
): BallTrajectoryParams {
  const launchAngle = contactTypeToLaunchAngle(contact.contactType);
  const sprayAngle = directionToSprayAngle(contact.direction);
  // Phase R4: legacy distance (m) から Resolver の物理モデルで正しい飛距離になる
  // exitVelocity (km/h) を算出する。バックスピン=0 に設定して計算を安定させる。
  const exitVelocity = distanceToExitVelocity(contact.distance, contact.contactType);

  return {
    exitVelocity,
    launchAngle,
    sprayAngle,
    spin: { back: 0, side: 0 }, // バックスピン=0 で計算を単純化
  };
}

/**
 * BatContactType → 代表打球角度 (度)
 */
function contactTypeToLaunchAngle(contactType: BatContactType): number {
  switch (contactType) {
    case 'ground_ball': return 5;   // ゴロ: 低角度
    case 'line_drive':  return 15;  // ライナー: 中低角度
    case 'fly_ball':    return 35;  // フライ: 高角度
    case 'popup':       return 55;  // ポップ: 急角度
    case 'bunt_ground': return 3;   // バント: 超低角度
    default:            return 10;
  }
}

/**
 * legacy direction (0=left, 90=right) → sprayAngle (0=right, 90=left)
 * 座標系の逆変換: sprayAngle = 90 - direction
 */
function directionToSprayAngle(direction: number): number {
  return Math.max(0, Math.min(90, 90 - direction));
}

/**
 * legacy distance (m) と contactType から Resolver の simulateTrajectory が
 * 正しい飛距離を返すための exitVelocity (km/h) を計算する。
 *
 * simulateTrajectory の公式:
 *   v0 = exitVelocity * 0.911344  (ft/s)
 *   distanceFt = (v0² * sin(2θ)) / 32.174 * max(0.4, 1 - 0.0005 * v0)
 *
 * 解析的に逆解くのは困難なため、近似式を使う:
 *   exitVelocity ≈ distance_m * 0.94 + 40  (フライ系の経験則)
 *
 * これにより:
 *   - distance_m=40m (131ft): ev=78km/h → distanceFt≈125ft (内野)
 *   - distance_m=70m (230ft): ev=106km/h → distanceFt≈222ft (外野浅め)
 *   - distance_m=100m (328ft): ev=134km/h → distanceFt≈335ft (フェンス際・HR閾値付近)
 *   - distance_m=120m (394ft): ev=153km/h → distanceFt≈425ft (確実HR)
 *
 * contactType=ground_ball の場合はフライ角度が浅いため補正係数を調整。
 */
/**
 * 各 contactType での simulateTrajectory の出力を逆算して
 * legacy distance (m) → exitVelocity (km/h) を求める。
 *
 * 目標: legacy distance=100m のとき Resolver の distanceFt ≈ 330ft（HR閾値）になること。
 *
 * simulateTrajectory の近似（spin.back=0、dragFactor≈0.94-0.97）:
 *   distanceFt = (ev*0.911)² * sin(2θ) / 32.174 * dragFactor
 *
 * θ=35°（fly_ball）: `ev = 1.2 * distance` で distanceFt≈3.3*distance (ft/m)
 *   → 100m → 330ft ✓
 * θ=15°（line_drive）: sin(30°)=0.5、感度低いため補正係数を上げる
 *   → `ev = 1.6 * distance` で同等の distanceFt を狙う
 * θ=5°（ground_ball）: sin(10°)=0.174、さらに補正が必要
 *   → `ev = 3.0 * distance + 20` で 20-60ft の内野ゴロ距離を再現
 * θ=55°（popup）: sin(110°)=sin(70°)=0.94 だが距離は短め（内野フライ）
 *   → `ev = 0.8 * distance + 30` で 30-80ft の内野フライを再現
 */
function distanceToExitVelocity(distance: number, contactType: BatContactType): number {
  switch (contactType) {
    case 'ground_ball':
    case 'bunt_ground':
      return Math.max(30, distance * 3.0 + 20);
    case 'popup':
      return Math.max(30, distance * 0.8 + 30);
    case 'line_drive':
      return Math.max(40, distance * 1.6);
    case 'fly_ball':
    default:
      // fly_ball: ev = 1.2 * distance → 100m → ~330ft (HR閾値)
      return Math.max(50, distance * 1.2);
  }
}

/**
 * R4 用: 接触が確定済みの SwingLatentState を生成する。
 * resolveContact が必ず「接触成立・インフェア」を返すよう設定する。
 *
 * - contactQuality=1.0: adjustTrajectoryForContact の qualityFactor=1.0 → exitVelocity 削減なし
 * - timingWindow=0: ファウル確率を最小化（timingFoulProb(0)=0.05→約5%のみ）
 * - barrelRate: 打者の power から引き継ぐ（強打者=高いbarrelRate=強い打球）
 */
export function makeGuaranteedContactLatent(
  barrelRate = 0.5,
): SwingLatentState {
  return {
    contactQuality: 1.0,    // MAX: adjustTrajectoryForContact での削減ゼロ
    timingWindow: 0,          // タイミングジャスト → ファウル確率を最小化
    swingIntent: 0,           // 通常スイング
    decisionPressure: 0.3,
    barrelRate,
  };
}
