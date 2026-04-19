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

export interface Manager {
  name: string;
  yearsActive: number;
  fame: number;
  totalWins: number;
  totalLosses: number;
  koshienAppearances: number;
  koshienWins: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
