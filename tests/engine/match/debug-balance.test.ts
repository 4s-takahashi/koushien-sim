import { describe, it, expect } from 'vitest';
import { runGame } from '../../../src/engine/match/game';
import { processAtBat } from '../../../src/engine/match/at-bat';
import { getEffectiveBatterParams, getEffectivePitcherParams } from '../../../src/engine/match/pitch/process-pitch';
import { createRNG } from '../../../src/engine/core/rng';
import { generatePlayer, type PlayerGenConfig } from '../../../src/engine/player/generate';
import type { MatchConfig, MatchTeam, MatchPlayer, MatchState } from '../../../src/engine/match/types';
import { EMPTY_BASES } from '../../../src/engine/match/types';

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
    players.push({ player: generatePlayer(rng.derive(`${name}-player-${i}`), config), pitchCountInGame: 0, stamina: 100, confidence: 50, isWarmedUp: false });
  }
  const positions = ['pitcher','catcher','first','second','third','shortstop','left','center','right'] as const;
  return {
    id: name, name, players,
    battingOrder: players.slice(0,9).map(p=>p.player.id),
    fieldPositions: new Map(players.slice(0,9).map((p,i)=>[p.player.id,positions[i]])),
    currentPitcherId: players[0].player.id,
    benchPlayerIds: players.slice(9).map(p=>p.player.id),
    usedPlayerIds: new Set(),
  };
}

describe('debug balance', () => {
  it('check effective params', () => {
    const h = createTestTeam('H', 'dbg-h');

    // 打者パラメータチェック
    for (let i = 0; i < 3; i++) {
      const mp = h.players[i+1]; // 野手
      const bp = getEffectiveBatterParams(mp);
      console.log(`Batter ${i}: contact=${bp.contact.toFixed(1)} power=${bp.power.toFixed(1)} eye=${bp.eye.toFixed(1)} technique=${bp.technique.toFixed(1)}`);
      console.log(`  raw contact=${mp.player.stats.batting?.contact} mood=${mp.player.condition.mood}`);
    }

    // 投手パラメータチェック
    const pitcherMP = h.players[0];
    const pp = getEffectivePitcherParams(pitcherMP);
    console.log(`Pitcher: velocity=${pp.velocity.toFixed(1)} control=${pp.control.toFixed(1)} stamina=${pp.stamina}`);
    console.log(`  raw velocity=${pitcherMP.player.stats.pitching?.velocity} control=${pitcherMP.player.stats.pitching?.control}`);

    expect(true).toBe(true);
  });
});
