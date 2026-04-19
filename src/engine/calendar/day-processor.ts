import type { GameState } from '../types/game-state';
import type {
  DayProcessResult, DayResult, GameEvent, PracticeMenuId, PlayerDayChange, DayType
} from '../types/calendar';
import type { Player, InjuryState } from '../types/player';
import type { RNG } from '../core/rng';
import { generateId } from '../core/id';
import { getDayType, advanceDate } from './game-calendar';
import { getAnnualSchedule, isInCamp } from './schedule';
import { getPracticeMenuById, getDefaultMenu } from '../growth/practice';
import { applyDailyGrowth } from '../growth/calculate';
import { updateDailyCondition, applyFatigue, recoverFatigue, rollInjury, advanceInjury } from '../growth/condition';
import { processYearTransition } from '../team/enrollment';

/** Phase 1: Morning - update condition for all players */
export function processConditionPhase(players: Player[], rng: RNG): Player[] {
  return players.map((player) => {
    const newCondition = updateDailyCondition(player, rng.derive(player.id + ':condition'));
    return { ...player, condition: newCondition };
  });
}

/** Phase 2: Practice - apply growth to all players */
export function processPracticePhase(
  players: Player[],
  menuId: PracticeMenuId,
  date: { month: number; day: number },
  rng: RNG,
  seasonMultiplier: number,
  /**
   * 選手ごとの個別練習メニュー (Phase 11-A1 Issue #4 2026-04-19)。
   * 指定された選手は menuId ではなく individual メニューで練習する。
   */
  individualMenus?: Record<string, PracticeMenuId>,
): { players: Player[]; changes: PlayerDayChange[] } {
  const teamMenu = getPracticeMenuById(menuId);
  const changes: PlayerDayChange[] = [];

  const newPlayers = players.map((player) => {
    // Skip injured players (they can't practice)
    if (player.condition.injury !== null) {
      changes.push({
        playerId: player.id,
        statChanges: [],
        fatigueChange: 0,
        moodBefore: player.condition.mood,
        moodAfter: player.condition.mood,
      });
      return player;
    }

    // 選手個別メニュー (Phase 11-A1): 指定があればそちらを使う
    const playerMenuId = individualMenus?.[player.id];
    const menu = playerMenuId ? getPracticeMenuById(playerMenuId) : teamMenu;

    const moodBefore = player.condition.mood;
    const { player: grownPlayer, statChanges } = applyDailyGrowth(
      player,
      menu,
      rng.derive(player.id + ':growth'),
      seasonMultiplier
    );

    // Apply fatigue from practice
    const fatigueBefore = grownPlayer.condition.fatigue;
    const newCondition = applyFatigue(grownPlayer.condition, menu.fatigueLoad);
    const fatigueAfter = newCondition.fatigue;

    const finalPlayer = { ...grownPlayer, condition: newCondition };

    changes.push({
      playerId: player.id,
      statChanges,
      fatigueChange: fatigueAfter - fatigueBefore,
      moodBefore,
      moodAfter: moodBefore, // mood changes in condition phase
    });

    return finalPlayer;
  });

  return { players: newPlayers, changes };
}

/** Apply rest to all players (off day) */
export function applyRestToAll(players: Player[]): Player[] {
  return players.map((player) => {
    const newCondition = recoverFatigue(player.condition, true);
    return { ...player, condition: newCondition };
  });
}

/** Simple practice match for tournament days (Phase 1) */
export function processSimplePracticeMatch(players: Player[], rng: RNG): Player[] {
  // Just apply slight fatigue and mood changes
  return players.map((player) => {
    if (player.condition.injury !== null) return player;
    const newCondition = applyFatigue(player.condition, 5);
    return { ...player, condition: newCondition };
  });
}

/** Process random events */
export function processRandomEvents(state: GameState, rng: RNG, date: { year: number; month: number; day: number }): GameEvent[] {
  const events: GameEvent[] = [];

  // Slump events: random chance
  for (const player of state.team.players) {
    if (rng.derive(player.id + ':slump').chance(0.001)) {
      if (!player.mentalState.flags.includes('slump')) {
        events.push({
          id: generateId(),
          type: 'slump_start',
          date,
          description: `${player.lastName} ${player.firstName}がスランプに入った`,
          involvedPlayerIds: [player.id],
        });
      }
    }

    if (player.mentalState.flags.includes('slump') && rng.derive(player.id + ':slump_end').chance(0.05)) {
      events.push({
        id: generateId(),
        type: 'slump_end',
        date,
        description: `${player.lastName} ${player.firstName}がスランプを脱出した`,
        involvedPlayerIds: [player.id],
      });
    }
  }

  return events;
}

/** Apply events to players (update mental flags) */
export function applyEvents(players: Player[], events: GameEvent[]): Player[] {
  let updatedPlayers = [...players];

  for (const event of events) {
    if (event.type === 'slump_start') {
      updatedPlayers = updatedPlayers.map((p) => {
        if (event.involvedPlayerIds.includes(p.id)) {
          return {
            ...p,
            mentalState: {
              ...p.mentalState,
              flags: [...p.mentalState.flags, 'slump'],
            },
          };
        }
        return p;
      });
    } else if (event.type === 'slump_end') {
      updatedPlayers = updatedPlayers.map((p) => {
        if (event.involvedPlayerIds.includes(p.id)) {
          return {
            ...p,
            mentalState: {
              ...p.mentalState,
              flags: p.mentalState.flags.filter((f) => f !== 'slump'),
            },
          };
        }
        return p;
      });
    }
  }

  return updatedPlayers;
}

/** Day-end phase: recovery + injury progression */
export function processEndOfDay(players: Player[], rng: RNG, dayType: DayType): {
  players: Player[];
  injuries: { playerId: string; injury: InjuryState }[];
  recovered: string[];
} {
  const injuries: { playerId: string; injury: InjuryState }[] = [];
  const recovered: string[] = [];
  const isRest = dayType === 'off_day' || dayType === 'rest' as DayType;

  const newPlayers = players.map((player) => {
    let updatedPlayer = { ...player };

    // Advance existing injury
    if (updatedPlayer.condition.injury !== null) {
      const advanced = advanceInjury(updatedPlayer.condition.injury);
      if (advanced === null) {
        recovered.push(updatedPlayer.id);
        updatedPlayer = {
          ...updatedPlayer,
          condition: { ...updatedPlayer.condition, injury: null },
        };
      } else {
        updatedPlayer = {
          ...updatedPlayer,
          condition: { ...updatedPlayer.condition, injury: advanced },
        };
      }
    } else {
      // Roll for new injury (only on practice days)
      if (dayType !== 'off_day' && dayType !== 'ceremony_day') {
        const newInjury = rollInjury(updatedPlayer, 5, rng.derive(updatedPlayer.id + ':injury'));
        if (newInjury !== null) {
          injuries.push({ playerId: updatedPlayer.id, injury: newInjury });
          updatedPlayer = {
            ...updatedPlayer,
            condition: { ...updatedPlayer.condition, injury: newInjury },
          };
        }
      }
    }

    // Natural fatigue recovery
    const newCondition = recoverFatigue(updatedPlayer.condition, isRest);
    updatedPlayer = { ...updatedPlayer, condition: newCondition };

    return updatedPlayer;
  });

  return { players: newPlayers, injuries, recovered };
}

/** Main function: process 1 day
 * @param individualMenus 選手ごとの個別練習メニュー (Phase 11-A1 Issue #4)
 */
export function processDay(
  state: GameState,
  menuId: PracticeMenuId,
  rng: RNG,
  individualMenus?: Record<string, PracticeMenuId>,
): DayProcessResult {
  const schedule = getAnnualSchedule();
  const date = state.currentDate;
  const dayType = getDayType(date, schedule);
  const seasonMultiplier = isInCamp(date) ? 1.5 : 1.0;

  // Phase 1: Morning condition
  let players = processConditionPhase(state.team.players, rng);

  let practiceApplied: PracticeMenuId | null = null;
  let practiceChanges: PlayerDayChange[] = [];

  // Phase 2: Practice/activity
  if (dayType === 'school_day' || dayType === 'holiday' || dayType === 'camp_day' || dayType === 'ceremony_day') {
    const effectiveMenu = menuId === 'rest' && dayType === 'ceremony_day' ? 'rest' : menuId;
    practiceApplied = effectiveMenu;
    const result = processPracticePhase(players, effectiveMenu, date, rng, seasonMultiplier, individualMenus);
    players = result.players;
    practiceChanges = result.changes;
  } else if (dayType === 'tournament_day') {
    players = processSimplePracticeMatch(players, rng);
    practiceApplied = null;
  } else if (dayType === 'off_day') {
    players = applyRestToAll(players);
    practiceApplied = 'rest';
  }

  // Phase 3: Random events
  const events = processRandomEvents({ ...state, team: { ...state.team, players } }, rng, date);
  players = applyEvents(players, events);

  // Phase 4: End of day
  const { players: finalPlayers, injuries, recovered } = processEndOfDay(players, rng, dayType);

  // Phase 5: Advance date
  let newDate = advanceDate(date);

  // Phase 6: Year transition check (when crossing to April 1)
  let newState: GameState = {
    ...state,
    currentDate: newDate,
    team: { ...state.team, players: finalPlayers },
  };

  // If we just moved to April 1, process year transition
  if (newDate.month === 4 && newDate.day === 1) {
    newState = processYearTransition(newState, rng);
  }

  const dayResult: DayResult = {
    date,
    dayType,
    practiceApplied,
    playerChanges: practiceChanges,
    events,
    injuries,
    recovered,
  };

  return { nextState: newState, dayResult };
}
