import type { RNG } from '../../core/rng';
import type { BatContactResult, BatContactType, BatterParams, HitSpeed, PitchLocation, PitchSelection } from '../types';
import { MATCH_CONSTANTS } from '../constants';

/**
 * スイングが当たった際の打球を生成する
 * 打球種類・方向・速度・飛距離を算出する（守備結果はここでは確定しない）
 *
 * @param longHitMultiplier 長打飛距離乗数 (Phase 11-A2)。1.0 = 補正なし、1.05 = aggressive +5%
 */
export function generateBatContact(
  batter: BatterParams,
  pitch: PitchSelection,
  location: PitchLocation,
  rng: RNG,
  longHitMultiplier: number = 1.0,
): Omit<BatContactResult, 'fieldResult'> {
  const powerFactor = batter.power / 100;
  const contactFactor = batter.contact / 100;

  // ── (1) 打球種類 ──
  // base distribution at powerFactor=0.5
  // ground_ball: 40%, line_drive: 20%, fly_ball: 30%, popup: 10%
  // パワーが高いほど fly_ball↑ line_drive↑ ground_ball↓ popup↓
  const deltaFromBase = powerFactor - 0.5; // -0.5 ~ +0.5

  let pGround = 0.40 - deltaFromBase * 0.20;
  let pLine = 0.20 + deltaFromBase * 0.10;
  let pFly = 0.30 + deltaFromBase * 0.20;
  let pPopup = 0.10 - deltaFromBase * 0.10;

  // コース補正
  if (location.row === 3) {
    // 低め → ゴロ増
    pGround += 0.15;
    pFly -= 0.10;
    pLine -= 0.05;
  } else if (location.row === 1) {
    // 高め → フライ・ポップ増
    pFly += 0.15;
    pPopup += 0.05;
    pGround -= 0.15;
    pLine -= 0.05;
  }

  // 正規化（0以下にならないようにクランプ）
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

  // ── (2) 打球速度 ──
  // contactQuality = contact能力とコース精度（ゾーン中央ほど質が高い）
  const zoneQuality = isInCenterZone(location) ? 1.0 : 0.7;
  const contactQuality = contactFactor * zoneQuality;
  const base = powerFactor * 0.6 + contactQuality * 0.4;

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

  // ── (3) 打球方向 ──
  // technique が高いほど狙い打ちができる（σ小）
  const sigma = 30 - (batter.technique / 100) * 15; // σ: 15-30
  let direction = rng.gaussian(45, sigma);
  direction = Math.max(0, Math.min(90, direction));

  // ── (4) 飛距離 ──
  let distance: number;
  switch (contactType) {
    case 'ground_ball':
      distance = 20 + rng.next() * 40; // 20-60m
      break;
    case 'line_drive':
      distance = 40 + powerFactor * rng.next() * 70; // 40-110m
      break;
    case 'fly_ball':
      distance = 40 + powerFactor * 60 + rng.next() * 40; // 40-140m, power依存
      break;
    case 'popup':
    default:
      distance = 10 + rng.next() * 30; // 10-40m
      break;
  }

  // Phase 11-A2: aggressive スタイルは長打係数 +5%（フライ・ライナーに適用）
  if (longHitMultiplier !== 1.0 && (contactType === 'fly_ball' || contactType === 'line_drive')) {
    distance = distance * longHitMultiplier;
  }

  return { contactType, direction, speed, distance };
}

/** コース品質: 真中3×3の内側（row=2, col=2が最高）かどうか */
function isInCenterZone(location: PitchLocation): boolean {
  return location.row === 2 && location.col === 2;
}
