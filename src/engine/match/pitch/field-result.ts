/**
 * @deprecated Phase R4 で resolver/* に置換済み（バント処理除く）。
 *
 * 通常スイングのフィールド結果は `engine/physics/resolver/index.ts` の `resolvePlay()` 経由で
 * `PlayResolution.fieldResult` として取得されるようになった。
 *
 * 本ファイルは以下の目的でのみ引き続き使用される:
 * - バント打球（bunt_ground）の守備結果処理（process-pitch.ts より呼び出し）
 *
 * 削除は Phase R5 以降（バント処理も Resolver 統合後）に行う予定。
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
    const catchChance = MATCH_CONSTANTS.FLY_CATCH_BASE + (fieldingScore / 100) * 0.15;
    if (rng.chance(catchChance)) {
      // アウト → 犠飛判定
      if (bases.third !== null && outs < 2) {
        return { type: 'sacrifice_fly', fielder: nearestFielder, isError: false };
      }
      return { type: 'out', fielder: nearestFielder, isError: false };
    }
    // ヒット
    const hitType = contact.distance > 80 ? 'double' : 'single';
    return { type: hitType, fielder: nearestFielder, isError: false };
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
