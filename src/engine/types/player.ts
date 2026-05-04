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
  | 'responsible' | 'caring' | 'gritty' | 'honest' | 'ambitious'
  // Phase 7-D: 心理特性10種追加 (2026-04-20)
  /** 熱血: ピンチでも積極的 */
  | 'hotblooded'
  /** 冷静: 状況分析的、打率ブレが小さい */
  | 'stoic'
  /** 慎重: 消極指示で集中力+、積極指示でプレッシャー */
  | 'cautious'
  /** 頑固: 監督指示を無視する確率30% */
  | 'stubborn'
  /** 勝負師: 2ストライクからのバッティング+10% */
  | 'clutch_hitter'
  /** 混乱しやすい: 詳細指示でミート-10% */
  | 'scatterbrained'
  /** 大舞台: 甲子園・決勝で+10% */
  | 'big_game_player'
  /** 地味: 目立たないが安定 (ブレが小さい) */
  | 'steady'
  /** ビビリ: 大観衆・甲子園で-10% */
  | 'timid'
  /** ace: 甲子園・大一番で球速+3, 制球+5% */
  | 'ace';

// ============================================================
// Phase S2: キャッチャー性格システム
// ============================================================

/**
 * キャッチャーの性格タイプ
 * - aggressive: 積極派 — 攻める配球、決め球を積極的に投げる
 * - cautious: 慎重派 — カウントを整えてから勝負球
 * - analytical: 分析派 — 打者の傾向を分析して弱点を突く
 */
export type CatcherPersonality = 'aggressive' | 'cautious' | 'analytical';

/**
 * キャッチャーのバッテリー特性（捕手ポジションの選手のみ使用）
 */
export interface CatcherProfile {
  /** 性格タイプ */
  personality: CatcherPersonality;
  /**
   * リーダーシップ: 投手を引っ張る力 0-100
   * 高いとピッチャーへのメンタル補正効果が大きくなる
   */
  leadershipScore: number;
  /**
   * 配球精度: 弱点を突く正確さ 0-100
   * 低いとPitchingBiasにランダム誤差が生じる
   */
  callingAccuracy: number;
}

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
  /** イベント履歴（最大50件）(Phase 11.5-E) */
  eventHistory?: import('./player-history').PlayerEvent[];
  /** 直近練習履歴（最大14日分）(Phase 11.5-E) */
  practiceHistory?: import('./player-history').PracticeHistoryEntry[];
  /**
   * Phase S2: キャッチャーのバッテリー特性
   * 捕手ポジションの選手のみ有効。undefined の場合はデフォルト値を使用。
   * デフォルト: { personality: 'cautious', leadershipScore: 50, callingAccuracy: 50 }
   */
  catcherProfile?: CatcherProfile;
}
