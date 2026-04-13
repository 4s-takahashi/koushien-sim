/**
 * processPitch のサンプル3件出力
 * 実行: npx tsx scripts/sample-pitch.ts
 */
import { createRNG } from '../src/engine/core/rng';
import { processPitch } from '../src/engine/match/pitch/process-pitch';
import { generatePlayer } from '../src/engine/player/generate';
import { EMPTY_BASES } from '../src/engine/match/types';
import type {
  MatchState, MatchTeam, MatchPlayer, MatchConfig, PitchResult
} from '../src/engine/match/types';
import type { Player, Position } from '../src/engine/types/player';

function makePitcher(rng: ReturnType<typeof createRNG>): Player {
  let p = generatePlayer(rng, { enrollmentYear: 1, schoolReputation: 70 });
  if (!p.stats.pitching) {
    p = {
      ...p,
      position: 'pitcher',
      stats: {
        ...p.stats,
        pitching: {
          velocity: 142,
          control: 72,
          pitchStamina: 75,
          pitches: { slider: 5, fork: 4 },
        },
      },
    };
  }
  return p;
}

function makeBatterPlayer(rng: ReturnType<typeof createRNG>): Player {
  const p = generatePlayer(rng, { enrollmentYear: 1, schoolReputation: 60 });
  return {
    ...p,
    stats: {
      ...p.stats,
      batting: { contact: 72, power: 65, eye: 68, technique: 65 },
    },
  };
}

function makeMatchPlayer(player: Player): MatchPlayer {
  return { player, pitchCountInGame: 0, stamina: 100, confidence: 50, isWarmedUp: false };
}

function makeTeam(id: string, pitcherPlayer: Player, batterPlayers: Player[]): MatchTeam {
  const allPlayers = [pitcherPlayer, ...batterPlayers];
  const positions: Position[] = ['pitcher', 'catcher', 'first', 'second', 'third', 'shortstop', 'left', 'center', 'right'];
  const matchPlayers: MatchPlayer[] = allPlayers.map((p) => makeMatchPlayer(p));
  const fieldPositions = new Map<string, Position>();
  allPlayers.forEach((p, i) => fieldPositions.set(p.id, positions[i] ?? 'left'));

  return {
    id,
    name: id === 'home' ? '甲子園高校' : '春日商業',
    players: matchPlayers,
    battingOrder: batterPlayers.slice(0, 9).map((p) => p.id),
    fieldPositions,
    currentPitcherId: pitcherPlayer.id,
    benchPlayerIds: [],
    usedPlayerIds: new Set(),
  };
}

function buildTestState(seed: string): MatchState {
  const rng = createRNG(seed);
  const homePitcher = makePitcher(rng.derive('hp'));
  const homeBatters = Array.from({ length: 9 }, (_, i) => makeBatterPlayer(rng.derive(`hb${i}`)));
  const awayPitcher = makePitcher(rng.derive('ap'));
  const awayBatters = Array.from({ length: 9 }, (_, i) => makeBatterPlayer(rng.derive(`ab${i}`)));

  const homeTeam = makeTeam('home', homePitcher, homeBatters);
  const awayTeam = makeTeam('away', awayPitcher, awayBatters);

  const config: MatchConfig = { innings: 9, maxExtras: 3, useDH: false, isTournament: true, isKoshien: false };

  return {
    config, homeTeam, awayTeam,
    currentInning: 1, currentHalf: 'top', outs: 0,
    count: { balls: 0, strikes: 0 }, bases: EMPTY_BASES,
    score: { home: 0, away: 0 }, inningScores: { home: [0], away: [0] },
    currentBatterIndex: 0, pitchCount: 0, log: [], isOver: false, result: null,
  };
}

function formatPitchResult(pr: PitchResult, label: string): void {
  const pitchType = pr.pitchSelection.type;
  const velocity = pr.pitchSelection.velocity.toFixed(1);
  const breakLevel = pr.pitchSelection.type !== 'fastball'
    ? ` (キレ: ${(pr.pitchSelection as any).breakLevel})`
    : '';
  const target = `row=${pr.targetLocation.row} col=${pr.targetLocation.col}`;
  const actual = `row=${pr.actualLocation.row} col=${pr.actualLocation.col}`;

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`▶ サンプル ${label}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`球種   : ${pitchType}${breakLevel}`);
  console.log(`球速   : ${velocity} km/h`);
  console.log(`狙い   : ${target}`);
  console.log(`着弾   : ${actual}`);
  console.log(`打者   : ${pr.batterAction}`);
  console.log(`結果   : ${pr.outcome}`);

  if (pr.batContact) {
    const bc = pr.batContact;
    console.log(`打球種 : ${bc.contactType}`);
    console.log(`方向   : ${bc.direction.toFixed(1)}° (0=左, 45=中, 90=右)`);
    console.log(`速度   : ${bc.speed}`);
    console.log(`飛距離 : ${bc.distance.toFixed(1)}m`);
    console.log(`守備   : fielder=${bc.fieldResult.fielder}, type=${bc.fieldResult.type}, error=${bc.fieldResult.isError}`);
  }
}

const BASE_SEED = 'koshien-sample-2026';
const state = buildTestState(BASE_SEED);
const targets: Array<{ outcome: string; label: string }> = [
  { outcome: 'called_strike', label: '1: 見逃しストライク (called_strike)' },
  { outcome: 'swinging_strike', label: '2: 空振りストライク (swinging_strike)' },
  { outcome: 'in_play', label: '3: インプレー (in_play)' },
];

const results: Record<string, PitchResult> = {};
for (const { outcome } of targets) {
  for (let i = 0; i < 2000; i++) {
    const rng = createRNG(`${BASE_SEED}-${outcome}-${i}`);
    const { pitchResult } = processPitch(state, { type: 'none' }, rng);
    if (pitchResult.outcome === outcome) {
      results[outcome] = pitchResult;
      break;
    }
  }
}

console.log('=== processPitch サンプル出力 ===');
console.log('シード: ' + BASE_SEED);

for (const { outcome, label } of targets) {
  if (results[outcome]) {
    formatPitchResult(results[outcome], label);
  } else {
    console.log(`\n[${outcome}] — 2000試行で見つかりませんでした`);
  }
}
console.log('\n');
