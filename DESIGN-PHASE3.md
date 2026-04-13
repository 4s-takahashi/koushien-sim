# Phase 3: 年間サイクル管理 — 詳細設計書

> バージョン: 0.1.0  
> 作成日: 2026-04-13  
> 前提文書: [SPEC-MVP.md](./SPEC-MVP.md) / [DESIGN-PHASE1.md](./DESIGN-PHASE1.md) / [DESIGN-PHASE2.md](./DESIGN-PHASE2.md)  
> 前提コード: Phase 1 + Phase 2 実装済み（225テスト全パス）  
> ステータス: 設計レビュー中

---

## 目次

1. [概要](#1-概要)
2. [既存資産との接続マップ](#2-既存資産との接続マップ)
3. [モジュール一覧](#3-モジュール一覧)
4. [日次進行・週次進行・大会進行の責務分離](#4-日次進行週次進行大会進行の責務分離)
5. [練習システムと試合エンジンの接続](#5-練習システムと試合エンジンの接続)
6. [トーナメント生成](#6-トーナメント生成)
7. [年度替わり処理](#7-年度替わり処理)
8. [成長反映の順序](#8-成長反映の順序)
9. [ドラフト・進路・スカウトの接続ポイント](#9-ドラフト進路スカウトの接続ポイント)
10. [Phase 4 UI へ渡すための状態設計](#10-phase-4-ui-へ渡すための状態設計)
11. [データフロー](#11-データフロー)
12. [テスト観点](#12-テスト観点)
13. [MVPで省略するもの](#13-mvpで省略するもの)
14. [実装順序](#14-実装順序)
15. [ディレクトリ構成](#15-ディレクトリ構成)

---

## 1. 概要

### 1.1 Phase 3 の目的

Phase 3 は **Phase 1（データモデル＋日次進行）と Phase 2（試合エンジン）を年間ゲームループで結合** する。

Phase 3 完了時に以下が動作する：

- 4月1日から翌3月31日まで、1年間のゲームサイクルが完走する
- 大会期間に入ると、自チームの試合がPhase 2エンジンで自動シミュレーションされる
- 夏の地方大会→甲子園、秋季大会のトーナメントが生成・進行する
- 年度替わりで安全に卒業→入学→チーム再編が行われる
- 5年間通しでプレイしても、データ整合性・パフォーマンスが維持される
- 練習→成長→試合→成長のフィードバックループが成立する

### 1.2 設計方針

| 方針 | 説明 |
|------|------|
| **Phase 1/2 を壊さない** | 既存55ファイル・225テストに破壊的変更を加えない。新モジュールは追加のみ。既存型への拡張は後方互換で行う |
| **calendar/growth/match/team の責務明確化** | calendar = 日程・イベント判定、growth = 成長計算、match = 試合シミュレーション、team = 編成・人事。新モジュール tournament = 大会進行・組み合わせ |
| **日付進行と大会進行の整合** | `day-processor` が大会日を検知 → `tournament-runner` に委譲 → 結果を受け取って日付進行を再開。大会日に日付が止まる仕組みは作らない |
| **年度替わりの安全設計** | 卒業→入学の処理を原子的に実行。中間状態でのセーブ/クラッシュに対応するトランザクション設計 |
| **純関数維持** | Phase 1/2同様、全関数はRNGシード注入。同一入力→同一出力 |

### 1.3 Phase 1/2 からの接続点

| 既存の資産 | Phase 3 での使用 |
|-----------|------------------|
| `processDay()` (day-processor.ts) | 拡張: 大会日は `tournament-runner` に委譲 |
| `runGame()` (match/game.ts) | 大会の各試合で呼び出す |
| `MatchConfig`, `MatchTeam` (match/types.ts) | 大会用の対戦カードから生成 |
| `processYearTransition()` (team/enrollment.ts) | 拡張: 進路決定・スカウト結果を統合 |
| `GameState` (types/game-state.ts) | 拡張: `tournaments`, `seasonState` フィールドを追加 |
| `CareerRecord` (types/player.ts) | 試合結果を反映 |
| `MATCH_CONSTANTS` (match/constants.ts) | 大会別の定数オーバーライド |
| `autoGenerateLineup()` (team/lineup.ts) | 対戦相手の自動生成ラインナップ |

---

## 2. 既存資産との接続マップ

### 2.1 モジュール境界図

```
Phase 1 (既存)                Phase 3 (新規)                Phase 2 (既存)
═══════════════               ═══════════════               ═══════════════

calendar/                     season/ ←── NEW
├─ game-calendar.ts           ├─ season-manager.ts ──────► match/game.ts
├─ schedule.ts ◄────────────── ├─ season-state.ts           ├─ runGame()
├─ day-processor.ts ◄──拡張──  └─ constants.ts              ├─ MatchConfig
│                                                           └─ MatchResult
growth/                       tournament/ ←── NEW
├─ calculate.ts ◄──拡張──     ├─ bracket.ts
├─ condition.ts               ├─ runner.ts ────────────────► match/game.ts
├─ practice.ts ◄──拡張──      ├─ opponent.ts
└─ constants.ts               ├─ seeding.ts
                              └─ types.ts
team/
├─ roster.ts                  career/ ←── NEW (Phase 3.5)
├─ lineup.ts                  ├─ draft.ts
├─ enrollment.ts ◄──拡張──    ├─ career-path.ts
│                             └─ scout.ts (stub)
types/
├─ game-state.ts ◄──拡張──
├─ calendar.ts ◄──拡張──
├─ player.ts ◄──拡張──
└─ team.ts
```

### 2.2 変更方針

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `types/game-state.ts` | **フィールド追加** | `tournaments`, `seasonState` を追加。既存フィールドは不変 |
| `types/calendar.ts` | **型追加** | `TournamentSchedule`, `SeasonPhase` を追加。既存型は不変 |
| `types/player.ts` | **フィールド追加** | `CareerRecord` に `tournamentStats` を追加（任意フィールド） |
| `calendar/day-processor.ts` | **分岐追加** | `tournament_day` の処理を `season-manager` に委譲 |
| `calendar/schedule.ts` | **拡張** | 大会日程の詳細化（日単位） |
| `growth/calculate.ts` | **関数追加** | `applyMatchGrowth()` — 試合経験による成長 |
| `team/enrollment.ts` | **拡張** | `processYearTransition` にスカウト結果・進路決定を統合 |
| **新規ファイル** | 全て新規追加 | `season/`, `tournament/`, `career/` ディレクトリ |

---

## 3. モジュール一覧

### 3.1 新規モジュール

```
src/engine/
├── season/                      # 年間サイクル管理（NEW）
│   ├── season-manager.ts        # 年間進行の統括。大会・練習・イベントを日次進行に組み込む
│   ├── season-state.ts          # シーズン状態の型定義と初期化
│   ├── practice-scheduler.ts    # 週次練習計画（自動メニュー決定）
│   └── constants.ts             # シーズン関連定数
│
├── tournament/                  # 大会・トーナメント（NEW）
│   ├── types.ts                 # 大会関連の全型定義
│   ├── bracket.ts               # トーナメント表の生成アルゴリズム
│   ├── seeding.ts               # シード決定・組み合わせ抽選
│   ├── opponent.ts              # 対戦相手の自動生成
│   ├── runner.ts                # 大会進行の管理（1試合ずつ実行）
│   ├── koshien.ts               # 甲子園固有ロジック（出場判定・対戦カード）
│   └── constants.ts             # 大会関連定数
│
├── career/                      # 進路・ドラフト（NEW / Phase 3.5 で本格実装）
│   ├── types.ts                 # 進路関連の型定義
│   ├── draft.ts                 # ドラフト判定（スタブ）
│   ├── career-path.ts           # 進路決定ロジック（スタブ）
│   └── scout.ts                 # スカウトシステム（スタブ）
│
└── event/                       # イベントシステム（NEW / Phase 3 最小版）
    ├── types.ts                 # イベント関連型
    ├── event-generator.ts       # イベント発生判定
    └── event-effects.ts         # イベント効果の適用
```

### 3.2 全体依存関係

```
core ──────────────────────────────────────────────────────┐
types ─────────────────────────────────────────────────────┤
                                                           │
player/ ←──────────────────────────────────────────────────┤
growth/ ←──────────────────────────────────────────────────┤
calendar/ ←────────────────────────────────────────────────┤
team/ ←────────────────────────────────────────────────────┤
match/ ←───────────────────────────────────────────────────┤
                                                           │
tournament/                                                │
├── types.ts ←── types/, match/types                       │
├── bracket.ts ←── core/rng, types                         │
├── seeding.ts ←── core/rng, types                         │
├── opponent.ts ←── player/generate, team/lineup, match/   │
├── runner.ts ←── match/game, tournament/*, growth/calc    │
├── koshien.ts ←── tournament/*                            │
└── constants.ts ←── (pure data)                           │
                                                           │
season/                                                    │
├── season-state.ts ←── types, tournament/types            │
├── season-manager.ts ←── calendar/day-processor,          │
│                         tournament/runner,                │
│                         growth/, match/                   │
├── practice-scheduler.ts ←── growth/practice, types       │
└── constants.ts ←── (pure data)                           │
                                                           │
career/ (stubs)                                            │
├── types.ts ←── types/player                              │
├── draft.ts ←── core/rng, types                           │
├── career-path.ts ←── core/rng, types                     │
└── scout.ts ←── core/rng, player/generate                 │
                                                           │
event/                                                     │
├── types.ts ←── types/calendar                            │
├── event-generator.ts ←── core/rng, types                 │
└── event-effects.ts ←── types                             │
```

**依存の原則（Phase 1/2 を継承）:**
- `tournament/` は `match/` を参照するが、`match/` は `tournament/` を参照しない
- `season/` は `tournament/`, `calendar/`, `growth/` を参照するが、逆方向の参照なし
- `career/` は `types/` のみ参照（Phase 3 ではスタブ）
- `event/` は `types/` のみ参照
- 循環依存は禁止

---

## 4. 日次進行・週次進行・大会進行の責務分離

### 4.1 責務の定義

| レイヤー | 責務 | 実行単位 | 所管モジュール |
|---------|------|---------|--------------|
| **日次進行** | コンディション → 練習/試合 → イベント → 日終了 | 1日 | `calendar/day-processor.ts` |
| **週次進行** | 練習メニューの自動ローテーション、体力回復サイクル | 7日 | `season/practice-scheduler.ts` |
| **大会進行** | トーナメント表の進行、試合実行、勝敗記録 | 1試合（大会日に発火） | `tournament/runner.ts` |
| **年間進行** | 大会スケジュール、年度替わり、シーズンフェーズ管理 | 1年 | `season/season-manager.ts` |

### 4.2 日次進行の拡張（day-processor.ts の変更）

**現在の `processDay()` のフロー:**
```
1. 朝: processConditionPhase()
2. 練習: processPracticePhase() / processSimplePracticeMatch()
3. イベント: processRandomEvents()
4. 日終了: processEndOfDay()
5. 日付進行: advanceDate()
6. 年度替わり判定
```

**Phase 3 後のフロー:**
```
1. 朝: processConditionPhase()                      ← 変更なし
2. 活動フェーズ:
   ├─ 練習日: processPracticePhase()                ← 変更なし
   ├─ 大会日: processTournamentDay()                ← NEW（season-manager経由）
   │   ├─ 自チームの試合があるか判定
   │   ├─ あり → runGame() で試合実行 → 結果を反映
   │   └─ なし → 他チームの試合結果を進行（トーナメント表更新のみ）
   ├─ オフ日: applyRestToAll()                      ← 変更なし
   └─ 式典日: processSimplePractice()               ← 変更なし
3. イベント: processRandomEvents()                   ← event/ に委譲
4. 日終了: processEndOfDay()                         ← 変更なし
5. 日付進行: advanceDate()                           ← 変更なし
6. 年度替わり判定                                    ← 拡張（career/ 統合）
```

### 4.3 大会日と通常日の接続

```typescript
/** 既存の processDay を拡張する最小限の変更 */

// day-processor.ts 内の既存 tournament_day 分岐を変更:

// BEFORE (Phase 1):
// } else if (dayType === 'tournament_day') {
//   players = processSimplePracticeMatch(players, rng);
//   practiceApplied = null;
// }

// AFTER (Phase 3):
// } else if (dayType === 'tournament_day') {
//   const tournamentResult = processTournamentDay(state, rng);
//   players = tournamentResult.updatedPlayers;
//   matchResult = tournamentResult.matchResult;  // null if no game for us today
//   practiceApplied = null;
// }
```

**`processTournamentDay()` の責務（season-manager.ts）:**

```typescript
export interface TournamentDayResult {
  updatedPlayers: Player[];
  matchResult: MatchResult | null;      // 自チームの試合結果（なければnull）
  tournamentUpdates: TournamentUpdate[];  // トーナメント表の更新
  events: GameEvent[];                   // 試合関連イベント
}

export function processTournamentDay(
  state: GameState,
  rng: RNG,
): TournamentDayResult;
```

### 4.4 週次進行（practice-scheduler.ts）

プレイヤーが毎日手動でメニューを選ぶのはテンポが悪い。
**週次練習計画**で7日分のメニューを事前設定できるようにする。

```typescript
/** 1週間の練習計画 */
export interface WeeklyPlan {
  monday: PracticeMenuId;
  tuesday: PracticeMenuId;
  wednesday: PracticeMenuId;
  thursday: PracticeMenuId;
  friday: PracticeMenuId;
  saturday: PracticeMenuId;
  sunday: PracticeMenuId;
}

/** デフォルトの週次計画を生成 */
export function createDefaultWeeklyPlan(
  teamStrengths: 'batting' | 'pitching' | 'balanced',
): WeeklyPlan;

/** 日付から当日の練習メニューを取得 */
export function getScheduledMenu(
  plan: WeeklyPlan,
  date: GameDate,
): PracticeMenuId;
```

**デフォルト計画例（balanced）:**
```
月: batting_basic   → 打撃基礎
火: pitching_basic  → 投球基礎  
水: fielding_drill  → 守備練習
木: batting_live    → 実戦打撃
金: running         → 走り込み
土: strength        → 筋トレ
日: rest            → 休養
```

---

## 5. 練習システムと試合エンジンの接続

### 5.1 接続ポイント

```
┌─────────────┐       ┌──────────────┐       ┌─────────────┐
│  growth/     │       │  season/     │       │  match/     │
│  calculate   │◄──────│  season-mgr  │──────►│  game.ts    │
│              │       │              │       │  runGame()  │
│ applyDaily   │       │ processTDay  │       │             │
│ Growth()     │       │              │       │ MatchResult │
│              │       │              │       │             │
│ applyMatch   │◄──────│              │◄──────│             │
│ Growth() NEW │  結果  │              │  結果  │             │
└─────────────┘       └──────────────┘       └─────────────┘
```

### 5.2 試合経験による成長（新規関数）

```typescript
// growth/calculate.ts に追加

/**
 * 試合結果から選手の成長を適用する。
 * 試合は練習の MATCH_GROWTH_MULTIPLIER 倍の成長効果がある。
 * 
 * @param player - 対象選手
 * @param matchStats - この試合での個人成績
 * @param matchContext - 大会種別（甲子園ならさらにボーナス）
 * @param rng - 乱数生成器
 */
export function applyMatchGrowth(
  player: Player,
  matchStats: MatchPlayerPerformance,
  matchContext: MatchGrowthContext,
  rng: RNG,
): Player;

export interface MatchPlayerPerformance {
  atBats: number;
  hits: number;
  homeRuns: number;
  rbis: number;
  inningsPitched: number;  // 1/3回単位
  strikeouts: number;
  earnedRuns: number;
  defensivePlays: number;  // 守備機会
  clutchSituations: number; // 得点圏打席数
}

export interface MatchGrowthContext {
  tournamentType: 'practice' | 'regional' | 'prefectural' | 'koshien';
  isWin: boolean;
  isCloseGame: boolean;       // 3点差以内
  isElimination: boolean;     // トーナメント（負けたら終わり）
}
```

**試合成長の計算式:**

```
基本成長 = 各能力の baseGain × MATCH_GROWTH_MULTIPLIER (2.0)

追加補正:
  甲子園: ×3.0（最大成長）
  県大会: ×2.0
  地区大会: ×1.5
  練習試合: ×1.0
  
  勝利: 精神 +2〜5
  敗北(接戦): 精神 +1〜3, 闘志系特性持ちはさらに+2
  敗北(大差): 精神 -1〜2
  
  打席数に応じて打撃経験値（atBats × 0.3）
  投球回数に応じて投球経験値（inningsPitched × 0.5）
  得点圏打席はボーナス ×1.5
```

### 5.3 CareerRecord への反映

```typescript
// match/result.ts の collectBatterStats / collectPitcherStats の結果を
// player.careerStats に加算する

/** 既存の CareerRecord にこの試合分を追加 */
export function addMatchToCareer(
  career: CareerRecord,
  batterStats: MatchBatterStat | null,
  pitcherStats: MatchPitcherStat | null,
): CareerRecord;
```

**呼び出しタイミング:** `season-manager.ts` の `processTournamentDay()` 内で試合完了後に実行。

### 5.4 練習メニュー拡張（Phase 3 追加分）

| メニュー | 対象能力 | baseGain | 疲労 | 追加条件 |
|----------|---------|----------|------|---------|
| 紅白戦 (scrimmage) | 全能力+0.1, 試合経験 | — | 12 | 最低18人必要 |
| 実戦形式ノック (live_fielding) | fielding+0.3, armStrength+0.2, focus+0.1 | — | 8 | — |
| 変化球練習 (breaking_ball) | 対象球種+0.3 | — | 7 | 投手のみ効果 |
| 走塁練習 (baserunning) | speed+0.2, 走塁判断+0.2 | — | 6 | — |
| 合宿特別練習 (camp_special) | 全能力+0.2 | — | 15 | 合宿期間のみ |

```typescript
// types/calendar.ts に追加
export type PracticeMenuId =
  | 'batting_basic' | 'batting_live'
  | 'pitching_basic' | 'pitching_bullpen'
  | 'fielding_drill' | 'running' | 'strength' | 'mental' | 'rest'
  // Phase 3 追加
  | 'scrimmage'
  | 'live_fielding'
  | 'breaking_ball'
  | 'baserunning'
  | 'camp_special';
```

---

## 6. トーナメント生成

### 6.1 型定義（tournament/types.ts）

```typescript
import type { RNG } from '../core/rng';
import type { Player, Position } from '../types/player';
import type { MatchResult } from '../match/types';
import type { GameDate } from '../types/calendar';

/** 大会種別 */
export type TournamentType =
  | 'summer_regional'      // 夏の地方大会（都道府県予選）
  | 'summer_koshien'       // 夏の甲子園
  | 'autumn_regional'      // 秋季地区大会
  | 'autumn_prefectural';  // 秋季都道府県大会

/** 大会全体の状態 */
export interface Tournament {
  id: string;
  type: TournamentType;
  name: string;                      // 例: "第108回全国高等学校野球選手権 新潟大会"
  year: number;                      // ゲーム内年度
  
  teams: TournamentTeam[];           // 参加チーム一覧
  bracket: BracketNode;              // トーナメント表（二分木）
  
  schedule: TournamentScheduleEntry[];  // 日程（日単位）
  currentRound: number;              // 現在のラウンド（0-indexed）
  
  status: 'upcoming' | 'in_progress' | 'completed';
  results: TournamentMatchResult[];  // 完了した試合の結果
  
  playerTeamId: string;              // プレイヤーのチームID
  playerEliminated: boolean;         // プレイヤーが敗退したか
  winner: string | null;             // 優勝チームID
}

/** 大会参加チーム */
export interface TournamentTeam {
  id: string;
  name: string;                      // 学校名
  prefecture: string;
  seed: number | null;               // シード番号（なしはnull）
  strength: number;                  // チーム総合力 0-100（対戦相手生成用）
  isPlayerTeam: boolean;             // プレイヤーのチームか
}

/** トーナメント表のノード（二分木） */
export interface BracketNode {
  matchId: string;
  round: number;                     // ラウンド番号（0=1回戦）
  teamA: string | null;              // チームID（未確定ならnull = BYE or 前ラウンド未消化）
  teamB: string | null;
  winner: string | null;             // 勝者チームID（未消化ならnull）
  result: MatchResult | null;        // 試合結果
  scheduledDate: GameDate | null;    // 予定日
  children: [BracketNode | null, BracketNode | null];  // 下位ラウンドのノード
}

/** 大会日程エントリ */
export interface TournamentScheduleEntry {
  date: GameDate;
  round: number;
  matchIds: string[];                // この日に行われる試合ID
  venue: string;                     // 会場名
}

/** 大会試合結果 */
export interface TournamentMatchResult {
  matchId: string;
  round: number;
  teamAId: string;
  teamBId: string;
  winnerId: string;
  score: { home: number; away: number };
  date: GameDate;
  isPlayerGame: boolean;             // プレイヤーのチームの試合か
  matchResult: MatchResult | null;   // フル試合データ（プレイヤーの試合のみ保持）
}

/** 対戦相手の生成設定 */
export interface OpponentGenConfig {
  strength: number;              // チーム総合力 0-100
  prefecture: string;
  schoolName: string;
  tournamentType: TournamentType;
  round: number;                 // ラウンド（上位ほど強い相手を生成）
}
```

### 6.2 トーナメント表の生成（bracket.ts）

```typescript
/**
 * N チームのシングルエリミネーション・トーナメント表を生成する。
 * 
 * - チーム数が2の冪乗でない場合、BYE（不戦勝）を挿入
 * - シードチームを適切に配置（シード同士が序盤で当たらないように）
 * - ランダムな組み合わせ抽選
 * 
 * @param teams - 参加チーム一覧（シード情報含む）
 * @param rng - 乱数生成器（組み合わせ抽選用）
 * @returns ルートノード（決勝）から始まるトーナメント二分木
 */
export function generateBracket(
  teams: TournamentTeam[],
  rng: RNG,
): BracketNode;

/**
 * BYE を含むスロット数を決定する。
 * 例: 48チーム → 64スロット（16 BYE）
 */
export function calculateBracketSize(teamCount: number): number;

/**
 * シードチームをトーナメント表の対角に配置する。
 * 第1シードはブラケット上端、第2シードは下端、以降対角配置。
 */
export function placeSeedTeams(
  bracketSize: number,
  seededTeams: TournamentTeam[],
  unseededTeams: TournamentTeam[],
  rng: RNG,
): string[];  // スロット配列（teamId or 'BYE'）
```

### 6.3 対戦相手の自動生成（opponent.ts）

```typescript
import type { MatchTeam, MatchPlayer } from '../match/types';

/**
 * 対戦相手のチームを完全生成する。
 * 
 * 実際のPlayer配列は生成せず、MatchTeam / MatchPlayer を直接生成する。
 * これにより GameState に対戦相手のデータを永続化する必要がない。
 * 
 * @param config - 対戦相手の設定（強さ、学校名等）
 * @param rng - 乱数生成器
 * @returns 試合に投入可能な MatchTeam
 */
export function generateOpponent(
  config: OpponentGenConfig,
  rng: RNG,
): MatchTeam;

/**
 * トーナメントのラウンドに応じた対戦相手の強さを算出。
 * 序盤は弱く、勝ち進むほど強くなる。
 * 
 * @param baseStrength - 大会の基本強さ（地方=40, 県=60, 甲子園=80）
 * @param round - ラウンド番号
 * @param totalRounds - 全ラウンド数
 * @returns 対戦相手の strength (0-100)
 */
export function calculateRoundStrength(
  baseStrength: number,
  round: number,
  totalRounds: number,
): number;
```

**対戦相手の強さカーブ:**

```
夏の地方大会（48チーム、6ラウンド）:
  1回戦: strength 20-40 (弱い)
  2回戦: strength 30-50
  3回戦: strength 40-60
  準々決: strength 50-70
  準決勝: strength 60-80
  決勝:   strength 70-90

甲子園（49チーム、6ラウンド）:
  1回戦: strength 60-75 (全国レベル)
  2回戦: strength 65-80
  3回戦: strength 70-85
  準々決: strength 75-90
  準決勝: strength 80-95
  決勝:   strength 85-99
```

### 6.4 大会進行管理（runner.ts）

```typescript
/**
 * 大会の1日分を進行する。
 * その日に予定されている全試合を実行し、トーナメント表を更新する。
 * 
 * プレイヤーのチームの試合は Phase 2 の runGame() でフルシミュレーション。
 * それ以外のチームの試合はクイック判定（勝敗のみ）。
 */
export function advanceTournamentDay(
  tournament: Tournament,
  playerTeam: Team,
  date: GameDate,
  rng: RNG,
): TournamentDayAdvanceResult;

export interface TournamentDayAdvanceResult {
  tournament: Tournament;                  // 更新後のトーナメント
  playerMatchResult: MatchResult | null;   // プレイヤーの試合結果
  otherResults: TournamentMatchResult[];   // 他チームの試合結果
  isPlayerEliminated: boolean;             // プレイヤーが敗退したか
  isTournamentOver: boolean;               // 大会が終了したか
}

/**
 * 他チーム同士の試合をクイック判定する。
 * strength の差とランダム要素で勝敗を決定。
 * 試合のスコアも簡易生成する。
 */
export function quickMatchResult(
  teamA: TournamentTeam,
  teamB: TournamentTeam,
  rng: RNG,
): { winnerId: string; score: { home: number; away: number } };
```

### 6.5 大会定数（tournament/constants.ts）

```typescript
export const TOURNAMENT_CONSTANTS = {
  /** 夏の地方大会の参加校数 */
  SUMMER_REGIONAL_TEAMS: 48,
  /** 夏の地方大会のシード校数 */
  SUMMER_REGIONAL_SEEDS: 4,
  
  /** 秋季地区大会の参加校数 */
  AUTUMN_REGIONAL_TEAMS: 32,
  /** 秋季地区大会のシード校数 */
  AUTUMN_REGIONAL_SEEDS: 4,
  
  /** 甲子園の参加校数 */
  KOSHIEN_TEAMS: 49,
  
  /** クイック判定の strength 差→勝率テーブル */
  QUICK_WIN_RATE: {
    0: 0.50,    // 同レベル
    10: 0.60,   // やや有利
    20: 0.70,   // 有利
    30: 0.80,   // かなり有利
    40: 0.88,   // 圧倒的
    50: 0.93,   // ほぼ確定
  } as Record<number, number>,
  
  /** 大会の基本強度 */
  BASE_STRENGTH: {
    summer_regional: 40,
    summer_koshien: 80,
    autumn_regional: 35,
    autumn_prefectural: 50,
  } as Record<string, number>,
  
  /** 延長戦の最大イニング（大会モードの MatchConfig に反映） */
  MAX_EXTRAS_TOURNAMENT: 3,
  
  /** 大会ごとの日程間隔（連戦か中X日か） */
  REST_DAYS_BETWEEN_GAMES: {
    summer_regional: 0,     // 連戦あり
    summer_koshien: 1,      // 中1日
    autumn_regional: 0,
    autumn_prefectural: 0,
  } as Record<string, number>,
} as const;
```

### 6.6 甲子園出場判定（koshien.ts）

```typescript
/**
 * 夏の地方大会で優勝した場合、甲子園出場を処理する。
 * 
 * 甲子園はプレイヤーのチーム + 48校の自動生成チームで構成。
 * （複数県の代表を含む全国トーナメント）
 */
export function generateKoshienTournament(
  playerTeam: TournamentTeam,
  year: number,
  rng: RNG,
): Tournament;

/**
 * 甲子園出場チームの名前を自動生成する。
 * 都道府県名 + 学校名のパターン。
 */
export function generateKoshienTeamNames(
  count: number,
  excludePrefecture: string,  // プレイヤーの都道府県は除外
  rng: RNG,
): TournamentTeam[];
```

---

## 7. 年度替わり処理

### 7.1 安全な年度替わりの設計

年度替わりは最もデータ整合性が崩れやすいポイント。以下の順序で **原子的に** 実行する。

```
年度替わり処理フロー（3月31日→4月1日のタイミング）:

┌─────────────────────────────────────────────────┐
│ Step 0: 年度替わり前のスナップショット保存          │
│         autoSave('pre_year_transition')           │
├─────────────────────────────────────────────────┤
│ Step 1: 3年生の進路決定                           │
│         processCareerDecisions()                  │
│         → 各3年生の CareerPath を確定              │
│         → ドラフト指名判定                         │
├─────────────────────────────────────────────────┤
│ Step 2: 卒業処理                                  │
│         processGraduation()                       │
│         → 3年生を team.players から除外            │
│         → GraduateRecord に変換                    │
│         → graduates[] に追加                       │
├─────────────────────────────────────────────────┤
│ Step 3: 学年進級                                  │
│         （自動: enrollmentYear は変わらない。       │
│          学年は currentYear - enrollmentYear + 1   │
│          で動的に算出される既存設計を維持）         │
├─────────────────────────────────────────────────┤
│ Step 4: 新入生入部                                │
│         processEnrollment()                       │
│         → スカウト結果があれば反映（Phase 3.5）     │
│         → 自動入部分を生成                         │
│         → team.players に追加                      │
├─────────────────────────────────────────────────┤
│ Step 5: チーム再編成                              │
│         → lineup = null （打順リセット）            │
│         → キャプテン自動選定（2年生最高メンタル）    │
├─────────────────────────────────────────────────┤
│ Step 6: 監督実績更新                              │
│         → yearsActive++                           │
│         → fame 更新（前年度の大会成績に基づく）     │
├─────────────────────────────────────────────────┤
│ Step 7: 学校評判更新                              │
│         → reputation 更新（大会成績 + 卒業生の進路）│
├─────────────────────────────────────────────────┤
│ Step 8: シーズン状態リセット                       │
│         → 新年度のカレンダー初期化                  │
│         → 大会参加状態クリア                        │
│         → 週次練習計画リセット                      │
├─────────────────────────────────────────────────┤
│ Step 9: autoSave('post_year_transition')          │
└─────────────────────────────────────────────────┘
```

### 7.2 既存 processYearTransition の拡張

```typescript
// team/enrollment.ts の既存関数を拡張

export function processYearTransition(
  state: GameState, 
  rng: RNG,
  // Phase 3 追加パラメータ（後方互換: 省略可能）
  options?: YearTransitionOptions,
): GameState;

export interface YearTransitionOptions {
  /** スカウト結果（Phase 3.5 で実装。省略時は自動入部のみ） */
  scoutedPlayers?: Player[];
  /** 3年生の進路指定（省略時は自動決定） */
  careerDecisions?: Map<string, CareerPath>;
}
```

### 7.3 学校評判の更新ロジック

```typescript
/**
 * 前年度の実績に基づいて学校の評判を更新する。
 * 
 * 評判は新入生の質に直結するため、ゲームバランスの要。
 */
export function updateReputation(
  currentReputation: number,
  yearResults: YearResults,
): number;

export interface YearResults {
  summerBestRound: number;       // 夏の大会の最高到達ラウンド
  autumnBestRound: number;       // 秋の大会の最高到達ラウンド
  koshienAppearance: boolean;    // 甲子園出場したか
  koshienBestRound: number;      // 甲子園の最高到達ラウンド
  proPlayersDrafted: number;     // ドラフト指名された選手数
}
```

**評判変動の目安:**

| 成績 | 評判変動 |
|------|---------|
| 甲子園優勝 | +15 |
| 甲子園ベスト4 | +10 |
| 甲子園出場 | +5 |
| 県大会優勝 | +3 |
| 県大会ベスト4 | +1 |
| 県大会2回戦負け以下 | -2 |
| プロ選手1人輩出 | +3 |
| 3年間甲子園なし | 毎年-1 |

---

## 8. 成長反映の順序

### 8.1 1日の中での成長反映順序

```
朝（processConditionPhase）
│
├─ コンディション判定 → mood 確定
│   （成長計算に影響するが、ここでは成長は発生しない）
│
練習/試合（活動フェーズ）
│
├─ 練習の場合:
│   ├─ applyDailyGrowth() → 能力値更新
│   └─ applyFatigue() → 疲労加算
│
├─ 試合の場合:
│   ├─ runGame() → 試合実行（この時点の能力値で試合）
│   ├─ applyMatchGrowth() → 試合経験による能力値更新
│   ├─ addMatchToCareer() → 通算成績更新
│   └─ applyFatigue() → 試合疲労加算
│
日終了（processEndOfDay）
│
├─ recoverFatigue() → 疲労自然回復
├─ advanceInjury() → 怪我回復進行
└─ rollInjury() → 新規怪我判定
```

**重要:** 試合は **その時点の能力値** で実行される。試合後に成長が反映される。
これにより「試合で成長した能力がその試合で使われる」という矛盾を防ぐ。

### 8.2 年間での成長カーブ

```
4月 ─────── 入学/新チーム結成
│           新1年生は低能力。2年生が成長の中心
│
5月〜6月 ── 練習期間
│           日次成長: applyDailyGrowth()
│           成長率: 通常（×1.0）
│
7月 ─────── 夏の大会
│           試合成長: applyMatchGrowth() (×2.0)
│           甲子園出場時: (×3.0)
│
8月 ─────── 3年引退 → 新チーム結成
│           夏合宿: 成長率 ×1.5
│
9月〜10月 ─ 秋の大会
│           試合成長: applyMatchGrowth() (×2.0)
│
11月〜1月 ─ オフシーズン
│           基礎トレーニング中心
│           冬合宿: 成長率 ×1.5
│
2月〜3月 ── 春季練習
│           実戦形式で仕上げ
│           3年生は卒業準備
│
3月31日 ── 年度替わり
```

### 8.3 成長タイプ別の年間成長量の目安

| 成長タイプ | 1年時 | 2年時 | 3年時 | 3年間合計 |
|-----------|-------|-------|-------|----------|
| 早熟 | +15〜25 | +8〜15 | +3〜8 | +30〜45 |
| 普通 | +8〜15 | +10〜18 | +5〜12 | +28〜42 |
| 晩成 | +3〜8 | +8〜15 | +15〜25 | +30〜45 |
| 天才 | +12〜20 | +12〜20 | +8〜15 | +35〜50 |

**初期値25〜35の1年生が、3年夏に60〜80に到達する設計。**

---

## 9. ドラフト・進路・スカウトの接続ポイント

### 9.1 Phase 3 での実装範囲

Phase 3 では **インターフェースと最小限のスタブ** を実装する。
本格的なドラフト・スカウトは Phase 3.5（拡張フェーズ）で実装。

| 機能 | Phase 3 での実装 | Phase 3.5 での実装 |
|------|-----------------|-------------------|
| 進路決定 | 自動決定（能力値ベースの簡易判定） | プレイヤー推薦、進路相談イベント |
| ドラフト | 能力値 > 70 の選手に確率的指名 | ドラフト会議イベント、交渉 |
| スカウト | なし（全員自動入部） | 中学大会視察、追跡、勧誘 |
| OB追跡 | GraduateRecord に CareerPath 追加 | 年次成績生成、OBイベント |

### 9.2 型定義（career/types.ts）

```typescript
/** 卒業後の進路 */
export type CareerPath =
  | { type: 'pro'; team: string; pickRound: number }
  | { type: 'university'; school: string; hasScholarship: boolean }
  | { type: 'corporate'; company: string }
  | { type: 'retire' };

/** ドラフト結果 */
export interface DraftResult {
  playerId: string;
  playerName: string;
  team: string;             // プロ球団名
  round: number;            // 指名順位
  overallPick: number;      // 全体何番目
}

/** スカウト候補（Phase 3.5） */
export interface ScoutCandidate {
  id: string;
  player: Player;           // 仮生成された中学生
  reliability: number;      // レポート信頼度 0-100
  estimatedAbility: 'S' | 'A' | 'B' | 'C' | 'D';
  competingSchools: string[];
  isTracked: boolean;
}
```

### 9.3 スタブ実装（career/draft.ts）

```typescript
/**
 * Phase 3 スタブ: 3年生の進路を自動決定する。
 * 
 * 判定ロジック（簡易版）:
 *   overall >= 75 → 20% でプロ指名
 *   overall >= 60 → 大学野球推薦
 *   overall >= 40 → 大学一般 or 社会人
 *   otherwise    → 引退
 */
export function autoDecideCareerPaths(
  graduates: GraduateRecord[],
  rng: RNG,
): Map<string, CareerPath>;
```

### 9.4 GameState への統合

```typescript
// types/game-state.ts に追加

export interface GameState {
  // ... 既存フィールド ...
  
  // Phase 3 追加
  seasonState: SeasonState;           // 年間進行状態
  activeTournaments: Tournament[];    // 進行中の大会
  completedTournaments: Tournament[]; // 完了した大会（当年度分のみ）
  weeklyPlan: WeeklyPlan;            // 週次練習計画
}
```

---

## 10. Phase 4 UI へ渡すための状態設計

### 10.1 UI が必要とする状態

Phase 4 では UI を構築するが、Phase 3 の時点で **UI が読み取る状態の形** を確定させておく。

```typescript
/** シーズン進行状態（UIのメイン画面で常に参照される） */
export interface SeasonState {
  phase: SeasonPhase;
  currentTournament: string | null;   // 進行中の大会ID
  nextEvent: UpcomingEvent | null;    // 次の重要イベント
  yearResults: YearResults;           // 当年度の実績（リアルタイム更新）
  recentEvents: GameEvent[];          // 直近7日のイベント（UI通知用）
}

export type SeasonPhase =
  | 'spring_practice'        // 4月〜6月: 春季練習
  | 'summer_tournament'      // 7月: 夏の大会
  | 'koshien'                // 8月前半: 甲子園（出場時）
  | 'post_summer'            // 8月後半: 引退・新チーム
  | 'autumn_tournament'      // 9月〜10月: 秋の大会
  | 'off_season'             // 11月〜1月: オフシーズン
  | 'pre_season';            // 2月〜3月: 春季キャンプ

export interface UpcomingEvent {
  type: 'tournament_start' | 'next_game' | 'camp_start' | 'graduation' | 'enrollment';
  date: GameDate;
  description: string;
  daysUntil: number;
}
```

### 10.2 UIへのデータ供給パターン

```
GameState（Zustand ストア）
│
├── seasonState           → メイン画面ヘッダー（シーズンフェーズ、次のイベント）
├── team.players          → 選手一覧画面
├── weeklyPlan            → 練習設定画面
├── activeTournaments     → 大会画面（トーナメント表）
├── dayResult             → 日次サマリ（ポップアップ）
└── graduates             → OB一覧画面
```

### 10.3 `advanceDay()` の返り値拡張

```typescript
// 既存の DayProcessResult を拡張

export interface DayProcessResult {
  nextState: GameState;
  dayResult: DayResult;
  
  // Phase 3 追加
  matchResult?: MatchResult;            // 試合結果（大会日のみ）
  tournamentUpdate?: TournamentUpdate;  // トーナメント表の更新
  seasonTransition?: SeasonPhase;       // シーズンフェーズ変更（あれば）
}

export interface TournamentUpdate {
  tournamentId: string;
  newResults: TournamentMatchResult[];
  isPlayerEliminated: boolean;
  isTournamentOver: boolean;
  nextGameDate: GameDate | null;
}
```

---

## 11. データフロー

### 11.1 夏の大会 — 完全フロー

```
7月10日（大会開始日）
│
├─ season-manager: 大会開始を検知
│   ├─ tournament/bracket.ts: generateBracket(48チーム)
│   ├─ tournament/seeding.ts: シード配置
│   └─ GameState.activeTournaments に追加
│
7月11日（1回戦 第1日）
│
├─ day-processor: dayType = 'tournament_day'
│   │
│   ├─ season-manager: processTournamentDay()
│   │   │
│   │   ├─ 自チームの試合がこの日にあるか判定
│   │   │   YES →
│   │   │   ├─ opponent.ts: generateOpponent(対戦相手の強さ)
│   │   │   ├─ match/game.ts: runGame(自チーム, 対戦相手)
│   │   │   ├─ growth/calculate.ts: applyMatchGrowth(全選手)
│   │   │   ├─ match/result.ts: addMatchToCareer(全選手)
│   │   │   └─ tournament/runner.ts: 結果をトーナメント表に反映
│   │   │
│   │   ├─ 他チームの試合:
│   │   │   └─ runner.ts: quickMatchResult() で結果のみ決定
│   │   │
│   │   └─ return TournamentDayResult
│   │
│   ├─ 通常の日終了処理（疲労回復等）
│   └─ advanceDate()
│
... （大会期間中、毎日繰り返し）
│
7月31日（決勝 or 敗退後）
│
├─ 優勝した場合:
│   ├─ koshien.ts: generateKoshienTournament()
│   └─ 8月7日から甲子園開始
│
├─ 敗退した場合:
│   └─ 通常の練習日に戻る
│
8月23日（3年生引退日）
│
├─ schedule.ts: third_year_retirement イベント検知
│   ├─ 3年生の引退フラグを立てる
│   ├─ ベンチ入りメンバーから3年生を除外
│   └─ キャプテン交代イベント
│
8月24日（新チーム結成日）
│
├─ schedule.ts: new_team_formation イベント検知
│   ├─ lineup = null （打順リセット）
│   ├─ 2年生中心の autoGenerateLineup()
│   └─ 新チーム結成イベント生成
```

### 11.2 年度替わりフロー

```
3月31日の processDay() 内:
│
├─ 通常の日次処理（朝〜日終了）
│
├─ advanceDate() → 4月1日
│
├─ 年度替わり検知（month === 4 && day === 1）
│   │
│   ├─ Step 0: autoSave('pre_transition')
│   │
│   ├─ Step 1: processCareerDecisions()
│   │   └─ 3年生の進路自動決定
│   │
│   ├─ Step 2: processGraduation()
│   │   ├─ 3年生を除外
│   │   └─ GraduateRecord に変換（CareerPath 付き）
│   │
│   ├─ Step 3: 学年自動進級（計算ベースなので処理なし）
│   │
│   ├─ Step 4: processEnrollment()
│   │   └─ 新入生 5〜15人を生成して追加
│   │
│   ├─ Step 5: resetTeamForNewYear()
│   │   ├─ lineup = null
│   │   └─ キャプテン選定
│   │
│   ├─ Step 6: updateManagerStats()
│   │
│   ├─ Step 7: updateReputation()
│   │
│   ├─ Step 8: initSeasonState()
│   │   ├─ seasonState = 新しい SeasonState
│   │   ├─ activeTournaments = []
│   │   ├─ completedTournaments を履歴に移動
│   │   └─ weeklyPlan = デフォルト
│   │
│   └─ Step 9: autoSave('post_transition')
│
└─ return { nextState, dayResult }
```

### 11.3 セーブデータサイズの見積り

| データ | 1年分 | 5年分 | 20年分 |
|--------|-------|-------|--------|
| team.players (25人) | ~50KB | ~50KB | ~50KB |
| graduates | ~2KB/人 | ~50KB (25人/年) | ~200KB |
| completedTournaments | ~30KB/大会 | ~300KB | ~1.2MB |
| その他 | ~10KB | ~50KB | ~200KB |
| **合計** | ~90KB | ~450KB | ~1.7MB |

**20年分のセーブデータが2MB未満に収まる設計。** パフォーマンスバジェット（2MB/年）は大きくクリア。

**ポイント:** 対戦相手の Player データは保持しない。MatchTeam を試合ごとに生成し、TournamentMatchResult にはスコアのみ記録する。

---

## 12. テスト観点

### 12.1 tournament/ のテスト

| テストケース | 検証内容 |
|-------------|---------|
| **bracket: 48チーム** | 48チームで正しいトーナメント表が生成される（64スロット、16 BYE） |
| **bracket: 2の冪乗** | 32チームでBYEなしのトーナメント表が生成される |
| **bracket: 最小** | 2チームで決勝のみのトーナメント |
| **seeding: シード配置** | シード1とシード2が決勝まで当たらない |
| **opponent: 強さカーブ** | ラウンドが進むほど対戦相手の strength が上がる |
| **opponent: チーム完全性** | 生成された MatchTeam が全ポジションを満たし、試合が完走する |
| **runner: 1日進行** | 大会1日分を進行して正しい結果が返る |
| **runner: 完走** | 大会全体を最後まで進行して優勝チームが決定する |
| **runner: プレイヤー敗退** | プレイヤーが敗退した後も大会が続行される |
| **quick match: 確率分布** | 1000回実行で strength 差に応じた勝率が期待値に近い |
| **koshien: 出場判定** | 県大会優勝→甲子園トーナメントが正しく生成される |
| **koshien: 不出場** | 県大会敗退→甲子園は生成されない |

### 12.2 season/ のテスト

| テストケース | 検証内容 |
|-------------|---------|
| **season-manager: フェーズ遷移** | 日付に応じて SeasonPhase が正しく遷移する |
| **processTournamentDay: 試合あり** | 自チームの試合日に MatchResult が返る |
| **processTournamentDay: 試合なし** | 自チーム不参加の日は matchResult が null |
| **practice-scheduler: 週次計画** | 計画通りのメニューが各曜日に返される |
| **practice-scheduler: 大会日優先** | 大会日は練習計画より大会が優先される |

### 12.3 成長統合テスト

| テストケース | 検証内容 |
|-------------|---------|
| **試合→成長** | 試合後に applyMatchGrowth で能力値が上昇する |
| **甲子園ボーナス** | 甲子園での成長量が通常の3倍 |
| **CareerRecord 加算** | 試合結果が careerStats に正しく反映される |
| **1年間通し成長** | 365日通しで能力値が妥当な範囲で上昇する |

### 12.4 年度替わりテスト

| テストケース | 検証内容 |
|-------------|---------|
| **卒業→入学** | 3年生が消え、新1年生が追加される |
| **部員数維持** | 年度替わり後に 15〜30人の範囲を維持 |
| **データ不整合なし** | lineup が null にリセットされ、不在選手IDが参照されない |
| **評判更新** | 大会成績に応じた評判変動が正しい |
| **5年間通し** | 5年間の年度替わりを繰り返してエラーなし |
| **20年間通し** | 20年間通しでメモリリークなし、データサイズが妥当 |
| **セーブ/ロード往復** | 年度替わり前後でセーブ→ロードが正しく動作 |

### 12.5 統合テスト

| テストケース | 検証内容 |
|-------------|---------|
| **1年間フルシミュレーション** | 4/1→3/31: 練習→夏大会→引退→秋大会→オフ→年度替わり。エラーなし |
| **3年間フルシミュレーション** | 世代交代3回。パフォーマンス < 30秒 |
| **5年間フルシミュレーション** | GameState サイズ < 2MB |
| **甲子園出場シナリオ** | 強チーム(reputation=90)で県大会→甲子園を通しで実行 |
| **弱小チームシナリオ** | 弱チーム(reputation=20)で1回戦負けが多い |
| **シード再現性** | 同じシードで同じ試合結果が再現される |

---

## 13. MVPで省略するもの

| 項目 | 理由 | 代替 | 実装時期 |
|------|------|------|---------|
| **春季大会** | 大会が多すぎるとテンポ悪化 | 省略（夏＋秋の2大会のみ） | v1.5 |
| **センバツ甲子園** | 秋季成績→選出の仕組みが複雑 | 省略 | v1.5 |
| **明治神宮大会** | 同上 | 省略 | v1.5 |
| **練習試合（対外）** | 大会以外の試合対戦 | 紅白戦メニューで代替 | v1.5 |
| **詳細スカウト** | 複雑度が高い | 全員自動入部 | Phase 3.5 |
| **ドラフト会議イベント** | UI連携が必要 | 自動判定（能力ベース） | Phase 3.5 |
| **OB 年次成績生成** | 別システムが必要 | GraduateRecord + CareerPath のみ | Phase 3.5 |
| **イベント選択肢** | UI連携が必要 | 自動解決のイベントのみ | Phase 4 |
| **人間関係** | 複雑度が高い | 省略 | v1.5 |
| **キャプテンシステム** | 効果の設計が未確定 | 自動選定のみ（効果なし） | v1.5 |
| **施設レベル変動** | 学校経営は MVP 外 | 固定値 | v2 |
| **複数県対応** | 地方大会の県ごとの参加校数差 | 全県48校固定 | v1.5 |
| **天候・グラウンド状態** | バランス調整が複雑 | 省略 | v1.5 |
| **雨天順延** | 日程管理が複雑化 | 省略（全試合予定通り実施） | v1.5 |
| **タイブレーク** | ルール実装が必要 | 延長3回まで、決着つかなければ再試合 | v1.5 |

---

## 14. 実装順序

### 14.1 マイルストーン

| マイルストーン | 完了条件 | 想定工期 |
|-------------|---------|---------|
| **M1: 大会が生まれる** | トーナメント表が生成され、全試合が完走する | 3日 |
| **M2: 大会が回る** | 日次進行と大会進行が連動し、夏の大会が完走する | 3日 |
| **M3: 1年が回る** | 4月〜3月のフルサイクルが完走する（大会2つ含む） | 2日 |
| **M4: 世代が回る** | 年度替わり（卒業→入学）が安全に動作し、5年間通しが完走する | 2日 |
| **M5: 試合で育つ** | 試合結果が成長と通算成績に反映される | 1日 |
| **M6: Phase 3 完了** | 20年間シミュレーションがエラーなし、全テストパス | 1日 |

**合計想定工期: 12日（2週間）**

### 14.2 ステップ分解

```
Week 1: 大会システム
═══════════════════════════════════════════════════

Step 1. tournament/types.ts                           [0.5日]
        - 大会関連の全型定義
        - TournamentType, Tournament, BracketNode, TournamentTeam

Step 2. tournament/bracket.ts                         [1日]
        - トーナメント表の生成アルゴリズム
        - generateBracket(), calculateBracketSize(), placeSeedTeams()
        - テスト: 48チーム、32チーム、2チームのブラケット生成

Step 3. tournament/seeding.ts                         [0.5日]
        - シード決定・配置ロジック
        - テスト: シード対角配置

Step 4. tournament/opponent.ts                        [1日]
        - 対戦相手の MatchTeam 生成
        - generateOpponent(), calculateRoundStrength()
        - テスト: 生成されたチームで試合が完走するか

Step 5. tournament/runner.ts                          [1日]
        - 大会進行管理
        - advanceTournamentDay(), quickMatchResult()
        - テスト: 大会完走、プレイヤー敗退後の続行

Step 6. tournament/koshien.ts                         [0.5日]
        - 甲子園出場判定・トーナメント生成
        - テスト: 出場/不出場シナリオ

Step 7. tournament/constants.ts                       [含む]
        - 全大会定数

─── M1 完了: 大会が生まれる ─────────────────────────

Week 2: 年間サイクル + 年度替わり
═══════════════════════════════════════════════════

Step 8. season/season-state.ts                        [0.5日]
        - SeasonState, SeasonPhase の型定義と初期化

Step 9. season/season-manager.ts                      [1.5日]
        - processTournamentDay(): 日次進行と大会進行の接続
        - initSeasonTournaments(): 年間大会スケジュール生成
        - テスト: 大会日に試合が実行される / 非大会日は通常

Step 10. calendar/day-processor.ts の拡張              [0.5日]
         - tournament_day 分岐を season-manager に委譲
         - 既存テスト全パス確認

Step 11. calendar/schedule.ts の拡張                   [0.5日]
         - 大会日程の詳細化（日単位のスケジュール）
         - 既存テスト全パス確認

─── M2 完了: 大会が回る ─────────────────────────────

Step 12. season/practice-scheduler.ts                  [0.5日]
         - 週次練習計画の生成と適用
         - テスト: 計画通りのメニューが返される

Step 13. types/game-state.ts の拡張                    [0.5日]
         - seasonState, activeTournaments, weeklyPlan の追加
         - 既存テスト全パス確認

─── M3 完了: 1年が回る ─────────────────────────────

Step 14. career/types.ts + career/draft.ts              [0.5日]
         - 進路関連型定義 + ドラフト自動判定スタブ
         - career/career-path.ts, career/scout.ts（スタブ）

Step 15. team/enrollment.ts の拡張                      [1日]
         - processYearTransition の拡張（進路決定統合）
         - updateReputation()
         - resetTeamForNewYear()
         - テスト: 年度替わり完全テスト

Step 16. save/serializer.ts の更新                      [0.5日]
         - 新フィールドのシリアライズ対応
         - マイグレーション（Phase 2 → Phase 3 セーブデータ変換）
         - テスト: セーブ/ロード往復

─── M4 完了: 世代が回る ─────────────────────────────

Step 17. growth/calculate.ts に applyMatchGrowth 追加    [0.5日]
         - 試合経験による成長計算
         - テスト: 成長量の検証

Step 18. match/result.ts に addMatchToCareer 追加        [0.5日]
         - 試合結果の通算成績反映
         - テスト: CareerRecord の加算

─── M5 完了: 試合で育つ ─────────────────────────────

Step 19. 統合テスト + バランス調整                       [1日]
         - 1年/3年/5年/20年のフルシミュレーション
         - パフォーマンス計測
         - 成長曲線の検証

─── M6 完了: Phase 3 完了 ─────────────────────────

(Optional) Step 20. event/types.ts + event-generator.ts  [1日]
         - 基本イベントシステム（怪我以外: 覚醒、スランプ深化等）
         - day-processor からの event/ 委譲
```

### 14.3 依存関係図

```
Step 1 (tournament/types)
  ↓
Step 2 (bracket) ←── Step 1
  ↓
Step 3 (seeding) ←── Step 1, 2
  ↓
Step 4 (opponent) ←── Step 1, match/
  ↓
Step 5 (runner) ←── Step 2, 3, 4, match/
  ↓
Step 6 (koshien) ←── Step 5
  │
  │ ──── M1 ────
  │
Step 8 (season-state) ←── Step 1
  ↓
Step 9 (season-manager) ←── Step 5, 8, calendar/, growth/
  ↓
Step 10 (day-processor拡張) ←── Step 9
  ↓
Step 11 (schedule拡張) ←── Step 10
  │
  │ ──── M2 ────
  │
Step 12 (practice-scheduler)
Step 13 (game-state拡張) ←── Step 8
  │
  │ ──── M3 ────
  │
Step 14 (career types+stubs)
  ↓
Step 15 (enrollment拡張) ←── Step 14
  ↓
Step 16 (serializer更新) ←── Step 13, 15
  │
  │ ──── M4 ────
  │
Step 17 (applyMatchGrowth) ←── match/, growth/
Step 18 (addMatchToCareer) ←── match/
  │
  │ ──── M5 ────
  │
Step 19 (統合テスト) ←── 全 Step
  │
  │ ──── M6 (Phase 3 完了) ────
```

---

## 15. ディレクトリ構成

Phase 3 完了時点のファイル構成（新規ファイルに `★` マーク）：

```
koushien-sim/
├── src/
│   ├── engine/
│   │   ├── types/
│   │   │   ├── player.ts              # 拡張: CareerRecord に tournamentStats
│   │   │   ├── team.ts
│   │   │   ├── calendar.ts            # 拡張: PracticeMenuId 追加、SeasonPhase
│   │   │   ├── game-state.ts          # 拡張: seasonState, tournaments, weeklyPlan
│   │   │   └── index.ts
│   │   │
│   │   ├── core/
│   │   │   ├── rng.ts
│   │   │   ├── id.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── player/
│   │   │   ├── generate.ts
│   │   │   ├── name-dict.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── growth/
│   │   │   ├── calculate.ts           # 拡張: applyMatchGrowth()
│   │   │   ├── condition.ts
│   │   │   ├── practice.ts            # 拡張: 5メニュー追加
│   │   │   ├── constants.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── calendar/
│   │   │   ├── game-calendar.ts
│   │   │   ├── schedule.ts            # 拡張: 大会日程の日単位詳細
│   │   │   ├── day-processor.ts       # 拡張: tournament_day を season-manager に委譲
│   │   │   └── index.ts
│   │   │
│   │   ├── team/
│   │   │   ├── roster.ts
│   │   │   ├── lineup.ts
│   │   │   ├── enrollment.ts          # 拡張: processYearTransition + 進路統合
│   │   │   └── index.ts
│   │   │
│   │   ├── match/
│   │   │   ├── types.ts
│   │   │   ├── constants.ts
│   │   │   ├── game.ts
│   │   │   ├── inning.ts
│   │   │   ├── at-bat.ts
│   │   │   ├── result.ts              # 拡張: addMatchToCareer()
│   │   │   ├── tactics.ts
│   │   │   ├── pitch/
│   │   │   │   ├── process-pitch.ts
│   │   │   │   ├── control-error.ts
│   │   │   │   ├── batter-action.ts
│   │   │   │   ├── bat-contact.ts
│   │   │   │   ├── swing-result.ts
│   │   │   │   ├── select-pitch.ts
│   │   │   │   ├── field-result.ts
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── shared/
│   │   │   ├── stat-utils.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── tournament/                ★ NEW
│   │   │   ├── types.ts               ★ 大会関連の全型定義
│   │   │   ├── bracket.ts             ★ トーナメント表生成
│   │   │   ├── seeding.ts             ★ シード配置
│   │   │   ├── opponent.ts            ★ 対戦相手生成
│   │   │   ├── runner.ts              ★ 大会進行管理
│   │   │   ├── koshien.ts             ★ 甲子園固有ロジック
│   │   │   ├── constants.ts           ★ 大会定数
│   │   │   └── index.ts              ★
│   │   │
│   │   ├── season/                    ★ NEW
│   │   │   ├── season-state.ts        ★ シーズン状態型・初期化
│   │   │   ├── season-manager.ts      ★ 年間進行統括
│   │   │   ├── practice-scheduler.ts  ★ 週次練習計画
│   │   │   ├── constants.ts           ★ シーズン定数
│   │   │   └── index.ts              ★
│   │   │
│   │   ├── career/                    ★ NEW (stub)
│   │   │   ├── types.ts               ★ 進路関連型
│   │   │   ├── draft.ts               ★ ドラフト判定（スタブ）
│   │   │   ├── career-path.ts         ★ 進路決定（スタブ）
│   │   │   ├── scout.ts               ★ スカウト（スタブ）
│   │   │   └── index.ts              ★
│   │   │
│   │   ├── event/                     ★ NEW (minimal)
│   │   │   ├── types.ts               ★ イベント型
│   │   │   ├── event-generator.ts     ★ イベント発生判定
│   │   │   ├── event-effects.ts       ★ イベント効果適用
│   │   │   └── index.ts              ★
│   │   │
│   │   ├── save/
│   │   │   ├── serializer.ts          # 拡張: 新フィールド対応 + マイグレーション
│   │   │   ├── save-manager.ts
│   │   │   └── index.ts
│   │   │
│   │   └── index.ts                   # 拡張: 新モジュールの公開
│   │
│   ├── platform/
│   │   ├── storage/
│   │   │   ├── adapter.ts
│   │   │   ├── indexeddb.ts
│   │   │   ├── memory.ts
│   │   │   └── index.ts
│   │   ├── license/
│   │   │   ├── types.ts
│   │   │   ├── manager.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   └── stores/
│       └── game-store.ts              # 拡張: advanceDay の大会対応
│
├── tests/
│   ├── engine/
│   │   ├── tournament/                ★ NEW
│   │   │   ├── bracket.test.ts        ★
│   │   │   ├── opponent.test.ts       ★
│   │   │   ├── runner.test.ts         ★
│   │   │   └── koshien.test.ts        ★
│   │   ├── season/                    ★ NEW
│   │   │   ├── season-manager.test.ts ★
│   │   │   └── practice-scheduler.test.ts ★
│   │   ├── career/                    ★ NEW
│   │   │   └── draft.test.ts          ★
│   │   ├── growth/
│   │   │   ├── calculate.test.ts      # 拡張: applyMatchGrowth テスト
│   │   │   └── condition.test.ts
│   │   ├── calendar/
│   │   │   ├── game-calendar.test.ts
│   │   │   └── day-processor.test.ts  # 拡張: 大会日テスト
│   │   ├── team/
│   │   │   ├── roster.test.ts
│   │   │   ├── lineup.test.ts
│   │   │   └── enrollment.test.ts     # 拡張: 年度替わりテスト
│   │   ├── match/
│   │   │   └── (既存テスト — 変更なし)
│   │   ├── save/
│   │   │   └── save-manager.test.ts   # 拡張: マイグレーションテスト
│   │   └── integration/
│   │       ├── one-year.test.ts       # 拡張: 大会込みの1年
│   │       ├── three-years.test.ts    # 拡張: 世代交代3回
│   │       ├── five-years.test.ts     # 拡張: 5年パフォーマンス
│   │       ├── twenty-years.test.ts   ★ NEW: 20年通しテスト
│   │       └── koshien-scenario.test.ts ★ NEW: 甲子園シナリオ
│   └── setup.ts
│
├── docs/
│   ├── SPEC-MVP.md
│   ├── DESIGN-PHASE1.md
│   ├── DESIGN-PHASE2.md
│   ├── DESIGN-PHASE3.md              # ← この文書
│   ├── FIXES_PHASE2.md
│   └── STATUS_REPORT.md
│
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── next.config.ts
```

**新規ファイル数:** 22ファイル（ソース17 + テスト5）  
**既存ファイル変更:** 11ファイル（全て後方互換な拡張のみ）  
**既存テスト影響:** 0（既存225テストに破壊的変更なし）

---

## 付録A: SeasonPhase の遷移表

| 日付 | SeasonPhase | トリガー |
|------|-------------|---------|
| 4/1 | `spring_practice` | 年度開始 |
| 7/10 | `summer_tournament` | 夏の地方大会開始 |
| 8/7（出場時） | `koshien` | 甲子園開始 |
| 8/23 | `post_summer` | 3年引退日 |
| 9/15 | `autumn_tournament` | 秋季大会開始 |
| 11/1 | `off_season` | オフシーズン開始 |
| 2/1 | `pre_season` | 春季練習開始 |
| 3/31 → 4/1 | → `spring_practice` | 年度替わり |

## 付録B: パフォーマンスバジェット（Phase 3）

| 処理 | 許容時間 | 根拠 |
|------|---------|------|
| generateBracket(48チーム) | < 10ms | 年間2回 |
| generateOpponent() | < 50ms | 試合ごとに1回 |
| runGame()（Phase 2） | < 500ms | 自チームの試合 |
| quickMatchResult() | < 1ms | 他チームの試合 |
| advanceTournamentDay() | < 600ms | runGame + quick × N |
| processDay()（大会日） | < 800ms | advanceTournamentDay + 日次処理 |
| processDay()（通常日） | < 50ms | Phase 1 と同等 |
| processYearTransition() | < 500ms | 卒業+入学+初期化 |
| 1年間シミュレーション | < 30秒 | 365日 × processDay |
| 5年間シミュレーション | < 2.5分 | 1年×5 |
| 20年間シミュレーション | < 10分 | 1年×20 |

## 付録C: match/ との接続インターフェース

Phase 2 の `runGame()` を大会から呼び出す際のインターフェース:

```typescript
// tournament/runner.ts から match/game.ts を呼ぶ

import { runGame } from '../match/game';
import type { MatchConfig, MatchTeam, MatchResult } from '../match/types';

function executePlayerMatch(
  playerTeam: Team,
  opponentMatchTeam: MatchTeam,
  tournamentType: TournamentType,
  rng: RNG,
): MatchResult {
  // プレイヤーのチームを MatchTeam に変換
  const playerMatchTeam = convertTeamToMatchTeam(playerTeam);
  
  // 大会用の MatchConfig を生成
  const config: MatchConfig = {
    innings: 9,
    maxExtras: TOURNAMENT_CONSTANTS.MAX_EXTRAS_TOURNAMENT,
    isTournament: true,
    mercyRule: { leadRequired: 10, afterInning: 5 },
  };
  
  // Phase 2 の runGame を呼び出す
  const { result } = runGame(config, playerMatchTeam, opponentMatchTeam, rng);
  return result;
}

/**
 * Team (Phase 1) → MatchTeam (Phase 2) の変換。
 * lineup が null の場合は autoGenerateLineup() で自動設定。
 */
function convertTeamToMatchTeam(team: Team): MatchTeam;
```

## 付録D: データマイグレーション戦略

Phase 2 のセーブデータ（`version: "0.2.x"`）を Phase 3（`version: "0.3.0"`）に変換する:

```typescript
// save/serializer.ts

function migrateV02toV03(state: GameStateV02): GameStateV03 {
  return {
    ...state,
    version: '0.3.0',
    // 新フィールドにデフォルト値を注入
    seasonState: createInitialSeasonState(state.currentDate),
    activeTournaments: [],
    completedTournaments: [],
    weeklyPlan: createDefaultWeeklyPlan('balanced'),
  };
}
```

**原則:** 新フィールドは全てデフォルト値で初期化可能な設計にする。既存データの破壊は一切行わない。

---

> **次のステップ**: この設計書のレビュー → 合意後、Step 1（tournament/types.ts）から実装開始
