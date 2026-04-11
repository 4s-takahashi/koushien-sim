import type { RNG } from '../core/rng';
import type {
  Player, Position, Grade, GrowthType, TraitId, BattingSide, Hand,
  PlayerStats, BaseStats, BattingStats, PitchingStats, PotentialStats,
  MentalState, ConditionState, Background, CareerRecord
} from '../types/player';
import { generateId } from '../core/id';
import { pickLastName, pickFirstName } from './name-dict';

export interface PlayerGenConfig {
  enrollmentYear: number;
  schoolReputation: number;
  forcePosition?: Position;
  forceGrowthType?: GrowthType;
}

/** PRNG-based clamped normal value */
function clampedGaussian(rng: RNG, mean: number, stddev: number, min: number, max: number): number {
  const raw = rng.gaussian(mean, stddev);
  return Math.round(Math.max(min, Math.min(max, raw)));
}

/** Compute base ability mean based on school reputation */
function getStatMean(reputation: number): number {
  // reputation 0→mean 15, reputation 50→mean 25, reputation 100→mean 45
  return 15 + (reputation / 100) * 30;
}

function getStatStddev(reputation: number): number {
  return 8 + (reputation / 100) * 5;
}

/** Generate BaseStats */
function generateBaseStats(rng: RNG, grade: Grade, reputation: number, growthType: GrowthType): BaseStats {
  const mean = getStatMean(reputation);
  const stddev = getStatStddev(reputation);
  const bonus = growthType === 'genius' ? 20 : 0;

  // Grade multiplier for initial stats
  const gradeBonus = (grade - 1) * 8; // 1年: 0, 2年: 8, 3年: 16

  return {
    stamina: clampedGaussian(rng, mean + gradeBonus + bonus, stddev, 1, 100),
    speed: clampedGaussian(rng, mean + gradeBonus + bonus, stddev, 1, 100),
    armStrength: clampedGaussian(rng, mean + gradeBonus + bonus, stddev, 1, 100),
    fielding: clampedGaussian(rng, mean + gradeBonus + bonus, stddev, 1, 100),
    focus: clampedGaussian(rng, mean + gradeBonus + bonus, stddev, 1, 100),
    mental: clampedGaussian(rng, mean + gradeBonus + bonus, stddev, 1, 100),
  };
}

/** Generate BattingStats */
function generateBattingStats(rng: RNG, grade: Grade, reputation: number, growthType: GrowthType): BattingStats {
  const mean = getStatMean(reputation);
  const stddev = getStatStddev(reputation);
  const bonus = growthType === 'genius' ? 20 : 0;
  const gradeBonus = (grade - 1) * 8;

  return {
    contact: clampedGaussian(rng, mean + gradeBonus + bonus, stddev, 1, 100),
    power: clampedGaussian(rng, mean + gradeBonus + bonus, stddev, 1, 100),
    eye: clampedGaussian(rng, mean + gradeBonus + bonus, stddev, 1, 100),
    technique: clampedGaussian(rng, mean + gradeBonus + bonus, stddev, 1, 100),
  };
}

/** Generate PitchingStats for pitchers */
function generatePitchingStats(rng: RNG, grade: Grade, reputation: number, growthType: GrowthType): PitchingStats {
  const mean = getStatMean(reputation);
  const stddev = getStatStddev(reputation);
  const bonus = growthType === 'genius' ? 20 : 0;
  const gradeBonus = (grade - 1) * 8;

  // velocity: 80-160 range, with mean around 120+grade*5
  const velMean = 115 + gradeBonus * 0.5 + (reputation / 100) * 15 + bonus * 0.3;
  const velocity = clampedGaussian(rng, velMean, 8, 80, 160);

  // Choose 1-3 pitches
  const pitchTypes = ['curve', 'slider', 'fork', 'changeup', 'cutter', 'sinker'] as const;
  const numPitches = rng.intBetween(1, Math.min(3, 1 + Math.floor(grade)));
  const chosenPitches = rng.pickN(pitchTypes, numPitches);
  const pitches: Partial<Record<string, number>> = {};
  for (const p of chosenPitches) {
    pitches[p] = rng.intBetween(1, 4);
  }

  return {
    velocity,
    control: clampedGaussian(rng, mean + gradeBonus + bonus, stddev, 1, 100),
    pitchStamina: clampedGaussian(rng, mean + gradeBonus + bonus, stddev, 1, 100),
    pitches,
  };
}

export function generatePlayerStats(rng: RNG, grade: Grade, growthType: GrowthType, position: Position, reputation: number): PlayerStats {
  const base = generateBaseStats(rng, grade, reputation, growthType);
  const batting = generateBattingStats(rng, grade, reputation, growthType);
  const pitching = position === 'pitcher' ? generatePitchingStats(rng, grade, reputation, growthType) : null;

  return { base, batting, pitching };
}

export function generatePotential(rng: RNG, stats: PlayerStats, growthType: GrowthType): PotentialStats {
  // growthRate by type
  const growthRateRanges: Record<GrowthType, [number, number]> = {
    early: [1.3, 1.8],
    normal: [0.8, 1.2],
    late: [0.5, 0.8],
    genius: [1.0, 1.5],
  };

  const [minRate, maxRate] = growthRateRanges[growthType];
  const growthRate = minRate + rng.next() * (maxRate - minRate);

  // Ceiling: based on growth type
  const ceilingMultipliers: Record<GrowthType, number> = {
    early: 0.8,
    normal: 0.9,
    late: 1.0,
    genius: 1.1,
  };

  const mult = ceilingMultipliers[growthType];

  const ceilingBase: BaseStats = {
    stamina: Math.min(100, Math.round(stats.base.stamina + (100 - stats.base.stamina) * mult * (0.5 + rng.next() * 0.5))),
    speed: Math.min(100, Math.round(stats.base.speed + (100 - stats.base.speed) * mult * (0.5 + rng.next() * 0.5))),
    armStrength: Math.min(100, Math.round(stats.base.armStrength + (100 - stats.base.armStrength) * mult * (0.5 + rng.next() * 0.5))),
    fielding: Math.min(100, Math.round(stats.base.fielding + (100 - stats.base.fielding) * mult * (0.5 + rng.next() * 0.5))),
    focus: Math.min(100, Math.round(stats.base.focus + (100 - stats.base.focus) * mult * (0.5 + rng.next() * 0.5))),
    mental: Math.min(100, Math.round(stats.base.mental + (100 - stats.base.mental) * mult * (0.5 + rng.next() * 0.5))),
  };

  const ceilingBatting: BattingStats = {
    contact: Math.min(100, Math.round(stats.batting.contact + (100 - stats.batting.contact) * mult * (0.5 + rng.next() * 0.5))),
    power: Math.min(100, Math.round(stats.batting.power + (100 - stats.batting.power) * mult * (0.5 + rng.next() * 0.5))),
    eye: Math.min(100, Math.round(stats.batting.eye + (100 - stats.batting.eye) * mult * (0.5 + rng.next() * 0.5))),
    technique: Math.min(100, Math.round(stats.batting.technique + (100 - stats.batting.technique) * mult * (0.5 + rng.next() * 0.5))),
  };

  let ceilingPitching: PitchingStats | null = null;
  if (stats.pitching) {
    ceilingPitching = {
      velocity: Math.min(160, Math.round(stats.pitching.velocity + (160 - stats.pitching.velocity) * mult * (0.5 + rng.next() * 0.5))),
      control: Math.min(100, Math.round(stats.pitching.control + (100 - stats.pitching.control) * mult * (0.5 + rng.next() * 0.5))),
      pitchStamina: Math.min(100, Math.round(stats.pitching.pitchStamina + (100 - stats.pitching.pitchStamina) * mult * (0.5 + rng.next() * 0.5))),
      pitches: { ...stats.pitching.pitches },
    };
  }

  return {
    ceiling: { base: ceilingBase, batting: ceilingBatting, pitching: ceilingPitching },
    growthRate,
    growthType,
  };
}

const TRAIT_CONFLICTS: [TraitId, TraitId][] = [
  ['leader', 'shy'],
  ['passionate', 'calm'],
  ['hard_worker', 'slacker'],
  ['overconfident', 'self_doubt'],
  ['honest', 'rebellious'],
  ['caring', 'lone_wolf'],
];

const ALL_TRAITS: TraitId[] = [
  'passionate', 'calm', 'easygoing', 'sensitive', 'bold',
  'leader', 'morale_booster', 'lone_wolf', 'shy',
  'hard_worker', 'natural_talent', 'strategist', 'competitive', 'fun_lover',
  'short_tempered', 'slacker', 'overconfident', 'self_doubt', 'rebellious',
  'responsible', 'caring', 'gritty', 'honest', 'ambitious',
];

export function generateTraits(rng: RNG): TraitId[] {
  const count = rng.intBetween(2, 4);
  const selected: TraitId[] = [];
  const remaining = [...ALL_TRAITS];

  while (selected.length < count && remaining.length > 0) {
    const idx = Math.floor(rng.next() * remaining.length);
    const candidate = remaining[idx];
    remaining.splice(idx, 1);

    // Check conflicts
    let conflicted = false;
    for (const [a, b] of TRAIT_CONFLICTS) {
      if ((candidate === a && selected.includes(b)) ||
          (candidate === b && selected.includes(a))) {
        conflicted = true;
        break;
      }
    }

    if (!conflicted) {
      selected.push(candidate);
    }
  }

  return selected;
}

const PREFECTURES = [
  '北海道', '青森', '岩手', '宮城', '秋田', '山形', '福島',
  '茨城', '栃木', '群馬', '埼玉', '千葉', '東京', '神奈川',
  '新潟', '富山', '石川', '福井', '山梨', '長野', '静岡',
  '愛知', '岐阜', '三重', '大阪', '兵庫', '京都', '滋賀', '奈良', '和歌山',
  '鳥取', '島根', '岡山', '広島', '山口', '徳島', '香川', '愛媛', '高知',
  '福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児島', '沖縄',
];

const MIDDLE_SCHOOL_SUFFIXES = ['第一中学', '第二中学', '北中学', '南中学', '東中学', '西中学', '中央中学', '緑中学', '桜中学', '若葉中学'];

export function generateBackground(rng: RNG): Background {
  const prefecture = rng.pick(PREFECTURES);
  const school = prefecture + rng.pick(MIDDLE_SCHOOL_SUFFIXES);
  return {
    hometown: prefecture,
    middleSchool: school,
  };
}

export function generatePhysical(rng: RNG, position: Position): { height: number; weight: number } {
  // Pitchers tend to be taller
  const heightMean = position === 'pitcher' ? 179 : 172;
  const height = clampedGaussian(rng, heightMean, 5, 160, 195);
  const weight = clampedGaussian(rng, height - 105, 5, 50, 110);
  return { height, weight };
}

export function assignPosition(rng: RNG, stats: PlayerStats, forcePosition?: Position): { position: Position; subPositions: Position[] } {
  if (forcePosition) {
    return { position: forcePosition, subPositions: [] };
  }

  // Decide pitcher vs fielder based on whether pitching stats were generated
  if (stats.pitching !== null) {
    return { position: 'pitcher', subPositions: [] };
  }

  // Among fielders, assign based on ability
  const fielderPositions: Position[] = ['catcher', 'first', 'second', 'third', 'shortstop', 'left', 'center', 'right'];
  const position = rng.pick(fielderPositions);
  return { position, subPositions: [] };
}

/** Pick growth type based on defined distribution */
function pickGrowthType(rng: RNG, forced?: GrowthType): GrowthType {
  if (forced) return forced;
  const roll = rng.next();
  if (roll < 0.20) return 'early';
  if (roll < 0.75) return 'normal';
  if (roll < 0.95) return 'late';
  return 'genius';
}

/** Pick batting side and throwing hand */
function pickHandedness(rng: RNG): { battingSide: BattingSide; throwingHand: Hand } {
  const throwRoll = rng.next();
  const throwingHand: Hand = throwRoll < 0.1 ? 'left' : 'right';

  const batRoll = rng.next();
  let battingSide: BattingSide;
  if (batRoll < 0.3) battingSide = 'left';
  else if (batRoll < 0.05) battingSide = 'switch';
  else battingSide = 'right';

  return { battingSide, throwingHand };
}

export function generatePlayer(rng: RNG, config: PlayerGenConfig): Player {
  const grade: Grade = 1;  // New players are always 1st year
  const growthType = pickGrowthType(rng, config.forceGrowthType);

  // Determine position first to generate appropriate stats
  // If forcePosition is pitcher, generate pitching stats
  let isPitcher = false;
  if (config.forcePosition === 'pitcher') {
    isPitcher = true;
  } else if (!config.forcePosition) {
    // ~20% chance to be a pitcher
    isPitcher = rng.chance(0.2);
  }

  const tempPosition: Position = isPitcher ? 'pitcher' : (config.forcePosition ?? 'center');
  const stats = generatePlayerStats(rng, grade, growthType, tempPosition, config.schoolReputation);
  const { position, subPositions } = assignPosition(rng, stats, config.forcePosition ?? (isPitcher ? 'pitcher' : undefined));
  const potential = generatePotential(rng, stats, growthType);
  const traits = generateTraits(rng);
  const background = generateBackground(rng);
  const { height, weight } = generatePhysical(rng, position);
  const { battingSide, throwingHand } = pickHandedness(rng);

  const mentalState: MentalState = {
    mood: 'normal',
    stress: rng.intBetween(0, 30),
    confidence: rng.intBetween(40, 70),
    teamChemistry: rng.intBetween(40, 70),
    flags: [],
  };

  const condition: ConditionState = {
    fatigue: rng.intBetween(0, 20),
    injury: null,
    mood: 'normal',
  };

  const careerStats: CareerRecord = {
    gamesPlayed: 0,
    atBats: 0,
    hits: 0,
    homeRuns: 0,
    rbis: 0,
    stolenBases: 0,
    gamesStarted: 0,
    inningsPitched: 0,
    wins: 0,
    losses: 0,
    strikeouts: 0,
    earnedRuns: 0,
  };

  return {
    id: generateId(),
    firstName: pickFirstName(rng),
    lastName: pickLastName(rng),
    enrollmentYear: config.enrollmentYear,
    position,
    subPositions,
    battingSide,
    throwingHand,
    height,
    weight,
    stats,
    potential,
    condition,
    traits,
    mentalState,
    background,
    careerStats,
  };
}
