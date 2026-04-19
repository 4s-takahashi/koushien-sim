import type { GameDate } from './calendar';

export type Position =
  | 'pitcher' | 'catcher' | 'first' | 'second' | 'third'
  | 'shortstop' | 'left' | 'center' | 'right';

export type Hand = 'left' | 'right';
export type BattingSide = 'left' | 'right' | 'switch';
export type Grade = 1 | 2 | 3;
export type GrowthType = 'early' | 'normal' | 'late' | 'genius';

export type PitchType = 'curve' | 'slider' | 'fork' | 'changeup' | 'cutter' | 'sinker';

export type TraitId =
  | 'passionate' | 'calm' | 'easygoing' | 'sensitive' | 'bold'
  | 'leader' | 'morale_booster' | 'lone_wolf' | 'shy'
  | 'hard_worker' | 'natural_talent' | 'strategist' | 'competitive' | 'fun_lover'
  | 'short_tempered' | 'slacker' | 'overconfident' | 'self_doubt' | 'rebellious'
  | 'responsible' | 'caring' | 'gritty' | 'honest' | 'ambitious';

export type MentalFlag =
  | 'slump' | 'in_the_zone' | 'injury_anxiety'
  | 'in_love' | 'family_trouble' | 'team_conflict';

export type Mood = 'excellent' | 'good' | 'normal' | 'poor' | 'terrible';

export interface BaseStats {
  stamina: number;
  speed: number;
  armStrength: number;
  fielding: number;
  focus: number;
  mental: number;
}

export interface BattingStats {
  contact: number;
  power: number;
  eye: number;
  technique: number;
}

export interface PitchingStats {
  velocity: number;
  control: number;
  pitchStamina: number;
  pitches: Partial<Record<PitchType, number>>;
}

export interface PlayerStats {
  base: BaseStats;
  batting: BattingStats;
  pitching: PitchingStats | null;
}

export interface PotentialStats {
  ceiling: PlayerStats;
  growthRate: number;
  growthType: GrowthType;
}

export interface MentalState {
  mood: Mood;
  stress: number;
  confidence: number;
  teamChemistry: number;
  flags: MentalFlag[];
}

export interface InjuryState {
  type: string;
  severity: 'minor' | 'moderate' | 'severe';
  remainingDays: number;
  startDate: GameDate;
}

export interface ConditionState {
  fatigue: number;
  injury: InjuryState | null;
  mood: Mood;
}

export interface Background {
  hometown: string;
  middleSchool: string;
}

export interface CareerRecord {
  gamesPlayed: number;
  atBats: number;
  hits: number;
  homeRuns: number;
  rbis: number;
  stolenBases: number;
  gamesStarted: number;
  inningsPitched: number;
  wins: number;
  losses: number;
  strikeouts: number;
  earnedRuns: number;
  /**
   * シーズン別成績。key は学年 (1/2/3)。
   * 例: bySeason[1] = 1年生時の集計 (2026-04-19 Issue #6)
   */
  bySeason?: Record<1 | 2 | 3, SeasonRecord>;
}

/** 1シーズン分の成績 (Issue #6) */
export interface SeasonRecord {
  gamesPlayed: number;
  atBats: number;
  hits: number;
  homeRuns: number;
  rbis: number;
  stolenBases: number;
  inningsPitched: number;
  wins: number;
  losses: number;
  strikeouts: number;
  earnedRuns: number;
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  enrollmentYear: number;
  position: Position;
  subPositions: Position[];
  battingSide: BattingSide;
  throwingHand: Hand;
  height: number;
  weight: number;
  stats: PlayerStats;
  potential: PotentialStats;
  condition: ConditionState;
  traits: TraitId[];
  mentalState: MentalState;
  background: Background;
  careerStats: CareerRecord;
  /**
   * 一時的な休養オーバーライド。
   * true の場合、次の日次練習ではこの選手だけ強制的に休養扱い (疲労回復) し、
   * 処理後に自動で null に戻される (翌日は元の練習メニューに復帰)。
   * (2026-04-19 Issue #5 一括休養機能)
   */
  restOverride?: {
    /** 残り休養日数。日次処理後に -1 し、0 になったら解除 */
    remainingDays: number;
    /** セット日 (debug用) */
    setOn: GameDate;
  } | null;
  /**
   * モチベーション: 0-100。デフォルト 50。
   * 未定義の場合は 50 相当として扱う（後方互換）。
   * (2026-04-19 Phase 11-A3)
   */
  motivation?: number;
}
