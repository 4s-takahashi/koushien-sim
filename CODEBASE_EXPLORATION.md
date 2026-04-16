# Koushien-Sim Codebase Exploration - Complete Analysis

**Date**: April 14, 2026  
**Project**: koushien-sim (Baseball High School Simulation Game)  
**Phase**: 3.5 Implementation (Middle School Scouting, High School Enrollment, Draft System)

---

## TABLE OF CONTENTS

1. [Architecture Overview](#architecture-overview)
2. [DESIGN-PHASE3-WORLD.md Summary](#design-phase3-worldmd-summary)
3. [Core Data Models](#core-data-models)
4. [Source Code Files (Complete)](#source-code-files-complete)
5. [Test Infrastructure](#test-infrastructure)
6. [Configuration Files](#configuration-files)
7. [Implementation Roadmap](#implementation-roadmap)

---

## ARCHITECTURE OVERVIEW

### High-Level System Design

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
│   HighSchool (48) | MiddleSchoolPlayer (500+) | PersonRegistry
└────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│              Engine Layer (Phase 1/2 Existing)               │
│  match/ | growth/ | calendar/ | player/ | team/             │
└────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **World Equality**: All 48 schools move forward on same calendar. Calculation granularity differs by Tier, but result distributions are equivalent.
2. **Persistent Entities**: All players exist as Player instances, from middle school through high school to graduation.
3. **Three-Tier Computation**:
   - **Tier 1 (Full)**: Player school - individual daily growth, detailed condition tracking
   - **Tier 2 (Standard)**: Rival schools (3-5) - batch growth, simplified condition  
   - **Tier 3 (Minimal)**: Other schools (42-44) - weekly batch growth, minimal events

---

## DESIGN-PHASE3-WORLD.md SUMMARY

### Critical Sections for Phase 3.5

#### Section 3.3: Middle School Player Pool
- **Size**: 450-600 players total (150-200 per grade)
- **Life span**: 3 years (grade 1-3)
- **Ability evolution**: Stats grow from ~10 (avg) at grade 1 to ~25 by grade 3
- **Transition**: Grade 3 students convert to high school Player on April 1

#### Section 3.4: PersonRegistry - Unified Person Management
- **Purpose**: Tracks single ID across life stages: middle school → high school → graduate → OB
- **Structure**: Map<personId, PersonStage>
- **Life stages**:
  - `{ type: 'middle_school'; grade: 1 | 2 | 3 }`
  - `{ type: 'high_school'; schoolId: string; grade: 1 | 2 | 3 }`
  - `{ type: 'graduated'; year: number; path: CareerPath }`
  - `{ type: 'pro'; team: string; yearsActive: number }`
  - `{ type: 'retired' }`

#### Section 6: Lifecycle - Middle School → High School → Graduation

**Annual Cycle**:
```
4月  中学入学/進級 (新1年生180人生成)
5-7月  中学大会シーズン → MiddleSchoolRecord更新
8-12月  高校スカウト活動（中3対象）
1-2月  進学先決定 (targetSchoolId確定)
3月  中学卒業
4月  高校入学 (MiddleSchoolPlayer → Player変換)
     全高校ラインナップ再構成
     中学生の進級
```

#### Section 6.4: Year Transition Process (9 Steps)

**Step 0**: Snapshot save (logging)  
**Step 1-2**: Graduate 3rd year → career path + remove from roster  
**Step 3**: Enroll 3rd year middle schoolers → convert & assign to high schools  
**Step 4**: Promote middle schoolers (1→2, 2→3) + generate 180 new 1st graders  
**Step 5**: Reconstruct all lineups  
**Step 6**: Update school reputation  
**Step 7**: Reset season state  
**Step 8**: Update Tier assignments  
**Step 9**: Snapshot save

#### Section 8.1: Implementation Phases

**Phase 3.0** (2 weeks): WorldState foundation + all 48 schools daily progress  
**Phase 3.5** (1.5 weeks): Middle school pool + scouting + draft  
**Phase 4.0** (2-3 weeks): UI + OB tracking

#### Section 8.2: Phase 3.0 Detailed Implementation Order

Week 1:
1. world/world-state.ts (0.5d)
2. 48 school generation (1d)
3. batch-growth.ts + bulk-growth.ts (1d)
4. quick-game.ts (1d)
5. stat-game.ts (0.5d)
6. world-ticker.ts (1.5d)
7. tier-manager.ts (0.5d)

Week 2:
8. Tournament WorldState integration (1d)
9. Year transition (1.5d)
10. PersonRegistry (1d)
11. view-projector.ts (0.5d)
12. news-generator.ts (0.5d)
13. serializer.ts update (0.5d)
14. Integration + tuning (1d)

### Milestones

- **M1**: 48 schools grow and change stats daily
- **M2**: All tournament matches execute via Tier simulation
- **M3**: 5-year full cycle with proper year transitions
- **M4**: Middle school students born → 3-year growth → high school enrollment
- **M5**: Scouting system functions (view → track → recruit → enroll)
- **M6**: Draft system executes for all 3rd-year students

### Performance Budget

**1 Year**: ~60 seconds  
**5 Years**: ~5 minutes  
**20 Years**: ~20 minutes  
**Memory**: 5-20MB depending on data retention

---

## CORE DATA MODELS

### WorldState Structure

```typescript
interface WorldState {
  // Metadata
  version: string;
  seed: string;
  currentDate: GameDate;

  // Player info
  playerSchoolId: string;
  manager: Manager;
  settings: GameSettings;
  weeklyPlan: WeeklyPlan;

  // World entities
  prefecture: string;
  schools: HighSchool[];                    // 48 schools
  middleSchoolPool: MiddleSchoolPlayer[];   // 500+ students
  personRegistry: PersonRegistry;

  // Progress
  seasonState: SeasonState;
}
```

### HighSchool (extends Team compatibility)

```typescript
interface HighSchool {
  // Team-compatible fields
  id: string;
  name: string;
  prefecture: string;
  reputation: number;
  players: Player[];
  lineup: Lineup | null;
  facilities: FacilityLevel;

  // HighSchool-specific
  simulationTier: 'full' | 'standard' | 'minimal';
  coachStyle: CoachStyle;
  yearResults: YearResults;
  _summary: TeamSummary | null;  // Cache
}
```

### MiddleSchoolPlayer (Pre-high school)

```typescript
interface MiddleSchoolPlayer {
  id: string;                           // Same ID persists to high school
  firstName: string;
  lastName: string;
  middleSchoolGrade: 1 | 2 | 3;
  middleSchoolName: string;
  prefecture: string;
  currentStats: PlayerStats;
  targetSchoolId: string | null;        // Decided by Jan-Feb
  scoutedBy: string[];                  // List of high school IDs
}
```

### PersonBlueprint (DB-stored, immutable)

```typescript
interface PersonBlueprint {
  id: string;                           // Unique, persists through lifetime
  generationId: string;                 // Batch generation ID
  
  // Basic info
  firstName: string;
  lastName: string;
  birthYear: number;
  prefecture: string;
  hometown: string;
  middleSchool: string;
  
  // Physical
  height: number;
  weight: number;
  throwingHand: Hand;
  battingSide: BattingSide;
  
  // Position
  primaryPosition: Position;
  subPositions: Position[];
  
  // Traits
  traits: TraitId[];
  personality: 'introvert' | 'extrovert' | 'balanced';
  
  // Abilities (static)
  initialStats: PlayerStats;            // Middle school grade 1
  ceilingStats: PlayerStats;            // Peak possible ability
  
  // Growth curve
  growthProfile: GrowthProfile;          // Contains StatGrowthCurve[]
  
  // Meta
  qualityTier: 'S' | 'A' | 'B' | 'C' | 'D';
  isPitcher: boolean;
  rarity: number;                       // 0.0-1.0
  manuallyEdited: boolean;
  editNotes: string | null;
}
```

### PersonState (Runtime dynamic)

```typescript
interface PersonState {
  blueprintId: string;
  
  // Life stage
  currentStage: PersonStage;
  enrollmentYear: number;
  schoolId: string | null;
  
  // Dynamic abilities
  currentStats: PlayerStats;
  
  // Condition
  condition: ConditionState;
  mentalState: MentalState;
  
  // Career
  careerStats: CareerRecord;
  
  // Tracking
  cumulativeGrowth: CumulativeGrowth;
  eventHistory: PersonEvent[];
}
```

### PersonRegistry (Unified registry)

```typescript
interface PersonRegistry {
  entries: Map<string, PersonRegistryEntry>;
}

interface PersonRegistryEntry {
  personId: string;
  retention: 'full' | 'tracked' | 'archived' | 'forgotten';
  stage: PersonStage;
  state?: PersonState;              // if retention='full'
  graduateSummary?: GraduateSummary; // if retention='tracked'
  archive?: GraduateArchive;        // if retention='archived'
}
```

### GrowthProfile & StatGrowthCurve

```typescript
interface StatGrowthCurve {
  baseRate: number;                 // 0.01-1.0, daily base growth
  peakAge: number;                  // 13-18, peak age in-game
  peakWidth: number;                // 1.0-3.0, bell curve width
  variance: number;                 // 0.0-1.0, daily variance
  slumpPenalty: number;             // 0.0-1.0, growth reduction in slump
  practiceAffinity?: Record<PracticeMenuId, number>;
}

interface GrowthProfile {
  growthType: 'early' | 'normal' | 'late' | 'genius';
  curves: GrowthCurveSet;           // One curve per stat
  slumpRisk: number;
  slumpRecovery: number;
  awakeningChance: number;
  durability: number;
  mentalGrowthFactor: number;
}
```

### Three-Tier Simulation

| Aspect | Tier 1 (Full) | Tier 2 (Standard) | Tier 3 (Minimal) |
|--------|---|---|---|
| **Schools** | Player's school (1) | Rivals (3-5) | Others (42-44) |
| **Daily Growth** | `applyDailyGrowth()` individual | `applyBatchGrowth()` | `applyBulkGrowth()` weekly |
| **Match** | `runGame()` full simulation | `quickGame()` at-bat level | `statGame()` stat-based |
| **Condition** | Detailed tracking | Simplified | Minimal |
| **Cost/Day** | ~50ms | ~5ms | ~0.5ms |
| **Match Cost** | 500ms | 50ms | 2ms |

---

## SOURCE CODE FILES (COMPLETE)

### 1. world-state.ts
**Location**: `src/engine/world/world-state.ts`

Defines core WorldState and related types:
- `SimulationTier` type
- `HighSchool` interface (team-compatible)
- `TeamSummary` (for team strength calculation)
- `YearResults` (season performance tracking)
- `MiddleSchoolPlayer` interface
- `SeasonState` and `SeasonPhase` types
- `WeeklyPlan` (practice schedule)
- `GameSettings` interface
- Factory functions: `createEmptyYearResults()`, `createDefaultWeeklyPlan()`, `createInitialSeasonState()`

**Key contracts**:
- HighSchool is compatible with Team type for existing functions
- MiddleSchoolPlayer has same ID as eventual Player
- All schools follow same GameDate calendar

---

### 2. person-state.ts
**Location**: `src/engine/world/person-state.ts`

Runtime dynamic state for persons throughout their lifetime:

**PersonStage Discriminated Union**:
```typescript
type PersonStage =
  | { type: 'middle_school'; grade: 1 | 2 | 3 }
  | { type: 'high_school'; schoolId: string; grade: 1 | 2 | 3 }
  | { type: 'graduated'; year: number; path: CareerPath }
  | { type: 'pro'; team: string; yearsActive: number }
  | { type: 'retired' };
```

**PersonState fields**:
- `blueprintId`: Reference to immutable PersonBlueprint
- `currentStage`: Life stage discriminated union
- `enrollmentYear`: High school entry year (0 if middle school)
- `schoolId`: Current school (null if not enrolled)
- `currentStats`: Dynamic ability values
- `condition`: Fatigue, injury, mood
- `mentalState`: Stress, confidence, team chemistry
- `careerStats`: Career-long statistics
- `cumulativeGrowth`: Debugging/validation tracking
- `eventHistory`: Recent life events

**PersonRegistry**:
- Tracks all persons from middle school through retirement
- Supports multiple retention levels to manage memory:
  - `full`: Complete PersonState in memory
  - `tracked`: Lightweight GraduateSummary
  - `archived`: Ultra-compact GraduateArchive
  - `forgotten`: Not tracked at all

---

### 3. person-blueprint.ts
**Location**: `src/engine/world/person-blueprint.ts`

Static, immutable blueprint stored in DB. Contains all non-time-varying properties:

**StatGrowthCurve**:
- `baseRate`: 0.01-1.0, foundation for daily growth
- `peakAge`: 13-18, peak age for this stat
- `peakWidth`: 1.0-3.0, Gaussian width
- `variance`: Daily variation amplitude
- `slumpPenalty`: Reduction during slump
- `practiceAffinity`: Optional per-practice-type multipliers

**GrowthProfile**:
- `growthType`: 'early', 'normal', 'late', 'genius' (determines curve shapes)
- `curves`: Full GrowthCurveSet (one per stat)
- `slumpRisk`, `slumpRecovery`, `awakeningChance`, `durability`
- `mentalGrowthFactor`: How much match experience affects mental stats

**PersonBlueprint**:
- Uniquely identifies person across lifetime (`id`)
- Basic info: name, birth year, prefecture, hometown, middle school
- Physical: height, weight, throwing hand, batting side
- Position: primary + sub positions
- Traits: List of TraitIds for personality/skill modifiers
- `initialStats`: Ability values at middle school entry (~10-20 range)
- `ceilingStats`: Peak possible abilities (~70-100 range)
- `growthProfile`: Complete growth curve set
- Quality tier, pitcher flag, rarity

**CoachStyle** (for AI schools):
- `offenseType`: 'power', 'speed', 'balanced', 'bunt_heavy'
- `defenseType`: 'ace_centric', 'relay', 'balanced'
- `practiceEmphasis`: 'batting', 'pitching', 'defense', 'balanced'
- `aggressiveness`: 0-100 (stealing/bunting frequency)

---

### 4. hydrate.ts
**Location**: `src/engine/world/hydrate.ts`

Bridges between DB separation (Blueprint + State) and runtime unified Player type:

**hydratePlayer(blueprint, state, year): Player**
- Merges PersonBlueprint (static) + PersonState (dynamic) → Player
- Calculates Grade from enrollmentYear and current year
- All Phase 1/2 code operates on Player type via this function

**dehydratePlayer(player, existingState): PersonState**
- Extracts dynamic fields (stats, condition, career) from Player
- Preserves existing State fields not changed

**convertToHighSchoolPlayer(ms, enrollmentYear, facilities, rng): Player**
- Converts MiddleSchoolPlayer → high school Player
- **Preserves ID** (critical for PersonRegistry tracking)
- **Transfers stats**: Current middle school stats → high school starting stats
- **Boosts ceiling**: `ceiling = middle_stat + random(30-65) × facility_multiplier`
- **Resets condition**: fatigue=0, injury=null, mood='normal'
- **Resets career**: High school career starts fresh
- **Random growth type**: Assigned based on roll (early/normal/late/genius)
- **Random growth rate**: Varies by growth type (early: 1.3-1.8, normal: 0.8-1.2, etc.)

---

### 5. year-transition.ts
**Location**: `src/engine/world/year-transition.ts`

Executes March 31 → April 1 annual transition. 9-step transactional process:

**Step 1 & 2: Graduation of 3rd-year students**
- `graduateSeniors()`: Identify all grade 3+ players
- Decide career paths: Pro (30% if overall>70), University (40%), Corporate (30%), Retire
- Remove from school rosters
- Log graduatedIds and careerPaths

**Step 3: High school enrollment of 3rd-year middle schoolers**
- `assignMiddleSchoolersToHighSchools()`: Distribute middle school grade 3 to high schools
- If `targetSchoolId` set, assign to that school (highest priority)
- Otherwise, random assignment weighted by school reputation
- Constraints: Min 3, max 18 players per school
- `convertToHighSchoolPlayer()`: Transform each into Player
- Add to school rosters

**Step 4: Middle school progression**
- Promote grade 1→2, 2→3
- Generate 180 new grade 1 students
- Add to middleSchoolPool

**Step 5: Lineup reconstruction**
- `autoGenerateLineup()` for each school
- Ensures teams have functional batting order

**Step 6: Reputation update**
- Summer tournament result: ≥Semi-finals +3, ≥QF +1
- Autumn tournament result: ≥QF +1
- Koshien appearance: +5, result ≥ second round +3
- Pro players drafted: +2 each
- Random variance ±2
- Bounds: 1-100

**Step 7: Season state reset**
- Set phase to 'spring_practice'
- Clear tournament ID
- Clear year results

**Step 8: Tier update**
- Call `updateSimulationTiers()`
- Adjust school computational focus

**Key functions**:
- `decideCareerPath(player, rng)`: Probabilistic career assignment
- `computeOverall(player)`: Overall rating 0-100
- `updateReputation(school, rng)`: Reputation evolution
- `generateNewMiddleSchoolers(year, count, prefecture, rng)`: Batch middle school generation

---

### 6. world-ticker.ts
**Location**: `src/engine/world/world-ticker.ts`

Main simulation loop advancing world by one day:

**advanceWorldDay(world, playerMenuId, rng): { nextWorld, result }**

**Processing order**:
1. Get dayType, seasonMultiplier, dayOfWeek
2. Process each school based on Tier:
   - **Tier 1** (`advanceSchoolFull`): Call existing `processDay()`, get detailed DayResult
   - **Tier 2** (`advanceSchoolStandard`): Call `applyBatchGrowth()` for all players
   - **Tier 3** (`advanceSchoolMinimal`): Call `applyBulkGrowth()` on Sundays only
3. Process middle school pool (`advanceMiddleSchool`):
   - Sundays only: apply weekly batch growth
   - Growth scale by grade (1=0.8x, 2=1.0x, 3=1.2x)
4. Advance date (`advanceDate()`)
5. **Check for year transition**: If newDate is April 1, call `processYearTransition()`
6. Return updated WorldState + WorldDayResult

**Middle school growth** (advanceMiddleSchool):
```
gradeMultiplier = grade === 1 ? 0.8 : grade === 2 ? 1.0 : 1.2
weeklyGain = 0.3 × gradeMultiplier × seasonMultiplier
For each stat: gain × random(0.7-1.3) × stat_cap
```

**WorldDayResult**:
```typescript
interface WorldDayResult {
  date: GameDate;
  playerSchoolResult: DayResult;      // Phase 1 compatible
  worldNews: WorldNewsItem[];
  seasonTransition: SeasonPhase | null;
}
```

**Helper**: `getDayOfWeek(date): 0-6` (0=Sunday)

---

### 7. tier-manager.ts
**Location**: `src/engine/world/tier-manager.ts`

Dynamic tier assignment based on game state:

**updateSimulationTiers(world, recentlyFaced, schoolTournamentCounts): WorldState**

**Tier rules**:
- **Player school** → Always 'full' (immutable)
- **Faced recently** → Minimal → Standard (upgrade)
- **Top 3 strong schools** (reputation ≥70) → Minimum Standard (can't drop to minimal)
- **No interaction + 0 tournaments** → Standard → Minimal (downgrade)
- All others: maintain current tier

**applyTournamentFacing(world, facedIds): WorldState**
- Called after tournament ends
- Updates tiers based on schools faced in that tournament

---

### 8. growth-curve.ts
**Location**: `src/engine/world/growth-curve.ts`

V3 growth calculation system using StatGrowthCurve:

**peakMultiplier(currentAge, peakAge, peakWidth): 0.2-1.5**
- Bell curve: `exp(-0.5 × ((age - peakAge) / peakWidth)²)`
- Min 0.2 (far from peak), Max 1.5 (at peak)
- Early-type: peak at 14, width ~1.5
- Normal-type: peak at 16, width ~2.0
- Late-type: peak at 18, width ~1.5
- Genius-type: peak at 16, width ~3.0 (flatter, longer plateau)

**Multiplier functions** (existing from Phase 1/2):
- `moodMultiplier(mood)`: 0.75-1.15
- `fatigueMultiplier(fatigue)`: 0.4-1.0
- `traitMultiplier(traits)`: 0.8-1.15
- `ceilingPenalty(current, ceiling)`: 0.05-1.0 (penalizes when near ceiling)

**calculateStatGainV3(curve, ctx, rng): number**
- Combines all multipliers:
  - `baseRate × peak × mood × fatigue × trait × seasonMultiplier × ceiling × slump × affinity × variance`
- Used by Tier 1 for individual daily stat gains
- Can be integrated with match growth

**GrowthContextV3**:
```typescript
interface GrowthContextV3 {
  currentAge: number;
  current: number;         // Current stat value
  ceiling: number;         // Maximum possible
  mood: Mood;
  fatigue: number;
  traits: readonly TraitId[];
  seasonMultiplier: number;
  isInSlump: boolean;
  practiceMenuId: PracticeMenuId;
}
```

---

### 9. school-generator.ts
**Location**: `src/engine/world/school-generator.ts`

Generates 47 AI schools + configures player school:

**generateAISchools(playerSchool, prefecture, initialYear, rng): HighSchool[]**

**Distribution**:
- Strong schools: reputation 70-90 (4-5 schools)
- Mid-tier: reputation 45-70 (12 schools)
- Average: reputation 25-45 (20 schools)
- Weak: reputation 10-25 (12 schools)

**Per-school generation**:
- 20-25 players distributed across 3 grades
- Each player generated via `generatePlayer()`
- CoachStyle randomized: offense (power/speed/balanced/bunt), defense (ace/relay/balanced), practice (batting/pitching/defense/balanced), aggressiveness 20-90
- Facilities scaled to reputation (reputation/20 + random 0-3, capped 1-10)

**Key functions**:
- `randomCoachStyle(rng)`: Generate AI manager preference
- `randomFacilities(rng, reputation)`: Generate facility levels
- `computeTeamSummary()`: Calculate team strength (batting avg, ace strength, defense avg)
- `generateSchoolPlayers()`: Create roster for one school
- `generateAISchools()`: Public API to generate all 47 + configure player school

---

### 10. create-world.ts
**Location**: `src/engine/world/create-world.ts`

Initializes complete WorldState from scratch:

**createWorldState(playerTeam, manager, prefecture, seed, rng): WorldState**

**Steps**:
1. Convert player's Team → HighSchool with tier='full'
2. Generate 47 AI schools via `generateAISchools()`
3. Generate middle school pool (540 students: 180 per grade)
4. Initialize PersonRegistry (empty map)
5. Assemble WorldState with all components

**Middle school pool generation**:
- Grade distribution: 1, 2, 3
- 180 per grade = 540 total
- Initial stats by grade: grade N students have ability ~10 + (N-1)×5
- Random middle school names (prefecture + suffix)
- Random Japanese names

**Initial values**:
- All schools: yearResults = empty
- All schools: seasonState = spring_practice
- PersonRegistry: empty entries map
- weeklyPlan: default balanced schedule

---

### 11. player.ts (Types)
**Location**: `src/engine/types/player.ts`

Core Player type used throughout Phase 1/2 engine:

**Position**: pitcher, catcher, 1st-3rd, shortstop, left/center/right outfield

**Player interface**:
```typescript
interface Player {
  id: string;
  firstName: string;
  lastName: string;
  enrollmentYear: number;
  position: Position;
  subPositions: Position[];
  battingSide: BattingSide;      // left/right/switch
  throwingHand: Hand;             // left/right
  height: number;
  weight: number;
  stats: PlayerStats;             // Current ability
  potential: PotentialStats;      // Ceiling, growth rate, type
  condition: ConditionState;      // Fatigue, injury, mood
  traits: TraitId[];              // Personality/skill traits
  mentalState: MentalState;       // Stress, confidence, chemistry
  background: Background;         // hometown, middle school
  careerStats: CareerRecord;      // Career-long statistics
}
```

**PlayerStats**:
```typescript
interface PlayerStats {
  base: BaseStats;
    stamina, speed, armStrength, fielding, focus, mental
  batting: BattingStats;
    contact, power, eye, technique
  pitching: PitchingStats | null;
    velocity, control, pitchStamina, pitches{}
}
```

**PotentialStats**:
```typescript
interface PotentialStats {
  ceiling: PlayerStats;           // Max possible values
  growthRate: number;             // Multiplier (0.5-2.0)
  growthType: GrowthType;         // 'early'|'normal'|'late'|'genius'
}
```

**GrowthType** (4 types):
- 'early': Peaks at 14, declines by 18
- 'normal': Steady growth through high school
- 'late': Slow early, peaks at 18
- 'genius': Continuously strong growth

---

### 12. enrollment.ts
**Location**: `src/engine/team/enrollment.ts`

Phase 1/2 existing code for processing student enrollment:

**processGraduation(team, currentYear)**:
- Identifies all grade 3+ students
- Converts to GraduateRecord
- Removes from roster
- Returns { team: Team, graduates: GraduateRecord[] }

**toGraduateRecord(player, graduationYear): GraduateRecord**
- Creates lightweight summary of graduated player
- Computes overall, batting, pitching ratings
- Stores final stats, growth type, traits

**processEnrollment(team, currentYear, reputation, rng)**:
- Generates new students: baseCount = 5 + floor(reputation/10)
- Variance: ±2 students
- Constraint: 3-18 students per school
- Returns { team: Team, newPlayers: Player[] }

**Phase 3.5 integration**: 
- This module will be complemented by middle school enrollment
- New students will come from middleSchoolPool instead of random generation

---

## TEST INFRASTRUCTURE

### Test Files

**Location**: `tests/engine/world/`

Files present:
- `world-core.test.ts` - GrowthCurve functions, hydratePlayer, etc.
- `world-ticker.test.ts` - Daily world advancement
- `year-transition.test.ts` - Annual transition
- `tier-manager.test.ts` - Tier assignment logic
- `batch-growth.test.ts` - Tier 2 growth calculation
- `bulk-growth.test.ts` - Tier 3 growth calculation
- `integration.test.ts` - Multi-year full simulation

### Test Framework

- **Runner**: Vitest 4.1.4
- **UI**: @vitest/ui 4.1.4
- **Assertions**: Native expect()
- **RNG for tests**: `createRNG(seed)` with seedrandom 3.0.5

### Test Structure Example (from world-core.test.ts)

```typescript
describe('peakMultiplier', () => {
  it('returns max at peak age', () => { ... });
  it('returns lower value away from peak', () => { ... });
  // ... more cases
});

describe('calculateStatGainV3', () => {
  it('produces positive gain under normal conditions', () => { ... });
  it('slump reduces gain', () => { ... });
  it('high fatigue reduces gain', () => { ... });
});
```

### Key Test Concerns (from design doc)

1. **Tier equivalence**: Tier 2 and 3 growth distributions ±10-15% of Tier 1
2. **Match equivalence**: quickGame and statGame produce similar score distributions as runGame
3. **Lifecycle coherence**: Middle school → high school → graduate preserves ID
4. **Year-long stability**: 20-year run maintains roster sizes 15-30 per school, pool 400-700
5. **Seed reproducibility**: Same seed produces identical results
6. **Performance budgets**: 1 year < 60 sec, 5 years < 5 min, memory < 50 MB

---

## CONFIGURATION FILES

### package.json
- **test runner**: vitest 4.1.4
- **UI framework**: React 19.2.4, Next.js 16.2.3
- **DB**: Dexie 4.4.2
- **RNG**: seedrandom 3.0.5
- **State**: Zustand 5.0.12
- **TypeScript**: 5.x

**Scripts**:
- `npm run dev` - Start dev server
- `npm run build` - Production build
- `npm run start` - Run production

### tsconfig.json
- **Target**: ES2017
- **Strict mode**: Enabled
- **Module**: esnext
- **Path alias**: `@/*` → `src/*`
- **JSX**: react-jsx

---

## IMPLEMENTATION ROADMAP FOR PHASE 3.5

### Phase 3.5 Goals
> **Timeline**: 1.5 weeks after Phase 3.0 completion  
> **Prerequisite**: Phase 3.0 fully functional (all 48 schools, daily advancement, year transitions)

### New Components to Add

1. **Middle School Growth System**
   - MiddleSchoolPlayer stats evolution during 3 years
   - Separate growth curves for middle school (different peak ages?)
   - Integration with MiddleSchoolRecord (best tournament result, position, reputation)

2. **Scouting System**
   - Player selects middle school students to scout
   - Scouting updates visibility:
     - Unscoured: Name, school only
     - Scouted once: Name, rough ability rank (S/A/B/C/D)
     - Scouted multiple times: Detailed stats (with margin of error)
   - Scouting cost or attention resource (TBD by UI design)

3. **Recruitment / Persuasion**
   - Player recruits middle school students after scouting
   - Recruitment success depends on:
     - School reputation vs rival schools
     - Player promise/incentive
     - Student's natural preference
   - Stores in `MiddleSchoolPlayer.targetSchoolId` and `scoutedBy[]`

4. **Draft System**
   - All 48 schools select graduating 3rd-year students
   - Multi-round national draft (TBD: pick order, league structure)
   - Draft picks assigned to career paths (mostly pro/university)

5. **PersonRegistry Completion**
   - Integrate MiddleSchoolPlayer into registry
   - Support all 5 life stages properly
   - Retention levels: full → tracked → archived → forgotten

### Integration Points

**With year-transition.ts**:
- Step 3 uses `assignMiddleSchoolersToHighSchools()` → replace with recruited + random backup
- Recruited students prioritized to their target schools

**With world-ticker.ts**:
- Add tournament schedule for middle school tournaments (optional for Phase 3.5)
- Middle school growth already in `advanceMiddleSchool()`

**With UI layer** (Phase 4):
- Scout view: browse middle school students, initiate scouting
- Recruitment view: recruit scouted students, track persuasion status
- Middle school stats comparison vs rivals

### Success Criteria (from design doc)

- **M4**: Middle school grade 1 generation → 3 years growth → high school entry → 3 years → graduation, all with ID persistence
- **M5**: Scout → track → recruit → enroll workflow fully functional
- **M6**: Draft system identifies top students from graduating class, assigns to pro/university/corporate

### Data Changes

- `MiddleSchoolPlayer`: Add `scoutingHistory`, `recruitmentOffers[]`, `preferenceWeights`
- `PersonRegistry`: Support MiddleSchoolPlayer entries
- `WorldState`: Add `draftQueue`, `scoutingLog` (optional)
- `HighSchool`: Track scouting targets and successes

### Code Additions

- `middle-school/growth.ts` - Growth calculation for middle schoolers
- `middle-school/scouting.ts` - Scouting system
- `middle-school/recruitment.ts` - Persuasion/recruitment logic
- `middle-school/draft.ts` - Draft execution
- Update `year-transition.ts` Step 3 to use recruitment results
- Update `world-ticker.ts` to handle middle school events

---

## CRITICAL IMPLEMENTATION NOTES

### 1. ID Persistence
**CRITICAL**: MiddleSchoolPlayer.id must remain identical when converted to Player via `convertToHighSchoolPlayer()`. PersonRegistry tracks by this ID across all life stages.

### 2. Tier Computation
Tier 3 schools process **weekly only** (Sundays) for performance. Adjusting daily would triple computation cost.

### 3. Growth Distribution Equivalence
The three tiers must produce statistically identical outcomes. Testing suite must verify:
- Same starting player in Tier 1 (daily) vs Tier 2 (batch) vs Tier 3 (bulk) over 365 days produces ±10-15% final stats

### 4. Year Transition Atomicity
All 9 steps of year-transition must execute as atomic transaction. Partial failure would corrupt registry.

### 5. Cache Invalidation
All HighSchool `_summary` cache must be invalidated when players are modified. Current code sets `_summary: null` after every update.

### 6. Memory Management
With 1200 high school players + 540 middle school players + PersonRegistry, watch for:
- Player object cloning in updates (expensive)
- PersonState replication for each player during save
- Consider lazy loading Tier 3 player details

### 7. RNG Determinism
All random operations must use derived RNGs with deterministic seeds. Never use `Math.random()`.

Example:
```typescript
const schoolRng = rng.derive(`school:${school.id}`);
const playerRng = schoolRng.derive(`player:${player.id}`);
```

### 8. Conversion Functions
- `hydratePlayer()`: Blueprint + State → Player (used by all growth/match code)
- `dehydratePlayer()`: Player → State (used by save/sync code)
- `convertToHighSchoolPlayer()`: MiddleSchoolPlayer → Player (used by enrollment)

All preserve ID, stats, and mental traits.

---

## SUMMARY TABLE

| Component | File | Key Exports | Inputs | Outputs |
|-----------|------|-------------|--------|---------|
| WorldState Types | world-state.ts | WorldState, HighSchool, MiddleSchoolPlayer | - | Type definitions |
| Person State | person-state.ts | PersonState, PersonStage, PersonRegistry | - | Dynamic person tracking |
| Person Blueprint | person-blueprint.ts | PersonBlueprint, GrowthProfile, StatGrowthCurve | - | Static person design |
| Hydration | hydrate.ts | hydratePlayer, convertToHighSchoolPlayer | Blueprint + State | Player |
| Year Transition | year-transition.ts | processYearTransition | WorldState + RNG | Updated WorldState |
| World Ticker | world-ticker.ts | advanceWorldDay | WorldState + menuId + RNG | NextWorld + DayResult |
| Tier Manager | tier-manager.ts | updateSimulationTiers | WorldState | Updated tiers |
| Growth Curve | growth-curve.ts | peakMultiplier, calculateStatGainV3 | Curve + Context + RNG | Stat gain value |
| School Generator | school-generator.ts | generateAISchools | PlayerSchool + RNG | HighSchool[] (48 total) |
| World Creator | create-world.ts | createWorldState | Team + Manager + RNG | Initial WorldState |
| Player Types | player.ts | Player, PlayerStats, PotentialStats | - | Type definitions |
| Enrollment (P1) | enrollment.ts | processGraduation, processEnrollment | Team + Year + RNG | Updated Team + Records |

---

**Document Created**: April 14, 2026  
**Status**: Complete Codebase Exploration  
**Next Steps**: Begin Phase 3.5 implementation (middle school system, scouting, enrollment, draft)

