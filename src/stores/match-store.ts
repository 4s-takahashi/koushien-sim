/**
 * match-store.ts — インタラクティブ試合画面用 Zustand ストア
 *
 * Phase 10-B: 試合画面で使用する状態管理。
 * MatchRunner をメモリ上で保持し、UIに MatchViewState を提供する。
 * persist ミドルウェアを使用して localStorage に試合状態を保存する。
 * （画面リロード・遷移後のスコアボード初期化バグ修正 v0.23.0）
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { MatchState, MatchResult, TacticalOrder } from '../engine/match/types';
import type { AnalystComment } from '../engine/staff/analyst';
import { generateAnalystCommentFromManagers } from '../engine/staff/analyst';
import type { Manager } from '../engine/types/manager-staff';
import type { RunnerMode, PauseReason } from '../engine/match/runner-types';
import type { PitchLogEntry, MatchViewState, PitchLocationLabel, EnrichedPitchType } from '../ui/projectors/view-state-types';
import { MatchRunner } from '../engine/match/runner';
import { cpuAutoTactics } from '../engine/match/tactics';
import { projectMatch } from '../ui/projectors/matchProjector';
import { createRNG } from '../engine/core/rng';
import { buildNarrationForPitch, buildNarrationForAtBat } from '../ui/narration/buildNarration';
import type { NarrationEntry } from '../ui/narration/buildNarration';
import { serializeMatchState, deserializeMatchState } from '../engine/match/serialize';
import {
  generatePitchMonologues,
  buildBatterOverridesFromEffects,
  buildPitcherOverridesFromEffects,
  hasIgnoreOrderEffect,
} from '../engine/psyche/generator';
import type { PitchContext, OrderConditionType } from '../engine/psyche/types';
import type { TraitId } from '../engine/types/player';
import type { MatchOverrides } from '../engine/match/runner-types';

// ============================================================
// 型定義
// ============================================================

export interface MatchStoreState {
  // --- 試合エンジン（メモリのみ、persist しない） ---
  /** MatchRunner インスタンス（null = 試合未開始） */
  runner: MatchRunner | null;
  /**
   * persist 復元用: MatchState の JSON 文字列。
   * partialize で serializeMatchState() から生成し、
   * onRehydrateStorage で deserializeMatchState() して runner を再生成する。
   * 通常の UI からは参照しない内部フィールド。
   */
  matchStateJson: string | null;
  /**
   * persist の hydration が完了したかどうか。
   * onRehydrateStorage で true に設定される。
   * ページ側が「既にランナーが復元済み」かを判断するために使用。
   */
  _hasHydrated: boolean;
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

  // --- 自動進行（旧 autoPlay、後方互換のため残す） ---
  autoPlayEnabled: boolean;
  /** 'slow' = 10s, 'normal' = 5s (標準), 'fast' = 3s — autoAdvance と連動 */
  autoPlaySpeed: 'slow' | 'normal' | 'fast';

  // --- Phase 12-H: 新自動進行モード ---
  /** 自動進行 ON/OFF */
  autoAdvance: boolean;
  /** 次の自動実行タイムスタンプ (Date.now() + delay)。null = タイマー未セット */
  nextAutoAdvanceAt: number | null;
  /** 次の1球/打席用に事前選択された指示 */
  pendingNextOrder: TacticalOrder | null;

  // --- 試合結果（試合終了後に格納） ---
  matchResult: MatchResult | null;

  // --- ローディング ---
  isProcessing: boolean;

  // --- 現在の采配指示（Phase 7-B/7-C） ---
  /** applyOrder で設定、次の投球時に参照される */
  currentOrder: TacticalOrder;

  // --- Phase 7-E3: モノローグ連続重複回避 ---
  /** 直近のモノローグID（最新5件、セッションメモリのみ・保存不要） */
  recentMonologueIds: string[];

  // --- Phase 7-F: 直前采配の記憶（詳細采配モーダル用プリセレクト） ---
  /** 直前に適用した詳細采配 (batter_detailed / pitcher_detailed)。新打者に変わるとリセット */
  lastOrder: TacticalOrder | null;

  // --- Phase 12-K: アナリストコメント ---
  /** イニング切れ目で生成されたアナリストコメント一覧 */
  analystComments: AnalystComment[];
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

  // --- Phase 12-K: アナリストコメントアクション ---
  /**
   * イニング終了時にアナリストコメントを生成して追加する。
   * @param inning 終了したイニング番号
   * @param half 終了した表/裏
   * @param managers プレイヤー校のマネージャー一覧
   */
  addAnalystComment: (inning: number, half: 'top' | 'bottom', managers: Manager[]) => void;

  // --- Phase 12-H: 新自動進行アクション ---
  /** 自動進行 ON/OFF を設定する */
  setAutoAdvance: (enabled: boolean) => void;
  /** 次の1球/打席用の事前指示をセットする */
  setPendingNextOrder: (order: TacticalOrder | null) => void;
  /**
   * step 実行時に pendingNextOrder を消費して返す。
   * 消費後は null にリセットされる。
   */
  consumeNextOrder: () => TacticalOrder | null;
}

type MatchStore = MatchStoreState & MatchStoreActions;

// ============================================================
// 初期状態
// ============================================================

const INITIAL_STATE: MatchStoreState = {
  runner: null,
  matchStateJson: null,
  _hasHydrated: false,
  playerSchoolId: '',
  gameSeed: '',
  runnerMode: { time: 'standard', pitch: 'on' },
  pauseReason: null,
  pitchLog: [],
  narration: [],
  autoPlayEnabled: true,
  autoPlaySpeed: 'normal',
  autoAdvance: false,
  nextAutoAdvanceAt: null,
  pendingNextOrder: null,
  matchResult: null,
  isProcessing: false,
  currentOrder: { type: 'none' },
  recentMonologueIds: [],
  lastOrder: null,
  analystComments: [],
};

// Phase 7-E3: 直近モノローグID リングバッファのサイズ
const RECENT_MONOLOGUE_RING_SIZE = 5;

/**
 * Phase 7-E3: 直近モノローグIDを更新する（リングバッファ）
 */
function updateRecentMonologueIds(
  current: string[],
  newIds: string[],
): string[] {
  const updated = [...current, ...newIds];
  return updated.slice(-RECENT_MONOLOGUE_RING_SIZE);
}

/**
 * Phase 7-E1/7-E2: モノローグの MentalEffect を集計して MatchOverrides を構築する。
 * また ignoreOrder フラグ（7-E2）を検出する。
 */
function buildMatchOverridesFromMonologues(
  monologues: ReturnType<typeof generatePitchMonologues>,
): { overrides: MatchOverrides; shouldIgnoreOrder: boolean } {
  const { batterEffects, pitcherEffects } = monologues;

  const batterRaw = buildBatterOverridesFromEffects(batterEffects);
  const pitcherRaw = buildPitcherOverridesFromEffects(pitcherEffects);

  const overrides: MatchOverrides = {
    batterMental: {
      contactBonus: batterRaw.contactBonus,
      powerBonus: batterRaw.powerBonus,
      swingAggressionBonus: batterRaw.swingAggressionBonus,
    },
    pitcherMental: {
      velocityBonus: pitcherRaw.velocityBonus,
      controlBonus: pitcherRaw.controlBonus,
    },
  };

  // Phase 7-E2: ignoreOrder チェック（打者・投手両方のエフェクトを対象）
  const shouldIgnoreOrder = hasIgnoreOrderEffect([...batterEffects, ...pitcherEffects]);

  return { overrides, shouldIgnoreOrder };
}

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
// ヘルパー：投球情報の変換（Phase 7-A-2）
// ============================================================

/**
 * PitchLocation の row/col（0-4 の5段階グリッド）を
 * 9ゾーンの PitchLocationLabel に変換する。
 * ボールゾーン（row=0,4 / col=0,4）は最近傍のゾーン内にクランプ。
 */
function toPitchLocationLabel(row: number, col: number): PitchLocationLabel {
  // 1-3 の範囲にクランプ（ゾーン内: 1=端, 2=中, 3=反対端）
  const r = Math.max(1, Math.min(3, row));
  const c = Math.max(1, Math.min(3, col));
  const vertical: string = r === 1 ? 'high' : r === 3 ? 'low' : 'middle';
  const horizontal: string = c === 1 ? 'inside' : c === 3 ? 'outside' : 'middle';
  return `${horizontal}_${vertical}` as PitchLocationLabel;
}

/**
 * runner 内部の球種文字列を EnrichedPitchType に変換する。
 * 未知の球種は 'fastball' にフォールバック。
 */
function toEnrichedPitchType(type: string): EnrichedPitchType {
  const map: Record<string, EnrichedPitchType> = {
    fastball:  'fastball',
    slider:    'slider',
    curve:     'curveball',
    curveball: 'curveball',
    changeup:  'changeup',
    fork:      'splitter',
    splitter:  'splitter',
    cutter:    'slider',
    sinker:    'fastball',
  };
  return map[type] ?? 'fastball';
}

/**
 * pitchSelection.velocity (能力値) を km/h として返す。
 * select-pitch.ts で変化球時は velocity * 0.9 が渡されるため、
 * ここでは受け取った値をそのまま四捨五入する。
 */
function toPitchSpeedKmh(velocity: number): number {
  return Math.round(velocity);
}

// ============================================================
// Phase 12 追加ヘルパー
// ============================================================

/**
 * Phase 12-B: 球種 → 変化方向ベクトル（右投げ基準）
 */
const PITCH_BREAK_DIRECTION_RHP: Record<string, { dx: number; dy: number } | null> = {
  fastball: null,
  curve: { dx: 0.3, dy: 1 },
  curveball: { dx: 0.3, dy: 1 },
  slider: { dx: 1, dy: 0.3 },
  fork: { dx: 0, dy: 1.2 },
  changeup: { dx: 0.2, dy: 0.8 },
  cutter: { dx: -0.5, dy: 0.2 },
  sinker: { dx: 0.3, dy: 1 },
  splitter: { dx: 0, dy: 1.2 },
};

/**
 * 球種と投手の利き手から変化方向ベクトルを計算する
 * （左投げは dx を反転）
 */
function computeBreakDirection(
  pitchType: string,
  pitcherHand: 'left' | 'right',
): { dx: number; dy: number } | null {
  const dir = PITCH_BREAK_DIRECTION_RHP[pitchType.toLowerCase()];
  if (!dir) return null;
  return pitcherHand === 'left' ? { dx: -dir.dx, dy: dir.dy } : dir;
}

/**
 * Phase 12-B: ピッチ位置 (5×5グリッド) → UV 座標 (0-1)
 */
function pitchLocationToUV(row: number, col: number): { x: number; y: number } {
  const rowMap = [0.05, 0.2, 0.5, 0.8, 0.95];
  const colMap = [0.05, 0.2, 0.5, 0.8, 0.95];
  return {
    x: colMap[col] ?? 0.5,
    y: rowMap[row] ?? 0.5,
  };
}

/**
 * Phase 12-B: バッターのアクションがスイングかどうかを判定
 */
function isSwingAction(batterAction: string): boolean {
  return batterAction === 'swing' || batterAction === 'bunt' || batterAction === 'check_swing';
}

// ============================================================
// ヘルパー：ランナー状況を分類する（Phase 7-B）
// ============================================================

function toRunnersOnCategory(
  state: MatchState,
): 'none' | 'some' | 'scoring' | 'bases_loaded' {
  const { first, second, third } = state.bases;
  if (!first && !second && !third) return 'none';
  if (first && second && third) return 'bases_loaded';
  if (second || third) return 'scoring';
  return 'some';
}

/**
 * TacticalOrder を OrderConditionType に変換する（Phase 7-B）
 * 詳細采配（7-C）が実装されたら拡張する。
 */
function toOrderConditionType(order: TacticalOrder): OrderConditionType | null {
  if (order.type === 'none') return null;
  if (order.type === 'bunt') return 'passive';
  if (order.type === 'steal') return 'aggressive';
  if (order.type === 'hit_and_run') return 'aggressive';
  if (order.type === 'intentional_walk') return 'passive';
  // 7-C で batter_detailed / pitcher_detailed が追加される
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderAny = order as any;
  if (orderAny.type === 'batter_detailed') {
    if (orderAny.focusArea === 'outside') return 'outside_focus';
    if (orderAny.focusArea === 'inside') return 'inside_focus';
    if (orderAny.aggressiveness === 'aggressive') return 'aggressive';
    if (orderAny.aggressiveness === 'passive') return 'passive';
    return 'detailed_focus';
  }
  if (orderAny.type === 'pitcher_detailed') {
    if (orderAny.pitchMix === 'fastball_heavy') return 'fastball_heavy';
    if (orderAny.pitchMix === 'breaking_heavy') return 'breaking_heavy';
    if (orderAny.intimidation === 'brush_back') return 'brush_back';
    if (orderAny.focusArea === 'outside') return 'outside_focus';
    if (orderAny.focusArea === 'inside') return 'inside_focus';
    return 'detailed_focus';
  }
  return null;
}

/**
 * MatchState から PitchContext を生成する（Phase 7-B）
 */
function buildPitchContext(
  state: MatchState,
  currentOrder: TacticalOrder,
): PitchContext {
  const battingTeam = state.currentHalf === 'top' ? state.awayTeam : state.homeTeam;
  const pitchingTeam = state.currentHalf === 'top' ? state.homeTeam : state.awayTeam;

  const batterId = battingTeam.battingOrder[state.currentBatterIndex];
  const batterMP = battingTeam.players.find((mp) => mp.player.id === batterId);
  const batterTraits: TraitId[] = batterMP ? (batterMP.player.traits as TraitId[]) : [];

  const pitcherId = pitchingTeam.currentPitcherId;
  const pitcherMP = pitchingTeam.players.find((mp) => mp.player.id === pitcherId);
  const pitcherTraits: TraitId[] = pitcherMP ? (pitcherMP.player.traits as TraitId[]) : [];
  const pitcherStamina = pitcherMP ? pitcherMP.stamina : 100;

  const scoreDiff =
    state.currentHalf === 'top'
      ? state.score.away - state.score.home   // 攻撃側（away）から見た得点差
      : state.score.home - state.score.away;  // 攻撃側（home）から見た得点差

  const orderType = toOrderConditionType(currentOrder);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderAny = currentOrder as any;
  const orderFocusArea: string | undefined = orderAny.focusArea ?? orderAny.pitchMix;

  return {
    inning: state.currentInning,
    half: state.currentHalf,
    outs: state.outs,
    balls: state.count.balls,
    strikes: state.count.strikes,
    runnersOn: toRunnersOnCategory(state),
    scoreDiff,
    isKoshien: state.config.isKoshien,
    batterTraits,
    pitcherTraits,
    pitcherStamina,
    orderType,
    orderFocusArea,
  };
}

// ============================================================
// persist 用ストレージキーとバージョン
// ============================================================

const MATCH_STORE_KEY = 'koushien-sim-match';
/** バージョン不整合時に全リセットするための番号 */
const MATCH_STORE_VERSION = 1;

/**
 * 永続化対象の部分状態型
 * runner は MatchRunner インスタンスなので JSON 化できない。
 * 代わりに matchStateJson を永続化し、復元時に runner を再生成する。
 */
interface MatchPersistedState {
  /** MatchState の JSON 文字列（serialize/deserialize で Map/Set を変換） */
  matchStateJson: string | null;
  playerSchoolId: string;
  gameSeed: string;
  runnerMode: RunnerMode;
  pauseReason: PauseReason | null;
  pitchLog: PitchLogEntry[];
  narration: NarrationEntry[];
  autoPlayEnabled: boolean;
  autoPlaySpeed: 'slow' | 'normal' | 'fast';
  matchResult: MatchResult | null;
  currentOrder: TacticalOrder;
  recentMonologueIds: string[];
  lastOrder: TacticalOrder | null;
  // Phase 12-H
  autoAdvance: boolean;
  pendingNextOrder: TacticalOrder | null;
  // Phase 12-K
  analystComments: AnalystComment[];
}

// ============================================================
// Zustand ストア
// ============================================================

export const useMatchStore = create<MatchStore>()(
  persist(
    (set, get) => ({
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
      analystComments: [],
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
    // Phase 7-F: 詳細采配（batter_detailed / pitcher_detailed）は lastOrder に記憶する
    const isDetailedOrder = order.type === 'batter_detailed' || order.type === 'pitcher_detailed';
    if (result.applied) {
      // 即時適用采配後（代打・継投等）はビューを更新
      const { runnerMode } = get();
      const pauseReason = evaluatePause(runner, runnerMode);
      set({
        pauseReason,
        currentOrder: order,
        ...(isDetailedOrder ? { lastOrder: order } : {}),
      });
    } else {
      // 即時適用でない采配（バント・盗塁等）も currentOrder に保存
      set({
        currentOrder: order,
        ...(isDetailedOrder ? { lastOrder: order } : {}),
      });
    }
    return result;
  },

  // ----------------------------------------------------------------
  // 1球進行
  // ----------------------------------------------------------------
  stepOnePitch: () => {
    const { runner, runnerMode, pitchLog, narration, gameSeed, currentOrder, recentMonologueIds } = get();
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

      // Phase 7-B: 投球前にモノローグを生成
      // Phase 7-E3: 直近モノローグIDを除外セットとして渡す
      const pitchCtx = buildPitchContext(stateBefore, currentOrder);
      const excludeIds = new Set(recentMonologueIds);
      const monologues = generatePitchMonologues(pitchCtx, excludeIds);
      const monologueEntries = [
        monologues.batter,
        monologues.pitcher,
        monologues.catcher,
      ].filter((m): m is NonNullable<typeof m> => m !== null);

      // Phase 7-E1: メンタル補正を集計
      // Phase 7-E2: ignoreOrder フラグを検出
      const { overrides, shouldIgnoreOrder } = buildMatchOverridesFromMonologues(monologues);

      // Phase 7-E2: ignoreOrder の場合は実況に一言追加し currentOrder をリセット
      const effectiveOrder = shouldIgnoreOrder ? { type: 'none' } as const : currentOrder;
      let ignoreOrderNarration: NarrationEntry[] = [];
      if (shouldIgnoreOrder && currentOrder.type !== 'none') {
        const batterName2 = batterMP
          ? `${batterMP.player.lastName}${batterMP.player.firstName}`
          : '打者';
        ignoreOrderNarration = [{
          id: `ignore-order-${Date.now()}`,
          text: `${batterName2}は監督の指示を無視した！`,
          kind: 'highlight',
          inning: stateBefore.currentInning,
          half: stateBefore.currentHalf,
          at: Date.now(),
        }];
      }

      // Phase 7-E2: runner に渡す前に currentOrder をリセットしておく
      if (shouldIgnoreOrder && currentOrder.type !== 'none') {
        runner.applyPlayerOrder(effectiveOrder);
      }

      const { pitchResult } = runner.stepOnePitch(rng, overrides);
      const newState = runner.getState();

      // Phase 7-E3: 直近モノローグIDを更新
      const newRecentIds = updateRecentMonologueIds(recentMonologueIds, monologues.pickedIds);

      // Phase 12-B: 投手の利き手を取得（ブレイク方向計算用）
      const pitchingTeamForHand = stateBefore.currentHalf === 'top' ? stateBefore.homeTeam : stateBefore.awayTeam;
      const pitcherForHand = pitchingTeamForHand.players.find(
        (mp) => mp.player.id === pitchingTeamForHand.currentPitcherId,
      );
      const pitcherHand: 'left' | 'right' = pitcherForHand?.player.throwingHand === 'left' ? 'left' : 'right';

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
        // v0.23.0: 打者の所属チーム短縮名
        batterSchoolShortName: battingTeam.shortName,
        // Phase 7-A-2: 球速・コース・球種ラベル
        pitchSpeed: toPitchSpeedKmh(pitchResult.pitchSelection.velocity),
        pitchLocation: toPitchLocationLabel(
          pitchResult.actualLocation.row,
          pitchResult.actualLocation.col,
        ),
        pitchTypeLabel: toEnrichedPitchType(pitchResult.pitchSelection.type),
        // Phase 7-B: 心理モノローグ
        monologues: monologueEntries.length > 0 ? monologueEntries : undefined,
        // Phase 12-B: 変化方向・スイング位置
        breakDirection: computeBreakDirection(pitchResult.pitchSelection.type, pitcherHand),
        swingLocation: isSwingAction(pitchResult.batterAction)
          ? pitchLocationToUV(pitchResult.actualLocation.row, pitchResult.actualLocation.col)
          : null,
        // Phase 12-D: 打球詳細
        batContact: pitchResult.batContact
          ? {
              contactType: pitchResult.batContact.contactType,
              direction: pitchResult.batContact.direction,
              speed: pitchResult.batContact.speed,
              distance: pitchResult.batContact.distance,
              fieldResult: {
                type: pitchResult.batContact.fieldResult.type,
                isError: pitchResult.batContact.fieldResult.isError,
              },
            }
          : null,
      };
      const newLog = [...pitchLog, logEntry].slice(-50);

      // 実況ログ
      const narrationEntries = buildNarrationForPitch(stateBefore, newState, pitchResult);
      const newNarration = [...narration, ...ignoreOrderNarration, ...narrationEntries].slice(-NARRATION_MAX);

      const matchResult = newState.isOver ? newState.result : null;
      const pauseReason = evaluatePause(runner, runnerMode);

      set({
        pitchLog: newLog,
        narration: newNarration,
        pauseReason,
        matchResult: matchResult ?? null,
        isProcessing: false,
        // 1球終了後は采配をリセット（次の打席/球では再度指定が必要）
        currentOrder: { type: 'none' },
        recentMonologueIds: newRecentIds,
      });
    } catch {
      set({ isProcessing: false });
    }
  },

  // ----------------------------------------------------------------
  // 1打席進行
  // ----------------------------------------------------------------
  stepOneAtBat: () => {
    const { runner, runnerMode, pitchLog, narration, gameSeed, currentOrder, recentMonologueIds } = get();
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

      // Phase 7-B: 打席先頭のモノローグを生成（1打席モードでは打席の最初の1球のみ生成）
      // Phase 7-E3: 直近モノローグIDを除外セットとして渡す
      const pitchCtx = buildPitchContext(stateBefore, currentOrder);
      const excludeIds = new Set(recentMonologueIds);
      const monologues = generatePitchMonologues(pitchCtx, excludeIds);
      const monologueEntries = [
        monologues.batter,
        monologues.pitcher,
        monologues.catcher,
      ].filter((m): m is NonNullable<typeof m> => m !== null);

      // Phase 7-E1: メンタル補正を集計
      // Phase 7-E2: ignoreOrder フラグを検出
      const { overrides, shouldIgnoreOrder } = buildMatchOverridesFromMonologues(monologues);

      // Phase 7-E2: ignoreOrder の場合は実況に一言追加し currentOrder をリセット
      let ignoreOrderNarration: NarrationEntry[] = [];
      if (shouldIgnoreOrder && currentOrder.type !== 'none') {
        const batterName2 = batterMP
          ? `${batterMP.player.lastName}${batterMP.player.firstName}`
          : '打者';
        ignoreOrderNarration = [{
          id: `ignore-order-${Date.now()}`,
          text: `${batterName2}は監督の指示を無視した！`,
          kind: 'highlight',
          inning: stateBefore.currentInning,
          half: stateBefore.currentHalf,
          at: Date.now(),
        }];
        // runner に none 采配を適用
        runner.applyPlayerOrder({ type: 'none' });
      }

      // Phase 7-E3: 直近モノローグIDを更新
      const newRecentIds = updateRecentMonologueIds(recentMonologueIds, monologues.pickedIds);

      const { atBatResult } = runner.stepOneAtBat(rng, overrides);
      const newState = runner.getState();

      // Phase 12-B: 投手の利き手（打席単位で取得）
      const pitchingTeamForHand2 = stateBefore.currentHalf === 'top' ? stateBefore.homeTeam : stateBefore.awayTeam;
      const pitcherForHand2 = pitchingTeamForHand2.players.find(
        (mp) => mp.player.id === pitchingTeamForHand2.currentPitcherId,
      );
      const pitcherHandAb: 'left' | 'right' = pitcherForHand2?.player.throwingHand === 'left' ? 'left' : 'right';

      // 打席内の全投球をログに追加
      const newEntries: PitchLogEntry[] = atBatResult.pitches.map((p, idx) => ({
        inning: stateBefore.currentInning,
        half: stateBefore.currentHalf,
        pitchType: p.pitchSelection.type,
        outcome: p.outcome,
        location: { row: p.actualLocation.row, col: p.actualLocation.col },
        batterId,
        batterName,
        // v0.23.0: 打者の所属チーム短縮名
        batterSchoolShortName: battingTeam.shortName,
        // Phase 7-A-2: 球速・コース・球種ラベル
        pitchSpeed: toPitchSpeedKmh(p.pitchSelection.velocity),
        pitchLocation: toPitchLocationLabel(p.actualLocation.row, p.actualLocation.col),
        pitchTypeLabel: toEnrichedPitchType(p.pitchSelection.type),
        // Phase 7-B: 1球目にのみモノローグを付加
        monologues: idx === 0 && monologueEntries.length > 0 ? monologueEntries : undefined,
        // Phase 12-B: 変化方向・スイング位置
        breakDirection: computeBreakDirection(p.pitchSelection.type, pitcherHandAb),
        swingLocation: isSwingAction(p.batterAction)
          ? pitchLocationToUV(p.actualLocation.row, p.actualLocation.col)
          : null,
        // Phase 12-D: 打球詳細
        batContact: p.batContact
          ? {
              contactType: p.batContact.contactType,
              direction: p.batContact.direction,
              speed: p.batContact.speed,
              distance: p.batContact.distance,
              fieldResult: {
                type: p.batContact.fieldResult.type,
                isError: p.batContact.fieldResult.isError,
              },
            }
          : null,
      }));
      const newLog = [...pitchLog, ...newEntries].slice(-50);

      // 実況ログ
      const narrationEntries = buildNarrationForAtBat(stateBefore, newState, atBatResult);
      const newNarration = [...narration, ...ignoreOrderNarration, ...narrationEntries].slice(-NARRATION_MAX);

      const matchResult = newState.isOver ? newState.result : null;
      const pauseReason = evaluatePause(runner, runnerMode);

      set({
        pitchLog: newLog,
        narration: newNarration,
        pauseReason,
        matchResult: matchResult ?? null,
        isProcessing: false,
        currentOrder: { type: 'none' },
        recentMonologueIds: newRecentIds,
        // Phase 7-F: 1打席終了 = 次の打者に変わる → lastOrder をリセット
        lastOrder: null,
      });
    } catch {
      set({ isProcessing: false });
    }
  },
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

  // ----------------------------------------------------------------
  // Phase 12-K: アナリストコメント
  // ----------------------------------------------------------------
  addAnalystComment: (inning: number, half: 'top' | 'bottom', managers: Manager[]) => {
    const { pitchLog, analystComments } = get();
    const comment = generateAnalystCommentFromManagers(pitchLog, managers, inning, half);
    if (!comment) return;
    // 最大20件保持（古いものを削除）
    const updated = [...analystComments, comment].slice(-20);
    set({ analystComments: updated });
  },

  // ----------------------------------------------------------------
  // Phase 12-H: 新自動進行アクション
  // ----------------------------------------------------------------
  setAutoAdvance: (enabled: boolean) => {
    set({ autoAdvance: enabled });
  },

  setPendingNextOrder: (order: TacticalOrder | null) => {
    set({ pendingNextOrder: order });
  },

  consumeNextOrder: () => {
    const { pendingNextOrder, lastOrder } = get();
    if (pendingNextOrder) {
      // 明示的に事前選択された指示があればそれを消費して返す
      set({ pendingNextOrder: null });
      return pendingNextOrder;
    }
    // Phase 12-I: pendingNextOrder が null のとき、lastOrder を継続指示として返す
    // これにより自動進行中は前回の采配が引き継がれる
    return lastOrder;
  },
    }),
    {
      name: MATCH_STORE_KEY,
      version: MATCH_STORE_VERSION,
      storage: createJSONStorage(() => {
        // SSR 時は localStorage が存在しないため、noop ストレージにフォールバック
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
          };
        }
        return localStorage;
      }),
      /**
       * 永続化する状態を絞り込む。
       * runner は MatchRunner インスタンスなので除外し、
       * 代わりに matchStateJson として保存する。
       * isProcessing は実行中フラグなので復元時には false にリセットされる（除外）。
       */
      partialize: (state): MatchPersistedState => {
        const runner = state.runner;
        const matchStateJson = runner ? serializeMatchState(runner.getState()) : null;
        return {
          matchStateJson,
          playerSchoolId: state.playerSchoolId,
          gameSeed: state.gameSeed,
          runnerMode: state.runnerMode,
          pauseReason: state.pauseReason,
          pitchLog: state.pitchLog,
          narration: state.narration,
          autoPlayEnabled: state.autoPlayEnabled,
          autoPlaySpeed: state.autoPlaySpeed,
          matchResult: state.matchResult,
          currentOrder: state.currentOrder,
          recentMonologueIds: state.recentMonologueIds,
          lastOrder: state.lastOrder,
          // Phase 12-H
          autoAdvance: state.autoAdvance,
          pendingNextOrder: state.pendingNextOrder,
          // Phase 12-K
          analystComments: state.analystComments,
        };
      },
      /**
       * 復元時のコールバック。
       * matchStateJson から MatchRunner を再生成する。
       * Map/Set は deserializeMatchState が正しく復元する。
       */
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // hydration 完了フラグを立てる
        state._hasHydrated = true;
        // isProcessing は常に false にリセット
        state.isProcessing = false;
        // matchStateJson が存在する場合は runner を再生成
        if (state.matchStateJson !== null && state.matchStateJson !== undefined) {
          try {
            const matchState = deserializeMatchState(state.matchStateJson as unknown as string);
            const runner = new MatchRunner(matchState, cpuAutoTactics, state.playerSchoolId);
            state.runner = runner;
          } catch {
            // 復元失敗時は runner を null にリセット（ゲームリセット扱い）
            state.runner = null;
            state.matchStateJson = null;
          }
        }
      },
    },
  ),
);
