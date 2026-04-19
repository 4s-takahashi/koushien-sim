/**
 * runner.ts — MatchRunner クラス
 *
 * インタラクティブ試合画面のエンジン層。
 * 既存の processPitch / processAtBat / processHalfInning を外部から制御可能にする。
 *
 * 重要: engine/match/ 既存ファイルは変更しない。このファイルは新規追加のみ。
 */

import type { RNG } from '../core/rng';
import type {
  MatchState,
  MatchResult,
  TacticalOrder,
  PitchResult,
  AtBatResult,
  InningResult,
  MatchEvent,
  HalfInning,
} from './types';
import { EMPTY_BASES } from './types';
import { processPitch } from './pitch/process-pitch';
import { processAtBat } from './at-bat';
import { processHalfInning } from './inning';
import {
  validateOrder,
  applyPinchHit,
  applyPitchingChange,
  applyMoundVisit,
  applyPinchRun,
  applyDefensiveSub,
  cpuAutoTactics,
} from './tactics';
import {
  collectBatterStats,
  collectPitcherStats,
  selectMVP,
} from './result';
import type { RunnerMode, PauseReason } from './runner-types';

// ============================================================
// 内部ヘルパー
// ============================================================

/**
 * 現在の守備側投手のスタミナ割合 (0.0-1.0)
 */
function getPitcherStaminaPct(state: MatchState): number {
  const fieldingTeam = state.currentHalf === 'top' ? state.homeTeam : state.awayTeam;
  const pitcher = fieldingTeam.players.find(
    (mp) => mp.player.id === fieldingTeam.currentPitcherId,
  );
  if (!pitcher) return 1.0;
  return pitcher.stamina / 100;
}

/**
 * 点差を計算（正 = home リード）
 */
function scoreDiff(state: MatchState): number {
  return state.score.home - state.score.away;
}

/**
 * 得点圏走者がいるか（2塁または3塁）
 */
function hasScoringPositionRunner(state: MatchState): boolean {
  return state.bases.second !== null || state.bases.third !== null;
}

/**
 * 満塁か
 */
function isBasesLoaded(state: MatchState): boolean {
  return (
    state.bases.first !== null &&
    state.bases.second !== null &&
    state.bases.third !== null
  );
}

/**
 * 打席開始状態か（カウントが 0-0 かつアウトが変わっていない）
 * MatchRunner が管理する打席開始フラグ用。
 * ここでは state.count.balls === 0 && state.count.strikes === 0 で判定。
 */
function isAtBatStart(state: MatchState): boolean {
  return state.count.balls === 0 && state.count.strikes === 0;
}

// ============================================================
// 勝負所検知
// ============================================================

/**
 * 現在の状態が「勝負所」かを検知し、PauseReason を返す。
 * プレイヤー校 ID によって攻守の立場を判断する。
 *
 * @param state 現在の試合状態
 * @param playerSchoolId プレイヤー校の ID（homeTeam.id または awayTeam.id）
 */
export function detectKeyMoment(
  state: MatchState,
  playerSchoolId: string,
): PauseReason | null {
  // 試合終了後はキー判定不要
  if (state.isOver) return null;

  const isPlayerBatting = isPlayerAttacking(state, playerSchoolId);
  const staminaPct = getPitcherStaminaPct(state);
  const diff = Math.abs(scoreDiff(state));

  // ① 投手スタミナ 20% 以下（守備側の投手なので、プレイヤーが守備側のときに適用）
  if (!isPlayerBatting && staminaPct < 0.2) {
    return { kind: 'pitcher_tired', staminaPct };
  }

  // ② 7回以降で1点差以内 → クロスゲーム
  if (state.currentInning >= 7 && diff <= 1) {
    return { kind: 'close_and_late', inning: state.currentInning };
  }

  // ③ チャンス / ピンチ検知
  const hasScoringPos = hasScoringPositionRunner(state);
  const loaded = isBasesLoaded(state);

  if (isPlayerBatting) {
    // 自校攻撃中: チャンス
    if (loaded) {
      return { kind: 'scoring_chance', detail: '満塁' };
    }
    if (hasScoringPos) {
      const outs = state.outs;
      const detail =
        state.bases.second && state.bases.third
          ? `2・3塁`
          : state.bases.third
            ? `${outs}死3塁`
            : `${outs}死2塁`;
      return { kind: 'scoring_chance', detail };
    }
  } else {
    // 相手攻撃中（自校守備）: ピンチ
    if (loaded) {
      return { kind: 'pinch', detail: '満塁' };
    }
    if (hasScoringPos) {
      const outs = state.outs;
      const detail =
        state.bases.second && state.bases.third
          ? `2・3塁`
          : state.bases.third
            ? `${outs}死3塁`
            : `${outs}死2塁`;
      return { kind: 'pinch', detail };
    }
  }

  return null;
}

/**
 * プレイヤー校が現在攻撃中かを判定する。
 */
function isPlayerAttacking(state: MatchState, playerSchoolId: string): boolean {
  const isPlayerHome = state.homeTeam.id === playerSchoolId;
  // top = away 攻撃、bottom = home 攻撃
  if (state.currentHalf === 'top') {
    return !isPlayerHome; // away がプレイヤーなら攻撃中
  } else {
    return isPlayerHome; // home がプレイヤーなら攻撃中
  }
}

// ============================================================
// finishGame ヘルパー（game.ts から複製・独立）
// ============================================================

function finishGame(
  state: MatchState,
  totalInnings: number,
  allAtBatResults: AtBatResult[],
): { finalState: MatchState; result: MatchResult } {
  const winner =
    state.score.home > state.score.away
      ? 'home'
      : state.score.away > state.score.home
        ? 'away'
        : 'draw';

  const allPlayerIds = [
    ...state.homeTeam.players.map((p) => p.player.id),
    ...state.awayTeam.players.map((p) => p.player.id),
  ];

  const homePitcherIds = state.homeTeam.players
    .filter((p) => p.player.stats.pitching)
    .map((p) => p.player.id);
  const awayPitcherIds = state.awayTeam.players
    .filter((p) => p.player.stats.pitching)
    .map((p) => p.player.id);
  const allPitcherIds = [...homePitcherIds, ...awayPitcherIds];

  const batterStats = collectBatterStats(allAtBatResults, allPlayerIds);
  const pitcherStats = collectPitcherStats(
    allAtBatResults,
    allPitcherIds,
    winner as 'home' | 'away' | 'draw',
    homePitcherIds,
    awayPitcherIds,
  );

  const homeBatterIds = state.homeTeam.battingOrder;
  const awayBatterIds = state.awayTeam.battingOrder;
  const mvpPlayerId = selectMVP(
    batterStats,
    pitcherStats,
    winner as 'home' | 'away' | 'draw',
    homeBatterIds,
    awayBatterIds,
  );

  const result: MatchResult = {
    winner: winner as 'home' | 'away' | 'draw',
    finalScore: { ...state.score },
    inningScores: {
      home: [...state.inningScores.home],
      away: [...state.inningScores.away],
    },
    totalInnings,
    mvpPlayerId,
    batterStats,
    pitcherStats,
  };

  const finalState: MatchState = {
    ...state,
    isOver: true,
    result,
  };

  return { finalState, result };
}

// ============================================================
// MatchRunner クラス
// ============================================================

/**
 * MatchRunner — インタラクティブ試合進行コントローラー
 *
 * 既存の processPitch / processAtBat / processHalfInning を外部から
 * 1球 / 1打席 / 1イニング単位で制御可能にする。
 *
 * プレイヤーの采配は applyPlayerOrder() で pendingPlayerOrder に格納し、
 * 次の stepOnePitch / stepOneAtBat 呼び出し時に TacticsProvider として注入する。
 */
export class MatchRunner {
  private state: MatchState;
  private readonly opponentTactics: (state: MatchState, rng: RNG) => TacticalOrder;
  private readonly playerSchoolId: string;

  /** プレイヤーが指示した采配（次の打席 or 投球に適用） */
  private pendingPlayerOrder: TacticalOrder | null = null;

  /** 蓄積された全打席結果（最終結果の成績集計用） */
  private allAtBatResults: AtBatResult[] = [];

  /**
   * @param initialState 初期試合状態
   * @param opponentTactics 相手CPU采配プロバイダー
   * @param playerSchoolId プレイヤーが操作する学校の ID
   */
  constructor(
    initialState: MatchState,
    opponentTactics: (state: MatchState, rng: RNG) => TacticalOrder,
    playerSchoolId: string,
  ) {
    this.state = initialState;
    this.opponentTactics = opponentTactics;
    this.playerSchoolId = playerSchoolId;
  }

  // ----------------------------------------------------------
  // 状態参照
  // ----------------------------------------------------------

  /** 現在の試合状態を返す */
  getState(): MatchState {
    return this.state;
  }

  /** 試合が終了しているか */
  isOver(): boolean {
    return this.state.isOver;
  }

  /** 試合結果を返す（未終了の場合は null） */
  getResult(): MatchResult | null {
    return this.state.result;
  }

  // ----------------------------------------------------------
  // 停止判定
  // ----------------------------------------------------------

  /**
   * 現在のタイミングで UI が停止すべきかを判定する。
   * PauseReason を返せば停止、null なら自動進行してよい。
   *
   * 優先順位:
   *   1. 試合終了
   *   2. 勝負所（detectKeyMoment）
   *   3. PitchMode ON → pitch_start
   *   4. TimeMode standard → at_bat_start
   *   5. short + pitch off → 停止なし（自動進行）
   */
  shouldPause(mode: RunnerMode): PauseReason | null {
    if (this.state.isOver) {
      return { kind: 'match_end' };
    }

    // 勝負所は time mode に関わらず常に優先
    const keyMoment = detectKeyMoment(this.state, this.playerSchoolId);
    if (keyMoment) return keyMoment;

    // PitchMode ON → 全投球前に停止
    if (mode.pitch === 'on') {
      return { kind: 'pitch_start' };
    }

    // 標準モード → 打席開始で停止
    if (mode.time === 'standard' && isAtBatStart(this.state)) {
      const battingTeam =
        this.state.currentHalf === 'top' ? this.state.awayTeam : this.state.homeTeam;
      const batterId = battingTeam.battingOrder[this.state.currentBatterIndex];
      return { kind: 'at_bat_start', batterId };
    }

    return null;
  }

  // ----------------------------------------------------------
  // 采配適用
  // ----------------------------------------------------------

  /**
   * プレイヤーの采配を適用する。
   *
   * - 即時適用可能な采配（代打・継投・マウンド訪問）は MatchState を即座に更新
   * - バント・盗塁等は pendingPlayerOrder に格納し、次の投球時に注入
   *
   * @returns { applied: boolean; reason?: string }
   */
  applyPlayerOrder(order: TacticalOrder): { applied: boolean; reason?: string } {
    const validation = validateOrder(order, this.state);
    if (!validation.valid) {
      return { applied: false, reason: validation.reason };
    }

    // 即時適用采配
    switch (order.type) {
      case 'pinch_hit': {
        this.state = applyPinchHit(this.state, order.outPlayerId, order.inPlayerId);
        this.pendingPlayerOrder = null;
        return { applied: true };
      }
      case 'pitching_change': {
        this.state = applyPitchingChange(this.state, order.newPitcherId);
        this.pendingPlayerOrder = null;
        return { applied: true };
      }
      case 'mound_visit': {
        this.state = applyMoundVisit(this.state);
        this.pendingPlayerOrder = null;
        return { applied: true };
      }
      case 'pinch_run': {
        this.state = applyPinchRun(this.state, order.outPlayerId, order.inPlayerId);
        this.pendingPlayerOrder = null;
        return { applied: true };
      }
      case 'defensive_sub': {
        this.state = applyDefensiveSub(this.state, order);
        this.pendingPlayerOrder = null;
        return { applied: true };
      }
      case 'intentional_walk': {
        // 敬遠は processAtBat の先頭で処理されるため pending に格納
        this.pendingPlayerOrder = order;
        return { applied: true };
      }
      default:
        // bunt, steal, hit_and_run, none は次の打席/投球に適用
        this.pendingPlayerOrder = order;
        return { applied: true };
    }
  }

  // ----------------------------------------------------------
  // 1球進行
  // ----------------------------------------------------------

  /**
   * 1球だけ処理する。
   * pendingPlayerOrder がプレイヤー攻撃時に適用される。
   *
   * @returns { pitchResult, events }
   */
  stepOnePitch(rng: RNG): { pitchResult: PitchResult; events: MatchEvent[]; atBatEnded: boolean } {
    if (this.state.isOver) {
      throw new Error('MatchRunner: 試合は既に終了しています');
    }

    const order = this.resolveOrderForCurrentHalf(rng);
    const prevLog = this.state.log;

    // 投球前のカウントを記録（三振・四球判定に使用）
    const strikesBefore = this.state.count.strikes;

    const { nextState, pitchResult } = processPitch(this.state, order, rng);
    this.state = nextState;

    // ── 打席終了判定 ──
    const isStrikeOutcome =
      pitchResult.outcome === 'called_strike' ||
      pitchResult.outcome === 'swinging_strike' ||
      pitchResult.outcome === 'foul_bunt';
    const isStrikeout = isStrikeOutcome && strikesBefore === 2;
    const isWalk = this.state.count.balls >= 4;
    const isInPlay = pitchResult.outcome === 'in_play';

    let atBatEnded = false;

    if (isStrikeout) {
      // 三振: アウト加算、カウントリセット、打者交代
      this.state = {
        ...this.state,
        outs: Math.min(this.state.outs + 1, 3),
        count: { balls: 0, strikes: 0 },
      };
      this.advanceBatterIndex();
      this.pendingPlayerOrder = null;
      atBatEnded = true;
    } else if (isWalk) {
      // 四球: 押し出し走者処理、カウントリセット、打者交代
      this.applyWalkInline();
      this.advanceBatterIndex();
      this.pendingPlayerOrder = null;
      atBatEnded = true;
    } else if (isInPlay) {
      // インプレー: processPitch 内で outs/bases/score 更新済み
      this.state = { ...this.state, count: { balls: 0, strikes: 0 } };
      this.advanceBatterIndex();
      this.pendingPlayerOrder = null;
      atBatEnded = true;
    }

    // 3アウトで攻守交代
    if (atBatEnded && this.state.outs >= 3) {
      this.switchHalfInning();
    }

    // ログの差分をイベントとして返す
    const newEvents = this.state.log.slice(prevLog.length);

    return { pitchResult, events: newEvents, atBatEnded };
  }

  // ----------------------------------------------------------
  // ヘルパー: 打者インデックスを進める
  // ----------------------------------------------------------
  private advanceBatterIndex(): void {
    const newBatterIndex = (this.state.currentBatterIndex + 1) % 9;
    this.state = { ...this.state, currentBatterIndex: newBatterIndex };
  }

  // ----------------------------------------------------------
  // ヘルパー: 四球処理（走者進塁 + 得点）
  // ----------------------------------------------------------
  private applyWalkInline(): void {
    const state = this.state;
    const battingTeam =
      state.currentHalf === 'top' ? state.awayTeam : state.homeTeam;
    const batterId = battingTeam.battingOrder[state.currentBatterIndex];
    const batterMP = battingTeam.players.find((mp) => mp.player.id === batterId);
    if (!batterMP) return;

    const batterInfo = {
      playerId: batterId,
      speed: batterMP.player.stats.base.speed,
    };

    let { bases, score, inningScores } = state;
    let scoredRuns = 0;

    // 押し出し判定
    if (bases.first !== null) {
      if (bases.second !== null) {
        if (bases.third !== null) {
          scoredRuns = 1;
          bases = {
            third: bases.second,
            second: bases.first,
            first: batterInfo,
          };
        } else {
          bases = {
            third: bases.second,
            second: bases.first,
            first: batterInfo,
          };
        }
      } else {
        bases = { ...bases, second: bases.first, first: batterInfo };
      }
    } else {
      bases = { ...bases, first: batterInfo };
    }

    // 得点加算
    if (scoredRuns > 0) {
      const isBottom = state.currentHalf === 'bottom';
      const idx = state.currentInning - 1;
      const key = isBottom ? 'home' : 'away';
      const arr = [...inningScores[key]];
      while (arr.length <= idx) arr.push(0);
      arr[idx] = arr[idx] + scoredRuns;
      inningScores = { ...inningScores, [key]: arr };
      score = { ...score, [key]: score[key] + scoredRuns };
    }

    this.state = {
      ...state,
      bases,
      score,
      inningScores,
      count: { balls: 0, strikes: 0 },
    };
  }

  // ----------------------------------------------------------
  // ヘルパー: 3アウトで攻守交代
  // ----------------------------------------------------------
  private switchHalfInning(): void {
    const state = this.state;

    if (state.currentHalf === 'top') {
      // 表終了 → 裏へ
      this.state = {
        ...state,
        currentHalf: 'bottom',
        outs: 0,
        count: { balls: 0, strikes: 0 },
        bases: EMPTY_BASES,
      };
    } else {
      // 裏終了 → 次のイニング表へ
      const nextInning = state.currentInning + 1;
      const maxInnings = state.config.innings + state.config.maxExtras;

      // 試合終了判定
      const regulationDone = nextInning > state.config.innings;
      const scoreDifferent = state.score.home !== state.score.away;

      if (regulationDone && scoreDifferent) {
        // 規定回終了 & 決着あり → 試合終了
        this.finalizeGame();
        return;
      }

      if (nextInning > maxInnings) {
        // 延長上限突破 → 強制終了
        this.finalizeGame();
        return;
      }

      this.state = {
        ...state,
        currentInning: nextInning,
        currentHalf: 'top',
        outs: 0,
        count: { balls: 0, strikes: 0 },
        bases: EMPTY_BASES,
      };
    }
  }

  // ----------------------------------------------------------
  // ヘルパー: 試合を終了して result を確定
  // ----------------------------------------------------------
  private finalizeGame(): void {
    const { finalState, result } = finishGame(
      this.state,
      this.state.currentInning,
      this.allAtBatResults,
    );
    this.state = finalState;
    // finishGame は isOver と result を設定する想定
    if (!this.state.result) {
      this.state = { ...this.state, result };
    }
  }

  // ----------------------------------------------------------
  // 1打席進行
  // ----------------------------------------------------------

  /**
   * 1打席完了まで進める。
   *
   * @returns { atBatResult, events }
   */
  stepOneAtBat(rng: RNG): { atBatResult: AtBatResult; events: MatchEvent[] } {
    if (this.state.isOver) {
      throw new Error('MatchRunner: 試合は既に終了しています');
    }

    const order = this.resolveOrderForCurrentHalf(rng);
    const prevLog = this.state.log;

    const { nextState, result } = processAtBat(this.state, order, rng);
    // ⚠️ 打席終了時にカウントを必ずリセット（防衛コード）
    // processAtBat 内でもリセットするが、全ケースでの確実性を保証するため。
    // これを怠ると次の打席に前の打席のカウントが引き継がれ、
    // 「2ストライクで三振した」ように見えるバグになる (2026-04-19 修正)
    this.state = { ...nextState, count: { balls: 0, strikes: 0 } };

    // 使用した采配をクリア
    this.pendingPlayerOrder = null;

    // 打席結果を蓄積
    this.allAtBatResults.push(result);

    // ── 打順を進める ──
    // processAtBat は currentBatterIndex を +1 しない設計。
    // stepOneAtBat は processAtBat を直接呼ぶので、ここで明示的に進める。
    // (2026-04-19 バグ修正: ヒット後に同じ打者が再登場する問題)
    this.advanceBatterIndex();

    // ── 3アウト到達 → 攻守交代(試合終了判定含む) ──
    // processAtBat 内で 3アウトに達したが、switchHalfInning が呼ばれない構造なので
    // runner 側で必ずチェックしてイニングを切り替える
    if (!this.state.isOver && this.state.outs >= 3) {
      this.switchHalfInning();
    }

    const newEvents = this.state.log.slice(prevLog.length);

    return { atBatResult: result, events: newEvents };
  }

  // ----------------------------------------------------------
  // 1イニング進行
  // ----------------------------------------------------------

  /**
   * 1イニング（表裏両方）完了まで進める。
   * 9回以降のサヨナラ判定も含む。
   *
   * @returns { innings: InningResult[], events: MatchEvent[] }
   */
  stepOneInning(rng: RNG): { innings: InningResult[]; events: MatchEvent[] } {
    if (this.state.isOver) {
      throw new Error('MatchRunner: 試合は既に終了しています');
    }

    const prevLog = this.state.log;
    const { tops, bottoms } = this.playOneInning(rng, this.state.currentInning);

    const innings: InningResult[] = [tops];
    if (bottoms) innings.push(bottoms);

    const newEvents = this.state.log.slice(prevLog.length);
    return { innings, events: newEvents };
  }

  // ----------------------------------------------------------
  // 試合終了まで一気に進める
  // ----------------------------------------------------------

  /**
   * 試合終了まで全て自動進行する（CPUのみ采配）。
   *
   * @returns MatchResult
   */
  runToEnd(rng: RNG): MatchResult {
    const maxInnings =
      this.state.config.innings + this.state.config.maxExtras;
    const safetyMax = this.state.config.isTournament
      ? this.state.config.innings + 15
      : maxInnings;

    // 既に終了していれば即返す
    if (this.state.isOver && this.state.result) {
      return this.state.result;
    }

    for (let inning = this.state.currentInning; inning <= safetyMax; inning++) {
      this.state = { ...this.state, currentInning: inning };

      const { finished } = this.playOneInning(
        rng,
        inning,
        `run-top-${inning}`,
        `run-bottom-${inning}`,
      );
      if (finished) {
        break;
      }
    }

    // safety valve — 終了していない場合は強制終了
    if (!this.state.isOver) {
      const { finalState, result } = finishGame(
        this.state,
        this.state.currentInning,
        this.allAtBatResults,
      );
      this.state = finalState;
      return result;
    }

    return this.state.result!;
  }

  // ----------------------------------------------------------
  // 内部ヘルパー
  // ----------------------------------------------------------

  /**
   * 1イニング（表裏）を処理する共通プライベートメソッド。
   * `stepOneInning` と `runToEnd` の重複ロジックをここに集約する。
   *
   * RNG の derive キーは呼び出し元に依らず統一するが、
   * stepOneInning と runToEnd では異なるプレフィクスを使用することで
   * 既存の RNG パスの互換性を維持する。
   * （stepOneInning: runner-top-N / runner-bottom-N、
   *   runToEnd:       run-top-N    / run-bottom-N）
   *
   * @param rng    乱数生成器
   * @param inning 処理するイニング番号
   * @param topPrefix    表イニングの RNG derive プレフィクス
   * @param bottomPrefix 裏イニングの RNG derive プレフィクス
   * @returns tops/bottoms イニング結果、finished = 試合終了かどうか
   */
  private playOneInning(
    rng: RNG,
    inning: number,
    topPrefix = `runner-top-${inning}`,
    bottomPrefix = `runner-bottom-${inning}`,
  ): { tops: InningResult; bottoms?: InningResult; finished: boolean } {
    const awayTactics = this.makeAwayTacticsProvider(rng);
    const homeTactics = this.makeHomeTacticsProvider(rng);

    // ── 表（away攻撃） ──
    const topState: MatchState = {
      ...this.state,
      currentHalf: 'top' as HalfInning,
    };
    const { nextState: afterTop, result: topResult } = processHalfInning(
      topState,
      rng.derive(topPrefix),
      awayTactics,
    );
    this.state = afterTop;
    this.allAtBatResults.push(...topResult.atBats);

    // 9回裏以降でホームがリードなら裏スキップ → 試合終了
    if (
      inning >= this.state.config.innings &&
      afterTop.score.home > afterTop.score.away
    ) {
      this.state = { ...this.state, currentInning: inning + 1 };
      this.checkAndFinishGame(inning, false);
      return { tops: topResult, finished: true };
    }

    // ── 裏（home攻撃） ──
    const bottomState: MatchState = {
      ...this.state,
      currentHalf: 'bottom' as HalfInning,
      outs: 0,
      bases: EMPTY_BASES,
    };
    const { nextState: afterBottom, result: bottomResult } = processHalfInning(
      bottomState,
      rng.derive(bottomPrefix),
      homeTactics,
    );
    this.state = afterBottom;
    this.allAtBatResults.push(...bottomResult.atBats);

    // サヨナラ判定
    const isSayonara =
      inning >= this.state.config.innings &&
      afterBottom.score.home > afterBottom.score.away;

    if (isSayonara) {
      this.checkAndFinishGame(inning, true);
      return { tops: topResult, bottoms: bottomResult, finished: true };
    }

    // 次イニングに進む
    this.state = { ...this.state, currentInning: inning + 1 };

    // 規定イニング終了後の判定
    if (inning >= this.state.config.innings) {
      if (this.state.score.home !== this.state.score.away) {
        this.checkAndFinishGame(inning, false);
        return { tops: topResult, bottoms: bottomResult, finished: true };
      }
      const maxInnings = this.state.config.innings + this.state.config.maxExtras;
      if (!this.state.config.isTournament && inning >= maxInnings) {
        // 引き分け上限
        this.checkAndFinishGame(inning, false);
        return { tops: topResult, bottoms: bottomResult, finished: true };
      }
    }

    // safety valve
    const safetyMax = this.state.config.innings + 15;
    if (inning >= safetyMax) {
      this.checkAndFinishGame(inning, false);
      return { tops: topResult, bottoms: bottomResult, finished: true };
    }

    return { tops: topResult, bottoms: bottomResult, finished: false };
  }

  /**
   * 現在のハーフイニングに応じた采配を解決する。
   * プレイヤー攻撃中: pendingPlayerOrder（なければ none）
   * 相手攻撃中: opponentTactics
   */
  private resolveOrderForCurrentHalf(rng: RNG): TacticalOrder {
    const playerIsAttacking = isPlayerAttacking(this.state, this.playerSchoolId);
    if (playerIsAttacking) {
      return this.pendingPlayerOrder ?? { type: 'none' };
    } else {
      return this.opponentTactics(this.state, rng);
    }
  }

  /**
   * away チームの采配プロバイダーを返す。
   * away がプレイヤーなら pendingOrder を使い、相手なら opponentTactics を使う。
   */
  private makeAwayTacticsProvider(
    rng: RNG,
  ): (state: MatchState, r: RNG) => TacticalOrder {
    const isPlayerAway = this.state.awayTeam.id === this.playerSchoolId;
    if (isPlayerAway) {
      const order = this.pendingPlayerOrder ?? { type: 'none' };
      return (_state, _r) => order;
    }
    return (state, r) => this.opponentTactics(state, r);
  }

  /**
   * home チームの采配プロバイダーを返す。
   * home がプレイヤーなら pendingOrder を使い、相手なら opponentTactics を使う。
   */
  private makeHomeTacticsProvider(
    rng: RNG,
  ): (state: MatchState, r: RNG) => TacticalOrder {
    const isPlayerHome = this.state.homeTeam.id === this.playerSchoolId;
    if (isPlayerHome) {
      const order = this.pendingPlayerOrder ?? { type: 'none' };
      return (_state, _r) => order;
    }
    return (state, r) => this.opponentTactics(state, r);
  }

  /**
   * 試合終了判定と finishGame の適用。
   */
  private checkAndFinishGame(totalInnings: number, _isSayonara: boolean): void {
    if (this.state.isOver) return;
    const { finalState } = finishGame(
      this.state,
      totalInnings,
      this.allAtBatResults,
    );
    this.state = finalState;
  }
}
