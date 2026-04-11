import type { Team } from '../types/team';
import type { Player, Grade } from '../types/player';

export function addPlayer(team: Team, player: Player): Team {
  return { ...team, players: [...team.players, player] };
}

export function removePlayer(team: Team, playerId: string): Team {
  return { ...team, players: team.players.filter((p) => p.id !== playerId) };
}

export function getPlayersByGrade(team: Team, grade: Grade, currentYear: number): Player[] {
  return team.players.filter((p) => {
    const diff = currentYear - p.enrollmentYear + 1;
    return diff === grade;
  });
}

export function getActiveRoster(team: Team): Player[] {
  return team.players.filter((p) => p.condition.injury === null);
}

export function getRosterSize(team: Team): number {
  return team.players.length;
}

export function findPlayerById(team: Team, playerId: string): Player | undefined {
  return team.players.find((p) => p.id === playerId);
}
