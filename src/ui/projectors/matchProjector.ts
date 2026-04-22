/**
 * matchProjector.ts — 試合画面用 ViewState 生成
 *
 * (state: MatchState, playerSchoolId: string, runnerMode: RunnerMode, pitchLog: PitchLogEntry[]) => MatchViewState
 *
 * 既存の projector パターンに準拠した純関数。
 */

import type { MatchState, MatchPlayer } from '../../engine/match/types';
import type { RunnerMode, PauseReason } from '../../engine/match/runner-types';
import type {
  MatchViewState,
  PitchLogEntry,
  RunnerBaseView,
  PitcherView,
  BatterView,
  RelieverView,
  PinchHitterView,
} from './view-state-types';
import { detectKeyMoment } from '../../engine/match/runner';
import { TRAIT_LABELS } from '../labels/trait-labels';

// ============================================================
// 内部ヘルパー
// ============================================================

/** スタミナ割合からスタミナクラスを返す */
function staminaToClass(pct: number): 'fresh' | 'normal' | 'tired' | 'exhausted' {
  if (pct >= 0.7) return 'fresh';
  if (pct >= 0.4) return 'normal';
  if (pct >= 0.2) return 'tired';
  return 'exhausted';
}

/** Mood から日本語ラベルを返す */
function moodToLabel(mood: string): string {
  const map: Record<string, string> = {
    excellent: '絶好調',
    good: '好調',
    normal: '普通',
    poor: '不調',
    terrible: '絶不調',
  };
  return map[mood] ?? '普通';
}

/** 走力から速度クラスを返す */
function speedToClass(speed: number): 'fast' | 'normal' | 'slow' {
  if (speed >= 70) return 'fast';
  if (speed >= 40) return 'normal';
  return 'slow';
}

/** 選手の総合力を簡易計算 */
function computeOverall(mp: MatchPlayer): number {
  const p = mp.player;
  const base = p.stats.base;
  const bat = p.stats.batting;
  const pitch = p.stats.pitching;

  if (pitch && p.position === 'pitcher') {
    return Math.round(
      (pitch.velocity + pitch.control + pitch.pitchStamina + base.stamina + base.mental) / 5,
    );
  }

  return Math.round(
    (bat.contact + bat.power + bat.eye + bat.technique + base.speed + base.fielding) / 6,
  );
}

/** アウトカウントを日本語ラベルに変換 */
function outsToLabel(outs: number): string {
  switch (outs) {
    case 0: return 'ノーアウト';
    case 1: return '1アウト';
    case 2: return '2アウト';
    default: return `${outs}アウト`;
  }
}

/** イニング番号 + 表/裏 を日本語ラベルに変換 */
function inningToLabel(inning: number, half: 'top' | 'bottom'): string {
  const halfLabel = half === 'top' ? '表' : '裏';
  return `${inning}回${halfLabel}`;
}

/** プレイヤーが現在攻撃中かを判定する */
function isPlayerAttacking(state: MatchState, playerSchoolId: string): boolean {
  const isPlayerHome = state.homeTeam.id === playerSchoolId;
  if (state.currentHalf === 'top') {
    return !isPlayerHome;
  } else {
    return isPlayerHome;
  }
}

/** 打者名を取得する */
function getBatterName(mp: MatchPlayer): string {
  return `${mp.player.lastName}${mp.player.firstName}`;
}

/** 苗字のみ（Phase 12-F: Ballpark 選手ラベル用） */
function getLastName(mp: MatchPlayer): string {
  return mp.player.lastName;
}

/**
 * 守備ラインナップを組み立てる（Phase 12-F）
 * 各ポジション → 選手の苗字
 */
function buildDefenseLineup(state: MatchState): Record<string, string> {
  const fieldingTeam = state.currentHalf === 'top' ? state.homeTeam : state.awayTeam;
  const result: Record<string, string> = {};

  fieldingTeam.fieldPositions.forEach((pos, playerId) => {
    const mp = fieldingTeam.players.find((p) => p.player.id === playerId);
    if (mp) {
      result[pos] = getLastName(mp);
    }
  });

  return result;
}

/** 今日の打席成績 文字列 ("安打数-打数" 形式) を生成する */
function getTodayBattingAvg(state: MatchState, batterId: string): string {
  // log から当打席より前の打席を集計
  // 簡易実装: state.log の at_bat_result イベントを使う
  let atBats = 0;
  let hits = 0;
  for (const event of state.log) {
    if (event.type === 'at_bat_result' && event.playerId === batterId) {
      atBats++;
      if (event.data?.isHit) hits++;
    }
  }
  return `${hits}-${atBats}`;
}

/** 特性の最初のラベルを返す */
function getFirstTraitLabel(mp: MatchPlayer): string | null {
  const first = mp.player.traits[0];
  if (!first) return null;
  return TRAIT_LABELS[first] ?? first;
}

// ============================================================
// 投手ビュー生成
// ============================================================

function buildPitcherView(state: MatchState): PitcherView {
  const fieldingTeam = state.currentHalf === 'top' ? state.homeTeam : state.awayTeam;
  const pitcherMP = fieldingTeam.players.find(
    (mp) => mp.player.id === fieldingTeam.currentPitcherId,
  );

  if (!pitcherMP) {
    return {
      id: '',
      name: '不明',
      schoolShortName: undefined,
      pitchCount: 0,
      staminaPct: 1.0,
      staminaClass: 'fresh',
      moodLabel: '普通',
      availablePitches: [],
    };
  }

  const pitchingStats = pitcherMP.player.stats.pitching;
  const staminaPct = pitcherMP.stamina / 100;
  const availablePitches = pitchingStats
    ? Object.entries(pitchingStats.pitches).map(([type, level]) => ({
        type,
        level: level ?? 0,
      }))
    : [];

  // 直球は常に追加
  availablePitches.unshift({
    type: 'fastball',
    level: pitchingStats ? Math.round(pitchingStats.velocity / 20) : 3,
  });

  return {
    id: pitcherMP.player.id,
    name: getBatterName(pitcherMP),
    schoolShortName: fieldingTeam.shortName,
    pitchCount: pitcherMP.pitchCountInGame,
    staminaPct,
    staminaClass: staminaToClass(staminaPct),
    moodLabel: moodToLabel(pitcherMP.player.condition.mood),
    availablePitches,
  };
}

// ============================================================
// 打者ビュー生成
// ============================================================

function buildBatterView(state: MatchState): BatterView {
  const battingTeam = state.currentHalf === 'top' ? state.awayTeam : state.homeTeam;
  const batterId = battingTeam.battingOrder[state.currentBatterIndex];
  const batterMP = battingTeam.players.find((mp) => mp.player.id === batterId);

  if (!batterMP) {
    return {
      id: '',
      name: '不明',
      schoolShortName: undefined,
      battingAvg: '0-0',
      overall: 0,
      moodLabel: '普通',
      trait: null,
    };
  }

  return {
    id: batterMP.player.id,
    name: getBatterName(batterMP),
    schoolShortName: battingTeam.shortName,
    battingAvg: getTodayBattingAvg(state, batterId),
    overall: computeOverall(batterMP),
    moodLabel: moodToLabel(batterMP.player.condition.mood),
    trait: getFirstTraitLabel(batterMP),
  };
}

// ============================================================
// ベンチ情報
// ============================================================

function buildAvailableRelievers(state: MatchState): RelieverView[] {
  const fieldingTeam = state.currentHalf === 'top' ? state.homeTeam : state.awayTeam;
  return fieldingTeam.benchPlayerIds
    .map((id) => fieldingTeam.players.find((mp) => mp.player.id === id))
    .filter(
      (mp): mp is MatchPlayer =>
        mp !== undefined &&
        mp.player.stats.pitching !== null &&
        !fieldingTeam.usedPlayerIds.has(mp.player.id),
    )
    .map((mp) => ({
      id: mp.player.id,
      name: getBatterName(mp),
      schoolShortName: fieldingTeam.shortName,
      staminaPct: mp.stamina / 100,
    }));
}

function buildAvailablePinchHitters(state: MatchState): PinchHitterView[] {
  const battingTeam = state.currentHalf === 'top' ? state.awayTeam : state.homeTeam;
  return battingTeam.benchPlayerIds
    .map((id) => battingTeam.players.find((mp) => mp.player.id === id))
    .filter(
      (mp): mp is MatchPlayer =>
        mp !== undefined && !battingTeam.usedPlayerIds.has(mp.player.id),
    )
    .map((mp) => ({
      id: mp.player.id,
      name: getBatterName(mp),
      schoolShortName: battingTeam.shortName,
      overall: computeOverall(mp),
    }));
}

// ============================================================
// ベース状態
// ============================================================

function buildBasesView(state: MatchState): {
  first: RunnerBaseView | null;
  second: RunnerBaseView | null;
  third: RunnerBaseView | null;
} {
  const buildRunnerView = (
    runner: { playerId: string; speed: number } | null,
  ): RunnerBaseView | null => {
    if (!runner) return null;
    // 走者はバッティング側チーム（守備側には走者はいない）から特定する
    const battingTeam =
      state.currentHalf === 'top' ? state.awayTeam : state.homeTeam;
    const mp = battingTeam.players.find((p) => p.player.id === runner.playerId);
    if (!mp) return null;
    return {
      playerId: runner.playerId,
      runnerName: getBatterName(mp),
      schoolShortName: battingTeam.shortName,
      speedClass: speedToClass(runner.speed),
    };
  };

  return {
    first: buildRunnerView(state.bases.first),
    second: buildRunnerView(state.bases.second),
    third: buildRunnerView(state.bases.third),
  };
}

// ============================================================
// 采配可能性
// ============================================================

function buildCanBunt(state: MatchState): boolean {
  return (
    state.bases.first !== null &&
    state.outs < 2
  );
}

function buildCanSteal(state: MatchState): boolean {
  // 1塁か2塁に走者があり、その前の塁が空いている
  const hasFirst = state.bases.first !== null;
  const hasSecond = state.bases.second !== null;
  const secondEmpty = state.bases.second === null;
  const thirdEmpty = state.bases.third === null;

  return (hasFirst && secondEmpty) || (hasSecond && thirdEmpty);
}

function buildCanPinchHit(state: MatchState, playerSchoolId: string): boolean {
  const isPlayerBatting = isPlayerAttacking(state, playerSchoolId);
  if (!isPlayerBatting) return false;
  const battingTeam = state.currentHalf === 'top' ? state.awayTeam : state.homeTeam;
  return battingTeam.benchPlayerIds.some(
    (id) => !battingTeam.usedPlayerIds.has(id),
  );
}

function buildCanChangePitcher(state: MatchState, playerSchoolId: string): boolean {
  const isPlayerBatting = isPlayerAttacking(state, playerSchoolId);
  if (isPlayerBatting) return false; // 守備側でないと交代不可
  const fieldingTeam = state.currentHalf === 'top' ? state.homeTeam : state.awayTeam;
  return fieldingTeam.benchPlayerIds.some((id) => {
    const mp = fieldingTeam.players.find((p) => p.player.id === id);
    return mp?.player.stats.pitching !== null && !fieldingTeam.usedPlayerIds.has(id);
  });
}

// ============================================================
// Phase 12 追加ヘルパー関数
// ============================================================

/**
 * Phase 12-B: 現在の投手の利き手を返す
 */
function getPitcherHand(state: MatchState): 'left' | 'right' {
  const fieldingTeam = state.currentHalf === 'top' ? state.homeTeam : state.awayTeam;
  const pitcherMP = fieldingTeam.players.find(
    (mp) => mp.player.id === fieldingTeam.currentPitcherId,
  );
  return (pitcherMP?.player.throwingHand === 'left') ? 'left' : 'right';
}

/**
 * Phase 12-C: ランナーのチーム所属を返す
 */
function buildRunnerTeams(
  state: MatchState,
): { first?: 'home' | 'away'; second?: 'home' | 'away'; third?: 'home' | 'away' } {
  const battingTeam = state.currentHalf === 'top' ? state.awayTeam : state.homeTeam;
  const battingTeamSide: 'home' | 'away' = state.currentHalf === 'top' ? 'away' : 'home';

  const result: { first?: 'home' | 'away'; second?: 'home' | 'away'; third?: 'home' | 'away' } = {};

  if (state.bases.first) {
    const isInBattingTeam = battingTeam.players.some(
      (mp) => mp.player.id === state.bases.first?.playerId,
    );
    result.first = isInBattingTeam ? battingTeamSide : (battingTeamSide === 'home' ? 'away' : 'home');
  }
  if (state.bases.second) {
    const isInBattingTeam = battingTeam.players.some(
      (mp) => mp.player.id === state.bases.second?.playerId,
    );
    result.second = isInBattingTeam ? battingTeamSide : (battingTeamSide === 'home' ? 'away' : 'home');
  }
  if (state.bases.third) {
    const isInBattingTeam = battingTeam.players.some(
      (mp) => mp.player.id === state.bases.third?.playerId,
    );
    result.third = isInBattingTeam ? battingTeamSide : (battingTeamSide === 'home' ? 'away' : 'home');
  }

  return result;
}

// ============================================================
// メインの projectMatch 関数
// ============================================================

/**
 * MatchState から UI 用の MatchViewState を生成する。
 *
 * @param state 現在の試合状態
 * @param playerSchoolId プレイヤーの学校 ID
 * @param runnerMode 現在の進行モード
 * @param pitchLog 直近の投球ログ（外部から渡す）
 * @param pauseReason 現在の停止理由（null = 進行中）
 */
export function projectMatch(
  state: MatchState,
  playerSchoolId: string,
  runnerMode: RunnerMode,
  pitchLog: PitchLogEntry[],
  pauseReason: PauseReason | null,
): MatchViewState {
  const bases = buildBasesView(state);
  const pitcher = buildPitcherView(state);
  const batter = buildBatterView(state);
  const availableRelievers = buildAvailableRelievers(state);
  const availablePinchHitters = buildAvailablePinchHitters(state);
  const playerBatting = isPlayerAttacking(state, playerSchoolId);

  return {
    inningLabel: inningToLabel(state.currentInning, state.currentHalf),
    outsLabel: outsToLabel(state.outs),
    count: { balls: state.count.balls, strikes: state.count.strikes },
    score: { home: state.score.home, away: state.score.away },
    inningScores: {
      home: [...state.inningScores.home],
      away: [...state.inningScores.away],
    },
    homeSchoolName: state.homeTeam.name,
    homeSchoolId: state.homeTeam.id,
    homeSchoolShortName: state.homeTeam.shortName,
    awaySchoolName: state.awayTeam.name,
    awaySchoolId: state.awayTeam.id,
    awaySchoolShortName: state.awayTeam.shortName,
    bases,
    pitcher,
    batter,
    availableRelievers,
    availablePinchHitters,
    recentPitches: pitchLog.slice(-10),
    canBunt: buildCanBunt(state),
    canSteal: buildCanSteal(state),
    canPinchHit: buildCanPinchHit(state, playerSchoolId),
    canChangePitcher: buildCanChangePitcher(state, playerSchoolId),
    pauseReason,
    runnerMode,
    isPlayerBatting: playerBatting,
    // ===== Phase 12 追加フィールド =====
    outs: state.outs,
    currentInning: state.currentInning,
    pitcherHand: getPitcherHand(state),
    runnerTeams: buildRunnerTeams(state),
    // Phase 12-F: 守備ラインナップ（Ballpark 選手ラベル用）
    defenseLineup: buildDefenseLineup(state),
  };
}
