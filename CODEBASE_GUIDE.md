# Koushien-Sim Project: Comprehensive Codebase Analysis

## Project Overview

**koushien-sim** is a high school baseball simulation game built with:
- **Frontend**: Next.js 16 + React 19 + TypeScript
- **State Management**: Zustand 5
- **Storage**: IndexedDB (via Dexie) + In-Memory
- **Testing**: Vitest
- **Random Number Generation**: seeded RNG (seedrandom)

The game features:
- Full career simulation for high school baseball players
- Scout system for recruiting middle school players
- Draft system for pro baseball entry
- Year transition management
- World ticker for multi-school simulation
- Growth & development systems
- Match simulation engine

---

## Directory Structure

### Top-Level Structure

```
koushien-sim/
├── src/                    # Source code
├── tests/                  # Test files
├── scripts/                # Build/utility scripts
├── public/                 # Static assets
├── .next/                  # Next.js build output
├── node_modules/          # Dependencies
├── package.json            # Project metadata
├── tsconfig.json          # TypeScript config
├── vitest.config.ts       # Vitest config
├── next.config.ts         # Next.js config
└── [Design documents]     # DESIGN-PHASE*.md files
```

### Source Code Structure (`src/`)

```
src/
├── app/                    # Next.js app router pages
│   ├── page.tsx           # Home page
│   ├── layout.tsx         # Root layout
│   ├── scout/             # Scout management page
│   ├── team/              # Team roster & details
│   ├── results/           # Match results display
│   ├── tournament/        # Tournament view
│   └── ob/                # OB (graduate) tracking
│
├── engine/                 # Core game simulation engine
│   ├── core/              # Fundamental utilities
│   │   ├── rng.ts        # Seeded RNG system
│   │   └── id.ts         # ID generation
│   │
│   ├── types/            # Type definitions
│   │   ├── index.ts
│   │   ├── player.ts     # Player stats, traits
│   │   ├── team.ts       # Team & facility types
│   │   ├── game-state.ts # GameState (Phase 1/2)
│   │   └── calendar.ts   # GameDate, practice menus
│   │
│   ├── player/           # Player generation
│   │   ├── generate.ts   # generatePlayer()
│   │   └── name-dict.ts  # Name generation data
│   │
│   ├── growth/           # Stat growth mechanics
│   │   ├── constants.ts  # GROWTH_CONSTANTS
│   │   ├── calculate.ts  # Growth calculations
│   │   ├── practice.ts   # Practice-based growth
│   │   ├── condition.ts  # Conditioning system
│   │   ├── batch-growth.ts    # Daily batch growth
│   │   └── bulk-growth.ts     # Weekly bulk growth
│   │
│   ├── match/            # Match simulation
│   │   ├── constants.ts  # MATCH_CONSTANTS
│   │   ├── types.ts      # Match result types
│   │   ├── game.ts       # Full match simulation
│   │   ├── quick-game.ts # Fast simulation
│   │   ├── stat-game.ts  # Stats-only mode
│   │   ├── inning.ts     # Inning logic
│   │   ├── at-bat.ts     # At-bat logic
│   │   ├── result.ts     # Result calculation
│   │   ├── tactics.ts    # Managerial tactics
│   │   └── pitch/        # Pitch-by-pitch logic
│   │       ├── select-pitch.ts
│   │       ├── process-pitch.ts
│   │       ├── bat-contact.ts
│   │       ├── swing-result.ts
│   │       ├── batter-action.ts
│   │       ├── control-error.ts
│   │       └── field-result.ts
│   │
│   ├── team/             # Team management
│   │   ├── lineup.ts     # autoGenerateLineup()
│   │   ├── roster.ts     # Roster management
│   │   └── enrollment.ts # Enrollment logic
│   │
│   ├── calendar/         # Schedule & day processing
│   │   ├── game-calendar.ts # Calendar system
│   │   ├── schedule.ts      # Tournament schedule
│   │   ├── day-processor.ts # processDay()
│   │   └── index.ts
│   │
│   ├── world/            # Phase 3+ multi-school simulation
│   │   ├── world-state.ts    # WorldState type definition
│   │   ├── world-ticker.ts   # advanceWorldDay()
│   │   ├── year-transition.ts # Year transition logic
│   │   ├── create-world.ts   # World initialization
│   │   ├── tier-manager.ts   # Simulation tier management
│   │   ├── hydrate.ts        # MiddleSchoolPlayer → Player
│   │   ├── person-state.ts   # Career path types
│   │   ├── person-blueprint.ts # School/coach definitions
│   │   ├── growth-curve.ts   # Growth curve modeling
│   │   ├── school-generator.ts
│   │   │
│   │   ├── scout/           # Scout system
│   │   │   └── scout-system.ts # Scout operations
│   │   │
│   │   ├── career/          # Career progression
│   │   │   └── draft-system.ts # Draft mechanics
│   │   │
│   │   └── news/            # Event news generation
│   │       ├── news-generator.ts
│   │       └── news-types.ts
│   │
│   ├── save/             # Serialization & save management
│   │   ├── save-manager.ts
│   │   └── serializer.ts
│   │
│   ├── shared/           # Shared utilities
│   │   └── stat-utils.ts
│   │
│   └── index.ts
│
├── stores/               # Zustand stores
│   ├── game-store.ts    # GameState store (Phase 1/2)
│   └── world-store.ts   # WorldState store (Phase 3+)
│
├── ui/                   # UI/presentation layer
│   └── projectors/       # ViewState generators
│       ├── homeProjector.ts       # Home screen
│       ├── teamProjector.ts       # Team roster view
│       ├── playerProjector.ts     # Player detail view
│       ├── scoutProjector.ts      # Scout management
│       ├── tournamentProjector.ts # Tournament view
│       ├── resultsProjector.ts    # Match results
│       ├── obProjector.ts         # Graduate tracking
│       └── view-state-types.ts    # ViewState interfaces
│
└── platform/             # Platform abstraction
    ├── storage/         # Storage adapters
    │   ├── adapter.ts
    │   ├── memory.ts
    │   └── indexeddb.ts
    ├── license/         # License management
    │   ├── manager.ts
    │   └── types.ts
    └── index.ts
```

---

## Key Engine Files: Full Content Analysis

### 1. **src/engine/growth/constants.ts** — Growth Tuning Parameters

```typescript
export const GROWTH_CONSTANTS = {
  // Ability value ranges
  STAT_MIN: 1,
  STAT_MAX: 100,
  VELOCITY_MIN: 80,
  VELOCITY_MAX: 160,
  PITCH_LEVEL_MIN: 1,
  PITCH_LEVEL_MAX: 7,

  // Growth variance (RNG multiplier: 0.7–1.3)
  RANDOM_VARIANCE_MIN: 0.7,
  RANDOM_VARIANCE_MAX: 1.3,

  // Conditioning
  FATIGUE_MAX: 100,
  FATIGUE_NATURAL_RECOVERY: 8,
  FATIGUE_REST_RECOVERY: 20,

  // Injury mechanics
  INJURY_BASE_RATE: 0.002,
  INJURY_DURATION: {
    minor: { min: 3, max: 7 },
    moderate: { min: 14, max: 30 },
    severe: { min: 30, max: 90 },
  },

  // Practice multipliers
  CAMP_MULTIPLIER: 1.5,
  MATCH_GROWTH_MULTIPLIER: 2.0,
};
```

**Key Tuning Points:**
- Growth variance: affects consistency (lower = more predictable)
- Camp multiplier: X1.5 during training camps
- Match growth: X2.0 bonus for competitive growth

---

### 2. **src/engine/world/scout/scout-system.ts** — Scout Management

**Main Functions:**

#### `computeMiddleSchoolOverall(ms: MiddleSchoolPlayer): number`
- Scales 0–50 middle school stats to 0–100 overall rating
- Formula: `(baseAvg * 0.5 + batAvg * 0.5) * 2`
- Base stats: stamina, speed, armStrength, fielding, focus, mental (avg)
- Batting stats: contact, power, eye, technique (avg)

#### `searchMiddleSchoolers(pool, filters): MiddleSchoolPlayer[]`
- Filters by: grade, prefecture, minReputation, qualityTier
- Returns list of matching candidates

#### `conductScoutVisit(world, playerId, rng): { world, scoutReport }`
- Costs 1 monthly scout action
- Adds error to observations based on confidence level
- Confidence increases with repeated visits (max 0.95)
- Generates `ScoutReport` with:
  - `observedStats`: noisy ability values
  - `confidence`: 0.0–0.95
  - `estimatedQuality`: 'S'|'A'|'B'|'C'|'D'
  - `scoutComment`: descriptive text

#### `recruitPlayer(world, playerId, rng): { world, success, reason }`
- Attempts to recruit a middle schooler
- Success factors:
  1. **School reputation** (weight: 30%) — high rep = better chance
  2. **Scout status** (weight: 25%) — already scouted = +bonus
  3. **Local preference** (weight: 20%) — same prefecture = easier
  4. **Prestige factor** (weight: 15%) — S/A players prefer famous schools
  5. **Compatibility** (weight: 10%) — coach style matching

- Success probability: 5%–95% (clamped)
- Returns reason string explaining result

#### `runAISchoolScouting(world, rng): WorldState`
- Each AI school scouts 1–5 players based on reputation
- Prioritizes highest-rated available grade-3 players
- Adds to `scoutedBy` and locks in `targetSchoolId` if successful

**Key Data Structures:**

```typescript
interface MiddleSchoolPlayer {
  id: string;
  firstName: string;
  lastName: string;
  middleSchoolGrade: 1 | 2 | 3;
  middleSchoolName: string;
  prefecture: string;
  currentStats: PlayerStats;
  targetSchoolId: string | null;    // High school commitment
  scoutedBy: string[];              // List of recruiting schools
}

interface ScoutReport {
  playerId: string;
  observedStats: Partial<PlayerStats>;
  confidence: number;  // 0–1
  scoutComment: string;
  estimatedQuality: 'S' | 'A' | 'B' | 'C' | 'D';
}

interface ScoutState {
  watchList: string[];
  scoutReports: Map<string, ScoutReport>;
  monthlyScoutBudget: number;
  usedScoutThisMonth: number;
  recruitAttempts: Map<string, RecruitResult>;
}
```

---

### 3. **src/engine/world/year-transition.ts** — Annual Process

**Processing Steps (3/31 → 4/1):**

1. **Step 0**: Snapshot save (logging only)
2. **Step 0.5**: AI school scouting
3. **Step 0.8**: Draft execution
4. **Step 1–2**: Graduation of 3rd years
5. **Step 3**: Enrollment of middle school 3rd graders to high schools
6. **Step 4**: Grade promotion for remaining middle schoolers + generation of 180 new grade-1 students
7. **Step 5**: Lineup regeneration for all schools
8. **Step 6**: Reputation update (based on tournament results)
9. **Step 7**: Season state reset
10. **Step 8**: Simulation tier update

**Enrollment Algorithm:**

Uses **5-factor scoring** for middle schooler → high school assignment:

```typescript
function calculateEnrollmentScore(ms, school, rng): number {
  let score = 0;
  
  // 1. School reputation (30%)
  score += (school.reputation * playerOverall / 50) * 0.30;
  
  // 2. Scout status (25%)
  if (ms.targetSchoolId === school.id) score += 200;  // Locked in
  else if (ms.scoutedBy.includes(school.id)) score += 100 * 0.25;
  
  // 3. Local preference (20%)
  if (ms.prefecture === school.prefecture) score += 80 * 0.20;
  
  // 4. Prestige bias (15%)
  if (school.reputation > 70 && playerOverall > 30) score += 60 * 0.15;
  
  // 5. Coach compatibility (10%)
  score += calculateCoachCompatibility(ms, school) * 0.10;
  
  // Random factor (±10)
  score += (rng.next() - 0.5) * 20;
  
  return Math.max(0, score);
}
```

**Reputation Update Logic:**

```
- Summer tournament best round ≥ 4: +3 rep
- Summer tournament best round ≥ 3: +1 rep
- Autumn tournament best round ≥ 3: +1 rep
- Koshien appearance: +5 rep
- Koshien best round ≥ 2: +3 rep
- Pro players drafted: +2 rep per player
- Random variance: ±2
- Final range: 1–100 (clamped)
```

---

### 4. **src/engine/world/career/draft-system.ts** — Pro Draft System

**Main Functions:**

#### `computePlayerOverall(player: Player): number`
- Same scaling as middle school: `(baseAvg * 0.5 + batAvg * 0.5)`
- 0–100 scale

#### `identifyDraftCandidates(world, currentYear): DraftCandidate[]`
- Finds all 3rd-year players with overall ≥ 40 (C tier minimum)
- Returns sorted by overall rating (descending)

```typescript
interface DraftCandidate {
  playerId: string;
  playerName: string;
  schoolId: string;
  schoolName: string;
  position: string;
  overallRating: number;
  scoutRating: 'S' | 'A' | 'B' | 'C' | 'D';
  highlights: string[];
}
```

#### `executeDraft(world, currentYear, rng): { world, results }`
- Only S/A tiers (overall ≥ 55) are eligible for pro draft
- 12 pro teams pick 1–3 players each
- Picks determined by weighted probability (top players more likely)
- **Negotiation success rates:**
  - S tier: 95%
  - A tier: 80%

```typescript
interface DraftResult {
  playerId: string;
  picked: boolean;
  team: string | null;
  round: number | null;
  negotiationSuccess: boolean;
}
```

#### `determineCareerPath(player, school, draftResult?, rng): CareerPath`

**Priority System:**

1. **Pro entry** (if picked & negotiation successful)
   - Type: `{ type: 'pro', team: string, pickRound: number }`

2. **University** (high achievement + mental stat)
   - Probability increases with:
     - overall ≥ 65: 85% (draft picked but negotiation failed)
     - overall ≥ 55 + mental ≥ 50: 60%
     - overall ≥ 40 + mental ≥ 60: 40%
     - mental ≥ 55: 25%
   - Type: `{ type: 'university', school: string, hasScholarship: boolean }`

3. **Corporate baseball** (middle-tier talent)
   - Probability: overall ≥ 45 → 50%, overall ≥ 30 → 35%
   - Type: `{ type: 'corporate', company: string }`

4. **Retirement** (default fallback)
   - Type: `{ type: 'retire' }`

**List of Pro Teams (12):** Yomiuri Giants, Hanshin Tigers, Yokohama DeNA Baystars, Hiroshima Carp, Chunichi Dragons, Tokyo Yakult Swallows, Hokkaido Nippon Ham Fighters, Orix Buffaloes, Fukuoka Softbank Hawks, Tohoku Rakuten Golden Eagles, Chiba Lotte Marines, Saitama Seibu Lions

**Universities (12):** Keio, Waseda, Meiji, Hosei, Aoyama Gakuin, Ritsumeikan, Doshisha, Kansai, Tokaи, Asia, International Budo, Japan Sports Science

**Corporate Teams (12):** Toyota, Nippon Life, Mitsubishi Heavy Industries, JR East, Honda, Panasonic, NTT East, Hitachi, ENEOS, Toshiba, JFE East, Mitsubishi Hitachi Power Systems

---

### 5. **src/engine/match/constants.ts** — Match Tuning

```typescript
export const MATCH_CONSTANTS = {
  // Pitching
  FASTBALL_BASE_RATIO: 0.40,       // 40% of pitches are fastballs
  STRIKE_ZONE_TARGET_BASE: 0.745,  // Base strike zone accuracy
  CONTROL_ERROR_SCALE: 2.0,         // Control error multiplier

  // Batting
  BASE_CONTACT_RATE: 0.85,          // Contact rate on swings
  BREAK_CONTACT_PENALTY: 0.03,      // Penalty for breaking balls
  VELOCITY_CONTACT_PENALTY: 0.0015, // Penalty per velocity point
  FAIR_RATE: 0.54,                  // Fair ball rate
  TECHNIQUE_FAIR_BONUS: 0.15,       // Bonus from technique

  // Batted ball
  HOME_RUN_DISTANCE: 90,    // HR threshold (meters)
  FLY_MAX_DISTANCE: 130,    // Max fly ball distance

  // Fielding
  FLY_CATCH_BASE: 0.85,     // Fly ball out rate
  GROUND_OUT_BASE: 0.60,    // Ground ball out rate
  DOUBLE_PLAY_BASE: 0.25,   // Double play rate
  ERROR_POPUP_RATE: 0.03,   // Popup error rate

  // Stamina
  STAMINA_PER_PITCH_BASE: 1.0,
  STAMINA_VELOCITY_LOW: 0.85,  // Stamina drain multiplier if low velocity
  STAMINA_BREAK_LOW: 0.70,     // Stamina drain if low break

  // Confidence (in-game)
  CONFIDENCE_HIT_GAIN: 10,
  CONFIDENCE_HR_GAIN: 20,
  CONFIDENCE_WALK_GAIN: 5,
  CONFIDENCE_STRIKEOUT_LOSS: -8,
  CONFIDENCE_POPUP_LOSS: -3,
  CONFIDENCE_DP_LOSS: -10,
  CONFIDENCE_CLUTCH_FAIL_LOSS: -12,

  // Pressure
  PRESSURE_SCORING_POS: 20,     // RISP (runners in scoring position)
  PRESSURE_CLOSE_GAME: 15,      // Close game
  PRESSURE_LATE_INNING: 10,     // 7th+ inning
  PRESSURE_NINTH: 20,           // 9th inning
  PRESSURE_KOSHIEN: 15,         // Koshien tournament
  PRESSURE_BASES_LOADED: 10,    // Bases loaded

  // Settings
  DEFAULT_INNINGS: 9,
  DEFAULT_MAX_EXTRAS: 3,
  MOUND_VISIT_LIMIT: 3,
  MOUND_VISIT_CONFIDENCE_GAIN: 15,

  // HBP
  HIT_BY_PITCH_BASE_RATE: 0.008,
};
```

**Tuning Notes:**
- Contact penalties are small (0.03–0.0015) for realistic difficulty
- HR distance lowered from 100 to 90 to increase home runs
- Double play base lowered from 0.30 to 0.25
- Error rate reduced from 0.05 to 0.03

---

### 6. **src/engine/world/world-ticker.ts** — Daily World Progression

**Main Function: `advanceWorldDay(world, playerMenuId, rng): { nextWorld, result }`**

Processes one calendar day for all schools in the world.

**WorldDayResult Structure:**

```typescript
interface WorldDayResult {
  date: GameDate;
  playerSchoolResult: DayResult;      // Self school daily result
  playerMatchResult?: MatchResult | null;  // Match result if game day
  playerMatchOpponent?: string | null;
  playerMatchSide?: 'home' | 'away' | null;
  worldNews: WorldNewsItem[];          // Generated news
  seasonTransition: SeasonPhase | null;
}

interface WorldNewsItem {
  type: 'tournament_result' | 'upset' | 'no_hitter' | 'record' | 'draft' | 'injury';
  headline: string;
  involvedSchoolIds: string[];
  involvedPlayerIds: string[];
  importance: 'high' | 'medium' | 'low';
}
```

**Processing Pipeline:**

1. **Determine day type** (practice, tournament, off, etc.)
2. **Calculate season multiplier** (1.5 during camps, 1.0 normal)
3. **For each school** (based on SimulationTier):
   - **Tier 1 (full)**: Full `processDay()` with all mechanics
   - **Tier 2 (standard)**: Batch growth calculation
   - **Tier 3 (minimal)**: Weekly bulk growth (Sundays only)
4. **Middle school growth** (Sundays only)
5. **Generate daily news** (tournaments, upsets, prospects, draft)
6. **Advance calendar date**
7. **Check for year transition** (4/1 → activate processYearTransition)

**Day of Week Calculation:**
- Year 1, April 1 = Monday (day 1)
- Used for weekly batches and fixtures

**SimulationTier Concept:**
- **full**: Self school (detailed physics)
- **standard**: Regional rivals (batch growth)
- **minimal**: Distant schools (bulk weekly growth)

---

### 7. **src/ui/projectors/resultsProjector.ts** — Results Display

**Main Function: `projectResults(worldState, recentDayResults): ResultsViewState`**

Transforms match data into displayable format.

**Key Transformations:**

#### `buildFlowAndHighlights(innings, getPlayerName, playerSide)`
- Builds at-bat flow (sequence of plays)
- Extracts highlights (home runs, strikeouts, double plays)
- Tracks running score

#### `buildInningScoreView(matchResult): InningScoreView`
- Creates inning-by-inning scoreboard
- Separates home/away scores

#### `buildPitcherSummary(matchResult, getPlayerName): PitcherSummaryView`
- Extracts pitcher stats (pitch count, strikeouts, ERA, innings)

**Output Type:**

```typescript
interface ResultsViewState {
  recentResults: ScoreboardView[];
  seasonRecord: { wins: number; losses: number; draws: number };
}

interface ScoreboardView {
  date: DateView;
  homeSchool: string;
  awaySchool: string;
  homeScore: number;
  awayScore: number;
  innings: number;
  isPlayerSchool: boolean;
  result: '勝利' | '敗北' | '引き分け';  // Win/Loss/Draw
  inningScores: InningScoreView;
  highlights?: MatchHighlightView[];
  pitcherSummary?: PitcherSummaryView;
  atBatFlow?: AtBatFlowItem[];
}
```

---

### 8. **src/engine/world/news/news-generator.ts** — Daily News

**Main Function: `generateDailyNews(world, rng): WorldNewsItem[]`**

Generates contextual news based on world state.

**News Types:**

1. **Prospect News** (2–3 times/month)
   - S/A-tier middle school 3rd graders
   - "【超高校級】 [Player] に熱視線"

2. **OB Activity News** (weekly)
   - Professional/university achievements
   - "【OB情報】 [School] OB・[Player] ([Team]) [Achievement]"

3. **Seasonal Milestones** (fixed dates)
   - 4/1: New year start
   - 7/1: Summer tournament
   - 8/6: Koshien opening
   - 9/1: Autumn tournament
   - 10/20: Pro draft

4. **Upset News** (8% chance during tournaments)
   - When reputation gap ≥ 20 and weaker school wins
   - Importance scales with reputation difference

---

### 9. **src/engine/types/index.ts** — Type Exports

Exports game type definitions from:
- `calendar.ts`: GameDate, DayType, PracticeMenuId
- `player.ts`: Player, PlayerStats, Position, etc.
- `team.ts`: Team, Lineup, FacilityLevel
- `game-state.ts`: GameState, SaveSlotMeta

---

## Type Definitions

### GameDate Structure
```typescript
interface GameDate {
  year: number;
  month: number; // 1–12
  day: number;   // 1–31
}
```

### Player Stats Hierarchy
```typescript
interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;  // 'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'
  hand: 'right' | 'left';
  battingSide: 'right' | 'left' | 'switch';
  enrollmentYear: number;
  stats: PlayerStats;
  condition: ConditionState;
  mood: Mood;
  // ...more fields
}

interface PlayerStats {
  base: {
    stamina: number;
    speed: number;
    armStrength: number;
    fielding: number;
    focus: number;
    mental: number;
  };
  batting: {
    contact: number;
    power: number;
    eye: number;
    technique: number;
  };
  pitching: {
    velocity: number;
    control: number;
    stamina: number;
    // up to 7 pitch types
  } | null;
}
```

### Match Result Types
```typescript
interface MatchResult {
  winner: 'home' | 'away' | 'draw';
  finalScore: { home: number; away: number };
  inningScores: { home: number[]; away: number[] };
  totalInnings: number;
  mvpPlayerId: string | null;
  batterStats: MatchBatterStat[];
  pitcherStats: MatchPitcherStat[];
}

interface InningResult {
  inningNumber: number;
  half: 'top' | 'bottom';
  atBats: AtBatResult[];
  runsScored: number;
  outsRecorded: number;
  endingBaseState: BaseState;
}

interface AtBatResult {
  batterId: string;
  pitcherId: string;
  pitches: PitchResult[];
  finalCount: Count;
  outcome: AtBatOutcome;
  rbiCount: number;
  runnersBefore: BaseState;
  runnersAfter: BaseState;
}

type AtBatOutcome =
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
```

### WorldState Types
```typescript
interface WorldState {
  version: number;
  seed: string;
  currentDate: GameDate;
  playerSchoolId: string;
  schools: HighSchool[];           // All high schools
  middleSchoolPool: MiddleSchoolPlayer[];  // All 7th-9th graders
  manager: Manager;
  season State: SeasonState;
  scoutState: ScoutState;
  personRegistry: PersonRegistry;  // Graduate tracking
  settings: GameSettings;
}

interface HighSchool {
  // Team-compatible fields
  id: string;
  name: string;
  prefecture: string;
  reputation: number;
  players: Player[];
  lineup: Lineup | null;
  facilities: FacilityLevel;
  
  // World-specific
  simulationTier: 'full' | 'standard' | 'minimal';
  coachStyle: CoachStyle;
  yearResults: YearResults;
  _summary: TeamSummary | null;  // Cache
}

interface MiddleSchoolPlayer {
  id: string;
  firstName: string;
  lastName: string;
  middleSchoolGrade: 1 | 2 | 3;
  middleSchoolName: string;
  prefecture: string;
  currentStats: PlayerStats;
  targetSchoolId: string | null;
  scoutedBy: string[];
}
```

---

## Stores (Zustand)

### **game-store.ts** — Single School (Phase 1/2)
- Manages `GameState` (team-focused)
- Methods: `newGame()`, `loadGame()`, `saveGame()`, `advanceDay()`, `setLineup()`
- License checking integrated

### **world-store.ts** — Multi-School World (Phase 3+)
- Manages `WorldState` (world simulation)
- Methods: `newWorldGame()`, `advanceDay()`, `advanceWeek()`
- Projectors for UI views: `getHomeView()`, `getTeamView()`, `getScoutView()`, etc.
- Scout actions: `scoutVisit()`, `recruitPlayerAction()`, `addToWatch()`, `removeFromWatch()`

---

## Testing Patterns

Tests use **Vitest** with these conventions:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createRNG } from '@/engine/core/rng';

describe('Feature Name', () => {
  let rng: RNG;
  let testData: SomeType;

  beforeEach(() => {
    rng = createRNG('test-seed');
    testData = createTestFixture(rng);
  });

  it('should do X when Y', () => {
    const result = functionUnderTest(testData, rng);
    expect(result).toEqual(expectedValue);
  });
});
```

**Key Test Files:**
- `tests/engine/world/year-transition.test.ts` — Year transition logic
- `tests/engine/world/draft-system.test.ts` — Draft mechanics
- `tests/engine/world/scout-system.test.ts` — Scout operations
- `tests/engine/growth/growth.test.ts` — Growth calculations
- `tests/engine/world/integration.test.ts` — Full world flow
- `tests/ui/projectors/*.test.ts` — ViewState generation

---

## Architecture Patterns

### 1. **Immutable State Management**
- All state mutations return new objects (spread operators)
- No direct mutations; preserves history

### 2. **RNG Seeding**
- Deterministic using seeded RNG (seedrandom)
- Child RNGs derived from parent: `rng.derive('namespace')`
- Ensures reproducibility for saves/replays

### 3. **Projector Pattern**
- `engine/` = pure simulation (no UI)
- `ui/projectors/` = transform game state → view state
- Separation of concerns (logic vs. presentation)

### 4. **Tier System**
- Schools have `SimulationTier`: full/standard/minimal
- Reduces computation: full detail for player school, simplified for others
- Adjusts growth calculation complexity

### 5. **Year Transition Transactions**
- Multi-step atomic operations
- Executes in specific order (draft → graduation → enrollment)
- Maintains consistency across all schools

### 6. **Career Path System**
- Players progress through: Middle School → High School → Pro/University/Corporate/Retired
- Each stage tracked separately in `PersonRegistry`
- Supports narrative (OB news, legacy tracking)

---

## Data Flow

### Single Day Simulation

```
advanceWorldDay()
  ├─ getDayType() → practice/tournament/off
  ├─ For each school (by tier):
  │  ├─ Full: processDay() → detailed physics
  │  ├─ Standard: applyBatchGrowth() → daily batch
  │  └─ Minimal: (Sunday only) applyBulkGrowth()
  ├─ advanceMiddleSchool() → growth on Sundays
  ├─ generateDailyNews() → create news items
  ├─ advanceDate() → next day
  ├─ Check: if 4/1 → processYearTransition()
  └─ Return: WorldDayResult
```

### Year Transition

```
processYearTransition()
  ├─ Step 0.5: runAISchoolScouting()
  ├─ Step 0.8: executeDraft() → determine pro paths
  ├─ Step 1/2: graduateSeniors() → remove & record in PersonRegistry
  ├─ Step 3: assignMiddleSchoolersToHighSchools() → 5-factor scoring
  ├─ Step 4: Promote middle schoolers, generate 180 new grade-1s
  ├─ Step 5: autoGenerateLineup() for all schools
  ├─ Step 6: updateReputation() based on tournament performance
  ├─ Step 7: Reset season state
  ├─ Step 8: updateSimulationTiers()
  └─ Return: updated WorldState
```

### Scout Workflow

```
1. searchMiddleSchoolers(filters) → find candidates
2. addToWatchList(playerId) → track prospect
3. conductScoutVisit(playerId) → spending 1 action, get noisy stats
4. recruitPlayer(playerId) → attempt enrollment, 5-factor probability
5. (AI schools run simultaneously via runAISchoolScouting)
```

---

## Key Formulas & Mechanics

### Overall Rating Calculation
```
baseAvg = (stamina + speed + armStrength + fielding + focus + mental) / 6
batAvg = (contact + power + eye + technique) / 4
overall = baseAvg * 0.5 + batAvg * 0.5

For middle school (0–50 scale → 0–100):
overall *= 2
```

### Enrollment Probability (Softmax)
```
For each school:
  score = reputation + scout bonus + local bonus + prestige + coach fit + noise
  probability ∝ max(0.1, score)

Softmax select among available schools (respecting capacity limits)
```

### Reputation Update
```
delta = 0
delta += (summer best ≥ 4) ? 3 : (≥ 3) ? 1 : 0
delta += (autumn best ≥ 3) ? 1 : 0
delta += koshien ? 5 : 0
delta += koshien best ≥ 2 ? 3 : 0
delta += pro drafted count * 2
delta += rng(-2, 2)
reputation = clamp(reputation + delta, 1, 100)
```

### Contact Rate (Batting)
```
baseContact = 0.85
contact -= 0.03  (for breaking balls)
contact -= 0.0015 * pitcherVelocity  (for high velocity)
contact += 0.15 * (batter technique / 100)  (technique bonus)
```

---

## Performance Considerations

1. **Tier System**: Prevents bottlenecks by reducing detail for non-player schools
2. **Bulk Growth**: Weekly batching instead of daily for minimal tier
3. **Caching**: `HighSchool._summary` caches team strength calculations
4. **RNG Derivation**: Avoids redundant state in RNG system
5. **IndexedDB**: Async storage with in-memory fallback

---

## Next Steps for Extension

1. **Tournament Simulation**: Full bracket logic with league standings
2. **Player Scouting Depth**: Position-specific evaluations
3. **Advanced Tactics**: Real-time managerial AI during matches
4. **OB Career Tracking**: Detailed progression for graduates
5. **UI Polish**: Animated results, live match feed
6. **Difficulty Settings**: Tune GROWTH_CONSTANTS & MATCH_CONSTANTS
7. **Replay System**: Save/load matches using deterministic RNG

---

**Last Updated**: April 16, 2026
**Version**: 0.1.0 (MVP Ready)
