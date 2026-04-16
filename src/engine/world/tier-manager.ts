/**
 * tier-manager — SimulationTier の動的昇格・降格管理
 *
 * 昇格条件:
 *   - 大会で対戦した学校 → standard に昇格
 * 降格条件:
 *   - 2大会以上対戦なし → minimal に降格
 * 制約:
 *   - 自校は常に full（変更不可）
 *   - 県内トップ3強豪は minimal まで落ちない
 */

import type { WorldState, HighSchool, SimulationTier } from './world-state';

// ============================================================
// 型定義
// ============================================================

/**
 * 対戦記録（Tier 更新の判断に使う）
 * world.schools[].yearResults から集計する
 */
export interface MatchRecord {
  schoolIdA: string;
  schoolIdB: string;
  tournamentIndex: number; // 大会インデックス（0=今年夏, 1=今年秋, ...）
}

// ============================================================
// ヘルパー
// ============================================================

/**
 * reputation 上位3校かつ reputation >= 70 のIDを返す。
 * 強豪校の定義: reputation 70+ の上位3校。
 * 自校は除外。
 */
function getTop3SchoolIds(schools: HighSchool[], playerSchoolId: string): string[] {
  return [...schools]
    .filter((s) => s.id !== playerSchoolId && s.reputation >= 70)
    .sort((a, b) => b.reputation - a.reputation)
    .slice(0, 3)
    .map((s) => s.id);
}

// ============================================================
// 公開 API
// ============================================================

/**
 * 全校の SimulationTier を更新する。
 *
 * @param world             現在の WorldState
 * @param recentlyFaced     直近2大会で自校が対戦した学校IDリスト
 * @param tournamentsFaced  各校が参加した大会数の記録（schoolId → 大会数）
 * @returns                 Tier 更新後の WorldState
 */
export function updateSimulationTiers(
  world: WorldState,
  recentlyFaced: string[] = [],
  schoolTournamentCounts: Map<string, number> = new Map(),
): WorldState {
  const top3Ids = getTop3SchoolIds(world.schools, world.playerSchoolId);

  const updatedSchools: HighSchool[] = world.schools.map((school) => {
    // 自校は常に full
    if (school.id === world.playerSchoolId) {
      return { ...school, simulationTier: 'full' as SimulationTier };
    }

    const tournamentCount = schoolTournamentCounts.get(school.id) ?? 0;
    const wasFaced = recentlyFaced.includes(school.id);
    const isTop3 = top3Ids.includes(school.id);

    let newTier: SimulationTier = school.simulationTier;

    // 昇格: 対戦した学校 → standard
    if (wasFaced && school.simulationTier === 'minimal') {
      newTier = 'standard';
    }

    // 降格: 2大会以上対戦なし & 対戦していない → minimal
    // tournamentCount が 0 かつ 対戦もない場合
    if (!wasFaced && tournamentCount === 0 && school.simulationTier === 'standard') {
      // トップ3強豪は minimal まで落ちない
      if (!isTop3) {
        newTier = 'minimal';
      }
    }

    // トップ3強豪は最低 standard
    if (isTop3 && newTier === 'minimal') {
      newTier = 'standard';
    }

    return { ...school, simulationTier: newTier };
  });

  return { ...world, schools: updatedSchools };
}

/**
 * 大会終了後に対戦した学校リストを WorldState に反映する。
 * advanceWorldDay 内の大会日処理から呼び出す。
 *
 * @param world     現在の WorldState
 * @param facedIds  今大会で自校が対戦した学校IDリスト
 */
export function applyTournamentFacing(
  world: WorldState,
  facedIds: string[],
): WorldState {
  if (facedIds.length === 0) return world;
  return updateSimulationTiers(world, facedIds, new Map());
}
