import type { Team, Lineup, LineupSlot, ValidationResult } from '../types/team';
import type { Player, Position } from '../types/player';

export function createLineup(starters: LineupSlot[], bench: string[]): Lineup {
  const battingOrder = starters.map((s) => s.playerId);
  const lineup: Lineup = { starters, bench, battingOrder };
  return lineup;
}

export function validateLineup(lineup: Lineup, team: Team): ValidationResult {
  const errors: string[] = [];

  // Check 9 starters
  if (lineup.starters.length !== 9) {
    errors.push(`スターターが${lineup.starters.length}人です（9人必要）`);
  }

  // Check for pitcher
  const hasPitcher = lineup.starters.some((s) => s.position === 'pitcher');
  if (!hasPitcher) {
    errors.push('投手が指定されていません');
  }

  // Check for duplicates
  const playerIds = lineup.starters.map((s) => s.playerId);
  const uniqueIds = new Set(playerIds);
  if (uniqueIds.size !== playerIds.length) {
    errors.push('同一選手が重複しています');
  }

  // Check all players exist in team
  for (const slot of lineup.starters) {
    const player = team.players.find((p) => p.id === slot.playerId);
    if (!player) {
      errors.push(`選手ID ${slot.playerId} がチームに存在しません`);
    }
  }

  // battingOrder matches starters
  if (lineup.battingOrder.length !== lineup.starters.length) {
    errors.push('打順の人数がスターターと一致しません');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function autoGenerateLineup(team: Team, currentYear: number): Lineup {
  const activePlayers = team.players.filter((p) => p.condition.injury === null);

  if (activePlayers.length < 9) {
    // Use all available players if < 9
    const all = [...team.players];
    const starters = all.slice(0, Math.min(9, all.length)).map((p, i) => ({
      playerId: p.id,
      position: p.position,
    }));
    return createLineup(starters, []);
  }

  // 1. Find best pitcher
  const pitchers = activePlayers.filter((p) => p.stats.pitching !== null);
  let pitcher: Player | undefined;
  if (pitchers.length > 0) {
    pitcher = pitchers.reduce((best, p) => {
      const score = (p.stats.pitching?.control ?? 0) + (p.stats.pitching?.pitchStamina ?? 0) + ((p.stats.pitching?.velocity ?? 100) - 100) * 0.5;
      const bestScore = (best.stats.pitching?.control ?? 0) + (best.stats.pitching?.pitchStamina ?? 0) + ((best.stats.pitching?.velocity ?? 100) - 100) * 0.5;
      return score > bestScore ? p : best;
    });
  } else {
    pitcher = activePlayers[0];
  }

  const remaining = activePlayers.filter((p) => p.id !== pitcher!.id);

  // 2. Find best catcher (highest fielding + armStrength)
  const catcher = remaining.reduce((best, p) => {
    const score = p.stats.base.fielding + p.stats.base.armStrength;
    const bestScore = best.stats.base.fielding + best.stats.base.armStrength;
    return score > bestScore ? p : best;
  }, remaining[0]);

  const remaining2 = remaining.filter((p) => p.id !== catcher.id);

  // 3. Remaining 7 by fielding ability
  const field7 = remaining2.slice(0, 7);

  // Assign positions roughly
  const FIELD_POSITIONS: Position[] = ['first', 'second', 'third', 'shortstop', 'left', 'center', 'right'];
  const fieldStarters: LineupSlot[] = field7.map((p, i) => ({
    playerId: p.id,
    position: FIELD_POSITIONS[i] ?? 'left',
  }));

  // 4. Build batting order
  // 1番: speed最高
  const sorted1 = [...field7].sort((a, b) => b.stats.base.speed - a.stats.base.speed);
  // 2番: contact最高 (1番除く)
  const sorted2 = [...field7].filter((p) => p.id !== sorted1[0]?.id).sort((a, b) => b.stats.batting.contact - a.stats.batting.contact);
  // 3番: contact+power合計最高
  const sorted3 = [...field7].filter((p) => p.id !== sorted1[0]?.id && p.id !== sorted2[0]?.id)
    .sort((a, b) => (b.stats.batting.contact + b.stats.batting.power) - (a.stats.batting.contact + a.stats.batting.power));
  // 4番: power最高
  const sorted4 = [...field7].filter((p) => !([sorted1[0], sorted2[0], sorted3[0]].map((x) => x?.id).includes(p.id)))
    .sort((a, b) => b.stats.batting.power - a.stats.batting.power);

  // Order: 1,2,3,4, catcher(5), remaining (6,7,8), pitcher(9)
  const battingOrder = [
    sorted1[0]?.id ?? field7[0]?.id,
    sorted2[0]?.id ?? field7[1]?.id,
    sorted3[0]?.id ?? field7[2]?.id,
    sorted4[0]?.id ?? field7[3]?.id,
    catcher.id,
    ...field7.filter((p) => ![sorted1[0]?.id, sorted2[0]?.id, sorted3[0]?.id, sorted4[0]?.id].includes(p.id))
      .slice(0, 3).map((p) => p.id),
    pitcher!.id,
  ].filter(Boolean).slice(0, 9) as string[];

  const startersRaw: LineupSlot[] = [
    { playerId: pitcher!.id, position: 'pitcher' },
    { playerId: catcher.id, position: 'catcher' },
    ...fieldStarters,
  ];
  const starters: LineupSlot[] = startersRaw.slice(0, 9);

  const bench = activePlayers.filter((p) => !starters.some((s) => s.playerId === p.id)).map((p) => p.id);

  return { starters, bench, battingOrder };
}

export function swapBattingOrder(lineup: Lineup, idx1: number, idx2: number): Lineup {
  const newOrder = [...lineup.battingOrder];
  [newOrder[idx1], newOrder[idx2]] = [newOrder[idx2], newOrder[idx1]];
  return { ...lineup, battingOrder: newOrder };
}

export function substitutePlayer(lineup: Lineup, outId: string, inId: string, position: Position): Lineup {
  const newStarters = lineup.starters.map((slot) =>
    slot.playerId === outId ? { playerId: inId, position } : slot
  );
  const newBench = lineup.bench.includes(inId)
    ? [...lineup.bench.filter((id) => id !== inId), outId]
    : [...lineup.bench, outId];
  const newOrder = lineup.battingOrder.map((id) => (id === outId ? inId : id));

  return { starters: newStarters, bench: newBench, battingOrder: newOrder };
}
