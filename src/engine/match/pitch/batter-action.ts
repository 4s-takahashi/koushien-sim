import type { RNG } from '../../core/rng';
import type { BatterAction, BatterParams, Count, PitchLocation, PitchSelection, TacticalOrder } from '../types';
import { isInStrikeZone } from '../types';

/**
 * 打者が投球に対してどのアクションを取るかを決定する
 *
 * 優先順位:
 * 1. 采配チェック（バント指示）
 * 2. ボール球の見極め（isInZone=false の場合）
 * 3. ストライクゾーン内の見逃し判定
 */
export function decideBatterAction(
  batter: BatterParams,
  pitch: PitchSelection,
  location: PitchLocation,
  count: Count,
  order: TacticalOrder,
  rng: RNG,
): BatterAction {
  // (1) 采配チェック: バント指示
  if (order.type === 'bunt') {
    return 'bunt';
  }

  const isInZone = isInStrikeZone(location);

  // (2) ボール球の見極め
  if (!isInZone) {
    // eye=100 → 0%振る, eye=50 → 21.7%振る, eye=0 → 43.5%振る
    let swingAtBall = (100 - batter.eye) / 230;

    // 変化球補正: キレが高いほど見極めにくい
    if (pitch.type !== 'fastball') {
      swingAtBall += (pitch as { type: string; breakLevel: number }).breakLevel * 0.03;
    }

    // カウント補正: 追い込まれると振りやすい
    if (count.strikes === 2) {
      swingAtBall += 0.15;
    }

    return rng.chance(swingAtBall) ? 'swing' : 'take';
  }

  // (3) ストライクゾーン内: 見逃し判定
  // contact=100 → 0%見逃し, contact=50 → 12.5%見逃し, contact=0 → 25%
  let takeStrike = (100 - batter.contact) / 400;

  // カウント補正
  if (count.strikes === 0) {
    takeStrike += 0.10; // 余裕があるので見る
  } else if (count.strikes === 1) {
    takeStrike += 0.03;
  }
  // 2ストライク → ほぼ振る

  return rng.chance(takeStrike) ? 'take' : 'swing';
}
