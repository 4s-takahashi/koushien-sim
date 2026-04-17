/**
 * verify-tournament-realism.ts — 大会試合リアリズム検証スクリプト
 *
 * Phase 5.5: distributeScore 撤廃 + quickGame 実シミュ導入の確認
 *
 * 実行: npx tsx scripts/verify-tournament-realism.ts
 *
 * 検証内容:
 * - 新規ゲーム起動 → 1年分 advance → 夏と秋の大会データをダンプ
 * - 全試合のイニングスコアを出力 → [1,1,1,...] パターンでないことを確認
 * - サンプル試合を表形式で表示
 * - パフォーマンス測定
 */

import { createRNG } from '../src/engine/core/rng';
import { createWorldState } from '../src/engine/world/create-world';
import { advanceWorldDay } from '../src/engine/world/world-ticker';
import { generatePlayer } from '../src/engine/player/generate';
import type { WorldState } from '../src/engine/world/world-state';
import type { TournamentBracket } from '../src/engine/world/tournament-bracket';
import type { PracticeMenuId } from '../src/engine/types/calendar';

// ============================================================
// 設定
// ============================================================

const SEED = 'verify-tournament-realism-phase5.5';
const START_YEAR = 1;

const PRACTICE_ROTATION: PracticeMenuId[] = [
  'batting_basic',
  'pitching_basic',
  'batting_basic',
  'pitching_basic',
  'batting_basic',
  'running',
  'rest',
];

// ============================================================
// スコアボード表示
// ============================================================

function formatScoreboard(
  homeTeamName: string,
  awayTeamName: string,
  homeScore: number,
  awayScore: number,
  inningScores: { home: number[]; away: number[] } | null,
): string {
  const innings = inningScores?.home.length ?? 9;
  const homeRow = (inningScores?.home ?? Array(9).fill(0)).map((s) => s.toString().padStart(2)).join(' ');
  const awayRow = (inningScores?.away ?? Array(9).fill(0)).map((s) => s.toString().padStart(2)).join(' ');
  const header = Array.from({ length: innings }, (_, i) => (i + 1).toString().padStart(2)).join(' ');

  const sep = '-'.repeat(12 + innings * 3 + 5);
  return [
    sep,
    `     イニング: ${header}  計`,
    `  表（away）${awayTeamName.slice(0, 8).padEnd(8)}: ${awayRow}  ${awayScore.toString().padStart(2)}`,
    `  裏（home）${homeTeamName.slice(0, 8).padEnd(8)}: ${homeRow}  ${homeScore.toString().padStart(2)}`,
    sep,
  ].join('\n');
}

// ============================================================
// 分析: distributeScore バグのパターン検出
// ============================================================

function isDistributeScorePattern(scores: number[]): boolean {
  // distributeScore は前から均等分散するため、
  // スコアが > 0 なら必ず連続した先頭イニングに配置される
  // 後ろに 0 があり、その後に非0 が来ると distributeScore でない
  let foundZeroAfterNonZero = false;
  let prevWasNonZero = false;
  for (const s of scores) {
    if (prevWasNonZero && s === 0) {
      foundZeroAfterNonZero = true;
    } else if (s > 0 && foundZeroAfterNonZero) {
      return false; // 0 の後に非0 → distributeScore パターンではない
    }
    prevWasNonZero = s > 0;
  }
  return true;
}

// ============================================================
// 大会データ表示
// ============================================================

function printTournamentData(bracket: TournamentBracket, schoolIdToName: Map<string, string>): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`大会: ${bracket.type === 'summer' ? '夏季' : '秋季'} Year${bracket.year}`);
  console.log(`優勝: ${schoolIdToName.get(bracket.champion ?? '') ?? bracket.champion ?? '未定'}`);
  console.log(`${'='.repeat(60)}`);

  let totalMatches = 0;
  let matchesWithRealScores = 0;
  let distributePatternScores = 0;
  let nonUniformScores = 0;

  const sampleMatches: Array<{
    round: string;
    home: string;
    away: string;
    homeScore: number;
    awayScore: number;
    inningScores: { home: number[]; away: number[] } | null;
    mvpId: string | null;
  }> = [];

  for (const round of bracket.rounds) {
    for (const match of round.matches) {
      if (match.isBye || match.winnerId === null) continue;
      if (match.homeSchoolId === null || match.awaySchoolId === null) continue;

      totalMatches++;
      const homeName = schoolIdToName.get(match.homeSchoolId) ?? match.homeSchoolId;
      const awayName = schoolIdToName.get(match.awaySchoolId) ?? match.awaySchoolId;
      const homeScore = match.homeScore ?? 0;
      const awayScore = match.awayScore ?? 0;

      if (match.inningScores) {
        matchesWithRealScores++;

        // distributeScore パターン検出
        const homeIsDistribute = isDistributeScorePattern(match.inningScores.home);
        const awayIsDistribute = isDistributeScorePattern(match.inningScores.away);
        if (homeIsDistribute && homeScore > 0) distributePatternScores++;
        else if (homeScore > 0) nonUniformScores++;
        if (awayIsDistribute && awayScore > 0) distributePatternScores++;
        else if (awayScore > 0) nonUniformScores++;

        // サンプル3試合収集
        if (sampleMatches.length < 5) {
          sampleMatches.push({
            round: round.roundName,
            home: homeName,
            away: awayName,
            homeScore,
            awayScore,
            inningScores: match.inningScores,
            mvpId: match.mvpPlayerId,
          });
        }
      }
    }
  }

  // サンプル試合表示
  console.log('\n【サンプル試合（スコアボード）】');
  for (const sm of sampleMatches) {
    console.log(`\n[${sm.round}] ${sm.away} vs ${sm.home}`);
    console.log(formatScoreboard(sm.home, sm.away, sm.homeScore, sm.awayScore, sm.inningScores));
    if (sm.mvpId) console.log(`  MVP: ${sm.mvpId}`);
  }

  // 全試合サマリ
  console.log('\n--- 統計 ---');
  console.log(`総試合数: ${totalMatches}`);
  console.log(`実イニングスコア付き: ${matchesWithRealScores}/${totalMatches}`);
  console.log(`非均等分散スコア（正常）: ${nonUniformScores}`);
  console.log(`均等分散スコア（旧バグパターン）: ${distributePatternScores}`);

  if (distributePatternScores === 0 || nonUniformScores > distributePatternScores) {
    console.log(`✅ distributeScore バグなし（実シミュレーションで多様なイニングスコア）`);
  } else {
    console.log(`⚠️ distributeScore パターンが多く検出（要確認）`);
  }
}

// ============================================================
// メイン
// ============================================================

async function main() {
  console.log('Phase 5.5: 大会試合リアリズム検証スクリプト');
  console.log('='.repeat(60));

  const rng = createRNG(SEED);

  // 自校作成
  const players = [];
  for (let i = 0; i < 18; i++) {
    const p = generatePlayer(rng.derive(`p${i}`), { enrollmentYear: START_YEAR, schoolReputation: 55 });
    players.push({ ...p, enrollmentYear: START_YEAR });
  }

  const playerTeam = {
    id: 'verify-player-school',
    name: '検証高校',
    prefecture: '新潟',
    reputation: 55,
    players,
    lineup: null,
    facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 } as const,
  };

  const manager = {
    name: '検証監督',
    yearsActive: 0,
    fame: 0,
    totalWins: 0,
    totalLosses: 0,
    koshienAppearances: 0,
    koshienWins: 0,
  };

  let world: WorldState = createWorldState(playerTeam, manager, '新潟', SEED, rng.derive('world-init'));

  const schoolIdToName = new Map<string, string>();
  for (const s of world.schools) {
    schoolIdToName.set(s.id, s.name);
  }

  console.log(`学校数: ${world.schools.length}`);
  console.log(`自校: ${world.schools.find((s) => s.id === world.playerSchoolId)?.name ?? '不明'}`);
  console.log(`開始日: Year${world.currentDate.year}/${world.currentDate.month}/${world.currentDate.day}`);

  // --- 1年間進行 ---
  console.log('\n1年間の自動進行を開始...');
  const perfStart = Date.now();

  let dayCount = 0;
  let menuIdx = 0;
  const targetYear = START_YEAR + 1;

  while (
    world.currentDate.year < targetYear ||
    (world.currentDate.year === targetYear && world.currentDate.month < 4)
  ) {
    const menu = PRACTICE_ROTATION[menuIdx % PRACTICE_ROTATION.length];
    menuIdx++;

    const dayRng = rng.derive(`day-${world.currentDate.year}-${world.currentDate.month}-${world.currentDate.day}`);
    const { nextWorld } = advanceWorldDay(world, menu, dayRng);
    world = nextWorld;
    dayCount++;

    if (dayCount % 50 === 0) {
      const d = world.currentDate;
      process.stdout.write(`  Year${d.year}/${d.month}/${d.day}... (履歴: ${world.tournamentHistory.length}大会)\n`);
    }
  }

  const elapsed = Date.now() - perfStart;
  console.log(`\n1年間進行完了: ${elapsed}ms (${dayCount}日)`);
  console.log(`大会履歴: ${world.tournamentHistory.length}大会`);

  // --- 大会データ出力 ---
  const tournaments = [...world.tournamentHistory];
  if (world.activeTournament) {
    tournaments.push(world.activeTournament);
  }

  if (tournaments.length === 0) {
    console.log('\n⚠️ 大会データなし');
  }

  for (const bracket of tournaments) {
    printTournamentData(bracket, schoolIdToName);
  }

  // --- パフォーマンス: 48校大会全ラウンドの単体計測 ---
  console.log('\n--- パフォーマンス測定: 48校大会全ラウンド単体 ---');
  const { simulateFullTournament, createTournamentBracket } = await import('../src/engine/world/tournament-bracket');
  const perfRng = createRNG(`${SEED}-perf`);
  const perfBracket = createTournamentBracket(
    'perf-test',
    'summer',
    99,
    world.schools,
    perfRng.derive('bracket'),
  );

  const trials = 5;
  const times: number[] = [];
  for (let i = 0; i < trials; i++) {
    const t0 = Date.now();
    simulateFullTournament(perfBracket, world.schools, perfRng.derive(`trial-${i}`));
    times.push(Date.now() - t0);
  }
  const avgMs = times.reduce((a, b) => a + b, 0) / trials;
  console.log(`5試行の時間: ${times.join('ms / ')}ms`);
  console.log(`平均: ${avgMs.toFixed(0)}ms`);
  if (avgMs < 1000) {
    console.log(`✅ パフォーマンス OK (目標: 1秒以内)`);
  } else if (avgMs < 3000) {
    console.log(`⚠️ パフォーマンス やや遅い (${avgMs.toFixed(0)}ms > 1000ms)`);
  } else {
    console.log(`❌ パフォーマンス NG (${avgMs.toFixed(0)}ms > 3000ms) — tier分けが必要`);
  }

  console.log('\n検証完了。');
}

main().catch(console.error);
