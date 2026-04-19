import type { Player, Position } from './player';

export interface Team {
  id: string;
  name: string;
  prefecture: string;
  reputation: number;
  players: Player[];
  lineup: Lineup | null;
  facilities: FacilityLevel;
}

export interface Lineup {
  starters: LineupSlot[];
  bench: string[];
  battingOrder: string[];
}

export interface LineupSlot {
  playerId: string;
  position: Position;
}

export interface FacilityLevel {
  ground: number;
  bullpen: number;
  battingCage: number;
  gym: number;
}

/**
 * 監督の戦術スタイル (Phase 11-A2 2026-04-19)
 * - aggressive:  強振志向。長打係数+5%、CPU 盗塁/バント確率-10%
 * - balanced:    補正なし（デフォルト）
 * - defensive:   守備固め。エラー率-10%、CPU 送りバント+10%
 * - small_ball:  小技野球。CPU 送りバント+25%、盗塁成功率+5%
 */
export type ManagerStyle = 'aggressive' | 'balanced' | 'defensive' | 'small_ball';

export interface Manager {
  name: string;
  yearsActive: number;
  fame: number;
  totalWins: number;
  totalLosses: number;
  koshienAppearances: number;
  koshienWins: number;
  /** 戦術スタイル (Phase 11-A2)。未設定なら balanced と同等 */
  style?: ManagerStyle;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
