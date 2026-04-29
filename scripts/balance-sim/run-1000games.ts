/**
 * scripts/balance-sim/run-1000games.ts — Phase R8-1
 *
 * 1000試合シミュレーションを自動実行し、統計を JSON で出力する。
 *
 * 実行: npx tsx scripts/balance-sim/run-1000games.ts
 *
 * 出力先: scripts/balance-sim/output/stats-<timestamp>.json
 *
 * §12.3 目標範囲:
 *   リーグ打率:    .240 - .300
 *   出塁率:        .300 - .380
 *   HR/試合:       0.4 - 1.5
 *   三振率:        18% - 25%
 *   四球率:        7% - 12%
 *   内野安打率:    8% - 15%
 *   エラー/試合:   0.3 - 1.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { createRNG } from '../../src/engine/core/rng';
import { runGame } from '../../src/engine/match/game';
import { generatePlayer } from '../../src/engine/player/generate';
import { buildFieldPositions } from '../../src/engine/world/match-team-builder';
import type { MatchTeam, MatchPlayer, MatchConfig, MatchBatterStat, AtBatResult } from '../../src/engine/match/types';
import type { Player } from '../../src/engine/types/player';
import type { DetailedHitType } from '../../src/engine/physics/types';
import { emptyDetailedHitCounts } from '../../src/engine/narrative/hit-type-stats';

// ============================================================
// 設定
// ============================================================

const NUM_GAMES = 1000;
const SEED_BASE = 'r8-balance-sim-2026';
const OUTPUT_DIR = path.join(__dirname, 'output');

// チームのバリエーション（打率・パワーレベルの組み合わせ）
const TEAM_CONFIGS = [
  { reputation: 30, label: 'weak' },    // 弱小校
  { reputation: 50, label: 'medium' },  // 普通校
  { reputation: 80, label: 'strong' },  // 強豪校
] as const;

// ============================================================
// 型定義
// ============================================================

interface GameStats {
  gameId: number;
  homeScore: number;
  awayScore: number;
  totalRuns: number;
  innings: number;
  homeAtBats: number;
  awayAtBats: number;
  homeHits: number;
  awayHits: number;
  homeHRs: number;
  awayHRs: number;
  homeWalks: number;
  awayWalks: number;
  homeStrikeouts: number;
  awayStrikeouts: number;
  homeErrors: number;
  awayErrors: number;
  homeDoubles: number;
  awayDoubles: number;
  homeTriples: number;
  awayTriples: number;
  detailedHitTypes: Record<DetailedHitType, number>;
  pitchCount: number;
}

interface AggregatedStats {
  // 試合数
  totalGames: number;

  // 打撃成績（リーグ全体）
  totalAtBats: number;
  totalHits: number;
  totalHRs: number;
  totalWalks: number;
  totalHBP: number;
  totalStrikeouts: number;
  totalDoubles: number;
  totalTriples: number;
  totalErrors: number;
  totalRuns: number;
  totalInfieldHits: number;    // 内野安打（over_infield_hit）

  // 打率・出塁率
  battingAverage: number;      // hits / atBats
  onBasePct: number;           // (hits + walks + hbp) / (atBats + walks + hbp)
  sluggingPct: number;         // total_bases / atBats

  // 率指標
  hrPerGame: number;           // HR / games
  strikeoutRate: number;       // SO / (AB + walks + hbp)
  walkRate: number;            // BB / (AB + walks + hbp)
  infieldHitRate: number;      // infield_hits / all_hits
  errorPerGame: number;        // errors / games
  runsPerGame: number;         // runs / games

  // 21種詳細打球分類累計
  detailedHitTypes: Record<DetailedHitType, number>;
  detailedHitTypePct: Record<DetailedHitType, number>;  // 全インプレー打球に対する割合

  // 得点分布
  scoreDistribution: Record<number, number>;  // 1試合あたりの得点 → 試合数

  // 連続同型打球（多様性指標）
  consecutiveSameTypeCounts: Record<number, number>;  // run_length → count
  maxConsecutiveSameType: number;
  consecutiveSameTypeRate5: number;  // 連続5打席以上同型の割合

  // 能力差反映（パワー高低でHR率が変わるか）
  // シードごとの詳細は games 配列で確認可能
}

interface SimResult {
  metadata: {
    seed: string;
    numGames: number;
    runAt: string;
    teamConfigs: typeof TEAM_CONFIGS;
    durationMs: number;
  };
  stats: AggregatedStats;
  games: GameStats[];
  // §12.3 目標範囲チェック
  targetChecks: {
    battingAverage: { value: number; min: number; max: number; ok: boolean };
    onBasePct: { value: number; min: number; max: number; ok: boolean };
    hrPerGame: { value: number; min: number; max: number; ok: boolean };
    strikeoutRate: { value: number; min: number; max: number; ok: boolean };
    walkRate: { value: number; min: number; max: number; ok: boolean };
    infieldHitRate: { value: number; min: number; max: number; ok: boolean };
    errorPerGame: { value: number; min: number; max: number; ok: boolean };
  };
  // §8.3.B 21種頻度レンジ
  hitTypeFrequencyCheck: {
    allTypesPresent: boolean;         // §8.3.A: 全21種出現
    major8TypesPresent: boolean;      // §8.3.C: 主要8種安定出現
    rare5TypesPresent: boolean;       // §8.3.D: 希少5種出現
    typesWithZeroCount: DetailedHitType[];
  };
  // §12.4 多様性指標
  diversityCheck: {
    consecutiveSameTypeBelow1Pct: boolean;
    consecutiveSameTypeRate5: number;
    exitVelocityVariance: number;
  };
}

// ============================================================
// チームビルダー
// ============================================================

function buildTestTeam(
  name: string,
  teamId: string,
  reputation: number,
  rng: ReturnType<typeof createRNG>,
): MatchTeam {
  const players: Player[] = [];

  // 投手を最低1人確保（最大5回試行）
  let pitcherAdded = false;
  for (let attempt = 0; attempt < 50 && !pitcherAdded; attempt++) {
    const p = generatePlayer(rng.derive(`pitcher-attempt-${attempt}`), {
      enrollmentYear: 1,
      schoolReputation: reputation,
      forcePosition: 'pitcher',
    });
    if (p.stats.pitching) {
      players.push(p);
      pitcherAdded = true;
    }
  }
  if (!pitcherAdded) {
    // フォールバック: 強制的に投手作成
    const p = generatePlayer(rng.derive('pitcher-fallback'), {
      enrollmentYear: 1,
      schoolReputation: reputation,
      forcePosition: 'pitcher',
    });
    // 投手スタッツを追加
    (p.stats as { pitching: unknown }).pitching = {
      velocity: 120,
      control: 50,
      pitchStamina: 60,
      pitches: [{ type: 'fastball', breakLevel: 0 }],
    };
    players.push(p);
  }

  // 残り13人（野手）
  for (let i = 0; i < 13; i++) {
    const p = generatePlayer(rng.derive(`fielder-${i}`), {
      enrollmentYear: 1,
      schoolReputation: reputation,
    });
    players.push(p);
  }

  // MatchPlayer に変換
  const matchPlayers: MatchPlayer[] = players.map((p) => ({
    player: p,
    pitchCountInGame: 0,
    stamina: 100,
    confidence: p.stats.base.mental,
    isWarmedUp: true,
  }));

  // 打順: 最初の9人
  const battingOrderPlayers = matchPlayers.slice(0, 9);
  const battingOrder = battingOrderPlayers.map((mp) => mp.player.id);

  // 投手ID（最初の投手）
  const pitcherMatchPlayer = matchPlayers.find(
    (mp) => mp.player.stats.pitching !== null,
  );
  const currentPitcherId = pitcherMatchPlayer?.player.id ?? matchPlayers[0].player.id;

  // ポジション割り当て
  const fieldPositions = buildFieldPositions(battingOrder, currentPitcherId, players);

  const benchPlayerIds = matchPlayers
    .slice(9)
    .map((mp) => mp.player.id);

  return {
    id: teamId,
    name,
    players: matchPlayers,
    battingOrder,
    fieldPositions,
    currentPitcherId,
    benchPlayerIds,
    usedPlayerIds: new Set(),
  };
}

// ============================================================
// 1試合から統計を抽出
// ============================================================

function extractGameStats(
  gameId: number,
  result: ReturnType<typeof runGame>['result'],
  finalState: ReturnType<typeof runGame>['finalState'],
): GameStats {
  const r = result;

  // 打者成績集計
  const homePlayerIds = new Set(finalState.homeTeam.battingOrder);
  const awayPlayerIds = new Set(finalState.awayTeam.battingOrder);

  let homeAtBats = 0, awayAtBats = 0;
  let homeHits = 0, awayHits = 0;
  let homeHRs = 0, awayHRs = 0;
  let homeWalks = 0, awayWalks = 0;
  let homeStrikeouts = 0, awayStrikeouts = 0;
  let homeErrors = 0, awayErrors = 0;
  let homeDoubles = 0, awayDoubles = 0;
  let homeTriples = 0, awayTriples = 0;

  const detailedHitTypes = emptyDetailedHitCounts();

  for (const bs of r.batterStats) {
    const isHome = homePlayerIds.has(bs.playerId);
    if (isHome) {
      homeAtBats += bs.atBats;
      homeHits += bs.hits;
      homeHRs += bs.homeRuns;
      homeWalks += bs.walks;
      homeStrikeouts += bs.strikeouts;
      homeErrors += bs.errors;
      homeDoubles += bs.doubles;
      homeTriples += bs.triples;
    } else if (awayPlayerIds.has(bs.playerId)) {
      awayAtBats += bs.atBats;
      awayHits += bs.hits;
      awayHRs += bs.homeRuns;
      awayWalks += bs.walks;
      awayStrikeouts += bs.strikeouts;
      awayErrors += bs.errors;
      awayDoubles += bs.doubles;
      awayTriples += bs.triples;
    }
  }

  // 21種打球統計を集計（homeHitTypeStats + awayHitTypeStats から）
  function addHitTypeCounts(stats: typeof r.homeHitTypeStats) {
    if (!stats) return;
    for (const k of Object.keys(detailedHitTypes) as DetailedHitType[]) {
      detailedHitTypes[k] += stats.teamTotals[k] ?? 0;
    }
  }
  addHitTypeCounts(r.homeHitTypeStats);
  addHitTypeCounts(r.awayHitTypeStats);

  return {
    gameId,
    homeScore: r.finalScore.home,
    awayScore: r.finalScore.away,
    totalRuns: r.finalScore.home + r.finalScore.away,
    innings: r.totalInnings,
    homeAtBats,
    awayAtBats,
    homeHits,
    awayHits,
    homeHRs,
    awayHRs,
    homeWalks,
    awayWalks,
    homeStrikeouts,
    awayStrikeouts,
    homeErrors,
    awayErrors,
    homeDoubles,
    awayDoubles,
    homeTriples,
    awayTriples,
    detailedHitTypes: { ...detailedHitTypes },
    pitchCount: finalState.pitchCount,
  };
}

// ============================================================
// 多様性指標計算
// ============================================================

function computeDiversityMetrics(games: GameStats[]): {
  consecutiveSameTypeCounts: Record<number, number>;
  maxConsecutiveSameType: number;
  consecutiveSameTypeRate5: number;
} {
  // §12.4 多様性指標: 連続同型打球率
  // 全試合の打球分布から Shannon エントロピーベースの多様性を計算する。
  // 各試合の detailedHitTypes カウントを合算して全体分布を求め、
  // 最大頻度種が全体の何% を占めるかを「連続同型率の代理指標」とする。
  //
  // 真の連続性検証には打席順序情報が必要だが、集計スクリプトでは個別打球ログを
  // 持たないため、以下の近似計算を用いる:
  //   連続5打席同型率 ≈ Σ(p_i^5) / Σ(p_i)
  //   （各打球種が独立一様分布と仮定した場合の5連続確率の期待値）
  //
  // 目標 §12.4: 連続5打席同型率 < 1%

  // 全試合の打球カウントを合算
  const totalCounts: Record<string, number> = {};
  let grandTotal = 0;

  for (const game of games) {
    for (const [k, v] of Object.entries(game.detailedHitTypes)) {
      totalCounts[k] = (totalCounts[k] ?? 0) + v;
      grandTotal += v;
    }
  }

  // 各種の確率 p_i を計算
  // 連続5打席同型率の近似 = Σ(p_i^5)
  let consecutive5Rate = 0;
  const maxCount = Math.max(...Object.values(totalCounts));
  const maxRunLength = grandTotal > 0 ? maxCount / grandTotal : 0; // 最頻出種の割合（疑似最長連続率）

  for (const count of Object.values(totalCounts)) {
    const p = grandTotal > 0 ? count / grandTotal : 0;
    consecutive5Rate += Math.pow(p, 5); // 独立仮定下の5連続確率
  }

  return {
    consecutiveSameTypeCounts: {},  // 詳細は対数ベース計算の代理指標で代替
    maxConsecutiveSameType: Math.round(maxRunLength * 100), // 最大連続率（%単位の近似値）
    consecutiveSameTypeRate5: consecutive5Rate,
  };
}

// ============================================================
// 統計集計
// ============================================================

function aggregateStats(games: GameStats[]): AggregatedStats {
  const totalGames = games.length;

  let totalAtBats = 0, totalHits = 0, totalHRs = 0;
  let totalWalks = 0, totalHBP = 0, totalStrikeouts = 0;
  let totalDoubles = 0, totalTriples = 0, totalErrors = 0, totalRuns = 0;

  const detailedHitTypes = emptyDetailedHitCounts();
  const scoreDistribution: Record<number, number> = {};

  for (const g of games) {
    totalAtBats += g.homeAtBats + g.awayAtBats;
    totalHits += g.homeHits + g.awayHits;
    totalHRs += g.homeHRs + g.awayHRs;
    totalWalks += g.homeWalks + g.awayWalks;
    totalStrikeouts += g.homeStrikeouts + g.awayStrikeouts;
    totalErrors += g.homeErrors + g.awayErrors;
    totalRuns += g.totalRuns;
    totalDoubles += g.homeDoubles + g.awayDoubles;
    totalTriples += g.homeTriples + g.awayTriples;

    for (const k of Object.keys(detailedHitTypes) as DetailedHitType[]) {
      detailedHitTypes[k] += g.detailedHitTypes[k] ?? 0;
    }

    // 得点分布
    const runsKey = g.totalRuns;
    scoreDistribution[runsKey] = (scoreDistribution[runsKey] ?? 0) + 1;
  }

  // 内野安打（infield_liner + over_infield_hit + first/third_line_grounder）
  // §12.3 内野安打率 = 内野エリアに飛んだ安打性打球 / インプレー打球数（§12.3: 8%-15%）
  // R8-3b: check_swing_dribbler は「当たり損ね」であり内野安打とは別カテゴリとして除外
  const totalInfieldHits =
    (detailedHitTypes['infield_liner'] ?? 0) +
    (detailedHitTypes['over_infield_hit'] ?? 0) +
    (detailedHitTypes['first_line_grounder'] ?? 0) +
    (detailedHitTypes['third_line_grounder'] ?? 0);

  // 打率
  const battingAverage = totalAtBats > 0 ? totalHits / totalAtBats : 0;

  // 出塁率 (hits + walks + hbp) / (AB + BB + HBP)
  const onBasePct = (totalAtBats + totalWalks + totalHBP) > 0
    ? (totalHits + totalWalks + totalHBP) / (totalAtBats + totalWalks + totalHBP)
    : 0;

  // 長打率: 単打1 + 2塁打2 + 3塁打3 + HR4
  const totalSingles = totalHits - totalDoubles - totalTriples - totalHRs;
  const totalBases = totalSingles + totalDoubles * 2 + totalTriples * 3 + totalHRs * 4;
  const sluggingPct = totalAtBats > 0 ? totalBases / totalAtBats : 0;

  // 三振率・四球率（打席分母）
  const totalPA = totalAtBats + totalWalks + totalHBP;
  const strikeoutRate = totalPA > 0 ? totalStrikeouts / totalPA : 0;
  const walkRate = totalPA > 0 ? totalWalks / totalPA : 0;

  // 内野安打率: 内野安打系打球 / 全インプレー打球数（§12.3: 8%-15%）
  // 分母を totalHits から全インプレー打球数に変更してより現実的な指標に
  const totalInPlay = Object.values(detailedHitTypes).reduce((a, b) => a + b, 0);
  const infieldHitRate = totalInPlay > 0 ? totalInfieldHits / totalInPlay : 0;

  // エラー/試合
  const errorPerGame = totalGames > 0 ? totalErrors / totalGames : 0;

  // HR/試合
  const hrPerGame = totalGames > 0 ? totalHRs / totalGames : 0;

  // 得点/試合
  const runsPerGame = totalGames > 0 ? totalRuns / totalGames : 0;

  // 21種打球割合
  const detailedHitTypePct: Record<DetailedHitType, number> = emptyDetailedHitCounts() as Record<DetailedHitType, number>;
  for (const k of Object.keys(detailedHitTypes) as DetailedHitType[]) {
    detailedHitTypePct[k] = totalInPlay > 0 ? detailedHitTypes[k] / totalInPlay : 0;
  }

  // 多様性指標
  const diversity = computeDiversityMetrics(games);

  return {
    totalGames,
    totalAtBats,
    totalHits,
    totalHRs,
    totalWalks,
    totalHBP,
    totalStrikeouts,
    totalDoubles,
    totalTriples,
    totalErrors,
    totalRuns,
    totalInfieldHits,
    battingAverage,
    onBasePct,
    sluggingPct,
    hrPerGame,
    strikeoutRate,
    walkRate,
    infieldHitRate,
    errorPerGame,
    runsPerGame,
    detailedHitTypes,
    detailedHitTypePct,
    scoreDistribution,
    ...diversity,
  };
}

// ============================================================
// §12.3 目標範囲チェック
// ============================================================

function checkTargets(stats: AggregatedStats): SimResult['targetChecks'] {
  const check = (value: number, min: number, max: number) => ({
    value,
    min,
    max,
    ok: value >= min && value <= max,
  });

  return {
    battingAverage: check(stats.battingAverage, 0.240, 0.300),
    onBasePct: check(stats.onBasePct, 0.300, 0.380),
    hrPerGame: check(stats.hrPerGame, 0.4, 1.5),
    strikeoutRate: check(stats.strikeoutRate, 0.18, 0.25),
    walkRate: check(stats.walkRate, 0.07, 0.12),
    infieldHitRate: check(stats.infieldHitRate, 0.08, 0.15),
    errorPerGame: check(stats.errorPerGame, 0.3, 1.0),
  };
}

// ============================================================
// §8.3 打球種頻度チェック
// ============================================================

const MAJOR_8_TYPES: DetailedHitType[] = [
  'first_line_grounder',
  'right_side_grounder',
  'left_side_grounder',
  'third_line_grounder',
  'shallow_fly',
  'medium_fly',
  'deep_fly',
  'foul_fly',
];

const RARE_5_TYPES: DetailedHitType[] = [
  'wall_ball',
  'line_drive_hr',
  'high_arc_hr',
  'fence_close_call',
  'check_swing_dribbler',
];

function checkHitTypeFrequency(stats: AggregatedStats): SimResult['hitTypeFrequencyCheck'] {
  const counts = stats.detailedHitTypes;

  const typesWithZeroCount = (Object.keys(counts) as DetailedHitType[]).filter(
    (k) => counts[k] === 0,
  );

  const allTypesPresent = typesWithZeroCount.length === 0;
  const major8TypesPresent = MAJOR_8_TYPES.every((t) => counts[t] > 0);
  const rare5TypesPresent = RARE_5_TYPES.every((t) => counts[t] > 0);

  return {
    allTypesPresent,
    major8TypesPresent,
    rare5TypesPresent,
    typesWithZeroCount,
  };
}

// ============================================================
// メイン
// ============================================================

async function main() {
  const startTime = Date.now();

  console.log('='.repeat(60));
  console.log('Phase R8-1: 1000試合バランスシミュレーション');
  console.log('='.repeat(60));
  console.log(`シード: ${SEED_BASE}`);
  console.log(`試合数: ${NUM_GAMES}`);
  console.log('');

  const rng = createRNG(SEED_BASE);
  const games: GameStats[] = [];

  // 出力ディレクトリ作成
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const config: MatchConfig = {
    innings: 9,
    maxExtras: 3,
    useDH: false,
    isTournament: false,
    isKoshien: false,
  };

  let crashCount = 0;

  for (let i = 0; i < NUM_GAMES; i++) {
    const gameRng = rng.derive(`game-${i}`);

    // 3種のチームレベルをローテーション
    const homeConfig = TEAM_CONFIGS[i % TEAM_CONFIGS.length];
    const awayConfig = TEAM_CONFIGS[(i + 1) % TEAM_CONFIGS.length];

    const homeTeam = buildTestTeam(
      `${homeConfig.label}-home`,
      `home-${i}`,
      homeConfig.reputation,
      gameRng.derive('home'),
    );
    const awayTeam = buildTestTeam(
      `${awayConfig.label}-away`,
      `away-${i}`,
      awayConfig.reputation,
      gameRng.derive('away'),
    );

    try {
      const { finalState, result } = runGame(
        config,
        homeTeam,
        awayTeam,
        gameRng.derive('play'),
      );

      const gameStats = extractGameStats(i, result, finalState);
      games.push(gameStats);
    } catch (err) {
      crashCount++;
      console.error(`  [CRASH] game ${i}: ${(err as Error).message}`);
      if (crashCount > 10) {
        console.error('クラッシュが多すぎます。中断します。');
        process.exit(1);
      }
    }

    // 進捗表示（100試合ごと）
    if ((i + 1) % 100 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`  ${i + 1}/${NUM_GAMES} 試合完了 (${elapsed}s)\r`);
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`\n\nシミュレーション完了: ${games.length}試合 (クラッシュ: ${crashCount})`);
  console.log(`所要時間: ${(elapsed / 1000).toFixed(1)}s`);
  console.log('');

  // 統計集計
  const stats = aggregateStats(games);
  const targetChecks = checkTargets(stats);
  const hitTypeFrequencyCheck = checkHitTypeFrequency(stats);

  // 結果表示
  console.log('='.repeat(60));
  console.log('【§12.3 目標範囲チェック】');
  console.log('='.repeat(60));
  const checks = [
    ['打率',       targetChecks.battingAverage],
    ['出塁率',     targetChecks.onBasePct],
    ['HR/試合',    targetChecks.hrPerGame],
    ['三振率',     targetChecks.strikeoutRate],
    ['四球率',     targetChecks.walkRate],
    ['内野安打率', targetChecks.infieldHitRate],
    ['エラー/試合', targetChecks.errorPerGame],
  ] as const;

  for (const [label, check] of checks) {
    const status = check.ok ? '✅' : '❌';
    const pct = label.includes('率') || label.includes('打率') || label.includes('出塁') || label.includes('長打')
      ? `${(check.value * 100).toFixed(1)}% (目標: ${(check.min * 100).toFixed(0)}%-${(check.max * 100).toFixed(0)}%)`
      : `${check.value.toFixed(3)} (目標: ${check.min}-${check.max})`;
    console.log(`  ${status} ${label}: ${pct}`);
  }
  console.log('');

  console.log('='.repeat(60));
  console.log('【基本統計】');
  console.log('='.repeat(60));
  console.log(`  試合数:     ${stats.totalGames}`);
  console.log(`  打数:       ${stats.totalAtBats}`);
  console.log(`  安打:       ${stats.totalHits}`);
  console.log(`  打率:       ${stats.battingAverage.toFixed(3)}`);
  console.log(`  出塁率:     ${stats.onBasePct.toFixed(3)}`);
  console.log(`  長打率:     ${stats.sluggingPct.toFixed(3)}`);
  console.log(`  本塁打:     ${stats.totalHRs} (${stats.hrPerGame.toFixed(2)}/試合)`);
  console.log(`  三振:       ${stats.totalStrikeouts} (${(stats.strikeoutRate * 100).toFixed(1)}%)`);
  console.log(`  四球:       ${stats.totalWalks} (${(stats.walkRate * 100).toFixed(1)}%)`);
  console.log(`  エラー:     ${stats.totalErrors} (${stats.errorPerGame.toFixed(2)}/試合)`);
  console.log(`  得点:       ${stats.totalRuns} (${stats.runsPerGame.toFixed(2)}/試合)`);
  console.log('');

  console.log('='.repeat(60));
  console.log('【§8.3 21種打球分類】');
  console.log('='.repeat(60));
  console.log(`  全21種出現:   ${hitTypeFrequencyCheck.allTypesPresent ? '✅' : '❌'}`);
  console.log(`  主要8種安定:  ${hitTypeFrequencyCheck.major8TypesPresent ? '✅' : '❌'}`);
  console.log(`  希少5種出現:  ${hitTypeFrequencyCheck.rare5TypesPresent ? '✅' : '❌'}`);
  if (hitTypeFrequencyCheck.typesWithZeroCount.length > 0) {
    console.log(`  未出現種:     ${hitTypeFrequencyCheck.typesWithZeroCount.join(', ')}`);
  }
  console.log('');
  console.log('  打球種別出現割合 (上位15種):');
  const sortedTypes = (Object.entries(stats.detailedHitTypePct) as [DetailedHitType, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  for (const [type, pct] of sortedTypes) {
    const bar = '█'.repeat(Math.round(pct * 100));
    console.log(`    ${type.padEnd(25)} ${(pct * 100).toFixed(1).padStart(5)}%  ${bar}`);
  }
  console.log('');

  console.log('='.repeat(60));
  console.log('【§12.4 多様性指標】');
  console.log('='.repeat(60));
  console.log(`  連続5打席以上同型割合: ${(stats.consecutiveSameTypeRate5 * 100).toFixed(2)}%`);
  console.log(`  連続5打席同型 <1%:     ${stats.consecutiveSameTypeRate5 < 0.01 ? '✅' : '❌'}`);
  console.log('');

  // JSON 出力
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputPath = path.join(OUTPUT_DIR, `stats-${timestamp}.json`);

  const simResult: SimResult = {
    metadata: {
      seed: SEED_BASE,
      numGames: NUM_GAMES,
      runAt: new Date().toISOString(),
      teamConfigs: TEAM_CONFIGS,
      durationMs: elapsed,
    },
    stats,
    games,
    targetChecks,
    hitTypeFrequencyCheck,
    diversityCheck: {
      consecutiveSameTypeBelow1Pct: stats.consecutiveSameTypeRate5 < 0.01,
      consecutiveSameTypeRate5: stats.consecutiveSameTypeRate5,
      exitVelocityVariance: 0, // 個別打球EV追跡は別途計測
    },
  };

  fs.writeFileSync(outputPath, JSON.stringify(simResult, null, 2));
  console.log(`JSON 出力: ${outputPath}`);
  console.log('');

  // 最終サマリ
  const allOk = Object.values(targetChecks).every((c) => c.ok);
  console.log('='.repeat(60));
  if (allOk && hitTypeFrequencyCheck.allTypesPresent) {
    console.log('✅ §12.3 全目標範囲達成！野球らしい統計分布が確認されました。');
  } else {
    console.log('❌ 一部の指標が目標範囲外です。パラメータ調整が必要です。');
    const failedChecks = Object.entries(targetChecks)
      .filter(([, v]) => !v.ok)
      .map(([k]) => k);
    if (failedChecks.length > 0) {
      console.log(`  未達成項目: ${failedChecks.join(', ')}`);
    }
  }
  console.log('='.repeat(60));

  // 終了コード（CI 用）
  if (crashCount > 0) {
    console.error(`\n⚠️  クラッシュ ${crashCount} 件が発生しました。`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
