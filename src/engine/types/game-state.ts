import type { Team, Manager } from './team';
import type { GameDate } from './calendar';
import type {
  Position, Hand, BattingSide, GrowthType, TraitId, CareerRecord
} from './player';

export interface GameState {
  version: string;
  seed: string;
  currentDate: GameDate;
  team: Team;
  manager: Manager;
  graduates: GraduateRecord[];
  settings: GameSettings;
}

export interface GraduateRecord {
  playerId: string;
  firstName: string;
  lastName: string;
  graduationYear: number;
  enrollmentYear: number;
  position: Position;
  throwingHand: Hand;
  battingSide: BattingSide;
  finalStats: {
    overall: number;
    batting: number;
    pitching: number | null;
    speed: number;
    defense: number;
  };
  growthType: GrowthType;
  traits: TraitId[];
  careerStats: CareerRecord;
}

export interface GameSettings {
  autoAdvanceSpeed: 'slow' | 'normal' | 'fast';
  showDetailedGrowth: boolean;
}

export interface SaveSlotMeta {
  slotId: string;
  schoolName: string;
  currentDate: GameDate;
  playTimeMinutes: number;
  savedAt: number;
  version: string;
}

export interface NewGameConfig {
  schoolName: string;
  prefecture: string;
  managerName: string;
  seed?: string;
}
