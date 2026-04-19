/**
 * match-store.ts — インタラクティブ試合画面用 Zustand ストア
 *
 * Phase 10-B: 試合画面で使用する状態管理。
 * MatchRunner をメモリ上で保持し、UIに MatchViewState を提供する。
 * persist ミドルウェアは使用しない（試合中はメモリのみ）。
 */

import { create } from 'zustand';
import type { MatchState, MatchResult, TacticalOrder } from '../engine/match/types';
import type { RunnerMode, PauseReason } from '../engine/match/runner-types';
import type { PitchLogEntry, MatchViewState } from '../ui/projectors/view-state-types';
import { MatchRunner } from '../engine/match/runner';
import { cpuAutoTactics } from '../engine/match/tactics';
import { projectMatch } from '../ui/projectors/matchProjector';
import { createRNG } from '../engine/core/rng';
import { buildNarrationForPitch, buildNarrationForAtBat } from '../ui/narration/buildNarration';
import type { NarrationEntry } from '../ui/narration/buildNarration';
import { serializeMatchState, deserializeMatchState } from '../engine/match/serialize';

// ============================================================
// 型定義
// ============================================================

export interface MatchStoreState {
  // --- 試合エンジン（メモリのみ、persist しない） ---
  /** MatchRunner インスタンス（null = 試合未開始） */
  runner: MatchRunner | null;
  /** プレイヤー校 ID */
  playerSchoolId: string;
  /** ゲームシード（RNG 用） */
  gameSeed: string;

  // --- UI 状態 ---
  runnerMode: RunnerMode;
  pauseReason: PauseReason | null;
  pitchLog: PitchLogEntry[];

  // --- 実況ログ（最新30件） ---
  narration: NarrationEntry[];

  // --- 自動進行 ---
  autoPlayEnabled: boolean;
  /** 'slow' = 2s/打席, 'normal' = 1s/打席, 'fast' = 0.3s/打席 */
  autoPlaySpeed: 'slow' | 'normal' | 'fast';

  // --- 試合結果（試合終了後に格納） ---
  matchResult: MatchResult | null;

  // --- ローディング ---
  isProcessing: boolean;
}

export interface MatchStoreActions {
  /** 試合を初期化する */
  initMatch: (
    initialState: MatchState,
    playerSchoolId: string,
    seed: string,
  ) => void;

  /** 試合をリセット（ホームへ戻る前に呼ぶ） */
  resetMatch: () => void;

  /**
   * 現在の試合状態をスナップショット化する (Issue #8 2026-04-19)。
   * ホームに戻って再開する時のための dump。
   * @returns MatchState / narration / pitchLog を JSON 文字列化したもの
   */
  dumpSnapshot: () => {
    matchStateJson: string;
    narrationJson: string;
    pitchLogJson: string;
  } | null;

  /**
   * スナップショットから試合を復元する (Issue #8 2026-04-19)。
   * 新しい MatchRunner を serialized state で初期化。RNG state は
   * 新しく seed から作成される (決定論性は失うが体験上問題なし)。
   */
  restoreFromSnapshot: (
    snapshot: {
      matchStateJson: string;
      narrationJson: string;
      pitchLogJson: string;
    },
    playerSchoolId: string,
    seed: string,
  ) => void;

  /** 現在の ViewState を取得する */
  getMatchView: () => MatchViewState | null;

  /** TimeMode を切り替える */
  setTimeMode: (mode: RunnerMode['time']) => void;

  /** PitchMode を切り替える */
  setPitchMode: (mode: RunnerMode['pitch']) => void;

  /** 采配を適用する */
  applyOrder: (order: TacticalOrder) => { applied: boolean; reason?: string };

  /** 1球進める */
  stepOnePitch: () => void;

  /** 1打席完了まで進める */
  stepOneAtBat: () => void;

  /** 1イニング完了まで進める */
  stepOneInning: () => void;

  /** 試合終了まで一気に進める */
  runToEnd: () => void;

  /** 停止状態を解除して進行を再開する */
  resumeFromPause: () => void;

  /** 自動進行のON/OFF切り替え */
  toggleAutoPlay: () => void;
  /** 自動進行スピードを設定 */
  setAutoPlaySpeed: (speed: 'slow' | 'normal' | 'fast') => void;
  /** 実況ログをクリア */
  clearNarration: () => void;
}

type MatchStore = MatchStoreState & MatchStoreActions;

// ============================================================
// 初期状態
// ============================================================

const INITIAL_STATE: MatchStoreState = {
  runner: null,
  playerSchoolId: '',
  gameSeed: '',
  runnerMode: { time: 'standard', pitch: 'on' },
  pauseReason: null,
  pitchLog: [],
  narration: [],
  autoPlayEnabled: true,
  autoPlaySpeed: 'normal',
  matchResult: null,
  isProcessing: false,
};

const NARRATION_MAX = 30;

// ============================================================
// ヘルパー：PauseReason を再評価する
// ============================================================

function evaluatePause(
  runner: MatchRunner,
  mode: RunnerMode,
): PauseReason | null {
  return runner.shouldPause(mode);
}

// ============================================================
// Zustand ストア
// ============================================================

export const useMatchStore = create<MatchStore>((set, get) => ({
  ...INITIAL_STATE,

  // ----------------------------------------------------------------
  // 初期化
  // ----------------------------------------------------------------
  initMatch: (initialState: MatchState, playerSchoolId: string, seed: string) => {
    const runner = new MatchRunner(
      initialState,
      cpuAutoTactics,
      playerSchoolId,
    );

    const { runnerMode } = get();
    const pauseReason = evaluatePause(runner, runnerMode);

    set({
      runner,
      playerSchoolId,
      gameSeed: seed,
      pauseReason,
      pitchLog: [],
      matchResult: null,
      isProcessing: false,
    });
  },

  // ----------------------------------------------------------------
  // リセット
  // ----------------------------------------------------------------
  resetMatch: () => {
    set({ ...INITIAL_STATE });
  },

  // ----------------------------------------------------------------
  // スナップショット (Issue #8 2026-04-19)
  // ----------------------------------------------------------------
  dumpSnapshot: () => {
    const { runner, pitchLog, narration } = get();
    if (!runner) return null;
    const state = runner.getState();
    return {
      matchStateJson: serializeMatchState(state),
      narrationJson: JSON.stringify(narration),
      pitchLogJson: JSON.stringify(pitchLog),
    };
  },

  restoreFromSnapshot: (snapshot, playerSchoolId, seed) => {
    const matchState = deserializeMatchState(snapshot.matchStateJson);
    const runner = new MatchRunner(matchState, cpuAutoTactics, playerSchoolId);

    let narration: NarrationEntry[] = [];
    try {
      narration = JSON.parse(snapshot.narrationJson) as NarrationEntry[];
    } catch {
      narration = [];
    }

    let pitchLog: PitchLogEntry[] = [];
    try {
      pitchLog = JSON.parse(snapshot.pitchLogJson) as PitchLogEntry[];
    } catch {
      pitchLog = [];
    }

    const { runnerMode } = get();
    const pauseReason = evaluatePause(runner, runnerMode);

    set({
      runner,
      playerSchoolId,
      gameSeed: seed,
      pauseReason,
      pitchLog,
      narration,
      matchResult: null,
      isProcessing: false,
    });
  },

  // ----------------------------------------------------------------
  // ViewState 取得
  // ----------------------------------------------------------------
  getMatchView: () => {
    const { runner, playerSchoolId, runnerMode, pitchLog, pauseReason } = get();
    if (!runner) return null;

    return projectMatch(
      runner.getState(),
      playerSchoolId,
      runnerMode,
      pitchLog,
      pauseReason,
    );
  },

  // ----------------------------------------------------------------
  // モード切り替え
  // ----------------------------------------------------------------
  setTimeMode: (time: RunnerMode['time']) => {
    const { runner, runnerMode } = get();
    const newMode: RunnerMode = { ...runnerMode, time };
    const pauseReason = runner ? evaluatePause(runner, newMode) : null;
    set({ runnerMode: newMode, pauseReason });
  },

  setPitchMode: (pitch: RunnerMode['pitch']) => {
    const { runner, runnerMode } = get();
    const newMode: RunnerMode = { ...runnerMode, pitch };
    const pauseReason = runner ? evaluatePause(runner, newMode) : null;
    set({ runnerMode: newMode, pauseReason });
  },

  // ----------------------------------------------------------------
  // 采配
  // ----------------------------------------------------------------
  applyOrder: (order: TacticalOrder) => {
    const { runner } = get();
    if (!runner) return { applied: false, reason: '試合が開始されていません' };

    const result = runner.applyPlayerOrder(order);
    if (result.applied) {
      // 即時適用采配後（代打・継投等）はビューを更新
      const { runnerMode } = get();
      const pauseReason = evaluatePause(runner, runnerMode);
      set({ pauseReason });
    }
    return result;
  },

  // ----------------------------------------------------------------
  // 1球進行
  // ----------------------------------------------------------------
  stepOnePitch: () => {
    const { runner, runnerMode, pitchLog, narration, gameSeed } = get();
    if (!runner || runner.isOver()) return;

    set({ isProcessing: true });

    try {
      const stateBefore = runner.getState();
      const dateKey = `match:${Date.now()}`;
      const rng = createRNG(gameSeed + ':' + dateKey);

      const battingTeam = stateBefore.currentHalf === 'top'
        ? stateBefore.awayTeam
        : stateBefore.homeTeam;
      const batterId = battingTeam.battingOrder[stateBefore.currentBatterIndex];
      const batterMP = battingTeam.players.find((mp) => mp.player.id === batterId);
      const batterName = batterMP
        ? `${batterMP.player.lastName}${batterMP.player.firstName}`
        : '不明';

      const { pitchResult } = runner.stepOnePitch(rng);
      const newState = runner.getState();

      // 投球ログに追加
      const logEntry: PitchLogEntry = {
        inning: stateBefore.currentInning,
        half: stateBefore.currentHalf,
        pitchType: pitchResult.pitchSelection.type,
        outcome: pitchResult.outcome,
        location: {
          row: pitchResult.actualLocation.row,
          col: pitchResult.actualLocation.col,
        },
        batterId,
        batterName,
      };
      const newLog = [...pitchLog, logEntry].slice(-50);

      // 実況ログ
      const narrationEntries = buildNarrationForPitch(stateBefore, newState, pitchResult);
      const newNarration = [...narration, ...narrationEntries].slice(-NARRATION_MAX);

      const matchResult = newState.isOver ? newState.result : null;
      const pauseReason = evaluatePause(runner, runnerMode);

      set({
        pitchLog: newLog,
        narration: newNarration,
        pauseReason,
        matchResult: matchResult ?? null,
        isProcessing: false,
      });
    } catch {
      set({ isProcessing: false });
    }
  },

  // ----------------------------------------------------------------
  // 1打席進行
  // ----------------------------------------------------------------
  stepOneAtBat: () => {
    const { runner, runnerMode, pitchLog, narration, gameSeed } = get();
    if (!runner || runner.isOver()) return;

    set({ isProcessing: true });

    try {
      const stateBefore = runner.getState();
      const dateKey = `match-ab:${Date.now()}`;
      const rng = createRNG(gameSeed + ':' + dateKey);

      const battingTeam = stateBefore.currentHalf === 'top'
        ? stateBefore.awayTeam
        : stateBefore.homeTeam;
      const batterId = battingTeam.battingOrder[stateBefore.currentBatterIndex];
      const batterMP = battingTeam.players.find((mp) => mp.player.id === batterId);
      const batterName = batterMP
        ? `${batterMP.player.lastName}${batterMP.player.firstName}`
        : '不明';

      const { atBatResult } = runner.stepOneAtBat(rng);
      const newState = runner.getState();

      // 打席内の全投球をログに追加
      const newEntries: PitchLogEntry[] = atBatResult.pitches.map((p) => ({
        inning: stateBefore.currentInning,
        half: stateBefore.currentHalf,
        pitchType: p.pitchSelection.type,
        outcome: p.outcome,
        location: { row: p.actualLocation.row, col: p.actualLocation.col },
        batterId,
        batterName,
      }));
      const newLog = [...pitchLog, ...newEntries].slice(-50);

      // 実況ログ
      const narrationEntries = buildNarrationForAtBat(stateBefore, newState, atBatResult);
      const newNarration = [...narration, ...narrationEntries].slice(-NARRATION_MAX);

      const matchResult = newState.isOver ? newState.result : null;
      const pauseReason = evaluatePause(runner, runnerMode);

      set({
        pitchLog: newLog,
        narration: newNarration,
        pauseReason,
        matchResult: matchResult ?? null,
        isProcessing: false,
      });
    } catch {
      set({ isProcessing: false });
    }
  },

  // ----------------------------------------------------------------
  // 1イニング進行
  // ----------------------------------------------------------------
  stepOneInning: () => {
    const { runner, runnerMode, pitchLog, gameSeed } = get();
    if (!runner || runner.isOver()) return;

    set({ isProcessing: true });

    try {
      const dateKey = `match-inn:${Date.now()}`;
      const rng = createRNG(gameSeed + ':' + dateKey);

      runner.stepOneInning(rng);

      const newState = runner.getState();
      const matchResult = newState.isOver ? newState.result : null;
      const pauseReason = evaluatePause(runner, runnerMode);

      set({
        pitchLog: pitchLog.slice(-50),
        pauseReason,
        matchResult: matchResult ?? null,
        isProcessing: false,
      });
    } catch {
      set({ isProcessing: false });
    }
  },

  // ----------------------------------------------------------------
  // 試合終了まで自動進行
  // ----------------------------------------------------------------
  runToEnd: () => {
    const { runner, gameSeed } = get();
    if (!runner || runner.isOver()) return;

    set({ isProcessing: true });

    try {
      const dateKey = `match-end:${Date.now()}`;
      const rng = createRNG(gameSeed + ':' + dateKey);

      const result = runner.runToEnd(rng);

      set({
        pauseReason: { kind: 'match_end' },
        matchResult: result,
        isProcessing: false,
      });
    } catch {
      set({ isProcessing: false });
    }
  },

  // ----------------------------------------------------------------
  // 停止解除
  // ----------------------------------------------------------------
  resumeFromPause: () => {
    set({ pauseReason: null });
  },

  // ----------------------------------------------------------------
  // 自動進行
  // ----------------------------------------------------------------
  toggleAutoPlay: () => {
    set((state) => ({ autoPlayEnabled: !state.autoPlayEnabled }));
  },

  setAutoPlaySpeed: (speed) => {
    set({ autoPlaySpeed: speed });
  },

  clearNarration: () => {
    set({ narration: [] });
  },
}));
