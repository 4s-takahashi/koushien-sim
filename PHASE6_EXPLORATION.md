# Koushien-Sim Phase 6 Implementation Exploration Report
## Comprehensive Codebase Analysis — 2026-04-16

---

## Executive Summary

The koushien-sim project is a high school baseball simulation built with **Next.js 16.2.3**, **React 19.2.4**, **TypeScript**, **Zustand 5.0.12**, and **Vitest**. 

**Current Status (Phase 5 Complete):**
- ✅ 446 tests passing
- ✅ Core engine: world simulation, player growth, match system, scout/draft
- ✅ UI: 7 main pages (home, team, player details, scout, tournament, results, OB)
- ✅ Save/load system: exists but needs WorldState support
- ⚠️ **Phase 6 Scope**: Save/load enhancement, tournament UI, match display, deploy prep

---

## Part 1: Overall Directory Structure

### Root Level
```
koushien-sim/
├── src/                          # Main source code
├── tests/                        # Vitest test suites (446 tests)
├── scripts/                      # Utility scripts (playtest, etc.)
├── node_modules/                 # Dependencies (Next 16.2.3)
├── .next/                        # Next.js build output
├── package.json                  # 5 deps, 5 dev deps
├── tsconfig.json                 # TypeScript config
├── vitest.config.ts             # Test runner config
├── next.config.ts               # Next.js config (minimal)
├── DESIGN-PHASE*.md             # Architecture documentation
├── PHASE5_REPORT.md             # Phase 5 completion report
├── CODEBASE_GUIDE.md            # Comprehensive analysis (30KB+)
└── QUICK_REFERENCE.md           # Quick implementation guide
```

### Src/ Directory Tree
```
src/
├── app/                         # Next.js App Router pages
│   ├── page.tsx                 # Home page (main menu)
│   ├── layout.tsx               # Root layout
│   ├── globals.css              # Global styles
│   ├── page.module.css          # Home page styles
│   ├── layout.module.css        # Layout styles
│   ├── scout/page.tsx           # Scout management
│   ├── team/page.tsx            # Team roster view
│   ├── team/[playerId]/page.tsx # Player detail view
│   ├── results/page.tsx         # Match results
│   ├── tournament/page.tsx      # Tournament view
│   └── ob/page.tsx              # Graduate (OB) view
│
├── engine/                      # Core simulation engine (~1,200 LOC)
│   ├── core/
│   │   ├── rng.ts              # Seeded RNG (seedrandom wrapper)
│   │   └── id.ts               # ID generation
│   │
│   ├── types/
│   │   ├── index.ts
│   │   ├── player.ts           # Player, Position, Mood, PlayerStats
│   │   ├── team.ts             # Team, Lineup, Manager, FacilityLevel
│   │   ├── game-state.ts       # GameState, SaveSlotMeta
│   │   ├── calendar.ts         # GameDate, PracticeMenuId, DayType, DayResult
│   │   └── shared.ts           # Shared types
│   │
│   ├── player/
│   │   ├── generate.ts         # generatePlayer()
│   │   └── name-dict.ts        # Japanese name generation data
│   │
│   ├── growth/                 # Stat growth (daily/batch/bulk)
│   │   ├── constants.ts        # GROWTH_CONSTANTS
│   │   ├── calculate.ts        # calculateStatGainV3()
│   │   ├── practice.ts         # Practice-specific growth
│   │   ├── condition.ts        # Fatigue, injury, mood
│   │   ├── batch-growth.ts     # applyBatchGrowth() — daily growth
│   │   └── bulk-growth.ts      # applyBulkGrowth() — weekly growth
│   │
│   ├── match/                  # Match simulation engine
│   │   ├── types.ts            # MatchResult, InningResult, AtBatResult
│   │   ├── constants.ts        # MATCH_CONSTANTS
│   │   ├── game.ts             # runGame() — full simulation
│   │   ├── quick-game.ts       # quickGame() — fast sim (Tier 2)
│   │   ├── stat-game.ts        # statGame() — stats-only (Tier 3)
│   │   ├── inning.ts           # Inning processing
│   │   ├── at-bat.ts           # At-bat simulation
│   │   ├── result.ts           # MatchResult assembly
│   │   ├── tactics.ts          # AutoTacticsProvider
│   │   └── pitch/
│   │       ├── select-pitch.ts
│   │       ├── process-pitch.ts
│   │       ├── bat-contact.ts
│   │       ├── swing-result.ts
│   │       ├── batter-action.ts
│   │       ├── control-error.ts
│   │       └── field-result.ts
│   │
│   ├── team/
│   │   ├── lineup.ts           # autoGenerateLineup()
│   │   ├── roster.ts           # Roster operations
│   │   └── enrollment.ts       # High school enrollment
│   │
│   ├── calendar/
│   │   ├── game-calendar.ts    # GameDate, getDayType()
│   │   ├── schedule.ts         # Tournament schedule
│   │   ├── day-processor.ts    # processDay() [Phase 1/2 compat]
│   │   └── index.ts
│   │
│   ├── world/                  # Phase 3+ multi-school world
│   │   ├── world-state.ts      # WorldState, HighSchool, MiddleSchoolPlayer
│   │   ├── world-ticker.ts     # advanceWorldDay() (daily tick)
│   │   ├── year-transition.ts  # Annual transition (9 steps)
│   │   ├── create-world.ts     # createWorldState()
│   │   ├── tier-manager.ts     # SimulationTier management
│   │   ├── hydrate.ts          # hydratePlayer(), convertToHighSchoolPlayer()
│   │   ├── person-state.ts     # PersonRegistry, PersonState types
│   │   ├── person-blueprint.ts # PersonBlueprint, SchoolBlueprint, CoachStyle
│   │   ├── growth-curve.ts     # StatGrowthCurve, growth modeling
│   │   ├── school-generator.ts # generateAISchools()
│   │   │
│   │   ├── scout/
│   │   │   └── scout-system.ts # Scout operations
│   │   │
│   │   ├── career/
│   │   │   └── draft-system.ts # Draft mechanics
│   │   │
│   │   └── news/
│   │       ├── news-generator.ts # generateDailyNews()
│   │       └── news-types.ts
│   │
│   ├── save/
│   │   ├── save-manager.ts     # SaveManager (GameState only currently)
│   │   └── serializer.ts       # serialize/deserialize
│   │
│   ├── shared/
│   │   └── stat-utils.ts       # computeOverall(), etc.
│   │
│   └── index.ts
│
├── stores/                      # Zustand state management
│   ├── game-store.ts           # useGameStore (Phase 1/2 GameState)
│   └── world-store.ts          # useWorldStore (Phase 3+ WorldState)
│
├── ui/
│   └── projectors/             # ViewState generators (pure functions)
│       ├── view-state-types.ts # All ViewState interfaces
│       ├── homeProjector.ts    # Home page ViewState
│       ├── teamProjector.ts    # Team page ViewState
│       ├── playerProjector.ts  # Player detail ViewState
│       ├── scoutProjector.ts   # Scout management ViewState
│       ├── tournamentProjector.ts # Tournament ViewState
│       ├── resultsProjector.ts # Results page ViewState
│       └── obProjector.ts      # OB tracking ViewState
│
└── platform/
    ├── storage/
    │   ├── adapter.ts          # StorageAdapter interface
    │   ├── indexeddb.ts        # IndexedDB implementation
    │   └── memory.ts           # In-memory implementation
    ├── license/
    │   ├── manager.ts
    │   ├── types.ts
    │   └── index.ts
    └── index.ts
```

---

## Part 2: Key Engine Files — Type Signatures & Functions

### 2.1 **src/engine/match/types.ts** — Match Result Types

**Key Types:**
```typescript
// Pitch-level
interface PitchLocation { row: 0-4; col: 0-4; }
interface PitchSelection { type: 'fastball' | PitchType; velocity: number; breakLevel?: 1-7; }
interface PitchOutcome = 'called_strike' | 'swinging_strike' | 'ball' | 'foul' | 'in_play'
interface PitchResult { pitchSelection; targetLocation; actualLocation; batterAction; outcome; batContact: BatContactResult | null; }

// At-bat level
interface Count { balls: 0-3; strikes: 0-2; }
interface AtBatOutcome = { type: 'strikeout' | 'ground_out' | 'home_run' | ... }
interface AtBatResult { batterId; pitcherId; pitches: PitchResult[]; finalCount; outcome; rbiCount; }

// Inning level
interface InningResult {
  inningNumber: number;
  half: 'top' | 'bottom';
  atBats: AtBatResult[];
  runsScored: number;
  outsRecorded: number;
  endingBaseState: BaseState;
}

// Game level
interface MatchResult {
  winner: 'home' | 'away' | 'draw';
  finalScore: { home: number; away: number };
  inningScores: { home: number[]; away: number[] };
  totalInnings: number;
  mvpPlayerId: string | null;
  batterStats: MatchBatterStat[];
  pitcherStats: MatchPitcherStat[];
}

interface MatchState {
  config: MatchConfig;
  homeTeam: MatchTeam;
  awayTeam: MatchTeam;
  currentInning: number;
  currentHalf: HalfInning;
  score: { home: number; away: number };
  inningScores: { home: number[]; away: number[] };
  // ... more fields
}
```

**Status**: Complete, but Phase 6 needs InningResult[] storage in results display.

---

### 2.2 **src/engine/world/world-ticker.ts** — Daily World Advancement

**Main Function:**
```typescript
function advanceWorldDay(
  world: WorldState,
  menuId: PracticeMenuId,
  rng: RNG
): { nextWorld: WorldState; result: WorldDayResult }
```

**Internal Functions (Tier-based):**
```typescript
// Tier 1: Full simulation (player school only)
function advanceSchoolFull(
  school: HighSchool,
  menuId: PracticeMenuId,
  worldState: WorldState,
  rng: RNG
): { school: HighSchool; dayResult: DayResult }

// Tier 2: Batch growth (3-5 rivals)
function advanceSchoolStandard(
  school: HighSchool,
  dayType: DayType,
  seasonMultiplier: number,
  currentYear: number,
  rng: RNG
): HighSchool

// Tier 3: Minimal growth (42 other schools)
function advanceSchoolMinimal(
  school: HighSchool,
  dayType: DayType,
  dayOfWeek: number,
  seasonMultiplier: number,
  currentYear: number,
  rng: RNG
): HighSchool

// Middle school pool
function advanceMiddleSchool(
  pool: MiddleSchoolPlayer[],
  dayOfWeek: number,
  // ...
): MiddleSchoolPlayer[]
```

**WorldDayResult:**
```typescript
interface WorldDayResult {
  date: GameDate;
  playerSchoolResult: DayResult;
  playerMatchResult?: MatchResult | null;
  playerMatchOpponent?: string | null;
  playerMatchSide?: 'home' | 'away' | null;
  worldNews: WorldNewsItem[];
  seasonTransition: SeasonPhase | null;
}
```

**Status**: Functional. Phase 6 needs MatchResult.inningResults storage.

---

### 2.3 **src/engine/world/world-state.ts** — WorldState Type Definition

**Core Type:**
```typescript
interface WorldState {
  version: string;
  seed: string;
  currentDate: GameDate;
  
  // Player info
  playerSchoolId: string;
  manager: Manager;
  settings: GameSettings;
  weeklyPlan: WeeklyPlan;
  
  // World
  prefecture: string;
  schools: HighSchool[];              // 48 total
  middleSchoolPool: MiddleSchoolPlayer[];
  personRegistry: PersonRegistry;      // Career tracking
  
  seasonState: SeasonState;
  scoutState: ScoutState;
}

interface HighSchool {
  // Team compatible
  id: string;
  name: string;
  prefecture: string;
  reputation: number;
  players: Player[];
  lineup: Lineup | null;
  facilities: FacilityLevel;
  
  // HighSchool specific
  simulationTier: 'full' | 'standard' | 'minimal';
  coachStyle: CoachStyle;
  yearResults: YearResults;
  _summary: TeamSummary | null;      // Cache
}

interface MiddleSchoolPlayer {
  id: string;
  firstName: string;
  lastName: string;
  middleSchoolGrade: 1 | 2 | 3;
  middleSchoolName: string;
  prefecture: string;
  currentStats: PlayerStats;
  targetSchoolId: string | null;     // High school commitment
  scoutedBy: string[];               // Recruiting schools
}
```

**Status**: Complete. Already supports MatchResult in WorldDayResult.

---

### 2.4 **src/engine/world/person-state.ts** — Career Path Tracking

```typescript
type PersonStage = 
  | { stage: 'middle_school'; grade: 1 | 2 | 3 }
  | { stage: 'high_school'; grade: 1 | 2 | 3 }
  | { stage: 'graduate'; careerPath: CareerPath }
  | { stage: 'ob'; careerPath: CareerPath };

type CareerPath =
  | { type: 'pro'; team: string; pickRound?: number }
  | { type: 'university'; schoolName?: string }
  | { type: 'corporate'; companyName?: string }
  | { type: 'retired' };

interface PersonRegistry {
  entries: Map<string, PersonRegistryEntry>;
}

interface PersonRegistryEntry {
  personId: string;
  retention: 'full' | 'tracked' | 'archived' | 'forgotten';
  stage: PersonStage;
  state?: PersonState;  // If retention='full'
  graduateSummary?: {
    schoolName: string;
    careerPath: CareerPath;
    finalOverall: number;
    achievements: string[];
  };
}
```

**Status**: Complete. Tracks all players throughout their career.

---

## Part 3: Save/Load System

### Current Status

**File**: `src/engine/save/save-manager.ts`

```typescript
export const CURRENT_SAVE_VERSION = '1.0.0';

interface SaveManager {
  saveGame(slotId: string, state: GameState): Promise<void>;
  loadGame(slotId: string): Promise<GameState | null>;
  deleteSave(slotId: string): Promise<void>;
  listSaves(): Promise<SaveSlotMeta[]>;
  exportSave(slotId: string): Promise<string>;    // Base64 export
  importSave(slotId: string, encoded: string): Promise<void>;
  autoSave(state: GameState): Promise<void>;
}
```

**Problem**: Currently only supports `GameState` (Phase 1/2), not `WorldState` (Phase 3+).

**Serialization**: 
- `serialize(state: GameState): string`
- `deserialize(json: string): GameState`
- `computeChecksum(json: string): Promise<string>`
- `validateSaveData(obj: unknown): boolean`

**Storage Backends**:
- `IndexedDBAdapter`: Production storage
- `MemoryAdapter`: Testing/development

### Phase 6 Requirements
1. Extend SaveManager to support `WorldState`
2. Version migration logic (1.0.0 → 2.0.0)
3. WorldState serialization strategy
4. UI for save/load slots
5. Auto-save integration with world-store

---

## Part 4: State Management — Zustand Stores

### 4.1 useWorldStore (`src/stores/world-store.ts`)

**Interface:**
```typescript
interface WorldStore {
  worldState: WorldState | null;
  isLoading: boolean;
  lastDayResult: WorldDayResult | null;
  recentResults: WorldDayResult[];        // Max 30, latest first
  recentNews: WorldDayResult['worldNews']; // Max 20, latest first
  
  // Actions
  newWorldGame(config: NewWorldConfig): void;
  advanceDay(menuId?: PracticeMenuId): WorldDayResult | null;
  advanceWeek(menuId?: PracticeMenuId): WorldDayResult[];
  
  // ViewState getters (via projectors)
  getHomeView(): HomeViewState | null;
  getTeamView(): TeamViewState | null;
  getPlayerView(playerId: string): PlayerDetailViewState | null;
  getScoutView(filters?: ScoutSearchFilter): ScoutViewState | null;
  getTournamentView(): TournamentViewState | null;
  getResultsView(): ResultsViewState | null;
  getOBView(): OBViewState | null;
  
  // Scout actions
  scoutVisit(playerId: string): { success: boolean; message: string };
  recruitPlayerAction(playerId: string): { success: boolean; message: string };
  addToWatch(playerId: string): void;
  removeFromWatch(playerId: string): void;
}
```

**Status**: Fully functional, tracks recent results & news.

---

### 4.2 useGameStore (`src/stores/game-store.ts`)

Used for Phase 1/2 GameState-based gameplay. Less relevant for Phase 6.

---

## Part 5: Projector Pattern — ViewState Generation

### Overview

All UI screens pull data via **pure projector functions**: `(worldState: WorldState) => ViewState`

**Pattern Benefits:**
- Decouples engine state from UI representation
- Easy caching/memoization
- Testable in isolation
- No side effects

### 5.1 ViewState Types (`src/ui/projectors/view-state-types.ts`)

**Key Interfaces:**

```typescript
// Home Screen
interface HomeViewState {
  date: DateView;
  team: HomeTeamSummary;
  seasonPhase: string;
  recentNews: HomeNewsItem[];
  upcomingSchedule: HomeScheduleItem[];
  scoutBudgetRemaining: number;
  todayTask: HomeTodayTask;
  featuredPlayers: HomeFeaturedPlayer[];
  isTournamentDay: boolean;
  isInTournamentSeason: boolean;
}

// Team Roster
interface TeamViewState {
  schoolName: string;
  reputation: number;
  totalStrength: number;
  pitchingStrength: number;
  battingStrength: number;
  defenseStrength: number;
  players: PlayerRowView[];
  lineup: LineupView | null;
}

// Match Results
interface ResultsViewState {
  recentResults: ScoreboardView[];
  seasonRecord: { wins: number; losses: number; draws: number; };
}

// ScoreboardView (individual match)
interface ScoreboardView {
  date: DateView;
  homeSchool: string;
  awaySchool: string;
  homeScore: number;
  awayScore: number;
  innings: number;
  result: '勝利' | '敗北' | '引き分け' | null;
  inningScores?: InningScoreView;     // PHASE 6: Needs population
  highlights?: MatchHighlightView[];   // Already partially implemented
  pitcherSummary?: PitcherSummaryView | null;
  atBatFlow?: AtBatFlowItem[];        // Already partially implemented
}

// Tournament
interface TournamentViewState {
  seasonPhase: string;
  currentYear: number;
  yearResults: { summerBestRound; autumnBestRound; koshienAppearance; };
  placeholder: string;  // PHASE 6: Needs full implementation
}
```

### 5.2 resultsProjector.ts

**Main Function:**
```typescript
function projectResults(
  worldState: WorldState,
  recentDayResults: WorldDayResult[]
): ResultsViewState
```

**Currently:**
- Extracts MatchResult from recentDayResults
- Builds atBatFlow and highlights from InningResult[]
- Generates ScoreboardView

**Missing (Phase 6):**
- InningScoreView fully populated
- Better highlight filtering
- More detailed PitcherSummaryView

---

## Part 6: Pages & Components

### 6.1 Main Pages (`src/app/`)

| Page | File | Status | Notes |
|------|------|--------|-------|
| Home | `page.tsx` | ✅ Complete | Dashboard, team summary, news feed |
| Team | `team/page.tsx` | ✅ Complete | Roster, lineup, stats |
| Player | `team/[playerId]/page.tsx` | ✅ Complete | Player detail view |
| Scout | `scout/page.tsx` | ✅ Complete | Middle school scouting |
| Tournament | `tournament/page.tsx` | ⚠️ Placeholder | Needs Phase 6 work |
| Results | `results/page.tsx` | ⚠️ Partial | Needs InningResult display |
| OB | `ob/page.tsx` | ✅ Complete | Graduate career tracking |

### 6.2 Navigation Structure

Root layout (`app/layout.tsx`):
```typescript
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <div className={styles.container}>
          <nav>
            {/* Navigation links */}
          </nav>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
```

---

## Part 7: Testing Infrastructure

### Test Statistics
- **Total Tests**: 446
- **Test Files**: 45
- **Coverage Areas**: 
  - Unit tests: growth, save, scout, draft
  - Integration tests: year transition, scouting workflow
  - UI tests: projectors

### Key Test Files

| Category | Files | Count |
|----------|-------|-------|
| Match | `balance.test.ts`, `pitch.test.ts`, etc. | 50+ |
| Growth | `growth.test.ts`, `batch-growth.test.ts`, etc. | 40+ |
| World | `world-ticker.test.ts`, `year-transition.test.ts`, etc. | 70+ |
| Scout/Draft | `scout-system.test.ts`, `draft-system.test.ts` | 30+ |
| UI Projectors | `homeProjector.test.ts`, `resultsProjector.test.ts`, etc. | 80+ |
| Save | `save.test.ts` | 10+ |

### Vitest Configuration
- Entry point: `vitest.config.ts`
- Uses `happy-dom` for DOM simulation
- Includes `@vitest/ui` for test dashboard

---

## Part 8: Dependencies & Configuration

### package.json
```json
{
  "dependencies": {
    "next": "16.2.3",           // Latest App Router
    "react": "19.2.4",          // Latest React with hooks
    "react-dom": "19.2.4",
    "zustand": "5.0.12",        // State management
    "seedrandom": "3.0.5",      // Seeded RNG
    "dexie": "4.4.2",           // IndexedDB wrapper
    "happy-dom": "20.8.9"       // DOM for tests
  },
  "devDependencies": {
    "typescript": "5",
    "vitest": "4.1.4",
    "@types/node": "20",
    "@types/react": "19",
    "@types/react-dom": "19",
    "@vitest/ui": "4.1.4"
  }
}
```

### Next.js Configuration
- **next.config.ts**: Minimal (default config)
- **Version**: 16.2.3 (latest, with breaking changes from older Next)
- **Notes**: Read `node_modules/next/dist/docs/` for latest APIs

---

## Part 9: Architecture Summary

### Data Flow
```
Player Input (Pages)
    ↓
[Zustand Store: useWorldStore]
    ↓
[Engine: advanceWorldDay(), processYearTransition()]
    ↓
[WorldState updated]
    ↓
[Projectors: projectHome(), projectTeam(), etc.]
    ↓
[ViewState generated]
    ↓
[UI Renders ViewState]
```

### Key Patterns
1. **Projector Pattern**: Pure `(WorldState) => ViewState` functions
2. **RNG Derivation**: `rng.derive(path)` for reproducibility
3. **Simulation Tiers**: Tier 1 (full), Tier 2 (batch), Tier 3 (minimal)
4. **PersonRegistry**: Unified career tracking across all stages
5. **WorldDayResult**: Daily snapshot including match results

---

## Part 10: Phase 6 Implementation Map

### 10.1 Save/Load Enhancement
**Files to Modify:**
- `src/engine/save/save-manager.ts` — Add WorldState support
- `src/engine/save/serializer.ts` — WorldState serialization
- `src/stores/world-store.ts` — Add save/load actions
- NEW: `src/app/save/page.tsx` — Save/load UI

**Key Tasks:**
1. Extend `SaveManager` to accept `WorldState`
2. Implement version migration (1.0.0 → 2.0.0)
3. Create save/load slot UI
4. Add auto-save hook

### 10.2 Tournament UI Enhancement
**Files to Modify:**
- `src/ui/projectors/tournamentProjector.ts` — Full implementation
- `src/ui/projectors/view-state-types.ts` — TournamentViewState expansion
- `src/app/tournament/page.tsx` — UI implementation

**Key Tasks:**
1. Design tournament bracket structure
2. Track tournament progress in WorldState
3. Implement bracket visualization
4. Display results by round

### 10.3 Match Display Enhancement
**Files to Modify:**
- `src/ui/projectors/resultsProjector.ts` — InningResult processing
- `src/ui/projectors/view-state-types.ts` — ScoreboardView expansion
- `src/app/results/page.tsx` — UI enhancement

**Key Tasks:**
1. Store `InningResult[]` in MatchResult
2. Populate `InningScoreView` in ScoreboardView
3. Enhance highlight generation
4. Add detailed play-by-play view

### 10.4 Deploy Preparation
**Files to Review:**
- `next.config.ts` — Production config
- `package.json` — Dependency audit
- `tsconfig.json` — Strict mode checks
- Build output: `.next/`

**Key Tasks:**
1. Audit dependencies for vulnerabilities
2. Test production build
3. Performance optimization
4. Deploy to hosting

---

## Part 11: Critical Type Definitions for Phase 6

### InningResult Extension (from match/types.ts)
```typescript
interface InningResult {
  inningNumber: number;
  half: 'top' | 'bottom';
  atBats: AtBatResult[];
  runsScored: number;
  outsRecorded: number;
  endingBaseState: BaseState;
  // PHASE 6 ADDITION:
  homeRuns?: number;        // Runs scored in this half
  totalHits?: number;
  errors?: number;
}
```

### MatchResult Enhancement
```typescript
interface MatchResult {
  winner: 'home' | 'away' | 'draw';
  finalScore: { home: number; away: number };
  inningScores: { home: number[]; away: number[] };
  totalInnings: number;
  mvpPlayerId: string | null;
  batterStats: MatchBatterStat[];
  pitcherStats: MatchPitcherStat[];
  // PHASE 6 ADDITION:
  inningResults?: InningResult[];      // Full inning-by-inning results
  gameLog?: MatchEvent[];              // Optional detailed log
}
```

### ScoreboardView Enhancement
```typescript
interface ScoreboardView {
  // ... existing fields ...
  inningScores?: InningScoreView;      // Now required, populated from InningResult[]
  highlights?: MatchHighlightView[];   // Enhanced from InningResult processing
  playByPlaySummary?: string;          // New: condensed play description
  scoringSequence?: {                  // New: which players scored when
    inning: number;
    half: 'top' | 'bottom';
    playerName: string;
    runNumber: number;
  }[];
}
```

### TournamentViewState Enhancement
```typescript
interface TournamentViewState {
  seasonPhase: string;
  seasonPhaseLabel: string;
  currentYear: number;
  yearResults: {
    summerBestRound: number;
    autumnBestRound: number;
    koshienAppearance: boolean;
    koshienBestRound: number;
  };
  // PHASE 6 ADDITIONS:
  activeTournaments?: {
    id: string;
    name: string;
    phase: 'registration' | 'in_progress' | 'completed';
    startDate: string;
    endDate: string;
    totalTeams: number;
    currentRound: number;
    playerTeamStatus: 'not_entered' | 'entered' | 'eliminated' | 'winner';
    bracket?: BracketNode[];
  }[];
  
  completedTournaments?: {
    name: string;
    year: number;
    playerTeamResult: 'champion' | 'finalist' | 'semifinal' | 'eliminated' | 'not_entered';
    bestRound: number;
  }[];
}

interface BracketNode {
  id: string;
  round: number;
  matchId?: string;
  homeTeam?: { id: string; name: string; wins: number };
  awayTeam?: { id: string; name: string; wins: number };
  winner?: 'home' | 'away' | null;  // null if not yet played
  date?: string;
}
```

---

## Part 12: Testing Strategy for Phase 6

### Unit Tests (New)
1. **Save/Load Tests**
   - WorldState serialization
   - Version migration
   - Checksum validation

2. **Tournament Tests**
   - Bracket generation
   - Match scheduling
   - Round progression

3. **Results Projector Tests**
   - InningResult→ScoreboardView mapping
   - Highlight generation accuracy
   - Play-by-play flow generation

### Integration Tests
1. **Full cycle**: Save game → Load game → Advance → Save again
2. **Tournament progression**: Enter tournament → Advance matches → Complete
3. **Results persistence**: Play match → Save → Load → Verify results

### UI Tests (Component level)
- Save/load slot rendering
- Tournament bracket visualization
- Match scoreboard display
- Results filtering/sorting

---

## Part 13: Performance Considerations

### Current Metrics (from Phase 5)
- **1 year simulation**: < 60 seconds
- **5 year simulation**: < 5 minutes
- **Memory usage**: < 50 MB
- **Save size**: < 5 MB (JSON)

### Phase 6 Impact
1. **Save/Load**: Minimal (file I/O only)
2. **Tournament UI**: Negligible (UI-only changes)
3. **Results display**: Slight increase (InningResult storage adds ~5-10 KB per match)

### Optimization Opportunities
- Lazy-load tournament brackets
- Cache projector results
- Compress historical results (archive old seasons)

---

## Part 14: Known Issues & Workarounds

### From Phase 5 Report
1. **Year 2 Player Spike**: Initial cohort all graduate same year → temporary drop. Mitigated by spreading initial generations.
2. **Draft Candidates**: Low overall in Year 1. Solution: Higher initial player quality or lower draft threshold.
3. **News Diversity**: Currently template-based. Phase 6 could enhance with more varied text generation.

### Phase 6 Considerations
1. **InningResult in MatchResult**: Adds memory overhead. Solution: Optional field, archive old seasons.
2. **Tournament State**: Needs persistent storage across year transitions. Solution: Part of WorldState.
3. **Save Compatibility**: Version migration required. Solution: 1.0.0 → 2.0.0 with backward compatibility path.

---

## Part 15: Recommended Phase 6 Implementation Order

### Week 1: Foundation
1. Extend SaveManager to WorldState
2. Implement WorldState serialization
3. Create save/load slot UI
4. Write save/load tests

### Week 2: Tournament UI
1. Design tournament bracket data structure
2. Implement tournamentProjector fully
3. Create tournament visualization UI
4. Integrate with worldState

### Week 3: Results Enhancement
1. Populate InningResult[] in MatchResult
2. Enhance ScoreboardView generation
3. Implement play-by-play display
4. Add detailed stats view

### Week 4: Polish & Deploy
1. Performance testing
2. Cross-browser testing
3. Production build & optimization
4. Deploy to hosting

---

## Summary Table: File Cross-Reference

| Feature | Core Engine | State | UI Projector | Page | Tests |
|---------|-------------|-------|--------------|------|-------|
| Save/Load | `save-manager.ts` | world-store | N/A | new: save/ | save.test.ts |
| Tournament | world-state.ts | world-state | tournamentProjector | tournament/ | world.test.ts |
| Results | match/types.ts | world-store | resultsProjector | results/ | resultsProjector.test.ts |
| Scout | scout-system.ts | world-store | scoutProjector | scout/ | scout-system.test.ts |
| OB Tracking | person-state.ts | world-store | obProjector | ob/ | obProjector.test.ts |

---

**End of Exploration Report**
