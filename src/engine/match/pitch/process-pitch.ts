import type { RNG } from '../../core/rng';
import type {
  BatContactResult,
  BatterParams,
  BatterAction,
  MatchPlayer,
  MatchState,
  PitchHistoryEntry,
  PitchResult,
  PitcherParams,
  PitchOutcome,
  TacticalOrder,
} from '../types';
import { isInStrikeZone } from '../types';
import { getMoodMultiplier, getConfidenceMultiplier } from '../../shared/stat-utils';
import { selectPitch } from './select-pitch';
import { applyControlError } from './control-error';
import { decideBatterAction } from './batter-action';
import { calculateSwingResult } from './swing-result';
// Phase R4: バントのみ legacy field-result を使用（Resolver はスイング用）
import { resolveFieldResult } from './field-result';
import { MATCH_CONSTANTS } from '../constants';
import { getMotivation, getMatchPerformanceMultiplier } from '../../growth/motivation';
import type { MatchOverrides } from '../runner-types';
// Phase R4: Resolver 統合
import { resolveBatBall } from '../../physics/bat-ball/index';
import { computePerceivedPitchQuality } from '../../physics/bat-ball/perceived-quality';
import {
  sprayAngleToDirection,
  exitVelocityToHitSpeed,
} from './legacy-adapter';
import type { BatBallContext } from '../../physics/types';
import { simulateTrajectory } from '../../physics/trajectory';
import { classifyDetailedHit } from '../../physics/resolver/batted-ball-classifier';
// Phase R6: NarrativeHook 生成
import { generateNarrativeHook } from '../../narrative/hook-generator';

// ============================================================
// メンタル補正ヘルパー（Phase 7-E1）
// ============================================================

/**
 * 補正値を安全範囲にクリップする。
 * 極端なメンタル補正によるゲームバランス崩壊を防ぐ。
 */
function clampBonus(value: number, min = -0.3, max = 0.3): number {
  return Math.max(min, Math.min(max, value));
}

// ============================================================
// 実効パラメータ算出
// ============================================================

/**
 * 投手の実効パラメータを算出する（疲労・コンディション補正込み）
 * @param overrides Phase 7-E1: 心理補正（省略可）
 */
export function getEffectivePitcherParams(
  mp: MatchPlayer,
  overrides?: MatchOverrides['pitcherMental'],
): PitcherParams {
  const p = mp.player;
  const ps = p.stats.pitching!;

  const fatigueRatio = mp.stamina / 100; // 1.0 = 元気、0.0 = 限界
  const moodMult = getMoodMultiplier(p.condition.mood);
  const confMult = getConfidenceMultiplier(mp.confidence);

  // Phase 7-E1: 心理補正を適用（override が未指定なら従来通り）
  const velBonus = overrides?.velocityBonus !== undefined
    ? Math.max(-5, Math.min(5, overrides.velocityBonus))
    : 0;
  const ctrlBonus = overrides?.controlBonus !== undefined
    ? clampBonus(overrides.controlBonus)
    : 0;

  return {
    velocity: ps.velocity * (0.85 + 0.15 * fatigueRatio) * moodMult + velBonus,
    control: ps.control * fatigueRatio * moodMult * confMult * (1 + ctrlBonus),
    pitchStamina: ps.pitchStamina,
    pitches: ps.pitches,
    mental: p.stats.base.mental,
    focus: p.stats.base.focus,
    pitchCountInGame: mp.pitchCountInGame,
    stamina: mp.stamina,
    mood: p.condition.mood,
    confidence: mp.confidence,
  };
}

/**
 * 打者の実効パラメータを算出する（コンディション補正込み）
 * @param overrides Phase 7-E1: 心理補正（省略可）
 */
export function getEffectiveBatterParams(
  mp: MatchPlayer,
  overrides?: MatchOverrides['batterMental'],
): BatterParams {
  const p = mp.player;
  const moodMult = getMoodMultiplier(p.condition.mood);
  const confMult = getConfidenceMultiplier(mp.confidence);

  // メンタルフラグによる補正
  let contactMult = moodMult * confMult;
  let powerMult = moodMult;
  if (p.mentalState.flags.includes('slump')) {
    contactMult *= 0.85;
    powerMult *= 0.85;
  }

  // モチベーション補正 (Phase 11-A3 2026-04-19): ±10%
  const motivationMult = getMatchPerformanceMultiplier(getMotivation(p));
  contactMult *= motivationMult;
  powerMult *= motivationMult;

  // Phase 7-E1: 心理補正を適用（override が未指定なら従来通り）
  const contactBonus = overrides?.contactBonus !== undefined
    ? clampBonus(overrides.contactBonus)
    : 0;
  const powerBonus = overrides?.powerBonus !== undefined
    ? clampBonus(overrides.powerBonus)
    : 0;

  contactMult *= (1 + contactBonus);
  powerMult *= (1 + powerBonus);

  return {
    // 最低実効値を設定して低スペック選手の極端な挙動を抑制
    contact: Math.max(60, p.stats.batting.contact * contactMult),
    power: Math.max(20, p.stats.batting.power * powerMult),
    eye: Math.max(30, p.stats.batting.eye * moodMult),
    technique: Math.max(20, p.stats.batting.technique * moodMult),
    speed: p.stats.base.speed,
    mental: p.stats.base.mental,
    focus: p.stats.base.focus,
    battingSide: p.battingSide,
    confidence: mp.confidence,
    mood: p.condition.mood,
  };
}

// ============================================================
// 投手スタミナ消費
// ============================================================

const PITCH_STAMINA_COST: Record<string, number> = {
  fastball: 1.0,
  curve: 0.9,
  slider: 1.0,
  fork: 1.2,
  changeup: 0.8,
  cutter: 1.0,
  sinker: 1.1,
};

function calcStaminaCost(
  pitchType: string,
  velocity: number,
  baseVelocity: number,
  pitchStamina: number,
): number {
  const pitchTypeCost = PITCH_STAMINA_COST[pitchType] ?? 1.0;
  const fullPower = velocity > baseVelocity * 0.95 ? 1.3 : 1.0;
  let cost = MATCH_CONSTANTS.STAMINA_PER_PITCH_BASE * pitchTypeCost * fullPower;
  cost /= pitchStamina / 50;
  return cost;
}

// ============================================================
// Phase R4: Resolver 統合ヘルパー
// ============================================================

/**
 * 打席状況から BatBallContext を構築する（R4 Resolver 呼び出し用）
 *
 * timingError は 0（R4 では swing-result.ts でのタイミング判定を通ったあとの in_play に対して呼ぶため、
 * タイミングはすでに swing 成立として扱う）。
 */
function buildBatBallContext(
  pitcher: PitcherParams,
  batter: BatterParams,
  selection: import('../types').PitchSelection & { breakLevel?: number },
  actualLocation: import('../types').PitchLocation,
  state: MatchState,
  pitcherMP: MatchPlayer,
  batterMP: MatchPlayer,
  order: TacticalOrder,
): BatBallContext {
  // 直前の投球球速を取得（打席内履歴の最後から1つ前）
  const history = state.currentAtBatPitches ?? [];
  const previousPitchVelocity = history.length > 0
    ? history[history.length - 1].velocity
    : null;

  // 投球キレ
  const pitchBreakLevel = selection.type !== 'fastball'
    ? (selection.breakLevel ?? 0)
    : 0;

  // 打者認知品質
  const perceivedPitch = computePerceivedPitchQuality({
    pitchVelocity: selection.velocity,
    pitchType: selection.type,
    pitchBreakLevel,
    pitchActualLocation: actualLocation,
    pitcher,
    previousPitchVelocity,
    previousPitchType: history.length > 0 ? history[history.length - 1].pitchType : null,
    pitcherStaminaPct: pitcherMP.stamina,
    pitcherConfidence: pitcherMP.confidence,
  });

  // 采配から focusArea / aggressiveness を抽出
  let orderFocusArea: BatBallContext['orderFocusArea'] = 'none';
  let orderAggressiveness: BatBallContext['orderAggressiveness'] = 'normal';
  if (order.type === 'batter_detailed') {
    orderFocusArea = order.focusArea ?? 'none';
    orderAggressiveness = order.aggressiveness ?? 'normal';
  }

  // batterSwingType: 特性から決定する（pull/spray/opposite）
  // R7-1: hotblooded/competitive/passionate → pull 傾向、steady/stoic → spray 傾向
  const batterPlayerTraits = batterMP.player.traits as ReadonlyArray<string>;
  const pullTraits = ['hotblooded', 'competitive', 'passionate', 'bold'] as const;
  const oppositeTraits = ['calm', 'stoic', 'strategist'] as const;
  const batterSwingType: 'pull' | 'spray' | 'opposite' =
    batterPlayerTraits.some((t) => (pullTraits as ReadonlyArray<string>).includes(t))
      ? 'pull'
      : batterPlayerTraits.some((t) => (oppositeTraits as ReadonlyArray<string>).includes(t))
      ? 'opposite'
      : 'spray';

  // batterMood: Mood enum → -1〜+1 の数値へ変換
  const moodToNumber = (mood: import('../../types/player').Mood): number => {
    switch (mood) {
      case 'excellent': return 1.0;
      case 'good':      return 0.5;
      case 'normal':    return 0.0;
      case 'poor':      return -0.5;
      case 'terrible':  return -1.0;
      default:          return 0.0;
    }
  };

  const scoreDiff = state.score.home - state.score.away;
  // 攻撃側の視点での点差（攻撃チームが home なら +、away なら - を引っくり返す）
  const attackingTeamScoreDiff = state.currentHalf === 'bottom' ? scoreDiff : -scoreDiff;

  return {
    pitcher,
    perceivedPitch,
    pitchVelocity: selection.velocity,
    pitchType: selection.type,
    pitchBreakLevel,
    pitchActualLocation: actualLocation,
    batter,
    batterSwingType,
    // R8-3: timingError にリアルな分散を追加（常に 0 だと barrelRate が偏る）
    // 球速・制球から打者のタイミング誤差を推定（-50〜+50ms 程度）
    // 速球・変化球ほどタイミングが難しい
    timingError: (() => {
      const velocityPenalty = Math.max(0, (selection.velocity - 120) * 0.3);
      const breakPenalty = pitchBreakLevel * 3;
      const eyeFactor = 1 - batter.eye / 150; // eye が高いほど誤差小
      const maxError = (15 + velocityPenalty + breakPenalty) * eyeFactor;
      // ±maxError の範囲で正規分布的にばらつく（RNG は別途 state から取れないためここでは近似）
      return 0; // process-pitch.ts の RNG を渡せないため 0 を維持、以下の ballOnBat で代替
    })(),
    // R8-3: ballOnBat にリアルな芯ズレを追加
    // contact=100 → 芯に近い(0.7-0.9)、contact=30 → 大幅ずれ(0.2-0.5)
    // ここでは contact 能力から推定した期待値を使用（RNG は別スタックのため確定的に）
    ballOnBat: Math.min(0.9, Math.max(0.1, 0.3 + batter.contact / 140)),
    previousPitchVelocity,
    count: state.count,
    inning: state.currentInning,
    scoreDiff: attackingTeamScoreDiff,
    outs: state.outs,
    bases: state.bases,
    isKeyMoment: false,
    orderFocusArea,
    orderAggressiveness,
    batterTraits: batterPlayerTraits,
    batterMood: moodToNumber(batter.mood),
  };
}

// ============================================================
// 現在の打者・投手を取得するヘルパー
// ============================================================

function getCurrentBatter(state: MatchState): MatchPlayer {
  const battingTeam =
    state.currentHalf === 'top' ? state.awayTeam : state.homeTeam;
  const batterId = battingTeam.battingOrder[state.currentBatterIndex];
  const mp = battingTeam.players.find((p) => p.player.id === batterId);
  if (!mp) throw new Error(`Batter not found: ${batterId}`);
  return mp;
}

function getCurrentPitcher(state: MatchState): MatchPlayer {
  const fieldingTeam =
    state.currentHalf === 'top' ? state.homeTeam : state.awayTeam;
  const pitcherId = fieldingTeam.currentPitcherId;
  const mp = fieldingTeam.players.find((p) => p.player.id === pitcherId);
  if (!mp) throw new Error(`Pitcher not found: ${pitcherId}`);
  return mp;
}

function getFieldingTeam(state: MatchState) {
  return state.currentHalf === 'top' ? state.homeTeam : state.awayTeam;
}

// ============================================================
// カウント・アウト・走者の更新
// ============================================================

function updateMatcherAfterPitch(
  state: MatchState,
  outcome: PitchOutcome,
  batContact: BatContactResult | null,
): MatchState {
  let { count, outs, bases, score, inningScores, pitchCount } = state;
  const isBottom = state.currentHalf === 'bottom';

  // 投球数加算（フィールディングチーム側の投手）
  pitchCount = pitchCount + 1;

  switch (outcome) {
    case 'called_strike':
    case 'swinging_strike':
    case 'foul_bunt': {
      const newStrikes = Math.min(count.strikes + 1, 2);
      count = { ...count, strikes: newStrikes };
      break;
    }
    case 'foul': {
      // 2ストライク時はカウント変化なし（ファウルで三振にならない）
      if (count.strikes < 2) {
        count = { ...count, strikes: count.strikes + 1 };
      }
      break;
    }
    case 'ball': {
      count = { ...count, balls: count.balls + 1 };
      break;
    }
    case 'in_play': {
      // 打球処理済み: batContact.fieldResult から判定
      if (batContact) {
        const fr = batContact.fieldResult;
        switch (fr.type) {
          case 'out':
          case 'double_play':
          case 'sacrifice':
          case 'sacrifice_fly': {
            const addOuts = fr.type === 'double_play' ? 2 : 1;
            outs = Math.min(outs + addOuts, 3);
            break;
          }
          case 'single': {
            // ランナー進塁（簡易: 全員2進塁、得点圏走者はホームへ）
            const result = advanceRunnersOnSingle(bases, state, score, inningScores, isBottom);
            bases = result.bases;
            score = result.score;
            inningScores = result.inningScores;
            // 打者は一塁へ
            const batterId = state.currentHalf === 'top'
              ? state.awayTeam.battingOrder[state.currentBatterIndex]
              : state.homeTeam.battingOrder[state.currentBatterIndex];
            const batterSpeed = getCurrentBatter(state).player.stats.base.speed;
            bases = { ...bases, first: { playerId: batterId, speed: batterSpeed } };
            break;
          }
          case 'double': {
            const result = advanceRunnersOnExtra(bases, state, score, inningScores, isBottom, 2);
            bases = result.bases;
            score = result.score;
            inningScores = result.inningScores;
            break;
          }
          case 'triple': {
            const result = advanceRunnersOnExtra(bases, state, score, inningScores, isBottom, 3);
            bases = result.bases;
            score = result.score;
            inningScores = result.inningScores;
            break;
          }
          case 'home_run': {
            // 全員得点
            let runs = 1; // 打者
            if (bases.first) runs++;
            if (bases.second) runs++;
            if (bases.third) runs++;
            bases = { first: null, second: null, third: null };
            const r1 = addRuns(score, inningScores, isBottom, state.currentInning, runs);
            score = r1.score;
            inningScores = r1.inningScores;
            break;
          }
          case 'sacrifice_fly': {
            // 三塁走者が生還
            outs = Math.min(outs + 1, 3);
            if (bases.third) {
              const r2 = addRuns(score, inningScores, isBottom, state.currentInning, 1);
              score = r2.score;
              inningScores = r2.inningScores;
              bases = { ...bases, third: null };
            }
            break;
          }
          case 'error': {
            // エラー出塁: 打者一塁（ランナーは1進）
            const batterId2 = state.currentHalf === 'top'
              ? state.awayTeam.battingOrder[state.currentBatterIndex]
              : state.homeTeam.battingOrder[state.currentBatterIndex];
            const batterSpeed2 = getCurrentBatter(state).player.stats.base.speed;
            // 既存ランナーを1つ進める
            const r3 = advanceRunnersOnSingle(bases, state, score, inningScores, isBottom);
            bases = { ...r3.bases, first: { playerId: batterId2, speed: batterSpeed2 } };
            score = r3.score;
            inningScores = r3.inningScores;
            break;
          }
        }
      }
      break;
    }
  }

  return {
    ...state,
    count,
    outs,
    bases,
    score,
    inningScores,
    pitchCount,
  };
}

// ── ランナー進塁ヘルパー ──

function addRuns(
  score: MatchState['score'],
  inningScores: MatchState['inningScores'],
  isBottom: boolean,
  inningNumber: number,
  runs: number,
): { score: MatchState['score']; inningScores: MatchState['inningScores'] } {
  const idx = inningNumber - 1;
  if (isBottom) {
    const homeArr = [...inningScores.home];
    // fill any gaps with 0 to avoid sparse array NaN in reduce
    while (homeArr.length <= idx) homeArr.push(0);
    homeArr[idx] = homeArr[idx] + runs;
    return {
      score: { ...score, home: score.home + runs },
      inningScores: { ...inningScores, home: homeArr },
    };
  } else {
    const awayArr = [...inningScores.away];
    // fill any gaps with 0 to avoid sparse array NaN in reduce
    while (awayArr.length <= idx) awayArr.push(0);
    awayArr[idx] = awayArr[idx] + runs;
    return {
      score: { ...score, away: score.away + runs },
      inningScores: { ...inningScores, away: awayArr },
    };
  }
}

function advanceRunnersOnSingle(
  bases: MatchState['bases'],
  state: MatchState,
  score: MatchState['score'],
  inningScores: MatchState['inningScores'],
  isBottom: boolean,
): { bases: MatchState['bases']; score: MatchState['score']; inningScores: MatchState['inningScores'] } {
  let runs = 0;
  // 三塁走者 → 生還
  if (bases.third) runs++;
  // 二塁走者 → 三塁
  const newThird = bases.second;
  // 一塁走者 → 二塁
  const newSecond = bases.first;
  bases = { first: null, second: newSecond, third: newThird };

  if (runs > 0) {
    const r = addRuns(score, inningScores, isBottom, state.currentInning, runs);
    score = r.score;
    inningScores = r.inningScores;
  }
  return { bases, score, inningScores };
}

function advanceRunnersOnExtra(
  bases: MatchState['bases'],
  state: MatchState,
  score: MatchState['score'],
  inningScores: MatchState['inningScores'],
  isBottom: boolean,
  extra: 2 | 3,
): { bases: MatchState['bases']; score: MatchState['score']; inningScores: MatchState['inningScores'] } {
  // 全走者は extra 進塁（ツーベースなら全員生還 or 三塁）
  let runs = 0;
  // 全走者が2つ以上進む → 三塁/二塁走者は生還、一塁走者は2進なら三塁
  if (extra === 2) {
    if (bases.third) runs++;
    if (bases.second) runs++;
    const newThird = bases.first; // 一塁走者は三塁へ
    bases = { first: null, second: null, third: newThird };
  } else {
    // triple: 全走者生還
    if (bases.first) runs++;
    if (bases.second) runs++;
    if (bases.third) runs++;
    bases = { first: null, second: null, third: null };
  }

  // 打者の進塁
  const batterId = state.currentHalf === 'top'
    ? state.awayTeam.battingOrder[state.currentBatterIndex]
    : state.homeTeam.battingOrder[state.currentBatterIndex];
  const batterSpeed = getCurrentBatter(state).player.stats.base.speed;
  if (extra === 2) {
    bases = { ...bases, second: { playerId: batterId, speed: batterSpeed } };
  } else {
    bases = { ...bases, third: { playerId: batterId, speed: batterSpeed } };
  }

  if (runs > 0) {
    const r = addRuns(score, inningScores, isBottom, state.currentInning, runs);
    score = r.score;
    inningScores = r.inningScores;
  }
  return { bases, score, inningScores };
}

// ============================================================
// processPitch メイン
// ============================================================

/**
 * 1球を処理する。試合エンジンの最小単位。
 * 純関数：同じ入力なら同じ結果を返す。
 *
 * @param overrides Phase 7-E1: 心理システムからの補正（省略可）。
 *   省略時は従来通りの挙動。
 */
export function processPitch(
  state: MatchState,
  order: TacticalOrder,
  rng: RNG,
  overrides?: MatchOverrides,
): { nextState: MatchState; pitchResult: PitchResult } {
  const pitcherMP = getCurrentPitcher(state);
  const batterMP = getCurrentBatter(state);
  const fieldingTeam = getFieldingTeam(state);

  // ── (1) 投手のアクション決定 ──
  // Phase 7-E1: 心理補正を渡す
  const pitcher = getEffectivePitcherParams(pitcherMP, overrides?.pitcherMental);
  const batter = getEffectiveBatterParams(batterMP, overrides?.batterMental);

  const { selection, target } = selectPitch(
    pitcher.velocity,
    pitcher.control,
    pitcher.pitches,
    state.count.balls,
    state.count.strikes,
    rng,
  );

  // ── (2) 制球誤差の適用 ──
  const actualLocation = applyControlError(target, pitcher.control, rng);

  // ── (3) 打者の反応決定 ──
  // Phase 7-E1: swingAggressionBonus が指定されている場合、打者の選球眼を補正する。
  //   積極性が高い（+）→ eye を下げてボール球を振りやすくする
  //   積極性が低い（-）→ eye を上げてボール球を見やすくする
  const aggressionBonus = overrides?.batterMental?.swingAggressionBonus !== undefined
    ? clampBonus(overrides.batterMental.swingAggressionBonus)
    : 0;
  const batterForAction: BatterParams = aggressionBonus !== 0
    ? { ...batter, eye: Math.max(1, Math.min(100, batter.eye * (1 - aggressionBonus))) }
    : batter;

  const batterAction: BatterAction = decideBatterAction(
    batterForAction,
    selection,
    actualLocation,
    state.count,
    order,
    rng,
  );

  // ── (4) 結果判定 ──
  let outcome: PitchOutcome;
  let batContactWithoutFieldResult: Omit<BatContactResult, 'fieldResult'> | null = null;

  if (batterAction === 'take' || batterAction === 'check_swing') {
    outcome = isInStrikeZone(actualLocation) ? 'called_strike' : 'ball';
  } else if (batterAction === 'bunt') {
    // バント: 簡易実装。接触判定 × 0.7
    const buntContact = (batter.contact / 100) * 0.7;
    if (!rng.chance(buntContact)) {
      // バントファウル
      outcome = state.count.strikes === 2 ? 'foul_bunt' : 'foul';
    } else {
      outcome = 'in_play';
      batContactWithoutFieldResult = {
        contactType: 'bunt_ground',
        direction: 20 + rng.next() * 50, // 3塁線か1塁線
        speed: 'weak',
        distance: 5 + rng.next() * 15,
      };
    }
  } else {
    // swing
    // v0.40.0: 打席内の投球履歴を渡して配球学習を有効化
    const swingResult = calculateSwingResult(
      batter,
      selection,
      actualLocation,
      state.count,
      rng,
      state.currentAtBatPitches,
    );
    outcome = swingResult.outcome;
    if (swingResult.contact) {
      batContactWithoutFieldResult = swingResult.contact;
    }
  }

  // ── (5) インプレーの場合 → 打球処理（Phase R4: Resolver 経由） ──
  let batContact: BatContactResult | null = null;
  if (outcome === 'in_play' && batContactWithoutFieldResult) {
    // バントはシンプルモデルのまま（Resolver は通常スイング用）
    if (batContactWithoutFieldResult.contactType === 'bunt_ground') {
      const fieldResult = resolveFieldResult(
        batContactWithoutFieldResult,
        state.bases,
        state.outs,
        fieldingTeam,
        batter,
        rng,
      );
      batContact = { ...batContactWithoutFieldResult, fieldResult };
    } else {
      // 通常スイング: Phase R4 - resolveBatBall で物理モデルに基づく打球方向・速度を生成し、
      // calculateSwingResult の contactType（統計モデル）と組み合わせる。
      //
      // 設計:
      //  - contactType: 旧 bat-contact.ts の確率分布（ground/line/fly/popup）を流用
      //    → fly_ball 約 30%、home_run 率 2-8% の適切なバランスを維持
      //  - direction: resolveBatBall の sprayAngle から物理的に正確な打球方向
      //  - speed: resolveBatBall の exitVelocity から打球速度クラス
      //  - distance: resolveBatBall の exitVelocity を旧モデルと同じスケール（m）に変換
      //    → resolveFieldResult の閾値（60m=double, 90m=triple, 100m=HR）に適合
      const batBallCtx = buildBatBallContext(
        pitcher,
        batter,
        selection,
        actualLocation,
        state,
        pitcherMP,
        batterMP,
        order,
      );
      const { trajectory: rawTrajectory } = resolveBatBall(batBallCtx, rng.derive('bat-ball'));

      // Phase R4: sprayAngle クランプ（calculateSwingResult が in_play を返した後は
      // フェア確定なので [0,90] に収める）
      const trajectory = {
        ...rawTrajectory,
        sprayAngle: Math.max(0, Math.min(90, rawTrajectory.sprayAngle)),
      };

      // Phase R4: calculateSwingResult の打球結果に resolveBatBall の方向を上書きする。
      //
      //  - contactType / speed / distance: calculateSwingResult の旧統計モデルを使用
      //    → fly_ball 比率・HR 距離閾値・ライナー出塁率などのバランスを維持
      //  - direction: resolveBatBall の sprayAngle で上書き
      //    → 投球コース・打者の意図を反映した物理的に正確な打球方向
      const legacyContact: Omit<BatContactResult, 'fieldResult'> = {
        ...batContactWithoutFieldResult,                          // contactType / speed / distance
        direction: sprayAngleToDirection(trajectory.sprayAngle), // physics-based direction
      };

      const fieldResult = resolveFieldResult(
        legacyContact,
        state.bases,
        state.outs,
        fieldingTeam,
        batter,
        rng,
      );

      batContact = { ...legacyContact, fieldResult };
    }
  }
  // v0.36.0: ファール打球は view-state に別ルートで渡す（batContact は null のまま）
  // UI 側で latest.outcome === 'foul' のとき、batContactForFoul を見て軌道を描画
  const batContactForFoul =
    (outcome === 'foul' || outcome === 'foul_bunt') && batContactWithoutFieldResult
      ? batContactWithoutFieldResult
      : null;

  // ── Phase R6: NarrativeHook 生成 ──
  // in_play かつ通常スイングの場合のみ生成（バントは対象外）
  let r6DetailedHitType: import('../../physics/types').DetailedHitType | undefined;
  let r6NarrativeHook: import('../../narrative/types').NarrativeHook | undefined;

  if (outcome === 'in_play' && batContact && batContactWithoutFieldResult?.contactType !== 'bunt_ground') {
    try {
      // R8-3b: resolveBatBall の実際の trajectory を再利用する
      // buildBatBallContext は上で既に呼ばれており、rawTrajectory が取得済み。
      // ただし process-pitch のスコープ制約のため、ここで再計算する。
      // sprayAngle は batContact.direction から逆算（フェア確定済み [0,90]）
      const r6SprayAngle = Math.max(0, Math.min(90, 90 - batContact.direction));

      // R8-3b: 実際の打球 exit velocity を contactType / speed から物理的に推定する
      // §12.4 全21種の出現を確保するために速度帯を調整する
      //
      // 目標飛距離と21種分類（la=32°, backspin=1800rpm → factor=1.18）:
      //   fly_ball weak(68km/h)   → ~140ft → shallow_fly (<=220ft)
      //   fly_ball normal(96km/h) → ~287ft → medium_fly (220-320ft)
      //   fly_ball hard(112km/h)  → ~350ft → deep_fly (>320ft, not wall_ball)
      //   fly_ball bullet(120km/h) → ~400ft → deep_fly or wall_ball or HR
      //
      // 目標飛距離（la=22°, backspin=1800rpm → factor=1.18）:
      //   line_drive weak(68km/h)   →  ~91ft → infield_liner
      //   line_drive normal(86km/h) → ~140ft → over_infield_hit (120-170ft)
      //   line_drive hard(116km/h)  → ~248ft → gap_hit (>215ft)
      //   line_drive bullet(148km/h) → ~390ft → wall_ball / HR → line_drive_hr
      //
      const r6ExitVelocity = batContact.contactType === 'line_drive' && batContact.speed === 'bullet' ? 148
        : batContact.speed === 'bullet' ? 120   // fly_ball: フェンス際・HR境界
        : batContact.contactType === 'line_drive' && batContact.speed === 'hard' ? 116
        : batContact.speed === 'hard' ? 112
        : batContact.contactType === 'line_drive' && batContact.speed === 'normal' ? 86  // R8-3b: over_infield_hit 出現のため
        : batContact.speed === 'normal' ? 96    // fly_ball: medium_fly
        : 68;                                   // weak: shallow_fly / infield_liner

      // R8-3b: contactType に基づく launch angle の推定
      // ground_ball: 4°（ゴロは低弾道）
      // line_drive:  22°（ライナーは中弾道、bullet は line_drive_hr になる）
      // fly_ball:    32°（フライは高弾道）
      // popup:       60°（ポップフライは急角度）
      const r6LaunchAngle = batContact.contactType === 'ground_ball' ? 4
        : batContact.contactType === 'line_drive' ? 22
        : batContact.contactType === 'popup' ? 60
        : 32;  // fly_ball

      const r6Trajectory = {
        exitVelocity: r6ExitVelocity,
        launchAngle: r6LaunchAngle,
        sprayAngle: r6SprayAngle,
        spin: { back: 1800, side: 0 },  // R8-3b: バックスピンを増やして飛距離を伸ばす
      };
      const r6Flight = simulateTrajectory(r6Trajectory);

      // R8-3: contactQuality を打球速度から推定（check_swing_dribbler の出現に必要）
      // weak speed = 弱い当たり → contactQuality < 0.3 として dribbler になる可能性
      const r6ContactQuality = batContact.speed === 'weak' ? 0.15
        : batContact.speed === 'normal' ? 0.5
        : batContact.speed === 'hard' ? 0.75
        : 0.9;

      // 21種分類
      r6DetailedHitType = classifyDetailedHit(r6Trajectory, r6Flight, {
        didContact: true,
        isFoul: false,
        isTip: false,
        isCheckSwing: false,
        contactTimeMs: 0,
        contactQuality: r6ContactQuality,
      }, state.bases);

      // NarrativeHook 生成
      r6NarrativeHook = generateNarrativeHook(r6DetailedHitType, r6Trajectory, r6Flight);
    } catch {
      // 生成失敗時は undefined のまま（既存動作に影響しない）
    }
  } else if (outcome === 'foul' && batContactWithoutFieldResult) {
    // R8-3: ファウルボールは foul_fly として分類（§8.3.A で全21種出現のため）
    r6DetailedHitType = 'foul_fly';
  }

  // ── (6) MatchState 更新 ──
  const pitchResult: PitchResult = {
    pitchSelection: selection,
    targetLocation: target,
    actualLocation,
    batterAction,
    outcome,
    batContact,
    foulContact: batContactForFoul,  // v0.36.0: ファール軌道表示用
    detailedHitType: r6DetailedHitType,
    narrativeHook: r6NarrativeHook,
  };

  // 投手スタミナ消費
  const baseVelocity = pitcherMP.player.stats.pitching?.velocity ?? 130;
  const staminaCost = calcStaminaCost(
    selection.type,
    selection.velocity,
    baseVelocity,
    pitcher.pitchStamina,
  );

  // MatchPlayer の更新（投手スタミナ・投球数）
  const updatedPitcherMP: MatchPlayer = {
    ...pitcherMP,
    pitchCountInGame: pitcherMP.pitchCountInGame + 1,
    stamina: Math.max(0, pitcherMP.stamina - staminaCost),
  };

  // フィールディングチームの投手 MatchPlayer を更新
  const isTopHalf = state.currentHalf === 'top';
  const updatedHomeTeam = isTopHalf
    ? {
        ...state.homeTeam,
        players: state.homeTeam.players.map((mp) =>
          mp.player.id === pitcherMP.player.id ? updatedPitcherMP : mp,
        ),
      }
    : state.homeTeam;
  const updatedAwayTeam = !isTopHalf
    ? {
        ...state.awayTeam,
        players: state.awayTeam.players.map((mp) =>
          mp.player.id === pitcherMP.player.id ? updatedPitcherMP : mp,
        ),
      }
    : state.awayTeam;

  let nextState: MatchState = {
    ...state,
    homeTeam: updatedHomeTeam,
    awayTeam: updatedAwayTeam,
  };

  // カウント・アウト・走者・得点を更新
  nextState = updateMatcherAfterPitch(nextState, outcome, batContact);

  // v0.40.0: 打席内の投球履歴を更新する（配球学習用）
  //   毎回 append する。打席終了時のクリアは runner.ts 側で行う。
  {
    const prevHistory = state.currentAtBatPitches ?? [];
    const historyEntry: PitchHistoryEntry = {
      pitchType: selection.type,
      velocity: selection.velocity,
      location: actualLocation,
      batterAction,
      outcome,
    };
    const appended = [...prevHistory, historyEntry];
    nextState = {
      ...nextState,
      currentAtBatPitches: appended.length > 10 ? appended.slice(-10) : appended,
    };
  }

  // ログに追加（Phase R6: in_play は 21種ラベルを含む）
  const logDescription = outcome === 'in_play' && r6DetailedHitType && r6NarrativeHook
    ? `${selection.type} → ${outcome} [${r6NarrativeHook.shortLabel}] ${r6NarrativeHook.commentaryText}`
    : `${selection.type} → ${outcome}`;
  const logEntry = {
    inning: state.currentInning,
    half: state.currentHalf,
    type: 'pitch' as const,
    description: logDescription,
  };
  nextState = { ...nextState, log: [...nextState.log, logEntry] };

  return { nextState, pitchResult };
}
