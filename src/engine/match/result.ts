import type { RNG } from '../core/rng';
import type { Player, CareerRecord, PlayerStats } from '../types/player';
import type {
  MatchState,
  MatchTeam,
  MatchPlayer,
  MatchResult,
  MatchBatterStat,
  MatchPitcherStat,
  AtBatResult,
  AtBatOutcome,
  InningResult,
} from './types';
import { MATCH_CONSTANTS } from './constants';
import { applyMatchMotivation } from '../growth/motivation';

// ============================================================
// 打者成績の集計
// ============================================================

/**
 * 試合の全打席結果から打者個人成績を集計する。
 * AtBatResult[] → MatchBatterStat[]
 */
export function collectBatterStats(
  atBatResults: AtBatResult[],
  allPlayerIds: string[],
): MatchBatterStat[] {
  const statsMap = new Map<string, MatchBatterStat>();

  // 全選手を初期化
  for (const pid of allPlayerIds) {
    statsMap.set(pid, {
      playerId: pid,
      atBats: 0,
      hits: 0,
      doubles: 0,
      triples: 0,
      homeRuns: 0,
      rbis: 0,
      walks: 0,
      strikeouts: 0,
      stolenBases: 0,
      errors: 0,
    });
  }

  for (const ab of atBatResults) {
    const stat = statsMap.get(ab.batterId);
    if (!stat) continue;

    const outcome = ab.outcome;

    // 四球・死球・犠打は打数にカウントしない
    const isAtBat = !isNonAtBat(outcome);
    if (isAtBat) {
      stat.atBats++;
    }

    stat.rbis += ab.rbiCount;

    switch (outcome.type) {
      case 'single':
        stat.hits++;
        break;
      case 'double':
        stat.hits++;
        stat.doubles++;
        break;
      case 'triple':
        stat.hits++;
        stat.triples++;
        break;
      case 'home_run':
        stat.hits++;
        stat.homeRuns++;
        break;
      case 'walk':
      case 'hit_by_pitch':
      case 'intentional_walk':
        stat.walks++;
        break;
      case 'strikeout':
        stat.strikeouts++;
        break;
      case 'error':
        stat.errors++;
        break;
      // out系: 打数には含まれるがhitにはならない
      case 'ground_out':
      case 'fly_out':
      case 'line_out':
      case 'double_play':
        break;
      case 'sacrifice_bunt':
      case 'sacrifice_fly':
        // 犠打・犠飛: 打数にカウントしない（isNonAtBatで除外済み）
        break;
    }
  }

  return Array.from(statsMap.values()).filter(
    (s) => s.atBats > 0 || s.walks > 0 || s.rbis > 0,
  );
}

function isNonAtBat(outcome: AtBatOutcome): boolean {
  return (
    outcome.type === 'walk' ||
    outcome.type === 'hit_by_pitch' ||
    outcome.type === 'intentional_walk' ||
    outcome.type === 'sacrifice_bunt' ||
    outcome.type === 'sacrifice_fly'
  );
}

// ============================================================
// 投手成績の集計
// ============================================================

/**
 * 試合の全打席結果から投手個人成績を集計する。
 */
export function collectPitcherStats(
  atBatResults: AtBatResult[],
  allPitcherIds: string[],
  winner: 'home' | 'away' | 'draw',
  homePitcherIds: string[],
  awayPitcherIds: string[],
): MatchPitcherStat[] {
  const statsMap = new Map<string, MatchPitcherStat>();

  for (const pid of allPitcherIds) {
    statsMap.set(pid, {
      playerId: pid,
      inningsPitched: 0,
      pitchCount: 0,
      hits: 0,
      runs: 0,
      earnedRuns: 0,
      walks: 0,
      strikeouts: 0,
      homeRunsAllowed: 0,
      isWinner: false,
      isLoser: false,
      isSave: false,
    });
  }

  for (const ab of atBatResults) {
    const stat = statsMap.get(ab.pitcherId);
    if (!stat) continue;

    stat.pitchCount += ab.pitches.length;

    const outcome = ab.outcome;
    switch (outcome.type) {
      case 'single':
      case 'double':
      case 'triple':
      case 'home_run':
        stat.hits++;
        if (outcome.type === 'home_run') stat.homeRunsAllowed++;
        break;
      case 'walk':
      case 'hit_by_pitch':
      case 'intentional_walk':
        stat.walks++;
        break;
      case 'strikeout':
        stat.strikeouts++;
        break;
    }

    // RBI = 投手側の失点
    stat.runs += ab.rbiCount;
    stat.earnedRuns += ab.rbiCount; // 簡易版: 自責=得点
  }

  // アウト数から投球回を概算（打席数ベース）
  for (const stat of statsMap.values()) {
    const totalOuts = atBatResults.filter(
      (ab) => ab.pitcherId === stat.playerId && isOutcome(ab.outcome),
    ).length;
    // 投球回 = アウト数 / 3（小数点以下は残りアウト表記だが、ここでは簡易的に）
    stat.inningsPitched = Math.floor(totalOuts / 3) + (totalOuts % 3) / 10;
  }

  // 勝敗の割り当て（簡易版: 最初の投手に勝敗）
  if (winner !== 'draw') {
    const winningPitcherIds = winner === 'home' ? homePitcherIds : awayPitcherIds;
    const losingPitcherIds = winner === 'home' ? awayPitcherIds : homePitcherIds;

    if (winningPitcherIds.length > 0) {
      const wp = statsMap.get(winningPitcherIds[0]);
      if (wp) wp.isWinner = true;
    }
    if (losingPitcherIds.length > 0) {
      const lp = statsMap.get(losingPitcherIds[0]);
      if (lp) lp.isLoser = true;
    }
  }

  return Array.from(statsMap.values()).filter(
    (s) => s.pitchCount > 0 || s.inningsPitched > 0,
  );
}

function isOutcome(outcome: AtBatOutcome): boolean {
  return (
    outcome.type === 'strikeout' ||
    outcome.type === 'ground_out' ||
    outcome.type === 'fly_out' ||
    outcome.type === 'line_out' ||
    outcome.type === 'double_play' ||
    outcome.type === 'sacrifice_bunt' ||
    outcome.type === 'sacrifice_fly'
  );
}

// ============================================================
// CareerRecord への反映
// ============================================================

/**
 * 試合の打者成績を CareerRecord に加算する。
 */
export function applyBatterStatToCareer(
  career: CareerRecord,
  stat: MatchBatterStat,
): CareerRecord {
  return {
    ...career,
    gamesPlayed: career.gamesPlayed + 1,
    atBats: career.atBats + stat.atBats,
    hits: career.hits + stat.hits,
    homeRuns: career.homeRuns + stat.homeRuns,
    rbis: career.rbis + stat.rbis,
    stolenBases: career.stolenBases + stat.stolenBases,
  };
}

/**
 * 試合の投手成績を CareerRecord に加算する。
 */
export function applyPitcherStatToCareer(
  career: CareerRecord,
  stat: MatchPitcherStat,
): CareerRecord {
  return {
    ...career,
    gamesPlayed: career.gamesPlayed + 1,
    gamesStarted: career.gamesStarted + 1,
    inningsPitched: career.inningsPitched + stat.inningsPitched,
    wins: career.wins + (stat.isWinner ? 1 : 0),
    losses: career.losses + (stat.isLoser ? 1 : 0),
    strikeouts: career.strikeouts + stat.strikeouts,
    earnedRuns: career.earnedRuns + stat.earnedRuns,
  };
}

/** シーズン集計用の空レコード */
function emptySeasonRecord(): import('../types/player').SeasonRecord {
  return {
    gamesPlayed: 0, atBats: 0, hits: 0, homeRuns: 0, rbis: 0, stolenBases: 0,
    inningsPitched: 0, wins: 0, losses: 0, strikeouts: 0, earnedRuns: 0,
  };
}

/** 学年を算出 (1/2/3 / 範囲外は null) */
function computeGrade(enrollmentYear: number, currentYear: number): 1 | 2 | 3 | null {
  const grade = currentYear - enrollmentYear + 1;
  if (grade === 1 || grade === 2 || grade === 3) return grade;
  return null;
}

/**
 * 試合結果を全選手の CareerRecord に反映する。
 * currentYear を渡すと bySeason にも加算される (Issue #6 2026-04-19)。
 */
export function applyMatchToPlayers(
  players: Player[],
  batterStats: MatchBatterStat[],
  pitcherStats: MatchPitcherStat[],
  currentYear?: number,
): Player[] {
  const batterMap = new Map(batterStats.map((s) => [s.playerId, s]));
  const pitcherMap = new Map(pitcherStats.map((s) => [s.playerId, s]));

  const careerUpdated = players.map((player) => {
    let career = { ...player.careerStats };

    const bs = batterMap.get(player.id);
    if (bs) {
      career = applyBatterStatToCareer(career, bs);
    }

    const ps = pitcherMap.get(player.id);
    if (ps) {
      career = applyPitcherStatToCareer(career, ps);
    }

    // 重複カウント防止: 投手が打者としても出場した場合、gamesPlayedを-1
    if (bs && ps) {
      career = { ...career, gamesPlayed: career.gamesPlayed - 1 };
    }

    // シーズン別集計 (2026-04-19 Issue #6)
    if (currentYear !== undefined && (bs || ps)) {
      const grade = computeGrade(player.enrollmentYear, currentYear);
      if (grade !== null) {
        const bySeason = {
          1: career.bySeason?.[1] ?? emptySeasonRecord(),
          2: career.bySeason?.[2] ?? emptySeasonRecord(),
          3: career.bySeason?.[3] ?? emptySeasonRecord(),
        };
        const season = { ...bySeason[grade] };
        let gameCounted = false;
        if (bs) {
          season.gamesPlayed += 1;
          season.atBats += bs.atBats;
          season.hits += bs.hits;
          season.homeRuns += bs.homeRuns;
          season.rbis += bs.rbis;
          season.stolenBases += bs.stolenBases;
          gameCounted = true;
        }
        if (ps) {
          if (!gameCounted) season.gamesPlayed += 1;
          season.inningsPitched += ps.inningsPitched;
          season.wins += ps.isWinner ? 1 : 0;
          season.losses += ps.isLoser ? 1 : 0;
          season.strikeouts += ps.strikeouts;
          season.earnedRuns += ps.earnedRuns;
        }
        bySeason[grade] = season;
        career = { ...career, bySeason };
      }
    }

    return { ...player, careerStats: career };
  });

  // 試合出場者にモチベーションボーナスを加算 (Phase 11-A3 2026-04-19)
  return applyMatchMotivation(careerUpdated, batterStats, pitcherStats);
}

// ============================================================
// 試合後成長
// ============================================================

/**
 * 試合経験による成長を適用する。
 * 活躍した選手はボーナス成長。甲子園ボーナスあり。
 */
export function applyPostMatchGrowth(
  player: Player,
  batterStat: MatchBatterStat | undefined,
  pitcherStat: MatchPitcherStat | undefined,
  isKoshien: boolean,
  rng: RNG,
): Player {
  let stats = { ...player.stats };

  // 基本経験値（試合出場）
  const baseExp = isKoshien ? 3 : 1;
  const koshienMultiplier = isKoshien ? 1.5 : 1.0;

  // 打者成長
  if (batterStat && batterStat.atBats > 0) {
    const battingGrowth = calculateBattingGrowth(batterStat, baseExp, koshienMultiplier, rng);
    if (stats.batting) {
      stats = {
        ...stats,
        batting: {
          ...stats.batting,
          contact: clamp(stats.batting.contact + battingGrowth.contact, 1, 100),
          power: clamp(stats.batting.power + battingGrowth.power, 1, 100),
          eye: clamp(stats.batting.eye + battingGrowth.eye, 1, 100),
          technique: clamp(stats.batting.technique + battingGrowth.technique, 1, 100),
        },
      };
    }
  }

  // 投手成長
  if (pitcherStat && pitcherStat.pitchCount > 0) {
    const pitchingGrowth = calculatePitchingGrowth(pitcherStat, baseExp, koshienMultiplier, rng);
    if (stats.pitching) {
      stats = {
        ...stats,
        pitching: {
          ...stats.pitching,
          control: clamp(stats.pitching.control + pitchingGrowth.control, 1, 100),
          pitchStamina: clamp(stats.pitching.pitchStamina + pitchingGrowth.pitchStamina, 1, 100),
          velocity: clamp(stats.pitching.velocity + pitchingGrowth.velocity, 80, 160),
        },
      };
    }
  }

  // メンタル成長（試合経験）
  stats = {
    ...stats,
    base: {
      ...stats.base,
      mental: clamp(stats.base.mental + baseExp * (rng.chance(0.3) ? 1 : 0), 1, 100),
      focus: clamp(stats.base.focus + baseExp * (rng.chance(0.2) ? 1 : 0), 1, 100),
    },
  };

  return { ...player, stats };
}

function calculateBattingGrowth(
  stat: MatchBatterStat,
  baseExp: number,
  koshienMultiplier: number,
  rng: RNG,
): { contact: number; power: number; eye: number; technique: number } {
  const hitRate = stat.atBats > 0 ? stat.hits / stat.atBats : 0;
  const performanceBonus = hitRate > 0.3 ? 1 : 0;

  return {
    contact: Math.round((baseExp + performanceBonus + (stat.hits > 2 ? 1 : 0)) * koshienMultiplier * (rng.chance(0.5) ? 1 : 0)),
    power: Math.round((baseExp + (stat.homeRuns > 0 ? 2 : 0)) * koshienMultiplier * (rng.chance(0.3) ? 1 : 0)),
    eye: Math.round((baseExp + (stat.walks > 1 ? 1 : 0)) * koshienMultiplier * (rng.chance(0.4) ? 1 : 0)),
    technique: Math.round((baseExp + performanceBonus) * koshienMultiplier * (rng.chance(0.3) ? 1 : 0)),
  };
}

function calculatePitchingGrowth(
  stat: MatchPitcherStat,
  baseExp: number,
  koshienMultiplier: number,
  rng: RNG,
): { control: number; pitchStamina: number; velocity: number } {
  const dominanceBonus = stat.strikeouts > 5 ? 1 : 0;

  return {
    control: Math.round((baseExp + dominanceBonus) * koshienMultiplier * (rng.chance(0.4) ? 1 : 0)),
    pitchStamina: Math.round((baseExp + (stat.inningsPitched > 6 ? 1 : 0)) * koshienMultiplier * (rng.chance(0.3) ? 1 : 0)),
    velocity: Math.round(baseExp * koshienMultiplier * (rng.chance(0.15) ? 1 : 0)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ============================================================
// MVP選出
// ============================================================

/**
 * 試合MVPを選出する。
 * 得点貢献度（打者: OPS的指標、投手: QS的指標）で判定。
 */
export function selectMVP(
  batterStats: MatchBatterStat[],
  pitcherStats: MatchPitcherStat[],
  winner: 'home' | 'away' | 'draw',
  homeBatterIds: string[],
  awayBatterIds: string[],
): string | null {
  if (winner === 'draw') return null;

  // 勝者チームの選手のみ対象
  const winnerBatterIds = new Set(winner === 'home' ? homeBatterIds : awayBatterIds);

  let bestScore = -1;
  let mvpId: string | null = null;

  // 打者スコア: hits*2 + homeRuns*4 + rbis*3 + walks
  for (const stat of batterStats) {
    if (!winnerBatterIds.has(stat.playerId)) continue;
    const score =
      stat.hits * 2 +
      stat.homeRuns * 4 +
      stat.rbis * 3 +
      stat.walks * 1 -
      stat.strikeouts * 0.5;
    if (score > bestScore) {
      bestScore = score;
      mvpId = stat.playerId;
    }
  }

  // 投手スコア: strikeouts*2 + inningsPitched*3 - runs*2 - walks
  for (const stat of pitcherStats) {
    if (stat.playerId === mvpId) continue; // 既に打者で選出済みの場合
    // 勝利投手はMVP候補
    if (!stat.isWinner) continue;
    const score =
      stat.strikeouts * 2 +
      stat.inningsPitched * 3 -
      stat.runs * 2 -
      stat.walks;
    if (score > bestScore) {
      bestScore = score;
      mvpId = stat.playerId;
    }
  }

  return mvpId;
}
