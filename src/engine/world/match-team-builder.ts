/**
 * match-team-builder — HighSchool → MatchTeam 変換
 *
 * tournament-bracket と practice-game の両方から使用する共通ユーティリティ。
 */

import type { HighSchool } from './world-state';
import type { MatchTeam } from '../match/types';

/**
 * HighSchool から quick-game / runGame 用の MatchTeam を構築する。
 * フィールドポジションはシンプルなデフォルト割り当て。
 */
export function buildMatchTeam(school: HighSchool): MatchTeam {
  const players = school.players.slice(0, 18);
  const matchPlayers = players.map((p) => ({
    player: p,
    pitchCountInGame: 0,
    stamina: 100,
    confidence: p.stats.base.mental,
    isWarmedUp: false,
  }));

  const lineup = school.lineup;
  let battingOrder: string[];
  if (lineup && lineup.battingOrder && lineup.battingOrder.length >= 9) {
    battingOrder = lineup.battingOrder.slice(0, 9);
  } else {
    battingOrder = players.slice(0, 9).map((p) => p.id);
  }

  // 投手を探す（ポジションが'pitcher'またはpitchingStatsを持つ最初の選手）
  const pitcherPlayer =
    players.find((p) => p.position === 'pitcher' && p.stats.pitching !== null) ??
    players.find((p) => p.stats.pitching !== null) ??
    players[0];

  const currentPitcherId = pitcherPlayer?.id ?? players[0]?.id ?? '';

  const fieldPositions = new Map<string, import('../types/player').Position>();
  const defaultPositions: import('../types/player').Position[] = [
    'pitcher', 'catcher', 'first', 'second',
    'third', 'shortstop', 'left', 'center', 'right',
  ];
  battingOrder.forEach((pid, i) => {
    if (i < defaultPositions.length) {
      fieldPositions.set(pid, defaultPositions[i]);
    }
  });

  const benchPlayerIds = players
    .filter((p) => !battingOrder.includes(p.id))
    .map((p) => p.id);

  return {
    id: school.id,
    name: school.name,
    players: matchPlayers,
    battingOrder,
    fieldPositions,
    currentPitcherId,
    benchPlayerIds,
    usedPlayerIds: new Set(),
  };
}
