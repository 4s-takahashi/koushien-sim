import { describe, it } from 'vitest';
import { createRNG } from '@/engine/core/rng';
import { processAtBat } from '@/engine/match/at-bat';
import { generatePlayer, type PlayerGenConfig } from '@/engine/player/generate';
import type { MatchPlayer, MatchState, MatchTeam } from '@/engine/match/types';
import { EMPTY_BASES } from '@/engine/match/types';

function createTestTeam(name: string, seed: string): MatchTeam {
  const rng = createRNG(seed);
  const config: PlayerGenConfig = { enrollmentYear: 1, schoolReputation: 50 };
  const players: MatchPlayer[] = [];
  let pitcherFound = false;
  for (let i = 0; i < 50 && !pitcherFound; i++) {
    const player = generatePlayer(rng.derive(`${name}-find-pitcher-${i}`), config);
    if (player.position === 'pitcher' && player.stats.pitching) {
      players.push({ player, pitchCountInGame: 0, stamina: 100, confidence: 50, isWarmedUp: true });
      pitcherFound = true;
    }
  }
  for (let i = 1; i < 14; i++) {
    const player = generatePlayer(rng.derive(`${name}-player-${i}`), config);
    players.push({ player, pitchCountInGame: 0, stamina: 100, confidence: 50, isWarmedUp: false });
  }
  const battingPlayers = players.slice(0, 9);
  const positions = ['pitcher','catcher','first','second','third','shortstop','left','center','right'] as const;
  return {
    id: name, name, players,
    battingOrder: battingPlayers.map(p => p.player.id),
    fieldPositions: new Map(battingPlayers.map((p,i) => [p.player.id, positions[i]])),
    currentPitcherId: players[0].player.id,
    benchPlayerIds: players.slice(9).map(p => p.player.id),
    usedPlayerIds: new Set(),
  };
}

describe('quick debug', () => {
  it('track pitch counts per at-bat', () => {
    const homeTeam = createTestTeam('Home', 'balance-v1-home-0');
    const awayTeam = createTestTeam('Away', 'balance-v1-away-0');
    const state: MatchState = {
      config: { innings: 9, maxExtras: 3, useDH: false, isTournament: false, isKoshien: false },
      homeTeam, awayTeam, currentInning: 1, currentHalf: 'top', outs: 0,
      count: { balls: 0, strikes: 0 }, bases: EMPTY_BASES,
      score: { home: 0, away: 0 }, inningScores: { home: [], away: [] },
      currentBatterIndex: 0, pitchCount: 0, log: [], isOver: false, result: null
    };

    const pitchesPerAB: number[] = [];
    const outcomes: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      const { result } = processAtBat(state, { type: 'none' }, createRNG(`ab-${i}`));
      pitchesPerAB.push(result.pitches.length);
      const t = result.outcome.type;
      outcomes[t] = (outcomes[t] || 0) + 1;
    }
    
    const avg = pitchesPerAB.reduce((a,b) => a+b, 0) / pitchesPerAB.length;
    const zero = pitchesPerAB.filter(x=>x===0).length;
    const one = pitchesPerAB.filter(x=>x===1).length;
    const two = pitchesPerAB.filter(x=>x===2).length;
    const threePlus = pitchesPerAB.filter(x=>x>=3).length;
    
    console.log(`Avg pitches per AB: ${avg.toFixed(2)}`);
    console.log(`0 pitches: ${zero}, 1 pitch: ${one}, 2 pitches: ${two}, 3+ pitches: ${threePlus}`);
    console.log('Outcomes:', JSON.stringify(outcomes));
  });
});
