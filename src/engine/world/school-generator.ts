/**
 * school-generator — 48校の初期生成
 *
 * generateAISchools(playerSchool, rng): HighSchool[]
 *   - 自校1 + AI校47 = 48校
 *   - 各校に20-25人の選手を配置
 *   - CoachStyle をランダム生成
 *   - reputation を 20-95 の範囲で分布
 *     強豪校: reputation 70+, 中堅: 40-70, 弱小: 20-40
 */

import type { RNG } from '../core/rng';
import type { HighSchool, TeamSummary } from './world-state';
import type { CoachStyle } from './person-blueprint';
import type { FacilityLevel, Lineup } from '../types/team';
import type { Player } from '../types/player';
import { generatePlayer } from '../player/generate';
import { autoGenerateLineup } from '../team/lineup';
import { createEmptyYearResults } from './world-state';

// ============================================================
// 定数
// ============================================================

const PREFECTURE_SCHOOL_SUFFIXES = [
  '高校', '高等学校', '工業高校', '商業高校', '農業高校',
  '第一高校', '第二高校', '北高校', '南高校', '東高校',
  '西高校', '中央高校', '附属高校', '学院高校', '大学附属高校',
];

const SCHOOL_FIRST_NAMES = [
  '明訓', '白新', '甲子園', '徳島商', '星稜', '桐生',
  '高知商', '智弁', '帝京', '日大三', '横浜', '駒大苫小牧',
  '早稲田実業', 'PL学園', '池田', '津久見', '銚子商', '東邦',
  '中京', '報徳学園', '育英', '拓大紅陵', '関西', '松山商',
  '鳴門', '古川商', '仙台育英', '東北', '光星学院', '聖光学院',
  '前橋育英', '健大高崎', '浦和学院', '花咲徳栄', '木更津総合',
  '創志学園', '明石商', '大阪桐蔭', '履正社', '花園',
  '龍谷大平安', '立命館宇治', '近江', '福知山成美', '鳥羽',
  '天理', '智弁和歌山', '市立和歌山', '桐蔭',
];

// ============================================================
// 短縮名生成
// ============================================================

/**
 * 接尾辞パターン（除外対象）
 * 例: 「大阪桐蔭高等学校」→「大阪桐蔭」を短縮
 */
const SCHOOL_SUFFIXES_TO_STRIP = [
  '大学附属高等学校', '大学附属高校',
  '高等学校', '高校',
  '工業高校', '商業高校', '農業高校',
  '第一高校', '第二高校', '北高校', '南高校', '東高校', '西高校',
  '中央高校', '附属高校', '学院高校',
  '中学校', '中学',
  '学園', '学院',
];

/**
 * 学校名から3文字の短縮表記を生成する。
 *
 * アルゴリズム:
 * 1. 既知の接尾辞を除去して「コア名」を得る
 * 2. コア名の先頭3文字を返す
 * 3. コア名が3文字未満ならコア名をそのまま返す
 *
 * 例:
 *   「大阪桐蔭高等学校」→ コア「大阪桐蔭」→ 「大阪桐」
 *   「PL学園」          → コア「PL」         → 「PL」
 *   「帝京高校」        → コア「帝京」        → 「帝京」
 *   「明訓高校」        → コア「明訓」        → 「明訓」
 */
export function generateSchoolShortName(name: string): string {
  let core = name;
  // 長い接尾辞から順に試して除去（最初にマッチしたものを使う）
  for (const suffix of SCHOOL_SUFFIXES_TO_STRIP) {
    if (core.endsWith(suffix)) {
      core = core.slice(0, core.length - suffix.length);
      break;
    }
  }
  if (core.length === 0) {
    // 接尾辞だけで構成されていた場合はフォールバック
    return name.slice(0, 3);
  }
  return core.slice(0, 3);
}

// ============================================================
// ヘルパー
// ============================================================

function randomCoachStyle(rng: RNG): CoachStyle {
  const offenseTypes: CoachStyle['offenseType'][] = ['power', 'speed', 'balanced', 'bunt_heavy'];
  const defenseTypes: CoachStyle['defenseType'][] = ['ace_centric', 'relay', 'balanced'];
  const practiceTypes: CoachStyle['practiceEmphasis'][] = ['batting', 'pitching', 'defense', 'balanced'];

  return {
    offenseType: rng.pick(offenseTypes),
    defenseType: rng.pick(defenseTypes),
    practiceEmphasis: rng.pick(practiceTypes),
    aggressiveness: rng.intBetween(20, 90),
  };
}

function randomFacilities(rng: RNG, reputation: number): FacilityLevel {
  // 評判が高い学校ほど施設が良い傾向
  const base = Math.floor(reputation / 20); // 0-5
  return {
    ground:      Math.max(1, Math.min(10, base + rng.intBetween(0, 3))),
    bullpen:     Math.max(1, Math.min(10, base + rng.intBetween(0, 3))),
    battingCage: Math.max(1, Math.min(10, base + rng.intBetween(0, 3))),
    gym:         Math.max(1, Math.min(10, base + rng.intBetween(0, 3))),
  };
}

function computeTeamSummary(id: string, name: string, players: Player[]): TeamSummary {
  if (players.length === 0) {
    return { id, name, strength: 20, aceStrength: 20, battingStrength: 20, defenseStrength: 20 };
  }

  const batAvg = players.reduce((acc, p) => {
    return acc + (p.stats.batting.contact + p.stats.batting.power + p.stats.batting.eye + p.stats.batting.technique) / 4;
  }, 0) / players.length;

  const pitchers = players.filter((p) => p.stats.pitching !== null);
  const aceStrength = pitchers.length > 0
    ? Math.max(...pitchers.map((p) => {
        const pit = p.stats.pitching!;
        return ((pit.velocity - 80) / 80 * 100 + pit.control + pit.pitchStamina) / 3;
      }))
    : batAvg * 0.6;

  const defenseAvg = players.reduce((acc, p) => acc + (p.stats.base.fielding + p.stats.base.armStrength) / 2, 0) / players.length;

  return {
    id,
    name,
    strength: Math.round((batAvg + aceStrength + defenseAvg) / 3),
    aceStrength: Math.round(aceStrength),
    battingStrength: Math.round(batAvg),
    defenseStrength: Math.round(defenseAvg),
  };
}

/**
 * 1校分の選手を生成する。
 */
function generateSchoolPlayers(
  schoolId: string,
  reputation: number,
  enrollmentYear: number,
  rng: RNG,
): Player[] {
  // 3学年分: 1年生は enrollmentYear, 2年生は -1, 3年生は -2
  const totalCount = rng.intBetween(20, 25);
  // 学年ごとに均等配分 + ランダム
  const yr1Count = Math.round(totalCount / 3);
  const yr2Count = Math.round(totalCount / 3);
  const yr3Count = totalCount - yr1Count - yr2Count;

  const players: Player[] = [];

  for (let i = 0; i < yr1Count; i++) {
    const p = generatePlayer(rng.derive(`yr1-${i}`), { enrollmentYear, schoolReputation: reputation });
    players.push({ ...p, enrollmentYear });
  }
  for (let i = 0; i < yr2Count; i++) {
    const p = generatePlayer(rng.derive(`yr2-${i}`), { enrollmentYear: enrollmentYear - 1, schoolReputation: reputation });
    players.push({ ...p, enrollmentYear: enrollmentYear - 1 });
  }
  for (let i = 0; i < yr3Count; i++) {
    const p = generatePlayer(rng.derive(`yr3-${i}`), { enrollmentYear: enrollmentYear - 2, schoolReputation: reputation });
    players.push({ ...p, enrollmentYear: enrollmentYear - 2 });
  }

  return players;
}

// ============================================================
// 公開 API
// ============================================================

/**
 * AI 校を47校生成する。
 * 学校名は SCHOOL_FIRST_NAMES から優先的に使用し、
 * 超過分は prefecture + 番号ベースで生成する。
 */
export function generateAISchools(
  playerSchool: HighSchool,
  prefecture: string,
  initialYear: number,
  rng: RNG,
): HighSchool[] {
  const schools: HighSchool[] = [];

  // 評判の分布: 強豪5校(70-95), 中堅20校(40-70), 弱小22校(20-40)
  const reputationDistribution: number[] = [];
  for (let i = 0; i < 5; i++)  reputationDistribution.push(rng.intBetween(70, 95));
  for (let i = 0; i < 20; i++) reputationDistribution.push(rng.intBetween(40, 70));
  for (let i = 0; i < 22; i++) reputationDistribution.push(rng.intBetween(20, 40));
  // シャッフル
  for (let i = reputationDistribution.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [reputationDistribution[i], reputationDistribution[j]] = [reputationDistribution[j], reputationDistribution[i]];
  }

  const usedNames = new Set<string>([playerSchool.name]);
  const names = [...SCHOOL_FIRST_NAMES];

  for (let i = 0; i < 47; i++) {
    const schoolRng = rng.derive(`ai-school-${i}`);
    const reputation = reputationDistribution[i];

    // 名前の決定
    let name: string;
    let nameAttempts = 0;
    do {
      if (names.length > 0) {
        const idx = Math.floor(schoolRng.next() * names.length);
        const base = names[idx];
        const suffix = schoolRng.pick(PREFECTURE_SCHOOL_SUFFIXES);
        name = base + suffix;
        names.splice(idx, 1);
      } else {
        name = `${prefecture}${i + 1}番高校`;
      }
      nameAttempts++;
    } while (usedNames.has(name) && nameAttempts < 20);

    usedNames.add(name);

    const id = `school-ai-${i + 1}`;
    const facilities = randomFacilities(schoolRng, reputation);
    const players = generateSchoolPlayers(id, reputation, initialYear, schoolRng.derive('players'));
    const coachStyle = randomCoachStyle(schoolRng);

    const fakeTeam = { id, name, prefecture, reputation, players, lineup: null, facilities };
    const lineup: Lineup | null = players.length >= 9
      ? autoGenerateLineup(fakeTeam, initialYear)
      : null;

    const school: HighSchool = {
      id,
      name,
      prefecture,
      reputation,
      players,
      lineup,
      facilities,
      simulationTier: 'minimal',
      coachStyle,
      yearResults: createEmptyYearResults(),
      shortName: generateSchoolShortName(name),
      _summary: null,
    };

    schools.push(school);
  }

  // トップ3強豪を standard tier に昇格
  const top3 = [...schools]
    .sort((a, b) => b.reputation - a.reputation)
    .slice(0, 3);
  for (const topSchool of top3) {
    const idx = schools.findIndex((s) => s.id === topSchool.id);
    if (idx >= 0) {
      schools[idx] = { ...schools[idx], simulationTier: 'standard' };
    }
  }

  return schools;
}
