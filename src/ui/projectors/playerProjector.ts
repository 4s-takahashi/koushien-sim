/**
 * playerProjector — 選手詳細画面用 ViewState 生成
 *
 * (worldState: WorldState, playerId: string) => PlayerDetailViewState | null
 */

import type { WorldState } from '../../engine/world/world-state';
import type { Player, Position, TraitId } from '../../engine/types/player';
import type {
  PlayerDetailViewState, StatRowView, ConditionView, AbilityRank, PositionLabel,
} from './view-state-types';
import { computePlayerOverall } from '../../engine/world/career/draft-system';
import { overallToRank, positionToLabel } from './teamProjector';

// ============================================================
// 内部ヘルパー
// ============================================================

const TRAIT_LABELS: Record<TraitId, string> = {
  passionate: '情熱家',
  calm: '冷静沈着',
  easygoing: 'のんびり屋',
  sensitive: '繊細',
  bold: '大胆',
  leader: 'リーダー',
  morale_booster: 'ムードメーカー',
  lone_wolf: '一匹狼',
  shy: '内気',
  hard_worker: '努力家',
  natural_talent: '天才型',
  strategist: '戦略家',
  competitive: '負けず嫌い',
  fun_lover: '楽天家',
  short_tempered: '短気',
  slacker: '怠け者',
  overconfident: '自信過剰',
  self_doubt: '自信喪失',
  rebellious: '反骨心',
  responsible: '責任感',
  caring: '面倒見がいい',
  gritty: '根性',
  honest: '誠実',
  ambitious: '野心家',
};

const MOOD_LABELS: Record<string, string> = {
  excellent: '絶好調',
  good: '好調',
  normal: '普通',
  poor: '不調',
  terrible: '最悪',
};

function makeStatRow(label: string, value: number, max: number): StatRowView {
  const normalized = Math.min(100, Math.round((value / max) * 100));
  return {
    label,
    value: Math.round(value),
    max,
    rank: overallToRank(normalized),
    barPercent: normalized,
  };
}

function battingAverage(hits: number, atBats: number): string {
  if (atBats === 0) return '.000';
  const avg = hits / atBats;
  return `.${Math.round(avg * 1000).toString().padStart(3, '0')}`;
}

function era(earnedRuns: number, inningsPitched: number): string {
  if (inningsPitched === 0) return '--.-';
  const e = (earnedRuns / inningsPitched) * 9;
  return e.toFixed(2);
}

function getPlayerGrade(enrollmentYear: number, currentYear: number): 1 | 2 | 3 {
  const grade = currentYear - enrollmentYear + 1;
  if (grade >= 3) return 3;
  if (grade >= 2) return 2;
  return 1;
}

// ============================================================
// 公開 API
// ============================================================

/**
 * 選手詳細の ViewState を生成する。
 *
 * @param worldState  現在の WorldState
 * @param playerId    対象選手のID
 * @returns           ViewState、見つからなければ null
 */
export function projectPlayer(
  worldState: WorldState,
  playerId: string,
): PlayerDetailViewState | null {
  const { currentDate, playerSchoolId, schools } = worldState;
  const playerSchool = schools.find((s) => s.id === playerSchoolId);
  const player = playerSchool?.players.find((p) => p.id === playerId);

  if (!player) return null;

  const grade = getPlayerGrade(player.enrollmentYear, currentDate.year);
  const overall = computePlayerOverall(player);

  // ベース能力値テーブル（最大値100スケールで表示）
  const b = player.stats.base;
  const baseStats: StatRowView[] = [
    makeStatRow('体力', b.stamina, 100),
    makeStatRow('走力', b.speed, 100),
    makeStatRow('肩力', b.armStrength, 100),
    makeStatRow('守備', b.fielding, 100),
    makeStatRow('集中', b.focus, 100),
    makeStatRow('精神', b.mental, 100),
  ];

  // 打撃能力値テーブル
  const bat = player.stats.batting;
  const battingStats: StatRowView[] = [
    makeStatRow('ミート', bat.contact, 100),
    makeStatRow('パワー', bat.power, 100),
    makeStatRow('選球眼', bat.eye, 100),
    makeStatRow('技術', bat.technique, 100),
  ];

  // 投球能力値テーブル（投手のみ）
  const pitchingStats: StatRowView[] | null = player.stats.pitching
    ? [
        makeStatRow('球速', player.stats.pitching.velocity, 100),
        makeStatRow('制球', player.stats.pitching.control, 100),
        makeStatRow('スタミナ', player.stats.pitching.pitchStamina, 100),
      ]
    : null;

  // コンディション
  const condition: ConditionView = {
    fatigue: player.condition.fatigue,
    injuryDescription: player.condition.injury
      ? `${player.condition.injury.type}（残り${player.condition.injury.remainingDays}日）`
      : null,
    mood: player.condition.mood,
    moodLabel: MOOD_LABELS[player.condition.mood] ?? '普通',
  };

  // 通算成績（打者）
  const cs = player.careerStats;
  const battingRecord = {
    gamesPlayed: cs.gamesPlayed,
    atBats: cs.atBats,
    hits: cs.hits,
    homeRuns: cs.homeRuns,
    rbis: cs.rbis,
    stolenBases: cs.stolenBases,
    battingAverage: battingAverage(cs.hits, cs.atBats),
  };

  // 通算成績（投手）
  const pitchingRecord = player.stats.pitching
    ? {
        gamesStarted: cs.gamesStarted,
        inningsPitched: cs.inningsPitched,
        wins: cs.wins,
        losses: cs.losses,
        strikeouts: cs.strikeouts,
        era: era(cs.earnedRuns, cs.inningsPitched),
      }
    : null;

  // 利き腕・打席
  const battingSideLabels: Record<string, string> = {
    left: '左打ち',
    right: '右打ち',
    switch: '両打ち',
  };
  const throwingHandLabels: Record<string, string> = {
    left: '左投げ',
    right: '右投げ',
  };

  // シーズン別成績 (Issue #6 2026-04-19)
  const bySeason = cs.bySeason;
  const buildSeasonView = (g: 1 | 2 | 3): import('./view-state-types').SeasonRecordView | null => {
    const s = bySeason?.[g];
    if (!s || s.gamesPlayed === 0) return null;
    return {
      gamesPlayed: s.gamesPlayed,
      atBats: s.atBats,
      hits: s.hits,
      homeRuns: s.homeRuns,
      rbis: s.rbis,
      battingAverage: battingAverage(s.hits, s.atBats),
      inningsPitched: s.inningsPitched,
      wins: s.wins,
      losses: s.losses,
      strikeouts: s.strikeouts,
      era: era(s.earnedRuns, s.inningsPitched),
    };
  };
  const seasonRecords = bySeason
    ? {
        grade1: buildSeasonView(1),
        grade2: buildSeasonView(2),
        grade3: buildSeasonView(3),
      }
    : undefined;

  return {
    id: player.id,
    lastName: player.lastName,
    firstName: player.firstName,
    fullName: `${player.lastName} ${player.firstName}`,
    grade,
    gradeLabel: `${grade}年`,
    position: player.position,
    positionLabel: positionToLabel(player.position),
    subPositions: player.subPositions,
    height: player.height,
    weight: player.weight,
    battingSide: battingSideLabels[player.battingSide] ?? player.battingSide,
    throwingHand: throwingHandLabels[player.throwingHand] ?? player.throwingHand,
    traits: player.traits.map((t) => TRAIT_LABELS[t] ?? t),
    overall,
    overallRank: overallToRank(overall),
    baseStats,
    battingStats,
    pitchingStats,
    condition,
    battingRecord,
    pitchingRecord,
    seasonRecords,
  };
}

/**
 * 選手IDリストから複数選手の簡易情報を取得（選手一覧ページ用）。
 */
export function projectPlayerList(
  worldState: WorldState,
): PlayerDetailViewState[] {
  const playerSchool = worldState.schools.find(
    (s) => s.id === worldState.playerSchoolId
  );
  if (!playerSchool) return [];

  return playerSchool.players
    .map((p) => projectPlayer(worldState, p.id))
    .filter((v): v is PlayerDetailViewState => v !== null);
}
