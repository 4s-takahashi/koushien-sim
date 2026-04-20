import type {
  Player,
  Position,
  PitchType,
  Hand,
  BattingSide,
  PlayerStats,
  TraitId,
  Mood,
  MentalFlag,
  CareerRecord,
} from '../types/player';
import type { Lineup, Team } from '../types/team';
import type { RNG } from '../core/rng';

// ============================================================
// ストライクゾーン・コース
// ============================================================

/**
 * 投球コース (5×5 グリッド)
 * ストライクゾーン = 中央3×3 (row 1-3, col 1-3)
 * ボールゾーン = 外周 (row 0 or 4, col 0 or 4)
 */
export interface PitchLocation {
  row: number; // 0-4 (0=高めボール, 1=高め, 2=中段, 3=低め, 4=低めボール)
  col: number; // 0-4 (0=内角ボール, 1=内角, 2=真中, 3=外角, 4=外角ボール)
}

/** 投球がストライクゾーン内か */
export function isInStrikeZone(loc: PitchLocation): boolean {
  return loc.row >= 1 && loc.row <= 3 && loc.col >= 1 && loc.col <= 3;
}

// ============================================================
// 投球結果
// ============================================================

/** 投球の種類 */
export type PitchSelection = {
  type: 'fastball';
  velocity: number;
} | {
  type: PitchType;
  velocity: number;
  breakLevel: number; // キレ 1-7
};

/** 打者のアクション */
export type BatterAction = 'take' | 'swing' | 'bunt' | 'check_swing';

/** 1球の結果 */
export type PitchOutcome =
  | 'called_strike'
  | 'swinging_strike'
  | 'ball'
  | 'foul'
  | 'foul_bunt'
  | 'in_play';

/** 打球の種類 */
export type BatContactType =
  | 'ground_ball'
  | 'line_drive'
  | 'fly_ball'
  | 'popup'
  | 'bunt_ground';

/** 打球の方向（角度。0=左翼ファウルライン、45=センター、90=右翼ファウルライン） */
export type HitDirection = number;

/** 打球の速度分類 */
export type HitSpeed = 'weak' | 'normal' | 'hard' | 'bullet';

/** 守備の結果 */
export type FieldResultType =
  | 'out'
  | 'single'
  | 'double'
  | 'triple'
  | 'home_run'
  | 'error'
  | 'fielders_choice'
  | 'double_play'
  | 'sacrifice'
  | 'sacrifice_fly';

/** 守備の結果 */
export interface FieldResult {
  type: FieldResultType;
  fielder: Position;
  isError: boolean;
}

/** 打球の結果 */
export interface BatContactResult {
  contactType: BatContactType;
  direction: HitDirection;
  speed: HitSpeed;
  distance: number;
  fieldResult: FieldResult;
}

/** 1球の処理結果 */
export interface PitchResult {
  // 投球情報（2D描画用）
  pitchSelection: PitchSelection;
  targetLocation: PitchLocation;
  actualLocation: PitchLocation;

  // 打者情報
  batterAction: BatterAction;

  // 結果
  outcome: PitchOutcome;

  // インプレーの場合のみ
  batContact: BatContactResult | null;
}

// ============================================================
// 打席
// ============================================================

/** 打席のカウント */
export interface Count {
  balls: number; // 0-3
  strikes: number; // 0-2
}

/** 打席の最終結果 */
export type AtBatOutcome =
  | { type: 'strikeout' }
  | { type: 'ground_out'; fielder: Position }
  | { type: 'fly_out'; fielder: Position }
  | { type: 'line_out'; fielder: Position }
  | { type: 'double_play' }
  | { type: 'sacrifice_bunt' }
  | { type: 'sacrifice_fly' }
  | { type: 'single' }
  | { type: 'double' }
  | { type: 'triple' }
  | { type: 'home_run' }
  | { type: 'walk' }
  | { type: 'hit_by_pitch' }
  | { type: 'error'; fielder: Position }
  | { type: 'intentional_walk' };

/** 打席の結果 */
export interface AtBatResult {
  batterId: string;
  pitcherId: string;
  pitches: PitchResult[];
  finalCount: Count;
  outcome: AtBatOutcome;
  rbiCount: number;
  runnersBefore: BaseState;
  runnersAfter: BaseState;
}

// ============================================================
// 走者・ベース状態
// ============================================================

/** 塁上のランナー */
export interface RunnerInfo {
  playerId: string;
  speed: number; // 走力
}

/** 塁上の状態 */
export interface BaseState {
  first: RunnerInfo | null;
  second: RunnerInfo | null;
  third: RunnerInfo | null;
}

/** 空のベース状態 */
export const EMPTY_BASES: BaseState = {
  first: null,
  second: null,
  third: null,
};

// ============================================================
// イニング
// ============================================================

/** ハーフイニング（表 or 裏） */
export type HalfInning = 'top' | 'bottom';

/** イニング結果 */
export interface InningResult {
  inningNumber: number;
  half: HalfInning;
  atBats: AtBatResult[];
  runsScored: number;
  outsRecorded: number;
  endingBaseState: BaseState;
}

// ============================================================
// 試合全体
// ============================================================

/** 試合の設定 */
export interface MatchConfig {
  innings: number; // 通常9
  maxExtras: number; // 最大延長回数 (MVP: 3)
  useDH: boolean; // DH制（MVP: false）
  isTournament: boolean; // トーナメント戦か（引き分けなし）
  isKoshien: boolean; // 甲子園かどうか（成長倍率に影響）
}

/** 試合中の選手データ */
export interface MatchPlayer {
  player: Player;
  pitchCountInGame: number;
  stamina: number; // 試合中スタミナ（投手用、0-100）
  confidence: number; // 試合中の自信
  isWarmedUp: boolean;
}

/** 試合に参加するチーム */
export interface MatchTeam {
  id: string;
  name: string;
  /** 3文字短縮表記（Phase 7-F）。画面狭い場合のフォールバック用 */
  shortName?: string;
  players: MatchPlayer[];
  battingOrder: string[]; // 打順（9人のplayerId）
  fieldPositions: Map<string, Position>;
  currentPitcherId: string;
  benchPlayerIds: string[];
  usedPlayerIds: Set<string>;
}

/** 試合イベント */
export interface MatchEvent {
  inning: number;
  half: HalfInning;
  type: MatchEventType;
  description: string;
  playerId?: string;
  data?: Record<string, unknown>;
}

export type MatchEventType =
  | 'pitch'
  | 'at_bat_result'
  | 'run_scored'
  | 'pitching_change'
  | 'substitution'
  | 'stolen_base'
  | 'caught_stealing'
  | 'wild_pitch'
  | 'balk'
  | 'inning_end'
  | 'game_end';

/** 試合の現在状態 */
export interface MatchState {
  config: MatchConfig;
  homeTeam: MatchTeam;
  awayTeam: MatchTeam;
  currentInning: number;
  currentHalf: HalfInning;
  outs: number;
  count: Count;
  bases: BaseState;
  score: { home: number; away: number };
  inningScores: { home: number[]; away: number[] };
  currentBatterIndex: number;
  pitchCount: number;
  log: MatchEvent[];
  isOver: boolean;
  result: MatchResult | null;
  /** Phase 7-A: 試合進行モード（1球ごと停止 on/off） */
  runnerMode?: { time: 'standard' | 'short'; pitch: 'on' | 'off' };
}

/** 試合結果 */
export interface MatchResult {
  winner: 'home' | 'away' | 'draw';
  finalScore: { home: number; away: number };
  inningScores: { home: number[]; away: number[] };
  totalInnings: number;
  mvpPlayerId: string | null;
  batterStats: MatchBatterStat[];
  pitcherStats: MatchPitcherStat[];
}

/** 打者の試合個人成績 */
export interface MatchBatterStat {
  playerId: string;
  atBats: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  rbis: number;
  walks: number;
  strikeouts: number;
  stolenBases: number;
  errors: number;
}

/** 投手の試合個人成績 */
export interface MatchPitcherStat {
  playerId: string;
  inningsPitched: number;
  pitchCount: number;
  hits: number;
  runs: number;
  earnedRuns: number;
  walks: number;
  strikeouts: number;
  homeRunsAllowed: number;
  isWinner: boolean;
  isLoser: boolean;
  isSave: boolean;
}

// ============================================================
// 采配
// ============================================================

// ============================================================
// Phase 7-C: 細かい采配
// ============================================================

/** 打者への焦点エリア */
export type BatterFocusArea = 'inside' | 'outside' | 'low' | 'high' | 'middle';

/** 打者の狙い球種 */
export type BatterPitchType = 'fastball' | 'breaking' | 'offspeed' | 'any';

/** 打者への詳細采配 */
export interface BatterDetailedOrder {
  type: 'batter_detailed';
  /** 狙うコース */
  focusArea?: BatterFocusArea;
  /** 狙う球種 */
  pitchType?: BatterPitchType;
  /** 積極性: passive=消極 / normal=普通 / aggressive=積極 */
  aggressiveness?: 'passive' | 'normal' | 'aggressive';
}

/** 投手への焦点エリア */
export type PitcherFocusArea = 'inside' | 'outside' | 'low' | 'high' | 'edge';

/** 投手の配球比率 */
export type PitcherPitchMix = 'fastball_heavy' | 'breaking_heavy' | 'balanced';

/** 投手への詳細采配 */
export interface PitcherDetailedOrder {
  type: 'pitcher_detailed';
  /** コース指定 */
  focusArea?: PitcherFocusArea;
  /** 球種比率 */
  pitchMix?: PitcherPitchMix;
  /** 内角攻め */
  intimidation?: 'brush_back' | 'normal';
}

/** 監督の采配指示 */
export type TacticalOrder =
  | { type: 'none' }
  | { type: 'bunt'; playerId: string }
  | { type: 'steal'; runnerId: string }
  | { type: 'hit_and_run'; runnerId: string }
  | { type: 'intentional_walk' }
  | { type: 'pitching_change'; newPitcherId: string }
  | { type: 'pinch_hit'; outPlayerId: string; inPlayerId: string }
  | { type: 'pinch_run'; outPlayerId: string; inPlayerId: string }
  | { type: 'defensive_sub'; outPlayerId: string; inPlayerId: string; position: Position }
  | { type: 'mound_visit' }
  | BatterDetailedOrder
  | PitcherDetailedOrder;

/** 采配を入力するコールバック */
export type TacticsProvider = (state: MatchState) => TacticalOrder;

/** CPU自動采配 */
export type AutoTacticsProvider = (state: MatchState, rng: RNG) => TacticalOrder;

// ============================================================
// 対戦相手
// ============================================================

/** 対戦相手の生成設定 */
export interface OpponentConfig {
  name: string;
  prefecture: string;
  strength: number; // チーム力 1-100
  style: OpponentStyle;
}

export type OpponentStyle =
  | 'balanced'
  | 'power_hitting'
  | 'speed'
  | 'pitching'
  | 'defense';

// ============================================================
// 投手・打者の実効パラメータ（processPitch 内部で使用）
// ============================================================

/** 投手の実効パラメータ（processPitch 内で参照する値） */
export interface PitcherParams {
  /** 球速 80-160 → ストレートの基本速度（疲労・コンディション補正済み） */
  velocity: number;
  /** コントロール 1-100 → 制球誤差に影響（疲労・コンディション補正済み） */
  control: number;
  /** 投球スタミナ 1-100 → 疲労蓄積速度 */
  pitchStamina: number;
  /** 保有球種とキレ */
  pitches: Partial<Record<import('../types/player').PitchType, number>>;
  /** メンタル → プレッシャー下での制球安定度 */
  mental: number;
  /** 集中力 → 長打を打たれた後の立ち直り */
  focus: number;
  /** この試合での投球数 */
  pitchCountInGame: number;
  /** 試合中スタミナ（0-100） */
  stamina: number;
  /** 当日のコンディション */
  mood: Mood;
  /** 試合中の自信 */
  confidence: number;
}

/** 打者の実効パラメータ（processPitch 内で参照する値） */
export interface BatterParams {
  /** ミート → スイング時の接触確率（コンディション補正済み） */
  contact: number;
  /** パワー → 打球速度・飛距離（コンディション補正済み） */
  power: number;
  /** 選球眼 → ボール球の見極め（コンディション補正済み） */
  eye: number;
  /** 打撃技術 → 打球方向のコントロール（コンディション補正済み） */
  technique: number;
  /** 走力 → 内野安打確率、バント成功率 */
  speed: number;
  /** メンタル → プレッシャー耐性 */
  mental: number;
  /** 集中力 → 追い込まれた時の粘り */
  focus: number;
  /** 左打/右打/スイッチ */
  battingSide: import('../types/player').BattingSide;
  /** 試合中の自信 */
  confidence: number;
  /** 当日のコンディション */
  mood: Mood;
}
