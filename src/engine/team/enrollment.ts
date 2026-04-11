import type { GameState, GraduateRecord } from '../types/game-state';
import type { Team } from '../types/team';
import type { Player, CareerRecord } from '../types/player';
import type { RNG } from '../core/rng';
import { generatePlayer } from '../player/generate';
import { addPlayer, removePlayer } from './roster';
import { autoGenerateLineup } from './lineup';

function computeOverall(player: Player): number {
  const b = player.stats.base;
  const bat = player.stats.batting;
  const baseAvg = (b.stamina + b.speed + b.armStrength + b.fielding + b.focus + b.mental) / 6;
  const batAvg = (bat.contact + bat.power + bat.eye + bat.technique) / 4;
  return Math.round((baseAvg + batAvg) / 2);
}

function computeBatting(player: Player): number {
  const bat = player.stats.batting;
  return Math.round((bat.contact + bat.power + bat.eye + bat.technique) / 4);
}

function computePitching(player: Player): number | null {
  if (!player.stats.pitching) return null;
  const p = player.stats.pitching;
  // Normalize velocity: (vel - 80) / 80 * 100
  const velNorm = ((p.velocity - 80) / 80) * 100;
  return Math.round((velNorm + p.control + p.pitchStamina) / 3);
}

export function toGraduateRecord(player: Player, graduationYear: number): GraduateRecord {
  return {
    playerId: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    graduationYear,
    enrollmentYear: player.enrollmentYear,
    position: player.position,
    throwingHand: player.throwingHand,
    battingSide: player.battingSide,
    finalStats: {
      overall: computeOverall(player),
      batting: computeBatting(player),
      pitching: computePitching(player),
      speed: player.stats.base.speed,
      defense: player.stats.base.fielding,
    },
    growthType: player.potential.growthType,
    traits: player.traits,
    careerStats: { ...player.careerStats },
  };
}

export function processGraduation(team: Team, currentYear: number): { team: Team; graduates: GraduateRecord[] } {
  const graduates: GraduateRecord[] = [];
  let newTeam = { ...team };

  for (const player of team.players) {
    const grade = currentYear - player.enrollmentYear + 1;
    if (grade >= 3) {
      graduates.push(toGraduateRecord(player, currentYear));
      newTeam = removePlayer(newTeam, player.id);
    }
  }

  return { team: newTeam, graduates };
}

export function processEnrollment(
  team: Team,
  currentYear: number,
  reputation: number,
  rng: RNG
): { team: Team; newPlayers: Player[] } {
  // baseCount = 5 + floor(reputation / 10)
  const baseCount = 5 + Math.floor(reputation / 10);
  const variance = rng.intBetween(-2, 2);
  const count = Math.max(3, Math.min(18, baseCount + variance));

  const newPlayers: Player[] = [];
  for (let i = 0; i < count; i++) {
    const player = generatePlayer(rng.derive(`enrollment:${currentYear}:${i}`), {
      enrollmentYear: currentYear,
      schoolReputation: reputation,
    });
    newPlayers.push(player);
  }

  let newTeam = { ...team };
  for (const p of newPlayers) {
    newTeam = addPlayer(newTeam, p);
  }

  return { team: newTeam, newPlayers };
}

export function processYearTransition(state: GameState, rng: RNG): GameState {
  const currentYear = state.currentDate.year;

  // 1. Graduate 3rd year players
  const { team: teamAfterGrad, graduates } = processGraduation(state.team, currentYear);

  // 2. Enroll new 1st year players
  const { team: teamAfterEnroll } = processEnrollment(
    teamAfterGrad,
    currentYear,
    state.team.reputation,
    rng
  );

  // 3. Reset lineup
  const newTeam = { ...teamAfterEnroll, lineup: null };

  // 4. Increment manager years
  const newManager = { ...state.manager, yearsActive: state.manager.yearsActive + 1 };

  // 5. Update reputation slightly based on some random variance
  // (simplified: ±2 random variance)
  const repChange = rng.intBetween(-2, 2);
  const newReputation = Math.max(0, Math.min(100, newTeam.reputation + repChange));
  const finalTeam = { ...newTeam, reputation: newReputation };

  return {
    ...state,
    team: finalTeam,
    manager: newManager,
    graduates: [...state.graduates, ...graduates],
  };
}
