import type { RNG } from '../../core/rng';
import type { BatContactResult, BatterParams, Count, PitchLocation, PitchSelection } from '../types';
import { MATCH_CONSTANTS } from '../constants';
import { generateBatContact } from './bat-contact';

export interface SwingResultDetail {
  outcome: 'swinging_strike' | 'foul' | 'in_play';
  contact?: Omit<BatContactResult, 'fieldResult'>;
}

/**
 * スイングの結果を判定する
 * 1. 接触判定 → 空振り or 接触
 * 2. フェア/ファウル判定
 * 3. インプレー → 打球生成
 */
export function calculateSwingResult(
  batter: BatterParams,
  pitch: PitchSelection,
  location: PitchLocation,
  count: Count,
  rng: RNG,
): SwingResultDetail {
  // ── (1) 接触判定 ──
  // contact=100→85%, contact=50→64%, contact=10→47%
  // BASE_CONTACT_RATE は contact=100 時の上限接触率（0.85）
  let contactChance = MATCH_CONSTANTS.BASE_CONTACT_RATE * (0.50 + 0.50 * (batter.contact / 100));

  // 変化球補正: キレが高いほど接触率低下
  if (pitch.type !== 'fastball') {
    const bp = pitch as { type: string; breakLevel: number };
    contactChance -= bp.breakLevel * MATCH_CONSTANTS.BREAK_CONTACT_PENALTY;
  }

  // 球速補正: 145km/h 超えると接触率低下（緩和）
  if (pitch.velocity > 145) {
    contactChance -= ((pitch.velocity - 145) / 100) * 0.10;
  }

  // コース補正（緩和）
  if (location.row <= 0 || location.row >= 4 || location.col <= 0 || location.col >= 4) {
    // ゾーン外
    contactChance -= 0.10;
  } else if (location.row === 1 || location.row === 3 || location.col === 1 || location.col === 3) {
    // ゾーン際
    contactChance -= 0.03;
  }

  contactChance = Math.max(0, contactChance);

  if (!rng.chance(contactChance)) {
    return { outcome: 'swinging_strike' };
  }

  // ── (2) フェア/ファウル判定 ──
  let fairChance =
    MATCH_CONSTANTS.FAIR_BASE_RATE + (batter.technique / 100) * MATCH_CONSTANTS.TECHNIQUE_FAIR_BONUS;

  // 追い込み時: カットファウル増加
  if (count.strikes === 2) {
    fairChance -= 0.10;
  }

  fairChance = Math.max(0, fairChance);

  if (!rng.chance(fairChance)) {
    return { outcome: 'foul' };
  }

  // ── (3) フェア打球 → 打球生成 ──
  const contact = generateBatContact(batter, pitch, location, rng);
  return { outcome: 'in_play', contact };
}
