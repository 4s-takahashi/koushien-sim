# Phase 1: コアエンジン — 詳細設計書

> バージョン: 0.3.0  
> 作成日: 2026-04-11  
> 改訂日: 2026-04-11（認証/課金/アプリ化対応、型整理、processDay返り値変更、GraduateRecord軽量化）  
> 前提文書: [SPEC-MVP.md](./SPEC-MVP.md)  
> ステータス: 実装着手可能

---

## 目次

1. [概要](#1-概要)
2. [モジュール一覧](#2-モジュール一覧)
3. [1-1 選手データモデル](#3-1-1-選手データモデル)
4. [1-2 能力値・成長計算エンジン](#4-1-2-能力値成長計算エンジン)
5. [1-3 カレンダー・時間進行システム](#5-1-3-カレンダー時間進行システム)
6. [1-4 チーム管理](#6-1-4-チーム管理)
7. [1-5 セーブ/ロード](#7-1-5-セーブロード)
8. [データフロー](#8-データフロー)
9. [認証・課金・アプリ化対応の設計方針](#9-認証課金アプリ化対応の設計方針)
10. [MVP最小実装で省略するもの](#10-mvp最小実装で省略するもの)
11. [テスト観点](#11-テスト観点)
12. [実装順序](#12-実装順序)
13. [ディレクトリ構成](#13-ディレクトリ構成)

---

## 1. 概要

### 1.1 Phase 1 の目的

Phase 1 は **ゲームエンジンの骨格** を構築する。  
試合エンジン（Phase 2）やUI（Phase 5）に依存せず、**純粋なTypeScriptモジュール**として完結する。

Phase 1 完了時に以下が動作する：

- 選手を自動生成し、チームを編成できる
- 日単位で時間を進め、練習による能力変動が発生する
- 1年間のカレンダーを通しで進行できる
- 年度替わり（卒業/入学）が処理される
- ゲーム状態をIndexedDBに保存/復元できる

### 1.2 前提・制約

| 項目 | 値 |
|------|-----|
| ブラウザ完結 | サーバーサイドなし |
| フレームワーク | Next.js (App Router) + TypeScript |
| 状態管理 | Zustand |
| 永続化 | IndexedDB (Dexie.js) |
| 乱数 | seedrandom |
| テスト | Vitest |
| スコープ | 1校 / 1セーブスロット / 1人監督 |

### 1.3 設計方針

| 方針 | 説明 |
|------|------|
| **UIとエンジンの分離** | `src/engine/` 配下はReact/DOMに一切依存しない純関数・純クラス |
| **プラットフォーム非依存** | エンジンはブラウザAPI（IndexedDB等）に直接依存しない。Storage Adapterを介する |
| **イミュータブル優先** | ゲームステートの更新は `produce` パターン（Immer or スプレッド構文）|
| **型ファースト** | 実装前に型定義を確定。型が仕様書の役割を果たす |
| **テスタブル** | 全てのエンジン関数は副作用なし。乱数はシード注入 |
| **最小成立版** | 「動く」ことを優先。リッチな表現・細かなバランスは後工程 |
| **認証スロット確保** | ゲーム進行の入口に LicenseGate を挟む設計。MVP時はパススルー |

---

## 2. モジュール一覧

### 2.1 全体マップ

```
src/engine/
├── types/                   # 全型定義（モジュール横断）
│   ├── player.ts            # 選手関連の型
│   ├── team.ts              # チーム関連の型
│   ├── calendar.ts          # カレンダー関連の型
│   ├── game-state.ts        # ゲーム全体状態の型
│   └── index.ts             # re-export
│
├── player/                  # 1-1 選手データモデル
│   ├── generate.ts          # 選手自動生成
│   ├── name-dict.ts         # 名前辞書
│   └── index.ts
│
├── growth/                  # 1-2 能力値・成長エンジン
│   ├── calculate.ts         # 日次成長計算
│   ├── condition.ts         # コンディション判定
│   ├── practice.ts          # 練習メニュー定義・効果
│   ├── constants.ts         # バランス定数
│   └── index.ts
│
├── calendar/                # 1-3 カレンダー・時間進行
│   ├── game-calendar.ts     # カレンダー本体
│   ├── schedule.ts          # 年間スケジュール定義
│   ├── day-processor.ts     # 1日の進行処理
│   └── index.ts
│
├── team/                    # 1-4 チーム管理
│   ├── roster.ts            # ロスター（部員名簿）管理
│   ├── lineup.ts            # 打順・守備位置
│   ├── enrollment.ts        # 入部・卒業処理
│   └── index.ts
│
├── save/                    # 1-5 セーブ/ロード
│   ├── serializer.ts        # シリアライズ/デシリアライズ
│   ├── save-manager.ts      # セーブ/ロードAPI（StorageAdapter経由）
│   └── index.ts
│
├── core/                    # 共通ユーティリティ
│   ├── rng.ts               # シード付き乱数ラッパー
│   ├── id.ts                # UUID生成
│   └── index.ts
│
└── index.ts                 # エンジン公開API

src/platform/                # プラットフォーム抽象化レイヤー
├── storage/
│   ├── adapter.ts           # StorageAdapter インターフェース定義
│   ├── indexeddb.ts          # Web用アダプター (Dexie.js)
│   └── index.ts
│
├── license/
│   ├── types.ts             # ライセンス関連型定義
│   ├── manager.ts           # LicenseManager（MVP: AlwaysValidスタブ）
│   └── index.ts
│
└── index.ts
```

### 2.2 モジュール依存関係

```
core ─────────────────────────────────────────────┐
  │                                                │
types ─────────────────────────────────────────────┤
  │                                                │
player ──┬─ generate.ts  ← core/rng, types        │
         └─ name-dict.ts ← (pure data)            │
                                                   │
growth ──┬─ calculate.ts ← types, core/rng         │
         ├─ condition.ts ← types, core/rng         │
         ├─ practice.ts  ← types                   │
         └─ constants.ts ← (pure data)             │
                                                   │
calendar ┬─ game-calendar.ts ← types              │
         ├─ schedule.ts      ← types (pure data)  │
         └─ day-processor.ts ← growth, types       │
                                                   │
team ────┬─ roster.ts     ← types                  │
         ├─ lineup.ts     ← types                  │
         └─ enrollment.ts ← player/generate, types │
                                                   │
save ────┬─ serializer.ts  ← types                 │
         └─ save-manager.ts ← serializer,          │
                              platform/storage     │
                                                   │
platform/storage ── adapter.ts ← (interface only)  │
                    indexeddb.ts ← dexie, adapter   │
                                                   │
platform/license ── types.ts ← (pure types)        │
                    manager.ts ← types             │
```

**依存の原則**:
- `types` と `core` は全モジュールが参照可能
- `engine/` は `platform/` に直接依存しない。`save-manager.ts` のみ StorageAdapter インターフェースを受け取る（依存性注入）
- `platform/` はエンジン型を参照するが、エンジンのロジックには依存しない
- 循環依存は禁止

---

## 3. 1-1 選手データモデル

### 3.1 型定義一覧

#### `types/player.ts`

```typescript
// GameDate は types/calendar.ts で定義。player.ts からは import して使う。
// import type { GameDate } from './calendar';

// ===== 列挙・リテラル型 =====

/** 守備ポジション */
export type Position =
  | 'pitcher'     // 投手
  | 'catcher'     // 捕手
  | 'first'       // 一塁手
  | 'second'      // 二塁手
  | 'third'       // 三塁手
  | 'shortstop'   // 遊撃手
  | 'left'        // 左翼手
  | 'center'      // 中堅手
  | 'right';      // 右翼手

/** 投打 */
export type Hand = 'left' | 'right';
export type BattingSide = 'left' | 'right' | 'switch';

/** 学年 */
export type Grade = 1 | 2 | 3;

/** 成長タイプ */
export type GrowthType = 'early' | 'normal' | 'late' | 'genius';

/** 変化球種（MVP最小セット） */
export type PitchType =
  | 'curve'
  | 'slider'
  | 'fork'
  | 'changeup'
  | 'cutter'
  | 'sinker';

/** 性格特性ID */
export type TraitId =
  // 気質
  | 'passionate'      // 熱血
  | 'calm'            // 冷静
  | 'easygoing'       // マイペース
  | 'sensitive'       // 繊細
  | 'bold'            // 豪快
  // 社交性
  | 'leader'          // リーダー気質
  | 'morale_booster'  // ムードメーカー
  | 'lone_wolf'       // 一匹狼
  | 'shy'             // 人見知り
  // 野球観
  | 'hard_worker'     // 努力家
  | 'natural_talent'  // 天才肌
  | 'strategist'      // 戦略家
  | 'competitive'     // 負けず嫌い
  | 'fun_lover'       // 楽しむ派
  // 問題傾向
  | 'short_tempered'  // 短気
  | 'slacker'         // サボり癖
  | 'overconfident'   // 自信過剰
  | 'self_doubt'      // 自己否定
  | 'rebellious'      // 反抗的
  // 美徳
  | 'responsible'     // 責任感
  | 'caring'          // 思いやり
  | 'gritty'          // 根性
  | 'honest'          // 素直
  | 'ambitious';      // 向上心

/** 精神フラグ */
export type MentalFlag =
  | 'slump'           // スランプ
  | 'in_the_zone'     // ゾーン
  | 'injury_anxiety'  // 怪我不安
  | 'in_love'         // 恋愛中
  | 'family_trouble'  // 家庭問題
  | 'team_conflict';  // チーム内対立

/** コンディション */
export type Mood =
  | 'excellent'   // 絶好調
  | 'good'        // 好調
  | 'normal'      // 普通
  | 'poor'        // 不調
  | 'terrible';   // 絶不調

// ===== 能力値型 =====

/** 共通能力（野手・投手共通） */
export interface BaseStats {
  stamina: number;       // 体力 1-100
  speed: number;         // 走力 1-100
  armStrength: number;   // 肩力 1-100
  fielding: number;      // 守備力 1-100
  focus: number;         // 集中力 1-100
  mental: number;        // メンタル 1-100
}

/** 打撃能力 */
export interface BattingStats {
  contact: number;       // ミート 1-100
  power: number;         // パワー 1-100
  eye: number;           // 選球眼 1-100
  technique: number;     // 打撃技術 1-100
}

/** 投球能力 */
export interface PitchingStats {
  velocity: number;           // 球速 (km/h) 80-160
  control: number;            // コントロール 1-100
  pitchStamina: number;       // 投球スタミナ 1-100
  pitches: Partial<Record<PitchType, number>>;
  // 球種ごとのキレ 1-7。持っていない球種はキーが存在しない
}

/** 選手の全能力 */
export interface PlayerStats {
  base: BaseStats;
  batting: BattingStats;
  pitching: PitchingStats | null;  // 野手はnull
}

/** 潜在能力 */
export interface PotentialStats {
  ceiling: PlayerStats;       // 到達可能な最大値
  growthRate: number;         // 成長速度係数 0.5-2.0
  growthType: GrowthType;     // 早熟/普通/晩成/天才
}

// ===== 状態型 =====

/** 精神状態 */
export interface MentalState {
  mood: Mood;
  stress: number;             // 0-100
  confidence: number;         // 0-100
  teamChemistry: number;      // 0-100
  flags: MentalFlag[];        // アクティブな精神フラグ
}

/** 怪我状態 */
export interface InjuryState {
  type: string;               // 怪我の種類（例: '肩の張り', '足首捻挫'）
  severity: 'minor' | 'moderate' | 'severe';
  remainingDays: number;      // 残り休養日数
  startDate: GameDate;        // 発生日
}

/** コンディション（日単位で変動） */
export interface ConditionState {
  fatigue: number;            // 疲労度 0-100 (高い=疲れている)
  injury: InjuryState | null; // 怪我 (なしならnull)
  mood: Mood;                 // その日のコンディション
}

// ===== 背景型 =====

/** 選手の背景情報 */
export interface Background {
  hometown: string;           // 出身地（都道府県）
  middleSchool: string;       // 出身中学名
}

// ===== 選手本体 =====

/** 選手データ（完全） */
export interface Player {
  id: string;                 // UUID
  firstName: string;          // 名
  lastName: string;           // 姓
  enrollmentYear: number;     // 入学年度（ゲーム内年）

  position: Position;         // メインポジション
  subPositions: Position[];   // サブポジション（守備可能）
  battingSide: BattingSide;
  throwingHand: Hand;

  height: number;             // cm
  weight: number;             // kg

  stats: PlayerStats;         // 現在の能力値
  potential: PotentialStats;  // 潜在能力（プレイヤーには一部隠蔽）
  condition: ConditionState;  // コンディション

  traits: TraitId[];          // 性格特性（2-4個）
  mentalState: MentalState;   // 精神状態

  background: Background;     // 背景

  careerStats: CareerRecord;  // 通算成績
}

/** 通算成績（MVP最小版：打撃と投球の基本統計のみ） */
export interface CareerRecord {
  gamesPlayed: number;
  atBats: number;
  hits: number;
  homeRuns: number;
  rbis: number;
  stolenBases: number;
  // 投手
  gamesStarted: number;
  inningsPitched: number;     // 1/3イニング単位の整数（例: 21 = 7.0回）
  wins: number;
  losses: number;
  strikeouts: number;
  earnedRuns: number;
}
```

### 3.2 関数の責務

#### `player/generate.ts`

| 関数 | シグネチャ | 責務 |
|------|-----------|------|
| `generatePlayer` | `(rng: RNG, config: PlayerGenConfig) => Player` | 1人の選手を完全生成。能力・性格・背景すべて |
| `generatePlayerStats` | `(rng: RNG, grade: Grade, growthType: GrowthType) => PlayerStats` | 学年と成長タイプに応じた初期能力値を生成 |
| `generatePotential` | `(rng: RNG, stats: PlayerStats, growthType: GrowthType) => PotentialStats` | 現在値をもとに天井と成長率を算出 |
| `generateTraits` | `(rng: RNG) => TraitId[]` | 2-4個の性格特性を矛盾なく選出 |
| `generateBackground` | `(rng: RNG) => Background` | 出身地・中学を生成 |
| `generatePhysical` | `(rng: RNG, position: Position) => { height: number; weight: number }` | ポジションに応じた体格を生成 |
| `assignPosition` | `(rng: RNG, stats: PlayerStats) => { position: Position; subPositions: Position[] }` | 能力値からメイン/サブポジションを決定 |

```typescript
/** 選手生成の設定 */
export interface PlayerGenConfig {
  enrollmentYear: number;      // 入学年度
  schoolReputation: number;    // 学校の評判 0-100（能力分布に影響）
  forcePosition?: Position;    // ポジション指定（任意）
  forceGrowthType?: GrowthType; // 成長タイプ指定（テスト用）
}
```

**生成ロジックのポイント:**

```
1年生の初期能力分布:
- 学校評判50（普通の公立） → 平均25, 標準偏差10
- 学校評判80（強豪校）     → 平均40, 標準偏差12
- 天才 (2%) → 平均+20のボーナス

成長タイプ分布:
- 早熟: 20%  → growthRate 1.3-1.8, ceiling低め
- 普通: 55%  → growthRate 0.8-1.2, ceiling中
- 晩成: 20%  → growthRate 0.5-0.8, ceiling高め
- 天才:  5%  → growthRate 1.0-1.5, ceiling最高
```

#### `player/name-dict.ts`

| 関数 | シグネチャ | 責務 |
|------|-----------|------|
| `pickLastName` | `(rng: RNG) => string` | 姓を辞書からランダム選出 |
| `pickFirstName` | `(rng: RNG) => string` | 名を辞書からランダム選出 |

**辞書サイズ（MVP）:**
- 姓: 200件（頻出姓の分布を反映）
- 名: 200件（男性名）

---

## 4. 1-2 能力値・成長計算エンジン

### 4.1 型定義

#### `types/calendar.ts` 内の練習関連型

```typescript
/** 練習メニューID */
export type PracticeMenuId =
  | 'batting_basic'      // 打撃基礎（素振り・ティー）
  | 'batting_live'       // 実戦打撃（フリーバッティング）
  | 'pitching_basic'     // 投球基礎（シャドー・キャッチボール）
  | 'pitching_bullpen'   // ブルペン投球
  | 'fielding_drill'     // 守備練習（ノック）
  | 'running'            // 走り込み
  | 'strength'           // 筋力トレーニング
  | 'mental'             // メンタルトレーニング
  | 'rest';              // 休養

/** 練習メニュー定義 */
export interface PracticeMenu {
  id: PracticeMenuId;
  name: string;                  // 表示名
  description: string;           // 説明
  fatigueLoad: number;           // 疲労増加量 0-20
  statEffects: StatEffect[];     // 能力値への効果
  duration: 'half' | 'full';     // 半日 / 終日
}

/** 能力値への効果 */
export interface StatEffect {
  target: StatTarget;            // 影響する能力値
  baseGain: number;              // 基本上昇量（0.1〜1.0程度）
}

/** 能力値のターゲット指定 */
export type StatTarget =
  | `base.${keyof BaseStats}`
  | `batting.${keyof BattingStats}`
  | `pitching.velocity`
  | `pitching.control`
  | `pitching.pitchStamina`;
```

### 4.2 成長計算の詳細ロジック

#### `growth/calculate.ts`

| 関数 | シグネチャ | 責務 |
|------|-----------|------|
| `applyDailyGrowth` | `(player: Player, menu: PracticeMenu, rng: RNG) => Player` | 1日分の練習効果を選手に適用。新しいPlayerを返す |
| `calculateStatGain` | `(current: number, ceiling: number, effect: StatEffect, modifiers: GrowthModifiers) => number` | 1能力値の上昇量を計算 |
| `clampStats` | `(stats: PlayerStats) => PlayerStats` | 全能力値を有効範囲にクランプ |

```typescript
/** 成長補正に影響する要素を集約 */
export interface GrowthModifiers {
  growthRate: number;        // 選手のgrowthRate
  growthType: GrowthType;   // 早熟/普通/晩成/天才
  grade: Grade;              // 学年
  mood: Mood;                // コンディション
  fatigue: number;           // 疲労度
  motivation: number;        // モチベーション（mentalState.confidence で代用）
  traits: TraitId[];         // 性格特性（努力家ボーナスなど）
  seasonMultiplier: number;  // 合宿期間など
}
```

**成長計算式:**

```
実効上昇量 = baseGain
           × growthRate
           × gradeMultiplier(grade, growthType)
           × moodMultiplier(mood)
           × fatigueMultiplier(fatigue)
           × traitMultiplier(traits)
           × seasonMultiplier
           × ceilingPenalty(current, ceiling)
           × randomVariance(rng)   // 0.7 〜 1.3

gradeMultiplier:
  早熟: [1年:1.5, 2年:1.0, 3年:0.6]
  普通: [1年:1.0, 2年:1.1, 3年:0.9]
  晩成: [1年:0.6, 2年:1.0, 3年:1.4]
  天才: [1年:1.2, 2年:1.2, 3年:1.0]

moodMultiplier:
  絶好調:1.3, 好調:1.1, 普通:1.0, 不調:0.8, 絶不調:0.5

fatigueMultiplier:
  fatigue < 30: 1.0
  fatigue 30-60: 0.9
  fatigue 60-80: 0.7
  fatigue > 80: 0.4

traitMultiplier:
  努力家: +15%
  天才肌: -5%（練習効率は低い代わりにceilingが高い）
  サボり癖: -20%（mood不調時さらに-10%）

ceilingPenalty(current, ceiling):
  ratio = current / ceiling
  ratio < 0.5: 1.0（伸び放題）
  ratio 0.5-0.8: 1.0 - (ratio - 0.5) * 0.5
  ratio 0.8-0.95: 0.3
  ratio > 0.95: 0.05（ほぼ伸びない）
```

#### `growth/condition.ts`

| 関数 | シグネチャ | 責務 |
|------|-----------|------|
| `updateDailyCondition` | `(player: Player, rng: RNG) => ConditionState` | 1日の開始時にコンディションを更新 |
| `applyFatigue` | `(condition: ConditionState, load: number) => ConditionState` | 練習/試合後の疲労加算 |
| `recoverFatigue` | `(condition: ConditionState, isRest: boolean) => ConditionState` | 自然回復。休養日はボーナス |
| `rollInjury` | `(player: Player, load: number, rng: RNG) => InjuryState \| null` | 怪我発生判定 |
| `advanceInjury` | `(injury: InjuryState) => InjuryState \| null` | 怪我の回復進行。治ったらnull |

**コンディション判定:**

```
Mood決定:
  base = weighted random [excellent:5%, good:25%, normal:45%, poor:20%, terrible:5%]
  
  補正:
    fatigue > 70 → excellent/good確率−20%, poor/terrible確率+20%
    confidence > 70 → excellent/good確率+10%
    flags.includes('slump') → excellent確率0%, terrible確率+15%
    flags.includes('in_the_zone') → excellent確率+30%

疲労回復:
  通常日: -5 〜 -10
  休養日: -15 〜 -25
  怪我中: 疲労回復なし（治療に専念）

怪我発生率:
  base = 0.002 / 日（0.2%）
  × fatigue > 80 → ×3.0
  × fatigue 60-80 → ×1.5
  × 怪我不安フラグ → ×1.5
  
  重症度分布: minor:70%, moderate:25%, severe:5%
  回復日数: minor:3-7日, moderate:14-30日, severe:30-90日
```

#### `growth/practice.ts`

| 関数 | シグネチャ | 責務 |
|------|-----------|------|
| `getPracticeMenus` | `() => PracticeMenu[]` | 利用可能な練習メニュー一覧を返す |
| `getDefaultMenu` | `(dayType: DayType) => PracticeMenuId` | 日種別に応じたデフォルトメニューを返す |

**練習メニュー定義（MVP 9種）:**

| メニュー | 対象能力 | baseGain | 疲労 |
|----------|---------|----------|------|
| 打撃基礎 | contact+0.3, technique+0.2 | — | 5 |
| 実戦打撃 | contact+0.2, power+0.3, eye+0.2 | — | 8 |
| 投球基礎 | control+0.3, pitchStamina+0.2 | — | 6 |
| ブルペン | velocity+0.2, control+0.2, pitchStamina+0.2 | — | 10 |
| 守備練習 | fielding+0.4, armStrength+0.1 | — | 6 |
| 走り込み | speed+0.3, stamina+0.3 | — | 10 |
| 筋トレ | power+0.3, armStrength+0.2, stamina+0.1 | — | 8 |
| メンタル | mental+0.3, focus+0.3 | — | 2 |
| 休養 | (なし) | — | -15 |

#### `growth/constants.ts`

```typescript
export const GROWTH_CONSTANTS = {
  // 能力値範囲
  STAT_MIN: 1,
  STAT_MAX: 100,
  VELOCITY_MIN: 80,
  VELOCITY_MAX: 160,
  PITCH_LEVEL_MIN: 1,
  PITCH_LEVEL_MAX: 7,

  // 成長
  RANDOM_VARIANCE_MIN: 0.7,
  RANDOM_VARIANCE_MAX: 1.3,

  // コンディション
  FATIGUE_MAX: 100,
  FATIGUE_NATURAL_RECOVERY: 8,    // 通常日の疲労回復
  FATIGUE_REST_RECOVERY: 20,      // 休養日の疲労回復

  // 怪我
  INJURY_BASE_RATE: 0.002,
  INJURY_DURATION: {
    minor: { min: 3, max: 7 },
    moderate: { min: 14, max: 30 },
    severe: { min: 30, max: 90 },
  },

  // 練習倍率
  CAMP_MULTIPLIER: 1.5,           // 合宿期間
  MATCH_GROWTH_MULTIPLIER: 2.0,   // 試合（Phase 2で使用）
} as const;
```

---

## 5. 1-3 カレンダー・時間進行システム

### 5.1 型定義

#### `types/calendar.ts`

```typescript
/** ゲーム内日付 */
export interface GameDate {
  year: number;    // ゲーム内年（例: 1 = 初年度）
  month: number;   // 1-12
  day: number;     // 1-31
}

/** 日の種類 */
export type DayType =
  | 'school_day'          // 授業日（平日・練習あり）
  | 'holiday'             // 休日（終日練習可）
  | 'tournament_day'      // 大会日（試合）
  | 'ceremony_day'        // 式典（入学式/卒業式等）
  | 'camp_day'            // 合宿
  | 'off_day';            // オフ（12月〜1月の一部）

/** 年間イベント（固定スケジュール） */
export interface ScheduledEvent {
  month: number;
  day: number;
  type: ScheduledEventType;
  name: string;
  duration?: number;             // 複数日にまたがる場合
}

/** スケジュールイベント種別 */
export type ScheduledEventType =
  | 'enrollment_ceremony'        // 入学式
  | 'graduation_ceremony'        // 卒業式
  | 'summer_tournament_start'    // 夏の大会開始
  | 'summer_tournament_end'      // 夏の大会終了
  | 'koshien_start'              // 甲子園開始
  | 'koshien_end'                // 甲子園終了
  | 'autumn_tournament_start'    // 秋季大会開始
  | 'autumn_tournament_end'      // 秋季大会終了
  | 'summer_camp_start'          // 夏合宿開始
  | 'summer_camp_end'            // 夏合宿終了
  | 'winter_camp_start'          // 冬合宿開始
  | 'winter_camp_end'            // 冬合宿終了
  | 'third_year_retirement'      // 3年生引退
  | 'new_team_formation'         // 新チーム結成
  | 'off_season_start'           // オフシーズン開始
  | 'off_season_end';            // オフシーズン終了

/** 1日の処理結果（UI表示用のサマリ） */
export interface DayResult {
  date: GameDate;
  dayType: DayType;
  practiceApplied: PracticeMenuId | null;
  playerChanges: PlayerDayChange[];   // 各選手の変化サマリ
  events: GameEvent[];                // 発生したイベント
  injuries: { playerId: string; injury: InjuryState }[];
  recovered: string[];                // 怪我から回復した選手ID
}

/** processDay の返り値。更新後のステートとUI用サマリの両方を返す */
export interface DayProcessResult {
  nextState: GameState;               // 1日進行後の新しいGameState
  dayResult: DayResult;               // UI表示用サマリ
}

/** 選手の1日の変化（UI表示用サマリ） */
export interface PlayerDayChange {
  playerId: string;
  statChanges: { target: StatTarget; delta: number }[];
  fatigueChange: number;
  moodBefore: Mood;
  moodAfter: Mood;
}

/** ゲーム内イベント（MVP最小版） */
export interface GameEvent {
  id: string;
  type: GameEventType;
  date: GameDate;
  description: string;             // 表示テキスト
  involvedPlayerIds: string[];
}

/** イベント種別（MVP最小セット） */
export type GameEventType =
  | 'injury'                // 怪我発生
  | 'recovery'              // 怪我回復
  | 'mood_change'           // 調子の大きな変動
  | 'growth_spurt'          // 急成長（能力が大幅UP）
  | 'slump_start'           // スランプ突入
  | 'slump_end'             // スランプ脱出
  | 'new_pitch_learned'     // 新球種習得
  | 'enrollment'            // 入学
  | 'graduation'            // 卒業
  | 'retirement'            // 3年生引退
  | 'practice_match';       // 練習試合（結果のみ）
```

### 5.2 関数の責務

#### `calendar/game-calendar.ts`

| 関数 | シグネチャ | 責務 |
|------|-----------|------|
| `createGameDate` | `(year: number, month: number, day: number) => GameDate` | GameDate生成 + バリデーション |
| `advanceDate` | `(date: GameDate) => GameDate` | 1日進める。月末/年末の繰り上げ処理 |
| `getDayType` | `(date: GameDate, schedule: ScheduledEvent[]) => DayType` | 日付からその日の種類を判定 |
| `getDaysInMonth` | `(year: number, month: number) => number` | 月の日数（閏年は考慮しない。2月は28日固定） |
| `compareDates` | `(a: GameDate, b: GameDate) => -1 \| 0 \| 1` | 日付の前後比較 |
| `dateDiffDays` | `(from: GameDate, to: GameDate) => number` | 2日付間の日数差 |
| `formatDate` | `(date: GameDate) => string` | 表示用文字列（例: "1年目 4月10日"） |
| `getGrade` | `(enrollmentYear: number, currentYear: number) => Grade \| null` | 入学年度と現在年度から学年を計算。卒業済みならnull |

#### `calendar/schedule.ts`

| 関数 | シグネチャ | 責務 |
|------|-----------|------|
| `getAnnualSchedule` | `() => ScheduledEvent[]` | 年間の固定スケジュールを返す（定数データ） |
| `isInCamp` | `(date: GameDate) => boolean` | 合宿期間中かどうか |
| `isOffSeason` | `(date: GameDate) => boolean` | オフシーズンかどうか |
| `isTournamentPeriod` | `(date: GameDate) => 'summer' \| 'autumn' \| null` | 大会期間中か |

**年間スケジュール（MVP固定）:**

```
 4月 1日  入学式
 4月 2日  新チーム練習開始
 5月      （春季大会 = MVP省略）
 7月10日  夏の地方大会開始
 7月31日  夏の地方大会終了
 8月 7日  甲子園開始（出場時のみ）
 8月22日  甲子園終了
 8月23日  3年生引退
 8月24日  新チーム結成
 8月25日  夏合宿開始
 8月31日  夏合宿終了
 9月15日  秋季大会開始
10月15日  秋季大会終了
12月 1日  オフシーズン開始
12月25日  冬合宿開始
 1月 5日  冬合宿終了
 2月 1日  オフシーズン終了・春季練習開始
 3月 1日  卒業式
 3月31日  年度終了
```

#### `calendar/day-processor.ts`

| 関数 | シグネチャ | 責務 |
|------|-----------|------|
| `processDay` | `(state: GameState, menu: PracticeMenuId, rng: RNG) => DayProcessResult` | **Phase 1 の中核関数。** 1日分のすべての処理を実行し、更新後のGameStateとUI用サマリを返す |
| `processConditionPhase` | `(players: Player[], rng: RNG) => Player[]` | 朝: 全選手のコンディション更新 |
| `processPracticePhase` | `(players: Player[], menu: PracticeMenu, date: GameDate, rng: RNG) => Player[]` | 放課後: 練習効果適用 |
| `processRandomEvents` | `(state: GameState, rng: RNG) => GameEvent[]` | イベント発生判定 |
| `processEndOfDay` | `(players: Player[], rng: RNG) => Player[]` | 日終了: 疲労回復、怪我進行 |

**`processDay` のフロー:**

```
processDay(state, menu, rng):
  1. date = state.currentDate
  2. dayType = getDayType(date, schedule)
  3. players = state.team.players

  // 朝フェーズ
  4. players = processConditionPhase(players, rng)

  // 練習フェーズ（大会日・オフ日は別処理）
  5. if dayType === 'school_day' || dayType === 'holiday' || dayType === 'camp_day':
       practiceMenu = resolvePracticeMenu(menu, dayType)
       players = processPracticePhase(players, practiceMenu, date, rng)
     elif dayType === 'tournament_day':
       // Phase 2 で実装。Phase 1 では練習試合として簡易処理
       players = processSimplePracticeMatch(players, rng)
     elif dayType === 'off_day':
       // 全員休養
       players = applyRestToAll(players)

  // ランダムイベント
  6. events = processRandomEvents(state, rng)
     players = applyEvents(players, events)

  // 日終了フェーズ
  7. players = processEndOfDay(players, rng)

  // 日付進行
  8. newDate = advanceDate(date)

  // 年度替わり判定
  9. if newDate.month === 4 && newDate.day === 1:
       players, graduates = processYearTransition(state, rng)

  // 新しいGameStateを構築
  10. nextState = {
        ...state,
        currentDate: newDate,
        team: { ...state.team, players },
        graduates: [...state.graduates, ...graduates],
      }

  11. return { nextState, dayResult: DayResult { ... } }
```

---

## 6. 1-4 チーム管理

### 6.1 型定義

#### `types/team.ts`

```typescript
/** チーム */
export interface Team {
  id: string;
  name: string;                    // 学校名（例: "桜丘高校"）
  prefecture: string;              // 所属都道府県
  reputation: number;              // 学校の評判 0-100

  players: Player[];               // 全部員（1年〜3年）
  
  lineup: Lineup | null;           // 現在の打順・守備（未設定ならnull）

  // MVPでは固定
  facilities: FacilityLevel;       // 施設レベル
}

/** 打順・守備位置 */
export interface Lineup {
  starters: LineupSlot[];          // 9人（DH含まず、MVP固定）
  bench: string[];                 // ベンチ入り選手ID（順序あり）
  battingOrder: string[];          // 打順（9人のplayerId）。starters[i]のplayerIdと一致
}

/** 打順内の1スロット */
export interface LineupSlot {
  playerId: string;
  position: Position;
}

/** 施設レベル（MVP固定値） */
export interface FacilityLevel {
  ground: number;         // グラウンド 1-5
  bullpen: number;        // ブルペン 1-5
  battingCage: number;    // 打撃ケージ 1-5
  gym: number;            // トレーニング室 1-5
}

/** 監督（プレイヤー） */
export interface Manager {
  name: string;
  yearsActive: number;            // 監督就任年数
  fame: number;                   // 知名度 0-100
  totalWins: number;
  totalLosses: number;
  koshienAppearances: number;
  koshienWins: number;
}
```

### 6.2 関数の責務

#### `team/roster.ts`

| 関数 | シグネチャ | 責務 |
|------|-----------|------|
| `addPlayer` | `(team: Team, player: Player) => Team` | 選手をチームに追加 |
| `removePlayer` | `(team: Team, playerId: string) => Team` | 選手をチームから除外 |
| `getPlayersByGrade` | `(team: Team, grade: Grade, currentYear: number) => Player[]` | 学年で選手をフィルタ |
| `getActiveRoster` | `(team: Team) => Player[]` | 怪我中を除いた活動可能な選手一覧 |
| `getRosterSize` | `(team: Team) => number` | 部員数 |
| `findPlayerById` | `(team: Team, playerId: string) => Player \| undefined` | IDで選手検索 |

#### `team/lineup.ts`

| 関数 | シグネチャ | 責務 |
|------|-----------|------|
| `createLineup` | `(starters: LineupSlot[], bench: string[]) => Lineup` | 打順を作成（バリデーション付き） |
| `validateLineup` | `(lineup: Lineup, team: Team) => ValidationResult` | 打順の妥当性チェック |
| `autoGenerateLineup` | `(team: Team, currentYear: number) => Lineup` | 能力値ベースで打順を自動生成 |
| `swapBattingOrder` | `(lineup: Lineup, idx1: number, idx2: number) => Lineup` | 打順入れ替え |
| `substitutePlayer` | `(lineup: Lineup, outId: string, inId: string, position: Position) => Lineup` | 選手交代 |

```typescript
/** 打順バリデーション結果 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];   // 例: ['投手が指定されていません', '同一選手が重複しています']
}
```

**autoGenerateLineup のロジック:**

```
1. 投手: pitching !== null の選手からstamina, control, velocityの合計が最高の選手
2. 捕手: fielding + armStrength が最高の選手（投手除く）
3. 残り7人: fielding重視でポジション適性から割り当て
4. 打順:
   1番: speed最高
   2番: contact最高（1番除く）
   3番: contact+power合計最高（1,2番除く）
   4番: power最高（1-3番除く）
   5番: power次点
   6-8番: 残りを能力順
   9番: 投手（MVP固定）
```

#### `team/enrollment.ts`

| 関数 | シグネチャ | 責務 |
|------|-----------|------|
| `processGraduation` | `(team: Team, currentYear: number) => { team: Team; graduates: GraduateRecord[] }` | 3年生を卒業処理。チームから除外し、軽量サマリに変換して返す |
| `toGraduateRecord` | `(player: Player, graduationYear: number) => GraduateRecord` | Playerの全データから軽量なGraduateRecordを生成。能力値は主要指標に集約 |
| `processEnrollment` | `(team: Team, currentYear: number, reputation: number, rng: RNG) => { team: Team; newPlayers: Player[] }` | 新入生を自動生成してチームに追加 |
| `processYearTransition` | `(state: GameState, rng: RNG) => GameState` | 年度替わりの全処理を統合（卒業→入学→打順リセット） |

**新入生の人数決定:**

```
baseCount = 5 + floor(reputation / 10)   // 評判0→5人、評判100→15人
variance = rng.intBetween(-2, 2)
count = clamp(baseCount + variance, 3, 18)
```

---

## 7. 1-5 セーブ/ロード

### 7.1 型定義

#### `types/game-state.ts`

```typescript
/** ゲーム全体の状態（これが保存対象） */
export interface GameState {
  version: string;                 // セーブデータバージョン（マイグレーション用）
  seed: string;                    // 乱数シード文字列

  currentDate: GameDate;           // 現在のゲーム内日付
  team: Team;                      // プレイヤーのチーム
  manager: Manager;                // 監督データ

  graduates: GraduateRecord[];     // 卒業生（OBデータ、MVP最小版）
  
  settings: GameSettings;          // ゲーム設定
  
  // Phase 2以降で拡張
  // tournaments: TournamentState[];
  // scoutPool: ScoutCandidate[];
}

/** 卒業生記録（軽量サマリ。長期プレイ＆クラウドセーブを考慮） */
export interface GraduateRecord {
  // === 識別 ===
  playerId: string;              // 元のPlayer.id
  firstName: string;
  lastName: string;
  graduationYear: number;        // 卒業年度（ゲーム内年）
  enrollmentYear: number;        // 入学年度

  // === 卒業時ハイライト ===
  position: Position;            // メインポジション
  throwingHand: Hand;
  battingSide: BattingSide;

  // === 卒業時の能力スナップショット（主要値のみ） ===
  finalStats: {
    overall: number;             // 総合力（算出値: 全能力の加重平均）
    batting: number;             // 打撃総合（contact, power, eye, technique の平均）
    pitching: number | null;     // 投球総合（velocity正規化, control, pitchStamina の平均）。野手はnull
    speed: number;               // 走力
    defense: number;             // 守備力
  };
  growthType: GrowthType;
  traits: TraitId[];             // 性格特性

  // === 通算成績 ===
  careerStats: CareerRecord;     // 3年間の通算成績

  // === 将来（Phase 4 OBシステムで拡張） ===
  // careerPath: CareerPath | null;
  // proStats: ProSeasonRecord[];
}

/** ゲーム設定 */
export interface GameSettings {
  autoAdvanceSpeed: 'slow' | 'normal' | 'fast';
  showDetailedGrowth: boolean;     // 成長詳細表示ON/OFF
}

/** セーブスロットのメタデータ（一覧表示用） */
export interface SaveSlotMeta {
  slotId: string;                  // 'slot_1' 等
  schoolName: string;
  currentDate: GameDate;
  playTimeMinutes: number;         // プレイ時間
  savedAt: number;                 // Unix timestamp (ms)
  version: string;
}
```

### 7.2 Storage Adapter パターン

セーブ/ロードの永続化はプラットフォームごとに異なる。  
**エンジンはStorageAdapterインターフェースのみを知り、具体実装に依存しない。**

#### `platform/storage/adapter.ts`

```typescript
/** ストレージアダプターのインターフェース */
export interface StorageAdapter {
  /** セーブデータを保存 */
  putSave(slotId: string, data: SaveData): Promise<void>;
  
  /** セーブデータを取得。存在しなければnull */
  getSave(slotId: string): Promise<SaveData | null>;
  
  /** セーブデータを削除 */
  deleteSave(slotId: string): Promise<void>;
  
  /** 全スロットのメタデータ一覧 */
  listMeta(): Promise<SaveSlotMeta[]>;
  
  /** メタデータを保存 */
  putMeta(meta: SaveSlotMeta): Promise<void>;
  
  /** メタデータを削除 */
  deleteMeta(slotId: string): Promise<void>;
}

/** 保存データの構造 */
export interface SaveData {
  slotId: string;
  state: string;                // JSON文字列（シリアライズ済み）
  checksum: string;             // 改ざん検出用ハッシュ
}
```

#### `platform/storage/indexeddb.ts` — Web用の具体実装

```typescript
import Dexie, { Table } from 'dexie';
import type { StorageAdapter, SaveData } from './adapter';
import type { SaveSlotMeta } from '../../engine/types';

class GameDatabase extends Dexie {
  saves!: Table<SaveData>;
  meta!: Table<SaveSlotMeta>;

  constructor() {
    super('koushien-sim');
    this.version(1).stores({
      saves: 'slotId',
      meta: 'slotId',
    });
  }
}

/** IndexedDB を使った StorageAdapter 実装 */
export function createIndexedDBAdapter(): StorageAdapter {
  const db = new GameDatabase();

  return {
    putSave: (slotId, data) => db.saves.put(data),
    getSave: (slotId) => db.saves.get(slotId) ?? null,
    deleteSave: (slotId) => db.saves.delete(slotId),
    listMeta: () => db.meta.toArray(),
    putMeta: (meta) => db.meta.put(meta),
    deleteMeta: (slotId) => db.meta.delete(slotId),
  };
}
```

#### 将来のアダプター（v2以降で実装）

| アダプター | 対象 | 用途 |
|-----------|------|------|
| `indexeddb.ts` | Web (MVP) | ブラウザ版のローカル保存 |
| `sqlite.ts` | iOS/Android (v2) | Capacitor経由のSQLite保存 |
| `cloud.ts` | 全プラットフォーム (v2) | サーバーAPIへのクラウドセーブ |
| `memory.ts` | テスト | インメモリ実装（テスト用） |

### 7.3 関数の責務

#### `save/serializer.ts`

| 関数 | シグネチャ | 責務 |
|------|-----------|------|
| `serialize` | `(state: GameState) => string` | GameStateをJSON文字列に変換 |
| `deserialize` | `(json: string) => GameState` | JSON文字列からGameStateを復元。バリデーション付き |
| `computeChecksum` | `(json: string) => Promise<string>` | SHA-256チェックサム算出（Web Crypto API） |
| `validateSaveData` | `(data: unknown) => data is GameState` | 型ガードによるバリデーション |
| `migrateSaveData` | `(data: unknown, fromVersion: string) => GameState` | 旧バージョンからの変換（将来対応用の枠だけ） |

#### `save/save-manager.ts`

```typescript
/** SaveManagerはStorageAdapterを注入して使う */
export function createSaveManager(storage: StorageAdapter) {
  return {
    saveGame,
    loadGame,
    deleteSave,
    listSaves,
    exportSave,
    importSave,
    autoSave,
  };
}
```

| 関数 | シグネチャ | 責務 |
|------|-----------|------|
| `saveGame` | `(slotId: string, state: GameState) => Promise<void>` | ゲーム状態を保存 |
| `loadGame` | `(slotId: string) => Promise<GameState \| null>` | セーブデータをロード。なければnull |
| `deleteSave` | `(slotId: string) => Promise<void>` | セーブデータを削除 |
| `listSaves` | `() => Promise<SaveSlotMeta[]>` | 全セーブスロットのメタデータ一覧 |
| `exportSave` | `(slotId: string) => Promise<string>` | セーブデータをBase64エンコードした文字列で返す |
| `importSave` | `(slotId: string, encoded: string) => Promise<void>` | Base64文字列からセーブデータを復元 |
| `autoSave` | `(state: GameState) => Promise<void>` | 自動セーブ（固定スロット 'auto'） |

**自動セーブのタイミング:**
- 毎日の進行完了後
- 大会の試合前後
- 年度替わり処理後
- プレイヤーが手動セーブした時

### 7.4 License Manager（MVP: パススルースタブ）

#### `platform/license/types.ts`

```typescript
/** ライセンスの状態 */
export interface LicenseStatus {
  valid: boolean;               // ゲームプレイ可能か
  reason: LicenseReason;        // 状態の理由
  expiresAt: number | null;     // オフライン猶予の期限（Unix ms）。nullなら無期限
  plan: LicensePlan;
}

export type LicenseReason =
  | 'active'                    // 課金有効（オンライン確認済み）
  | 'offline_grace'             // オフライン猶予期間中
  | 'expired'                   // オフライン猶予切れ → 要オンライン
  | 'subscription_lapsed'       // 課金失効 → 要課金
  | 'not_authenticated'         // 未認証
  | 'dev_mode';                 // 開発モード（常に有効）

export type LicensePlan =
  | 'dev'                       // 開発モード
  | 'free_trial'
  | 'monthly'
  | 'annual'
  | 'lifetime';

/** ライセンスマネージャーのインターフェース */
export interface LicenseManager {
  /** 現在のライセンス状態を返す */
  getStatus(): Promise<LicenseStatus>;
  
  /** オンラインで認証を実行しトークンを更新 */
  authenticate(): Promise<LicenseStatus>;
  
  /** ライセンスが有効か（ゲーム進行を許可するか） */
  canPlay(): Promise<boolean>;
}
```

#### `platform/license/manager.ts` — MVP実装

```typescript
import type { LicenseManager, LicenseStatus } from './types';

/**
 * MVP用スタブ実装。常にdev_mode: validを返す。
 * v1.5でRealLicenseManagerに差し替え。
 */
export function createDevLicenseManager(): LicenseManager {
  const status: LicenseStatus = {
    valid: true,
    reason: 'dev_mode',
    expiresAt: null,
    plan: 'dev',
  };

  return {
    getStatus: async () => status,
    authenticate: async () => status,
    canPlay: async () => true,
  };
}

/**
 * v1.5で実装予定: サーバー認証を行うLicenseManager
 * 
 * authenticate() → POST /api/auth/license → JWT受領
 *   → ローカルに暗号化保存
 *   → expiresAt = now + 72時間
 * 
 * canPlay() →
 *   1. ローカルのトークンを読む
 *   2. 署名を検証（公開鍵埋め込み）
 *   3. expiresAt > now なら true
 *   4. 期限切れなら authenticate() を試行
 *   5. オフラインで authenticate() 失敗なら false
 */
// export function createRealLicenseManager(config: LicenseConfig): LicenseManager { ... }
```

### 7.5 Zustand ストアとの接続

```typescript
// src/stores/game-store.ts（Phase 1 で定義、UI統合は Phase 5）

import { create } from 'zustand';
import type { StorageAdapter } from '../platform/storage/adapter';
import type { LicenseManager } from '../platform/license/types';

interface GameStore {
  // === State ===
  gameState: GameState | null;      // ゲーム状態（ロード前はnull）
  isLoading: boolean;
  isPaused: boolean;
  licenseStatus: LicenseStatus | null;

  // === Injected Dependencies ===
  // StorageAdapterとLicenseManagerはストア初期化時に注入
  _storage: StorageAdapter;
  _license: LicenseManager;

  // === Actions ===
  init: () => Promise<void>;        // ライセンスチェック + 前回データロード
  newGame: (config: NewGameConfig) => Promise<void>;
  loadGame: (slotId: string) => Promise<void>;
  saveGame: (slotId?: string) => Promise<void>;
  
  advanceDay: (menu: PracticeMenuId) => DayProcessResult;
  advanceDays: (count: number, menu: PracticeMenuId) => DayProcessResult[];
  
  setLineup: (lineup: Lineup) => void;
  setPracticeMenu: (menu: PracticeMenuId) => void;

  checkLicense: () => Promise<boolean>;
}

/** 新規ゲーム設定 */
export interface NewGameConfig {
  schoolName: string;
  prefecture: string;
  managerName: string;
  seed?: string;                  // 指定しなければ自動生成
}
```

**ストア初期化の流れ（将来の認証フロー対応）:**

```
アプリ起動
  │
  ├─ (1) LicenseManager.getStatus()
  │       ├─ valid → (2) へ
  │       └─ invalid → LicenseGate 表示（ログイン or 課金案内）
  │
  ├─ (2) StorageAdapter.listMeta()
  │       前回の自動セーブがあれば → ロード案内
  │       なければ → 新規ゲーム案内
  │
  └─ (3) ゲーム開始
          ├─ advanceDay()前に canPlay() チェック
          └─ 24時間経過ごとに canPlay() 再チェック
```

---

## 8. データフロー

### 8.1 新規ゲーム開始

```
[UI] NewGameConfig
  │
  ▼
[GameStore] newGame()
  │
  ├─ (1) seed生成 → core/rng.ts
  ├─ (2) Team生成
  │     ├─ generatePlayer() × 20〜25人 → player/generate.ts
  │     └─ autoGenerateLineup() → team/lineup.ts
  ├─ (3) Manager生成
  ├─ (4) GameState組み立て
  │     └─ currentDate = { year: 1, month: 4, day: 1 }
  ├─ (5) autoSave() → save/save-manager.ts
  │
  ▼
[GameStore] gameState = 完成したGameState
```

### 8.2 1日の進行

```
[UI] advanceDay(menu)
  │
  ▼
[GameStore]
  │
  ├─ (1) rng = createRNG(state.seed + currentDate)
  │       ※日付をサブシードとして使い、同じ日を再計算しても同結果
  │
  ├─ (2) { nextState, dayResult } = processDay(state, menu, rng)
  │       │
  │       ├─ processConditionPhase()  ← growth/condition.ts
  │       │     各選手のMood再判定
  │       │
  │       ├─ processPracticePhase()   ← growth/calculate.ts
  │       │     練習メニューに基づく能力変動
  │       │     applyDailyGrowth() × 各選手
  │       │
  │       ├─ processRandomEvents()    ← calendar/day-processor.ts
  │       │     怪我・スランプ等のイベント判定
  │       │
  │       ├─ processEndOfDay()        ← growth/condition.ts
  │       │     疲労回復、怪我日数進行
  │       │
  │       ├─ advanceDate() + 年度替わり判定
  │       │
  │       └─ return { nextState, dayResult }
  │
  ├─ (3) gameState = nextState
  │
  ├─ (4) autoSave(nextState)
  │
  ▼
[GameStore] gameState更新 → UIに反映
           dayResult → UI表示（成長サマリ、イベント）
```

### 8.3 年度替わり

```
processYearTransition(state, rng)
  │
  ├─ (1) processGraduation()
  │       3年生をteam.playersから除外
  │       → toGraduateRecord()で軽量サマリに変換
  │       → graduates[]に追加
  │
  ├─ (2) processEnrollment()
  │       新1年生を生成（5〜15人）
  │       → team.playersに追加
  │
  ├─ (3) team.lineup = null
  │       打順リセット（再編成が必要）
  │
  ├─ (4) manager.yearsActive++
  │
  ├─ (5) team.reputation更新
  │       前年度の成績に応じて±5程度変動
  │
  ▼
  return 更新されたGameState
```

### 8.4 セーブ/ロード

```
セーブ:
  GameState
    → serialize(state) → JSON文字列
    → computeChecksum(json) → ハッシュ
    → StorageAdapter.putSave(slotId, { slotId, state: json, checksum })
    → StorageAdapter.putMeta({ slotId, schoolName, currentDate, ... })

ロード:
  StorageAdapter.getSave(slotId)
    → checksum検証
    → deserialize(json) → GameState
    → validateSaveData() → 型チェック
    → migrateSaveData() → バージョン変換（必要時）
    → GameStore.gameState = loaded

※ エンジン(save-manager)はStorageAdapterインターフェースのみ参照。
   Web版ではIndexedDBAdapter、ネイティブ版ではSQLiteAdapterを注入。
```

### 8.5 アプリ起動フロー（認証統合）

```
アプリ起動
  │
  ├─ (1) LicenseManager.getStatus()
  │       │
  │       ├─ valid (active / offline_grace / dev_mode)
  │       │   └─ (2) へ
  │       │
  │       ├─ expired (猶予期限切れ)
  │       │   ├─ オンライン → LicenseManager.authenticate()
  │       │   │   ├─ 成功 → (2) へ
  │       │   │   └─ 課金失効 → 課金案内画面
  │       │   └─ オフライン → 接続要求画面
  │       │
  │       └─ not_authenticated
  │           └─ ログイン画面
  │
  ├─ (2) SaveManager.listSaves()
  │       ├─ autoセーブあり → 「続きから」or「新規」選択
  │       └─ なし → 新規ゲーム画面
  │
  └─ (3) ゲームプレイ中
          ├─ advanceDay() 前に canPlay() チェック（24時間間隔）
          ├─ canPlay() = false → ゲーム一時停止 + 認証要求
          └─ セーブデータの閲覧は常に可能（ロックイン防止）
```

---

## 9. 認証・課金・アプリ化対応の設計方針

### 9.1 基本思想

> **エンジンはオフライン完結。認証/課金は「門番」であり「心臓」ではない。**

ゲームエンジン(`src/engine/`)は認証の有無に一切関知しない。  
LicenseManagerは**UIレイヤーとエンジンの間に立つゲートキーパー**であり、
エンジンの関数を呼べるかどうかを制御するだけ。

```
[認証/課金]          [ゲームロジック]
LicenseManager       Game Engine
    │                    │
    │  canPlay() ───►    │
    │  = true ──────►  advanceDay() 実行可能
    │  = false ─────►  UIが進行をブロック
    │                    │
    │  (エンジンは       │
    │   LicenseManager   │
    │   の存在を知らない) │
```

**これにより：**
- エンジンの単体テストに認証は不要
- LicenseManagerの実装を差し替えるだけでフリー版・有料版を切り替え可能
- アプリストア審査のリジェクト時も、課金ロジックのみ修正で対応

### 9.2 Phase 1 で実装するもの

| 項目 | 実装内容 | 工数 |
|------|---------|------|
| `StorageAdapter` インターフェース | 永続化の抽象化。IndexedDB実装 | 0.5日 |
| `LicenseManager` インターフェース | ライセンスチェックの抽象化 | 0.5日 |
| `DevLicenseManager` | 常に `valid: true` を返すスタブ | 含む |
| `MemoryStorageAdapter` | テスト用インメモリ実装 | 含む |
| Zustand ストアへの DI 構造 | StorageAdapter / LicenseManager を注入可能に | 含む |

**Phase 1 の合計追加工数: 約1日**

### 9.3 ローカル vs サーバーのデータ責務

| データ | 保存場所 | 所有権 | 備考 |
|--------|---------|--------|------|
| **GameState（セーブデータ）** | ローカル | ユーザー | 正規ソース。クラウドはバックアップ |
| **ライセンストークン** | ローカル（暗号化） | サーバーが発行 | オフライン猶予判定に使用 |
| **マスターデータ（名前辞書等）** | クライアントバンドル | アプリ | オフライン必須 |
| **ユーザーアカウント** | サーバー | サーバー | v1.5で実装 |
| **課金状態** | サーバー | サーバー | v1.5で実装 |
| **クラウドセーブ** | サーバー (S3等) | ユーザー | v2で実装。ローカルが正、サーバーが副 |
| **プレイ統計** | サーバー | サーバー | v2で実装 |

### 9.4 オフラインプレイ仕様

#### 猶予期間

| 項目 | 値 |
|------|-----|
| オフライン猶予期間 | 最終認証成功から **72時間（3日間）** |
| 認証チェック間隔 | アプリ起動時 + 24時間ごと |
| 猶予延長 | オンライン認証成功のたびにリセット |

#### 状態遷移

```
                    認証成功
                  ┌─────────┐
                  ▼         │
  ┌───────┐   ┌──────┐  ┌──┴──────┐
  │ 未認証 │──►│ 有効  │──► オフライン │
  └───────┘   │      │  │ 猶予中    │
   ログイン   └──────┘  └─────────┘
   必須          │          │
                 │ 課金失効  │ 72時間経過
                 ▼          ▼
              ┌──────┐  ┌─────────┐
              │ 課金  │  │ 猶予切れ │
              │ 失効  │  │（要接続）│
              └──────┘  └─────────┘
```

#### 各状態でのUI挙動

| 状態 | ゲーム進行 | セーブデータ閲覧 | 表示内容 |
|------|----------|---------------|---------|
| **有効** | ✅ 可能 | ✅ 可能 | 通常プレイ |
| **オフライン猶予中** | ✅ 可能 | ✅ 可能 | 残り時間をステータスバーに表示 |
| **猶予切れ** | ❌ 不可 | ✅ 可能 | 「インターネットに接続してください」|
| **課金失効** | ❌ 不可 | ✅ 可能 | 「サブスクリプションを更新してください」|
| **未認証** | ❌ 不可 | ❌ 不可 | ログイン画面 |

**重要: セーブデータの閲覧は課金失効時も可能。** ユーザーのデータをロックインしない。

### 9.5 アプリ化対応のための設計制約（Phase 1 で遵守）

#### 絶対ルール

| # | ルール | 理由 |
|---|--------|------|
| 1 | `src/engine/` からブラウザAPIを直接importしない | Capacitor/React Native環境でも動くため |
| 2 | `src/engine/` からReact/DOMをimportしない | エンジンはUIフレームワーク非依存 |
| 3 | IndexedDB/localStorage への直接アクセスは `platform/storage/` のみ | ネイティブではSQLiteに差し替えるため |
| 4 | `window`, `document`, `navigator` を `engine/` 内で参照しない | Node.js環境でのテスト実行を保証 |
| 5 | 永続化は全て `StorageAdapter` 経由 | アダプター差し替えでマルチプラットフォーム対応 |
| 6 | ゲーム進行の入口（advanceDay等）は `canPlay()` チェック可能な構造にする | LicenseGateを後から挟める |
| 7 | 日時取得は `Date.now()` 直接呼びではなく、注入可能にする（テスト用） | タイムトラベルテスト対応 |

#### 推奨（Phase 1 で意識するが必須ではない）

| # | ルール | 理由 |
|---|--------|------|
| 1 | CSSフレームワークのタッチデバイス対応 | アプリ化時のUI修正を最小化 |
| 2 | 画面サイズ320px〜でのレスポンシブ対応 | スマホでのプレイ |
| 3 | Canvas描画のDPI対応 | Retinaディスプレイ |

### 9.6 セーブデータの不正防止方針

| 層 | 対策 | 実装時期 |
|----|------|---------|
| **L1: チェックサム** | SHA-256ハッシュで改ざん検出 | Phase 1 (MVP) |
| **L2: 暗号化** | AES-GCMでセーブデータを暗号化。鍵はデバイスIDベース | v1.5 |
| **L3: サーバー検証** | クラウドセーブ時にサーバー側でバリデーション | v2 |
| **L4: プレイログ** | 進行操作のハッシュチェーンで整合性検証 | v3（オンライン対戦時） |

MVP（Phase 1）ではL1のみ実装。改ざんは検出できるが防止はしない（シングルプレイなので問題なし）。

### 9.7 将来の課金モデル候補

Phase 1 では実装しないが、設計上は以下のいずれにも対応可能にしておく：

| モデル | 特徴 | LicenseManager上の表現 |
|--------|------|----------------------|
| **月額サブスクリプション** | 毎月課金。解約で猶予期間後にプレイ不可 | `plan: 'monthly'`, `subscriptionExpiresAt` で制御 |
| **年額サブスクリプション** | 割安な年間プラン | `plan: 'annual'`, 同上 |
| **買い切り** | 一度の支払いで永久プレイ | `plan: 'lifetime'`, `expiresAt: null` |
| **フリーミアム** | 基本無料 + 有料DLC | `plan: 'free_trial'` + `features[]` でDLC制御 |

---

## 10. MVP最小実装で省略するもの

### 10.1 Phase 1 の省略事項

| 項目 | 省略理由 | 代替 |
|------|---------|------|
| **イベントの選択肢** | Phase 3 で実装 | イベントは通知のみ（選択なし） |
| **人間関係** | 複雑度が高い | 完全に省略。Phase 3 で追加 |
| **精神フラグの詳細効果** | バランス調整が必要 | フラグは付与するが効果は限定的 |
| **容姿データ** | UI表現の前提がない | 完全に省略 |
| **OBの詳細追跡** | Phase 4 の範囲 | 卒業生はスナップショット保存のみ |
| **複数セーブスロット** | 最小は1スロット | `slot_1` + `auto` の2スロットのみ |
| **セーブデータ圧縮** | データ量が小さい | JSON素のまま |
| **サブポジション** | 複雑度が高い | メインポジション1つのみ |
| **変化球習得イベント** | Phase 3 | 入学時に持っている球種で固定 |
| **練習試合** | Phase 2 の試合エンジンが必要 | 大会日は「練習試合(簡易)」として経験値だけ加算 |
| **スカウト** | Phase 4 | 新入生は全自動入部 |
| **バランス調整** | 後工程で繰り返し | 定数はconstants.tsに集約。テストで確認 |
| **サーバー認証** | v1.5 | DevLicenseManager（常にvalid）で代替 |
| **課金処理** | v1.5 | 未実装。LicenseManagerインターフェースだけ準備 |
| **クラウドセーブ** | v2 | ローカルStorageAdapterのみ実装 |
| **SQLite Adapter** | v2（アプリ化時） | IndexedDB Adapterのみ実装 |
| **セーブデータ暗号化** | v1.5 | チェックサムのみ |

### 10.2 型定義に含めるが実装しないフィールド

以下のフィールドは型定義に **含める**（将来の拡張時に型変更を最小化するため）が、Phase 1 では **デフォルト値を入れるだけ**：

| フィールド | Phase 1 のデフォルト値 |
|-----------|----------------------|
| `Player.subPositions` | `[]`（空配列） |
| `Player.mentalState.flags` | `[]`（空配列。slump/zone は Phase 1 で最低限実装） |
| `Player.careerStats` | 全フィールド `0` |
| `Team.facilities` | `{ ground: 3, bullpen: 3, battingCage: 3, gym: 3 }`（固定） |
| `GameState.graduates` | `[]`（卒業処理で追加される） |

---

## 11. テスト観点

### 11.1 モジュール別テスト

#### player/generate

| テストケース | 検証内容 |
|-------------|---------|
| 選手生成の完全性 | 生成されたPlayerが全必須フィールドを持つ |
| 能力値の範囲 | 全能力値が定義範囲内（1-100, 球速80-160等） |
| 性格特性の整合性 | 矛盾する特性が共存しない（例: leaderとshy） |
| シード再現性 | 同じシードで同じ選手が生成される |
| 学校評判の影響 | reputation高→平均能力高、reputation低→平均能力低 |
| ポジション分布 | 20人生成時に投手が2-4人含まれる |

#### growth/calculate

| テストケース | 検証内容 |
|-------------|---------|
| 基本成長 | 練習メニューに応じて対象能力が上昇する |
| 天井制限 | ceiling付近で成長率が鈍化する |
| ceilingを超えない | どんな条件でもceilingを超過しない |
| 成長タイプの差 | 早熟1年生 > 普通1年生 > 晩成1年生 の成長速度 |
| コンディション影響 | 絶好調 > 普通 > 絶不調 の成長量 |
| 疲労影響 | 高疲労時に成長量が低下する |
| 合宿ボーナス | 合宿期間は1.5倍の成長 |

#### growth/condition

| テストケース | 検証内容 |
|-------------|---------|
| 疲労加算 | 練習で疲労が増加する |
| 疲労回復 | 通常日で回復。休養日はさらに回復 |
| 疲労上限 | 100を超えない |
| 怪我発生 | 高疲労時に怪我確率が上がる |
| 怪我回復 | remainingDaysが0になったら怪我解除 |
| Mood分布 | 1000回試行でおおむね期待分布に収束 |

#### calendar/day-processor

| テストケース | 検証内容 |
|-------------|---------|
| 1日進行 | processDay後にcurrentDateが1日進む |
| 月末処理 | 4/30 → 5/1 に正しく進む |
| 年末処理 | 3/31 → 4/1 + 年度替わり処理 |
| 日種別判定 | 大会期間は'tournament_day'が返る |
| 合宿倍率 | 合宿期間中はseasonMultiplier=1.5 |
| 1年通し | 4/1→翌3/31を365回ループしてエラーなし |

#### team/roster & lineup

| テストケース | 検証内容 |
|-------------|---------|
| 追加・削除 | addPlayer/removePlayerで部員数が変動 |
| 学年フィルタ | 正しい学年の選手のみ返る |
| 打順バリデーション | 投手なし→エラー、重複→エラー |
| 自動打順 | autoGenerateLineupが有効な打順を返す |
| 選手交代 | substitute後にポジション・IDが正しい |

#### team/enrollment

| テストケース | 検証内容 |
|-------------|---------|
| 卒業処理 | 3年生がチームから除外される |
| 卒業生記録 | GraduateRecordが正しく生成される（全必須フィールド埋まり、サイズがPlayer比で軽量） |
| 入学処理 | 新1年生が追加される |
| 入部人数 | reputation依存で5-15人の範囲 |
| 年度替わり統合 | 卒業→入学→打順リセットが一連で動く |

#### save

| テストケース | 検証内容 |
|-------------|---------|
| 保存→復元 | saveGame→loadGameで同一のGameStateが復元される |
| チェックサム | データ改ざんでチェックサム不一致を検出 |
| 存在しないスロット | loadGameがnullを返す |
| メタデータ | listSavesが正しいメタ情報を返す |
| エクスポート/インポート | exportSave→importSaveで復元可能 |
| StorageAdapter差し替え | MemoryStorageAdapterで全テストがPass |

#### platform/license

| テストケース | 検証内容 |
|-------------|---------|
| DevLicenseManager | canPlay()が常にtrueを返す |
| LicenseManagerインターフェース | 全メソッドが呼び出し可能 |

### 11.2 統合テスト

| テストケース | 検証内容 |
|-------------|---------|
| **1年間シミュレーション** | newGame→365日advanceDay→年度替わり。エラーなし＆パフォーマンス<10秒 |
| **3年間シミュレーション** | 3年間通し。卒業3回、入学3回。部員数が妥当な範囲を維持 |
| **5年間シミュレーション** | 5年間通し。メモリリークなし。GameStateのサイズが妥当 |
| **成長曲線** | 3年間の平均能力値推移をグラフ化（手動確認） |
| **セーブ/ロード往復** | 任意のタイミングでセーブ→ロード→継続が可能 |

### 11.3 プロパティベーステスト（推奨）

```typescript
// fast-check を使ったプロパティベーステスト例
import fc from 'fast-check';

// 「どんなシードでも、生成された選手の能力値は範囲内」
fc.assert(
  fc.property(fc.string(), (seed) => {
    const rng = createRNG(seed);
    const player = generatePlayer(rng, { enrollmentYear: 1, schoolReputation: 50 });
    return player.stats.base.stamina >= 1 && player.stats.base.stamina <= 100;
  })
);
```

---

## 12. 実装順序

### 12.1 ステップ分解

```
Week 1: 基盤 + 選手モデル
─────────────────────────────────────
Step 1.  プロジェクトセットアップ                    [0.5日]
         - Next.js + TypeScript + Vitest + Dexie.js 初期設定
         - ディレクトリ構成作成
         - ESLint, Prettier設定

Step 2.  core/ 実装                                  [0.5日]
         - rng.ts: seedrandom ラッパー
         - id.ts: UUID生成（crypto.randomUUID）

Step 3.  types/ 全型定義                             [1日]
         - player.ts, team.ts, calendar.ts, game-state.ts
         - 型だけでコンパイルが通ることを確認

Step 3b. platform/ 基盤                              [0.5日]
         - storage/adapter.ts: StorageAdapterインターフェース
         - storage/indexeddb.ts: IndexedDB実装
         - storage/memory.ts: テスト用インメモリ実装
         - license/types.ts: LicenseManagerインターフェース
         - license/manager.ts: DevLicenseManager（スタブ）

Step 4.  player/name-dict.ts                         [0.5日]
         - 姓200件、名200件の辞書データ

Step 5.  player/generate.ts                          [1.5日]
         - generatePlayer + 下位関数すべて
         - テスト: 生成の完全性、範囲、再現性

Week 2: 成長エンジン + カレンダー
─────────────────────────────────────
Step 6.  growth/constants.ts + growth/practice.ts    [0.5日]
         - 全定数定義
         - 9種の練習メニュー定義

Step 7.  growth/condition.ts                         [1日]
         - コンディション判定、疲労管理、怪我
         - テスト: 疲労加減算、怪我発生/回復

Step 8.  growth/calculate.ts                         [1.5日]
         - 成長計算の中核ロジック
         - テスト: 成長量、天井、タイプ差

Step 9.  calendar/game-calendar.ts + schedule.ts     [1日]
         - 日付操作、年間スケジュール
         - テスト: 日付進行、月末/年末

Step 10. calendar/day-processor.ts                   [1日]
         - processDay の実装
         - テスト: 1日分の進行が正しく動く

Week 3: チーム + セーブ + 統合
─────────────────────────────────────
Step 11. team/roster.ts                              [0.5日]
         - 部員管理CRUD

Step 12. team/lineup.ts                              [1日]
         - 打順管理、バリデーション、自動生成
         - テスト: バリデーション、自動生成

Step 13. team/enrollment.ts                          [1日]
         - 卒業、入学、年度替わり
         - テスト: 3年生除外、新入生追加、統合

Step 14. save/ 全体                                  [1日]
         - serializer.ts, save-manager.ts
         - SaveManagerはStorageAdapterを注入して構築
         - テスト: MemoryStorageAdapterで保存→復元往復

Step 15. stores/game-store.ts                        [0.5日]
         - Zustandストア定義
         - StorageAdapter + LicenseManager を注入
         - newGame, advanceDay, saveGame, loadGame

Step 16. 統合テスト                                  [1日]
         - 1年間/3年間/5年間シミュレーション
         - パフォーマンス計測
         - エッジケース修正
```

### 12.2 依存関係図

```
Step 1 (setup)
  ↓
Step 2 (core)
  ↓
Step 3 (types) ──────────────────────────────┐
  ↓                                           │
Step 3b (platform) ←──────────────────────────┤
  │                                           │
Step 4 (name-dict)                            │
  ↓                                           │
Step 5 (generate) ←───────────────────────────┤
  │                                           │
  │    Step 6 (constants, practice) ←─────────┤
  │      ↓                                    │
  │    Step 7 (condition) ←───────────────────┤
  │      ↓                                    │
  │    Step 8 (calculate) ←───── Step 7       │
  │      │                                    │
  │    Step 9 (calendar) ←────────────────────┤
  │      ↓                                    │
  │    Step 10 (day-processor) ←── Step 8,9   │
  │      │                                    │
  ├──→ Step 11 (roster) ←────────────────────┤
  │      ↓                                    │
  │    Step 12 (lineup) ←── Step 11           │
  │      ↓                                    │
  │    Step 13 (enrollment) ←── Step 5,11     │
  │      │                                    │
  │    Step 14 (save) ←── Step 3b (platform)  │
  │      │                                    │
  └──→ Step 15 (store) ←── Step 10,13,14,3b  │
         ↓                                    │
       Step 16 (統合テスト)                    │
```

### 12.3 マイルストーン

| マイルストーン | 完了条件 | 想定日 |
|-------------|---------|--------|
| **M1: 選手が生まれる** | generatePlayerで選手が生成され、全テストPass | Week 1 末 |
| **M1b: 基盤が整う** | StorageAdapter + LicenseManagerのインターフェースとスタブが動作 | Week 1 末 |
| **M2: 選手が成長する** | 1日の練習で能力値が変動する | Week 2 中盤 |
| **M3: 時が流れる** | 365日進めて年度替わりが正しく処理される | Week 2 末 |
| **M4: 記録が残る** | StorageAdapter経由でセーブ→ロードが動作する | Week 3 中盤 |
| **M5: Phase 1 完了** | 5年間シミュレーションがエラーなしで完走 | Week 3 末 |

---

## 13. ディレクトリ構成

Phase 1 完了時点の具体的なファイル構成：

```
koushien-sim/
├── src/
│   ├── engine/
│   │   ├── types/
│   │   │   ├── player.ts              # 選手関連の全型定義
│   │   │   ├── team.ts                # チーム関連の全型定義
│   │   │   ├── calendar.ts            # カレンダー・練習関連の型定義
│   │   │   ├── game-state.ts          # ゲーム全体状態の型定義
│   │   │   └── index.ts              # re-export
│   │   │
│   │   ├── core/
│   │   │   ├── rng.ts                 # seedrandom ラッパー
│   │   │   ├── id.ts                  # UUID 生成
│   │   │   └── index.ts
│   │   │
│   │   ├── player/
│   │   │   ├── generate.ts            # 選手自動生成ロジック
│   │   │   ├── name-dict.ts           # 姓名辞書データ
│   │   │   └── index.ts
│   │   │
│   │   ├── growth/
│   │   │   ├── calculate.ts           # 成長計算ロジック
│   │   │   ├── condition.ts           # コンディション・疲労・怪我
│   │   │   ├── practice.ts            # 練習メニュー定義
│   │   │   ├── constants.ts           # バランス定数
│   │   │   └── index.ts
│   │   │
│   │   ├── calendar/
│   │   │   ├── game-calendar.ts       # 日付操作ユーティリティ
│   │   │   ├── schedule.ts            # 年間スケジュール定義
│   │   │   ├── day-processor.ts       # 1日の進行処理
│   │   │   └── index.ts
│   │   │
│   │   ├── team/
│   │   │   ├── roster.ts              # 部員管理
│   │   │   ├── lineup.ts              # 打順・守備位置管理
│   │   │   ├── enrollment.ts          # 入学・卒業処理
│   │   │   └── index.ts
│   │   │
│   │   ├── save/
│   │   │   ├── serializer.ts          # シリアライズ/デシリアライズ
│   │   │   ├── save-manager.ts        # セーブ/ロードAPI（StorageAdapter注入）
│   │   │   └── index.ts
│   │   │
│   │   └── index.ts                   # エンジン公開API
│   │
│   ├── platform/                       # プラットフォーム抽象化レイヤー
│   │   ├── storage/
│   │   │   ├── adapter.ts             # StorageAdapter インターフェース
│   │   │   ├── indexeddb.ts           # Web用 IndexedDB 実装
│   │   │   ├── memory.ts             # テスト用インメモリ実装
│   │   │   └── index.ts
│   │   ├── license/
│   │   │   ├── types.ts              # LicenseManager インターフェース
│   │   │   ├── manager.ts            # DevLicenseManager（MVPスタブ）
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── stores/
│   │   └── game-store.ts              # Zustand ストア（DI対応）
│   │
│   └── data/
│       └── (Phase 1では空。名前辞書はengine内に含む)
│
├── tests/
│   ├── engine/
│   │   ├── player/
│   │   │   └── generate.test.ts
│   │   ├── growth/
│   │   │   ├── calculate.test.ts
│   │   │   └── condition.test.ts
│   │   ├── calendar/
│   │   │   ├── game-calendar.test.ts
│   │   │   └── day-processor.test.ts
│   │   ├── team/
│   │   │   ├── roster.test.ts
│   │   │   ├── lineup.test.ts
│   │   │   └── enrollment.test.ts
│   │   ├── save/
│   │   │   └── save-manager.test.ts
│   │   └── integration/
│   │       ├── one-year.test.ts       # 1年間シミュレーション
│   │       ├── three-years.test.ts    # 3年間シミュレーション
│   │       └── five-years.test.ts     # 5年間シミュレーション
│   ├── platform/
│   │   ├── storage.test.ts            # StorageAdapter テスト
│   │   └── license.test.ts            # LicenseManager テスト
│   └── setup.ts                       # テストセットアップ（fake-indexeddb等）
│
├── docs/
│   ├── SPEC-MVP.md                    # MVP全体仕様書
│   └── DESIGN-PHASE1.md              # ← この文書
│
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── next.config.ts
```

---

## 付録A: core/rng.ts 設計

```typescript
import seedrandom from 'seedrandom';

/** シード付き乱数生成器 */
export interface RNG {
  /** 0以上1未満の浮動小数点数 */
  next(): number;
  
  /** min以上max以下の整数 */
  intBetween(min: number, max: number): number;
  
  /** 配列からランダムに1つ選ぶ */
  pick<T>(arr: readonly T[]): T;
  
  /** 配列からランダムにn個選ぶ（重複なし） */
  pickN<T>(arr: readonly T[], n: number): T[];
  
  /** 正規分布に従う乱数（Box-Muller変換） */
  gaussian(mean: number, stddev: number): number;
  
  /** 確率p（0-1）でtrueを返す */
  chance(p: number): boolean;
  
  /** サブシードを生成（用途別に分岐させる） */
  derive(subseed: string): RNG;
}

export function createRNG(seed: string): RNG {
  const prng = seedrandom(seed);
  
  return {
    next: () => prng(),
    
    intBetween: (min, max) => min + Math.floor(prng() * (max - min + 1)),
    
    pick: (arr) => arr[Math.floor(prng() * arr.length)],
    
    pickN: (arr, n) => {
      const shuffled = [...arr];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled.slice(0, n);
    },
    
    gaussian: (mean, stddev) => {
      const u1 = prng();
      const u2 = prng();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return mean + z * stddev;
    },
    
    chance: (p) => prng() < p,
    
    derive: (subseed) => createRNG(seed + ':' + subseed),
  };
}
```

---

## 付録B: 性格特性の矛盾ルール

生成時に以下の組み合わせは排除する：

| 特性A | 特性B | 理由 |
|-------|-------|------|
| `leader` | `shy` | リーダーと人見知りは矛盾 |
| `passionate` | `calm` | 熱血と冷静は同時に持てない |
| `hard_worker` | `slacker` | 努力家とサボり癖は矛盾 |
| `overconfident` | `self_doubt` | 自信過剰と自己否定は矛盾 |
| `honest` | `rebellious` | 素直と反抗的は矛盾 |
| `caring` | `lone_wolf` | 思いやりと一匹狼は矛盾 |

---

## 付録C: パフォーマンスバジェット

| 処理 | 1回の許容時間 | 根拠 |
|------|-------------|------|
| `generatePlayer` | < 5ms | 20人生成で100ms以内 |
| `processDay` | < 50ms | 高速早送り時に20fps相当 |
| `processDay × 365` | < 5秒 | 1年間の早送り |
| `processYearTransition` | < 200ms | 卒業+入学+生成 |
| `saveGame` | < 500ms | IndexedDB書き込み |
| `loadGame` | < 500ms | IndexedDB読み込み+デシリアライズ |
| `GameState JSON size` | < 2MB / 年 | 5年分で10MB以内 |

---

> **次のステップ**: この設計書のレビュー → 合意後、Step 1（プロジェクトセットアップ）から実装開始
