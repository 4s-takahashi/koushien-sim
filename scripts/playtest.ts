/**
 * playtest.ts — 1年間自動プレイテスト
 *
 * 実行: npx tsx scripts/playtest.ts
 *
 * シナリオ:
 * - 新規ゲーム開始（48校 + 中学生540人）
 * - 1年間（365日）を自動進行（練習メニューはローテーション）
 * - バランス指標をレポート
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

const SEED = 'playtest-2026-phase5';
const START_YEAR = 1;

// 練習メニューのローテーション
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

function computeGrade(player: Player, currentYear: number): number {
  return Math.min(3, Math.max(1, currentYear - player.enrollmentYear + 1));
}

function avgStats(players: Player[]): { contact: number; power: number; speed: number; overall: number } {
  if (players.length === 0) return { contact: 0, power: 0, speed: 0, overall: 0 };
  const sum = players.reduce((acc, p) => ({
    contact: acc.contact + p.stats.batting.contact,
    power: acc.power + p.stats.batting.power,
    speed: acc.speed + p.stats.base.speed,
    overall: acc.overall + computePlayerOverall(p),
  }), { contact: 0, power: 0, speed: 0, overall: 0 });
  return {
    contact: sum.contact / players.length,
    power: sum.power / players.length,
    speed: sum.speed / players.length,
    overall: sum.overall / players.length,
  };
}

// ============================================================
// メイン
// ============================================================

async function main() {
  console.log('='.repeat(60));
  console.log('PHASE5 プレイテスト — 1年間シミュレーション');
  console.log('='.repeat(60));
  console.log(`シード: ${SEED}`);
  console.log('');

  const rng = createRNG(SEED);

  // 自校作成（reputation 50, 普通校）
  const playerGenRng = rng.derive('player-gen');
  const players: Player[] = [];
  // 3年生7人
  for (let i = 0; i < 7; i++) {
    const p = generatePlayer(playerGenRng.derive(`yr3-${i}`), { enrollmentYear: START_YEAR - 2, schoolReputation: 50 });
    players.push({ ...p, enrollmentYear: START_YEAR - 2 });
  }
  // 2年生8人
  for (let i = 0; i < 8; i++) {
    const p = generatePlayer(playerGenRng.derive(`yr2-${i}`), { enrollmentYear: START_YEAR - 1, schoolReputation: 50 });
    players.push({ ...p, enrollmentYear: START_YEAR - 1 });
  }
  // 1年生5人
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

  // WorldState 初期化
  let world = createWorldState(playerTeam, manager, '埼玉', SEED, rng.derive('world-init'));

  // 初期状態記録
  const playerSchool = world.schools.find((s) => s.id === world.playerSchoolId)!;
  const initialPlayers = [...playerSchool.players];
  const initialOveralls = initialPlayers.map((p) => ({
    id: p.id,
    overall: computePlayerOverall(p),
    grade: computeGrade(p, START_YEAR),
  }));

  console.log(`初期状態:`);
  console.log(`  全校数: ${world.schools.length}`);
  console.log(`  中学生数: ${world.middleSchoolPool.length}`);
  console.log(`  自校選手数: ${playerSchool.players.length}`);
  const initialAvg = avgStats(playerSchool.players);
  console.log(`  自校平均能力値: overall=${initialAvg.overall.toFixed(1)}, contact=${initialAvg.contact.toFixed(1)}, power=${initialAvg.power.toFixed(1)}`);
  console.log('');

  // ============================================================
  // 1年間（365日）シミュレーション
  // ============================================================

  let dayCount = 0;
  let practiceIdx = 0;
  let newsCount = 0;
  const newsTypeCounts: Record<string, number> = {};
  const newsImportanceCounts = { high: 0, medium: 0, low: 0 };
  let daysWithoutNews = 0;
  const monthlyPlayerCounts: { month: number; count: number }[] = [];
  let lastMonth = -1;

  const targetDate = { year: START_YEAR + 1, month: 4, day: 1 }; // 翌年度4月1日まで

  console.log('シミュレーション開始...');

  while (
    world.currentDate.year < targetDate.year ||
    (world.currentDate.year === targetDate.year && world.currentDate.month < targetDate.month)
  ) {
    const menuId = PRACTICE_ROTATION[practiceIdx % PRACTICE_ROTATION.length];
    practiceIdx++;

    const dayRng = rng.derive(`day-${world.currentDate.year}-${world.currentDate.month}-${world.currentDate.day}`);
    const { nextWorld, result } = advanceWorldDay(world, menuId, dayRng);
    world = nextWorld;
    dayCount++;

    // 月次記録
    if (world.currentDate.month !== lastMonth) {
      lastMonth = world.currentDate.month;
      const ps = world.schools.find((s) => s.id === world.playerSchoolId);
      if (ps) {
        monthlyPlayerCounts.push({ month: world.currentDate.month, count: ps.players.length });
      }
    }

    // ニュース集計
    if (result.worldNews.length === 0) {
      daysWithoutNews++;
    } else {
      for (const news of result.worldNews) {
        newsCount++;
        newsTypeCounts[news.type] = (newsTypeCounts[news.type] ?? 0) + 1;
        newsImportanceCounts[news.importance]++;
      }
    }

    // 進捗表示（月に1回）
    if (world.currentDate.day === 1) {
      process.stdout.write(`  ${world.currentDate.year}年${world.currentDate.month}月1日 処理中...\r`);
    }
  }

  console.log(`\nシミュレーション完了: ${dayCount}日間`);
  console.log('');

  // ============================================================
  // 結果分析
  // ============================================================

  const finalPlayerSchool = world.schools.find((s) => s.id === world.playerSchoolId)!;
  const finalPlayers = finalPlayerSchool.players;

  // --- 成長バランス分析 ---
  console.log('='.repeat(60));
  console.log('【成長バランス】');
  console.log('='.repeat(60));

  const finalAvg = avgStats(finalPlayers);
  const growthDelta = {
    overall: finalAvg.overall - initialAvg.overall,
    contact: finalAvg.contact - initialAvg.contact,
    power: finalAvg.power - initialAvg.power,
  };

  console.log(`1年終了時 自校平均能力値:`);
  console.log(`  overall: ${finalAvg.overall.toFixed(1)} (初期: ${initialAvg.overall.toFixed(1)}, Δ${growthDelta.overall > 0 ? '+' : ''}${growthDelta.overall.toFixed(1)})`);
  console.log(`  contact: ${finalAvg.contact.toFixed(1)} (Δ${growthDelta.contact > 0 ? '+' : ''}${growthDelta.contact.toFixed(1)})`);
  console.log(`  power:   ${finalAvg.power.toFixed(1)} (Δ${growthDelta.power > 0 ? '+' : ''}${growthDelta.power.toFixed(1)})`);
  console.log('');

  // 学年別分析（初期状態は卒業済みで学年が変わっているため、在籍者のみ）
  const yr1Players = finalPlayers.filter((p) => computeGrade(p, world.currentDate.year) === 1);
  const yr2Players = finalPlayers.filter((p) => computeGrade(p, world.currentDate.year) === 2);
  const yr3Players = finalPlayers.filter((p) => computeGrade(p, world.currentDate.year) === 3);

  console.log(`学年別能力値分布 (Year ${world.currentDate.year}):`);
  if (yr1Players.length > 0) {
    const a = avgStats(yr1Players);
    console.log(`  1年生 (${yr1Players.length}人): overall=${a.overall.toFixed(1)}`);
  }
  if (yr2Players.length > 0) {
    const a = avgStats(yr2Players);
    console.log(`  2年生 (${yr2Players.length}人): overall=${a.overall.toFixed(1)}`);
  }
  if (yr3Players.length > 0) {
    const a = avgStats(yr3Players);
    console.log(`  3年生 (${yr3Players.length}人): overall=${a.overall.toFixed(1)}`);
  }
  console.log('');

  // エース分析
  const pitchers = finalPlayers.filter((p) => p.stats.pitching !== null);
  if (pitchers.length > 0) {
    const ace = pitchers.reduce((best, p) => computePlayerOverall(p) > computePlayerOverall(best) ? p : best);
    const aceInitial = initialOveralls.find((o) => o.id === ace.id);
    const aceGrowth = aceInitial ? computePlayerOverall(ace) - aceInitial.overall : null;
    console.log(`エース (${ace.lastName}${ace.firstName}):`);
    console.log(`  overall: ${computePlayerOverall(ace)} ${aceGrowth !== null ? `(成長 ${aceGrowth > 0 ? '+' : ''}${aceGrowth})` : '(新入生)'}`);
    if (ace.stats.pitching) {
      console.log(`  球速: ${ace.stats.pitching.velocity}km/h, 制球: ${ace.stats.pitching.control}, スタミナ: ${ace.stats.pitching.pitchStamina}`);
    }
  }
  console.log('');

  // 成長が速い/遅い選手
  const growthComparisons = initialOveralls
    .map((init) => {
      const finalPlayer = finalPlayers.find((p) => p.id === init.id);
      if (!finalPlayer) return null;
      return { ...init, finalOverall: computePlayerOverall(finalPlayer), delta: computePlayerOverall(finalPlayer) - init.overall };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (growthComparisons.length > 0) {
    const fastGrowers = growthComparisons.filter((x) => x.delta > 10).length;
    const slowGrowers = growthComparisons.filter((x) => x.delta < 2).length;
    const total = growthComparisons.length;
    console.log(`成長速度分析 (在籍継続者 ${total}人):`);
    console.log(`  速成長 (Δ>10): ${fastGrowers}人 (${(fastGrowers / total * 100).toFixed(1)}%)`);
    console.log(`  遅成長 (Δ<2):  ${slowGrowers}人 (${(slowGrowers / total * 100).toFixed(1)}%)`);
    const avgDelta = growthComparisons.reduce((s, x) => s + x.delta, 0) / total;
    console.log(`  平均成長: Δ${avgDelta > 0 ? '+' : ''}${avgDelta.toFixed(1)}`);
  }
  console.log('');

  // --- スカウト・進学バランス ---
  console.log('='.repeat(60));
  console.log('【スカウト・進学バランス】');
  console.log('='.repeat(60));

  const allSchoolPlayerCounts = world.schools.map((s) => s.players.length).sort((a, b) => a - b);
  const minCount = allSchoolPlayerCounts[0];
  const maxCount = allSchoolPlayerCounts[allSchoolPlayerCounts.length - 1];
  const avgCount = allSchoolPlayerCounts.reduce((s, n) => s + n, 0) / allSchoolPlayerCounts.length;
  const topSchools = world.schools.sort((a, b) => b.reputation - a.reputation).slice(0, 5);

  console.log(`全校選手数分布:`);
  console.log(`  最小: ${minCount}人, 最大: ${maxCount}人, 平均: ${avgCount.toFixed(1)}人`);
  console.log(`  9人未満チーム: ${allSchoolPlayerCounts.filter((n) => n < 9).length}校`);
  console.log('');
  console.log(`名門校（評判上位5校）の選手数:`);
  for (const school of topSchools) {
    console.log(`  ${school.name} (評判${school.reputation}): ${school.players.length}人`);
  }
  console.log('');

  // 中学生プール状況
  const ms3 = world.middleSchoolPool.filter((ms) => ms.middleSchoolGrade === 3);
  const ms2 = world.middleSchoolPool.filter((ms) => ms.middleSchoolGrade === 2);
  const ms1 = world.middleSchoolPool.filter((ms) => ms.middleSchoolGrade === 1);
  const msWithTarget = world.middleSchoolPool.filter((ms) => ms.targetSchoolId !== null);
  const msRecruited = world.middleSchoolPool.filter((ms) => ms.targetSchoolId === world.playerSchoolId);

  console.log(`中学生プール:`);
  console.log(`  総数: ${world.middleSchoolPool.length}人 (1年:${ms1.length} 2年:${ms2.length} 3年:${ms3.length})`);
  console.log(`  進学先確定済: ${msWithTarget.length}人`);
  console.log(`  自校への入学確定: ${msRecruited.length}人`);
  console.log('');

  // スカウト成功率
  const recruitAttempts = world.scoutState.recruitAttempts;
  let successCount = 0;
  let failCount = 0;
  for (const [, result] of recruitAttempts) {
    if (result.success) successCount++;
    else failCount++;
  }
  const totalAttempts = successCount + failCount;
  console.log(`スカウト勧誘:`);
  console.log(`  試行回数: ${totalAttempts}回`);
  if (totalAttempts > 0) {
    console.log(`  成功率: ${(successCount / totalAttempts * 100).toFixed(1)}% (${successCount}/${totalAttempts})`);
  }
  console.log('');

  // --- ドラフト・進路バランス ---
  console.log('='.repeat(60));
  console.log('【ドラフト・進路バランス】');
  console.log('='.repeat(60));

  // 年度替わり直後(Year 2, April 1)なので、新しい現在年度で3年生をカウント
  // 実際のドラフトは year-transition 内で currentYear = date.year で実行される
  const draftCandidates = identifyDraftCandidates(world, world.currentDate.year); // 現在年度の3年生
  const sCandidates = draftCandidates.filter((c) => c.scoutRating === 'S').length;
  const aCandidates = draftCandidates.filter((c) => c.scoutRating === 'A').length;
  const bCandidates = draftCandidates.filter((c) => c.scoutRating === 'B').length;

  console.log(`ドラフト候補（現3年生）:`);
  console.log(`  総候補数: ${draftCandidates.length}人`);
  console.log(`  S級: ${sCandidates}人, A級: ${aCandidates}人, B級: ${bCandidates}人`);
  console.log('');

  // OB情報
  const graduates: { type: string }[] = [];
  for (const [, entry] of world.personRegistry.entries) {
    if (entry.graduateSummary) {
      graduates.push({ type: entry.graduateSummary.careerPath.type });
    }
  }
  const proCount = graduates.filter((g) => g.type === 'pro').length;
  const uniCount = graduates.filter((g) => g.type === 'university').length;
  const corpCount = graduates.filter((g) => g.type === 'corporate').length;
  const retireCount = graduates.filter((g) => g.type === 'retire').length;

  console.log(`卒業生進路 (1年間):`);
  console.log(`  総卒業生: ${graduates.length}人`);
  console.log(`  プロ: ${proCount}人, 大学: ${uniCount}人, 社会人: ${corpCount}人, 引退: ${retireCount}人`);
  console.log('');

  // --- ニュース生成 ---
  console.log('='.repeat(60));
  console.log('【ニュース生成】');
  console.log('='.repeat(60));

  console.log(`1年間のニュース:`);
  console.log(`  総ニュース数: ${newsCount}件`);
  console.log(`  ニュースなし日: ${daysWithoutNews}日 (${(daysWithoutNews / dayCount * 100).toFixed(1)}%)`);
  console.log(`  ニュース種別:`);
  for (const [type, count] of Object.entries(newsTypeCounts)) {
    console.log(`    ${type}: ${count}件`);
  }
  console.log(`  重要度:`);
  console.log(`    高: ${newsImportanceCounts.high}件, 中: ${newsImportanceCounts.medium}件, 低: ${newsImportanceCounts.low}件`);
  console.log('');

  // --- 選手数推移 ---
  console.log('='.repeat(60));
  console.log('【選手数推移（月別）】');
  console.log('='.repeat(60));
  for (const { month, count } of monthlyPlayerCounts) {
    const bar = '█'.repeat(Math.round(count / 2));
    console.log(`  ${month}月: ${count}人 ${bar}`);
  }
  console.log('');

  // --- 総合評価 ---
  console.log('='.repeat(60));
  console.log('【総合評価】');
  console.log('='.repeat(60));

  const issues: string[] = [];
  const ok: string[] = [];

  // 成長チェック
  if (growthComparisons.length > 0) {
    const avgDelta = growthComparisons.reduce((s, x) => s + x.delta, 0) / growthComparisons.length;
    if (avgDelta > 15) issues.push(`成長が速すぎる (平均Δ${avgDelta.toFixed(1)})`);
    else if (avgDelta < 3) issues.push(`成長が遅すぎる (平均Δ${avgDelta.toFixed(1)})`);
    else ok.push(`成長速度は適正 (平均Δ${avgDelta.toFixed(1)})`);
  }

  // チーム人数チェック
  const underpopulated = allSchoolPlayerCounts.filter((n) => n < 9).length;
  if (underpopulated > 0) issues.push(`9人未満チームが${underpopulated}校ある`);
  else ok.push('全校が9人以上確保できている');

  // ニュースチェック
  const noNewsRate = daysWithoutNews / dayCount;
  if (noNewsRate > 0.7) issues.push(`ニュースなし日が多すぎる (${(noNewsRate * 100).toFixed(1)}%)`);
  else ok.push(`ニュース生成率 ${(100 - noNewsRate * 100).toFixed(1)}%`);

  // ドラフトチェック
  if (draftCandidates.length === 0) issues.push('ドラフト候補がゼロ');
  else if (proCount === 0) issues.push('プロ入りがゼロ');
  else ok.push(`ドラフト: ${proCount}人がプロ入り`);

  console.log('問題点:');
  if (issues.length === 0) console.log('  なし ✓');
  else for (const issue of issues) console.log(`  ⚠ ${issue}`);

  console.log('正常:');
  for (const item of ok) console.log(`  ✓ ${item}`);

  console.log('');
  console.log('プレイテスト完了!');
}

main().catch((err) => {
  console.error('エラー:', err);
  process.exit(1);
});
