# Phase 2: 試合エンジン — 詳細設計書

> バージョン: 0.1.0  
> 作成日: 2026-04-11  
> 前提文書: [SPEC-MVP.md](./SPEC-MVP.md) / [DESIGN-PHASE1.md](./DESIGN-PHASE1.md)  
> 前提コード: Phase 1 実装済み（src/engine/, src/platform/）  
> ステータス: 実装着手可能

---

## 目次

1. [概要](#1-概要)
2. [モジュール一覧](#2-モジュール一覧)
3. [型定義一覧](#3-型定義一覧)
4. [1球処理フロー](#4-1球処理フロー)
5. [投手側パラメータと打者側パラメータ](#5-投手側パラメータと打者側パラメータ)
6. [判定ロジック詳細](#6-判定ロジック詳細)
7. [采配システム](#7-采配システム)
8. [疲労・メンタル・信頼度の影響](#8-疲労メンタル信頼度の影響)
9. [試合結果の反映](#9-試合結果の反映)
10. [MVPで省略するもの](#10-mvpで省略するもの)
11. [テスト観点](#11-テスト観点)
12. [実装順序](#12-実装順序)
13. [ディレクトリ構成](#13-ディレクトリ構成)

---

## 1. 概要

### 1.1 Phase 2 の目的

Phase 2 は **1球単位で進行する試合シミュレーションエンジン** を構築する。  
Phase 1 で作った選手データ・能力値をもとに、投球→打撃→打球→結果を算出する。

Phase 2 完了時に以下が動作する：

- 2チーム9人ずつで9イニングの試合が完走する
- 1球ごとにコース・球種・打者反応・結果が確定する
- 監督が采配（代打・継投・バント等）を差し込める
- 各打席・投球の結果が2D描画に必要な情報を含んで返る
- 試合結果が選手のcareerStatsと成長に反映される

### 1.2 設計方針

| 方針 | 説明 |
|------|------|
| **1球が最小単位** | `processPitch` が全ての基盤。ここから打席→イニング→試合を構成する |
| **UI非依存** | `src/engine/match/` はReact/DOM/Canvasに一切依存しない |
| **描画情報は返り値** | 各関数の返り値に投球コース・打球方向・守備動き等を含め、UIはそれを読んで描画する |
| **純関数** | 全関数はRNGをシード注入。同一入力→同一出力。リプレイ可能 |
| **段階的リアリティ** | MVPは「成立する試合」を優先。守備AI・走塁詳細・投球フォーム等は後工程 |
| **Phase 1 活用** | Player, PlayerStats, RNG, CareerRecord 等はそのまま使う |

### 1.3 Phase 1 からの接続点

| Phase 1 の資産 | Phase 2 での使用 |
|---------------|----------------|
| `Player` 型 | 打者/投手のパラメータソース |
| `PlayerStats` (base, batting, pitching) | 試合中の判定計算の入力 |
| `ConditionState` (fatigue, mood) | 試合中の能力補正 |
| `MentalState` (confidence, flags) | プレッシャー・ゾーン判定 |
| `TraitId` | サイン無視率、大舞台補正 |
| `CareerRecord` | 試合結果の記録先 |
| `RNG` | 全判定の乱数ソース |
| `Team`, `Lineup` | スタメン・打順・控え |
| `GROWTH_CONSTANTS.MATCH_GROWTH_MULTIPLIER` | 試合後の成長補正 |

---

## 2. モジュール一覧

### 2.1 全体マップ

```
src/engine/match/
├── types.ts                # 試合関連の全型定義
├── constants.ts            # 試合バランス定数
│
├── pitch/                  # 1球の処理（責務分割）
│   ├── select-pitch.ts     # 球種・コース選択
│   ├── control-error.ts    # 制球誤差
│   ├── batter-action.ts    # 打者の反応決定
│   ├── swing-result.ts     # スイング結果（空振り/ファウル/インプレー）
│   ├── bat-contact.ts      # 打球生成
│   ├── field-result.ts     # 守備結果
│   ├── process-pitch.ts    # 1球の統合処理（上記を組み合わせる薄いオーケストレーター）
│   └── index.ts            # re-export
│
├── at-bat.ts               # 1打席の処理
├── inning.ts               # 1イニングの処理
├── game.ts                 # 1試合の処理（9イニング+延長+サヨナラ）
│
├── tactics.ts              # 采配ロジック（バント/盗塁/代打等）
├── opponent.ts             # 対戦相手の自動生成
├── result.ts               # 試合結果の集計・成長反映
│
└── index.ts                # 公開API

src/engine/shared/           # エンジン横断の共有ロジック（Phase 2 で新設）
├── stat-utils.ts            # ceilingPenalty, clampStat 等の能力値計算ユーティリティ
├── mood-utils.ts            # getMoodMultiplier, getConfidenceMultiplier
└── index.ts
```

### 2.2 依存関係

```
engine/types/ ───────────────────────────────────────┐
engine/core/rng ─────────────────────────────────────┤
engine/shared/ (stat-utils, mood-utils) ─────────────┤
                                                      │
match/types.ts ← engine/types (Player, Lineup, etc.) │
match/constants.ts ← (pure data)                      │
                                                      │
match/pitch/ ← types, constants, core/rng, shared     │
  ├─ select-pitch.ts  (球種・コース選択)               │
  ├─ control-error.ts (制球誤差)                       │
  ├─ batter-action.ts (打者反応)                       │
  ├─ swing-result.ts  (スイング結果)                   │
  ├─ bat-contact.ts   (打球生成)                       │
  ├─ field-result.ts  (守備結果)                       │
  └─ process-pitch.ts (オーケストレーター)             │
  │                                                   │
match/at-bat.ts ← pitch, types, constants, core/rng   │
  │                                                   │
match/inning.ts ← at-bat, types                       │
  │                                                   │
match/tactics.ts ← types, constants, core/rng         │
  │                                                   │
match/game.ts ← inning, tactics, types, core/rng      │
  │                                                   │
match/opponent.ts ← engine/player/generate, types     │
  │                                                   │
match/result.ts ← types, engine/types, shared         │
```

**依存の原則**:
- `match/` は `engine/growth/` に直接依存しない
- 成長計算で必要な `ceilingPenalty`, `clampStat` 等は `engine/shared/stat-utils.ts` に切り出し、`growth/` と `match/result.ts` が共通参照
- `engine/shared/mood-utils.ts` にコンディション補正ロジックを集約（Phase 1 の `growth/calculate.ts` からも参照可能にリファクタ）
- `engine/shared/` は `engine/types/` と `engine/core/` のみに依存（循環禁止）

---

## 3. 型定義一覧

### `match/types.ts`

```typescript
import type {
  Player, Position, PitchType, Hand, BattingSide,
  PlayerStats, TraitId, Mood, MentalFlag,
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
 *
 *   col: 0     1     2     3     4
 *        (外)  内角  真中  外角  (外)
 * row 0: (高めボール)
 * row 1: 高め
 * row 2: 中段
 * row 3: 低め
 * row 4: (低めボール)
 *
 * 打者目線（右打者基準）: col 1=内角, col 3=外角
 */
export interface PitchLocation {
  row: number;    // 0-4 (0=高めボール, 1=高め, 2=中段, 3=低め, 4=低めボール)
  col: number;    // 0-4 (0=内角ボール, 1=内角, 2=真中, 3=外角, 4=外角ボール)
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
  type: 'fastball';           // ストレート
  velocity: number;           // 実際の球速 (km/h)
} | {
  type: PitchType;            // 変化球
  velocity: number;
  breakLevel: number;         // キレ 1-7
};

/** 打者のアクション */
export type BatterAction =
  | 'take'                    // 見送り
  | 'swing'                   // 通常スイング
  | 'bunt'                    // バント
  | 'check_swing';            // ハーフスイング（振り逃げ判定用）

/** 1球の結果 */
export type PitchOutcome =
  | 'called_strike'           // 見逃しストライク
  | 'swinging_strike'         // 空振りストライク
  | 'ball'                    // ボール
  | 'foul'                    // ファウル
  | 'foul_bunt'               // バントファウル（2ストライクでアウト）
  | 'in_play';                // インプレー（打球発生）

/** 1球の処理結果 */
export interface PitchResult {
  // 投球情報（2D描画用）
  pitchSelection: PitchSelection;
  targetLocation: PitchLocation;     // 投手の狙い
  actualLocation: PitchLocation;     // 実際の着弾（コントロール誤差込み）

  // 打者情報
  batterAction: BatterAction;

  // 結果
  outcome: PitchOutcome;

  // インプレーの場合のみ
  batContact: BatContactResult | null;
}

// ============================================================
// 打球結果
// ============================================================

/** 打球の種類 */
export type BatContactType =
  | 'ground_ball'      // ゴロ
  | 'line_drive'       // ライナー
  | 'fly_ball'         // フライ
  | 'popup'            // ポップフライ（内野フライ）
  | 'bunt_ground';     // バントゴロ

/** 打球の方向（角度。0=レフトファウルライン、45=センター、90=ライトファウルライン） */
export type HitDirection = number;  // 0-90度

/** 打球の速度分類 */
export type HitSpeed = 'weak' | 'normal' | 'hard' | 'bullet';

/** 打球の結果 */
export interface BatContactResult {
  contactType: BatContactType;
  direction: HitDirection;       // 打球方向 0-90度
  speed: HitSpeed;               // 打球速度
  distance: number;              // 打球の飛距離 (メートル)
  fieldResult: FieldResult;      // 守備の結果
}

/** 守備の結果 */
export interface FieldResult {
  type: FieldResultType;
  fielder: Position;             // 処理した野手
  isError: boolean;              // エラーか
}

export type FieldResultType =
  | 'out'                // アウト（ゴロアウト、フライアウト）
  | 'single'             // シングルヒット
  | 'double'             // ツーベースヒット
  | 'triple'             // スリーベースヒット
  | 'home_run'           // ホームラン
  | 'error'              // エラー（出塁）
  | 'fielders_choice'    // フィールダーズチョイス
  | 'double_play'        // 併殺打
  | 'sacrifice'          // 犠打（バント）
  | 'sacrifice_fly';     // 犠飛

// ============================================================
// 打席
// ============================================================

/** 打席のカウント */
export interface Count {
  balls: number;     // 0-3
  strikes: number;   // 0-2
}

/** 打席の結果 */
export interface AtBatResult {
  batterId: string;
  pitcherId: string;
  pitches: PitchResult[];         // 全投球の記録
  finalCount: Count;
  outcome: AtBatOutcome;
  rbiCount: number;               // 打点
  runnersBefore: BaseState;       // 打席開始時の走者状態
  runnersAfter: BaseState;        // 打席終了後の走者状態
}

/** 打席の最終結果 */
export type AtBatOutcome =
  // アウト系
  | { type: 'strikeout' }                         // 三振
  | { type: 'ground_out'; fielder: Position }     // ゴロアウト
  | { type: 'fly_out'; fielder: Position }        // フライアウト
  | { type: 'line_out'; fielder: Position }       // ライナーアウト
  | { type: 'double_play' }                       // 併殺打
  | { type: 'sacrifice_bunt' }                    // 犠打
  | { type: 'sacrifice_fly' }                     // 犠飛
  // 出塁系
  | { type: 'single' }
  | { type: 'double' }
  | { type: 'triple' }
  | { type: 'home_run' }
  | { type: 'walk' }                              // 四球
  | { type: 'hit_by_pitch' }                      // 死球
  | { type: 'error'; fielder: Position }          // エラー出塁
  // 特殊
  | { type: 'intentional_walk' };                 // 敬遠

// ============================================================
// 走者・ベース状態
// ============================================================

/** 塁上の状態 */
export interface BaseState {
  first: RunnerInfo | null;
  second: RunnerInfo | null;
  third: RunnerInfo | null;
}

export interface RunnerInfo {
  playerId: string;
  speed: number;        // 走力（Player.stats.base.speed）
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
  inningNumber: number;          // 1-9 (延長は10以降)
  half: HalfInning;
  atBats: AtBatResult[];         // このイニングの全打席
  runsScored: number;            // このイニングの得点
  outsRecorded: number;          // 記録アウト数（通常3）
  endingBaseState: BaseState;    // イニング終了時の塁上
}

// ============================================================
// 試合全体
// ============================================================

/** 試合の設定 */
export interface MatchConfig {
  innings: number;               // 通常9
  maxExtras: number;             // 最大延長回数 (MVP: 3)
  useDH: boolean;                // DH制（MVP: false）
  isTournament: boolean;         // トーナメント戦か（引き分けなし）
  isKoshien: boolean;            // 甲子園かどうか（成長倍率に影響）
}

/**
 * MVP終了条件（3種のみ）:
 *   1. 9回終了時に点差あり → 勝敗確定
 *   2. 9回裏（or 延長裏）でhomeが逆転/サヨナラ → 即終了
 *   3. 延長上限到達で同点 → 引き分け（isTournament時はさらに延長）
 *
 * MVPで省略: コールドゲーム、ノーゲーム（雨天中止）、没収試合
 */

/** 試合の現在状態（進行中の中間状態） */
export interface MatchState {
  config: MatchConfig;

  homeTeam: MatchTeam;
  awayTeam: MatchTeam;

  currentInning: number;         // 現在のイニング (1始まり)
  currentHalf: HalfInning;       // 表 or 裏
  outs: number;                  // 現在のアウトカウント (0-2)
  count: Count;                  // 現在のカウント
  bases: BaseState;              // 塁上

  score: { home: number; away: number };
  inningScores: { home: number[]; away: number[] }; // イニングごとのスコア

  currentBatterIndex: number;    // 現在の打順インデックス (0-8)
  pitchCount: number;            // 現在の投手の投球数

  log: MatchEvent[];             // 試合イベントログ

  isOver: boolean;               // 試合終了フラグ
  result: MatchResult | null;    // 試合結果（終了時のみ）
}

/** 試合に参加するチーム（試合用にフラット化） */
export interface MatchTeam {
  id: string;
  name: string;
  players: MatchPlayer[];        // 全部員
  battingOrder: string[];        // 打順（9人のplayerId）
  fieldPositions: Map<string, Position>;  // playerId → 守備位置
  currentPitcherId: string;      // 現在のマウンドにいる投手
  benchPlayerIds: string[];      // ベンチ入り選手のID
  usedPlayerIds: Set<string>;    // この試合で出場済みの選手ID（再出場不可）
}

/** 試合中の選手データ（試合中に変動するパラメータ） */
export interface MatchPlayer {
  player: Player;                // Phase 1 の Player（不変参照）

  // 試合中に変動する値
  pitchCountInGame: number;      // この試合での投球数
  stamina: number;               // 試合中スタミナ（投手用、0-100）
  confidence: number;            // 試合中の自信（打席結果で変動）
  isWarmedUp: boolean;           // ブルペンで準備済みか（リリーフ用）
}

/** 試合イベント（ログ用、2D演出用） */
export interface MatchEvent {
  inning: number;
  half: HalfInning;
  type: MatchEventType;
  description: string;
  playerId?: string;
  data?: Record<string, unknown>;  // 追加データ（自由形式）
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

/** 試合結果 */
export interface MatchResult {
  winner: 'home' | 'away' | 'draw';
  finalScore: { home: number; away: number };
  inningScores: { home: number[]; away: number[] };
  totalInnings: number;
  mvpPlayerId: string | null;     // 簡易MVP選出

  // 個人成績
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
  inningsPitched: number;        // 1/3イニング単位の整数
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

/** 監督の采配指示 */
export type TacticalOrder =
  | { type: 'none' }                                         // 指示なし（通常プレイ）
  | { type: 'bunt'; playerId: string }                       // バント指示
  | { type: 'steal'; runnerId: string }                      // 盗塁指示
  | { type: 'hit_and_run'; runnerId: string }                // エンドラン
  | { type: 'intentional_walk' }                             // 敬遠
  | { type: 'pitching_change'; newPitcherId: string }        // 投手交代
  | { type: 'pinch_hit'; outPlayerId: string; inPlayerId: string }    // 代打
  | { type: 'pinch_run'; outPlayerId: string; inPlayerId: string }    // 代走
  | { type: 'defensive_sub'; outPlayerId: string; inPlayerId: string; position: Position }  // 守備交代
  | { type: 'mound_visit' };                                 // マウンド訪問

/** 采配を入力するコールバック（UIから注入） */
export type TacticsProvider = (state: MatchState) => TacticalOrder;

/** CPU自動采配（対戦相手用） */
export type AutoTacticsProvider = (state: MatchState, rng: RNG) => TacticalOrder;

// ============================================================
// 対戦相手
// ============================================================

/** 対戦相手の生成設定 */
export interface OpponentConfig {
  name: string;
  prefecture: string;
  strength: number;              // チーム力 1-100（選手能力の基準）
  style: OpponentStyle;
}

export type OpponentStyle =
  | 'balanced'         // バランス型
  | 'power_hitting'    // 強打
  | 'speed'            // 機動力
  | 'pitching'         // 投手力
  | 'defense';         // 守備型

/**
 * opponent.ts 生成要件:
 *
 * 投手: 最低3人（先発1 + リリーフ2）。投手力チームは能力+10補正。
 * 捕手: 最低1人。fielding+armStrengthの高い選手をcatcherに配置。
 * 打順: styleに応じた構築
 *   - power_hitting: 3-5番にpower上位3人
 *   - speed: 1-2番にspeed上位、盗塁多用
 *   - pitching: 投手能力に+15補正、打線は控えめ
 *   - defense: fielding全体+10補正
 *   - balanced: 標準配分
 * ベンチ: 最低5人（投手2+野手3）。合計14-18人。
 */
```

---

## 4. 1球処理フロー

### 4.1 processPitch の全体像

```
processPitch(state: MatchState, order: TacticalOrder, rng: RNG)
  │
  ├─ (1) 投手のアクション決定
  │      selectPitch(pitcher, batter, count, bases, rng)
  │      → PitchSelection { type, velocity }
  │      → targetLocation { row, col }
  │
  ├─ (2) 制球誤差の適用
  │      applyControlError(target, pitcher.control, fatigue, rng)
  │      → actualLocation { row, col }
  │
  ├─ (3) 打者の反応決定
  │      decideBatterAction(batter, pitchSelection, actualLocation, count, order, rng)
  │      → BatterAction ('take' | 'swing' | 'bunt')
  │
  ├─ (4) 結果判定（分岐）
  │      │
  │      ├─ action = 'take' (見送り)
  │      │   isInStrikeZone(actual) ? 'called_strike' : 'ball'
  │      │
  │      ├─ action = 'swing' (スイング)
  │      │   calculateSwingResult(batter, pitchSelection, actual, rng)
  │      │   → 'swinging_strike' | 'foul' | 'in_play'
  │      │
  │      └─ action = 'bunt' (バント)
  │          calculateBuntResult(batter, pitchSelection, actual, rng)
  │          → 'foul_bunt' | 'in_play'
  │
  ├─ (5) インプレーの場合 → 打球処理
  │      resolveBatContact(contactResult, bases, outs, fielding, rng)
  │      → FieldResult + 走者進塁 + 得点
  │
  ├─ (6) MatchState更新
  │      カウント更新 / アウト加算 / 走者移動 / 得点加算
  │
  └─ return PitchResult + 更新後のMatchState
```

### 4.2 processPitch のシグネチャ

```typescript
/**
 * 1球を処理する。試合エンジンの最小単位。
 * 純関数：同じ入力なら同じ結果を返す。
 *
 * 内部は6つのサブモジュールに責務分割:
 *   select-pitch.ts  → selectPitch()
 *   control-error.ts → applyControlError()
 *   batter-action.ts → decideBatterAction()
 *   swing-result.ts  → calculateSwingResult()
 *   bat-contact.ts   → generateBatContact()
 *   field-result.ts  → resolveFieldResult()
 *
 * process-pitch.ts は上記を順に呼ぶ薄いオーケストレーター。
 * ロジック自体は各サブモジュールに閉じる。
 */
export function processPitch(
  state: MatchState,
  order: TacticalOrder,
  rng: RNG,
): { nextState: MatchState; pitchResult: PitchResult };
```

---

## 5. 投手側パラメータと打者側パラメータ

### 5.1 投手の有効パラメータ

```typescript
/** processPitch 内で投手から参照する値 */
interface PitcherParams {
  // === PlayerStats.pitching ===
  velocity: number;           // 球速 80-160 → ストレートの基本速度
  control: number;            // コントロール 1-100 → 制球誤差に影響
  pitchStamina: number;       // 投球スタミナ 1-100 → 疲労蓄積速度

  pitches: Partial<Record<PitchType, number>>;
  // 保有球種とキレ。キレが高いほど打者の判断を狂わせる

  // === PlayerStats.base ===
  mental: number;             // メンタル → プレッシャー下での制球安定度
  focus: number;              // 集中力 → 長打を打たれた後の立ち直り

  // === 試合中変動値（MatchPlayer） ===
  pitchCountInGame: number;   // 投球数 → 疲労に変換
  stamina: number;            // 試合中スタミナ → 能力低下に直結

  // === コンディション ===
  mood: Mood;                 // 当日のコンディション → 全体補正
  confidence: number;         // 試合中の自信 → 制球/球速に±
}
```

### 5.2 打者の有効パラメータ

```typescript
/** processPitch 内で打者から参照する値 */
interface BatterParams {
  // === PlayerStats.batting ===
  contact: number;            // ミート → スイング時の接触確率
  power: number;              // パワー → 打球速度・飛距離
  eye: number;                // 選球眼 → ボール球の見極め
  technique: number;          // 打撃技術 → 打球方向のコントロール

  // === PlayerStats.base ===
  speed: number;              // 走力 → 内野安打確率、バント成功率
  mental: number;             // メンタル → プレッシャー耐性
  focus: number;              // 集中力 → 追い込まれた時の粘り

  // === 打席属性 ===
  battingSide: BattingSide;   // 左打/右打/スイッチ
  
  // === 試合中変動値 ===
  confidence: number;         // 試合中の自信 → ミート/パワーに±

  // === コンディション ===
  mood: Mood;                 // 当日のコンディション
}
```

### 5.3 パラメータの実効値算出

試合中のパラメータは、素の値にコンディション・疲労・メンタル補正を掛けた **実効値** で計算する。

```typescript
/**
 * 投手の実効パラメータを算出する
 */
export function getEffectivePitcherParams(mp: MatchPlayer): PitcherParams {
  const p = mp.player;
  const ps = p.stats.pitching!;
  
  const fatigueRatio = mp.stamina / 100;  // 1.0 = 元気、0.0 = 限界
  const moodMult = getMoodMultiplier(p.condition.mood);
  const confMult = getConfidenceMultiplier(mp.confidence);
  
  return {
    velocity: ps.velocity * (0.85 + 0.15 * fatigueRatio) * moodMult,
    control: ps.control * fatigueRatio * moodMult * confMult,
    pitchStamina: ps.pitchStamina,
    pitches: ps.pitches,
    mental: p.stats.base.mental,
    focus: p.stats.base.focus,
    pitchCountInGame: mp.pitchCountInGame,
    stamina: mp.stamina,
    mood: p.condition.mood,
    confidence: mp.confidence,
  };
}

/**
 * 打者の実効パラメータを算出する
 */
export function getEffectiveBatterParams(mp: MatchPlayer): BatterParams {
  const p = mp.player;
  const moodMult = getMoodMultiplier(p.condition.mood);
  const confMult = getConfidenceMultiplier(mp.confidence);
  
  return {
    contact: p.stats.batting.contact * moodMult * confMult,
    power: p.stats.batting.power * moodMult,
    eye: p.stats.batting.eye * moodMult,
    technique: p.stats.batting.technique * moodMult,
    speed: p.stats.base.speed,
    mental: p.stats.base.mental,
    focus: p.stats.base.focus,
    battingSide: p.battingSide,
    confidence: mp.confidence,
    mood: p.condition.mood,
  };
}
```

---

## 6. 判定ロジック詳細

### 6.1 球種・コース選択（selectPitch）

```typescript
export function selectPitch(
  pitcher: PitcherParams,
  batter: BatterParams,
  count: Count,
  bases: BaseState,
  rng: RNG,
): { selection: PitchSelection; target: PitchLocation };
```

**選択ロジック:**

```
(1) 球種選択
    ストレート確率 = 40% + (カウント有利なら+15%, 不利なら-10%)
    変化球 = 残り確率を保有球種のキレ順に分配

    カウント有利 = strikes > balls
    カウント不利 = balls > strikes
    
    追い込み (2ストライク):
      - ウイニングショット傾向（キレ最高の変化球確率UP）
      - ストレートの割合DOWN

(2) コース選択
    ストライクゾーンを狙う確率:
      0ボール:  80%
      1ボール:  75%
      2ボール:  65%
      3ボール:  90% (フォアボール回避)
    
    追い込み (2ストライク):
      ゾーン際（row/col=1 or 3）の確率UP
      ボールゾーンに外す確率UP (ウイニングショット)

(3) ターゲット決定
    ゾーン内: row 1-3, col 1-3 からランダム（配球パターン）
    ゾーン外: 意図的に外す（低め/外角が多い）
```

### 6.2 制球誤差（applyControlError）

```typescript
export function applyControlError(
  target: PitchLocation,
  control: number,        // 実効コントロール値
  rng: RNG,
): PitchLocation;
```

```
誤差の計算:
  errorRange = (100 - control) / 100 × 2.0
  // control=100 → 誤差0, control=50 → 誤差1.0, control=0 → 誤差2.0

  rowError = rng.gaussian(0, errorRange × 0.5)
  colError = rng.gaussian(0, errorRange × 0.5)

  actualRow = clamp(round(target.row + rowError), 0, 4)
  actualCol = clamp(round(target.col + colError), 0, 4)

  // コントロール50の投手: 約68%の確率で±0.5マス以内
  // コントロール80の投手: 約68%の確率で±0.2マス以内（ほぼ狙い通り）
```

### 6.3 打者の反応決定（decideBatterAction）

```typescript
export function decideBatterAction(
  batter: BatterParams,
  pitch: PitchSelection,
  location: PitchLocation,
  count: Count,
  order: TacticalOrder,
  rng: RNG,
): BatterAction;
```

```
(1) 采配チェック
    order.type === 'bunt' → return 'bunt'（サイン無視判定は後述 §7）

(2) ボール球の見極め
    isInZone = isInStrikeZone(location)
    
    if !isInZone:
      swingAtBall = (100 - eye) / 200
      // eye=100 → 0%振る, eye=50 → 25%振る, eye=0 → 50%振る
      
      変化球補正:
        pitch.type !== 'fastball' の場合:
          swingAtBall += pitch.breakLevel × 0.03
          // キレ7のフォーク → +21%。見極め困難
      
      カウント補正:
        2ストライク → swingAtBall += 0.15（追い込まれると振りやすい）
      
      rng.chance(swingAtBall) ? 'swing' : 'take'

(3) ストライクゾーン内
    if isInZone:
      takeStrike = (100 - contact) / 400 + countBasedTake
      // contact=100 → 0%見逃し, contact=50 → 12.5%見逃し
      
      countBasedTake:
        0ストライク → +0.10 (余裕があるので見る)
        1ストライク → +0.03
        2ストライク → +0.00 (振らないと三振)
      
      rng.chance(takeStrike) ? 'take' : 'swing'
```

### 6.4 スイング結果（calculateSwingResult）

```typescript
export function calculateSwingResult(
  batter: BatterParams,
  pitch: PitchSelection,
  location: PitchLocation,
  rng: RNG,
): { outcome: 'swinging_strike' | 'foul' | 'in_play'; contact?: BatContactResult };
```

```
(1) 接触判定
    contactChance = batter.contact / 100 × 0.85
    // contact=100 → 85%, contact=50 → 42.5%
    
    変化球補正:
      pitch.type !== 'fastball':
        contactChance -= pitch.breakLevel × 0.04
        // キレ7のスライダー → -28%。空振りしやすい
    
    球速補正:
      velocity > 140:
        contactChance -= (velocity - 140) / 100 × 0.15
        // 150km/h → -1.5%
    
    コース補正:
      ゾーン際 (row=1,3 or col=1,3): contactChance -= 0.05
      ゾーン外 (row=0,4 or col=0,4): contactChance -= 0.15
    
    if !rng.chance(contactChance): return 'swinging_strike'

(2) ファウル/フェア判定
    fairChance = 0.55 + batter.technique / 100 × 0.25
    // technique=100 → 80%, technique=0 → 55%
    
    追い込み時(2S): fairChance -= 0.10 (カットファウル増加)
    
    if !rng.chance(fairChance): return 'foul'

(3) フェア打球 → 打球性質決定
    return 'in_play' + generateBatContact(batter, pitch, location, rng)
```

### 6.5 打球生成（generateBatContact）

```typescript
export function generateBatContact(
  batter: BatterParams,
  pitch: PitchSelection,
  location: PitchLocation,
  rng: RNG,
): BatContactResult;
```

```
(1) 打球種類
    powerFactor = batter.power / 100
    
    分布（powerFactor=0.5の場合）:
      ground_ball: 40%
      line_drive:  20%
      fly_ball:    30%
      popup:       10%
    
    パワーが高いほど:
      fly_ball↑, line_drive↑, ground_ball↓, popup↓
    
    低めの球 (row=3): ground_ball +15%
    高めの球 (row=1): fly_ball +15%, popup +5%

(2) 打球速度
    base = powerFactor × 0.6 + contactQuality × 0.4
    // contactQuality = contact能力とコース精度から算出
    
    speed = 'weak' | 'normal' | 'hard' | 'bullet'
    weak:   base < 0.25
    normal: base 0.25-0.50
    hard:   base 0.50-0.75
    bullet: base > 0.75

(3) 打球方向 (0-90度)
    基本 = rng.gaussian(45, 25)  // センター中心の正規分布
    technique補正: 高いほど狙い打ち可能（分散が小さくなる）
    // technique=100 → σ=15, technique=0 → σ=30

(4) 飛距離
    ground_ball: 20-60m
    line_drive: 40-110m (パワー依存)
    fly_ball: 50-130m (パワー依存。130m超=ホームラン)
    popup: 10-40m
    
    home_run閾値: distance > 100m && fly_ball（フェンスオーバー）
```

### 6.6 守備結果の判定（resolveFieldResult）

```typescript
export function resolveFieldResult(
  contact: Omit<BatContactResult, 'fieldResult'>,
  bases: BaseState,
  outs: number,
  fieldingTeam: MatchTeam,
  rng: RNG,
): FieldResult;
```

**MVP簡易守備モデル:**

```
(1) ホームラン判定
    fly_ball && distance > 100: → home_run (100%)

(2) ポップフライ
    popup: → out (95%), error (5%)

(3) フライ
    fly_ball && distance <= 100:
      catchChance = 0.80 + (nearestFielder.fielding / 100 × 0.15)
      → rng.chance(catchChance) ? out : hit(single or double)
      
      犠飛判定: out && third !== null && outs < 2 → sacrifice_fly

(4) ライナー
    line_drive:
      if speed === 'bullet':
        outChance = 0.20 + fielding × 0.003  // 速い打球は抜けやすい
      else:
        outChance = 0.35 + fielding × 0.005
      
      ヒット判定: distance と direction から single / double / triple

(5) ゴロ
    ground_ball:
      outChance = 0.55 + fielding × 0.004 - batter.speed × 0.003
      // 守備力高い→アウト多い, 足速い→内野安打
      
      併殺判定: first !== null && outs < 2 && speed === 'weak' or 'normal'
        dpChance = 0.30 + fielding × 0.004
      
      犠打判定: bunt_ground → sacrifice (走者が進塁)

(6) nearestFielder の決定
    direction に基づくマッピング（簡易版）:
      0-10度:  left
      10-25度: shortstop / third
      25-35度: shortstop / second
      35-55度: center / second
      55-65度: second / first
      65-80度: first / right
      80-90度: right
```

---

## 7. 采配システム

### 7.1 MVP采配一覧

| 采配 | タイミング | 効果 |
|------|-----------|------|
| **バント** | 打席開始前 | 打者にバント指示。犠打成功で走者進塁 |
| **盗塁** | 投球前 | 指定走者が盗塁を試みる |
| **エンドラン** | 投球前 | 走者スタート+打者スイング必須 |
| **敬遠** | 打席開始前 | 意図的四球 |
| **投手交代** | イニング間 or 打席間 | ベンチの投手に交代 |
| **代打** | 打席開始前 | ベンチの選手が代わりに打席へ |
| **代走** | 出塁後 | ベンチの選手が走者として交代 |
| **守備交代** | イニング間 | 守備固め |
| **マウンド訪問** | 投球間 | 投手のconfidence回復。1試合3回まで |

### 7.2 サイン無視

```typescript
export function willObeySign(
  player: Player,
  order: TacticalOrder,
  matchState: MatchState,
  rng: RNG,
): boolean;
```

```
基本遵守率 = 0.90

性格補正:
  honest:         +0.05
  rebellious:     -0.15
  overconfident:  -0.08 (好調時さらに-0.05)
  competitive:    -0.03 (チャンス時)

confidence補正:
  confidence > 80: -0.05 (自信過剰で自分の判断を優先)
  confidence < 30: +0.05 (自信がないのでサインに従う)

場面補正:
  バント指示 + 4番打者: -0.10 (打ちたい)
  盗塁指示 + 足が遅い: +0.05 (無理しない)

return rng.chance(complianceRate)
```

### 7.3 CPU自動采配（対戦相手）

```typescript
export function cpuAutoTactics(
  state: MatchState,
  rng: RNG,
): TacticalOrder;
```

**MVP簡易ロジック:**

```
(1) 投手交代判定
    投手スタミナ < 20 → 交代
    投球数 > 100 → 交代確率上昇
    大量リードで後半 → 控え投手に温存

(2) バント判定
    走者一塁 + 0アウト + 点差1以内 + 7回以降 → バント
    投手の打席 → バント（DH無し時）

(3) 盗塁判定
    走者一塁 + speed > 70 + 0-1アウト → 盗塁確率 15%

(4) 敬遠判定
    一塁空き + 相手4番 + 得点圏走者あり → 敬遠

(5) それ以外 → { type: 'none' }
```

---

## 8. 疲労・メンタル・信頼度の影響

### 8.1 投手スタミナ消耗

```
1球あたりのスタミナ消費:
  baseCost = 1.0
  
  球種補正:
    ストレート:    ×1.0
    カーブ:        ×0.9
    スライダー:    ×1.0
    フォーク:      ×1.2 (肘への負担)
    チェンジアップ: ×0.8
    カッター:      ×1.0
    シンカー:      ×1.1
  
  全力投球補正:
    velocity > (baseVelocity × 0.95): ×1.3
  
  pitchStamina補正:
    cost = baseCost × 球種補正 × 全力投球補正
    cost /= (pitchStamina / 50)
    // pitchStamina=100 → 半減, pitchStamina=50 → 等倍
  
  スタミナ残量 = max(0, stamina - cost)
```

### 8.2 スタミナ→能力低下

```
fatigueRatio = stamina / 100

球速低下:
  effectiveVelocity = baseVelocity × (0.85 + 0.15 × fatigueRatio)
  // stamina=100: 100%, stamina=0: 85%

コントロール低下:
  effectiveControl = baseControl × fatigueRatio
  // stamina=100: 100%, stamina=0: 0%（制球崩壊）

変化球キレ低下:
  effectiveBreak = baseBreak × (0.7 + 0.3 × fatigueRatio)
  // stamina=100: 100%, stamina=0: 70%
```

### 8.3 試合中の自信変動（confidence）

```
打者:
  ヒット:        confidence += 10
  ホームラン:    confidence += 20
  四球:          confidence += 5
  三振:          confidence -= 8
  凡打:          confidence -= 3
  併殺打:        confidence -= 10
  チャンスで凡退: confidence -= 12

投手:
  三振:          confidence += 5
  凡打アウト:    confidence += 2
  ヒット:        confidence -= 5
  ホームラン被弾: confidence -= 15
  四球:          confidence -= 8
  無失点イニング: confidence += 8

  // clamp(0, 100) 常に
```

### 8.4 プレッシャー補正

```
pressureLevel = calculatePressure(state)

要素:
  得点圏に走者あり: +20
  同点 or 1点差:    +15
  7回以降:          +10
  9回:              +20
  甲子園:           +15
  満塁:             +10

mental補正:
  effectivePressure = pressureLevel × (1.0 - mental / 150)
  // mental=100 → 圧力を33%軽減
  // mental=50 → 圧力を17%軽減

最終能力補正:
  if effectivePressure > 50:
    allStats × (1.0 - (effectivePressure - 50) / 200)
    // 最大で10%低下

ゾーン (in_the_zone フラグ):
  プレッシャー補正を無効化 + 全能力 ×1.1

スランプ (slump フラグ):
  contact, power × 0.85
```

---

## 9. 試合結果の反映

### 9.1 careerStats への加算

```typescript
export function applyMatchStatsToCareer(
  player: Player,
  batterStat: MatchBatterStat | null,
  pitcherStat: MatchPitcherStat | null,
): Player;
```

```
打者:
  careerStats.gamesPlayed += 1
  careerStats.atBats += batterStat.atBats
  careerStats.hits += batterStat.hits
  careerStats.homeRuns += batterStat.homeRuns
  careerStats.rbis += batterStat.rbis
  careerStats.stolenBases += batterStat.stolenBases

投手:
  careerStats.gamesStarted += (先発 ? 1 : 0)
  careerStats.inningsPitched += pitcherStat.inningsPitched
  careerStats.wins += (pitcherStat.isWinner ? 1 : 0)
  careerStats.losses += (pitcherStat.isLoser ? 1 : 0)
  careerStats.strikeouts += pitcherStat.strikeouts
  careerStats.earnedRuns += pitcherStat.earnedRuns
```

### 9.2 成長への反映

```typescript
export function applyMatchGrowth(
  player: Player,
  batterStat: MatchBatterStat | null,
  pitcherStat: MatchPitcherStat | null,
  isKoshien: boolean,
  rng: RNG,
): Player;
```

```
成長倍率 = MATCH_GROWTH_MULTIPLIER (2.0)
甲子園 = KOSHIEN_GROWTH_MULTIPLIER (3.0)

打者の成長:
  打席に立った → batting系能力に経験値
    atBats × 0.05 × 倍率 → contact, eye にランダム配分
  ヒット → technique に+0.1/本 × 倍率
  ホームラン → power に+0.2/本 × 倍率

投手の成長:
  投球イニング → pitching系能力に経験値
    innings × 0.08 × 倍率 → control, pitchStamina にランダム配分
  三振 → velocity に+0.05/個 × 倍率（微量）
  無失点イニング → mental に+0.1/回 × 倍率

全選手:
  出場 → base.stamina に+0.02 × 倍率
  勝利 → mentalState.confidence +5
  敗北 → 性格次第（competitive: confidence +3, sensitive: confidence -5）

※ Phase 1 の ceilingPenalty は適用される
```

### 9.3 試合結果 → GameState への統合

```typescript
export function applyMatchResultToGameState(
  state: GameState,
  result: MatchResult,
  isKoshien: boolean,
  rng: RNG,
): GameState;
```

この関数は Phase 3（年間サイクル）から呼ばれる。Phase 2 では `result.ts` に関数だけ実装し、呼び出し統合は Phase 3 で行う。

---

## 10. MVPで省略するもの

| 項目 | 省略理由 | 代替 | 将来 |
|------|---------|------|------|
| **詳細走塁** | 複雑度が高い | 打球結果で自動進塁。盗塁は成功/失敗のみ | v1.5 |
| **守備シフト** | UIが必要 | 標準守備位置固定 | v1.5 |
| **中継プレー** | 実装コスト大 | 最寄り野手が直接処理 | v2 |
| **ワイルドピッチ/パスボール** | 低優先 | 省略 | v1.5 |
| **ボーク** | レアケース | 省略 | v2 |
| **振り逃げ** | レアケース | 省略 | v1.5 |
| **インフィールドフライ** | 判定が複雑 | 省略（普通にフライアウト） | v1.5 |
| **タッチアップ詳細** | 走者判断AI | 犠飛は三塁走者の場合のみ自動 | v1.5 |
| **申告敬遠の演出** | UI側の問題 | 即時四球処理 | v1.5 |
| **投球フォーム/モーション** | 描画側 | なし（Phase 5で2D描画） | v1.5 |
| **左右の投打相性** | バランス調整後 | 補正なし | v1.5 |
| **球種ごとの被打率差** | バランス複雑 | キレ（breakLevel）で一律補正 | v1.5 |
| **スクイズ** | バントの特殊形 | バント+盗塁の組合せで代替 | v1.5 |
| **DH制** | ルール分岐 | 9人制固定 | v1.5 |
| **コリジョンルール** | レアケース | 省略 | v2 |
| **リクエスト（ビデオ判定）** | ゲーム性に寄与小 | 省略 | 検討 |

---

## 11. テスト観点

### 11.1 モジュール別テスト

#### pitch/ (サブモジュール群)

| テストケース | 対象ファイル | 検証内容 |
|-------------|------------|---------|
| selectPitch の球種分布 | select-pitch.ts | 1000回試行で球種がおおむね期待比率に収束 |
| applyControlError の誤差範囲 | control-error.ts | control=100で誤差ほぼ0、control=20で大きくブレる |
| 見送り→ストライク/ボール | batter-action.ts | ゾーン内見送り=called_strike, ゾーン外見送り=ball |
| ボール球の見極め | batter-action.ts | eye値に応じたボール球スイング率の妥当性 |
| スイング→空振り/ファウル/インプレー | swing-result.ts | contact値に応じた接触率の妥当性 |
| 変化球のキレ影響 | swing-result.ts | breakLevel高→空振り率UP |
| ファウルの処理 | swing-result.ts | 2ストライクでファウル→アウトにならない（バントファウル以外） |
| 打球種類の分布 | bat-contact.ts | power高→fly_ball率UP |
| ホームラン判定 | field-result.ts | fly_ball + distance>100 → home_run |
| 守備力の影響 | field-result.ts | fielding高→アウト率UP |
| バント | batter-action.ts | バント指示で BatterAction='bunt' になる |
| processPitch 統合 | process-pitch.ts | 1球処理が PitchResult を正しく返す |
| シード再現性 | process-pitch.ts | 同じシードで同じ PitchResult |

#### at-bat.ts

| テストケース | 検証内容 |
|-------------|---------|
| 三振 | 3ストライクで打席終了 |
| 四球 | 4ボールで出塁 |
| ヒット | インプレー→FieldResult=single で打席終了 |
| ホームラン | fly_ball + distance>100 → home_run |
| 打席のカウント推移 | ファウルで2Sを超えない |
| 死球 | 低確率で発生 |
| 敬遠 | TacticalOrder=intentional_walk で即四球 |

#### inning.ts

| テストケース | 検証内容 |
|-------------|---------|
| 3アウトでイニング終了 | outsRecorded === 3 |
| 得点記録 | ランナー生還時にrunsScored加算 |
| 打順送り | イニングをまたいで打順が連続する |
| 走者リセット | イニング終了で塁上クリア |

#### game.ts

| テストケース | 検証内容 |
|-------------|---------|
| 9イニング完走 | 9回終了時に点差ありで結果が出る |
| 先攻勝利 | 9回裏で逆転不可の場合、裏を省略せず結果確定 |
| サヨナラ | 9回裏でhomeが逆転→そのイニングで即終了 |
| 延長 | 同点で延長に入り最大延長回まで |
| 延長上限→引き分け | 最大延長到達で同点→draw |
| 両チームの得点合計 | inningScores の合計 = finalScore |
| MatchResult のバリデーション | 全選手のstatが整合 |

#### tactics.ts

| テストケース | 検証内容 |
|-------------|---------|
| 投手交代 | 交代後のcurrentPitcherIdが更新される |
| 代打 | outPlayerがlineupから外れ、inPlayerが打席に |
| 二重起用禁止 | usedPlayerIdsに入った選手は再起用不可 |
| サイン無視 | rebellious選手の遵守率が低い |
| マウンド訪問制限 | 4回目以降は無効 |

#### opponent.ts

| テストケース | 検証内容 |
|-------------|---------|
| 9人+控え生成 | 生成チームが有効なLineupを持つ |
| strength影響 | strength高→能力値高 |
| 投手3人以上 | 先発1+リリーフ2以上が含まれる |
| 捕手の存在 | 必ず1人以上のcatcherがいる |
| style反映 | power_hittingでクリーンナップのpowerが高い |
| style反映 | pitchingで投手能力が補正されている |
| ベンチ人数 | 14-18人の合計メンバー |

#### result.ts

| テストケース | 検証内容 |
|-------------|---------|
| careerStats反映 | 試合後にhits, atBats等が増加 |
| 成長反映 | 試合出場で能力値が微増（ceiling内） |
| 甲子園倍率 | isKoshien=trueで成長量が大きい |

### 11.2 統合テスト

| テストケース | 検証内容 |
|-------------|---------|
| **100試合シミュレーション** | 100試合を連続実行。エラーなし＆スコアが妥当な範囲 (0-30点) |
| **パフォーマンス** | 1試合 < 3秒 |
| **打率分布** | 100試合の平均打率が .200-.350 の範囲 |
| **防御率分布** | 100試合の平均防御率が 1.50-6.00 の範囲 |
| **ホームラン率** | 全打席の2-8%程度 |
| **三振率** | 全打席の15-30%程度 |
| **四球率** | 全打席の5-15%程度 |
| **1試合の投球数** | 両チーム合計で200-400球程度 |

---

## 12. 実装順序

### 12.1 ステップ分解

```
Week 1: 1球処理 + 打席
─────────────────────────────────────
Step 1.  match/types.ts                              [1日]
         - 全型定義
         - isInStrikeZone, EMPTY_BASES 等のユーティリティ

Step 2.  match/constants.ts                          [0.5日]
         - 試合バランス定数すべて

Step 2b. engine/shared/ 切り出し                    [0.5日]
         - stat-utils.ts: ceilingPenalty, clampStat を growth/ から移動
         - mood-utils.ts: getMoodMultiplier, getConfidenceMultiplier
         - growth/calculate.ts から shared への参照にリファクタ
         - 既存テストがPassすることを確認

Step 3.  match/pitch/ (責務分割で6ファイル)           [2日]
         - select-pitch.ts: 球種・コース選択
         - control-error.ts: 制球誤差
         - batter-action.ts: 打者反応
         - swing-result.ts: スイング結果
         - bat-contact.ts: 打球生成
         - field-result.ts: 守備結果
         - process-pitch.ts: オーケストレーター（上記を順に呼ぶ薄い関数）
         - テスト: 各サブモジュールの単体テスト + PitchResult の妥当性

Step 4.  match/at-bat.ts                             [1日]
         - processAtBat: 打席ループ（processPitch を繰り返し）
         - 三振/四球/ヒット/敬遠の終了判定
         - 走者進塁の処理
         - テスト: 三振、四球、各種ヒット、敬遠

Step 5.  match/tactics.ts                            [1日]
         - willObeySign: サイン遵守判定
         - applyTacticalOrder: 采配の適用
         - validateOrder: 采配の妥当性チェック
         - handlePitchingChange: 投手交代処理
         - handleSubstitution: 代打/代走/守備交代
         - テスト: 各采配の適用、サイン無視

Week 2: イニング + 試合 + 結果
─────────────────────────────────────
Step 6.  match/inning.ts                             [1日]
         - processHalfInning: ハーフイニング処理
         - 3アウト判定、打順送り
         - テスト: 3アウト、得点、打順

Step 7.  match/game.ts                               [1.5日]
         - createMatchState: 初期状態生成
         - processGame: 試合全体の進行
         - checkGameEnd: 終了判定（サヨナラ、コールド、延長上限）
         - テスト: 9イニング完走、サヨナラ、延長

Step 8.  match/opponent.ts                           [1日]
         - generateOpponent: 対戦相手チーム自動生成
         - cpuAutoTactics: CPU自動采配
         - テスト: 生成チームの妥当性

Step 9.  match/result.ts                             [1日]
         - collectMatchStats: 試合個人成績の集計
         - applyMatchStatsToCareer: CareerRecord への加算
         - applyMatchGrowth: 試合後の能力成長
         - selectMVP: 簡易MVP選出
         - テスト: 成績反映、成長

Step 10. 統合テスト + バランス調整                    [1.5日]
         - 100試合シミュレーション
         - 打率・防御率・HR率・三振率の分布確認
         - パフォーマンス計測
         - 定数微調整
```

### 12.2 依存関係図

```
Step 1 (types) ─────────────────────────────┐
  ↓                                          │
Step 2 (constants) ──────────────────────────┤
  ↓                                          │
Step 2b (shared) ←── engine/growth (refactor)│
  ↓                                          │
Step 3 (pitch/) ←── Step 1, 2, 2b           │
  ↓                                          │
Step 4 (at-bat) ←── Step 3                   │
  │                                          │
Step 5 (tactics) ←── Step 1, 2               │
  │                                          │
Step 6 (inning) ←── Step 4, 5               │
  ↓                                          │
Step 7 (game) ←── Step 6                     │
  │                                          │
Step 8 (opponent) ←── Step 1 + player/gen    │
  │                                          │
Step 9 (result) ←── Step 1 + shared          │
  │                                          │
Step 10 (統合) ←── Step 7, 8, 9              │
```

### 12.3 マイルストーン

| マイルストーン | 完了条件 | 想定日 |
|-------------|---------|--------|
| **M1: 1球が飛ぶ** | processPitchが投球→結果を返す。テストPass | Week 1 中盤 |
| **M2: 打席が終わる** | processAtBatが三振/四球/ヒットで終了する | Week 1 後半 |
| **M3: 采配が通る** | バント/代打/継投が正しく処理される | Week 1 末 |
| **M4: 試合が完走する** | 9イニング+延長が正常に終了し、スコアが返る | Week 2 中盤 |
| **M5: Phase 2 完了** | 100試合シミュレーションが妥当な統計値で完走 | Week 2 末 |

---

## 13. ディレクトリ構成

Phase 2 完了時の追加分：

```
src/engine/shared/               # 新設: エンジン横断の共有ロジック
├── stat-utils.ts                # ceilingPenalty, clampStat
├── mood-utils.ts                # getMoodMultiplier, getConfidenceMultiplier
└── index.ts

src/engine/match/
├── types.ts                     # 試合関連の全型定義
├── constants.ts                 # 試合バランス定数
├── pitch/                       # 1球の処理（責務分割）
│   ├── select-pitch.ts          # 球種・コース選択
│   ├── control-error.ts         # 制球誤差
│   ├── batter-action.ts         # 打者の反応決定
│   ├── swing-result.ts          # スイング結果（空振り/ファウル/インプレー）
│   ├── bat-contact.ts           # 打球生成
│   ├── field-result.ts          # 守備結果
│   ├── process-pitch.ts         # オーケストレーター
│   └── index.ts
├── at-bat.ts                    # 1打席の処理
├── inning.ts                    # 1イニングの処理
├── game.ts                      # 1試合の処理
├── tactics.ts                   # 采配ロジック
├── opponent.ts                  # 対戦相手の自動生成
├── result.ts                    # 試合結果の集計・成長反映
└── index.ts                     # 公開API

tests/engine/match/
├── pitch/
│   ├── select-pitch.test.ts
│   ├── control-error.test.ts
│   ├── batter-action.test.ts
│   ├── swing-result.test.ts
│   ├── bat-contact.test.ts
│   ├── field-result.test.ts
│   └── process-pitch.test.ts
├── at-bat.test.ts               # 打席テスト
├── inning.test.ts               # イニングテスト
├── game.test.ts                 # 試合テスト
├── tactics.test.ts              # 采配テスト
├── opponent.test.ts             # 対戦相手生成テスト
├── result.test.ts               # 結果反映テスト
└── integration/
    ├── simulation.test.ts       # 100試合シミュレーション
    └── balance.test.ts          # 統計値バランスチェック
```

---

## 付録A: 試合バランス定数

```typescript
// match/constants.ts

export const MATCH_CONSTANTS = {
  // === 投球 ===
  FASTBALL_BASE_RATIO: 0.40,           // ストレートの基本選択率
  STRIKE_ZONE_TARGET_BASE: 0.75,       // ストライクゾーンを狙う基本率
  CONTROL_ERROR_SCALE: 2.0,            // 制球誤差のスケール

  // === 打撃 ===
  BASE_CONTACT_RATE: 0.85,             // contact=100時の接触率
  BREAK_CONTACT_PENALTY: 0.04,         // 変化球キレ1あたりの接触率低下
  VELOCITY_CONTACT_PENALTY: 0.0015,    // 球速1km/hあたりの接触率低下 (140以上)
  FAIR_BASE_RATE: 0.55,                // フェア打球の基本率
  TECHNIQUE_FAIR_BONUS: 0.25,          // technique=100時のフェアボーナス

  // === 打球 ===
  HOME_RUN_DISTANCE: 100,              // HR判定の最低飛距離 (m)
  FLY_MAX_DISTANCE: 130,               // フライの最大飛距離 (m)

  // === 守備 ===
  FLY_CATCH_BASE: 0.80,                // フライキャッチの基本確率
  GROUND_OUT_BASE: 0.55,               // ゴロアウトの基本確率
  DOUBLE_PLAY_BASE: 0.30,              // 併殺の基本確率
  ERROR_POPUP_RATE: 0.05,              // ポップフライのエラー率

  // === 投手スタミナ ===
  STAMINA_PER_PITCH_BASE: 1.0,         // 1球あたりの基本スタミナ消費
  STAMINA_VELOCITY_LOW: 0.85,          // スタミナ0時の球速維持率
  STAMINA_BREAK_LOW: 0.70,             // スタミナ0時のキレ維持率

  // === 自信 ===
  CONFIDENCE_HIT_GAIN: 10,
  CONFIDENCE_HR_GAIN: 20,
  CONFIDENCE_WALK_GAIN: 5,
  CONFIDENCE_STRIKEOUT_LOSS: -8,
  CONFIDENCE_POPUP_LOSS: -3,
  CONFIDENCE_DP_LOSS: -10,
  CONFIDENCE_CLUTCH_FAIL_LOSS: -12,

  CONFIDENCE_PITCHER_K_GAIN: 5,
  CONFIDENCE_PITCHER_OUT_GAIN: 2,
  CONFIDENCE_PITCHER_HIT_LOSS: -5,
  CONFIDENCE_PITCHER_HR_LOSS: -15,
  CONFIDENCE_PITCHER_WALK_LOSS: -8,
  CONFIDENCE_PITCHER_CLEAN_INNING: 8,

  // === プレッシャー ===
  PRESSURE_SCORING_POS: 20,
  PRESSURE_CLOSE_GAME: 15,
  PRESSURE_LATE_INNING: 10,
  PRESSURE_NINTH: 20,
  PRESSURE_KOSHIEN: 15,
  PRESSURE_BASES_LOADED: 10,

  // === サイン ===
  SIGN_COMPLIANCE_BASE: 0.90,

  // === 試合設定 ===
  DEFAULT_INNINGS: 9,
  DEFAULT_MAX_EXTRAS: 3,
  MOUND_VISIT_LIMIT: 3,
  MOUND_VISIT_CONFIDENCE_GAIN: 15,

  // === HBP ===
  HIT_BY_PITCH_BASE_RATE: 0.008,       // 死球の基本発生率（1球あたり）
} as const;
```

---

## 付録B: Mood / Confidence 補正テーブル

```typescript
export function getMoodMultiplier(mood: Mood): number {
  switch (mood) {
    case 'excellent': return 1.15;
    case 'good':      return 1.05;
    case 'normal':    return 1.00;
    case 'poor':      return 0.90;
    case 'terrible':  return 0.75;
  }
}

export function getConfidenceMultiplier(confidence: number): number {
  // confidence 0-100 → 0.85-1.15 の範囲
  return 0.85 + (confidence / 100) * 0.30;
}
```

---

## 付録C: パフォーマンスバジェット

| 処理 | 許容時間 | 根拠 |
|------|---------|------|
| `processPitch` | < 1ms | 1打席10球で10ms |
| `processAtBat` | < 10ms | 1イニング4打席で40ms |
| `processHalfInning` | < 50ms | 余裕を持って |
| `processGame` (9イニング) | < 2秒 | 体感上の待ち時間限界 |
| `processGame` (早送り) | < 500ms | 日常進行のバックグラウンド処理 |
| `generateOpponent` | < 100ms | 選手20人生成 |

---

> **次のステップ**: この設計書のレビュー → 合意後、Step 1（型定義）から実装開始
