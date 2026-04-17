import type { RNG } from '../../core/rng';
import type {
  MatchState,
  MatchTeam,
  MatchPlayer,
  TacticalOrder,
  Position,
} from './types';
import { MATCH_CONSTANTS } from './constants';

// ============================================================
// 采配の妥当性チェック
// ============================================================

export function validateOrder(
  order: TacticalOrder,
  state: MatchState,
): { valid: boolean; reason?: string } {
  const battingTeam = state.currentHalf === 'top' ? state.awayTeam : state.homeTeam;
  const fieldingTeam = state.currentHalf === 'top' ? state.homeTeam : state.awayTeam;

  switch (order.type) {
    case 'none':
      return { valid: true };

    case 'bunt':
    case 'steal':
    case 'hit_and_run':
      return { valid: true }; // 簡易: 常に有効

    case 'intentional_walk':
      return { valid: true };

    case 'pinch_hit': {
      const outPlayer = battingTeam.players.find((p) => p.player.id === order.outPlayerId);
      const inPlayer = battingTeam.players.find((p) => p.player.id === order.inPlayerId);
      if (!outPlayer || !inPlayer) return { valid: false, reason: 'Player not found' };
      if (!battingTeam.battingOrder.includes(order.outPlayerId)) {
        return { valid: false, reason: 'outPlayer not in batting order' };
      }
      if (!battingTeam.benchPlayerIds.includes(order.inPlayerId)) {
        return { valid: false, reason: 'inPlayer not in bench' };
      }
      if (battingTeam.usedPlayerIds.has(order.inPlayerId)) {
        return { valid: false, reason: 'inPlayer already used' };
      }
      return { valid: true };
    }

    case 'pitching_change': {
      const newPitcher = fieldingTeam.players.find((p) => p.player.id === order.newPitcherId);
      if (!newPitcher || !newPitcher.player.stats.pitching) {
        return { valid: false, reason: 'New pitcher not found or not a pitcher' };
      }
      if (!fieldingTeam.benchPlayerIds.includes(order.newPitcherId)) {
        return { valid: false, reason: 'New pitcher not in bench' };
      }
      return { valid: true };
    }

    case 'pinch_run': {
      const outPlayer = battingTeam.players.find((p) => p.player.id === order.outPlayerId);
      const inPlayer = battingTeam.players.find((p) => p.player.id === order.inPlayerId);
      if (!outPlayer || !inPlayer) return { valid: false, reason: 'Player not found' };
      if (!battingTeam.benchPlayerIds.includes(order.inPlayerId)) {
        return { valid: false, reason: 'inPlayer not in bench' };
      }
      return { valid: true };
    }

    case 'defensive_sub': {
      const inPlayer = fieldingTeam.players.find((p) => p.player.id === order.inPlayerId);
      if (!inPlayer) return { valid: false, reason: 'inPlayer not found' };
      if (!fieldingTeam.benchPlayerIds.includes(order.inPlayerId)) {
        return { valid: false, reason: 'inPlayer not in bench' };
      }
      return { valid: true };
    }

    case 'mound_visit': {
      const moundVisitCount = state.log.filter((e) => e.description.includes('Mound visit')).length;
      if (moundVisitCount >= MATCH_CONSTANTS.MOUND_VISIT_LIMIT) {
        return { valid: false, reason: 'Mound visit limit reached' };
      }
      return { valid: true };
    }

    default:
      return { valid: false, reason: 'Unknown order type' };
  }
}

// ============================================================
// 采配の適用
// ============================================================

export function applyPinchHit(
  state: MatchState,
  outPlayerId: string,
  inPlayerId: string,
): MatchState {
  const battingTeam = state.currentHalf === 'top' ? state.awayTeam : state.homeTeam;
  const outPlayerIndex = battingTeam.battingOrder.indexOf(outPlayerId);
  const inPlayer = battingTeam.players.find((p) => p.player.id === inPlayerId);

  if (outPlayerIndex < 0 || !inPlayer) return state;

  const newBattingOrder = [...battingTeam.battingOrder];
  newBattingOrder[outPlayerIndex] = inPlayerId;

  const newBench = battingTeam.benchPlayerIds.filter((id) => id !== inPlayerId);
  const newUsed = new Set([...battingTeam.usedPlayerIds, outPlayerId]);

  const updatedTeam: MatchTeam = {
    ...battingTeam,
    battingOrder: newBattingOrder,
    benchPlayerIds: newBench,
    usedPlayerIds: newUsed,
  };

  const isTop = state.currentHalf === 'top';
  return {
    ...state,
    awayTeam: isTop ? updatedTeam : state.awayTeam,
    homeTeam: isTop ? state.homeTeam : updatedTeam,
    log: [
      ...state.log,
      {
        inning: state.currentInning,
        half: state.currentHalf,
        type: 'substitution',
        description: `Pinch hit: ${outPlayerId} → ${inPlayerId}`,
      },
    ],
  };
}

export function applyPitchingChange(
  state: MatchState,
  newPitcherId: string,
): MatchState {
  const fieldingTeam = state.currentHalf === 'top' ? state.homeTeam : state.awayTeam;
  const oldPitcherId = fieldingTeam.currentPitcherId;

  const newUsed = new Set([...fieldingTeam.usedPlayerIds, oldPitcherId]);

  const updatedTeam: MatchTeam = {
    ...fieldingTeam,
    currentPitcherId: newPitcherId,
    usedPlayerIds: newUsed,
    players: fieldingTeam.players.map((mp) =>
      mp.player.id === newPitcherId
        ? { ...mp, stamina: 100, isWarmedUp: true }
        : mp,
    ),
  };

  const isTop = state.currentHalf === 'top';
  return {
    ...state,
    homeTeam: isTop ? updatedTeam : state.homeTeam,
    awayTeam: isTop ? state.awayTeam : updatedTeam,
    log: [
      ...state.log,
      {
        inning: state.currentInning,
        half: state.currentHalf,
        type: 'pitching_change',
        description: `Pitching change: ${oldPitcherId} → ${newPitcherId}`,
      },
    ],
  };
}

export function applyPinchRun(
  state: MatchState,
  outPlayerId: string,
  inPlayerId: string,
): MatchState {
  const battingTeam = state.currentHalf === 'top' ? state.awayTeam : state.homeTeam;
  const inPlayer = battingTeam.players.find((p) => p.player.id === inPlayerId);

  if (!inPlayer) return state;

  // 塁上の outPlayerId を inPlayerId で置き換える
  const replaceRunner = (
    runner: import('./types').RunnerInfo | null,
  ): import('./types').RunnerInfo | null => {
    if (!runner || runner.playerId !== outPlayerId) return runner;
    return {
      playerId: inPlayerId,
      speed: inPlayer.player.stats.base.speed,
    };
  };

  const newBases = {
    first: replaceRunner(state.bases.first),
    second: replaceRunner(state.bases.second),
    third: replaceRunner(state.bases.third),
  };

  const newBench = battingTeam.benchPlayerIds.filter((id) => id !== inPlayerId);
  const newUsed = new Set([...battingTeam.usedPlayerIds, outPlayerId, inPlayerId]);

  const updatedTeam: MatchTeam = {
    ...battingTeam,
    benchPlayerIds: newBench,
    usedPlayerIds: newUsed,
  };

  const isTop = state.currentHalf === 'top';
  return {
    ...state,
    bases: newBases,
    awayTeam: isTop ? updatedTeam : state.awayTeam,
    homeTeam: isTop ? state.homeTeam : updatedTeam,
    log: [
      ...state.log,
      {
        inning: state.currentInning,
        half: state.currentHalf,
        type: 'substitution',
        description: `Pinch run: ${outPlayerId} → ${inPlayerId}`,
      },
    ],
  };
}

export function applyDefensiveSub(
  state: MatchState,
  order: { type: 'defensive_sub'; inPlayerId: string; outPlayerId: string; position: Position },
): MatchState {
  const fieldingTeam = state.currentHalf === 'top' ? state.homeTeam : state.awayTeam;
  const outPlayerIndex = fieldingTeam.battingOrder.indexOf(order.outPlayerId);

  if (outPlayerIndex < 0) return state;

  // battingOrder の outPlayerId を inPlayerId に置き換える
  const newBattingOrder = [...fieldingTeam.battingOrder];
  newBattingOrder[outPlayerIndex] = order.inPlayerId;

  // fieldPositions を更新: outPlayerId を削除し inPlayerId を追加
  const newFieldPositions = new Map(fieldingTeam.fieldPositions);
  newFieldPositions.delete(order.outPlayerId);
  newFieldPositions.set(order.inPlayerId, order.position);

  const newBench = fieldingTeam.benchPlayerIds.filter((id) => id !== order.inPlayerId);
  const newUsed = new Set([...fieldingTeam.usedPlayerIds, order.outPlayerId, order.inPlayerId]);

  const updatedTeam: MatchTeam = {
    ...fieldingTeam,
    battingOrder: newBattingOrder,
    fieldPositions: newFieldPositions,
    benchPlayerIds: newBench,
    usedPlayerIds: newUsed,
  };

  const isTop = state.currentHalf === 'top';
  return {
    ...state,
    homeTeam: isTop ? updatedTeam : state.homeTeam,
    awayTeam: isTop ? state.awayTeam : updatedTeam,
    log: [
      ...state.log,
      {
        inning: state.currentInning,
        half: state.currentHalf,
        type: 'substitution',
        description: `Defensive sub: ${order.outPlayerId} → ${order.inPlayerId} (${order.position})`,
      },
    ],
  };
}

export function applyMoundVisit(state: MatchState): MatchState {
  const fieldingTeam = state.currentHalf === 'top' ? state.homeTeam : state.awayTeam;
  const pitcherId = fieldingTeam.currentPitcherId;

  const updatedTeam: MatchTeam = {
    ...fieldingTeam,
    players: fieldingTeam.players.map((mp) =>
      mp.player.id === pitcherId
        ? {
            ...mp,
            confidence: Math.min(100, mp.confidence + MATCH_CONSTANTS.MOUND_VISIT_CONFIDENCE_GAIN),
          }
        : mp,
    ),
  };

  const isTop = state.currentHalf === 'top';
  return {
    ...state,
    homeTeam: isTop ? updatedTeam : state.homeTeam,
    awayTeam: isTop ? state.awayTeam : updatedTeam,
    log: [
      ...state.log,
      {
        inning: state.currentInning,
        half: state.currentHalf,
        type: 'pitch',
        description: `Mound visit`,
        playerId: pitcherId,
      },
    ],
  };
}

// ============================================================
// サイン遵守判定
// ============================================================

export function willObeySign(
  player: import('../types').MatchPlayer,
  order: TacticalOrder,
  state: MatchState,
  rng: RNG,
): boolean {
  let complianceRate = MATCH_CONSTANTS.SIGN_COMPLIANCE_BASE;

  // 性格補正
  if (player.player.traits.includes('honest')) {
    complianceRate += 0.05;
  }
  if (player.player.traits.includes('rebellious')) {
    complianceRate -= 0.15;
  }
  if (player.player.traits.includes('overconfident')) {
    complianceRate -= 0.08;
    if (player.confidence > 80) complianceRate -= 0.05;
  }
  if (player.player.traits.includes('competitive')) {
    // チャンス判定: 得点圏走者 && 2アウト以下
    if (state.bases.second || state.bases.third) {
      complianceRate -= 0.03;
    }
  }

  // confidence補正
  if (player.confidence > 80) {
    complianceRate -= 0.05;
  } else if (player.confidence < 30) {
    complianceRate += 0.05;
  }

  // 場面補正: バント指示 + 4番打者
  if (order.type === 'bunt') {
    const battingTeam = state.currentHalf === 'top' ? state.awayTeam : state.homeTeam;
    if (battingTeam.battingOrder[3] === player.player.id) {
      complianceRate -= 0.10;
    }
  }

  complianceRate = Math.max(0, Math.min(1, complianceRate));
  return rng.chance(complianceRate);
}

// ============================================================
// 盗塁
// ============================================================

export function attemptSteal(
  state: MatchState,
  runnerId: string,
  rng: RNG,
): { success: boolean; nextState: MatchState } {
  // 簡易実装: 常に成功（詳細な走力vs肩力計算はM3.5以降）
  return { success: true, nextState: state };
}

// ============================================================
// CPU自動采配
// ============================================================

export function cpuAutoTactics(
  state: MatchState,
  rng: RNG,
): TacticalOrder {
  const fieldingTeam = state.currentHalf === 'top' ? state.homeTeam : state.awayTeam;
  const currentPitcher = fieldingTeam.players.find((p) => p.player.id === fieldingTeam.currentPitcherId);

  // 投手交代判定
  if (currentPitcher && (currentPitcher.stamina < 20 || currentPitcher.pitchCountInGame > 100)) {
    const reliever = fieldingTeam.benchPlayerIds.find((id) => {
      const mp = fieldingTeam.players.find((p) => p.player.id === id);
      return mp?.player.stats.pitching !== undefined;
    });
    if (reliever) {
      return { type: 'pitching_change', newPitcherId: reliever };
    }
  }

  // バント判定
  if (
    state.bases.first &&
    !state.bases.second &&
    state.outs === 0 &&
    Math.abs(state.score.home - state.score.away) <= 1 &&
    state.currentInning >= 7
  ) {
    const batter = state.currentHalf === 'top'
      ? state.awayTeam.battingOrder[state.currentBatterIndex]
      : state.homeTeam.battingOrder[state.currentBatterIndex];
    return { type: 'bunt', playerId: batter };
  }

  return { type: 'none' };
}
