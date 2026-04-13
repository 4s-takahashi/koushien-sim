# Phase 3 設計拡張: 人物台帳DB・成長カーブ・運用設計

> バージョン: 0.3.0  
> 作成日: 2026-04-13  
> 前提: DESIGN-PHASE3-WORLD.md (v0.2.0) を拡張  
> ステータス: 設計レビュー中

---

## 目次

1. [v0.2.0 からの差分サマリ](#1-v020-からの差分サマリ)
2. [静的データと動的データの分離方針](#2-静的データと動的データの分離方針)
3. [人物台帳DB設計](#3-人物台帳db設計)
4. [成長カーブ設計](#4-成長カーブ設計)
5. [Tier 昇格・降格条件](#5-tier-昇格降格条件)
6. [PersonRegistry 保持ポリシー](#6-personregistry-保持ポリシー)
7. [年度替わりトランザクション境界](#7-年度替わりトランザクション境界)
8. [Genspark Claw 運用フロー](#8-genspark-claw-運用フロー)
9. [各 Tier の DB参照・動的更新の範囲](#9-各-tier-の-db参照動的更新の範囲)
10. [既存コードへの影響分析](#10-既存コードへの影響分析)
11. [テスト追加項目](#11-テスト追加項目)

---

## 1. v0.2.0 からの差分サマリ

### 1.1 アーキテクチャ変更

| 項目 | v0.2.0 | v0.3.0 |
|------|--------|--------|
| 人物の生まれ方 | ゲーム起動時にRNGで全員生成 | **Web DB上に事前生成された人物台帳から読み込む** |
| データの所在 | 全て WorldState 内 | **静的マスタ(DB) + 動的ランタイム(WorldState)** に分離 |
| 成長パラメータ | `growthRate` (単一数値) + `growthType` (4種) | **能力値ごとに成長率・ピーク時期・揺らぎ・スランプリスクを保持** |
| 人物の追加・補正 | なし（全てゲーム内RNG） | **Genspark Claw が年度ごとに追加生成・手動補正** |
| PersonRegistry | ランタイムのみ | **DB上の静的台帳 + ランタイムの動的状態の二層構造** |

### 1.2 新規追加の設計

| 設計項目 | 内容 |
|---------|------|
| 人物台帳DBスキーマ | PostgreSQL/SQLite のテーブル設計 |
| PersonBlueprint | 静的な人物の「設計図」型 |
| GrowthProfile | 能力値ごとの成長率・ピーク・揺らぎ |
| StatGrowthCurve | 1つの能力値に対する成長カーブ定義 |
| Claw運用フロー | 年度ごとの追加生成・補正のワークフロー |
| DB↔ランタイム同期 | 静的DBとゲーム内状態の責務分離 |

### 1.3 v0.2.0 から維持する設計

- WorldState の基本構造（schools[], middleSchoolPool, personRegistry）
- 計算粒度3段階（Full/Standard/Minimal）の概念
- 試合シミュレーション3種（runGame/quickGame/statGame）
- ライフサイクル（中学→高校→卒業）の概念
- ViewState Projector によるUI分離
- Phase 3.0 / 3.5 / 4.0 の段階分け

---

## 2. 静的データと動的データの分離方針

### 2.1 核心原則

> **人物の「DNA」はDB上に不変で存在する。ゲームが変えるのは「今の状態」だけ。**

```
┌──────────────────────────────────────────────────────────┐
│  人物台帳DB（静的・不変・事前生成）                         │
│                                                          │
│  PersonBlueprint                                         │
│  ├── id: "p_20260401_0001"                               │
│  ├── 名前: 田中 太郎                                      │
│  ├── 身体: 身長175, 体重68, 投右打左                       │
│  ├── 素質: ポジション適性, 特性(traits)                    │
│  ├── 成長カーブ: 能力値ごとの成長率・ピーク時期・揺らぎ    │
│  ├── ポテンシャル天井: 能力値ごとの上限                    │
│  └── 出自: 出身地, 中学校名, 性格タイプ                    │
│                                                          │
│  → ゲーム開始後は書き換えない                              │
│  → Claw が年度ごとに新しい世代を追加生成                   │
└──────────────────────────┬───────────────────────────────┘
                           │ 読み取り
                           ▼
┌──────────────────────────────────────────────────────────┐
│  ランタイム状態（動的・ゲーム中に変化）                     │
│                                                          │
│  PersonState                                             │
│  ├── blueprintId: "p_20260401_0001" ← DB参照             │
│  ├── 現在能力値: { contact: 45, power: 38, ... }          │
│  ├── コンディション: { fatigue: 23, injury: null, ... }   │
│  ├── メンタル: { mood: 'good', stress: 15, ... }          │
│  ├── 所属: { schoolId: "sch_01", grade: 2 }               │
│  ├── 通算成績: { gamesPlayed: 47, hits: 38, ... }         │
│  ├── イベント履歴: [ ... ]                                 │
│  └── 累積成長量: { contactGained: 12.5, ... }              │
│                                                          │
│  → ゲームの進行で常に変化する                              │
│  → セーブデータに含まれる                                  │
└──────────────────────────────────────────────────────────┘
```

### 2.2 分離の原則

| データ | 所在 | 変更タイミング | 変更者 |
|--------|------|---------------|--------|
| 名前、身体情報 | DB | 生成時のみ | Claw |
| 成長カーブ定義 | DB | 生成時のみ（補正可） | Claw |
| ポテンシャル天井 | DB | 生成時のみ（補正可） | Claw |
| 特性（traits） | DB | 生成時のみ（補正可） | Claw |
| 出身情報 | DB | 生成時のみ | Claw |
| 現在能力値 | ランタイム | 毎日 | ゲームエンジン |
| コンディション | ランタイム | 毎日 | ゲームエンジン |
| 所属チーム | ランタイム | 年度替わり | ゲームエンジン |
| 通算成績 | ランタイム | 試合ごと | ゲームエンジン |
| イベント履歴 | ランタイム | イベント発生時 | ゲームエンジン |
| 累積成長量 | ランタイム | 毎日 | ゲームエンジン |

### 2.3 既存の Player 型との関係

```typescript
// 現行の Player 型（Phase 1/2）
interface Player {
  id: string;               // → blueprintId への参照に変更
  firstName: string;         // → PersonBlueprint から読み取り（ランタイムにもコピー保持）
  lastName: string;          // → 同上
  enrollmentYear: number;    // → PersonState.enrollment で管理
  position: Position;        // → PersonBlueprint.primaryPosition（ランタイムでも保持）
  subPositions: Position[];  // → PersonBlueprint.subPositions
  battingSide: BattingSide;  // → PersonBlueprint.battingSide
  throwingHand: Hand;        // → PersonBlueprint.throwingHand
  height: number;            // → PersonBlueprint.height
  weight: number;            // → PersonBlueprint.weight
  stats: PlayerStats;        // → PersonState.currentStats（動的）
  potential: PotentialStats;  // → PersonBlueprint.growthProfile + PersonBlueprint.ceilings（静的）
  condition: ConditionState;  // → PersonState.condition（動的）
  traits: TraitId[];          // → PersonBlueprint.traits（静的）
  mentalState: MentalState;   // → PersonState.mentalState（動的）
  background: Background;     // → PersonBlueprint.background（静的）
  careerStats: CareerRecord;  // → PersonState.careerStats（動的）
}
```

**互換レイヤー:** 既存の `Player` 型はランタイムで引き続き使う。`PersonBlueprint` + `PersonState` から `Player` を合成する関数を提供:

```typescript
/**
 * DB上の静的設計図 + ランタイム動的状態 → 既存 Player 型に合成。
 * Phase 1/2 の全関数はこの Player 型で動作するため、破壊的変更なし。
 */
export function hydratePlayer(
  blueprint: PersonBlueprint,
  state: PersonState,
  currentYear: number,
): Player;
```

---

## 3. 人物台帳DB設計

### 3.1 テーブル設計

```sql
-- ===========================================
-- 人物台帳DB（PostgreSQL / SQLite 互換）
-- ===========================================

-- 世代テーブル: Claw が年度ごとに生成するバッチ単位
CREATE TABLE generations (
  id            TEXT PRIMARY KEY,         -- "gen_2026" (年度ID)
  game_year     INTEGER NOT NULL,         -- ゲーム内年度
  prefecture    TEXT NOT NULL,            -- 都道府県
  created_at    TIMESTAMP NOT NULL,       -- 生成日時
  created_by    TEXT NOT NULL,            -- "claw_auto" | "claw_manual" | "seed_init"
  person_count  INTEGER NOT NULL,         -- この世代の人数
  notes         TEXT                      -- 生成時のメモ
);

-- 人物設計図テーブル
CREATE TABLE person_blueprints (
  id              TEXT PRIMARY KEY,        -- "pb_20260401_0001"
  generation_id   TEXT NOT NULL REFERENCES generations(id),
  
  -- 基本情報
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  birth_year      INTEGER NOT NULL,        -- ゲーム内誕生年
  prefecture      TEXT NOT NULL,
  hometown        TEXT NOT NULL,
  middle_school   TEXT NOT NULL,
  
  -- 身体
  height          INTEGER NOT NULL,        -- cm
  weight          INTEGER NOT NULL,        -- kg
  throwing_hand   TEXT NOT NULL,           -- 'left' | 'right'
  batting_side    TEXT NOT NULL,           -- 'left' | 'right' | 'switch'
  
  -- ポジション
  primary_position TEXT NOT NULL,
  sub_positions    TEXT NOT NULL,          -- JSON array: ["second", "shortstop"]
  
  -- 特性
  traits          TEXT NOT NULL,           -- JSON array: ["hard_worker", "competitive"]
  personality     TEXT NOT NULL,           -- 性格大分類: "introvert" | "extrovert" | "balanced"
  
  -- 初期能力値（中学1年入学時）
  initial_stats   TEXT NOT NULL,           -- JSON: PlayerStats
  
  -- ポテンシャル天井（生涯最大到達可能値）
  ceiling_stats   TEXT NOT NULL,           -- JSON: PlayerStats
  
  -- 成長プロファイル（後述の詳細構造）
  growth_profile  TEXT NOT NULL,           -- JSON: GrowthProfile
  
  -- メタ
  quality_tier    TEXT NOT NULL,           -- 'S' | 'A' | 'B' | 'C' | 'D' (総合素質)
  is_pitcher      BOOLEAN NOT NULL,
  rarity          REAL NOT NULL,           -- 希少度 0.0-1.0（高いほど稀）
  
  -- Claw 補正フラグ
  manually_edited BOOLEAN DEFAULT FALSE,
  edit_notes      TEXT                     -- 補正内容のメモ
);

-- 学校マスタテーブル
CREATE TABLE school_blueprints (
  id              TEXT PRIMARY KEY,        -- "sch_niigata_01"
  name            TEXT NOT NULL,           -- 学校名
  prefecture      TEXT NOT NULL,
  base_reputation INTEGER NOT NULL,        -- 初期評判 (0-100)
  facilities      TEXT NOT NULL,           -- JSON: FacilityLevel
  coach_style     TEXT NOT NULL,           -- JSON: CoachStyle
  history_notes   TEXT                     -- 学校の背景設定
);

-- 進学先マッピング（Claw が年度ごとに設定可能）
CREATE TABLE enrollment_assignments (
  id              TEXT PRIMARY KEY,
  game_year       INTEGER NOT NULL,        -- 入学年度
  person_id       TEXT NOT NULL REFERENCES person_blueprints(id),
  school_id       TEXT NOT NULL REFERENCES school_blueprints(id),
  assignment_type TEXT NOT NULL,           -- 'auto' | 'scout' | 'manual'
  priority        INTEGER DEFAULT 0,       -- 競合時の優先度
  UNIQUE(game_year, person_id)
);

-- インデックス
CREATE INDEX idx_pb_generation ON person_blueprints(generation_id);
CREATE INDEX idx_pb_birth_year ON person_blueprints(birth_year);
CREATE INDEX idx_pb_quality ON person_blueprints(quality_tier);
CREATE INDEX idx_pb_prefecture ON person_blueprints(prefecture);
CREATE INDEX idx_ea_year ON enrollment_assignments(game_year);
```

### 3.2 PersonBlueprint の TypeScript 型

```typescript
/** DB上の人物設計図（静的・不変） */
export interface PersonBlueprint {
  id: string;                           // "pb_20260401_0001"
  generationId: string;                 // "gen_2026"
  
  // 基本情報
  firstName: string;
  lastName: string;
  birthYear: number;
  prefecture: string;
  hometown: string;
  middleSchool: string;
  
  // 身体
  height: number;
  weight: number;
  throwingHand: Hand;
  battingSide: BattingSide;
  
  // ポジション
  primaryPosition: Position;
  subPositions: Position[];
  
  // 特性
  traits: TraitId[];
  personality: 'introvert' | 'extrovert' | 'balanced';
  
  // 能力値
  initialStats: PlayerStats;            // 中学1年入学時
  ceilingStats: PlayerStats;            // 生涯最大到達可能値
  
  // 成長プロファイル
  growthProfile: GrowthProfile;
  
  // メタ
  qualityTier: 'S' | 'A' | 'B' | 'C' | 'D';
  isPitcher: boolean;
  rarity: number;                       // 0.0-1.0
  
  // Claw 補正
  manuallyEdited: boolean;
  editNotes: string | null;
}
```

### 3.3 DB の物理配置

```
Phase 3.0 (MVP):
  SQLite ファイル（ゲームに同梱）
  → koushien-sim/data/person-registry.sqlite
  → 初期データ: Claw が事前生成した 5世代分（~3000人）

Phase 4+ (本格運用):
  PostgreSQL (Web DB)
  → Genspark Claw からの API アクセス
  → ゲームクライアントは起動時にDBから必要分をダウンロード
```

---

## 4. 成長カーブ設計

### 4.1 GrowthProfile の構造

```typescript
/** 1人の選手の全成長パラメータ */
export interface GrowthProfile {
  /** 成長タイプ（全体的な傾向） */
  growthType: GrowthType;               // 'early' | 'normal' | 'late' | 'genius'
  
  /** 能力値ごとの成長カーブ */
  curves: GrowthCurveSet;
  
  /** スランプリスク (0.0-1.0) — 高いほどスランプに入りやすい */
  slumpRisk: number;
  
  /** スランプからの回復力 (0.0-1.0) — 高いほど早く脱出 */
  slumpRecovery: number;
  
  /** 覚醒確率 (0.0-1.0) — 高いほど覚醒イベントが起きやすい */
  awakeningChance: number;
  
  /** 怪我耐性 (0.0-1.0) — 高いほど怪我しにくい */
  durability: number;
  
  /** メンタル成長係数 — 試合経験でメンタルがどれだけ伸びるか */
  mentalGrowthFactor: number;
}

/** 全能力値の成長カーブセット */
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
  
  // 投球（投手のみ。野手は null）
  velocity: StatGrowthCurve | null;
  control: StatGrowthCurve | null;
  pitchStamina: StatGrowthCurve | null;
}
```

### 4.2 StatGrowthCurve — 1能力値の成長カーブ定義

```typescript
/**
 * 1つの能力値に対する成長カーブ。
 * 
 * 成長量は以下の式で決まる:
 *   dailyGain = baseRate
 *             × peakMultiplier(currentAge, peakAge, peakWidth)
 *             × varianceSample(variance)
 *             × ceilingPenalty(current, ceiling)
 *             × externalModifiers(mood, fatigue, practice, ...)
 */
export interface StatGrowthCurve {
  /** 基本成長率 (0.01-1.0)。1日あたりの基本成長量 */
  baseRate: number;
  
  /**
   * 成長ピーク年齢。ゲーム内の「年齢」（中1=13, 中3=15, 高1=16, 高3=18）。
   * この年齢でピーク倍率が最大になる。
   */
  peakAge: number;
  
  /**
   * ピーク幅（年数）。ピークからどれだけ離れると成長率が落ちるか。
   * 小さいほどピークが鋭い（早熟/晩成に顕著）。
   * 大きいほど安定して伸びる。
   */
  peakWidth: number;
  
  /**
   * 日次揺らぎ (0.0-1.0)。
   * 0.0 = 毎日完全に同じ成長量
   * 1.0 = 日によって大きくばらつく
   * 標準: 0.3
   */
  variance: number;
  
  /**
   * スランプ時の成長率低下 (0.0-1.0)。
   * スランプ中はこの値だけ成長率が低下する。
   * 0.0 = スランプの影響なし
   * 1.0 = スランプ中は成長しない
   * 標準: 0.5
   */
  slumpPenalty: number;
  
  /**
   * 練習タイプ適性。
   * この能力値が特定の練習メニューで特に伸びやすいかどうか。
   * 省略時はデフォルト（1.0倍）。
   */
  practiceAffinity?: Partial<Record<PracticeMenuId, number>>;
}
```

### 4.3 成長カーブの計算式

```typescript
/**
 * ピーク倍率の計算。
 * 正規分布型のベルカーブで、peakAge を中心にピークが来る。
 * 
 * peakMultiplier = peakMax × exp(-0.5 × ((age - peakAge) / peakWidth)²)
 * 
 * ただし最低値は 0.2（ピークから離れても完全に成長しないわけではない）
 */
export function peakMultiplier(
  currentAge: number,
  peakAge: number,
  peakWidth: number,
): number {
  const peakMax = 1.5;    // ピーク時の最大倍率
  const peakMin = 0.2;    // ピーク外の最低倍率
  
  const deviation = (currentAge - peakAge) / peakWidth;
  const bellCurve = Math.exp(-0.5 * deviation * deviation);
  
  return peakMin + (peakMax - peakMin) * bellCurve;
}
```

**成長タイプごとのピーク例（contact の場合）:**

```
                        ピーク倍率
  1.5 │         ╱╲
      │        ╱  ╲         早熟: peakAge=14, peakWidth=1.5
  1.2 │   ╱╲  ╱    ╲
      │  ╱  ╲╱      ╲       普通: peakAge=16, peakWidth=2.0
  0.9 │ ╱    ╳       ╲
      │╱    ╱ ╲       ╲     晩成: peakAge=18, peakWidth=1.5
  0.6 │    ╱   ╲       ╲
      │   ╱     ╲       ╲   天才: peakAge=16, peakWidth=3.0
  0.3 │  ╱       ╲       ╲
      │ ╱         ╲       ╲
  0.0 ┼──┬──┬──┬──┬──┬──┬──┬──
     13  14  15  16  17  18  19  20  年齢
     中1 中2 中3 高1 高2 高3
```

### 4.4 成長タイプごとのデフォルト GrowthProfile

```typescript
export const DEFAULT_GROWTH_PROFILES: Record<GrowthType, Partial<GrowthProfile>> = {
  early: {
    growthType: 'early',
    slumpRisk: 0.15,
    slumpRecovery: 0.6,
    awakeningChance: 0.05,
    durability: 0.7,
    mentalGrowthFactor: 0.8,
    // curves のデフォルト:
    // peakAge: 14-15 (中2-中3)
    // peakWidth: 1.5 (鋭いピーク)
    // baseRate: 高め (0.4-0.6)
  },
  normal: {
    growthType: 'normal',
    slumpRisk: 0.10,
    slumpRecovery: 0.5,
    awakeningChance: 0.08,
    durability: 0.6,
    mentalGrowthFactor: 1.0,
    // curves のデフォルト:
    // peakAge: 16-17 (高1-高2)
    // peakWidth: 2.0 (広めのピーク)
    // baseRate: 中 (0.3-0.5)
  },
  late: {
    growthType: 'late',
    slumpRisk: 0.20,          // 晩成型はスランプリスク高め
    slumpRecovery: 0.4,
    awakeningChance: 0.15,    // 覚醒しやすい
    durability: 0.5,
    mentalGrowthFactor: 1.2,
    // curves のデフォルト:
    // peakAge: 17-18 (高2-高3)
    // peakWidth: 1.5 (鋭いピーク)
    // baseRate: 低め序盤→高め終盤 (0.2-0.7)
  },
  genius: {
    growthType: 'genius',
    slumpRisk: 0.05,
    slumpRecovery: 0.8,
    awakeningChance: 0.02,    // 既に才能があるので覚醒は稀
    durability: 0.8,
    mentalGrowthFactor: 0.9,
    // curves のデフォルト:
    // peakAge: 16 (高1)
    // peakWidth: 3.0 (非常に広いピーク = 常に伸びる)
    // baseRate: 高め (0.5-0.7)
  },
};
```

### 4.5 既存 calculateStatGain との統合

```typescript
// 現行の calculateStatGain (Phase 1/2):
//   gain = baseGain × growthRate × gradeMultiplier × moodMultiplier
//          × fatigueMultiplier × traitMultiplier × seasonMultiplier
//          × ceilingPenalty × variance

// Phase 3 の改修版:
// 既存の gradeMultiplier(grade, growthType) を
// peakMultiplier(currentAge, curve.peakAge, curve.peakWidth) に置換

export function calculateStatGainV3(
  current: number,
  ceiling: number,
  curve: StatGrowthCurve,
  context: GrowthContextV3,
  rng: RNG,
): number {
  // 日次揺らぎ
  const varianceMin = 1.0 - curve.variance;
  const varianceMax = 1.0 + curve.variance;
  const dailyVariance = varianceMin + rng.next() * (varianceMax - varianceMin);
  
  // ピーク倍率（旧 gradeMultiplier を置換）
  const peak = peakMultiplier(context.currentAge, curve.peakAge, curve.peakWidth);
  
  // スランプペナルティ
  const slumpMult = context.isInSlump ? (1.0 - curve.slumpPenalty) : 1.0;
  
  // 練習メニュー適性
  const affinityMult = curve.practiceAffinity?.[context.practiceMenuId] ?? 1.0;
  
  const gain = curve.baseRate
    * peak
    * moodMultiplier(context.mood)
    * fatigueMultiplier(context.fatigue)
    * traitMultiplier(context.traits)
    * context.seasonMultiplier
    * ceilingPenalty(current, ceiling)
    * slumpMult
    * affinityMult
    * dailyVariance;
  
  return gain;
}

export interface GrowthContextV3 {
  currentAge: number;          // 13-18
  mood: Mood;
  fatigue: number;
  traits: TraitId[];
  seasonMultiplier: number;
  isInSlump: boolean;
  practiceMenuId: PracticeMenuId;
}
```

### 4.6 1年間の成長量の目安（contact, 天井80 の場合）

| 成長タイプ | 中1→中2 | 中2→中3 | 中3→高1 | 高1→高2 | 高2→高3 | 合計(6年) |
|-----------|---------|---------|---------|---------|---------|----------|
| 早熟 | +12 | +15 | +10 | +6 | +4 | +47 |
| 普通 | +5 | +8 | +12 | +13 | +10 | +48 |
| 晩成 | +3 | +5 | +7 | +13 | +18 | +46 |
| 天才 | +10 | +11 | +12 | +11 | +10 | +54 |

**初期値15（中1）→ 到達値: 早熟62, 普通63, 晩成61, 天才69**

天井80に対して76〜86%到達。天才のみ天井に近い。

### 4.7 中学時代の成長

```typescript
/**
 * 中学時代は高校と同じ成長エンジンを使うが、以下が異なる:
 * - 練習メニューは固定（中学の部活レベル）
 * - seasonMultiplier は常に 1.0（合宿なし）
 * - 中学大会のボーナスは小さめ（×1.3 vs 高校の ×2.0）
 * - 施設レベルの影響なし
 */
export const MIDDLE_SCHOOL_PRACTICE: PracticeMenu = {
  id: 'middle_school_daily' as PracticeMenuId,
  name: '中学校日常練習',
  description: '基礎的な打撃・守備・体力練習',
  fatigueLoad: 4,
  statEffects: [
    { target: 'batting.contact', baseGain: 0.15 },
    { target: 'batting.power', baseGain: 0.10 },
    { target: 'base.stamina', baseGain: 0.15 },
    { target: 'base.speed', baseGain: 0.10 },
    { target: 'base.fielding', baseGain: 0.15 },
    { target: 'base.armStrength', baseGain: 0.05 },
    { target: 'base.focus', baseGain: 0.05 },
    { target: 'base.mental', baseGain: 0.05 },
  ],
  duration: 'half',
};
```

---

## 5. Tier 昇格・降格条件

### 5.1 条件一覧

```typescript
export interface TierTransitionRules {
  // === minimal → standard への昇格条件（いずれか1つを満たす） ===
  promoteToStandard: {
    /** 直近2大会以内に自校と対戦した */
    recentOpponent: boolean;
    /** 自校の次の対戦相手に確定した */
    nextOpponent: boolean;
    /** プレイヤーがスカウト画面で「注目校」に指定した */
    playerWatchlist: boolean;
    /** 県内の大会成績トップ3 */
    topThreeInPrefecture: boolean;
    /** この学校出身の中学生をスカウト中 */
    scoutingFromThisSchool: boolean;  // Phase 3.5
  };

  // === standard → minimal への降格条件（全てを満たす） ===
  demoteToMinimal: {
    /** 直近2大会で自校との対戦なし */
    noRecentMatchup: boolean;
    /** プレイヤーの注目校リストに入っていない */
    notOnWatchlist: boolean;
    /** 県内成績がトップ3外 */
    notTopThree: boolean;
    /** この学校出身者のスカウトなし */
    noActiveScout: boolean;           // Phase 3.5
  };

  // === full は固定（自校のみ） ===
  // 昇格/降格なし
}
```

### 5.2 Tier 更新のタイミング

| タイミング | 処理 |
|-----------|------|
| **大会の組み合わせ抽選後** | 自校の対戦相手を standard に昇格 |
| **大会の各ラウンド終了後** | 敗退校をチェックし、降格判定 |
| **年度替わり後** | 全校の Tier を再評価（大会成績リセットのため） |
| **プレイヤーが注目校を変更した時** | 即座に昇格/降格 |
| **スカウト開始/終了時** | 関連校の Tier を再評価（Phase 3.5） |

### 5.3 Tier 変更時のデータ遷移

```typescript
// minimal → standard に昇格する時:
function promoteSchool(school: HighSchool, world: WorldState): HighSchool {
  // 1. 全選手の PersonState を DB の PersonBlueprint から最新化
  // 2. 週次バッチ成長で溜まった未適用分を精算
  //    (minimal では週単位だったので、standard に上げる際に端数を処理)
  // 3. simulationTier = 'standard' に変更
  // 4. TeamSummary キャッシュを invalidate
  return { ...school, simulationTier: 'standard' };
}

// standard → minimal に降格する時:
function demoteSchool(school: HighSchool): HighSchool {
  // 1. TeamSummary を再計算してキャッシュ
  // 2. simulationTier = 'minimal' に変更
  // 3. 以降は週次バッチ成長に切り替わる
  return { ...school, simulationTier: 'minimal' };
}
```

---

## 6. PersonRegistry 保持ポリシー

### 6.1 ライフステージと保持レベル

```
┌──────────┬──────────────────┬────────────────────────────────┐
│ ステージ  │ 保持レベル        │ 保持するデータ                  │
├──────────┼──────────────────┼────────────────────────────────┤
│ 現役     │ FULL             │ PersonBlueprint (DB参照)        │
│ (中学生) │                  │ + PersonState (全能力値、        │
│          │                  │   コンディション、成長履歴)       │
├──────────┼──────────────────┼────────────────────────────────┤
│ 現役     │ FULL             │ PersonBlueprint (DB参照)        │
│ (高校生) │                  │ + PersonState (全データ)         │
├──────────┼──────────────────┼────────────────────────────────┤
│ 追跡対象 │ TRACKED          │ PersonBlueprint (DB参照)        │
│ (卒業後  │                  │ + GraduateSummary (最終能力,     │
│  5年以内 │                  │   進路, 年次成績サマリ)          │
│  or OB)  │                  │ + ProRecord (プロ入り時のみ)     │
├──────────┼──────────────────┼────────────────────────────────┤
│ アーカイブ│ ARCHIVED         │ GraduateArchive (名前, 卒業年,  │
│ (卒業後  │                  │   最終能力ランク, 進路, 最高成績) │
│  5年超)  │                  │ → 約100バイト/人                │
├──────────┼──────────────────┼────────────────────────────────┤
│ 忘却     │ FORGOTTEN        │ なし（DBには残るがランタイムから │
│ (卒業後  │                  │   参照しない。OB画面で検索時に   │
│  20年超) │                  │   DBから再取得可能）             │
└──────────┴──────────────────┴────────────────────────────────┘
```

### 6.2 保持ポリシーの TypeScript 型

```typescript
export type PersonRetention = 'full' | 'tracked' | 'archived' | 'forgotten';

export interface PersonRegistryEntry {
  personId: string;                    // blueprintId と同一
  retention: PersonRetention;
  stage: PersonStage;
  
  // retention=full の場合のみ
  state?: PersonState;
  
  // retention=tracked の場合のみ
  graduateSummary?: GraduateSummary;
  proRecord?: ProRecord;
  
  // retention=archived の場合のみ
  archive?: GraduateArchive;
}

export interface GraduateSummary {
  finalStats: PlayerStats;
  finalOverall: number;
  schoolId: string;
  schoolName: string;
  graduationYear: number;
  careerPath: CareerPath;
  achievements: string[];              // "甲子園出場", "ドラフト3位" 等
  yearlyRecords?: ProYearRecord[];     // プロ入り選手のみ
}

export interface GraduateArchive {
  name: string;                        // "田中 太郎"
  graduationYear: number;
  schoolName: string;
  overallRank: 'S' | 'A' | 'B' | 'C' | 'D';
  careerPathType: 'pro' | 'university' | 'corporate' | 'retire';
  bestAchievement: string | null;      // 最高の実績1つ
}
```

### 6.3 メモリ使用量の見積り

| 保持レベル | 1人あたり | 想定人数(20年後) | 合計 |
|-----------|----------|-----------------|------|
| FULL (現役) | ~2KB | ~1,800人 | ~3.6MB |
| TRACKED (追跡) | ~500B | ~1,250人 (5年分) | ~0.6MB |
| ARCHIVED | ~100B | ~3,750人 (15年分) | ~0.4MB |
| FORGOTTEN | 0 | — | 0 |
| **合計** | | | **~4.6MB** |

### 6.4 retention の遷移ルール

```typescript
export function updateRetention(
  entry: PersonRegistryEntry,
  currentYear: number,
): PersonRetention {
  if (entry.stage.type === 'middle_school' || entry.stage.type === 'high_school') {
    return 'full';  // 現役は常に full
  }
  
  if (entry.stage.type === 'graduated' || entry.stage.type === 'pro') {
    const yearsSinceGraduation = currentYear - entry.stage.year;
    
    // プロ入り選手は長めに追跡
    if (entry.stage.type === 'pro') {
      if (yearsSinceGraduation <= 10) return 'tracked';
      if (yearsSinceGraduation <= 25) return 'archived';
      return 'forgotten';
    }
    
    // 一般卒業生
    if (yearsSinceGraduation <= 5) return 'tracked';
    if (yearsSinceGraduation <= 20) return 'archived';
    return 'forgotten';
  }
  
  return 'archived';
}
```

---

## 7. 年度替わりトランザクション境界

### 7.1 トランザクション全体図

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  年度替わりトランザクション（3月31日の processDay 完了後）
  
  状態: TRANSITION_IN_PROGRESS
  ⚠️ この区間でのセーブ禁止（中間セーブはクラッシュリカバリ用のみ）
  ⚠️ UI操作の受付禁止
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ┌─────────────────────────────────────────────────────────┐
  │ Phase A: スナップショット保存                             │
  │   save('pre_transition', worldState)                     │
  │   → トランザクション開始の安全地点                        │
  │   → クラッシュ時はここから復元できる                       │
  └─────────────────────────────────────────────────────────┘
                              │
  ┌─────────────────────────────────────────────────────────┐
  │ Phase B: 卒業処理（全校一括）                             │
  │   B1. 全校の3年生リスト確定                              │
  │   B2. 進路決定（ドラフト判定含む）                        │
  │   B3. GraduateRecord / GraduateSummary 生成              │
  │   B4. PersonRegistry 更新（high_school → graduated）     │
  │   B5. 全校の players から3年生を除去                      │
  │                                                          │
  │   ⚠️ この時点で全校の部員が減少した状態                   │
  │   ⚠️ セーブ不可（チームが不完全な状態）                   │
  └─────────────────────────────────────────────────────────┘
                              │
  ┌─────────────────────────────────────────────────────────┐
  │ Phase C: 入学処理（全校一括）                             │
  │   C1. DB から当該年度の PersonBlueprint を取得            │
  │   C2. enrollment_assignments テーブルから配属先を取得      │
  │       （Claw 事前設定がなければ自動配分）                  │
  │   C3. PersonBlueprint → PersonState を初期化              │
  │   C4. PersonState → Player に合成（hydratePlayer）       │
  │   C5. 全校の players に新入生を追加                       │
  │   C6. PersonRegistry 更新（middle_school → high_school） │
  │                                                          │
  │   ⚠️ この時点で部員数が復元                               │
  └─────────────────────────────────────────────────────────┘
                              │
  ┌─────────────────────────────────────────────────────────┐
  │ Phase D: 中学生更新                                      │
  │   D1. 中学3年生を middleSchoolPool から除去              │
  │   D2. 中学1年→2年, 2年→3年に進級                        │
  │   D3. DB から新中学1年生の PersonBlueprint を取得         │
  │   D4. PersonState を初期化して middleSchoolPool に追加    │
  │   D5. PersonRegistry 更新                                │
  └─────────────────────────────────────────────────────────┘
                              │
  ┌─────────────────────────────────────────────────────────┐
  │ Phase E: チーム再編・更新                                 │
  │   E1. 全校の lineup = null（打順リセット）                │
  │   E2. AI校は autoGenerateLineup() で自動設定             │
  │   E3. 学校評判更新（updateReputation）                    │
  │   E4. 監督実績更新                                       │
  │   E5. SimulationTier 再評価                              │
  └─────────────────────────────────────────────────────────┘
                              │
  ┌─────────────────────────────────────────────────────────┐
  │ Phase F: シーズン初期化                                   │
  │   F1. seasonState リセット                                │
  │   F2. activeTournaments = []                              │
  │   F3. completedTournaments → tournamentHistory に移動     │
  │   F4. PersonRegistry の retention 更新                    │
  │   F5. WorldState.currentDate = { year+1, month: 4, day: 1 } │
  └─────────────────────────────────────────────────────────┘
                              │
  ┌─────────────────────────────────────────────────────────┐
  │ Phase G: トランザクション完了                              │
  │   save('post_transition', worldState)                     │
  │   状態: TRANSITION_COMPLETE                               │
  │   → 通常セーブ・UI操作が再び可能に                        │
  └─────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 7.2 クラッシュリカバリ

```typescript
export interface TransactionState {
  status: 'idle' | 'in_progress' | 'complete';
  currentPhase: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | null;
  preTransitionSaveId: string | null;
}

/**
 * クラッシュリカバリ:
 * 
 * 起動時に TransactionState を確認。
 *   status === 'in_progress' の場合:
 *     → preTransitionSaveId のセーブデータをロード
 *     → 年度替わりトランザクションを最初からやり直す
 * 
 * 理由: Phase B-F は途中状態でのセーブが禁止されているため、
 * 途中で中断された場合は必ず Phase A のスナップショットに戻す。
 * トランザクション全体を再実行する（冪等性を保証する設計）。
 */
export function recoverFromCrash(
  transactionState: TransactionState,
  saveManager: SaveManager,
): WorldState | null;
```

### 7.3 途中保存が禁止される理由

| Phase | 途中保存が危険な理由 |
|-------|---------------------|
| B途中 | 一部の学校で3年生が除去済み、他は未処理 → チーム間の整合性崩壊 |
| C途中 | 一部の学校に新入生が追加済み、他は未処理 → 大会出場資格の不整合 |
| B完了-C未開始 | 全校で部員数が不足 → 試合が実行不能 |
| D途中 | 中学生プールの世代が不完全 |
| E途中 | 一部校のみ lineup 設定済み → 大会組み合わせ時の不整合 |

---

## 8. Genspark Claw 運用フロー

### 8.1 Claw の役割

```
┌──────────────────────────────────────────────────────────┐
│  Genspark Claw の責務                                     │
│                                                          │
│  1. 世代の事前生成                                        │
│     → 年度ごとに中学1年生180人分の PersonBlueprint を生成  │
│     → 成長カーブのバランス調整                             │
│     → 希少キャラ（天才型・覚醒持ち）の出現率制御            │
│                                                          │
│  2. 既存人物の補正                                        │
│     → テストプレイで能力バランスが崩れた選手の修正          │
│     → 天井値の調整                                        │
│     → 成長ピークの微調整                                   │
│                                                          │
│  3. 学校マスタの管理                                      │
│     → 48校分の学校設定（名前、評判、施設、AI方針）         │
│     → 新シナリオ用の学校追加                               │
│                                                          │
│  4. 進学先の手動指定（オプション）                         │
│     → 特定の有力選手を特定の学校に配置                     │
│     → ストーリー性のある対決カードの演出                    │
│                                                          │
│  5. バランス検証                                          │
│     → 5年/20年シミュレーションの統計分析                   │
│     → 能力値分布、大会結果のバラツキ確認                   │
│     → 成長カーブパラメータの調整提案                       │
│                                                          │
│  Claw が やらないこと:                                    │
│  ❌ ランタイムの能力値変更（ゲームエンジンの責務）          │
│  ❌ 試合結果の操作                                        │
│  ❌ セーブデータの直接編集                                 │
└──────────────────────────────────────────────────────────┘
```

### 8.2 年次運用サイクル

```
┌───────────────────────────────────────────────────────────┐
│  開発時（Claw の初期セットアップ）                          │
│                                                           │
│  1. 学校マスタ生成                                         │
│     claw generate-schools --prefecture 新潟 --count 48     │
│     → school_blueprints テーブルに48校を INSERT              │
│                                                           │
│  2. 初期世代生成（ゲーム開始年度を含む過去6年分）           │
│     claw generate-generation --year 2020 --count 180       │
│     claw generate-generation --year 2021 --count 180       │
│     ...                                                    │
│     claw generate-generation --year 2025 --count 180       │
│     → 中学1年〜高校3年の全世代がDBに存在する状態            │
│                                                           │
│  3. バランス検証                                           │
│     claw simulate --years 5 --verify-distribution          │
│     → 成長カーブ、大会結果の統計を出力                      │
│     → 問題があれば GrowthProfile を調整して再生成           │
└───────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────┐
│  ゲーム開始時                                              │
│                                                           │
│  1. DB から全 PersonBlueprint をロード                      │
│  2. HighSchool[] を school_blueprints から生成               │
│  3. 各学校に該当年度の PersonBlueprint を配属                │
│  4. 中学生プールに該当年度の PersonBlueprint を配置          │
│  5. WorldState を初期化                                     │
└───────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────┐
│  年度替わりごと（ゲーム内 + Claw 連携）                     │
│                                                           │
│  ゲーム側:                                                 │
│  1. 年度替わりトランザクション実行（§7）                     │
│  2. DB の次世代データを要求                                 │
│                                                           │
│  Claw 側（バックグラウンド or 事前バッチ）:                  │
│  1. 次年度の中学1年生を生成                                 │
│     claw generate-generation --year 2027 --count 180       │
│  2. バランス検証（任意）                                    │
│     claw verify-balance --year 2027                        │
│  3. 手動補正（任意）                                        │
│     claw edit-person --id pb_20270401_0042                  │
│       --set growth_profile.curves.contact.peakAge=17        │
│  4. 進学先の手動指定（任意）                                │
│     claw assign-enrollment --year 2027                      │
│       --person pb_20270401_0042 --school sch_niigata_01     │
└───────────────────────────────────────────────────────────┘
```

### 8.3 Claw のコマンド体系

```bash
# === 世代生成 ===
claw generate-generation \
  --year 2026 \
  --prefecture 新潟 \
  --count 180 \
  --genius-rate 0.02 \
  --quality-distribution "S:2%,A:10%,B:30%,C:40%,D:18%"

# === 学校マスタ生成 ===
claw generate-schools \
  --prefecture 新潟 \
  --count 48 \
  --strong 4 --mid 12 --normal 20 --weak 12

# === 個別補正 ===
claw edit-person --id pb_20260401_0001 \
  --set "ceiling_stats.batting.power=85" \
  --set "growth_profile.curves.power.peakAge=17" \
  --note "パワー系に調整"

# === 進学先手動指定 ===
claw assign-enrollment \
  --year 2027 \
  --person pb_20260401_0042 \
  --school sch_niigata_01 \
  --type manual

# === バランス検証 ===
claw verify-balance \
  --years 5 \
  --runs 10 \
  --output balance-report.json

# === DBエクスポート/インポート ===
claw export-db --format sqlite --output person-registry.sqlite
claw import-db --format sqlite --input person-registry.sqlite
```

### 8.4 生成パイプライン

```
Claw generate-generation
│
├─ 1. 名前生成（name-dict + バリエーション）
├─ 2. 身体パラメータ生成（正規分布ベース）
├─ 3. ポジション決定（分布: P:20%, C:8%, IF:32%, OF:28%, 1B:12%）
├─ 4. 成長タイプ決定（early:25%, normal:45%, late:20%, genius:2%+reputation依存）
├─ 5. GrowthProfile 生成
│     ├─ 成長タイプに応じたデフォルトプロファイルをベースに
│     ├─ 能力値ごとに peakAge を ±1 年揺らす
│     ├─ baseRate を ±20% 揺らす
│     ├─ variance を 0.1-0.5 の範囲でランダム
│     └─ slumpRisk, durability 等を生成
├─ 6. 初期能力値生成（中1レベル: mean=10, stddev=5）
├─ 7. 天井値生成（quality_tier に応じた分布）
│     S: mean=85, A: mean=75, B: mean=60, C: mean=45, D: mean=35
├─ 8. 特性（traits）付与（性格タイプ + ランダム 2-4個）
├─ 9. 出身情報生成（都道府県内の地域 + 中学校名）
└─ 10. DB に INSERT
```

---

## 9. 各 Tier の DB参照・動的更新の範囲

### 9.1 概要

```
           DB参照                    動的更新
           (PersonBlueprint)         (PersonState)
           ─────────────             ───────────────
Tier 1     初回ロード時に              毎日:
(Full)     全フィールドを取得。         全能力値を個別に更新。
           以降はキャッシュ。           コンディション毎日判定。
           成長カーブの全詳細を使用。   イベント処理あり。
                                       試合経験→成長。
                                       累積成長量を記録。

Tier 2     初回ロード時に              毎日:
(Standard) 全フィールドを取得。         全能力値をバッチ更新。
           成長カーブの主要パラメータ   コンディション簡易判定。
           (peakAge, baseRate,         怪我は確率的判定。
            peakWidth) を使用。         試合経験→成長。

Tier 3     初回ロード時に              週次:
(Minimal)  基本情報 + TeamSummary      全能力値を一括更新。
           レベルの情報のみ。           コンディションは試合前のみ。
           成長カーブは growthType の   怪我は週単位で確率判定。
           デフォルトプロファイルで代替。
```

### 9.2 Tier ごとの成長計算で使う成長カーブ情報

| パラメータ | Tier 1 (Full) | Tier 2 (Standard) | Tier 3 (Minimal) |
|-----------|--------------|-------------------|-----------------|
| `baseRate` | 能力値ごと個別 | 能力値ごと個別 | growthType のデフォルト |
| `peakAge` | 能力値ごと個別 | 能力値ごと個別 | growthType のデフォルト |
| `peakWidth` | 能力値ごと個別 | 能力値ごと個別 | growthType のデフォルト |
| `variance` | 能力値ごと個別 | 0.3（固定） | 0.3（固定） |
| `slumpPenalty` | 能力値ごと個別 | 0.5（固定） | 無視 |
| `practiceAffinity` | 使用 | 無視 | 無視 |
| `slumpRisk` | 個別 | 個別 | growthType のデフォルト |
| `durability` | 個別 | 個別 | growthType のデフォルト |
| `awakeningChance` | 個別 | 0（覚醒なし） | 0（覚醒なし） |

### 9.3 DB アクセスパターン

```typescript
// === ゲーム起動時 ===
// 1. 全 school_blueprints をロード → HighSchool[] を構築
// 2. 全 person_blueprints (現役世代分) をロード → メモリキャッシュ
//    現役世代 = birth_year が currentYear-18 〜 currentYear-13
//    → 約 180人/年 × 6年分 = ~1,080人分のブループリント
// 3. enrollment_assignments をロード → 配属情報

// === 年度替わり時 ===
// 1. 新中学1年の PersonBlueprint を DB から取得（180人）
// 2. enrollment_assignments を DB から取得（当年度分）

// === スカウト時（Phase 3.5） ===
// 1. 中学生の詳細情報を DB から追加取得（通常は概要のみ保持）

// === 通常ゲーム中 ===
// DB アクセスなし（全てメモリ上のキャッシュで動作）
```

---

## 10. 既存コードへの影響分析

### 10.1 破壊的変更の回避策

| 既存コード | Phase 3 での対応 |
|-----------|----------------|
| `Player` 型 | **変更なし**。`hydratePlayer()` で PersonBlueprint + PersonState から Player を合成 |
| `applyDailyGrowth()` | **変更なし（Tier 1 でそのまま使用）**。Tier 2/3 は新関数 |
| `runGame()` | **変更なし（Tier 1 でそのまま使用）** |
| `processDay()` | **拡張**: WorldState 対応の `advanceWorldDay()` から内部的に呼び出す |
| `PotentialStats` | **後方互換拡張**: 既存の `growthRate` + `growthType` を維持しつつ、`GrowthProfile` は DB 側に保持 |
| `calculateStatGain()` | **維持**。新しい `calculateStatGainV3()` を追加。Tier 1 は V3 を使用 |

### 10.2 Player 型との互換ブリッジ

```typescript
/**
 * PersonBlueprint + PersonState → Player の合成。
 * 
 * 既存の Phase 1/2 の全関数は Player 型で動作するため、
 * この合成関数を通すだけで既存コードがそのまま使える。
 */
export function hydratePlayer(
  blueprint: PersonBlueprint,
  state: PersonState,
  currentYear: number,
): Player {
  return {
    id: blueprint.id,
    firstName: blueprint.firstName,
    lastName: blueprint.lastName,
    enrollmentYear: state.enrollmentYear,
    position: blueprint.primaryPosition,
    subPositions: blueprint.subPositions,
    battingSide: blueprint.battingSide,
    throwingHand: blueprint.throwingHand,
    height: blueprint.height,
    weight: blueprint.weight,
    stats: state.currentStats,
    potential: {
      ceiling: blueprint.ceilingStats,
      growthRate: blueprint.growthProfile.curves.contact.baseRate, // 互換用の代表値
      growthType: blueprint.growthProfile.growthType,
    },
    condition: state.condition,
    traits: blueprint.traits,
    mentalState: state.mentalState,
    background: {
      hometown: blueprint.hometown,
      middleSchool: blueprint.middleSchool,
    },
    careerStats: state.careerStats,
  };
}

/**
 * Player → PersonState の逆変換（セーブ時）。
 * Player の動的フィールドだけを PersonState に抽出。
 */
export function dehydratePlayer(player: Player): Partial<PersonState> {
  return {
    currentStats: player.stats,
    condition: player.condition,
    mentalState: player.mentalState,
    careerStats: player.careerStats,
  };
}
```

---

## 11. テスト追加項目

### 11.1 DB統合テスト

```typescript
describe('PersonBlueprint DB', () => {
  it('generates a valid generation of 180 middle schoolers', () => {
    // 全員の GrowthProfile が有効
    // quality_tier の分布が指定通り
    // 名前に重複なし
  });
  
  it('hydratePlayer produces valid Player from blueprint + state', () => {
    // 合成された Player が Phase 1/2 の全関数で動作
  });
  
  it('round-trip: hydratePlayer → dehydratePlayer preserves dynamic state', () => {
    // 合成→逆変換で動的データが保存される
  });
});
```

### 11.2 成長カーブテスト

```typescript
describe('Growth curves', () => {
  it('peakMultiplier returns expected values for each growth type', () => {
    // early: peakAge=14 で最大倍率
    // late: peakAge=18 で最大倍率
    // genius: 全年齢で高い倍率
  });
  
  it('6-year growth produces expected final stats', () => {
    // 中1(15) → 高3(65±15) の範囲に収まる
    // 天才型のみ天井に近い
  });
  
  it('Tier 1 and Tier 2 growth are statistically equivalent', () => {
    // 1000人を1年間 Tier 1 と Tier 2 で成長させる
    // 平均能力値の差が ±10% 以内
  });
  
  it('slump reduces growth by slumpPenalty', () => {
    // スランプ中の成長量がペナルティ分減少
  });
  
  it('variance produces expected spread', () => {
    // variance=0.3 で1000日成長させた時の標準偏差
  });
});
```

### 11.3 トランザクション境界テスト

```typescript
describe('Year transition transaction', () => {
  it('completes atomically for 48 schools', () => {
    // 全校の部員数が 15-30人 を維持
    // PersonRegistry に穴がない
  });
  
  it('recovers from crash during Phase B', () => {
    // Phase B 途中でクラッシュをシミュレート
    // pre_transition セーブからリカバリ
    // リカバリ後にトランザクション再実行が成功
  });
  
  it('recovers from crash during Phase C', () => {
    // Phase C 途中のクラッシュ
  });
  
  it('is idempotent (double execution produces same result)', () => {
    // 同じ入力でトランザクションを2回実行
    // 結果が同一
  });
});
```

### 11.4 Tier 昇格・降格テスト

```typescript
describe('Tier transitions', () => {
  it('promotes opponent to standard after match', () => {
    // 大会で対戦 → standard に昇格
  });
  
  it('demotes to minimal after 2 tournaments without interaction', () => {
    // 2大会対戦なし + 注目リスト外 → minimal に降格
  });
  
  it('maintains standard for top-3 prefecture schools', () => {
    // 県内トップ3は対戦がなくても standard 維持
  });
  
  it('data integrity on tier transition', () => {
    // 昇格/降格時に能力値のジャンプがない
    // 週次バッチの端数が精算される
  });
});
```

---

## 付録A: PersonState の完全型定義

```typescript
/** ランタイムの人物動的状態 */
export interface PersonState {
  blueprintId: string;                 // PersonBlueprint.id への参照
  
  // 所属
  currentStage: PersonStage;
  enrollmentYear: number;              // 高校入学年度（中学生は0）
  schoolId: string | null;             // 所属高校ID（中学生・卒業生はnull）
  
  // 能力（動的）
  currentStats: PlayerStats;
  
  // コンディション（動的）
  condition: ConditionState;
  mentalState: MentalState;
  
  // 通算成績（動的）
  careerStats: CareerRecord;
  
  // 成長トラッキング
  cumulativeGrowth: CumulativeGrowth;  // 累積成長量（検証用）
  
  // イベント履歴
  eventHistory: PersonEvent[];          // 直近1年分のイベント
}

/** 累積成長量（デバッグ・検証用） */
export interface CumulativeGrowth {
  /** 各能力値の累積成長量 */
  statGains: Partial<Record<string, number>>;  // "batting.contact" → 12.5
  /** 成長日数 */
  totalDays: number;
  /** 試合経験日数 */
  matchDays: number;
  /** スランプ日数 */
  slumpDays: number;
}
```

## 付録B: 実装段階の更新

v0.2.0 の実装段階を以下のように更新:

```
Phase 3.0a: DB基盤 + PersonBlueprint                     [1週間]
────────────────────────────────────────────────────
  ✅ DB スキーマ作成（SQLite）
  ✅ PersonBlueprint 型定義
  ✅ GrowthProfile / StatGrowthCurve 型定義
  ✅ Claw の generate-generation コマンド（初期版）
  ✅ hydratePlayer() / dehydratePlayer()
  ✅ 既存225テストが全パス（互換ブリッジ経由）

Phase 3.0b: WorldState + 全校進行                         [2週間]
────────────────────────────────────────────────────
  (v0.2.0 の Phase 3.0 と同じ + DB統合)
  ✅ WorldState 型定義
  ✅ 48校生成（DB から）
  ✅ advanceWorldDay()
  ✅ 計算粒度3段階
  ✅ calculateStatGainV3() + peakMultiplier()
  ✅ 大会全試合シミュレーション
  ✅ 年度替わりトランザクション（§7）
  ✅ PersonRegistry 保持ポリシー
  ✅ Tier 昇格/降格

Phase 3.5: 中学生 + スカウト + ドラフト                   [1.5週間]
────────────────────────────────────────────────────
  (v0.2.0 と同じ + DB からの中学生ロード)

Phase 4.0: UI + Claw 運用ツール                           [2-3週間]
────────────────────────────────────────────────────
  (v0.2.0 と同じ + Claw コマンドの本格実装)
```

---

---

## 12. 補足: PersonBlueprint の不変性と例外ルール

### 12.1 原則

> PersonBlueprint は **ゲームエンジンからは不変**。変更できるのは **Claw のみ**、かつ **ゲーム開始前またはオフシーズン中** に限る。

### 12.2 Claw が補正できるフィールドと条件

| フィールド | 補正可能か | 条件 | 用途 |
|-----------|-----------|------|------|
| `firstName`, `lastName` | ❌ 不可 | — | 名前は生涯不変 |
| `birthYear` | ❌ 不可 | — | 年齢計算の基盤 |
| `height`, `weight` | ⚠️ 生成後24h以内のみ | 誤生成の修正 | 身体パラメータの明らかなミス |
| `primaryPosition`, `subPositions` | ⚠️ 高校入学前のみ | 中学時代の成長を反映 | 投手→野手転向など |
| `traits` | ⚠️ 高校入学前のみ | 中学時代のイベントを反映 | 性格形成イベント |
| `initialStats` | ❌ 不可 | — | 中1時点の能力は確定済み |
| `ceilingStats` | ✅ いつでも可 | バランス調整 | 天井値の上方/下方修正 |
| `growthProfile.growthType` | ❌ 不可 | — | 成長の根幹は不変 |
| `growthProfile.curves[*].baseRate` | ✅ いつでも可 | バランス調整 | 成長速度の微調整 |
| `growthProfile.curves[*].peakAge` | ✅ いつでも可 | バランス調整 | ピーク時期の調整 |
| `growthProfile.curves[*].peakWidth` | ✅ いつでも可 | バランス調整 | ピーク幅の調整 |
| `growthProfile.curves[*].variance` | ✅ いつでも可 | バランス調整 | 揺らぎの調整 |
| `growthProfile.slumpRisk` | ✅ いつでも可 | バランス調整 | スランプ耐性の調整 |
| `growthProfile.durability` | ✅ いつでも可 | バランス調整 | 怪我耐性の調整 |
| `qualityTier` | ❌ 不可 | — | 生成時の分類は不変 |

### 12.3 補正の監査ログ

```sql
CREATE TABLE blueprint_edits (
  id            TEXT PRIMARY KEY,
  blueprint_id  TEXT NOT NULL REFERENCES person_blueprints(id),
  edited_at     TIMESTAMP NOT NULL,
  edited_by     TEXT NOT NULL,           -- "claw_auto" | "claw_manual"
  field_path    TEXT NOT NULL,           -- "growth_profile.curves.contact.peakAge"
  old_value     TEXT NOT NULL,           -- JSON
  new_value     TEXT NOT NULL,           -- JSON
  reason        TEXT NOT NULL            -- 補正理由
);
```

全ての補正は `blueprint_edits` に記録される。これにより：
- いつ、誰が、何を、なぜ変えたかが追跡可能
- バランス崩壊時に補正を巻き戻せる
- 補正の影響範囲を後から分析できる

### 12.4 ゲームエンジンが Blueprint を変えない理由

1. **再現性**: 同じ Blueprint + 同じ RNG シード → 同じ成長結果。Blueprint が動的に変わるとシード再現が壊れる
2. **責務分離**: ゲームエンジンは「今の状態」を変える。「設計図」を変えるのは別の責務（Claw）
3. **デバッグ容易性**: 能力が想定外の値になった時、Blueprint が不変なら原因は PersonState 側の計算に限定できる
4. **マルチプレイ将来拡張**: 同じ Blueprint を共有する複数のゲーム世界（シナリオ分岐）が可能になる

---

## 13. 補足: 基礎成長と試合後成長の関係整理

### 13.1 成長の2つの経路

```
┌─────────────────────────────────────────────────────────┐
│                    1日の成長フロー                        │
│                                                         │
│  経路A: 基礎成長（練習ベース）                           │
│  ──────────────────────────                              │
│  発火条件: 練習日（毎日）                                │
│  入力: StatGrowthCurve + PracticeMenu + コンディション   │
│  計算: calculateStatGainV3()                             │
│  対象: 練習メニューの statEffects に含まれる能力のみ     │
│  倍率: ×1.0（通常）、×1.5（合宿）                       │
│                                                         │
│  経路B: 試合成長（試合経験ベース）                       │
│  ──────────────────────────                              │
│  発火条件: 大会の試合に出場した日のみ                    │
│  入力: StatGrowthCurve + 試合個人成績 + 大会コンテキスト │
│  計算: applyMatchGrowthV3()                              │
│  対象: 試合で使った能力（打撃系/投球系/守備系）          │
│  倍率: ×2.0（地区）、×2.5（県）、×3.0（甲子園）        │
│                                                         │
│  ⚠️ 両方は同日に発生しない                               │
│  練習日 → 経路A のみ                                    │
│  試合日 → 経路B のみ（練習しない）                       │
│  オフ日 → どちらも発生しない                             │
└─────────────────────────────────────────────────────────┘
```

### 13.2 基礎成長と試合成長の計算式の関係

```typescript
// === 経路A: 基礎成長 ===
function dailyPracticeGain(curve: StatGrowthCurve, ctx: GrowthContextV3, rng: RNG): number {
  return curve.baseRate
    * peakMultiplier(ctx.currentAge, curve.peakAge, curve.peakWidth)
    * moodMultiplier(ctx.mood)
    * fatigueMultiplier(ctx.fatigue)
    * traitMultiplier(ctx.traits)
    * ctx.seasonMultiplier            // 合宿 ×1.5
    * ceilingPenalty(ctx.current, ctx.ceiling)
    * slumpFactor(ctx.isInSlump, curve.slumpPenalty)
    * affinityFactor(curve, ctx.practiceMenuId)
    * varianceSample(curve.variance, rng);
}

// === 経路B: 試合成長 ===
// 基本構造は経路Aと同じ StatGrowthCurve を使う。
// 違いは「baseGain の算出元」と「倍率」。

function matchGain(curve: StatGrowthCurve, ctx: MatchGrowthContextV3, rng: RNG): number {
  // 試合での実績に基づく baseGain を算出
  const performanceGain = calculatePerformanceGain(ctx.performance);
  
  return performanceGain
    * curve.baseRate                   // ← 同じ StatGrowthCurve を参照
    * peakMultiplier(ctx.currentAge, curve.peakAge, curve.peakWidth)  // ← 同じピーク関数
    * MATCH_GROWTH_MULTIPLIER          // 試合倍率 ×2.0
    * tournamentBonus(ctx.tournamentType)  // 大会種別ボーナス
    * clutchBonus(ctx.isClutch)        // 得点圏ボーナス
    * ceilingPenalty(ctx.current, ctx.ceiling)
    * varianceSample(curve.variance, rng);
}

// 試合成長のポイント:
// 1. StatGrowthCurve.baseRate と peakAge/peakWidth を共有
//    → 「練習で伸びやすい時期 ≒ 試合でも伸びやすい時期」
// 2. slumpPenalty は試合成長には適用しない
//    → 「スランプ中でも実戦で結果を出せば成長する」設計
// 3. 練習メニュー適性(practiceAffinity)は試合成長には適用しない
//    → 試合は実績ベースなので練習タイプは関係ない
```

### 13.3 経路A / 経路B の StatGrowthCurve 共有まとめ

| StatGrowthCurve のパラメータ | 経路A（練習） | 経路B（試合） |
|---------------------------|-------------|-------------|
| `baseRate` | ✅ 使用 | ✅ 使用（performanceGain との乗算） |
| `peakAge` | ✅ 使用 | ✅ 使用 |
| `peakWidth` | ✅ 使用 | ✅ 使用 |
| `variance` | ✅ 使用 | ✅ 使用 |
| `slumpPenalty` | ✅ 使用 | ❌ 不使用（試合は実績ベース） |
| `practiceAffinity` | ✅ 使用 | ❌ 不使用（試合に練習タイプなし） |

### 13.4 年間の成長量内訳（contact, 高2普通型の例）

| 成長源 | 日数 | 1日あたり | 年間合計 | 割合 |
|--------|------|----------|---------|------|
| 練習日（基礎成長） | ~280日 | 0.035 | +9.8 | 75% |
| 大会試合（試合成長） | ~8試合 | 0.40 | +3.2 | 25% |
| **合計** | | | **+13.0** | 100% |

甲子園出場時（+4試合）: 試合成長が +4.8 に増加、合計 +14.6（+12%ボーナス）

---

## 14. 補足: PersonRegistry の forgotten 降格と物理削除

### 14.1 forgotten への降格条件

```typescript
function shouldForgotten(entry: PersonRegistryEntry, currentYear: number): boolean {
  // 現役は絶対に forgotten にしない
  if (entry.stage.type === 'middle_school' || entry.stage.type === 'high_school') {
    return false;
  }
  
  const graduationYear = entry.stage.type === 'graduated' ? entry.stage.year
    : entry.stage.type === 'pro' ? entry.stage.year
    : 0;
  
  const yearsSince = currentYear - graduationYear;
  
  // プロ入り選手は引退後さらに10年は保持
  if (entry.stage.type === 'pro' || entry.proRecord) {
    const retirementYear = entry.proRecord?.retirementYear ?? graduationYear + 15;
    const yearsSinceRetirement = currentYear - retirementYear;
    return yearsSinceRetirement > 10;
  }
  
  // 殿堂入り / 記録保持者は永久保持（forgotten にしない）
  if (entry.graduateSummary?.achievements.some(a => 
    a.includes('甲子園優勝') || a.includes('ドラフト1位') || a.includes('殿堂')
  )) {
    return false;
  }
  
  // 一般卒業生: 卒業後20年で forgotten
  return yearsSince > 20;
}
```

### 14.2 forgotten の扱い

| 操作 | 可否 | 説明 |
|------|------|------|
| ランタイムメモリ上での参照 | ❌ | PersonRegistry から削除済み |
| DB 上での存在 | ✅ | person_blueprints テーブルには永久に残る |
| OB検索画面からの表示 | ✅ | DBに問い合わせて再取得（遅延ロード） |
| 成績の参照 | ⚠️ | DB上の blueprint + 最終成績サマリ（ランタイムの詳細は失われている） |

### 14.3 物理削除のポリシー

> **DB上の PersonBlueprint は物理削除しない。**

理由:
1. **ストレージコスト**: 1人 ~1KB。10万人でも 100MB。問題にならない
2. **参照整合性**: 大会結果・ドラフト履歴が blueprint_id を参照している。削除すると外部キー違反
3. **再発見の価値**: 30年後に「あの時の選手を調べたい」需要がある
4. **Claw の学習データ**: 過去の全世代データは、将来の世代生成の品質改善に使える

### 14.4 ランタイムからの除去タイミング

```typescript
// 年度替わりトランザクションの Phase F で実行
function prunePersonRegistry(registry: PersonRegistry, currentYear: number): PersonRegistry {
  const prunedEntries = new Map<string, PersonRegistryEntry>();
  
  for (const [id, entry] of registry.entries) {
    if (shouldForgotten(entry, currentYear)) {
      // ランタイムから除去（DB には残る）
      continue;
    }
    
    // retention レベルを更新
    const newRetention = updateRetention(entry, currentYear);
    
    if (newRetention === 'archived' && entry.retention === 'tracked') {
      // tracked → archived: 詳細データを圧縮
      prunedEntries.set(id, compressToArchive(entry));
    } else {
      prunedEntries.set(id, { ...entry, retention: newRetention });
    }
  }
  
  return { ...registry, entries: prunedEntries };
}
```

### 14.5 セーブデータへの影響

| retention | セーブに含むか | データ量 |
|-----------|--------------|---------|
| full | ✅ 全データ | ~2KB/人 |
| tracked | ✅ サマリのみ | ~500B/人 |
| archived | ✅ 最小限 | ~100B/人 |
| forgotten | ❌ 含まない | 0 |

セーブデータ削減効果（20年目の例）:
- forgotten なし: ~6.0MB
- forgotten あり: ~4.6MB（**-23%**）

---

> **次のステップ**:  
> 設計レビュー完了。Phase 3.0a の実装を開始する。  
> 最初の報告ポイント: PersonBlueprint / PersonState / hydratePlayer の型定義 + world-ticker 骨格
