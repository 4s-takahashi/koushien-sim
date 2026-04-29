/**
 * playerProjector — 選手詳細画面用 ViewState 生成
 *
 * (worldState: WorldState, playerId: string) => PlayerDetailViewState | null
 */

import type { WorldState } from '../../engine/world/world-state';
import type { Player } from '../../engine/types/player';
import type {
  PlayerDetailViewState, StatRowView, ConditionView, AbilityRank, PositionLabel,
  PracticeHistoryView, PlayerEventView, PracticeFeedbackView,
} from './view-state-types';
import { buildFeedbackMessage } from '../../engine/growth/practice-feedback';
import { computePlayerOverall } from '../../engine/world/career/draft-system';
import { overallToRank, positionToLabel } from './teamProjector';
import { getMotivation } from '../../engine/growth/motivation';
import { TRAIT_LABELS } from '../labels/trait-labels';
import { MOOD_LABELS } from '../labels/mood-labels';
import { getAbilityNarrative, SUPPORTED_ABILITIES, type AbilityKey } from '../labels/ability-narrative';
import { generatePlayerConcern } from '../labels/player-concern';
import type { PlayerEventType } from '../../engine/types/player-history';

/** モチベーションラベル (Phase 11-A3) */
function motivationLabel(motivation: number): string {
  if (motivation >= 70) return '🔥 ハイモチベ';
  if (motivation >= 50) return '普通';
  if (motivation >= 30) return '低め';
  return '😢 やる気なし';
}

/** イベントタイプ → アイコン (Phase 11.5-E) */
const EVENT_ICONS: Record<PlayerEventType, string> = {
  enrollment: '🎓',
  practice_match: '⚾',
  tournament_play: '🏟',
  tournament_win: '🏆',
  koshien_qualify: '🌸',
  great_hit: '💥',
  great_pitch: '🔥',
  injury: '🤕',
  recovery: '✨',
  rest: '😴',
  growth_spurt: '📈',
  slump: '📉',
  graduation: '🎓',
  evaluator_noted: '👁',
};

function makeStatRow(label: string, value: number, max: number): StatRowView {
  const normalized = Math.min(100, Math.round((value / max) * 100));
  const rank = overallToRank(normalized);
  // Phase 11.5-D: 能力値言葉化
  const narrative = SUPPORTED_ABILITIES.includes(label as AbilityKey)
    ? getAbilityNarrative(label as AbilityKey, rank)
    : undefined;
  // Phase 11-D 成長可視化: 小数第1位まで表示して、0.3 の成長も見えるように
  return {
    label,
    value: Math.round(value * 10) / 10,  // 小数第1位
    max,
    rank,
    barPercent: normalized,
    narrative,
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

  // シーズンフェーズ判定 (Phase 11.5-E concern)
  const sp = worldState.seasonState.phase;
  const isInTournamentSeason =
    sp === 'summer_tournament' || sp === 'koshien' || sp === 'autumn_tournament';

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
    // モチベーション (Phase 11-A3 2026-04-19)
    motivation: getMotivation(player),
    motivationLabel: motivationLabel(getMotivation(player)),
    // 今の気持ち (Phase 11.5-E)
    concern: generatePlayerConcern(player, { isInTournamentSeason }, player.id),
    // 直近練習履歴 (Phase 11.5-E)
    recentPracticeHistory: player.practiceHistory
      ? player.practiceHistory.slice(-14).map((h): PracticeHistoryView => ({
          dateLabel: `${h.date.month}月${h.date.day}日`,
          menuLabel: h.menuLabel,
          fatigueAfter: h.fatigueAfter,
          motivationAfter: h.motivationAfter,
        }))
      : undefined,
    // イベント履歴 (Phase 11.5-E)
    eventHistory: player.eventHistory
      ? player.eventHistory.slice(-10).map((e): PlayerEventView => ({
          dateLabel: `${e.date.month}月${e.date.day}日`,
          text: e.text,
          importance: e.importance,
          icon: EVENT_ICONS[e.type] ?? '📌',
        }))
      : undefined,
    // 個別練習メニュー (Phase S1-B B5)
    individualMenu: playerSchool?.individualPracticeMenus?.[player.id] ?? null,
    // 最近の成長フィードバック (Phase S1-B B6)
    practiceFeedbacks: buildPracticeFeedbacks(worldState, player.id),
  };
}

/**
 * Phase S1-B B6: 練習成果フィードバック履歴を生成する。
 * worldState.practiceFeedbackHistory から直近10件を返す。
 */
function buildPracticeFeedbacks(
  worldState: WorldState,
  playerId: string,
): PracticeFeedbackView[] | undefined {
  const playerSchool = worldState.schools.find((s) => s.id === worldState.playerSchoolId);
  const feedbackHistory = (playerSchool as { practiceFeedbackHistory?: Record<string, import('../../engine/types/calendar').PracticeFeedback[]> })
    ?.practiceFeedbackHistory;
  if (!feedbackHistory) return undefined;

  const feedbacks = feedbackHistory[playerId];
  if (!feedbacks || feedbacks.length === 0) return undefined;

  return feedbacks
    .slice(-10)
    .map((fb): PracticeFeedbackView => ({
      dateLabel: `${fb.date.month}月${fb.date.day}日`,
      practiceType: fb.practiceType,
      message: fb.message,
    }));
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
