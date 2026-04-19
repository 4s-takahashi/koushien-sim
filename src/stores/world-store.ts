/**
 * world-store — WorldState 用 Zustand ストア
 *
 * WorldState を管理し、UI に ViewState を提供する。
 * game-store.ts（GameState 用）と並列して動作する。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PracticeMenuId, GameDate } from '../engine/types/calendar';
import type { WorldState } from '../engine/world/world-state';
import type { WorldDayResult } from '../engine/world/world-ticker';
import type { ScoutSearchFilter } from '../engine/world/world-state';
import type {
  HomeViewState, TeamViewState, PlayerDetailViewState,
  ScoutViewState, TournamentViewState, ResultsViewState, OBViewState,
  PracticeViewState,
} from '../ui/projectors/view-state-types';
import { createRNG } from '../engine/core/rng';
import { createWorldState } from '../engine/world/create-world';
import { advanceWorldDay, completeInteractiveMatch } from '../engine/world/world-ticker';
import { addToWatchList, removeFromWatchList, conductScoutVisit, recruitPlayer } from '../engine/world/scout/scout-system';
import { projectHome } from '../ui/projectors/homeProjector';
import { projectTeam } from '../ui/projectors/teamProjector';
import { projectPlayer } from '../ui/projectors/playerProjector';
import { projectScout } from '../ui/projectors/scoutProjector';
import { projectTournament } from '../ui/projectors/tournamentProjector';
import { projectResults } from '../ui/projectors/resultsProjector';
import { projectOB } from '../ui/projectors/obProjector';
import { projectPracticeView } from '../ui/projectors/practiceProjector';
import {
  schedulePracticeMatch,
  scheduleIntraSquad,
  cancelPracticeGame,
} from '../engine/world/practice-game';
import { generateId } from '../engine/core/id';
import { generatePlayer } from '../engine/player/generate';
import { autoGenerateLineup } from '../engine/team/lineup';
import {
  saveWorldState, loadWorldState, deleteWorldSave, listWorldSaves,
  autoSaveYearEnd, autoSaveMonthly, autoSavePreTournament,
  getStorageUsedBytes,
  WORLD_SAVE_SLOTS,
} from '../engine/save/world-save-manager';
import type { WorldSaveSlotId, WorldSaveSlotMeta, WorldSaveResult, WorldLoadResult } from '../engine/save/world-save-manager';
import {
  serializeWorldState as serializeWS,
  deserializeWorldState as deserializeWS,
} from '../engine/save/world-serializer';
import {
  createTournamentBracket,
  simulateFullTournament,
  simulateTournamentRound,
} from '../engine/world/tournament-bracket';
import type { TournamentType } from '../engine/world/tournament-bracket';

// ============================================================
// 新規ゲーム設定
// ============================================================

export interface NewWorldConfig {
  schoolName: string;
  prefecture: string;
  managerName: string;
  seed?: string;
}

// ============================================================
// ストア型定義
// ============================================================

interface WorldStore {
  // --- 状態 ---
  worldState: WorldState | null;
  isLoading: boolean;
  lastDayResult: WorldDayResult | null;
  /** 直近の WorldDayResult リスト（最大30件、最新順） */
  recentResults: WorldDayResult[];
  /** 最近のニュース（最大20件、最新順） */
  recentNews: WorldDayResult['worldNews'];
  /**
   * persist からの復元(hydration) が完了したかどうか。
   * 初回マウント時は false。zustand persist の onRehydrateStorage 経由で true になる。
   * SSR → 初回 CSR のタイミングで「worldState が null」と「本当に未開始」を区別する
   * ために使う (リロードしたら /new-game に飛ぶバグ対応 2026-04-19)。
   */
  _hasHydrated: boolean;
  /** 内部用: hydration 完了フラグを立てる */
  _setHasHydrated: (v: boolean) => void;

  // --- ゲーム初期化 ---
  newWorldGame: (config: NewWorldConfig) => void;

  // --- 進行アクション ---
  advanceDay: (menuId?: PracticeMenuId) => WorldDayResult | null;
  advanceWeek: (menuId?: PracticeMenuId) => WorldDayResult[];

  // --- ViewState 取得（projector 経由） ---
  getHomeView: () => HomeViewState | null;
  getTeamView: () => TeamViewState | null;
  getPlayerView: (playerId: string) => PlayerDetailViewState | null;
  getScoutView: (filters?: ScoutSearchFilter) => ScoutViewState | null;
  getTournamentView: () => TournamentViewState | null;
  getResultsView: () => ResultsViewState | null;
  getOBView: () => OBViewState | null;
  getPracticeView: () => PracticeViewState | null;

  // --- 練習試合アクション ---
  schedulePracticeGame: (opponentSchoolId: string, date: GameDate) => { success: boolean; message: string };
  scheduleIntraSquadGame: (date: GameDate) => { success: boolean; message: string };
  cancelPracticeGameAction: (scheduleId: string) => void;

  // --- スカウトアクション ---
  scoutVisit: (playerId: string) => { success: boolean; message: string };
  recruitPlayerAction: (playerId: string) => { success: boolean; message: string };
  addToWatch: (playerId: string) => void;
  removeFromWatch: (playerId: string) => void;

  // --- 一時休養アクション (2026-04-19 Issue #5) ---
  /**
   * 指定した選手IDのリストに 1日分の休養フラグを付ける。
   * 次の日次処理で自動的に解除される。
   * 既にフラグが付いている選手は上書きしない (多重適用防止)。
   */
  setRestOverride: (playerIds: string[]) => { count: number };
  /**
   * けが人・けが注意の選手を自動検出して一括で休養フラグを付ける便利ヘルパー。
   * @returns 対象選手数
   */
  restAllInjuredAndWarned: () => { count: number };

  // --- セーブ/ロードアクション ---
  saveGame: (slotId: WorldSaveSlotId, displayName: string) => Promise<WorldSaveResult>;
  loadGame: (slotId: WorldSaveSlotId) => Promise<WorldLoadResult>;
  deleteSave: (slotId: WorldSaveSlotId) => void;
  listSaves: () => WorldSaveSlotMeta[];
  triggerAutoSave: (trigger: 'monthly' | 'year_end' | 'pre_tournament') => Promise<WorldSaveResult>;
  getStorageUsage: () => number;

  // --- 大会アクション ---
  startTournament: (type: TournamentType) => void;
  simulateTournament: () => void;

  // --- インタラクティブ試合（Phase 10-C） ---
  /** インタラクティブ試合完了後に呼ぶ。ブラケット更新 + 日付進行。 */
  finishInteractiveMatch: (matchResult: import('../engine/match/types').MatchResult) => WorldDayResult | null;
}

// ============================================================
// 定数
// ============================================================

const DEFAULT_MENU: PracticeMenuId = 'batting_basic';
const MAX_RECENT_RESULTS = 30;
const MAX_RECENT_NEWS = 20;

// ============================================================
// 大会ヘルパー
// ============================================================

/**
 * 自校がまだトーナメントに残っているかどうかを確認する。
 * 一度でも負けた試合がある場合は false を返す。
 */
function isPlayerSchoolInTournament(world: import('../engine/world/world-state').WorldState): boolean {
  const bracket = world.activeTournament;
  if (!bracket || bracket.isCompleted) return false;

  for (const round of bracket.rounds) {
    for (const match of round.matches) {
      if (
        (match.homeSchoolId === world.playerSchoolId || match.awaySchoolId === world.playerSchoolId) &&
        match.winnerId !== null &&
        match.winnerId !== world.playerSchoolId
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * 指定した日付が大会の試合日かどうかを確認する。
 */
function isTournamentMatchDay(
  month: number,
  day: number,
  type: 'summer' | 'autumn',
): boolean {
  if (type === 'summer') {
    if (month !== 7 || day < 10 || day >= 31) return false;
    const SUMMER_DAYS = new Set([10, 13, 17, 21, 25, 28]); // dayIdx 0,3,7,11,15,18 → actual days
    return SUMMER_DAYS.has(day);
  } else {
    // 秋大会: 9/15〜10/14 の dayIdx 0,4,9,14,20,25
    const AUTUMN_MATCH_DAYS: Array<[number, number]> = [
      [9, 15], [9, 19], [9, 24], [9, 29], [10, 5], [10, 10],
    ];
    return AUTUMN_MATCH_DAYS.some(([m, d]) => m === month && d === day);
  }
}

// ============================================================
// Zustand ストア
// ============================================================

export const useWorldStore = create<WorldStore>()(
  persist(
    (set, get) => ({
  worldState: null,
  isLoading: false,
  lastDayResult: null,
  recentResults: [],
  recentNews: [],
  _hasHydrated: false,
  _setHasHydrated: (v) => set({ _hasHydrated: v }),

  // ----------------------------------------------------------------
  // 新規ゲーム
  // ----------------------------------------------------------------
  newWorldGame: (config: NewWorldConfig) => {
    set({ isLoading: true });

    try {
      const seed = config.seed ?? generateId().replace(/-/g, '').slice(0, 16);
      const rng = createRNG(seed);

      // 仮の Team データを作成（自校）
      const playerRng = createRNG(seed + ':team');
      const reputation = 50;

      const players = [];
      for (let i = 0; i < 8; i++) {
        players.push({
          ...generatePlayer(playerRng.derive(`g3:${i}`), { enrollmentYear: -1, schoolReputation: reputation }),
          enrollmentYear: -1,
        });
      }
      for (let i = 0; i < 7; i++) {
        players.push({
          ...generatePlayer(playerRng.derive(`g2:${i}`), { enrollmentYear: 0, schoolReputation: reputation }),
          enrollmentYear: 0,
        });
      }
      for (let i = 0; i < 8; i++) {
        players.push(generatePlayer(playerRng.derive(`g1:${i}`), { enrollmentYear: 1, schoolReputation: reputation }));
      }

      const teamBase = {
        id: generateId(),
        name: config.schoolName,
        prefecture: config.prefecture,
        reputation,
        players,
        lineup: null,
        facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 },
      };
      const teamWithLineup = { ...teamBase, lineup: autoGenerateLineup(teamBase, 1) };

      const manager = {
        name: config.managerName,
        yearsActive: 0,
        fame: 10,
        totalWins: 0,
        totalLosses: 0,
        koshienAppearances: 0,
        koshienWins: 0,
      };

      const worldState = createWorldState(
        teamWithLineup,
        manager,
        config.prefecture,
        seed,
        rng,
      );

      set({ worldState, isLoading: false, recentResults: [], recentNews: [], lastDayResult: null });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  // ----------------------------------------------------------------
  // 1日進行
  // ----------------------------------------------------------------
  advanceDay: (menuId: PracticeMenuId = DEFAULT_MENU) => {
    const { worldState, recentResults, recentNews } = get();
    if (!worldState) return null;

    let currentWorld = worldState;

    // Phase 10-C: インタラクティブ試合が待機中の場合、自動でシミュレーションして消化する。
    // UI からは通常 pendingInteractiveMatch を確認して /play/match に遷移するが、
    // テストや自動進行では advanceDay を呼ぶことで自動消化できる。
    if (currentWorld.pendingInteractiveMatch && currentWorld.activeTournament) {
      const pending = currentWorld.pendingInteractiveMatch;
      const dateStr = `${currentWorld.currentDate.year}-${currentWorld.currentDate.month}-${currentWorld.currentDate.day}`;
      const autoRng = createRNG(currentWorld.seed + ':auto-sim:' + dateStr);

      // 自校の試合を自動シミュレーション（他校の試合は既にシミュレーション済み）
      const updatedTournament = simulateTournamentRound(
        currentWorld.activeTournament,
        pending.round,
        currentWorld.schools,
        autoRng,
      );

      // pending を解消した世界を作成
      currentWorld = {
        ...currentWorld,
        activeTournament: updatedTournament,
        pendingInteractiveMatch: null,
      };
    }

    const dateStr = `${currentWorld.currentDate.year}-${currentWorld.currentDate.month}-${currentWorld.currentDate.day}`;
    const rng = createRNG(currentWorld.seed + ':' + dateStr);

    // Phase 10-C: インタラクティブモードを有効にして、
    // 自校の試合日は pendingInteractiveMatch を設定して日付を止める
    const { nextWorld, result } = advanceWorldDay(currentWorld, menuId, rng, { interactive: true });

    // ニュース蓄積（最新順）
    const allNews = [...result.worldNews, ...recentNews].slice(0, MAX_RECENT_NEWS);

    // 直近結果蓄積（最新順）
    const allResults = [result, ...recentResults].slice(0, MAX_RECENT_RESULTS);

    set({
      worldState: nextWorld,
      lastDayResult: result,
      recentResults: allResults,
      recentNews: allNews,
    });

    return result;
  },

  // ----------------------------------------------------------------
  // 1週間進行
  // ----------------------------------------------------------------
  advanceWeek: (menuId: PracticeMenuId = DEFAULT_MENU) => {
    const results: WorldDayResult[] = [];
    for (let i = 0; i < 7; i++) {
      // 進行前に現在の状態を確認
      const currentWorld = get().worldState;
      if (!currentWorld) break;

      // 大会が開催中で、自校がまだ残っている場合
      if (currentWorld.activeTournament && !currentWorld.activeTournament.isCompleted) {
        const playerStillIn = isPlayerSchoolInTournament(currentWorld);
        if (playerStillIn && i > 0) {
          // 初日以降で、次の日が試合日かチェック
          const bracket = currentWorld.activeTournament;
          const type: 'summer' | 'autumn' = bracket.type === 'summer' ? 'summer' : 'autumn';
          const { month, day } = currentWorld.currentDate;
          if (isTournamentMatchDay(month, day, type)) {
            // 今日が試合日 → 停止（試合結果を表示するため）
            break;
          }
        }
      }

      const result = get().advanceDay(menuId);
      if (result) {
        results.push(result);
        // 試合結果がある場合、またはインタラクティブ試合待機になった場合は停止
        if (result.playerMatchResult) break;
        if (result.waitingForInteractiveMatch) break;
      }
    }
    return results;
  },

  // ----------------------------------------------------------------
  // ViewState 取得
  // ----------------------------------------------------------------
  getHomeView: () => {
    const { worldState, recentNews } = get();
    if (!worldState) return null;
    return projectHome(worldState, recentNews);
  },

  getTeamView: () => {
    const { worldState } = get();
    if (!worldState) return null;
    return projectTeam(worldState);
  },

  getPlayerView: (playerId: string) => {
    const { worldState } = get();
    if (!worldState) return null;
    return projectPlayer(worldState, playerId);
  },

  getScoutView: (filters: ScoutSearchFilter = {}) => {
    const { worldState } = get();
    if (!worldState) return null;
    return projectScout(worldState, filters);
  },

  getTournamentView: () => {
    const { worldState } = get();
    if (!worldState) return null;
    return projectTournament(worldState);
  },

  getResultsView: () => {
    const { worldState, recentResults } = get();
    if (!worldState) return null;
    return projectResults(worldState, recentResults);
  },

  getOBView: () => {
    const { worldState } = get();
    if (!worldState) return null;
    return projectOB(worldState);
  },

  getPracticeView: () => {
    const { worldState } = get();
    if (!worldState) return null;
    return projectPracticeView(worldState);
  },

  // ----------------------------------------------------------------
  // 練習試合アクション
  // ----------------------------------------------------------------
  schedulePracticeGame: (opponentSchoolId: string, date: GameDate) => {
    const { worldState } = get();
    if (!worldState) return { success: false, message: 'ゲームが開始されていません' };

    const result = schedulePracticeMatch(worldState, opponentSchoolId, date);
    if (typeof result === 'string') {
      const messages: Record<string, string> = {
        tournament_active: '大会期間中は練習試合を予約できません',
        date_conflict: 'その日はすでに練習試合が予約されています',
        date_too_far: '7日先より遠い日付は予約できません',
        date_past: '過去の日付には予約できません',
        opponent_not_found: '相手校が見つかりません',
        max_scheduled: '予約は最大3件までです',
      };
      return { success: false, message: messages[result] ?? '予約に失敗しました' };
    }
    set({ worldState: result });
    const opponentName = result.schools.find((s) => s.id === opponentSchoolId)?.name ?? '相手校';
    return { success: true, message: `${opponentName} との練習試合を ${date.month}月${date.day}日 に予約しました` };
  },

  scheduleIntraSquadGame: (date: GameDate) => {
    const { worldState } = get();
    if (!worldState) return { success: false, message: 'ゲームが開始されていません' };

    const result = scheduleIntraSquad(worldState, date);
    if (typeof result === 'string') {
      const messages: Record<string, string> = {
        tournament_active: '大会期間中は紅白戦を予約できません',
        date_conflict: 'その日はすでに試合が予約されています',
        date_too_far: '7日先より遠い日付は予約できません',
        date_past: '過去の日付には予約できません',
        opponent_not_found: '予約に失敗しました',
        max_scheduled: '予約は最大3件までです',
      };
      return { success: false, message: messages[result] ?? '予約に失敗しました' };
    }
    set({ worldState: result });
    return { success: true, message: `紅白戦を ${date.month}月${date.day}日 に予約しました` };
  },

  cancelPracticeGameAction: (scheduleId: string) => {
    const { worldState } = get();
    if (!worldState) return;
    set({ worldState: cancelPracticeGame(worldState, scheduleId) });
  },

  // ----------------------------------------------------------------
  // スカウトアクション
  // ----------------------------------------------------------------
  scoutVisit: (playerId: string) => {
    const { worldState } = get();
    if (!worldState) return { success: false, message: 'ゲームが開始されていません' };

    try {
      const dateStr = `${worldState.currentDate.year}-${worldState.currentDate.month}-${worldState.currentDate.day}`;
      const rng = createRNG(worldState.seed + ':scout:' + dateStr + ':' + playerId);
      const { world: newWorld, scoutReport } = conductScoutVisit(worldState, playerId, rng);
      set({ worldState: newWorld });
      return {
        success: true,
        message: `視察完了。評価: ${scoutReport.estimatedQuality}級（確度: ${Math.round(scoutReport.confidence * 100)}%）`,
      };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : '視察に失敗しました' };
    }
  },

  recruitPlayerAction: (playerId: string) => {
    const { worldState } = get();
    if (!worldState) return { success: false, message: 'ゲームが開始されていません' };

    const dateStr = `${worldState.currentDate.year}-${worldState.currentDate.month}-${worldState.currentDate.day}`;
    const rng = createRNG(worldState.seed + ':recruit:' + dateStr + ':' + playerId);
    const { world: newWorld, success, reason } = recruitPlayer(worldState, playerId, rng);
    set({ worldState: newWorld });
    return { success, message: reason };
  },

  addToWatch: (playerId: string) => {
    const { worldState } = get();
    if (!worldState) return;
    set({ worldState: addToWatchList(worldState, playerId) });
  },

  removeFromWatch: (playerId: string) => {
    const { worldState } = get();
    if (!worldState) return;
    set({ worldState: removeFromWatchList(worldState, playerId) });
  },

  // ----------------------------------------------------------------
  // 一時休養 (Issue #5)
  // ----------------------------------------------------------------
  setRestOverride: (playerIds: string[]) => {
    const { worldState } = get();
    if (!worldState || playerIds.length === 0) return { count: 0 };

    const targetIds = new Set(playerIds);
    const today = worldState.currentDate;
    let count = 0;

    const newSchools = worldState.schools.map((school) => {
      if (school.id !== worldState.playerSchoolId) return school;
      const newPlayers = school.players.map((p) => {
        if (!targetIds.has(p.id)) return p;
        if (p.restOverride) return p; // 既にセット済みはスキップ
        count++;
        return { ...p, restOverride: { remainingDays: 1, setOn: today } };
      });
      return { ...school, players: newPlayers, _summary: null };
    });

    set({ worldState: { ...worldState, schools: newSchools } });
    return { count };
  },

  restAllInjuredAndWarned: () => {
    const { worldState } = get();
    if (!worldState) return { count: 0 };

    const playerSchool = worldState.schools.find((s) => s.id === worldState.playerSchoolId);
    if (!playerSchool) return { count: 0 };

    // けが人 = injury != null、けが注意 = fatigue >= 50
    const targetIds = playerSchool.players
      .filter((p) => p.condition.injury !== null || p.condition.fatigue >= 50)
      .map((p) => p.id);

    return get().setRestOverride(targetIds);
  },

  // ----------------------------------------------------------------
  // セーブ/ロード
  // ----------------------------------------------------------------
  saveGame: async (slotId: WorldSaveSlotId, displayName: string) => {
    const { worldState } = get();
    if (!worldState) return { success: false, error: 'ゲームが開始されていません' };
    return saveWorldState(slotId, worldState, displayName);
  },

  loadGame: async (slotId: WorldSaveSlotId) => {
    const result = await loadWorldState(slotId);
    if (result.success && result.world) {
      set({
        worldState: result.world,
        recentResults: [],
        recentNews: [],
        lastDayResult: null,
      });
    }
    return result;
  },

  deleteSave: (slotId: WorldSaveSlotId) => {
    deleteWorldSave(slotId);
  },

  listSaves: () => listWorldSaves(),

  triggerAutoSave: async (trigger: 'monthly' | 'year_end' | 'pre_tournament') => {
    const { worldState } = get();
    if (!worldState) return { success: false, error: 'ゲームが開始されていません' };
    switch (trigger) {
      case 'monthly':        return autoSaveMonthly(worldState);
      case 'year_end':       return autoSaveYearEnd(worldState);
      case 'pre_tournament': return autoSavePreTournament(worldState);
    }
  },

  getStorageUsage: () => getStorageUsedBytes(),

  // ----------------------------------------------------------------
  // 大会
  // ----------------------------------------------------------------
  startTournament: (type: TournamentType) => {
    const { worldState } = get();
    if (!worldState) return;

    const date = worldState.currentDate;
    const id = `tournament-${type}-${date.year}-${date.month}`;
    const rng = createRNG(worldState.seed + ':tournament:' + id);

    const bracket = createTournamentBracket(
      id,
      type,
      date.year,
      worldState.schools,
      rng,
    );

    set({ worldState: { ...worldState, activeTournament: bracket } });
  },

  simulateTournament: () => {
    const { worldState } = get();
    if (!worldState || !worldState.activeTournament) return;

    const rng = createRNG(worldState.seed + ':sim-tournament:' + worldState.activeTournament.id);
    const completed = simulateFullTournament(
      worldState.activeTournament,
      worldState.schools,
      rng,
    );

    const existingHistory = worldState.tournamentHistory ?? [];
    const alreadyInHistory = existingHistory.some((t) => t.id === completed.id);
    const history = alreadyInHistory
      ? existingHistory
      : [...existingHistory, completed].slice(-10);

    // 【バグ修正】完了後は activeTournament を null にする。
    // 旧実装では activeTournament: completed（isCompleted=true）を残していたため、
    // 9/15 の秋大会生成条件 (!nextWorld.activeTournament) が満たされなかった。
    set({
      worldState: {
        ...worldState,
        activeTournament: null,
        tournamentHistory: history,
      },
    });
  },

  // ----------------------------------------------------------------
  // インタラクティブ試合完了（Phase 10-C）
  // ----------------------------------------------------------------
  finishInteractiveMatch: (matchResult: import('../engine/match/types').MatchResult) => {
    const { worldState, recentResults, recentNews } = get();
    if (!worldState) return null;

    const dateStr = `${worldState.currentDate.year}-${worldState.currentDate.month}-${worldState.currentDate.day}`;
    const rng = createRNG(worldState.seed + ':interactive-match:' + dateStr);

    const { nextWorld, result } = completeInteractiveMatch(worldState, matchResult, rng);

    // ニュース蓄積
    const allNews = [...result.worldNews, ...recentNews].slice(0, MAX_RECENT_NEWS);
    // 直近結果蓄積
    const allResults = [result, ...recentResults].slice(0, MAX_RECENT_RESULTS);

    set({
      worldState: nextWorld,
      lastDayResult: result,
      recentResults: allResults,
      recentNews: allNews,
    });

    return result;
  },
}),
    {
      name: 'koushien-active-game',
      // worldState のみ永続化（関数やUI一時状態は不要）
      partialize: (state) => ({
        worldState: state.worldState,
      }),
      // 復元完了時に _hasHydrated=true を立てる。
      // これで UI 側が「persist hydrate 前の null」と「本当に未開始」を区別できる。
      // (2026-04-19 リロードで /new-game に飛ぶバグ対応)
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hasHydrated = true;
        }
      },
      storage: {
        getItem: (name) => {
          if (typeof window === 'undefined') return null;
          const raw = localStorage.getItem(name);
          if (!raw) return null;
          try {
            const parsed = JSON.parse(raw);
            // deserialize: Map フィールドを復元
            if (parsed.state?.worldState) {
              const ws = parsed.state.worldState;
              const deserialized = deserializeWS(JSON.stringify(ws));

              // 【セーブ移行】既存セーブ救済: isCompleted=true の activeTournament が残っていたら自動クリーンアップ
              if (deserialized.activeTournament && deserialized.activeTournament.isCompleted) {
                const stale = deserialized.activeTournament;
                const existingHistory = deserialized.tournamentHistory ?? [];
                const alreadyInHistory = existingHistory.some((t: { id: string }) => t.id === stale.id);
                const newHistory = alreadyInHistory ? existingHistory : [...existingHistory, stale].slice(-10);
                parsed.state.worldState = {
                  ...deserialized,
                  activeTournament: null,
                  tournamentHistory: newHistory,
                };
              } else {
                parsed.state.worldState = deserialized;
              }
            }
            return parsed;
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          if (typeof window === 'undefined') return;
          try {
            // serialize: Map → plain object 変換
            const toStore = { ...value };
            if (toStore.state?.worldState) {
              const serialized = JSON.parse(serializeWS(toStore.state.worldState));
              toStore.state = { ...toStore.state, worldState: serialized };
            }
            localStorage.setItem(name, JSON.stringify(toStore));
          } catch {
            // ストレージ容量超過等はサイレント
          }
        },
        removeItem: (name) => {
          if (typeof window === 'undefined') return;
          localStorage.removeItem(name);
        },
      },
    },
  ),
);
