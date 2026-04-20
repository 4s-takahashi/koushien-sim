/**
 * create-world — WorldState の初期化
 *
 * createWorldState(playerTeam, seed, rng): WorldState
 *   - 自校1 + AI校47 = 48校を生成
 *   - 中学生プール（3学年×180人 = 540人）の初期生成
 *   - PersonRegistry の初期化
 */

import type { RNG } from '../core/rng';
import type { Team, Manager } from '../types/team';
import type { GameState } from '../types/game-state';
import type { WorldState, HighSchool, MiddleSchoolPlayer, GameSettings } from './world-state';
import type { PersonRegistry } from './person-state';
import {
  createDefaultWeeklyPlan,
  createEmptyYearResults,
  createInitialSeasonState,
  createInitialScoutState,
} from './world-state';
import { generateAISchools, generateSchoolShortName } from './school-generator';

// ============================================================
// 定数
// ============================================================

const MIDDLE_SCHOOL_INITIAL_GRADES = [1, 2, 3] as const;
// 1学年あたり360人（year-transition.ts の NEW_MIDDLE_SCHOOLERS_PER_GRADE と同期）
// 目標: 48校に毎年7〜8人入学できる母集団（年間収支が均衡する量）
const MIDDLE_SCHOOLERS_PER_GRADE = 360;

// ============================================================
// 中学生プールの初期生成
// ============================================================

function generateInitialMiddleSchoolPool(
  year: number,
  prefecture: string,
  rng: RNG,
): MiddleSchoolPlayer[] {
  const pool: MiddleSchoolPlayer[] = [];
  const middleSchoolNames = [
    `${prefecture}第一中学`, `${prefecture}第二中学`, `${prefecture}北中学`,
    `${prefecture}南中学`, `${prefecture}東中学`, `${prefecture}西中学`,
    `${prefecture}中央中学`, `${prefecture}緑中学`, `${prefecture}桜中学`,
    `${prefecture}若葉中学`, `${prefecture}港中学`, `${prefecture}山田中学`,
  ];

  const LAST_NAMES = ['田中', '山田', '佐藤', '鈴木', '高橋', '渡辺', '伊藤', '中村', '小林', '加藤',
                      '吉田', '山本', '松本', '井上', '木村', '林', '斎藤', '清水', '山口', '阿部'];
  const FIRST_NAMES = ['太郎', '次郎', '三郎', '健太', '翔', '大輝', '拓也', '裕也', '俊介', '雄大',
                       '直樹', '剛', '昂', '颯', '壮', '蓮', '悠', '隼', '岳', '豪'];

  for (const grade of MIDDLE_SCHOOL_INITIAL_GRADES) {
    for (let i = 0; i < MIDDLE_SCHOOLERS_PER_GRADE; i++) {
      const msRng = rng.derive(`ms-init-${grade}-${i}`);

      // 学年が上がるほど能力値が高い
      const baseBonus = (grade - 1) * 5;
      const stats = {
        base: {
          stamina:     Math.max(1, Math.min(50, Math.round(msRng.gaussian(10 + baseBonus, 5)))),
          speed:       Math.max(1, Math.min(50, Math.round(msRng.gaussian(10 + baseBonus, 5)))),
          armStrength: Math.max(1, Math.min(50, Math.round(msRng.gaussian(8 + baseBonus, 5)))),
          fielding:    Math.max(1, Math.min(50, Math.round(msRng.gaussian(8 + baseBonus, 5)))),
          focus:       Math.max(1, Math.min(50, Math.round(msRng.gaussian(10 + baseBonus, 5)))),
          mental:      Math.max(1, Math.min(50, Math.round(msRng.gaussian(10 + baseBonus, 5)))),
        },
        batting: {
          contact:   Math.max(1, Math.min(50, Math.round(msRng.gaussian(10 + baseBonus, 5)))),
          power:     Math.max(1, Math.min(50, Math.round(msRng.gaussian(8 + baseBonus, 5)))),
          eye:       Math.max(1, Math.min(50, Math.round(msRng.gaussian(8 + baseBonus, 5)))),
          technique: Math.max(1, Math.min(50, Math.round(msRng.gaussian(8 + baseBonus, 5)))),
        },
        pitching: null,
      };

      pool.push({
        id: `ms-${year}-${grade}-${i}`,
        firstName: msRng.pick(FIRST_NAMES),
        lastName: msRng.pick(LAST_NAMES),
        middleSchoolGrade: grade as 1 | 2 | 3,
        middleSchoolName: msRng.pick(middleSchoolNames),
        prefecture,
        currentStats: stats,
        targetSchoolId: null,
        scoutedBy: [],
      });
    }
  }

  return pool;
}

// ============================================================
// PersonRegistry の初期化
// ============================================================

function createInitialPersonRegistry(): PersonRegistry {
  return {
    entries: new Map(),
  };
}

// ============================================================
// 自校を HighSchool 型に変換
// ============================================================

function teamToHighSchool(team: Team, rng: RNG): HighSchool {
  const coachStyle = {
    offenseType: 'balanced' as const,
    defenseType: 'balanced' as const,
    practiceEmphasis: 'balanced' as const,
    aggressiveness: 50,
  };

  return {
    id: team.id,
    name: team.name,
    prefecture: team.prefecture,
    reputation: team.reputation,
    players: team.players,
    lineup: team.lineup,
    facilities: team.facilities,
    simulationTier: 'full',
    coachStyle,
    yearResults: createEmptyYearResults(),
    shortName: generateSchoolShortName(team.name),
    _summary: null,
  };
}

// ============================================================
// 公開 API
// ============================================================

/**
 * 初期 WorldState を作成する。
 *
 * @param playerTeam  プレイヤーの自校チーム
 * @param prefecture  舞台となる都道府県
 * @param seed        RNGシード
 * @param rng         乱数生成器
 */
export function createWorldState(
  playerTeam: Team,
  manager: Manager,
  prefecture: string,
  seed: string,
  rng: RNG,
): WorldState {
  const initialYear = 1;

  // 自校を HighSchool に変換
  const playerSchool = teamToHighSchool(playerTeam, rng.derive('player-school'));

  // AI 校を47校生成
  const aiSchools = generateAISchools(
    playerSchool,
    prefecture,
    initialYear,
    rng.derive('ai-schools'),
  );

  const allSchools: HighSchool[] = [playerSchool, ...aiSchools];

  // 中学生プールを初期生成（3学年 × 180人 = 540人）
  const middleSchoolPool = generateInitialMiddleSchoolPool(
    initialYear,
    prefecture,
    rng.derive('middle-school-init'),
  );

  const personRegistry = createInitialPersonRegistry();

  const settings: GameSettings = {
    autoAdvanceSpeed: 'normal',
    showDetailedGrowth: false,
  };

  return {
    version: '0.3.0',
    seed,
    currentDate: { year: initialYear, month: 4, day: 1 },
    playerSchoolId: playerSchool.id,
    manager,
    settings,
    weeklyPlan: createDefaultWeeklyPlan(),
    prefecture,
    schools: allSchools,
    middleSchoolPool,
    personRegistry,
    seasonState: createInitialSeasonState(),
    scoutState: createInitialScoutState(),
    activeTournament: null,
    tournamentHistory: [],
  };
}

/**
 * 既存の GameState から WorldState を生成する（マイグレーション用）。
 */
export function gameStateToWorldState(
  gameState: GameState,
  prefecture: string,
  rng: RNG,
): WorldState {
  const team = gameState.team;
  const playerSchool = teamToHighSchool(team, rng.derive('player-school'));

  const aiSchools = generateAISchools(
    playerSchool,
    prefecture,
    gameState.currentDate.year,
    rng.derive('ai-schools'),
  );

  const allSchools: HighSchool[] = [playerSchool, ...aiSchools];

  const middleSchoolPool = generateInitialMiddleSchoolPool(
    gameState.currentDate.year,
    prefecture,
    rng.derive('middle-school-init'),
  );

  return {
    version: '0.3.0',
    seed: gameState.seed,
    currentDate: gameState.currentDate,
    playerSchoolId: playerSchool.id,
    manager: gameState.manager,
    settings: gameState.settings,
    weeklyPlan: createDefaultWeeklyPlan(),
    prefecture,
    schools: allSchools,
    middleSchoolPool,
    personRegistry: createInitialPersonRegistry(),
    seasonState: createInitialSeasonState(),
    scoutState: createInitialScoutState(),
    activeTournament: null,
    tournamentHistory: [],
  };
}

// ============================================================
// 型再エクスポート（下位ファイルの import 便宜）
// ============================================================
export type { GameSettings };
