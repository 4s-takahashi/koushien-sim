import type { RNG } from '../../core/rng';
import type { BatContactResult, BatterParams, Count, PitchHistoryEntry, PitchLocation, PitchSelection } from '../types';
import { MATCH_CONSTANTS } from '../constants';
import { generateBatContact } from './bat-contact';
import { computeContactRateAdjustment } from './pitch-sequence';

export interface SwingResultDetail {
  outcome: 'swinging_strike' | 'foul' | 'in_play';
  contact?: Omit<BatContactResult, 'fieldResult'>;
}

/**
 * スイングの結果を判定する
 * v0.37.0: 打球方向・タイミング実装
 * v0.40.0: 配球学習（緩急・出し入れ・同一コース連続）
 */
export function calculateSwingResult(
  batter: BatterParams,
  pitch: PitchSelection,
  location: PitchLocation,
  count: Count,
  rng: RNG,
  history?: readonly PitchHistoryEntry[],
): SwingResultDetail {
  // ── (1) 接触判定 ──
  // R8-3: BASE_CONTACT_RATE=0.85 を使用するが、球速・コースで最大 0.65 まで下げる
  // 目標三振率: 18-25%。接触率が高すぎると三振が少なくなる
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

  // v0.40.0: 配球学習補正（緩急・出し入れ・同一コース連続）
  const seqAdjust = computeContactRateAdjustment(location, pitch, history);
  contactChance += seqAdjust.delta;

  contactChance = Math.max(0, contactChance);

  if (!rng.chance(contactChance)) {
    return { outcome: 'swinging_strike' };
  }

  // ── (2) 打球生成（ファール判定も内包） ──
  const contact = generateBatContact(batter, pitch, location, rng, history);

  // v0.37.0: 追い込み時はカットファール増加（2ストライクで粘る）
  let isFoul = contact.isFoul ?? false;
  if (count.strikes === 2 && !isFoul) {
    // 2ストライクでは +10% ファール率
    if (rng.chance(0.10)) {
      isFoul = true;
      // ファール方向にわずかに寄せる
      const dir = contact.direction;
      if (dir < 45) {
        contact.direction = Math.max(-5, dir - 8);
      } else {
        contact.direction = Math.min(95, dir + 8);
      }
    }
  }

  // isFoul を除去して contact オブジェクトを返す
  const { isFoul: _isFoulRemoved, ...contactWithoutFoulFlag } = contact;

  if (isFoul) {
    return { outcome: 'foul', contact: contactWithoutFoulFlag };
  }

  // フェア打球
  return { outcome: 'in_play', contact: contactWithoutFoulFlag };
}
