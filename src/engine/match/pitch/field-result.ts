/**
 * @deprecated Phase R4 で resolver/* に置換済み（バント処理除く）。
 *
 * 通常スイングのフィールド結果は `engine/physics/resolver/index.ts` の `resolvePlay()` 経由で
 * `PlayResolution.fieldResult` として取得されるようになった。
 *
 * 本ファイルは以下の目的でのみ引き続き使用される:
 * - バント打球（bunt_ground）の守備結果処理（process-pitch.ts より呼び出し）
 * - 通常スイングの fly_ball / line_drive / ground_ball 守備結果（レガシーモデル）
 *
 * 削除は Phase R5 以降（バント処理も Resolver 統合後）に行う予定。
 *
 * v0.48 Phase 2: 外野守備改善
 * - getOutfielderZone() / getOutfielderAbility() ヘルパー追加
 * - fly_ball セクションに外野到達距離計算を追加（フライヒット率 15〜30% 目標）
 * - line_drive セクションにも外野到達計算を追加
 */
import type { RNG } from '../../core/rng';
import type {
  BaseState,
  BatContactResult,
  BatterParams,
  FieldResult,
  FieldResultType,
  MatchTeam,
} from '../types';
import type { Position } from '../../types/player';
import { MATCH_CONSTANTS } from '../constants';

// ============================================================
// Phase 2: 外野守備ヘルパー
// ============================================================

/**
 * 外野手ゾーン情報
 */
export interface OutfielderZone {
  /** 外野手のポジション */
  position: 'left' | 'center' | 'right';
  /** 守備エリア基準到達距離 (m): speed=50 の外野手がカバーできる最大距離 */
  baseReachDistance: number;
}

/**
 * 外野手能力情報
 */
export interface OutfielderAbility {
  /** 守備力 0-100 */
  fielding: number;
  /** 足の速さ 0-100 */
  speed: number;
}

/**
 * 打球方向から担当外野手ゾーンを決定する
 *
 * 方向角度 (direction): 0=レフトファウルライン、45=センター、90=ライトファウルライン
 *
 * ゾーン境界:
 *   left   : 0°〜30° (レフト方向)
 *   center : 30°〜60° (センター方向)
 *   right  : 60°〜90° (ライト方向)
 *
 * 各外野手の基準到達距離（speed=50 基準）:
 *   left/right : 78m
 *     → speed=50 で maxReach=90.5m、フライヒット率約 28%
 *   center     : 82m (センターは最も広いエリアをカバー)
 *     → speed=50 で maxReach=94.5m、フライヒット率約 14%
 *   全体平均: 約 20-25%（設計書 15〜30% の目標範囲内）
 *
 * 計算根拠:
 *   fly_ball の非HR距離範囲: 70〜95m (power=50基準)
 *   maxReach = baseReachDistance + (speed / 100) * 25
 *   P(escape) = max(0, 95 - maxReach) / 25
 *   P(miss within reach) = (1 - FLY_CATCH_BASE) ≈ 0.125
 *   P(hit) = P(escape) + P(within reach) * 0.125
 */
export function getOutfielderZone(direction: number): OutfielderZone {
  if (direction < 30) {
    return { position: 'left', baseReachDistance: 78 };
  }
  if (direction < 60) {
    return { position: 'center', baseReachDistance: 82 };
  }
  return { position: 'right', baseReachDistance: 78 };
}

/**
 * チームから指定外野ポジションの守備能力を取得する
 *
 * 野手が見つからない場合はデフォルト値（fielding=50, speed=50）を返す。
 *
 * @param fieldingTeam - 守備チーム
 * @param zone         - 外野手ゾーン情報
 */
export function getOutfielderAbility(
  fieldingTeam: MatchTeam,
  zone: OutfielderZone,
): OutfielderAbility {
  for (const [playerId, pos] of fieldingTeam.fieldPositions) {
    if (pos === zone.position) {
      const mp = fieldingTeam.players.find((p) => p.player.id === playerId);
      if (mp) {
        return {
          fielding: mp.player.stats.base.fielding,
          speed: mp.player.stats.base.speed,
        };
      }
    }
  }
  // デフォルト値（外野手が配置されていない場合）
  return { fielding: 50, speed: 50 };
}

/**
 * 外野手の最大到達距離を計算する
 *
 * speed が高いほど遠くまで追いつける。
 * speed=0 でベース距離のみ、speed=100 で +25m まで到達可能。
 *
 * 例:
 *   left (base=78m), speed=50 → maxReach = 78 + 12.5 = 90.5m
 *   center (base=82m), speed=50 → maxReach = 82 + 12.5 = 94.5m
 *   left (base=78m), speed=100 → maxReach = 78 + 25 = 103m (HRより遠いが HR 判定は上流で完了)
 *
 * maxReach = baseReachDistance + (speed / 100) * 25
 *
 * @param zone     - 外野手ゾーン
 * @param ability  - 外野手能力
 */
function computeOutfielderMaxReach(
  zone: OutfielderZone,
  ability: OutfielderAbility,
): number {
  return zone.baseReachDistance + (ability.speed / 100) * 25;
}

/**
 * 打球に対する守備結果を判定する（MVP簡易守備モデル）
 *
 * 判定順:
 * 1. ホームラン（fly_ball && distance > 100）
 * 2. ポップフライ
 * 3. フライ
 * 4. ライナー
 * 5. ゴロ
 */
export function resolveFieldResult(
  contact: Omit<BatContactResult, 'fieldResult'>,
  bases: BaseState,
  outs: number,
  fieldingTeam: MatchTeam,
  batter: BatterParams,
  rng: RNG,
): FieldResult {
  const nearestFielder = getNearestFielder(contact.direction);
  const fielderPlayer = getFielderByPosition(fieldingTeam, nearestFielder);
  const fieldingScore = fielderPlayer ?? 50; // デフォルト守備力

  // ── (1) ホームラン判定 ──
  if (contact.contactType === 'fly_ball' && contact.distance > MATCH_CONSTANTS.HOME_RUN_DISTANCE) {
    return { type: 'home_run', fielder: nearestFielder, isError: false };
  }

  // ── (2) ポップフライ ──
  if (contact.contactType === 'popup') {
    if (rng.chance(MATCH_CONSTANTS.ERROR_POPUP_RATE)) {
      return { type: 'error', fielder: nearestFielder, isError: true };
    }
    return { type: 'out', fielder: nearestFielder, isError: false };
  }

  // ── (3) フライ ──
  if (contact.contactType === 'fly_ball') {
    // v0.48 Phase 2: 外野到達距離計算
    // 打球方向から担当外野手を決定し、足の速さで到達可否を判定する
    const outfielderZone = getOutfielderZone(contact.direction);
    const outfielderAbility = getOutfielderAbility(fieldingTeam, outfielderZone);
    const maxReach = computeOutfielderMaxReach(outfielderZone, outfielderAbility);

    // 外野手が追いつけない距離 → ヒット確定
    // maxReach を超えた打球は外野手が到達できずヒットになる
    if (contact.distance > maxReach) {
      const hitType = getHitTypeByDistance(contact.distance, contact.contactType);
      return { type: hitType, fielder: outfielderZone.position, isError: false };
    }

    // 追いつける範囲内: 守備力ベースの捕球確率で判定
    // 到達できても落球する可能性（catchChance）を考慮
    const catchChance = MATCH_CONSTANTS.FLY_CATCH_BASE + (outfielderAbility.fielding / 100) * 0.15;
    if (rng.chance(catchChance)) {
      // アウト → 犠飛判定
      if (bases.third !== null && outs < 2) {
        return { type: 'sacrifice_fly', fielder: outfielderZone.position, isError: false };
      }
      return { type: 'out', fielder: outfielderZone.position, isError: false };
    }
    // 追いついたが捕れなかった → ヒット
    const hitType = contact.distance > 80 ? 'double' : 'single';
    return { type: hitType, fielder: outfielderZone.position, isError: false };
  }

  // ── (4) ライナー ──
  if (contact.contactType === 'line_drive') {
    // R8-3b: ライナー性ホームラン（低弾道 HR）の判定
    // ライナーは低弾道（フェンス上を越えにくい）ため、fly_ball より低い距離閾値を使用
    // 高校野球では bullet 打球のライナー性 HR が年間数本出るリアルな確率に合わせる
    // bullet: 65m 超（高校トップレベルの強打者が低弾道でフェンスを越える）
    // hard:   75m 超（強打者が会心のライナーを打った場合）
    const lineDriveHRThreshold = contact.speed === 'bullet' ? 65 : 75;
    if ((contact.speed === 'bullet' || contact.speed === 'hard') && contact.distance > lineDriveHRThreshold) {
      return { type: 'home_run', fielder: nearestFielder, isError: false };
    }

    // v0.48 Phase 2: ライナーが外野方向（距離40m超）の場合は外野到達計算を適用
    // ライナーは低弾道のため、外野手はフライより追いつきにくい
    // 距離40m以上を「外野ライナー」と判定（内野ライナーは従来ロジック）
    if (contact.distance > 40) {
      const outfielderZone = getOutfielderZone(contact.direction);
      const outfielderAbility = getOutfielderAbility(fieldingTeam, outfielderZone);
      // ライナーは低弾道のため、外野手の到達距離を fly_ball より短めに設定
      // (speed=50 基準で fly_ball -8m 相当)
      const lineDriveMaxReach = computeOutfielderMaxReach(outfielderZone, outfielderAbility) - 8;

      // 外野手が追いつけない距離 → ヒット確定
      if (contact.distance > lineDriveMaxReach) {
        const hitType = getHitTypeByDistance(contact.distance, contact.contactType);
        return { type: hitType, fielder: outfielderZone.position, isError: false };
      }

      // 追いつける範囲内: ライナーの捕球確率（fly_ball より低い: 低弾道で難しい）
      const outChance =
        contact.speed === 'bullet'
          ? 0.20 + outfielderAbility.fielding * 0.003
          : 0.35 + outfielderAbility.fielding * 0.005;

      if (rng.chance(outChance)) {
        return { type: 'out', fielder: outfielderZone.position, isError: false };
      }
      // ヒット: 飛距離に応じて種類を決定
      const hitType = getHitTypeByDistance(contact.distance, contact.contactType);
      return { type: hitType, fielder: outfielderZone.position, isError: false };
    }

    // 内野ライナー（距離40m以下）: 従来ロジック
    const outChance =
      contact.speed === 'bullet'
        ? 0.20 + fieldingScore * 0.003
        : 0.35 + fieldingScore * 0.005;

    if (rng.chance(outChance)) {
      return { type: 'out', fielder: nearestFielder, isError: false };
    }
    // ヒット: 飛距離に応じて種類を決定
    const hitType = getHitTypeByDistance(contact.distance, contact.contactType);
    return { type: hitType, fielder: nearestFielder, isError: false };
  }

  // ── (5) バントゴロ ──
  if (contact.contactType === 'bunt_ground') {
    // 犠打成功: ランナーがいれば sacrifice
    if (bases.first !== null || bases.second !== null) {
      return { type: 'sacrifice', fielder: nearestFielder, isError: false };
    }
    return { type: 'out', fielder: nearestFielder, isError: false };
  }

  // ── (6) ゴロ ──
  // ground_ball
  const speedPenalty = batter.speed * 0.003;
  const outChance = MATCH_CONSTANTS.GROUND_OUT_BASE + fieldingScore * 0.004 - speedPenalty;

  // 併殺判定: 一塁走者 + 0-1アウト + 弱いor普通の打球
  if (
    bases.first !== null &&
    outs < 2 &&
    (contact.speed === 'weak' || contact.speed === 'normal')
  ) {
    const dpChance = MATCH_CONSTANTS.DOUBLE_PLAY_BASE + fieldingScore * 0.004;
    if (rng.chance(dpChance)) {
      return { type: 'double_play', fielder: nearestFielder, isError: false };
    }
  }

  if (rng.chance(outChance)) {
    // R8-3: エラー率を適正化（アウト確定の中に守備エラーを混入）
    // fielding stat が低いほどエラー率が上がる
    // R8-3b: 0.02 + factor*0.04 → 0.015 + factor*0.03（エラー/試合 1.04 → 0.8 目標）
    // stat=60 で 1.5%、stat=30 で 2.7%
    const errorOnOutChance = 0.015 + (1 - fieldingScore / 100) * 0.03;
    if (rng.chance(errorOnOutChance)) {
      return { type: 'error', fielder: nearestFielder, isError: true };
    }
    return { type: 'out', fielder: nearestFielder, isError: false };
  }

  // 内野安打 or ヒット
  return { type: 'single', fielder: nearestFielder, isError: false };
}

/**
 * 打球方向から最も近い野手を決定する（簡易マッピング）
 * direction: 0=レフトファウルライン, 45=センター, 90=ライトファウルライン
 */
export function getNearestFielder(direction: number): Position {
  if (direction < 10) return 'left';
  if (direction < 20) return 'third';
  if (direction < 30) return 'shortstop';
  if (direction < 40) return 'shortstop';
  if (direction < 55) return 'center';
  if (direction < 65) return 'second';
  if (direction < 75) return 'first';
  return 'right';
}

/**
 * チームから指定ポジションの野手の守備力を取得する
 * 見つからなければ null（デフォルト守備力を使用）
 */
function getFielderByPosition(team: MatchTeam, position: Position): number | null {
  for (const [playerId, pos] of team.fieldPositions) {
    if (pos === position) {
      const mp = team.players.find((p) => p.player.id === playerId);
      if (mp) {
        return mp.player.stats.base.fielding;
      }
    }
  }
  return null;
}

/**
 * 飛距離と打球種類からヒット種類を決定する
 */
function getHitTypeByDistance(
  distance: number,
  contactType: string,
): FieldResultType {
  if (contactType === 'line_drive') {
    if (distance > 90) return 'triple';
    if (distance > 60) return 'double';
    return 'single';
  }
  if (contactType === 'fly_ball') {
    if (distance > 90) return 'triple';
    return 'double';
  }
  return 'single';
}
