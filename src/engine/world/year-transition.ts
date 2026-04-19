/**
 * year-transition — 年度替わりトランザクション処理
 *
 * 3月31日 → 4月1日の遷移時に呼び出す。
 * 処理順序（DESIGN-PHASE3-WORLD.md §6.4 準拠）:
 *   Step 0: スナップショットセーブ（ログのみ）
 *   Step 1: 全高校の3年生の進路決定
 *   Step 2: 全高校の3年生の卒業処理（GraduateRecord → personRegistry）
 *   Step 3: 全中学3年生の高校入学処理
 *   Step 4: 中学生の進級 + 新中学1年生の生成（180人/学年）
 *   Step 5: 全高校のラインナップ再構成
 *   Step 6: 学校評判の更新
 *   Step 7: シーズン状態リセット
 *   Step 8: Tier 更新
 */

import type { RNG } from '../core/rng';
import type {
  WorldState, HighSchool, MiddleSchoolPlayer,
} from './world-state';
import type { PersonRegistryEntry, CareerPath, GraduateSummary } from './person-state';
import type { Player } from '../types/player';
import type { FacilityLevel } from '../types/team';
import {
  createEmptyYearResults,
  createInitialSeasonState,
  createInitialScoutState,
} from './world-state';
import { autoGenerateLineup } from '../team/lineup';
import { generatePlayer } from '../player/generate';
import { updateSimulationTiers } from './tier-manager';
import { convertToHighSchoolPlayer } from './hydrate';
import {
  computeMiddleSchoolOverall,
  runAISchoolScouting,
} from './scout/scout-system';
import {
  computePlayerOverall,
  identifyDraftCandidates,
  executeDraft,
  determineCareerPath,
} from './career/draft-system';

// ============================================================
// 定数
// ============================================================

// 1学年あたり新入生数。48校に年間入学する中学3年生の総数に合わせる。
// 目標: 1校あたり 6〜8 人/年入学 → 48校×7人 = 336 → 余裕を持たせて 360
// 均衡条件: 新入生360人 ≒ 卒業生360人（48校×7.5人）
// 従来: 180 → 48校で割ると3.75人/校 → 3年生卒業7人/校と釣り合わなかった
// 修正: 360 → 7.5人/校 → 年間収支がほぼ均衡
const NEW_MIDDLE_SCHOOLERS_PER_GRADE = 360;
const MIN_PLAYERS_PER_SCHOOL = 9; // 試合に必要な最低人数
const MAX_PLAYERS_PER_SCHOOL = 25;

// ============================================================
// Step 1: 進路決定
// ============================================================

/**
 * 5要素スコアリングを使って進学先を計算する。
 * 返り値は学校ごとのスコア（高いほど選ばれやすい）。
 *
 * 1. 学校評判          (weight: 30%) — 有力選手ほど名門に行きやすい
 * 2. スカウト状況       (weight: 25%) — 勧誘済みは対象校に確定傾向
 * 3. 地元志向          (weight: 20%) — 同県内の学校に偏る
 * 4. 名門志向          (weight: 15%) — 有力選手は強豪校を好む
 * 5. 相性              (weight: 10%) — CoachStyle とプレイヤー特性の相性
 */
function calculateEnrollmentScore(
  msPlayer: MiddleSchoolPlayer,
  school: HighSchool,
  rng: RNG,
): number {
  const playerOverall = computeMiddleSchoolOverall(msPlayer);
  let score = 0;

  // 1. 学校評判 (30%)
  // 有力選手ほど名門に行きやすいので、選手の能力との乗算
  const reputationFactor = school.reputation * (playerOverall / 50);
  score += reputationFactor * 0.30;

  // 2. スカウト状況 (25%)
  // プレイヤー校が勧誘済み or targetSchoolId で確定
  if (msPlayer.targetSchoolId === school.id) {
    score += 200; // 確定的に選ばれる（非常に高いスコア）
  } else if (msPlayer.scoutedBy.includes(school.id)) {
    score += 100 * 0.25;
  }

  // 3. 地元志向 (20%)
  if (msPlayer.prefecture === school.prefecture) {
    score += 80 * 0.20;
  }

  // 4. 名門志向 (15%)
  if (school.reputation > 70 && playerOverall > 30) {
    score += 60 * 0.15;
  }

  // 5. 相性 (10%)
  const compatibility = calculateCoachCompatibility(msPlayer, school);
  score += compatibility * 0.10;

  // ランダム要素（±10）
  score += (rng.next() - 0.5) * 20;

  return Math.max(0, score);
}

/**
 * CoachStyle と中学生の特性の相性を計算する（0-100）。
 * 現時点ではメンタル・スピードを簡易指標として使用。
 */
function calculateCoachCompatibility(
  ms: MiddleSchoolPlayer,
  school: HighSchool,
): number {
  const b = ms.currentStats.base;
  const bat = ms.currentStats.batting;
  const style = school.coachStyle;

  let score = 50; // ベース

  // パワー系チームにはパワーのある選手が合う
  if (style.offenseType === 'power' && bat.power >= 20) score += 20;
  if (style.offenseType === 'speed' && b.speed >= 20)   score += 20;

  // 打撃重視チームにはコンタクト型
  if (style.practiceEmphasis === 'batting' && bat.contact >= 20) score += 15;

  // aggressiveness が高いチームは精神力の高い選手と相性がいい
  if (style.aggressiveness >= 70 && b.mental >= 20) score += 15;

  return Math.min(100, score);
}

// ============================================================
// Step 2: 卒業処理
// ============================================================

function graduateSeniors(
  school: HighSchool,
  currentYear: number,
  draftResultMap: Map<string, import('./career/draft-system').DraftResult>,
  rng: RNG,
): {
  school: HighSchool;
  graduatedIds: string[];
  careerPaths: Map<string, CareerPath>;
  graduateSummaries: GraduateSummary[];
} {
  const seniors = school.players.filter((p) => {
    const grade = currentYear - p.enrollmentYear + 1;
    return grade >= 3;
  });

  const graduatedIds = seniors.map((p) => p.id);
  const careerPaths = new Map<string, CareerPath>();
  const graduateSummaries: GraduateSummary[] = [];

  for (const s of seniors) {
    const draftResult = draftResultMap.get(s.id) ?? null;
    const careerPath = determineCareerPath(s, school, draftResult, rng.derive(s.id));
    careerPaths.set(s.id, careerPath);

    // GraduateSummary を作成
    const overall = computePlayerOverall(s);
    const achievements: string[] = [];
    if (draftResult?.picked && draftResult.negotiationSuccess) {
      achievements.push(`ドラフト${draftResult.round}位指名`);
    }
    if (school.yearResults.koshienAppearance) {
      achievements.push('甲子園出場');
    }
    if (school.yearResults.summerBestRound >= 3) {
      achievements.push(`夏大会ベスト${Math.pow(2, 7 - school.yearResults.summerBestRound)}強`);
    }

    graduateSummaries.push({
      personId: s.id,
      name: `${s.lastName}${s.firstName}`,
      finalStats: s.stats,
      finalOverall: overall,
      schoolId: school.id,
      schoolName: school.name,
      graduationYear: currentYear,
      careerPath,
      achievements,
    });
  }

  const remainingPlayers = school.players.filter((p) => {
    const grade = currentYear - p.enrollmentYear + 1;
    return grade < 3;
  });

  return {
    school: { ...school, players: remainingPlayers },
    graduatedIds,
    careerPaths,
    graduateSummaries,
  };
}

// ============================================================
// Step 3: 中学3年生の高校入学
// ============================================================

/**
 * 中学3年生を各高校に配分する。
 *
 * 改善版: 5要素スコアリング（calculateEnrollmentScore）を使用。
 * - targetSchoolId が確定済みの場合はそちらを最優先
 * - それ以外はスコアリングに基づく確率的な配分
 * - 各校の定員（MAX_PLAYERS_PER_SCHOOL）を守る
 */
function assignMiddleSchoolersToHighSchools(
  seniors: MiddleSchoolPlayer[],
  schools: HighSchool[],
  rng: RNG,
): Map<string, string> { // msPlayerId → schoolId
  const assignment = new Map<string, string>();
  const schoolCount = new Map<string, number>();

  for (const school of schools) {
    schoolCount.set(school.id, 0);
  }

  for (const ms of seniors) {
    // targetSchoolId が確定済みなら優先（スカウト勧誘成功）
    if (ms.targetSchoolId) {
      const target = schools.find((s) => s.id === ms.targetSchoolId);
      if (target) {
        const current = schoolCount.get(target.id) ?? 0;
        if (current < MAX_PLAYERS_PER_SCHOOL) {
          assignment.set(ms.id, target.id);
          schoolCount.set(target.id, current + 1);
          continue;
        }
        // 定員オーバーの場合はスコアリングにフォールスルー
      }
    }

    // 5要素スコアリングで各校のスコアを計算
    const msRng = rng.derive(`assign:${ms.id}`);
    const scores = schools.map((school) => ({
      school,
      score: calculateEnrollmentScore(ms, school, msRng),
    }));

    // 定員オーバーの学校を除外
    const available = scores.filter(
      ({ school }) => (schoolCount.get(school.id) ?? 0) < MAX_PLAYERS_PER_SCHOOL
    );

    if (available.length === 0) {
      // 全校定員オーバーは通常ありえないが安全策
      const fallback = schools.find((s) => (schoolCount.get(s.id) ?? 0) < MAX_PLAYERS_PER_SCHOOL);
      if (fallback) {
        assignment.set(ms.id, fallback.id);
        schoolCount.set(fallback.id, (schoolCount.get(fallback.id) ?? 0) + 1);
      }
      continue;
    }

    // スコアに比例した確率でソフトマックス的に選択
    const totalScore = available.reduce((sum, { score }) => sum + Math.max(0.1, score), 0);
    let pick = msRng.next() * totalScore;
    let selected = available[available.length - 1].school;

    for (const { school, score } of available) {
      pick -= Math.max(0.1, score);
      if (pick <= 0) {
        selected = school;
        break;
      }
    }

    assignment.set(ms.id, selected.id);
    schoolCount.set(selected.id, (schoolCount.get(selected.id) ?? 0) + 1);
  }

  return assignment;
}

// ============================================================
// Step 4: 新中学1年生生成
// ============================================================

function generateNewMiddleSchoolers(
  year: number,
  count: number,
  prefecture: string,
  rng: RNG,
): MiddleSchoolPlayer[] {
  const middleSchoolNames = [
    `${prefecture}第一中学`, `${prefecture}第二中学`, `${prefecture}北中学`,
    `${prefecture}南中学`, `${prefecture}東中学`, `${prefecture}西中学`,
    `${prefecture}中央中学`, `${prefecture}緑中学`, `${prefecture}桜中学`,
    `${prefecture}若葉中学`, `${prefecture}港中学`, `${prefecture}山田中学`,
  ];

  const players: MiddleSchoolPlayer[] = [];

  for (let i = 0; i < count; i++) {
    const playerRng = rng.derive(`ms-new-${year}-${i}`);
    // 能力値は平均 10 で生成（中学1年生なので低め）
    const contactBase = Math.max(1, Math.min(30, Math.round(playerRng.gaussian(10, 4))));
    const stats = {
      base: {
        stamina:     Math.max(1, Math.min(30, Math.round(playerRng.gaussian(10, 4)))),
        speed:       Math.max(1, Math.min(30, Math.round(playerRng.gaussian(10, 4)))),
        armStrength: Math.max(1, Math.min(30, Math.round(playerRng.gaussian(8, 4)))),
        fielding:    Math.max(1, Math.min(30, Math.round(playerRng.gaussian(8, 4)))),
        focus:       Math.max(1, Math.min(30, Math.round(playerRng.gaussian(10, 4)))),
        mental:      Math.max(1, Math.min(30, Math.round(playerRng.gaussian(10, 4)))),
      },
      batting: {
        contact:   contactBase,
        power:     Math.max(1, Math.min(30, Math.round(playerRng.gaussian(8, 4)))),
        eye:       Math.max(1, Math.min(30, Math.round(playerRng.gaussian(8, 4)))),
        technique: Math.max(1, Math.min(30, Math.round(playerRng.gaussian(8, 4)))),
      },
      pitching: null,
    };

    const firstName = pickFirstName(playerRng);
    const lastName = pickLastName(playerRng);
    const schoolName = playerRng.pick(middleSchoolNames);

    players.push({
      id: `ms-${year}-${i}-${playerRng.intBetween(1000, 9999)}`,
      firstName,
      lastName,
      middleSchoolGrade: 1,
      middleSchoolName: schoolName,
      prefecture,
      currentStats: stats,
      targetSchoolId: null,
      scoutedBy: [],
    });
  }

  return players;
}

// 名前生成（player/generate.ts から独立したシンプル版）
const LAST_NAMES = ['田中', '山田', '佐藤', '鈴木', '高橋', '渡辺', '伊藤', '中村', '小林', '加藤',
                    '吉田', '山本', '松本', '井上', '木村', '林', '斎藤', '清水', '山口', '阿部',
                    '池田', '橋本', '山崎', '藤田', '後藤', '石川', '前田', '小川', '岡田', '長谷川'];
const FIRST_NAMES = ['太郎', '次郎', '三郎', '健太', '翔', '大輝', '拓也', '裕也', '俊介', '雄大',
                     '直樹', '剛', '昂', '颯', '壮', '蓮', '悠', '隼', '岳', '豪',
                     '駿', '海', '航', '空', '光', '優', '雅', '智', '誠', '徹'];

function pickLastName(rng: RNG): string {
  return rng.pick(LAST_NAMES);
}

function pickFirstName(rng: RNG): string {
  return rng.pick(FIRST_NAMES);
}

// ============================================================
// Step 6: 評判更新
// ============================================================

function updateReputation(
  school: HighSchool,
  rng: RNG,
): number {
  const yr = school.yearResults;
  let delta = 0;

  // 夏の大会成績
  if (yr.summerBestRound >= 4) delta += 3;       // 準決勝以上
  else if (yr.summerBestRound >= 3) delta += 1;   // 8強

  // 秋の大会成績
  if (yr.autumnBestRound >= 3) delta += 1;

  // 甲子園出場
  if (yr.koshienAppearance) delta += 5;
  if (yr.koshienBestRound >= 2) delta += 3;

  // プロ排出
  delta += yr.proPlayersDrafted * 2;

  // 小さなランダム変動 ±2
  delta += rng.intBetween(-2, 2);

  return Math.max(1, Math.min(100, school.reputation + delta));
}

// ============================================================
// メイン: processYearTransition
// ============================================================

/**
 * 年度替わり処理（トランザクション）。
 * 3月31日→4月1日の遷移時に advanceWorldDay から呼び出す。
 */
export function processYearTransition(world: WorldState, rng: RNG): WorldState {
  const currentYear = world.currentDate.year;
  console.log(`[year-transition] 年度替わり処理開始: Year ${currentYear} → Year ${currentYear + 1}`);

  // ============================================================
  // 保険: 完了済み activeTournament が残っていたら履歴に移動して null 化
  // simulateTournament() アクションや completeInteractiveMatch の後処理漏れで
  // isCompleted=true のまま activeTournament が残ることがある（異常セーブ救済）。
  // ============================================================
  let worldForTransition = world;
  if (worldForTransition.activeTournament && worldForTransition.activeTournament.isCompleted) {
    const stale = worldForTransition.activeTournament;
    const existingHistory = worldForTransition.tournamentHistory ?? [];
    const alreadyInHistory = existingHistory.some((t) => t.id === stale.id);
    const newHistory = alreadyInHistory ? existingHistory : [...existingHistory, stale].slice(-10);
    worldForTransition = {
      ...worldForTransition,
      activeTournament: null,
      tournamentHistory: newHistory,
    };
    console.log(`[year-transition] 保険: 完了済み activeTournament (${stale.id}) をクリーンアップ`);
  }

  // ============================================================
  // Step 0: スナップショットセーブ（ログのみ）
  // ============================================================
  console.log(`[year-transition] Step 0: スナップショット（${worldForTransition.schools.length}校 / 選手${worldForTransition.schools.reduce((n, s) => n + s.players.length, 0)}人）`);

  // ============================================================
  // Step 0.5: 他校AIスカウト活動（プレイヤー未勧誘の選手を確保）
  // ============================================================
  const worldAfterAIScouting = runAISchoolScouting(worldForTransition, rng.derive('ai-scouting'));
  console.log(`[year-transition] Step 0.5: AI 校スカウト完了`);

  // ============================================================
  // Step 0.8: ドラフト実行（卒業前に進路を確定）
  // ============================================================
  const { results: draftResults } = executeDraft(
    worldAfterAIScouting,
    currentYear,
    rng.derive('draft'),
  );
  const draftResultMap = new Map(draftResults.map((r) => [r.playerId, r]));
  const proCount = draftResults.filter((r) => r.picked && r.negotiationSuccess).length;
  console.log(`[year-transition] Step 0.8: ドラフト完了 ${draftResults.length}人が候補 / ${proCount}人がプロ入り`);

  // ============================================================
  // Step 1 & 2: 全高校の3年生の進路決定 + 卒業処理
  // ============================================================
  const updatedSchools: HighSchool[] = [];
  const allGraduatedIds: string[] = [];
  const allGraduateSummaries: GraduateSummary[] = [];

  for (const school of worldAfterAIScouting.schools) {
    const { school: updatedSchool, graduatedIds, graduateSummaries } = graduateSeniors(
      school,
      currentYear,
      draftResultMap,
      rng.derive(`grad-${school.id}`),
    );
    updatedSchools.push(updatedSchool);
    allGraduatedIds.push(...graduatedIds);
    allGraduateSummaries.push(...graduateSummaries);
  }

  console.log(`[year-transition] Step 1/2: ${allGraduatedIds.length}人が卒業`);

  // ============================================================
  // Step 3: 全中学3年生の高校入学処理
  // ============================================================
  const seniors = worldAfterAIScouting.middleSchoolPool.filter((ms) => ms.middleSchoolGrade === 3);

  // 配分先決定（5要素スコアリング）
  const assignment = assignMiddleSchoolersToHighSchools(
    seniors,
    updatedSchools,
    rng.derive('enrollment'),
  );

  // 高校入学処理
  const schoolPlayerMap = new Map<string, Player[]>();
  for (const school of updatedSchools) {
    schoolPlayerMap.set(school.id, []);
  }

  for (const ms of seniors) {
    const targetId = assignment.get(ms.id);
    if (!targetId) continue;

    const targetSchool = updatedSchools.find((s) => s.id === targetId);
    if (!targetSchool) continue;

    // MiddleSchoolPlayer → Player 変換
    const newPlayer = convertToHighSchoolPlayer(
      ms,
      currentYear + 1, // 入学年度は翌年
      targetSchool.facilities,
      rng.derive(`convert-${ms.id}`),
    );

    const existing = schoolPlayerMap.get(targetId) ?? [];
    schoolPlayerMap.set(targetId, [...existing, newPlayer]);
  }

  // 各校に入学者を追加（最低3人保証）
  for (let i = 0; i < updatedSchools.length; i++) {
    const school = updatedSchools[i];
    const newPlayers = schoolPlayerMap.get(school.id) ?? [];

    // 既存選手 + 入学者を結合
    let updatedPlayers = [...school.players, ...newPlayers];

    // 最低 MIN_PLAYERS_PER_SCHOOL 人を保証
    if (updatedPlayers.length < MIN_PLAYERS_PER_SCHOOL) {
      const needed = MIN_PLAYERS_PER_SCHOOL - updatedPlayers.length;
      for (let j = 0; j < needed; j++) {
        const genPlayer = generatePlayer(rng.derive(`fill-${school.id}-${j}`), {
          enrollmentYear: currentYear + 1,
          schoolReputation: school.reputation,
        });
        updatedPlayers.push(genPlayer);
      }
    }

    updatedSchools[i] = { ...school, players: updatedPlayers };
  }

  // 中学3年生をプールから除去
  const remainingMiddleSchoolers = worldAfterAIScouting.middleSchoolPool.filter((ms) => ms.middleSchoolGrade !== 3);

  console.log(`[year-transition] Step 3: ${seniors.length}人が高校入学`);

  // ============================================================
  // Step 4: 中学生の進級 + 新中学1年生の生成
  // ============================================================

  // 既存中学生の進級
  const promotedMiddleSchoolers: MiddleSchoolPlayer[] = remainingMiddleSchoolers.map((ms) => ({
    ...ms,
    middleSchoolGrade: (ms.middleSchoolGrade + 1) as 1 | 2 | 3,
  }));

  // 新中学1年生の生成（180人）
  const newMiddleSchoolers = generateNewMiddleSchoolers(
    currentYear + 1,
    NEW_MIDDLE_SCHOOLERS_PER_GRADE,
    worldForTransition.prefecture,
    rng.derive('new-ms'),
  );

  const updatedMiddleSchoolPool: MiddleSchoolPlayer[] = [
    ...promotedMiddleSchoolers,
    ...newMiddleSchoolers,
  ];

  console.log(`[year-transition] Step 4: 中学生プール更新 ${updatedMiddleSchoolPool.length}人（新入生${newMiddleSchoolers.length}人）`);

  // ============================================================
  // Step 4.5: PersonRegistry に卒業生を記録
  // ============================================================
  const updatedRegistry = {
    entries: new Map(worldAfterAIScouting.personRegistry.entries),
  };

  const proPlayersThisYear = new Set<string>();
  for (const summary of allGraduateSummaries) {
    const entry: PersonRegistryEntry = {
      personId: summary.personId,
      retention: summary.careerPath.type === 'pro' ? 'tracked' : 'archived',
      stage: { type: 'graduated', year: currentYear, path: summary.careerPath },
      graduateSummary: summary,
    };
    updatedRegistry.entries.set(summary.personId, entry);
    if (summary.careerPath.type === 'pro') {
      proPlayersThisYear.add(summary.personId);
    }
  }

  // proPlayersDrafted を yearResults から更新
  const proCountBySchool = new Map<string, number>();
  for (const summary of allGraduateSummaries) {
    if (summary.careerPath.type === 'pro') {
      proCountBySchool.set(summary.schoolId, (proCountBySchool.get(summary.schoolId) ?? 0) + 1);
    }
  }
  for (let i = 0; i < updatedSchools.length; i++) {
    const proCount = proCountBySchool.get(updatedSchools[i].id) ?? 0;
    if (proCount > 0) {
      updatedSchools[i] = {
        ...updatedSchools[i],
        yearResults: { ...updatedSchools[i].yearResults, proPlayersDrafted: proCount },
      };
    }
  }

  console.log(`[year-transition] Step 4.5: PersonRegistry に${allGraduateSummaries.length}人を記録（プロ${proPlayersThisYear.size}人）`);

  // ============================================================
  // Step 5: 全高校のラインナップ再構成
  // ============================================================
  for (let i = 0; i < updatedSchools.length; i++) {
    const school = updatedSchools[i];
    if (school.players.length >= 9) {
      const newLineup = autoGenerateLineup(
        { id: school.id, name: school.name, prefecture: school.prefecture, reputation: school.reputation, players: school.players, lineup: null, facilities: school.facilities },
        currentYear + 1,
      );
      updatedSchools[i] = { ...school, lineup: newLineup };
    } else {
      updatedSchools[i] = { ...school, lineup: null };
    }
  }

  console.log(`[year-transition] Step 5: ラインナップ再構成完了`);

  // ============================================================
  // Step 6: 学校評判の更新
  // ============================================================
  for (let i = 0; i < updatedSchools.length; i++) {
    const newRep = updateReputation(updatedSchools[i], rng.derive(`rep-${updatedSchools[i].id}`));
    updatedSchools[i] = {
      ...updatedSchools[i],
      reputation: newRep,
      yearResults: createEmptyYearResults(),
    };
  }

  console.log(`[year-transition] Step 6: 評判更新完了`);

  // ============================================================
  // Step 7: シーズン状態リセット
  // ============================================================
  const newSeasonState = createInitialSeasonState();

  // ============================================================
  // Step 8: Tier 更新
  // ============================================================
  // 年度替わり時にスカウト月次カウンタをリセット
  const resetScoutState = worldAfterAIScouting.scoutState
    ? { ...worldAfterAIScouting.scoutState, usedScoutThisMonth: 0 }
    : createInitialScoutState();

  let nextWorld: WorldState = {
    ...worldAfterAIScouting,
    schools: updatedSchools,
    middleSchoolPool: updatedMiddleSchoolPool,
    personRegistry: updatedRegistry,
    seasonState: newSeasonState,
    scoutState: resetScoutState,
    manager: {
      ...worldAfterAIScouting.manager,
      yearsActive: worldAfterAIScouting.manager.yearsActive + 1,
    },
  };

  nextWorld = updateSimulationTiers(nextWorld, [], new Map());

  const totalPlayers = nextWorld.schools.reduce((n, s) => n + s.players.length, 0);
  console.log(`[year-transition] Step 8: Tier 更新完了。合計${totalPlayers}人の選手`);

  return nextWorld;
}
