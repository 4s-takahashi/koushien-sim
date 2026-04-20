/**
 * ViewState types — UI 用の読み取り専用データ型
 *
 * WorldState から projector 関数によって生成される。
 * UI は WorldState を直接参照せず、必ずこれらの型を通じてデータを参照する。
 *
 * すべての ViewState は純粋関数: (worldState: WorldState) => XxxViewState
 */

import type { Position, Mood, PitchType } from '../../engine/types/player';
import type { RunnerMode, PauseReason } from '../../engine/match/runner-types';

// ============================================================
// 共通型
// ============================================================

/** ゲーム内日付の表示用 */
export interface DateView {
  year: number;
  month: number;
  day: number;
  /** 表示文字列 例: "Year 1 - 4月1日" */
  displayString: string;
  /** 和暦風表示 例: "1年目 4月1日（月）" */
  japaneseDisplay: string;
}

/** ポジション日本語名 */
export type PositionLabel = '投手' | '捕手' | '一塁手' | '二塁手' | '三塁手' | '遊撃手' | '左翼手' | '中堅手' | '右翼手';

/** コンディション表示 */
export interface ConditionView {
  fatigue: number;         // 0-100
  injuryDescription: string | null;
  mood: Mood;
  moodLabel: string;
}

/** 能力評価ランク */
export type AbilityRank = 'S' | 'A' | 'B' | 'C' | 'D' | 'E';

// ============================================================
// ホーム画面 ViewState
// ============================================================

export interface HomeNewsItem {
  type: string;
  headline: string;
  importance: 'high' | 'medium' | 'low';
  involvedSchoolNames: string[];
  /** カテゴリアイコン（例: 🔥 番狂わせ, ⭐ 注目中学生, 📋 ドラフト, 🏆 OB活躍） */
  icon: string;
  /** ニュース日付（月日表示） */
  dateLabel?: string;
}

export interface HomeTeamSummary {
  schoolName: string;
  playerCount: number;
  acePlayerName: string | null;
  aceOverall: number;
  anchorPlayerName: string | null; // 4番打者
  anchorOverall: number;
  teamOverall: number;             // チーム総合力 0-100
}

/** 注目選手（調子 or 成長上位） */
export interface HomeFeaturedPlayer {
  id: string;
  name: string;
  overall: number;
  overallRank: AbilityRank;
  /** 注目理由 */
  reason: string;
}

/** 今日やること */
export interface HomeTodayTask {
  type: 'practice' | 'match' | 'off' | 'scout';
  label: string;
  detail: string;
  /** 試合日の場合: 対戦相手 */
  opponent?: string;
  /** 試合日の場合: 対戦相手評判 */
  opponentReputation?: number;
}

export interface HomeScheduleItem {
  description: string;
  monthDay: string;       // "4月1日" 形式
  /** 最寄りの試合情報があれば */
  opponent?: string;
  opponentReputation?: number;
}

/** 大会開催中の情報 */
export interface HomeTournamentInfo {
  isActive: boolean;
  typeName: string;        // '夏の大会' | '秋の大会'
  currentRound: string;    // '1回戦' | '2回戦' 等
  isMatchDay: boolean;     // 今日試合があるか
  nextMatchDate?: string;  // 次の試合日の表示文字列（例: '7月13日'）
  nextMatchDaysAway?: number; // 次の試合まで何日
  nextOpponent?: string;   // 次の対戦相手名（未確定の場合は undefined）
  playerEliminated: boolean; // 自校が敗退済みか
  playerMatchResult?: {    // 今日の試合結果（試合があった場合）
    won: boolean;
    opponentName: string;
    score: string;         // '5-3' 等
  };
}

/** 大会開始前の情報 */
export interface HomeTournamentStartInfo {
  name: string;     // '夏の大会'
  date: string;     // '7月10日'
  daysAway: number; // あと何日
}

export interface HomeViewState {
  date: DateView;
  team: HomeTeamSummary;
  seasonPhase: string;
  seasonPhaseLabel: string;
  recentNews: HomeNewsItem[];
  upcomingSchedule: HomeScheduleItem[];
  scoutBudgetRemaining: number;
  scoutBudgetTotal: number;
  /** 今日やること */
  todayTask: HomeTodayTask;
  /** 注目選手（上位3人） */
  featuredPlayers: HomeFeaturedPlayer[];
  /** チーム状況サマリー (Issue #3 2026-04-19) */
  teamPulse?: HomeTeamPulse;
  /** 最近のOB (Phase 11-A4 2026-04-19) */
  recentGraduates?: HomeRecentGraduate[];
  /** 試合日フラグ */
  isTournamentDay: boolean;
  /** 大会期間中フラグ */
  isInTournamentSeason: boolean;
  /** 大会開催中の詳細情報（大会期間中のみ設定） */
  tournament?: HomeTournamentInfo;
  /** 大会開始前の情報（大会期間前のみ設定） */
  tournamentStart?: HomeTournamentStartInfo;
}

/** チーム状況サマリー (Issue #3) */
export interface HomeTeamPulse {
  injured: HomePulsePlayerRef[];    // 負傷中
  warning: HomePulsePlayerRef[];    // 疲労 >= 50
  hot: HomePulsePlayerRef[];        // 調子が良い (mood: fired_up / in_the_zone)
  restingCount: number;             // 一時休養中の人数
}

export interface HomePulsePlayerRef {
  id: string;
  name: string;
  note: string;  // "疲労80" や "右肘 残3日" 等
}

/** 最近のOB (Phase 11-A4) */
export interface HomeRecentGraduate {
  name: string;
  graduationYear: number;
  careerPath: string;  // 'pro' | 'university' | 'corporate' | 'retire'
  careerPathLabel: string;  // 'プロ入り' | '大学進学' | '社会人' | '引退'
  bestAchievement: string | null;
  finalOverall: number;
}

// ============================================================
// チーム画面 ViewState
// ============================================================

export interface PlayerRowView {
  id: string;
  uniformNumber: number;       // 背番号（roster の順番+1）
  lastName: string;
  firstName: string;
  grade: 1 | 2 | 3;
  gradeLabel: string;          // "3年" など
  position: Position;
  positionLabel: PositionLabel;
  overall: number;             // 0-100
  overallRank: AbilityRank;
  conditionBrief: string;      // "良好" | "注意" | "要休養" | "負傷中"
  /** 一時休養フラグが立っているかどうか (Issue #5 2026-04-19) */
  isResting: boolean;
  isInLineup: boolean;
  battingOrderNumber: number | null;  // null = ベンチ
  /** 個別練習メニュー (Phase 11-A1 Issue #4 2026-04-19) */
  individualMenu?: string | null;  // PracticeMenuId。null = チーム共通
  /** モチベーション 0-100 (Phase 11-A3 2026-04-19) */
  motivation: number;
}

export interface LineupView {
  starters: {
    battingOrder: number;
    playerId: string;
    playerName: string;
    position: Position;
    positionLabel: PositionLabel;
    overall: number;
  }[];
  pitcherName: string | null;
  pitcherOverall: number;
}

/** 監督情報 ViewState (Phase 11-A2 2026-04-19) */
export interface ManagerView {
  name: string;
  yearsActive: number;
  totalWins: number;
  totalLosses: number;
  koshienAppearances: number;
}

export interface TeamViewState {
  schoolName: string;
  prefecture: string;
  reputation: number;
  reputationLabel: string;     // "名門" | "強豪" | "中堅" | "新興" | "弱小"
  totalStrength: number;       // チーム総合力 0-100
  pitchingStrength: number;    // 投手力 0-100
  battingStrength: number;     // 打撃力 0-100
  defenseStrength: number;     // 守備力 0-100
  players: PlayerRowView[];
  lineup: LineupView | null;
  grade3Count: number;
  grade2Count: number;
  grade1Count: number;
  /** 監督情報 (Phase 11-A2) */
  manager: ManagerView;
}

// ============================================================
// 選手詳細 ViewState
// ============================================================

export interface StatRowView {
  label: string;
  value: number;
  max: number;
  rank: AbilityRank;
  barPercent: number;   // 0-100 (表示用)
}

export interface PlayerDetailViewState {
  id: string;
  lastName: string;
  firstName: string;
  fullName: string;
  grade: 1 | 2 | 3;
  gradeLabel: string;
  position: Position;
  positionLabel: PositionLabel;
  subPositions: Position[];
  height: number;
  weight: number;
  battingSide: string;     // "右打ち" | "左打ち" | "両打ち"
  throwingHand: string;    // "右投げ" | "左投げ"
  traits: string[];        // 特性名一覧
  overall: number;
  overallRank: AbilityRank;

  // 能力値テーブル
  baseStats: StatRowView[];
  battingStats: StatRowView[];
  pitchingStats: StatRowView[] | null;

  // コンディション
  condition: ConditionView;

  // 通算成績（打者）
  battingRecord: {
    gamesPlayed: number;
    atBats: number;
    hits: number;
    homeRuns: number;
    rbis: number;
    stolenBases: number;
    battingAverage: string; // ".XXX" 形式
  };

  // 通算成績（投手、投手以外は null）
  pitchingRecord: {
    gamesStarted: number;
    inningsPitched: number;
    wins: number;
    losses: number;
    strikeouts: number;
    era: string;  // "X.XX" 形式
  } | null;

  /** シーズン別成績 (Issue #6 2026-04-19)。未プレイのシーズンは null */
  seasonRecords?: {
    grade1: SeasonRecordView | null;
    grade2: SeasonRecordView | null;
    grade3: SeasonRecordView | null;
  };

  /** モチベーション 0-100 (Phase 11-A3 2026-04-19) */
  motivation: number;
  /** モチベーションラベル (Phase 11-A3) */
  motivationLabel: string;
}

/** シーズン別成績表示用 (Issue #6) */
export interface SeasonRecordView {
  gamesPlayed: number;
  atBats: number;
  hits: number;
  homeRuns: number;
  rbis: number;
  battingAverage: string;  // ".XXX"
  inningsPitched: number;
  wins: number;
  losses: number;
  strikeouts: number;
  era: string;  // "X.XX"
}

// ============================================================
// スカウト画面 ViewState
// ============================================================

export interface WatchListPlayerView {
  id: string;
  lastName: string;
  firstName: string;
  grade: 1 | 2 | 3;
  gradeLabel: string;
  prefecture: string;
  middleSchoolName: string;
  estimatedOverall: number;      // スカウトレポートがあれば観測値、なければ推定値
  qualityTier: 'S' | 'A' | 'B' | 'C' | 'D';
  hasScoutReport: boolean;
  isRecruited: boolean;          // targetSchoolId === playerSchoolId
  recruitStatus: string;         // "入学確定" | "交渉中" | "未接触"
  /** 状態バッジ種別 */
  statusBadge: 'unvisited' | 'visited' | 'recruited' | 'competing' | 'confirmed';
  /** スカウトコメント（視察済みの場合のみ） */
  scoutCommentBrief: string | null;
}

export interface ScoutReportView {
  playerId: string;
  playerName: string;
  confidence: number;
  confidenceLabel: string;  // "確度高" | "確度中" | "確度低"
  scoutComment: string;
  estimatedQuality: 'S' | 'A' | 'B' | 'C' | 'D';
  observedStats: {
    stamina: number;
    speed: number;
    armStrength: number;
    fielding: number;
    contact: number;
    power: number;
  };
}

export interface ProspectSearchResultView {
  id: string;
  lastName: string;
  firstName: string;
  grade: 1 | 2 | 3;
  gradeLabel: string;
  prefecture: string;
  middleSchoolName: string;
  estimatedOverall: number;
  qualityTier: 'S' | 'A' | 'B' | 'C' | 'D';
  isOnWatchList: boolean;
  targetSchoolName: string | null;  // 入学意向校（null = 未決定）
}

export interface ScoutViewState {
  watchList: WatchListPlayerView[];
  scoutReports: ScoutReportView[];
  budgetRemaining: number;
  budgetTotal: number;
  budgetUsed: number;
  searchResults: ProspectSearchResultView[];
  // 検索フィルタの現在値は UI 側で管理
}

// ============================================================
// 大会画面 ViewState
// ============================================================

export interface TournamentMatchView {
  matchId: string;
  round: number;
  matchIndex: number;
  homeSchoolName: string | null;
  awaySchoolName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  winnerId: string | null;
  winnerName: string | null;
  isPlayerSchoolHome: boolean;
  isPlayerSchoolAway: boolean;
  isPlayerSchoolMatch: boolean;
  isBye: boolean;
  isUpset: boolean;
  isCompleted: boolean;
}

export interface TournamentRoundView {
  roundNumber: number;
  roundName: string;
  matches: TournamentMatchView[];
}

export interface TournamentBracketView {
  id: string;
  typeName: string;    // "夏の大会" | "秋の大会" | "甲子園"
  year: number;
  totalTeams: number;
  rounds: TournamentRoundView[];
  isCompleted: boolean;
  championName: string | null;
  playerSchoolBestRound: number;
  isPlayerSchoolWinner: boolean;
}

export interface TournamentViewState {
  seasonPhase: string;
  seasonPhaseLabel: string;
  currentYear: number;
  yearResults: {
    summerBestRound: number;
    autumnBestRound: number;
    koshienAppearance: boolean;
    koshienBestRound: number;
  };
  /** 現在進行中または直近の大会ブラケット（null = 大会期間外） */
  activeBracket: TournamentBracketView | null;
  /** 過去大会履歴（最大5件） */
  historyBrackets: TournamentBracketView[];
  // 旧フォールバック
  placeholder: string;
}

// ============================================================
// 試合結果 ViewState
// ============================================================

export interface ScoreboardView {
  date: DateView;
  homeSchool: string;
  awaySchool: string;
  homeScore: number;
  awayScore: number;
  innings: number;
  isPlayerSchool: boolean;
  result: '勝利' | '敗北' | '引き分け' | null;
  /** イニング別得点 [home_1, home_2, ...] */
  inningScores?: InningScoreView;
  /** ハイライトプレイ */
  highlights?: MatchHighlightView[];
  /** 先発投手成績 */
  pitcherSummary?: PitcherSummaryView | null;
  /** 打席結果フロー（最大 20 件） */
  atBatFlow?: AtBatFlowItem[];
}

/** イニング別得点 */
export interface InningScoreView {
  homeInnings: (number | null)[];  // null = 表裏なし（後攻は9回裏不要など）
  awayInnings: (number | null)[];
  totalInnings: number;
}

/** ハイライトプレイ */
export interface MatchHighlightView {
  inning: number;
  half: 'top' | 'bottom';
  label: string;   // 「3回表 田中 ホームラン」など
  kind: 'homerun' | 'strikeout' | 'double' | 'triple' | 'defense' | 'double_play' | 'other';
  icon: string;
}

/** 先発投手成績サマリー */
export interface PitcherSummaryView {
  name: string;
  pitchCount: number;
  strikeouts: number;
  earnedRuns: number;
  inningsPitched: number;
}

/** 打席結果フロー */
export interface AtBatFlowItem {
  inning: number;
  half: 'top' | 'bottom';
  batterName: string;
  result: string;    // 「二塁打」「三振」「四球」など
  rbiCount: number;
  scoreAfter: string;  // 「1-0」形式
}

export interface ResultsViewState {
  recentResults: ScoreboardView[];
  seasonRecord: {
    wins: number;
    losses: number;
    draws: number;
  };
}

// ============================================================
// OB 画面 ViewState
// ============================================================

export interface OBPlayerView {
  personId: string;
  name: string;
  schoolName: string;
  graduationYear: number;
  graduationYearLabel: string;  // "Year 1 卒" など
  careerPathLabel: string;      // "プロ（読売巨人軍）1位" など
  careerPathType: 'pro' | 'university' | 'corporate' | 'retire';
  finalOverall: number;
  overallRank: AbilityRank;
  achievements: string[];
  isFromPlayerSchool: boolean;
}

export interface OBViewState {
  graduates: OBPlayerView[];
  totalGraduates: number;
  proCount: number;
  universityCount: number;
  corporateCount: number;
  retiredCount: number;
  playerSchoolGraduates: OBPlayerView[];
}

// ============================================================
// 試合画面 ViewState（Phase 10-A）
// ============================================================

/**
 * 投球コース（9ゾーン）— Phase 7-A-2 追加
 * 水平 inside/middle/outside × 垂直 high/middle/low
 */
export type PitchLocationLabel =
  | 'inside_high'   | 'inside_middle'   | 'inside_low'
  | 'middle_high'   | 'middle_middle'   | 'middle_low'
  | 'outside_high'  | 'outside_middle'  | 'outside_low';

/**
 * 球種ラベル（EnrichedPitchType）— Phase 7-A-2 追加
 * runner.ts 内部の文字列から変換した統一値
 */
export type EnrichedPitchType =
  | 'fastball' | 'curveball' | 'slider' | 'changeup' | 'splitter';

/** 投球ログの1エントリ */
export interface PitchLogEntry {
  inning: number;
  half: 'top' | 'bottom';
  pitchType: string;
  outcome: string;
  location: { row: number; col: number };
  batterId: string;
  batterName: string;
  /** 球速 km/h — Phase 7-A-2 追加（optional: 旧セーブデータ互換） */
  pitchSpeed?: number;
  /** 投球コース — Phase 7-A-2 追加（optional: 旧セーブデータ互換） */
  pitchLocation?: PitchLocationLabel;
  /** 球種ラベル — Phase 7-A-2 追加（optional: 旧セーブデータ互換） */
  pitchTypeLabel?: EnrichedPitchType;
  /** 心理モノローグ — Phase 7-B 追加（optional: 旧セーブデータ互換） */
  monologues?: MonologueEntry[];
}

/** モノローグエントリ (Phase 7-B) */
export interface MonologueEntry {
  role: 'batter' | 'pitcher' | 'catcher' | 'runner' | 'fielder';
  text: string;
  effectSummary?: string;
}

/** ランナー情報（UI用） */
export interface RunnerBaseView {
  runnerName: string;
  speedClass: 'fast' | 'normal' | 'slow';
}

/** 投手情報（UI用） */
export interface PitcherView {
  id: string;
  name: string;
  pitchCount: number;
  staminaPct: number;
  staminaClass: 'fresh' | 'normal' | 'tired' | 'exhausted';
  moodLabel: string;
  availablePitches: { type: string; level: number }[];
}

/** 打者情報（UI用） */
export interface BatterView {
  id: string;
  name: string;
  battingAvg: string;   // 今日の成績 "2-3" 形式
  overall: number;
  moodLabel: string;
  trait: string | null; // 最初の特性名
}

/** リリーフ候補（UI用） */
export interface RelieverView {
  id: string;
  name: string;
  staminaPct: number;
}

/** 代打候補（UI用） */
export interface PinchHitterView {
  id: string;
  name: string;
  overall: number;
}

/**
 * 試合画面の ViewState
 * projectMatch(state, playerSchoolId) → MatchViewState
 */
export interface MatchViewState {
  // スコアボード
  inningLabel: string;         // "7回裏"
  outsLabel: string;           // "2アウト"
  count: { balls: number; strikes: number };
  score: { home: number; away: number };
  inningScores: { home: number[]; away: number[] };

  // チーム名
  homeSchoolName: string;
  awaySchoolName: string;

  // ダイヤモンド
  bases: {
    first: RunnerBaseView | null;
    second: RunnerBaseView | null;
    third: RunnerBaseView | null;
  };

  // 現在の対戦
  pitcher: PitcherView;
  batter: BatterView;

  // ベンチ
  availableRelievers: RelieverView[];
  availablePinchHitters: PinchHitterView[];

  // 直近ログ（最大10球）
  recentPitches: PitchLogEntry[];

  // 采配可能性
  canBunt: boolean;
  canSteal: boolean;
  canPinchHit: boolean;
  canChangePitcher: boolean;

  // 一時停止情報
  pauseReason: PauseReason | null;

  // 進行モード
  runnerMode: RunnerMode;

  // プレイヤーが攻撃中か
  isPlayerBatting: boolean;
}

// ============================================================
// 練習試合・紅白戦画面 ViewState（Phase 5-B）
// ============================================================

/** 練習試合の種別（practice-game.ts と同期） */
export type PracticeGameTypeView = 'scrimmage' | 'intra_squad';

/** 予約済み練習試合の表示用 */
export interface PracticeScheduleItemView {
  id: string;
  type: PracticeGameTypeView;
  typeLabel: string;   // '練習試合' | '紅白戦'
  dateLabel: string;   // '5月15日'
  opponentName: string;
  opponentSchoolId: string | null;
}

/** 実施履歴の1件分 */
export interface PracticeHistoryItemView {
  id: string;
  type: PracticeGameTypeView;
  typeLabel: string;
  dateLabel: string;
  opponentName: string;
  result: 'win' | 'loss' | 'draw';
  resultLabel: string;  // '○ 勝利' | '● 敗戦' | '△ 引き分け'
  scoreLabel: string;   // '5 - 3'
  highlights: string[];
  mvpPlayerName: string | null;
}

/** 練習試合の相手候補校 */
export interface OpponentCandidateView {
  schoolId: string;
  schoolName: string;
  prefecture: string;
  reputation: number;
  reputationDiff: number;  // 自校との評判差（正 = 相手が強い）
}

/** 練習試合・紅白戦画面の ViewState */
export interface PracticeViewState {
  /** 練習試合を新規予約できるか（大会期間外なら true） */
  canSchedule: boolean;
  /** 予約不可の理由（canSchedule=false のとき） */
  cannotScheduleReason: string | null;
  /** 予約済み一覧 */
  scheduleItems: PracticeScheduleItemView[];
  /** 実施履歴（新しい順、最大20件） */
  historyItems: PracticeHistoryItemView[];
  /** 相手候補校 */
  opponentCandidates: OpponentCandidateView[];
  /** 現在の予約件数 */
  scheduledCount: number;
  /** 予約上限件数 */
  maxScheduled: number;
  /** 通算勝利数 */
  totalWins: number;
  /** 通算敗戦数 */
  totalLosses: number;
  /** 通算引き分け数 */
  totalDraws: number;
}
