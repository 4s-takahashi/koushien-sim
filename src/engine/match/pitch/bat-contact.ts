import type { RNG } from '../../core/rng';
import type { BatContactResult, BatContactType, BatterParams, HitSpeed, PitchHistoryEntry, PitchLocation, PitchSelection } from '../types';
import { MATCH_CONSTANTS } from '../constants';
import { computeHighMiddleBoost, computeVelocityChangeEffect } from './pitch-sequence';

/**
 * v0.37.0: スイングのタイミング
 *   - early: 振りが早い/詰まる（インコース速球に対して）→ 引っ張り方向へ、弱めの打球
 *   - perfect: ジャストミート → 狙い通りの方向、強い打球
 *   - late: 振り遅れ → 流し方向へ、打球は弱め
 */
type SwingTiming = 'early' | 'perfect' | 'late';

/**
 * スイングが当たった際の打球を生成する
 * 打球種類・方向・速度・飛距離を算出する（守備結果はここでは確定しない）
 *
 * v0.37.0 改訂:
 *   - 打者の左右 (battingSide) を反映
 *   - 球速とコースから振り遅れ/詰まりを判定（swing timing）
 *   - コース × タイミングで打球方向を決定（引っ張り/センター返し/流し）
 *   - 球種の速度差（チェンジアップ等）でタイミングずれが起きやすい
 *   - ファール判定もここで行う（isFoul フラグ）
 */
export function generateBatContact(
  batter: BatterParams,
  pitch: PitchSelection,
  location: PitchLocation,
  rng: RNG,
  history?: readonly PitchHistoryEntry[],
): Omit<BatContactResult, 'fieldResult'> & { isFoul?: boolean } {
  const powerFactor = batter.power / 100;
  const contactFactor = batter.contact / 100;
  const techniqueFactor = batter.technique / 100;

  // ── (A) スイングタイミング判定 ──
  // インコース速球: early（詰まる）
  // アウトコース速球: late（流れる）
  // チェンジアップ/カーブなど低速: early（早く振って泳ぐ）
  // ゾーン外ボール球: timing ずれやすい
  // v0.40.0: 前球との球速差（緩急）もタイミングに影響
  const timing = computeSwingTiming(batter, pitch, location, rng, history);

  // ── (B) 打球種類 ──
  // base distribution at powerFactor=0.5
  const deltaFromBase = powerFactor - 0.5; // -0.5 ~ +0.5

  let pGround = 0.40 - deltaFromBase * 0.20;
  let pLine = 0.20 + deltaFromBase * 0.10;
  let pFly = 0.30 + deltaFromBase * 0.20;
  let pPopup = 0.10 - deltaFromBase * 0.10;

  // コース補正
  if (location.row === 3 || location.row === 4) {
    // 低め → ゴロ増
    pGround += 0.18;
    pFly -= 0.10;
    pLine -= 0.05;
  } else if (location.row === 1 || location.row === 0) {
    // 高め → フライ・ポップ増
    pFly += 0.18;
    pPopup += 0.07;
    pGround -= 0.18;
    pLine -= 0.04;
  }

  // v0.37.0: タイミング補正
  if (timing === 'early') {
    // 早打ち/詰まり → ゴロ/ポップ増、ライナー減
    pGround += 0.08;
    pPopup += 0.05;
    pLine -= 0.08;
    pFly -= 0.05;
  } else if (timing === 'late') {
    // 振り遅れ → フライ/ポップ増
    pFly += 0.05;
    pPopup += 0.08;
    pLine -= 0.08;
    pGround -= 0.05;
  }

  // v0.40.0: 高めの甘い球ブースト — line_drive / fly_ball が強くなる
  const highMiddleBoost = computeHighMiddleBoost(location, pitch);
  if (highMiddleBoost > 0) {
    pLine += highMiddleBoost * 0.5;
    pFly += highMiddleBoost * 0.5;
    pGround -= highMiddleBoost * 0.6;
    pPopup -= highMiddleBoost * 0.4;
  }

  // 正規化
  pGround = Math.max(0, pGround);
  pLine = Math.max(0, pLine);
  pFly = Math.max(0, pFly);
  pPopup = Math.max(0, pPopup);
  const total = pGround + pLine + pFly + pPopup;
  const r = rng.next() * total;

  let contactType: BatContactType;
  if (r < pGround) {
    contactType = 'ground_ball';
  } else if (r < pGround + pLine) {
    contactType = 'line_drive';
  } else if (r < pGround + pLine + pFly) {
    contactType = 'fly_ball';
  } else {
    contactType = 'popup';
  }

  // ── (C) 打球速度 ──
  const zoneQuality = isInCenterZone(location) ? 1.0 : 0.7;
  const contactQuality = contactFactor * zoneQuality;
  let base = powerFactor * 0.6 + contactQuality * 0.4;

  // v0.37.0: タイミングで打球速度が変わる
  if (timing === 'early') base *= 0.75;   // 詰まりは弱い
  else if (timing === 'late') base *= 0.80; // 振り遅れも弱い
  // perfect はそのまま

  // v0.40.0: 高めの甘い球は打球速度も上がる（HR リスク UP）
  if (highMiddleBoost > 0 && timing === 'perfect') {
    base *= 1 + highMiddleBoost * 0.8; // 最大 +15%
  }

  let speed: HitSpeed;
  if (base < 0.25) {
    speed = 'weak';
  } else if (base < 0.50) {
    speed = 'normal';
  } else if (base < 0.75) {
    speed = 'hard';
  } else {
    speed = 'bullet';
  }

  // ── (D) 打球方向（引っ張り/センター返し/流し/ファール） ──
  // 0°=LF, 45°=CF, 90°=RF
  // 右打者の引っ張り = レフト方向（0°寄り）、流し = ライト方向（90°寄り）
  // 左打者は逆
  const batsRight = batter.battingSide !== 'left';

  // コースから想定方向（右打基準、あとで左打で反転）
  // col 0 = 内角 (右打なら身体に近い)、col 4 = 外角
  let baseDirForRight = 45; // センター基準
  if (location.col <= 1) {
    // インコース → 引っ張り（レフト方向 20°）
    baseDirForRight = 20;
  } else if (location.col >= 3) {
    // アウトコース → 流し（ライト方向 70°）
    baseDirForRight = 70;
  } else {
    // ど真ん中 → センター
    baseDirForRight = 45;
  }

  // タイミング補正（右打基準）
  // early = 引っ張り側へ強くずれる
  // late  = 流し側へ強くずれる
  if (timing === 'early') {
    baseDirForRight -= 18;
  } else if (timing === 'late') {
    baseDirForRight += 18;
  }

  // technique が高いほど狙い通りに打てる → σ 小
  const sigma = 22 - techniqueFactor * 12; // σ: 10-22
  let direction = rng.gaussian(baseDirForRight, sigma);

  // 左打者は左右反転
  if (!batsRight) {
    direction = 90 - direction;
  }

  // ── (E) ファール判定（打球方向が大きく外れた場合） ──
  // direction < -5 or > 95 はファール確定
  // -5〜5 / 85〜95 は確率的にファール
  let isFoul = false;
  if (direction < -10 || direction > 100) {
    isFoul = true;
  } else if (direction < 0 || direction > 90) {
    // 際どい場合は 70% ファール
    isFoul = rng.chance(0.7);
  } else if (direction < 5 || direction > 85) {
    // ライン際は 25% ファール
    isFoul = rng.chance(0.25);
  }

  // ファールでない場合は範囲内クランプ
  if (!isFoul) {
    direction = Math.max(0, Math.min(90, direction));
  } else {
    // ファール方向は -30°〜-5° / 95°〜120° のファールゾーンに広げる
    if (direction < 45) {
      direction = Math.max(-30, Math.min(-2, direction - 3));
    } else {
      direction = Math.max(92, Math.min(120, direction + 3));
    }
  }

  // ── (F) 飛距離 ──
  let distance: number;
  switch (contactType) {
    case 'ground_ball':
      distance = 20 + rng.next() * 40; // 20-60m
      break;
    case 'line_drive':
      distance = 40 + powerFactor * rng.next() * 70; // 40-110m
      break;
    case 'fly_ball':
      distance = 40 + powerFactor * 60 + rng.next() * 40; // 40-140m
      break;
    case 'popup':
    default:
      distance = 10 + rng.next() * 30; // 10-40m
      break;
  }

  // タイミングずれは飛距離も減らす
  if (timing === 'early' || timing === 'late') {
    distance *= 0.85;
  }

  return { contactType, direction, speed, distance, isFoul };
}

/**
 * v0.37.0: スイングタイミングを判定する
 *   - インコースの速球 → 詰まりやすい (early)
 *   - アウトコースの速球 → 振り遅れやすい (late)
 *   - 球速が速い (>140) → タイミングずれやすい
 *   - 球速が遅い変化球 (<120) → 早く振り過ぎる (early)
 *   - technique/contact が高いとタイミング合わせやすい
 */
function computeSwingTiming(
  batter: BatterParams,
  pitch: PitchSelection,
  location: PitchLocation,
  rng: RNG,
  history?: readonly PitchHistoryEntry[],
): SwingTiming {
  const timingSkill = (batter.contact + batter.technique) / 200; // 0-1
  // ベース perfect 率: 0.35 (timingSkill=0) 〜 0.65 (timingSkill=1)
  let pPerfect = 0.35 + 0.30 * timingSkill;
  let pEarly = (1 - pPerfect) / 2;
  let pLate = (1 - pPerfect) / 2;

  // 球速補正
  if (pitch.velocity > 145) {
    // 速球 → 振り遅れやすい
    pLate += 0.15;
    pPerfect -= 0.10;
    pEarly -= 0.05;
  } else if (pitch.velocity < 115) {
    // 緩い球（チェンジアップ系） → 早く振り過ぎる
    pEarly += 0.15;
    pPerfect -= 0.10;
    pLate -= 0.05;
  }

  // コース補正
  // col 0-1 (インコース): 速球なら詰まり、緩いなら引っ張り
  // col 3-4 (アウトコース): 速球なら流れ気味、緩いなら泳ぐ
  if (location.col <= 1) {
    if (pitch.velocity > 130) {
      pEarly += 0.10; // 詰まり
      pPerfect -= 0.05;
      pLate -= 0.05;
    }
  } else if (location.col >= 3) {
    if (pitch.velocity > 130) {
      pLate += 0.10; // 流し気味
      pPerfect -= 0.05;
      pEarly -= 0.05;
    }
  }

  // ゾーン外の厳しいボール球は合わせにくい
  if (location.row <= 0 || location.row >= 4 || location.col <= 0 || location.col >= 4) {
    pPerfect -= 0.15;
    pEarly += 0.08;
    pLate += 0.07;
  }

  // v0.40.0: 緩急効果（前球との球速差）
  const velChange = computeVelocityChangeEffect(pitch.velocity, history);
  if (velChange > 0 && history && history.length > 0) {
    const prev = history[history.length - 1];
    const faster = pitch.velocity > prev.velocity;
    pPerfect -= velChange * 1.2;
    if (faster) {
      // 前より速くなった → 振り遅れ傾向
      pLate += velChange * 1.0;
      pEarly += velChange * 0.2;
    } else {
      // 前より遅くなった → 早打ち傾向（泳ぐ）
      pEarly += velChange * 1.0;
      pLate += velChange * 0.2;
    }
  }

  // クランプ + 正規化
  pPerfect = Math.max(0.05, pPerfect);
  pEarly = Math.max(0.05, pEarly);
  pLate = Math.max(0.05, pLate);
  const total = pPerfect + pEarly + pLate;
  const r = rng.next() * total;

  if (r < pEarly) return 'early';
  if (r < pEarly + pPerfect) return 'perfect';
  return 'late';
}

/** コース品質: 真中3×3の内側（row=2, col=2が最高）かどうか */
function isInCenterZone(location: PitchLocation): boolean {
  return location.row === 2 && location.col === 2;
}
