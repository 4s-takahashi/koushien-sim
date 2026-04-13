/**
 * PersonBlueprint — 人物の静的設計図（DB上に不変で保持される）
 *
 * ゲームエンジンはこの型を読み取り専用で扱う。
 * 変更は Claw のみ、かつ限定されたフィールドのみ可能（DESIGN-PHASE3-DB §12 参照）。
 */

import type {
  Position, Hand, BattingSide, TraitId,
  PlayerStats, GrowthType, PitchType,
} from '../types/player';
import type { PracticeMenuId } from '../types/calendar';

// ============================================================
// 成長カーブ
// ============================================================

/**
 * 1つの能力値に対する成長カーブ定義。
 *
 * dailyGain = baseRate
 *   × peakMultiplier(currentAge, peakAge, peakWidth)
 *   × varianceSample(variance, rng)
 *   × ceilingPenalty(current, ceiling)
 *   × externalModifiers(mood, fatigue, practice, ...)
 */
export interface StatGrowthCurve {
  /** 基本成長率 (0.01–1.0)。1日あたりの基本成長量。 */
  baseRate: number;

  /**
   * 成長ピーク年齢（ゲーム内の年齢: 中1=13, 高3=18）。
   * この年齢で peakMultiplier が最大になる。
   */
  peakAge: number;

  /**
   * ピーク幅（年数）。小さいほどピークが鋭い。
   * 早熟・晩成は ~1.5、天才は ~3.0。
   */
  peakWidth: number;

  /**
   * 日次揺らぎ (0.0–1.0)。
   * 0.0 = 毎日同じ成長量, 1.0 = 日によって大きくばらつく。
   */
  variance: number;

  /**
   * スランプ時の成長率低下 (0.0–1.0)。
   * スランプ中はこの値だけ成長率が低下する。
   */
  slumpPenalty: number;

  /**
   * 練習タイプ適性。省略時はデフォルト（1.0倍）。
   */
  practiceAffinity?: Partial<Record<PracticeMenuId, number>>;
}

/**
 * 全能力値の成長カーブセット。
 */
export interface GrowthCurveSet {
  // 基礎能力
  stamina: StatGrowthCurve;
  speed: StatGrowthCurve;
  armStrength: StatGrowthCurve;
  fielding: StatGrowthCurve;
  focus: StatGrowthCurve;
  mental: StatGrowthCurve;

  // 打撃
  contact: StatGrowthCurve;
  power: StatGrowthCurve;
  eye: StatGrowthCurve;
  technique: StatGrowthCurve;

  // 投球（野手は null）
  velocity: StatGrowthCurve | null;
  control: StatGrowthCurve | null;
  pitchStamina: StatGrowthCurve | null;
}

/**
 * 1人の選手の全成長パラメータ。
 */
export interface GrowthProfile {
  growthType: GrowthType;
  curves: GrowthCurveSet;
  /** スランプリスク (0.0–1.0) */
  slumpRisk: number;
  /** スランプからの回復力 (0.0–1.0) */
  slumpRecovery: number;
  /** 覚醒確率 (0.0–1.0) */
  awakeningChance: number;
  /** 怪我耐性 (0.0–1.0) */
  durability: number;
  /** 試合経験でメンタルがどれだけ伸びるか */
  mentalGrowthFactor: number;
}

// ============================================================
// PersonBlueprint 本体
// ============================================================

export interface PersonBlueprint {
  /** 一意ID。中学→高校→卒業後まで不変。 */
  id: string;
  /** 世代ID（Claw の生成バッチ単位）。 */
  generationId: string;

  // --- 基本情報 ---
  firstName: string;
  lastName: string;
  /** ゲーム内誕生年 */
  birthYear: number;
  prefecture: string;
  hometown: string;
  middleSchool: string;

  // --- 身体 ---
  height: number;
  weight: number;
  throwingHand: Hand;
  battingSide: BattingSide;

  // --- ポジション ---
  primaryPosition: Position;
  subPositions: Position[];

  // --- 特性 ---
  traits: TraitId[];
  personality: 'introvert' | 'extrovert' | 'balanced';

  // --- 能力値（静的） ---
  /** 中学1年入学時の能力値 */
  initialStats: PlayerStats;
  /** 生涯最大到達可能値 */
  ceilingStats: PlayerStats;

  // --- 成長プロファイル ---
  growthProfile: GrowthProfile;

  // --- メタ ---
  qualityTier: 'S' | 'A' | 'B' | 'C' | 'D';
  isPitcher: boolean;
  /** 希少度 0.0–1.0（高いほど稀） */
  rarity: number;

  // --- Claw 補正 ---
  manuallyEdited: boolean;
  editNotes: string | null;
}

// ============================================================
// 学校マスタ
// ============================================================

export interface CoachStyle {
  offenseType: 'power' | 'speed' | 'balanced' | 'bunt_heavy';
  defenseType: 'ace_centric' | 'relay' | 'balanced';
  practiceEmphasis: 'batting' | 'pitching' | 'defense' | 'balanced';
  aggressiveness: number; // 0–100
}

export interface SchoolBlueprint {
  id: string;
  name: string;
  prefecture: string;
  baseReputation: number; // 0–100
  facilities: import('../types/team').FacilityLevel;
  coachStyle: CoachStyle;
  historyNotes: string | null;
}
