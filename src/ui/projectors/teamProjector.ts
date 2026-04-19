/**
 * teamProjector — チーム画面用 ViewState 生成
 *
 * (worldState: WorldState) => TeamViewState
 */

import type { WorldState } from '../../engine/world/world-state';
import type { Player, Position } from '../../engine/types/player';
import type { Lineup } from '../../engine/types/team';

import type {
  TeamViewState, PlayerRowView, LineupView,
  PositionLabel, AbilityRank, ManagerView,
} from './view-state-types';
import { computePlayerOverall } from '../../engine/world/career/draft-system';
import { getMotivation } from '../../engine/growth/motivation';

// ============================================================
// 内部ヘルパー
// ============================================================

export function positionToLabel(pos: Position): PositionLabel {
  const map: Record<Position, PositionLabel> = {
    pitcher: '投手',
    catcher: '捕手',
    first: '一塁手',
    second: '二塁手',
    third: '三塁手',
    shortstop: '遊撃手',
    left: '左翼手',
    center: '中堅手',
    right: '右翼手',
  };
  return map[pos];
}

export function overallToRank(overall: number): AbilityRank {
  if (overall >= 75) return 'S';
  if (overall >= 60) return 'A';
  if (overall >= 45) return 'B';
  if (overall >= 30) return 'C';
  if (overall >= 15) return 'D';
  return 'E';
}

function reputationToLabel(reputation: number): string {
  if (reputation >= 85) return '名門';
  if (reputation >= 65) return '強豪';
  if (reputation >= 45) return '中堅';
  if (reputation >= 25) return '新興';
  return '弱小';
}

function getPlayerGrade(enrollmentYear: number, currentYear: number): 1 | 2 | 3 {
  const grade = currentYear - enrollmentYear + 1;
  if (grade >= 3) return 3;
  if (grade >= 2) return 2;
  return 1;
}

function conditionBrief(player: Player): string {
  if (player.condition.injury) return '負傷中';
  if (player.condition.fatigue >= 80) return '要休養';
  if (player.condition.fatigue >= 50) return '注意';
  return '良好';
}

function computePitchingStrength(players: Player[]): number {
  const pitchers = players.filter((p) => p.position === 'pitcher');
  if (pitchers.length === 0) return 0;
  const sum = pitchers.reduce((acc, p) => {
    const ps = p.stats.pitching;
    if (!ps) return acc + computePlayerOverall(p);
    return acc + Math.round((ps.velocity + ps.control + ps.pitchStamina) / 3);
  }, 0);
  return Math.round(sum / pitchers.length);
}

function computeBattingStrength(players: Player[]): number {
  if (players.length === 0) return 0;
  const hitters = players.filter((p) => p.position !== 'pitcher');
  if (hitters.length === 0) return 0;
  const sum = hitters.reduce((acc, p) => {
    const bat = p.stats.batting;
    return acc + Math.round((bat.contact + bat.power + bat.eye + bat.technique) / 4);
  }, 0);
  return Math.round(sum / hitters.length);
}

function computeDefenseStrength(players: Player[]): number {
  if (players.length === 0) return 0;
  const sum = players.reduce((acc, p) => {
    const b = p.stats.base;
    return acc + Math.round((b.fielding + b.armStrength + b.speed) / 3);
  }, 0);
  return Math.round(sum / players.length);
}

function buildLineupView(players: Player[], lineup: Lineup | null): LineupView | null {
  if (!lineup) return null;

  // battingOrder は string[] (playerId の配列、打順インデックスが打順-1)
  const battingOrderArr = lineup.battingOrder;

  const starters = lineup.starters
    .filter((slot) => slot.playerId !== null)
    .map((slot) => {
      const player = players.find((p) => p.id === slot.playerId);
      const order = battingOrderArr.indexOf(slot.playerId) + 1; // 0-based → 1-based
      return {
        battingOrder: order > 0 ? order : 999,
        playerId: slot.playerId ?? '',
        playerName: player ? `${player.lastName}${player.firstName}` : '不明',
        position: slot.position,
        positionLabel: positionToLabel(slot.position),
        overall: player ? computePlayerOverall(player) : 0,
      };
    })
    .filter((s) => s.battingOrder !== 999)
    .sort((a, b) => a.battingOrder - b.battingOrder);

  const pitcherSlot = lineup.starters.find((s) => s.position === 'pitcher');
  const pitcher = pitcherSlot?.playerId
    ? players.find((p) => p.id === pitcherSlot.playerId)
    : null;

  return {
    starters,
    pitcherName: pitcher ? `${pitcher.lastName}${pitcher.firstName}` : null,
    pitcherOverall: pitcher ? computePlayerOverall(pitcher) : 0,
  };
}

// ============================================================
// 公開 API
// ============================================================

/**
 * チーム画面の ViewState を生成する。
 */
export function projectTeam(worldState: WorldState): TeamViewState {
  const { currentDate, playerSchoolId, schools } = worldState;
  const playerSchool = schools.find((s) => s.id === playerSchoolId);

  const managerView: ManagerView = {
    name: worldState.manager.name,
    yearsActive: worldState.manager.yearsActive,
    totalWins: worldState.manager.totalWins,
    totalLosses: worldState.manager.totalLosses,
    koshienAppearances: worldState.manager.koshienAppearances,
  };

  if (!playerSchool) {
    return {
      schoolName: '不明',
      prefecture: '不明',
      reputation: 0,
      reputationLabel: '弱小',
      totalStrength: 0,
      pitchingStrength: 0,
      battingStrength: 0,
      defenseStrength: 0,
      players: [],
      lineup: null,
      grade3Count: 0,
      grade2Count: 0,
      grade1Count: 0,
      manager: managerView,
    };
  }

  const { players, lineup, reputation } = playerSchool;
  const currentYear = currentDate.year;

  // 選手ロー一覧
  const lineupPlayerIds = new Set(
    lineup?.starters.map((s) => s.playerId).filter(Boolean) ?? []
  );
  // battingOrder は string[] (打順順のplayerId配列)
  const battingOrderMap = new Map<string, number>(
    lineup?.battingOrder.map((id, idx) => [id, idx + 1] as [string, number]) ?? []
  );

  const playerRows: PlayerRowView[] = players.map((player, idx) => {
    const grade = getPlayerGrade(player.enrollmentYear, currentYear);
    const overall = computePlayerOverall(player);
    return {
      id: player.id,
      uniformNumber: idx + 1,
      lastName: player.lastName,
      firstName: player.firstName,
      grade,
      gradeLabel: `${grade}年`,
      position: player.position,
      positionLabel: positionToLabel(player.position),
      overall,
      overallRank: overallToRank(overall),
      conditionBrief: conditionBrief(player),
      isResting: player.restOverride != null,
      isInLineup: lineupPlayerIds.has(player.id),
      battingOrderNumber: battingOrderMap.get(player.id) ?? null,
      individualMenu: playerSchool.individualPracticeMenus?.[player.id] ?? null,
      motivation: getMotivation(player),
    };
  });

  // 学年カウント
  const grade3Count = players.filter((p) => getPlayerGrade(p.enrollmentYear, currentYear) === 3).length;
  const grade2Count = players.filter((p) => getPlayerGrade(p.enrollmentYear, currentYear) === 2).length;
  const grade1Count = players.filter((p) => getPlayerGrade(p.enrollmentYear, currentYear) === 1).length;

  const totalStrength = playerRows.length > 0
    ? Math.round(playerRows.reduce((acc, p) => acc + p.overall, 0) / playerRows.length)
    : 0;

  return {
    schoolName: playerSchool.name,
    prefecture: playerSchool.prefecture,
    reputation,
    reputationLabel: reputationToLabel(reputation),
    totalStrength,
    pitchingStrength: computePitchingStrength(players),
    battingStrength: computeBattingStrength(players),
    defenseStrength: computeDefenseStrength(players),
    players: playerRows,
    lineup: buildLineupView(players, lineup),
    grade3Count,
    grade2Count,
    grade1Count,
    manager: managerView,
  };
}
