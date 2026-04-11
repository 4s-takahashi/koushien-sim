import { create } from 'zustand';
import type { GameState, NewGameConfig, SaveSlotMeta } from '../engine/types/game-state';
import type { Lineup } from '../engine/types/team';
import type { PracticeMenuId, DayProcessResult } from '../engine/types/calendar';
import type { StorageAdapter } from '../platform/storage/adapter';
import type { LicenseManager, LicenseStatus } from '../platform/license/types';
import { createRNG } from '../engine/core/rng';
import { generateId } from '../engine/core/id';
import { generatePlayer } from '../engine/player/generate';
import { autoGenerateLineup } from '../engine/team/lineup';
import { processDay } from '../engine/calendar/day-processor';
import { createSaveManager } from '../engine/save/save-manager';
import { CURRENT_SAVE_VERSION } from '../engine/save/save-manager';

const GAME_SEED_LENGTH = 16;

function generateSeed(): string {
  return generateId().replace(/-/g, '').slice(0, GAME_SEED_LENGTH);
}

function createInitialTeam(config: NewGameConfig, seed: string) {
  const rng = createRNG(seed + ':team_init');

  const players = [];
  const reputation = 50; // Default reputation
  const enrollmentYear = 1;

  // Generate initial 3 grades of players
  // Grade 3: 8 players (year 1 = 3rd year)
  for (let i = 0; i < 8; i++) {
    players.push(generatePlayer(rng.derive(`grade3:${i}`), {
      enrollmentYear: -1, // Will be year 1 but they're 3rd years
      schoolReputation: reputation,
    }));
  }
  // Adjust: grade 3 players have enrollmentYear = enrollmentYear - 2
  const grade3 = players.slice(0, 8).map((p) => ({ ...p, enrollmentYear: -1 }));

  // Grade 2: 7 players
  const grade2 = [];
  for (let i = 0; i < 7; i++) {
    grade2.push({
      ...generatePlayer(rng.derive(`grade2:${i}`), {
        enrollmentYear: 0,
        schoolReputation: reputation,
      }),
      enrollmentYear: 0,
    });
  }

  // Grade 1: 8 players
  const grade1 = [];
  for (let i = 0; i < 8; i++) {
    grade1.push(generatePlayer(rng.derive(`grade1:${i}`), {
      enrollmentYear: 1,
      schoolReputation: reputation,
    }));
  }

  const allPlayers = [...grade3, ...grade2, ...grade1];

  const team = {
    id: generateId(),
    name: config.schoolName,
    prefecture: config.prefecture,
    reputation,
    players: allPlayers,
    lineup: null,
    facilities: {
      ground: 3,
      bullpen: 3,
      battingCage: 3,
      gym: 3,
    },
  };

  // Auto-generate lineup
  const lineup = autoGenerateLineup(team, 1);
  return { ...team, lineup };
}

interface GameStore {
  // State
  gameState: GameState | null;
  isLoading: boolean;
  isPaused: boolean;
  licenseStatus: LicenseStatus | null;
  lastDayResult: DayProcessResult | null;

  // Injected dependencies (set at initialization)
  _storage: StorageAdapter | null;
  _license: LicenseManager | null;

  // Actions
  initialize: (storage: StorageAdapter, license: LicenseManager) => Promise<void>;
  newGame: (config: NewGameConfig) => Promise<void>;
  loadGame: (slotId: string) => Promise<void>;
  saveGame: (slotId?: string) => Promise<void>;

  advanceDay: (menu: PracticeMenuId) => DayProcessResult | null;
  advanceDays: (count: number, menu: PracticeMenuId) => DayProcessResult[];

  setLineup: (lineup: Lineup) => void;

  checkLicense: () => Promise<boolean>;
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  isLoading: false,
  isPaused: false,
  licenseStatus: null,
  lastDayResult: null,
  _storage: null,
  _license: null,

  initialize: async (storage: StorageAdapter, license: LicenseManager) => {
    set({ _storage: storage, _license: license, isLoading: true });

    try {
      const status = await license.getStatus();
      set({ licenseStatus: status });

      // Try to load auto-save
      const saveManager = createSaveManager(storage);
      const saves = await saveManager.listSaves();
      const autoSave = saves.find((s) => s.slotId === 'auto');

      if (autoSave) {
        const state = await saveManager.loadGame('auto');
        if (state) {
          set({ gameState: state });
        }
      }
    } finally {
      set({ isLoading: false });
    }
  },

  newGame: async (config: NewGameConfig) => {
    const { _storage } = get();
    const seed = config.seed ?? generateSeed();

    const team = createInitialTeam(config, seed);

    const manager = {
      name: config.managerName,
      yearsActive: 0,
      fame: 10,
      totalWins: 0,
      totalLosses: 0,
      koshienAppearances: 0,
      koshienWins: 0,
    };

    const gameState: GameState = {
      version: CURRENT_SAVE_VERSION,
      seed,
      currentDate: { year: 1, month: 4, day: 1 },
      team,
      manager,
      graduates: [],
      settings: {
        autoAdvanceSpeed: 'normal',
        showDetailedGrowth: true,
      },
    };

    set({ gameState });

    if (_storage) {
      const saveManager = createSaveManager(_storage);
      await saveManager.autoSave(gameState);
    }
  },

  loadGame: async (slotId: string) => {
    const { _storage } = get();
    if (!_storage) throw new Error('Storage not initialized');

    set({ isLoading: true });
    try {
      const saveManager = createSaveManager(_storage);
      const state = await saveManager.loadGame(slotId);
      if (state) {
        set({ gameState: state });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  saveGame: async (slotId = 'slot_1') => {
    const { _storage, gameState } = get();
    if (!_storage || !gameState) return;

    const saveManager = createSaveManager(_storage);
    await saveManager.saveGame(slotId, gameState);
  },

  advanceDay: (menu: PracticeMenuId) => {
    const { gameState } = get();
    if (!gameState) return null;

    const dateStr = `${gameState.currentDate.year}-${gameState.currentDate.month}-${gameState.currentDate.day}`;
    const rng = createRNG(gameState.seed + ':' + dateStr);

    const result = processDay(gameState, menu, rng);

    set({ gameState: result.nextState, lastDayResult: result });
    return result;
  },

  advanceDays: (count: number, menu: PracticeMenuId) => {
    const results: DayProcessResult[] = [];
    for (let i = 0; i < count; i++) {
      const result = get().advanceDay(menu);
      if (result) results.push(result);
    }
    return results;
  },

  setLineup: (lineup: Lineup) => {
    const { gameState } = get();
    if (!gameState) return;

    set({
      gameState: {
        ...gameState,
        team: { ...gameState.team, lineup },
      },
    });
  },

  checkLicense: async () => {
    const { _license } = get();
    if (!_license) return false;
    return _license.canPlay();
  },
}));
