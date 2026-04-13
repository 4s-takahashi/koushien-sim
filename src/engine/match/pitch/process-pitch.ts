import type { RNG } from '../../core/rng';
import type {
  BatContactResult,
  BatterParams,
  BatterAction,
  MatchPlayer,
  MatchState,
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
import { resolveFieldResult } from './field-result';
import { MATCH_CONSTANTS } from '../constants';

// ============================================================
// 実効パラメータ算出
// ============================================================

/**
 * 投手の実効パラメータを算出する（疲労・コンディション補正込み）
 */
export function getEffectivePitcherParams(mp: MatchPlayer): PitcherParams {
  const p = mp.player;
  const ps = p.stats.pitching!;

  const fatigueRatio = mp.stamina / 100; // 1.0 = 元気、0.0 = 限界
  const moodMult = getMoodMultiplier(p.condition.mood);
  const confMult = getConfidenceMultiplier(mp.confidence);

  return {
    velocity: ps.velocity * (0.85 + 0.15 * fatigueRatio) * moodMult,
    control: ps.control * fatigueRatio * moodMult * confMult,
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
 */
export function getEffectiveBatterParams(mp: MatchPlayer): BatterParams {
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

  return {
    contact: p.stats.batting.contact * contactMult,
    power: p.stats.batting.power * powerMult,
    eye: p.stats.batting.eye * moodMult,
    technique: p.stats.batting.technique * moodMult,
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
    homeArr[idx] = (homeArr[idx] ?? 0) + runs;
    return {
      score: { ...score, home: score.home + runs },
      inningScores: { ...inningScores, home: homeArr },
    };
  } else {
    const awayArr = [...inningScores.away];
    awayArr[idx] = (awayArr[idx] ?? 0) + runs;
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
 */
export function processPitch(
  state: MatchState,
  order: TacticalOrder,
  rng: RNG,
): { nextState: MatchState; pitchResult: PitchResult } {
  const pitcherMP = getCurrentPitcher(state);
  const batterMP = getCurrentBatter(state);
  const fieldingTeam = getFieldingTeam(state);

  // ── (1) 投手のアクション決定 ──
  const pitcher = getEffectivePitcherParams(pitcherMP);
  const batter = getEffectiveBatterParams(batterMP);

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
  const batterAction: BatterAction = decideBatterAction(
    batter,
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
    const swingResult = calculateSwingResult(batter, selection, actualLocation, state.count, rng);
    outcome = swingResult.outcome;
    if (swingResult.contact) {
      batContactWithoutFieldResult = swingResult.contact;
    }
  }

  // ── (5) インプレーの場合 → 打球処理 ──
  let batContact: BatContactResult | null = null;
  if (outcome === 'in_play' && batContactWithoutFieldResult) {
    const fieldResult = resolveFieldResult(
      batContactWithoutFieldResult,
      state.bases,
      state.outs,
      fieldingTeam,
      batter,
      rng,
    );
    batContact = { ...batContactWithoutFieldResult, fieldResult };
  }

  // ── (6) MatchState 更新 ──
  const pitchResult: PitchResult = {
    pitchSelection: selection,
    targetLocation: target,
    actualLocation,
    batterAction,
    outcome,
    batContact,
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

  // ログに追加
  const logEntry = {
    inning: state.currentInning,
    half: state.currentHalf,
    type: 'pitch' as const,
    description: `${selection.type} → ${outcome}`,
  };
  nextState = { ...nextState, log: [...nextState.log, logEntry] };

  return { nextState, pitchResult };
}
