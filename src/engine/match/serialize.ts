/**
 * src/engine/match/serialize.ts
 *
 * MatchState は Map/Set を含むため JSON 直接化できない。
 * このモジュールは MatchState の serialize / deserialize を提供する。
 *
 * (2026-04-19 Issue #8 試合中断/再開 PR #6)
 */

import type { MatchState, MatchTeam } from './types';
import type { Position } from '../types/player';

// ============================================================
// シリアライズ
// ============================================================

interface SerializedMatchTeam extends Omit<MatchTeam, 'fieldPositions' | 'usedPlayerIds'> {
  fieldPositions: Array<[string, Position]>;
  usedPlayerIds: string[];
}

interface SerializedMatchState extends Omit<MatchState, 'homeTeam' | 'awayTeam'> {
  homeTeam: SerializedMatchTeam;
  awayTeam: SerializedMatchTeam;
}

function serializeTeam(team: MatchTeam): SerializedMatchTeam {
  return {
    ...team,
    fieldPositions: Array.from(team.fieldPositions.entries()),
    usedPlayerIds: Array.from(team.usedPlayerIds),
  };
}

function deserializeTeam(team: SerializedMatchTeam): MatchTeam {
  return {
    ...team,
    fieldPositions: new Map(team.fieldPositions),
    usedPlayerIds: new Set(team.usedPlayerIds),
  };
}

/**
 * MatchState を JSON 文字列に serialize する。
 */
export function serializeMatchState(state: MatchState): string {
  const serialized: SerializedMatchState = {
    ...state,
    homeTeam: serializeTeam(state.homeTeam),
    awayTeam: serializeTeam(state.awayTeam),
  };
  return JSON.stringify(serialized);
}

/**
 * JSON 文字列から MatchState を復元する。
 */
export function deserializeMatchState(json: string): MatchState {
  const parsed = JSON.parse(json) as SerializedMatchState;
  return {
    ...parsed,
    homeTeam: deserializeTeam(parsed.homeTeam),
    awayTeam: deserializeTeam(parsed.awayTeam),
  };
}
