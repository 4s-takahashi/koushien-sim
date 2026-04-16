/**
 * playtest-5years.ts — 5年間安定性テスト
 *
 * 実行: npx tsx scripts/playtest-5years.ts
 *
 * シナリオ:
 * - 新規ゲーム開始（48校 + 中学生540人）
 * - 5年間を自動進行
 * - 年度替わり処理の安定性・選手数推移・各種指標を検証
 */

import { createRNG } from '../src/engine/core/rng';
import { createWorldState } from '../src/engine/world/create-world';
import { advanceWorldDay } from '../src/engine/world/world-ticker';
import { generatePlayer } from '../src/engine/player/generate';
import { computePlayerOverall, identifyDraftCandidates } from '../src/engine/world/career/draft-system';
import { computeMiddleSchoolOverall } from '../src/engine/world/scout/scout-system';
import type { WorldState } from '../src/engine/world/world-state';
import type { Player } from '../src/engine/types/player';
import type { PracticeMenuId } from '../src/engine/types/calendar';

// ============================================================
// 設定
// ============================================================

const SEED = 'playtest-5years-2026-phase5';
const SIMULATION_YEARS = 5;
const START_YEAR = 1;

const PRACTICE_ROTATION: PracticeMenuId[] = [
  'batting_basic',
  'pitching_basic',
  'fielding_drill',
  'batting_live',
  'running',
  'strength',
  'rest',
];

// ============================================================
// ヘルパー
// ============================================================

interface YearSnapshot {
  year: number;
  totalPlayers: number;
  totalMiddleSchoolers: number;
  middleSchoolGrade3: number;
  minSchoolPlayers: number;
  maxSchoolPlayers: number;
  avgSchoolPlayers: number;
  underpopulatedSchools: number;
  draftCandidates: number;
  proPlayers: number;
  graduates: number;
  topSchoolPlayerCount: number;
  avgReputation: number;
  avgPlayerOverall: number;
  newsCount: number;
  daysWithoutNews: number;
}

function computeGrade(player: Player, currentYear: number): number {
  return Math.min(3, Math.max(1, currentYear - player.enrollmentYear + 1));
}

function takeYearSnapshot(world: WorldState, newsCount: number, daysWithoutNews: number): YearSnapshot {
  const year = world.currentDate.year;
  const allPlayers = world.schools.flatMap((s) => s.players);
  const schoolCounts = world.schools.map((s) => s.players.length).sort((a, b) => a - b);
  const topSchool = world.schools.sort((a, b) => b.reputation - a.reputation)[0];

  // ドラフト候補（来年度に3年生になる現2年生 = enrollmentYear == year - 1）
  // 注: 年度替わり直後のスナップショットなので、現3年生は既に卒業済み
  // 来年のドラフト候補予備軍として現2年生を表示
  const candidatesNext = identifyDraftCandidates(world, year + 1); // 来年度3年生になる選手
  const proCount = Array.from(world.personRegistry.entries.values())
    .filter((e) => e.graduateSummary?.careerPath.type === 'pro').length;

  const totalGrads = world.personRegistry.entries.size;

  const avgOverall = allPlayers.length > 0
    ? allPlayers.reduce((s, p) => s + computePlayerOverall(p), 0) / allPlayers.length
    : 0;
  const avgRep = world.schools.reduce((s, sch) => s + sch.reputation, 0) / world.schools.length;

  return {
    year,
    totalPlayers: allPlayers.length,
    totalMiddleSchoolers: world.middleSchoolPool.length,
    middleSchoolGrade3: world.middleSchoolPool.filter((ms) => ms.middleSchoolGrade === 3).length,
    minSchoolPlayers: schoolCounts[0] ?? 0,
    maxSchoolPlayers: schoolCounts[schoolCounts.length - 1] ?? 0,
    avgSchoolPlayers: schoolCounts.reduce((s, n) => s + n, 0) / (schoolCounts.length || 1),
    underpopulatedSchools: schoolCounts.filter((n) => n < 9).length,
    draftCandidates: candidatesNext.length, // 来年度ドラフト候補（現2年生）
    proPlayers: proCount,
    graduates: totalGrads,
    topSchoolPlayerCount: topSchool?.players.length ?? 0,
    avgReputation: avgRep,
    avgPlayerOverall: avgOverall,
    newsCount,
    daysWithoutNews,
  };
}

// ============================================================
// メイン
// ============================================================

async function main() {
  console.log('='.repeat(60));
  console.log('PHASE5 プレイテスト — 5年間安定性テスト');
  console.log('='.repeat(60));
  console.log(`シード: ${SEED}`);
  console.log('');

  const rng = createRNG(SEED);
  const playerGenRng = rng.derive('player-gen');

  // 自校作成（reputation 50, 普通校）
  const players: Player[] = [];
  for (let i = 0; i < 7; i++) {
    const p = generatePlayer(playerGenRng.derive(`yr3-${i}`), { enrollmentYear: START_YEAR - 2, schoolReputation: 50 });
    players.push({ ...p, enrollmentYear: START_YEAR - 2 });
  }
  for (let i = 0; i < 8; i++) {
    const p = generatePlayer(playerGenRng.derive(`yr2-${i}`), { enrollmentYear: START_YEAR - 1, schoolReputation: 50 });
    players.push({ ...p, enrollmentYear: START_YEAR - 1 });
  }
  for (let i = 0; i < 5; i++) {
    const p = generatePlayer(playerGenRng.derive(`yr1-${i}`), { enrollmentYear: START_YEAR, schoolReputation: 50 });
    players.push({ ...p, enrollmentYear: START_YEAR });
  }

  const playerTeam = {
    id: 'player-school',
    name: '選抜高校',
    prefecture: '埼玉',
    reputation: 50,
    players,
    lineup: null,
    facilities: { ground: 5, bullpen: 5, battingCage: 5, gym: 5 },
  };

  const manager = {
    firstName: '太郎',
    lastName: '田中',
    yearsActive: 0,
    personality: { strictness: 50, communication: 50, strategy: 50 },
  };

  let world = createWorldState(playerTeam, manager, '埼玉', SEED, rng.derive('world-init'));

  const yearSnapshots: YearSnapshot[] = [];
  let practiceIdx = 0;
  let totalDays = 0;
  let yearNewsCount = 0;
  let yearDaysWithoutNews = 0;

  // 初年度スナップショット
  yearSnapshots.push(takeYearSnapshot(world, 0, 0));

  console.log(`初期状態:`);
  console.log(`  全校数: ${world.schools.length}`);
  console.log(`  全選手数: ${world.schools.flatMap(s => s.players).length}`);
  console.log(`  中学生: ${world.middleSchoolPool.length}人`);
  console.log('');

  // ============================================================
  // 5年間シミュレーション
  // ============================================================

  for (let targetYear = START_YEAR + 1; targetYear <= START_YEAR + SIMULATION_YEARS; targetYear++) {
    console.log(`--- Year ${targetYear - 1} → ${targetYear} シミュレーション中...`);
    yearNewsCount = 0;
    yearDaysWithoutNews = 0;

    while (
      world.currentDate.year < targetYear ||
      (world.currentDate.year === targetYear && world.currentDate.month < 4)
    ) {
      const menuId = PRACTICE_ROTATION[practiceIdx % PRACTICE_ROTATION.length];
      practiceIdx++;
      totalDays++;

      const dayRng = rng.derive(`day-${world.currentDate.year}-${world.currentDate.month}-${world.currentDate.day}`);
      const { nextWorld, result } = advanceWorldDay(world, menuId, dayRng);
      world = nextWorld;

      if (result.worldNews.length === 0) {
        yearDaysWithoutNews++;
      } else {
        yearNewsCount += result.worldNews.length;
      }
    }

    const snapshot = takeYearSnapshot(world, yearNewsCount, yearDaysWithoutNews);
    yearSnapshots.push(snapshot);

    const playerSchool = world.schools.find(s => s.id === world.playerSchoolId);
    console.log(`  Year ${targetYear} 完了:`);
    console.log(`    全選手数: ${snapshot.totalPlayers}, 中学生: ${snapshot.totalMiddleSchoolers}`);
    console.log(`    自校選手: ${playerSchool?.players.length ?? 0}人, 評判: ${playerSchool?.reputation ?? 0}`);
    console.log(`    9人未満: ${snapshot.underpopulatedSchools}校`);
    console.log(`    ドラフト候補: ${snapshot.draftCandidates}人, プロ累計: ${snapshot.proPlayers}人`);
    console.log('');
  }

  // ============================================================
  // 5年間レポート
  // ============================================================

  console.log('='.repeat(60));
  console.log('【5年間 年度別推移】');
  console.log('='.repeat(60));
  console.log('');

  // テーブルヘッダー
  console.log('Year | 全選手 | 中学生 | 最小 | 最大 | 9人↓ | ドラフト | プロ累計 | 平均OVR | ニュース | 評判avg');
  console.log('-'.repeat(110));

  for (const s of yearSnapshots) {
    console.log(
      `  ${String(s.year).padEnd(3)} | ` +
      `${String(s.totalPlayers).padStart(5)} | ` +
      `${String(s.totalMiddleSchoolers).padStart(5)} | ` +
      `${String(s.minSchoolPlayers).padStart(4)} | ` +
      `${String(s.maxSchoolPlayers).padStart(4)} | ` +
      `${String(s.underpopulatedSchools).padStart(5)} | ` +
      `${String(s.draftCandidates).padStart(8)} | ` +
      `${String(s.proPlayers).padStart(8)} | ` +
      `${s.avgPlayerOverall.toFixed(1).padStart(7)} | ` +
      `${String(s.newsCount).padStart(8)} | ` +
      `${s.avgReputation.toFixed(1).padStart(7)}`
    );
  }

  console.log('');

  // 安定性評価
  console.log('='.repeat(60));
  console.log('【安定性評価】');
  console.log('='.repeat(60));

  const issues: string[] = [];
  const ok: string[] = [];

  // 選手数の安定性
  const playerCounts = yearSnapshots.map(s => s.totalPlayers);
  const playerCountVariation = Math.max(...playerCounts) - Math.min(...playerCounts);
  if (playerCountVariation > 200) {
    issues.push(`全選手数の変動が大きすぎる: ${Math.min(...playerCounts)}〜${Math.max(...playerCounts)}`);
  } else {
    ok.push(`全選手数安定: ${Math.min(...playerCounts)}〜${Math.max(...playerCounts)}`);
  }

  // 9人未満チームの推移
  const underpopulatedMax = Math.max(...yearSnapshots.map(s => s.underpopulatedSchools));
  if (underpopulatedMax > 5) {
    issues.push(`9人未満チームが多い (最大: ${underpopulatedMax}校)`);
  } else {
    ok.push(`9人未満チームは管理できている (最大: ${underpopulatedMax}校)`);
  }

  // 中学生プールの安定性
  const msMin = Math.min(...yearSnapshots.slice(1).map(s => s.totalMiddleSchoolers));
  const msMax = Math.max(...yearSnapshots.slice(1).map(s => s.totalMiddleSchoolers));
  if (Math.abs(msMax - msMin) > 100) {
    issues.push(`中学生プールの変動が大きい: ${msMin}〜${msMax}`);
  } else {
    ok.push(`中学生プール安定: ${msMin}〜${msMax}人`);
  }

  // ドラフト候補の出現
  const draftAvg = yearSnapshots.slice(1).reduce((s, y) => s + y.draftCandidates, 0) / (yearSnapshots.length - 1);
  if (draftAvg < 5) {
    issues.push(`ドラフト候補が少ない (平均: ${draftAvg.toFixed(1)}人/年)`);
  } else {
    ok.push(`ドラフト候補 平均: ${draftAvg.toFixed(1)}人/年`);
  }

  // プロ輩出
  const finalProCount = yearSnapshots[yearSnapshots.length - 1]?.proPlayers ?? 0;
  const proPerYear = finalProCount / SIMULATION_YEARS;
  if (proPerYear < 1) {
    issues.push(`プロ輩出が少ない (${proPerYear.toFixed(1)}人/年)`);
  } else {
    ok.push(`プロ輩出: ${proPerYear.toFixed(1)}人/年 (累計: ${finalProCount}人)`);
  }

  // 評判の変動
  const repValues = yearSnapshots.map(s => s.avgReputation);
  const repVariation = Math.max(...repValues) - Math.min(...repValues);
  if (repVariation > 30) {
    issues.push(`評判の変動が大きい: ${Math.min(...repValues).toFixed(1)}〜${Math.max(...repValues).toFixed(1)}`);
  } else {
    ok.push(`評判安定: ${Math.min(...repValues).toFixed(1)}〜${Math.max(...repValues).toFixed(1)}`);
  }

  console.log('問題点:');
  if (issues.length === 0) console.log('  なし ✓');
  else for (const issue of issues) console.log(`  ⚠ ${issue}`);

  console.log('正常:');
  for (const item of ok) console.log(`  ✓ ${item}`);

  console.log('');
  console.log(`総シミュレーション日数: ${totalDays}日`);
  console.log('5年間安定性テスト完了!');
}

main().catch((err) => {
  console.error('エラー:', err);
  process.exit(1);
});
