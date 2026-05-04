import type { RNG } from '../../core/rng';
import type { PitchType } from '../../types/player';
import type { PitchLocation, PitchSelection } from '../types';
import { MATCH_CONSTANTS } from '../constants';
import type { PitchingBias } from '../../psyche/catcher-thinking';

export interface SelectPitchResult {
  selection: PitchSelection;
  target: PitchLocation;
}

/**
 * v0.35.0: 球種ごとの速度係数（ストレート比）
 *
 * 高橋さんフィードバック: チェンジアップがストレートと速度差がないのは不自然。
 * 実際の野球の球種別スピード比（目安）:
 *   - cutter (カットボール): 0.95（ストレート比 ~5%減）
 *   - sinker (シンカー):     0.92
 *   - slider (スライダー):   0.85（ストレート比 ~15%減）
 *   - fork   (フォーク):     0.85
 *   - curve  (カーブ):       0.80（ストレート比 ~20%減）
 *   - changeup (チェンジアップ): 0.68（ストレート比 ~32%減、最も遅い）
 */
const PITCH_TYPE_VELOCITY_FACTOR: Record<PitchType, number> = {
  cutter: 0.95,
  sinker: 0.92,
  slider: 0.85,
  fork: 0.85,
  curve: 0.80,
  changeup: 0.68,
};

/**
 * 球種とコースを選択する（投手のアクション）
 *
 * @param pitchingBias Phase S2: キャッチャーの配球方針補正（省略可）
 *   省略時は従来通りの挙動
 */
export function selectPitch(
  velocity: number,
  control: number,
  availablePitches: Partial<Record<PitchType, number>>,
  balls: number,
  strikes: number,
  rng: RNG,
  pitchingBias?: PitchingBias,
): SelectPitchResult {
  // 球種選択
  const countAdvantage = strikes > balls; // 追い込み
  const countDisadvantage = balls > strikes; // 追い込まれている

  let fastballRatio =
    MATCH_CONSTANTS.FASTBALL_BASE_RATIO +
    (countAdvantage ? 0.15 : 0) +
    (countDisadvantage ? -0.1 : 0);

  // Phase S2: キャッチャー配球方針によるストレート確率補正
  if (pitchingBias !== undefined) {
    fastballRatio = Math.max(0.1, Math.min(0.95, fastballRatio + pitchingBias.fastballRatioBias));
  }

  const isFastball = rng.chance(fastballRatio);
  let selection: PitchSelection;

  if (isFastball) {
    selection = {
      type: 'fastball',
      velocity: velocity,
    };
  } else {
    // 変化球からランダム選択
    const pitchTypes = Object.keys(
      availablePitches
    ) as PitchType[];
    if (pitchTypes.length === 0) {
      // フォールバック: ストレート
      selection = {
        type: 'fastball',
        velocity: velocity,
      };
    } else {
      const pitchType = rng.pick(pitchTypes);
      const breakLevel =
        (availablePitches[pitchType] ?? 1) as number;
      // v0.35.0: 球種ごとに速度係数を変える（チェンジアップが最も遅い）
      const velocityFactor = PITCH_TYPE_VELOCITY_FACTOR[pitchType] ?? 0.9;
      selection = {
        type: pitchType,
        velocity: velocity * velocityFactor,
        breakLevel,
      };
    }
  }

  // コース選択
  // v0.40.0: ゾーン外を狙う場合は確実にゾーン外コースへ（以前はランダムで偶然ゾーン内に入ることがあった）
  let strikeZoneTargetRate =
    MATCH_CONSTANTS.STRIKE_ZONE_TARGET_BASE +
    (balls === 3 ? 0.15 : 0) + // フルカウント → ゾーン必須
    (strikes === 2 ? 0.08 : 0); // 2ストライク → ゾーン際を狙う

  // Phase S2: キャッチャー配球方針によるゾーン内狙い率補正
  if (pitchingBias !== undefined) {
    strikeZoneTargetRate = Math.max(0.1, Math.min(0.95, strikeZoneTargetRate + pitchingBias.strikeZoneBias));
  }

  const targetInZone = rng.chance(strikeZoneTargetRate);
  // ゾーン外狙いの場合は、必ず row または col のいずれか一方は 0 or 4 にする（確実にゾーン外）
  let target: PitchLocation;
  if (targetInZone) {
    // Phase S2: 外角/内角コース優先 (投手視点: col 1=内角, 2=真中, 3=外角)
    let colMin = 1;
    let colMax = 3;
    if (pitchingBias?.preferOutside) {
      // 外角優先: col 2-3 寄りにシフト (50% で col=3 を強制)
      colMin = rng.chance(0.5) ? 2 : 1;
      colMax = 3;
    } else if (pitchingBias?.preferInside) {
      // 内角優先: col 1-2 寄りにシフト (50% で col=1 を強制)
      colMin = 1;
      colMax = rng.chance(0.5) ? 2 : 3;
    }
    target = {
      row: rng.intBetween(1, 3),
      col: rng.intBetween(colMin, colMax),
    };
  } else {
    // ゾーン外コース: 50% row が 0/4、25% col が 0/4、25% 両方
    const r = rng.next();
    if (r < 0.5) {
      // row だけ外す
      target = {
        row: rng.chance(0.5) ? 0 : 4,
        col: rng.intBetween(1, 3),
      };
    } else if (r < 0.75) {
      // col だけ外す
      target = {
        row: rng.intBetween(1, 3),
        col: rng.chance(0.5) ? 0 : 4,
      };
    } else {
      // 両方外す（完全ボール球）
      target = {
        row: rng.chance(0.5) ? 0 : 4,
        col: rng.chance(0.5) ? 0 : 4,
      };
    }
  }

  return { selection, target };
}
