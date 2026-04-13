# Phase 3 設計拡張: WorldState — 全体シミュレーション層

> バージョン: 0.2.0  
> 作成日: 2026-04-13  
> 前提: DESIGN-PHASE3.md v0.1.0 を上書きする拡張設計  
> ステータス: 設計レビュー中

---

## 目次

1. [設計転換の概要](#1-設計転換の概要)
2. [WorldState アーキテクチャ](#2-worldstate-アーキテクチャ)
3. [全学校・全選手・全中学生の管理](#3-全学校全選手全中学生の管理)
4. [計算粒度の3段階設計](#4-計算粒度の3段階設計)
5. [自校UIと世界シミュレーションの責務分離](#5-自校uiと世界シミュレーションの責務分離)
6. [ライフサイクル: 中学生→高校生→卒業生](#6-ライフサイクル-中学生高校生卒業生)
7. [DESIGN-PHASE3.md v0.1.0 からの差分サマリ](#7-design-phase3md-v010-からの差分サマリ)
8. [実装段階案](#8-実装段階案)
9. [パフォーマンス設計](#9-パフォーマンス設計)
10. [データモデル詳細](#10-データモデル詳細)
11. [テスト戦略](#11-テスト戦略)

---

## 1. 設計転換の概要

### 1.1 v0.1.0 との根本的な違い

| 項目 | v0.1.0（旧設計） | v0.2.0（新設計） |
|------|-----------------|-----------------|
| シミュレーション対象 | 自校1校のみ | **都道府県の全高校 + 全中学生** |
| 対戦相手 | 試合ごとに使い捨て生成 | **永続する実体を持つチーム** |
| 他校の選手 | 存在しない | **全員がPlayerインスタンスとして存在し成長する** |
| 中学生 | 存在しない（入学時に突然生成） | **中学時代から存在し、高校進学まで能力が変化** |
| 全試合 | 自チーム以外はスキップ or クイック判定 | **全試合をシミュレーション（粒度は3段階）** |
| セーブデータ | 自校データのみ（~100KB） | **世界全体（~5-20MB）** |
| ゲーム体験 | 自校の物語のみ | **「世界が動いている」実感。ライバル校の成長、因縁の再戦** |

### 1.2 この転換で得られるもの

1. **ライバルが存在する世界**: 去年負けた相手が甲子園で優勝し、そのチームの選手がプロに行く
2. **スカウトに実体がある**: 中学3年の時から見ていた選手が入学してくる
3. **因縁の再戦**: 夏に負けた相手と秋に再戦。相手も成長している
4. **ドラフトの重み**: 他校の選手も含めた全国ドラフトが成立する
5. **情報の非対称性**: 自校は詳細に見えるが、他校は視察しないと見えない

### 1.3 設計の核心的原則

> **世界は平等に動く。UIが見せる粒度だけが違う。**

- 全高校が同一カレンダーで進行する
- 全選手が毎日成長する（計算粒度は異なるが、結果の統計的分布は同じ）
- 全試合が実行される（シミュレーション深度は異なるが、勝敗・スコアは必ず生成される）
- 中学生は中学1年から存在し、3年間かけて能力が形成される

---

## 2. WorldState アーキテクチャ

### 2.1 レイヤー図

```
┌─────────────────────────────────────────────────────────────┐
│                        UI Layer (Phase 4)                    │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│   │ 自校画面 │ │ 試合画面 │ │ スカウト │ │ 大会一覧 │      │
│   └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘      │
│        │            │            │            │             │
│   ┌────▼────────────▼────────────▼────────────▼──────┐      │
│   │              ViewState Projector                  │      │
│   │    WorldState → UI用の断面を切り出す               │      │
│   └────────────────────┬─────────────────────────────┘      │
└────────────────────────┼────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    WorldState                                │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ world-ticker.ts  — 世界の1日を進める統括関数          │    │
│  │   ├─ 全高校の日次処理                                │    │
│  │   ├─ 全中学生の成長処理                              │    │
│  │   ├─ 大会がある日は全試合実行                        │    │
│  │   └─ 年度替わり（全校一括）                          │    │
│  └───────────────────────┬─────────────────────────────┘    │
│                           │                                  │
│  ┌────────────┐  ┌───────▼───────┐  ┌──────────────┐       │
│  │ HighSchool │  │  Tournament   │  │ MiddleSchool │       │
│  │  Pool      │  │   System      │  │    Pool      │       │
│  │ (48+校)    │  │ (全試合実行)  │  │ (200+人/年)  │       │
│  └────────────┘  └───────────────┘  └──────────────┘       │
│                                                              │
│  ┌──────────────────────────────────────────────────┐       │
│  │ PersonRegistry — 全人物の生涯を管理する単一台帳    │       │
│  │   中学生 → 高校生 → 卒業生 → OB の一貫したID管理   │       │
│  └──────────────────────────────────────────────────┘       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    Engine Layer (Phase 1/2 既存)              │
│  match/ — runGame(), quickGame()                             │
│  growth/ — applyDailyGrowth(), applyBatchGrowth()           │
│  calendar/ — advanceDate(), getDayType()                     │
│  player/ — generatePlayer()                                  │
│  team/ — roster, lineup, enrollment                          │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 WorldState の型定義

```typescript
/** ゲーム世界全体の状態 */
export interface WorldState {
  version: string;
  seed: string;
  currentDate: GameDate;
  
  // === プレイヤー情報 ===
  playerSchoolId: string;              // プレイヤーが監督する学校のID
  manager: Manager;
  settings: GameSettings;
  
  // === 世界の実体 ===
  schools: HighSchool[];               // 都道府県の全高校（48校前後）
  middleSchoolPool: MiddleSchoolPlayer[]; // 中学生プール
  personRegistry: PersonRegistry;      // 全人物の生涯台帳
  
  // === 大会 ===
  activeTournaments: Tournament[];
  completedTournaments: TournamentSummary[]; // 当年度完了分
  tournamentHistory: TournamentHistoryEntry[]; // 歴代優勝校（軽量）
  
  // === 年間進行 ===
  seasonState: SeasonState;
  weeklyPlan: WeeklyPlan;             // 自校の練習計画
  
  // === 累積 ===
  draftHistory: DraftHistoryEntry[];  // 歴代ドラフト結果
  yearlyStats: YearlyStatsSummary[];  // 年度ごとの統計サマリ
}
```

### 2.3 旧 GameState との関係

```
GameState (Phase 1/2)         WorldState (Phase 3)
═══════════════════           ═══════════════════

version          ────────────► version
seed             ────────────► seed
currentDate      ────────────► currentDate
team             ────────────► schools[playerSchoolId]  ← 自校はここ
manager          ────────────► manager
graduates        ────────────► personRegistry.graduates  ← 全校分に拡大
settings         ────────────► settings

                 NEW ────────► schools[]            ← 他校が増えた
                 NEW ────────► middleSchoolPool     ← 中学生プール
                 NEW ────────► personRegistry       ← 全人物台帳
                 NEW ────────► activeTournaments    ← (v0.1.0 にもあった)
                 NEW ────────► seasonState          ← (v0.1.0 にもあった)
```

**後方互換:** 旧GameStateからのマイグレーションは、`schools[0]` に自校を入れ、残り47校を自動生成することで可能。

---

## 3. 全学校・全選手・全中学生の管理

### 3.1 高校の管理

```typescript
/** 高校（自校も他校も同じ型） */
export interface HighSchool {
  id: string;
  name: string;
  prefecture: string;
  reputation: number;                  // 0-100
  
  players: Player[];                   // 全部員（1〜3年、15-30人）
  lineup: Lineup | null;
  facilities: FacilityLevel;
  
  // 計算粒度の制御
  simulationTier: SimulationTier;      // 'full' | 'standard' | 'minimal'
  
  // 当年度の実績（リアルタイム更新）
  yearResults: YearResults;
  
  // AI監督の方針（他校のみ）
  coachStyle: CoachStyle;
}

/** 計算粒度 */
export type SimulationTier = 'full' | 'standard' | 'minimal';

/** AI監督の方針 */
export interface CoachStyle {
  offenseType: 'power' | 'speed' | 'balanced' | 'bunt_heavy';
  defenseType: 'ace_centric' | 'relay' | 'balanced';
  practiceEmphasis: 'batting' | 'pitching' | 'defense' | 'balanced';
  aggressiveness: number;  // 0-100（盗塁・バント頻度）
}
```

**都道府県の高校数:**

| カテゴリ | 校数 | 説明 |
|---------|------|------|
| 自校 | 1 | プレイヤーが監督。tier = 'full' |
| ライバル校 | 3〜5 | 最近の大会で対戦した学校、注目校。tier = 'standard' |
| その他の高校 | 42〜44 | 県内の残り全校。tier = 'minimal' |
| **合計** | **48** | 夏の地方大会の参加校数 |

### 3.2 選手の総数見積り

| カテゴリ | 1校あたり | 48校合計 | 備考 |
|---------|----------|---------|------|
| 高校生（1〜3年） | 20〜25人 | **960〜1,200人** | 全員 Player インスタンス |
| 中学生（1〜3年） | — | **150〜200人/学年** | 高校進学候補のプール |
| 中学生合計 | — | **450〜600人** | 3学年分 |
| **世界の全人物** | — | **1,400〜1,800人** | 常時メモリ上に存在 |

### 3.3 中学生プール

```typescript
/** 中学生（高校進学前の選手候補） */
export interface MiddleSchoolPlayer {
  id: string;                          // PersonRegistry と共有のID
  firstName: string;
  lastName: string;
  
  // 中学生固有
  middleSchoolGrade: 1 | 2 | 3;       // 中学の学年
  middleSchoolName: string;
  prefecture: string;
  
  // 能力（中学生時点。高校入学時はここから継続成長）
  stats: PlayerStats;
  potential: PotentialStats;
  
  // 中学時代の成績（スカウト評価用）
  middleSchoolRecord: MiddleSchoolRecord;
  
  traits: TraitId[];
  background: Background;
  
  // 進学先（中3の秋以降に決定）
  targetSchoolId: string | null;       // null = 未決定
  scoutedBy: string[];                 // スカウト済み高校ID
}

/** 中学時代の成績 */
export interface MiddleSchoolRecord {
  bestResult: 'national' | 'regional' | 'prefectural' | 'district' | 'none';
  position: Position;
  notableAchievements: string[];       // "県大会MVP", "軟式ベスト4" 等
  reputation: number;                  // 中学生としての知名度 0-100
}

/** 中学生の年間生成ルール */
export const MIDDLE_SCHOOL_CONSTANTS = {
  /** 1学年あたりの中学生数（都道府県内） */
  PLAYERS_PER_GRADE: 180,
  
  /** うちスカウト対象になりうるレベルの人数 */
  NOTABLE_PER_GRADE: 30,
  
  /** 天才級の出現率 */
  GENIUS_RATE: 0.02,
  
  /** 中学生の初期能力平均（中1入学時） */
  INITIAL_STAT_MEAN: 10,
  
  /** 中学3年秋の能力平均 */
  GRAD_STAT_MEAN: 25,
} as const;
```

### 3.4 PersonRegistry — 全人物の生涯台帳

```typescript
/**
 * PersonRegistry は世界の全人物のライフサイクルを管理する。
 * 
 * 中学1年生として生まれた人物は、同一IDのまま:
 *   中学生 → 高校生 → 卒業生 → OB
 * と遷移していく。
 * 
 * 全てのPlayer, MiddleSchoolPlayer, GraduateRecord は
 * この台帳のIDを共有する。
 */
export interface PersonRegistry {
  /** 全人物のライフステージ */
  stages: Map<string, PersonStage>;
  
  /** 卒業生の軽量レコード */
  graduates: GraduateRecord[];
  
  /** OBのプロ成績（Phase 3.5 で本格実装） */
  proRecords: ProRecord[];
}

export type PersonStage =
  | { type: 'middle_school'; grade: 1 | 2 | 3 }
  | { type: 'high_school'; schoolId: string; grade: 1 | 2 | 3 }
  | { type: 'graduated'; year: number; path: CareerPath }
  | { type: 'pro'; team: string; yearsActive: number }
  | { type: 'retired' };
```

---

## 4. 計算粒度の3段階設計

### 4.1 3つのTier

```
┌─────────────────────────────────────────────────────────────┐
│  Tier 1: FULL (自校)                                        │
│  ─────────────────                                          │
│  対象: プレイヤーの学校（1校）                                │
│                                                              │
│  日次処理:                                                   │
│    ✅ processConditionPhase() — 全選手のMood個別判定          │
│    ✅ applyDailyGrowth() — 全選手に個別成長計算               │
│    ✅ processRandomEvents() — イベント発生判定                │
│    ✅ processEndOfDay() — 疲労回復、怪我進行、怪我判定        │
│                                                              │
│  試合: runGame() で1球単位のフルシミュレーション              │
│  成長: 1日1回、能力値ごとに個別計算                          │
│  コスト: ~50ms / 日                                          │
├─────────────────────────────────────────────────────────────┤
│  Tier 2: STANDARD (ライバル校・注目校)                       │
│  ─────────────────                                          │
│  対象: 最近対戦/注目校（3〜5校）                             │
│                                                              │
│  日次処理:                                                   │
│    ✅ バッチ成長計算（1選手あたり1回の乗算で能力更新）        │
│    ✅ コンディション簡易判定（確率テーブル1回引き）            │
│    ⬜ イベントは省略（試合関連イベントのみ発生）              │
│    ✅ 怪我・疲労の簡易更新                                   │
│                                                              │
│  試合: quickGame() で打席単位の簡易シミュレーション           │
│    → スコア + 各打者の打席結果（安打/凡退/HR等）を生成       │
│    → 個人成績が CareerRecord に反映される                    │
│  成長: 1日1回、全能力一括計算                                │
│  コスト: ~5ms / 日                                           │
├─────────────────────────────────────────────────────────────┤
│  Tier 3: MINIMAL (その他の高校)                              │
│  ─────────────────                                          │
│  対象: 残りの全高校（42〜44校）                              │
│                                                              │
│  日次処理:                                                   │
│    ✅ 週次バッチ成長（7日分を1回で計算）                     │
│    ⬜ コンディション省略（試合前のみ判定）                    │
│    ⬜ イベント省略                                           │
│    ✅ 怪我: 確率的に発生させるが、日単位ではなく週単位        │
│                                                              │
│  試合: statGame() で統計ベースの結果生成                     │
│    → チーム総合力の差 + ランダムで勝敗決定                   │
│    → スコアを統計的に生成                                    │
│    → エース投手と主要打者のみ個人成績を簡易生成              │
│  成長: 週1回、チーム全体の平均値を一括更新                    │
│  コスト: ~0.5ms / 日                                         │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 試合シミュレーションの3段階

```typescript
// === Tier 1: Full Simulation (自校の試合) ===
// 既存の runGame() をそのまま使う
// 1球単位、フルログ、UIアニメーション用データ
import { runGame } from '../match/game';

// === Tier 2: Quick Simulation (ライバル校の試合) ===
// 打席単位で結果を生成。投球の詳細は省略
export function quickGame(
  homeTeam: MatchTeam,
  awayTeam: MatchTeam,
  config: MatchConfig,
  rng: RNG,
): QuickGameResult;

export interface QuickGameResult {
  score: { home: number; away: number };
  winnerId: string;
  inningScores: { home: number[]; away: number[] };
  batterResults: QuickBatterResult[];     // 各打者の簡易打席結果
  pitcherResults: QuickPitcherResult[];   // 各投手の簡易投球結果
  mvpId: string | null;
  highlights: string[];                   // "3回裏、田中がソロ本塁打" 等
}

// === Tier 3: Stat Simulation (その他の試合) ===
// チーム総合力ベースのスコア生成。個人成績は主要選手のみ
export function statGame(
  teamA: TeamSummary,
  teamB: TeamSummary,
  rng: RNG,
): StatGameResult;

export interface StatGameResult {
  score: { home: number; away: number };
  winnerId: string;
  keyPlayers: KeyPlayerResult[];          // エース・4番など主要3-4人のみ
}

export interface TeamSummary {
  id: string;
  name: string;
  strength: number;            // チーム総合力 0-100
  aceStrength: number;         // エースの能力 0-100
  battingStrength: number;     // 打線の能力 0-100
  defenseStrength: number;     // 守備の能力 0-100
}
```

### 4.3 成長計算の3段階

```typescript
// === Tier 1: Full Growth (自校の選手) ===
// 既存の applyDailyGrowth() をそのまま使う
// 能力値ごとに個別計算、コンディション・性格特性の影響あり
import { applyDailyGrowth } from '../growth/calculate';

// === Tier 2: Batch Growth (ライバル校の選手) ===
// 1選手あたり1回の計算で全能力を一括更新
export function applyBatchGrowth(
  player: Player,
  daysElapsed: number,          // まとめて計算する日数（通常1）
  practiceEmphasis: CoachStyle['practiceEmphasis'],
  seasonMultiplier: number,
  rng: RNG,
): Player;

// 計算式:
// dailyGain = growthRate × gradeMultiplier × seasonMultiplier × 0.3
// 各能力 += dailyGain × daysElapsed × emphasisWeight × random(0.8, 1.2)
// ceilingPenalty は適用する（天井に近づくと鈍化）

// === Tier 3: Bulk Growth (その他の選手) ===
// チーム単位で週1回、全選手の平均的成長を一括適用
export function applyBulkGrowth(
  players: Player[],
  weekCount: number,            // まとめて計算する週数（通常1）
  practiceEmphasis: CoachStyle['practiceEmphasis'],
  seasonMultiplier: number,
  rng: RNG,
): Player[];

// 計算式:
// weeklyGain = growthRate × gradeMultiplier × seasonMultiplier × 2.0
// 各能力 += weeklyGain × weekCount × emphasisWeight × random(0.7, 1.3)
// 統計的に Tier 1 と同じ分布に収束するよう係数を調整
```

### 4.4 Tier の動的昇格・降格

```typescript
/** Tier を動的に更新するルール */
export function updateSimulationTiers(
  world: WorldState,
): WorldState;

// Tier 昇格条件:
// minimal → standard:
//   - 自校と大会で対戦した（直近2大会以内）
//   - 自校の次の対戦相手
//   - プレイヤーがスカウトで注目した学校
//   - 県内トップ3の強豪校
//
// standard → full:
//   - プレイヤーの学校のみ（変更不可）
//
// Tier 降格条件:
// standard → minimal:
//   - 直近2大会で対戦なし & スカウト注目リストから外れた
//   - 3年間の大会成績が下位1/3
```

---

## 5. 自校UIと世界シミュレーションの責務分離

### 5.1 レイヤー責務

```
┌──────────────────────────────────────────────────┐
│  UI Layer (Phase 4)                              │
│                                                  │
│  責務: 自校中心の情報表示 + プレイヤー操作受付    │
│                                                  │
│  ✅ 自校の選手詳細、練習メニュー設定            │
│  ✅ 試合の2D演出（自校の試合のみ）               │
│  ✅ スカウト画面（中学生の情報表示）              │
│  ✅ 大会トーナメント表（全校の結果表示）          │
│  ✅ 他校の概要（対戦成績、主要選手の名前・能力） │
│  ❌ 世界の進行ロジック                          │
│  ❌ 他校の詳細操作                               │
│                                                  │
│  データ取得: ViewState Projector 経由            │
└──────────────────┬───────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────┐
│  ViewState Projector                             │
│                                                  │
│  責務: WorldState から UI 用の断面を切り出す      │
│                                                  │
│  ✅ getPlayerSchool()                            │
│     → schools[playerSchoolId] の全詳細           │
│  ✅ getTournamentBracket()                       │
│     → 大会の全結果（全校のスコア含む）           │
│  ✅ getRivalSchoolSummary(schoolId)              │
│     → standard tier の学校の概要（主要5選手等）  │
│  ✅ getScoutCandidates()                         │
│     → 中学3年生の一覧（スカウト済みのみ詳細）   │
│  ✅ getSeasonState()                             │
│     → シーズン状態、次イベント                   │
│  ✅ getPrefectureRanking()                       │
│     → 県内全校の実力ランキング                   │
└──────────────────┬───────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────┐
│  World Simulation Layer                          │
│                                                  │
│  責務: 世界全体を1日ずつ進行させる               │
│                                                  │
│  ✅ advanceWorldDay() — 全校の日次処理            │
│  ✅ 大会の全試合実行                              │
│  ✅ 中学生の成長処理                              │
│  ✅ 年度替わり（全校一括）                        │
│  ✅ Tier の動的更新                               │
│  ✅ シード再現性の保証                            │
│                                                  │
│  入力: WorldState + PlayerActions + RNG           │
│  出力: 新しい WorldState + WorldDayResult         │
└──────────────────────────────────────────────────┘
```

### 5.2 WorldDayResult（UIへの通知）

```typescript
/** 世界の1日分の処理結果 */
export interface WorldDayResult {
  date: GameDate;
  
  // 自校の詳細結果（Phase 1 の DayResult と互換）
  playerSchoolResult: DayResult;
  
  // 自校の試合結果（大会日のみ）
  playerMatchResult: MatchResult | null;
  
  // 大会の全試合結果（UI表示用サマリ）
  tournamentResults: TournamentDayResults | null;
  
  // 世界のハイライト（ニュース形式）
  worldNews: WorldNewsItem[];
  
  // シーズンフェーズ変更
  seasonTransition: SeasonPhase | null;
}

/** 世界のニュース項目 */
export interface WorldNewsItem {
  type: 'tournament_result' | 'upset' | 'no_hitter' | 'record' | 'draft' | 'injury';
  headline: string;           // "明訓高校が4回戦で敗退。今大会の本命が消えた"
  involvedSchoolIds: string[];
  involvedPlayerIds: string[];
  importance: 'high' | 'medium' | 'low';
}
```

### 5.3 情報の可視性ルール

```typescript
/** プレイヤーが他校の情報をどこまで見えるか */
export interface InformationVisibility {
  // === 常に見える ===
  // 学校名、都道府県、今年の大会成績、直近の対戦スコア
  
  // === standard tier 以上で見える ===
  // 主要5選手の名前・ポジション・おおまかな能力ランク（S/A/B/C/D）
  // エースの球速・球種（おおまか）
  // チームの戦術傾向
  
  // === スカウトで視察すると見える ===
  // 中学生の詳細能力（ただし誤差あり）
  // 対戦相手の選手の詳細能力（ただし信頼度は低い）
  
  // === 自校のみ見える ===
  // 全選手の正確な能力値
  // ポテンシャル・成長タイプ（推定値）
  // コンディション詳細
}
```

---

## 6. ライフサイクル: 中学生→高校生→卒業生

### 6.1 全体フロー

```
年度n-3  年度n-2  年度n-1  年度n    年度n+1  年度n+2  年度n+3  年度n+4
───────  ───────  ───────  ───────  ───────  ───────  ───────  ───────
中1生成   中2       中3      高1       高2       高3      卒業     OB
│        │        │進学先   │入学     │         │引退    │        │
│ 基礎   │ 成長   │決定     │         │         │進路    │        │
│ 能力   │        │        │ 練習    │ 練習    │決定    │ プロ?  │
│ 生成   │ 中学   │ 中学   │ 試合    │ 試合    │ 試合   │ 大学?  │
│        │ 大会   │ 大会   │ 成長    │ 成長    │ 成長   │        │
└────────┴────────┴────────┴────────┴────────┴────────┴────────┘
                             ▲
                   高校入学のタイミングで
                   MiddleSchoolPlayer → Player に変換
                   （IDは同一。能力値は継続）
```

### 6.2 中学生の年間サイクル

```
4月  中学入学（中1）/ 進級（中2,3）
     └─ 中1は新規生成（180人/学年）

5月〜7月  中学の大会シーズン
          └─ MiddleSchoolRecord を更新
          └─ 有力選手が可視化される

8月〜12月  高校側のスカウト活動
           └─ 中3が対象
           └─ プレイヤーはスカウト画面で視察指示

1月〜2月  進学先決定
          └─ 中3の targetSchoolId が確定
          └─ 競合（他校スカウト）の結果

3月  中学卒業
     └─ 中3が middleSchoolPool から削除
     └─ 高校入学処理へ

4月  高校入学
     └─ MiddleSchoolPlayer → Player に変換
     └─ 各高校の team.players に追加
```

### 6.3 MiddleSchoolPlayer → Player への変換

```typescript
/**
 * 中学3年生を高校1年生の Player に変換する。
 * 
 * 重要: IDは同一。PersonRegistry 上は stage が変わるだけ。
 * 能力値は中学時代の最終値をそのまま引き継ぐ。
 * ポテンシャルも引き継ぐが、高校での環境（学校の施設レベル等）で微調整。
 */
export function convertToHighSchoolPlayer(
  ms: MiddleSchoolPlayer,
  enrollmentYear: number,
  schoolFacilities: FacilityLevel,
  rng: RNG,
): Player;

// 変換ルール:
// - id: そのまま
// - stats: そのまま（中学最終値）
// - potential: 中学時代の potential をベースに、高校施設で ceiling を微調整
//     ceiling = ms.potential.ceiling × (1.0 + facilities.overall * 0.02)
// - condition: リセット（fatigue=0, injury=null, mood='normal'）
// - careerStats: リセット（高校通算は0から）
// - mentalState: 中学時代の confidence を引き継ぎ、stress をリセット
// - traits: そのまま
```

### 6.4 年度替わりの全体フロー（WorldState レベル）

```
3月31日 → 4月1日:

Step 0: スナップショットセーブ

Step 1: 全高校の3年生 — 進路決定
  for each school in schools:
    processCareerDecisions(school.3rdYearPlayers)
    → CareerPath を確定

Step 2: 全高校の3年生 — 卒業処理
  for each school in schools:
    processGraduation(school)
    → GraduateRecord を personRegistry.graduates に追加
    → personRegistry.stages[id] = { type: 'graduated', ... }

Step 3: 全中学3年生 — 高校入学処理
  for each msPlayer in middleSchoolPool where grade === 3:
    targetSchool = msPlayer.targetSchoolId ?? autoAssignSchool(msPlayer)
    player = convertToHighSchoolPlayer(msPlayer)
    schools[targetSchool].players.push(player)
    personRegistry.stages[id] = { type: 'high_school', ... }
  
  // 中学3年生を middleSchoolPool から除去

Step 4: 中学生の進級・新規生成
  // 中1→中2, 中2→中3
  for each msPlayer in middleSchoolPool:
    msPlayer.middleSchoolGrade++
  
  // 新しい中学1年生を180人生成
  newMiddleSchoolers = generateMiddleSchoolClass(year, rng)
  middleSchoolPool.push(...newMiddleSchoolers)
  // 各新入生を personRegistry に登録

Step 5: 全高校のチーム再編成
  for each school in schools:
    school.lineup = null
    school.lineup = autoGenerateLineup(school)  // 他校はAI自動
    // 自校はプレイヤーが後で設定

Step 6: 監督実績・学校評判更新
  updateManagerStats(...)
  for each school in schools:
    school.reputation = updateReputation(school.reputation, school.yearResults)

Step 7: シーズン状態リセット
  resetSeasonState(...)

Step 8: Tier 更新
  updateSimulationTiers(...)

Step 9: スナップショットセーブ
```

### 6.5 高校への進学先決定ロジック

```typescript
/**
 * 中学3年生の進学先を決定する。
 * 
 * 決定要素:
 *   1. スカウト: プレイヤー校 or 他校がスカウト済み → 競合判定
 *   2. 学校評判: 評判の高い学校に優秀な選手が集まりやすい
 *   3. 地理的近接: 同じ県内の学校に行きやすい
 *   4. ランダム: 「思いがけない逸材が無名校に来る」余地
 */
export function assignMiddleSchoolersToHighSchools(
  msPlayers: MiddleSchoolPlayer[],  // 中学3年生全員
  schools: HighSchool[],
  rng: RNG,
): Map<string, string>;  // msPlayerId → schoolId

// 配分ルール:
// 1. スカウト済み選手: スカウトした学校に優先配分（競合時は学校評判で勝負）
// 2. 有力選手（reputation > 60）: 評判の高い学校に確率的に配分
// 3. その他: 地理的近接 + ランダムで配分
// 4. 各校に最低3人、最大18人の入部制限
```

---

## 7. DESIGN-PHASE3.md v0.1.0 からの差分サマリ

### 7.1 廃止する設計

| v0.1.0 の設計 | 理由 | 代替 |
|--------------|------|------|
| 対戦相手の使い捨て生成 (`opponent.ts: generateOpponent()`) | 全チームが永続するため不要 | `HighSchool` の `players` からMatchTeamを構築 |
| `OpponentGenConfig` による強さ指定 | 相手の実力は育成結果で決まる | 不要 |
| `quickMatchResult()` の strength ベース勝敗 | 全試合にシミュレーションが必要 | `quickGame()` / `statGame()` に置換 |
| 入学時のランダム選手生成 | 中学生プールから入学 | `convertToHighSchoolPlayer()` |

### 7.2 変更する設計

| v0.1.0 の設計 | 変更内容 |
|--------------|---------|
| `GameState` | `WorldState` に昇格。`team` が `schools[]` に |
| `Tournament.teams` as `TournamentTeam[]` | `TournamentTeam.schoolId` で `HighSchool` を参照 |
| `processYearTransition()` | 全校一括処理に拡張。中学→高校の遷移を含む |
| `processDay()` | `advanceWorldDay()` に昇格。全校の日次処理を含む |
| `bracket.ts: generateBracket()` | 変更なし（再利用可能） |
| `seeding.ts` | 変更なし（再利用可能） |

### 7.3 維持する設計

| 設計 | 理由 |
|------|------|
| `runGame()` (Phase 2 試合エンジン) | Tier 1 の試合でそのまま使用 |
| `applyDailyGrowth()` (成長計算) | Tier 1 の日次成長でそのまま使用 |
| `BracketNode` トーナメント二分木 | 大会管理に変更なし |
| `SeasonPhase` のフェーズ遷移 | 年間サイクルに変更なし |
| `WeeklyPlan` 週次練習計画 | 自校管理に変更なし |
| パフォーマンスバジェット | 調整は必要だが基本構造は同じ |

### 7.4 追加する設計

| 新規モジュール | 責務 |
|---------------|------|
| `world/world-state.ts` | WorldState の型定義 |
| `world/world-ticker.ts` | 世界の1日を進める統括関数 |
| `world/tier-manager.ts` | 計算粒度の管理と動的変更 |
| `world/view-projector.ts` | WorldState → UI 用断面の切り出し |
| `world/news-generator.ts` | 世界のニュース・ハイライト生成 |
| `middle-school/types.ts` | 中学生関連の型 |
| `middle-school/generate.ts` | 中学生の生成 |
| `middle-school/growth.ts` | 中学生の成長（簡易） |
| `middle-school/enrollment.ts` | 中学→高校の進学処理 |
| `match/quick-game.ts` | Tier 2 用の簡易試合エンジン |
| `match/stat-game.ts` | Tier 3 用の統計的試合結果生成 |
| `growth/batch-growth.ts` | Tier 2 用のバッチ成長計算 |
| `growth/bulk-growth.ts` | Tier 3 用の一括成長計算 |

---

## 8. 実装段階案

### 8.1 フェーズ分割

```
Phase 3.0: WorldState 基盤 + 全高校の日次進行           [2週間]
────────────────────────────────────────────────────

  ✅ WorldState 型定義
  ✅ 48校の HighSchool 生成（自校 + 47 AI校）
  ✅ advanceWorldDay() — 全校の日次処理
  ✅ 計算粒度3段階（full/standard/minimal）
  ✅ applyBatchGrowth(), applyBulkGrowth()
  ✅ quickGame(), statGame()
  ✅ 大会で全試合をシミュレーション
  ✅ PersonRegistry の基盤
  ✅ 年度替わり（全校一括）
  ✅ 既存225テストが全パス

  テスト完了条件:
    - 1年間フルシミュレーション: 全48校が日次進行、大会全試合実行
    - 5年間: メモリ < 50MB、パフォーマンス < 5分
    - Tier 1 の結果精度: Phase 2 と同一
    - Tier 3 の統計分布: Tier 1 と±10%以内

Phase 3.5: 中学生プール + スカウト + ドラフト             [1.5週間]
────────────────────────────────────────────────────

  ✅ MiddleSchoolPlayer の型定義と生成
  ✅ 中学生の年間成長
  ✅ 中学→高校の進学処理（convertToHighSchoolPlayer）
  ✅ 高校への配分ロジック（評判・スカウト・ランダム）
  ✅ スカウトシステム（自校が中学生を視察・追跡・勧誘）
  ✅ ドラフト（全校3年生対象の全国ドラフト）
  ✅ PersonRegistry の完全統合

  テスト完了条件:
    - 中学1年生成→3年間成長→高校入学→3年間成長→卒業の一貫フロー
    - スカウト→勧誘→入学の成功/失敗シナリオ
    - 10年間シミュレーション: 中学生の能力分布が安定

Phase 4.0: UI + OB追跡                                  [2-3週間]
────────────────────────────────────────────────────

  ✅ メイン画面（自校中心）
  ✅ 試合2D演出（Tier 1 の試合のみ）
  ✅ 大会トーナメント表（全結果表示）
  ✅ スカウト画面
  ✅ 選手詳細（自校 = 全データ、他校 = 概要のみ）
  ✅ 他校の概要画面（対戦成績、ランキング）
  ✅ 世界のニュース表示
  ✅ OB の年次成績生成
  ✅ ViewState Projector の完成
```

### 8.2 実装順序（Phase 3.0 詳細）

```
Week 1: WorldState 基盤
═══════════════════════

Step 1. world/world-state.ts                          [0.5日]
        WorldState, HighSchool, CoachStyle, SimulationTier

Step 2. 48校の初期生成ロジック                         [1日]
        自校: 既存Team → HighSchool変換
        47AI校: generateAISchool() × 47
        各校に20-25人の選手を生成

Step 3. growth/batch-growth.ts + bulk-growth.ts        [1日]
        Tier 2 / Tier 3 の成長計算
        テスト: Tier 1 との統計的等価性

Step 4. match/quick-game.ts                            [1日]
        打席単位の簡易試合
        テスト: 1000試合のスコア分布が runGame() と近似

Step 5. match/stat-game.ts                             [0.5日]
        統計ベースの試合結果生成
        テスト: 1000試合の勝率が strength 差に連動

Step 6. world/world-ticker.ts                          [1.5日]
        advanceWorldDay() — 全校の日次処理
        Tier ごとの分岐処理
        テスト: 1日分の WorldState 更新が正しい

Step 7. world/tier-manager.ts                          [0.5日]
        Tier の動的昇格/降格
        テスト: 対戦後に standard に昇格

Week 2: 大会 + 年度替わり
═══════════════════════

Step 8. tournament/ の WorldState 対応                  [1日]
        TournamentTeam.schoolId で HighSchool 参照
        全試合を Tier 別に実行
        テスト: 大会完走

Step 9. 年度替わり（全校一括）                         [1.5日]
        全校の卒業・入学処理
        入学は仮のランダム生成（Phase 3.5 で中学生プールに置換）
        PersonRegistry の更新
        テスト: 5年間通し

Step 10. PersonRegistry                                [1日]
         stages の管理
         graduates の全校統合
         テスト: ID一貫性

Step 11. world/view-projector.ts                       [0.5日]
         getPlayerSchool(), getTournamentBracket() etc.
         テスト: 断面切り出しの正確性

Step 12. world/news-generator.ts                       [0.5日]
         番狂わせ、ノーヒッター等の自動検出
         テスト: ニュース生成

Step 13. save/serializer.ts の WorldState 対応          [0.5日]
         マイグレーション + 新フィールド
         テスト: セーブ/ロード往復

Step 14. 統合テスト + パフォーマンスチューニング         [1日]
         1年/5年/20年シミュレーション
         メモリプロファイリング
         既存225テスト全パス確認
```

### 8.3 マイルストーン

| マイルストーン | 完了条件 | Phase |
|-------------|---------|-------|
| **M1: 48校が息づく** | 48校全てが日次成長し、能力値が変動する | 3.0 |
| **M2: 全試合が回る** | 大会の全試合が Tier 別にシミュレーションされる | 3.0 |
| **M3: 世代が回る** | 全校の卒業・入学が一括で処理され、5年間通しが動く | 3.0 |
| **M4: 中学生が生まれる** | 中学1年から高校入学までの一貫フロー | 3.5 |
| **M5: スカウトが機能する** | 視察→追跡→勧誘→入学の完全フロー | 3.5 |
| **M6: ドラフトが開催される** | 全国の3年生対象のドラフト判定 | 3.5 |

---

## 9. パフォーマンス設計

### 9.1 1日分の処理コスト見積り

| 処理 | Tier 1 (1校) | Tier 2 (4校) | Tier 3 (43校) | 合計 |
|------|-------------|-------------|--------------|------|
| 成長計算 | 50ms | 4×5ms=20ms | 43×0.5ms≈22ms | 92ms |
| コンディション | 5ms | 4×1ms=4ms | 省略 | 9ms |
| イベント | 5ms | 省略 | 省略 | 5ms |
| 疲労/怪我 | 3ms | 4×1ms=4ms | 43×0.1ms≈4ms | 11ms |
| **通常日合計** | **63ms** | **28ms** | **26ms** | **~120ms** |

| 処理 | 大会日追加コスト |
|------|----------------|
| Tier 1 試合 (runGame) | 500ms × 1 = 500ms |
| Tier 2 試合 (quickGame) | 50ms × 2 = 100ms |
| Tier 3 試合 (statGame) | 2ms × 21 = 42ms |
| **大会日合計** | **~760ms** |

### 9.2 年間パフォーマンス見積り

| 期間 | 通常日数 | 大会日数 | 合計処理時間 |
|------|---------|---------|------------|
| 1年 | 340日 | 25日 | 340×120ms + 25×760ms ≈ **60秒** |
| 5年 | 1700日 | 125日 | **~5分** |
| 20年 | 6800日 | 500日 | **~20分** |

### 9.3 メモリ使用量見積り

| データ | サイズ | 備考 |
|--------|-------|------|
| 高校48校 × 25選手 = 1200人 | ~2.4MB | Player 1人 ≈ 2KB |
| 中学生600人 | ~0.6MB | MiddleSchoolPlayer 1人 ≈ 1KB |
| PersonRegistry (5年分) | ~1MB | 卒業生: 250人/年 × 5年 |
| 大会データ (当年) | ~0.5MB | トーナメント表 + 結果 |
| **常駐合計** | **~5MB** | |
| セーブデータ (5年) | ~3MB | JSON圧縮前 |
| セーブデータ (20年) | ~10MB | JSON圧縮前 |

### 9.4 パフォーマンス最適化戦略

```typescript
// === 最適化1: Tier 3 の週次バッチ処理 ===
// Tier 3 の学校は毎日処理しない。7日ごとにまとめて計算。
// 大会日のみ個別に処理。

// === 最適化2: 選手データの遅延ロード ===
// Tier 3 の学校の選手詳細は、大会で対戦する時のみメモリに展開。
// 通常はTeamSummary（総合力のみ）で保持。

export interface HighSchool {
  // ...
  // Tier 3 の最適化: players を遅延ロード
  _playersLoaded: boolean;
  _playersSummary: TeamSummary;      // 常に保持
  players: Player[];                  // Tier 3 では遅延ロード
}

// === 最適化3: 卒業生の段階的アーカイブ ===
// 5年以上前の卒業生は軽量サマリに圧縮。
// プロ入りした卒業生のみ詳細を保持。

// === 最適化4: 並列処理（将来） ===
// Tier 2/3 の処理は独立しているため、Web Worker で並列化可能。
// Phase 4 のUI応答性向上に有効。
```

---

## 10. データモデル詳細

### 10.1 WorldState 完全型定義

```typescript
export interface WorldState {
  // === メタ ===
  version: string;                     // "0.3.0"
  seed: string;
  currentDate: GameDate;
  
  // === プレイヤー ===
  playerSchoolId: string;
  manager: Manager;
  settings: GameSettings;
  weeklyPlan: WeeklyPlan;
  
  // === 世界の実体 ===
  prefecture: string;                  // 舞台の都道府県
  schools: HighSchool[];               // 全高校（48校）
  middleSchoolPool: MiddleSchoolPlayer[];
  personRegistry: PersonRegistry;
  
  // === 大会 ===
  activeTournaments: Tournament[];
  completedTournaments: TournamentSummary[];
  tournamentHistory: TournamentHistoryEntry[];
  
  // === 年間進行 ===
  seasonState: SeasonState;
  
  // === 累積 ===
  draftHistory: DraftHistoryEntry[];
  
  // === パフォーマンス用キャッシュ ===
  _schoolSummaries: Map<string, TeamSummary>;  // 再計算を避けるキャッシュ
  _tierAssignments: Map<string, SimulationTier>;
}
```

### 10.2 HighSchool と既存 Team の関係

```typescript
// HighSchool は Team を包含する上位概念
// 既存の team/ モジュールの関数はそのまま使える

export interface HighSchool {
  // === Team と同じフィールド（互換） ===
  id: string;
  name: string;
  prefecture: string;
  reputation: number;
  players: Player[];
  lineup: Lineup | null;
  facilities: FacilityLevel;
  
  // === HighSchool 固有 ===
  simulationTier: SimulationTier;
  coachStyle: CoachStyle;
  yearResults: YearResults;
  
  // === パフォーマンス用 ===
  _summary: TeamSummary | null;        // キャッシュ（invalidateで null に）
}

// 既存の team/ 関数との互換:
// addPlayer(school as Team, player) → OK（型互換）
// autoGenerateLineup(school as Team) → OK
// processGraduation(school as Team, year) → OK
```

### 10.3 TournamentSummary（大会の軽量記録）

```typescript
/** 完了した大会の軽量サマリ（セーブデータ節約用） */
export interface TournamentSummary {
  id: string;
  type: TournamentType;
  year: number;
  winnerId: string;
  winnerName: string;
  runnerUpId: string;
  runnerUpName: string;
  playerSchoolResult: {
    bestRound: number;         // 最高到達ラウンド
    wins: number;
    losses: number;
  };
  // 全試合結果は保持しない（セーブデータ節約）
  // 必要なら再シミュレーションで復元可能（シード再現性）
}
```

### 10.4 AI学校の生成

```typescript
/**
 * 47校のAI学校を生成する。
 * 
 * 学校の強さ分布（都道府県内48校）:
 *   強豪: 4校   (reputation 70-90)
 *   中堅: 12校  (reputation 45-70)
 *   普通: 20校  (reputation 25-45)
 *   弱小: 12校  (reputation 10-25)
 * 
 * 自校の reputation は NewGameConfig で決定済み。
 * 残り47校を上記分布で生成。
 */
export function generatePrefectureSchools(
  playerSchool: HighSchool,
  prefecture: string,
  year: number,
  rng: RNG,
): HighSchool[];
```

---

## 11. テスト戦略

### 11.1 Tier 等価性テスト

**最重要テスト:** 3つの Tier で、十分な試行回数における統計的分布が等価であること。

```typescript
describe('Tier equivalence', () => {
  it('Tier 2 growth produces same distribution as Tier 1', () => {
    // 同一選手を Tier 1 と Tier 2 でそれぞれ 365日成長させる
    // 最終能力値の平均・標準偏差が ±10% 以内
  });
  
  it('Tier 3 growth produces same distribution as Tier 1', () => {
    // 同一選手を Tier 1 と Tier 3 でそれぞれ 365日成長させる
    // 最終能力値の平均・標準偏差が ±15% 以内
  });
  
  it('quickGame produces similar score distribution as runGame', () => {
    // 同じチーム構成で 1000 試合ずつ実行
    // 平均得点、勝率の差が ±5% 以内
  });
  
  it('statGame produces similar win rates as runGame', () => {
    // strength 差ごとの勝率が ±10% 以内
  });
});
```

### 11.2 ライフサイクル一貫性テスト

```typescript
describe('Person lifecycle', () => {
  it('middle school student → high school → graduate preserves ID', () => {
    // 中学1年で生成→中3で高校入学→高3で卒業
    // 全ての段階で同一IDが追跡可能
  });
  
  it('middle school growth is continuous with high school', () => {
    // 中3最終能力値 === 高1初期能力値
    // ポテンシャルが引き継がれる
  });
  
  it('20 years produces stable population', () => {
    // 20年間シミュレーション
    // 各高校の部員数が 15-30人 の範囲を維持
    // 中学生プールが 400-700人 の範囲を維持
  });
});
```

### 11.3 WorldState 統合テスト

```typescript
describe('World simulation', () => {
  it('1 year full cycle completes without error', () => {
    // 365 × advanceWorldDay()
    // 夏の大会 + 秋の大会が完走
    // 年度替わりが成功
  });
  
  it('5 years within performance budget', () => {
    // 5年間 < 5分
    // メモリ < 50MB
    // セーブデータ < 5MB
  });
  
  it('all tournament matches are played', () => {
    // 夏の大会: 47試合（48チーム）
    // 全試合にスコアが存在
  });
  
  it('seed reproducibility', () => {
    // 同一シードで2回実行
    // 全ての結果が完全一致
  });
});
```

---

## 付録A: 既存 Phase 2 テストへの影響

**Phase 2 の225テストは全て維持される。**

変更方針:
1. `GameState` → `WorldState` への変換は `world/` レイヤーが担当
2. `match/game.ts: runGame()` は一切変更しない
3. `growth/calculate.ts: applyDailyGrowth()` は一切変更しない
4. 新規の `quickGame()`, `statGame()` は `match/` に追加するが、既存関数には触れない
5. 新規の `applyBatchGrowth()`, `applyBulkGrowth()` は `growth/` に追加するが、既存関数には触れない

## 付録B: 学校名辞書（高校）

48校分の高校名を自動生成するための辞書:

```typescript
const SCHOOL_NAME_PREFIXES = [
  '桜', '青葉', '双葉', '朝日', '明星', '光', '翠', '白山',
  '北', '南', '東', '西', '中央', '第一', '第二', '第三',
  '城', '山', '川', '海', '港', '丘', '谷', '森',
];

const SCHOOL_NAME_SUFFIXES = [
  '丘', '台', '野', '原', '崎', '浜', '橋', '里',
  '学園', '学院', '工業', '商業', '農林', '総合',
];

// 例: "桜丘高校", "青葉台高校", "明星学園", "北野高校"
```

## 付録C: 将来拡張 — 複数都道府県

Phase 3 は **1都道府県** を対象とする。
将来の拡張で全国対応する場合:

```
Phase 3: 1都道府県（48校、~1200人）
Phase X: 全国対応
  → 47都道府県 × 48校 ≈ 2,256校
  → 選手数: ~56,400人
  → 戦略: 自県以外は Tier 4（チームSummaryのみ保持、選手データなし）
  → 甲子園時のみ他県の選手を動的生成
```

---

> **次のステップ**:  
> 1. このアーキテクチャ案のレビュー  
> 2. 合意後、DESIGN-PHASE3.md を v0.2.0 で上書き更新  
> 3. Phase 3.0 Step 1 から実装開始
