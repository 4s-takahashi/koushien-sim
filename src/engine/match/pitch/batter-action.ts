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
    // R8-3: eye=100 → 2%振る, eye=50 → 15%振る, eye=0 → 30%振る
    // 旧: (100 - eye) / 230 → eye=50で21.7% → ボール球を振りすぎて四球少ない
    let swingAtBall = (100 - batter.eye) / 330;  // R8-3: 230 → 330（ボール見極め改善）

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
  // v0.40.0: 見逃し率を上げて三振率を 15% 以上へ
  // contact=100 → 0%見逃し, contact=50 → 10%見逃し, contact=0 → 20%
  let takeStrike = (100 - batter.contact) / 500;

  // カウント補正
  if (count.strikes === 0) {
    takeStrike += 0.22; // 初球見逃しで投球数稼ぎ
  } else if (count.strikes === 1) {
    takeStrike += 0.08;
  } else if (count.strikes === 2) {
    // 2ストライク時も見逃し三振の可能性を残す
    takeStrike += 0.02;
  }

  return rng.chance(takeStrike) ? 'take' : 'swing';
}
