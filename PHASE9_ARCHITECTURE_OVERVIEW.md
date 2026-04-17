# Koushien-Sim Project — Comprehensive Overview

**Generated:** 2026-04-17  
**Project:** High School Baseball Simulation Game (甲子園への道)  
**Current Phase:** 8 Complete (Local Save/Load), Preparing for Phase 9 (Cloud Save + Login + School Selection)

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Dependencies & Scripts](#dependencies--scripts)
3. [Architecture Overview](#architecture-overview)
4. [Core Systems](#core-systems)
5. [Current Save System (Phase 8)](#current-save-system-phase-8)
6. [App Pages & Routes](#app-pages--routes)
7. [Type Definitions](#type-definitions)
8. [Testing Setup](#testing-setup)
9. [Key Integration Points](#key-integration-points)
10. [Phase 9 Implementation Notes](#phase-9-implementation-notes)

---

## Project Structure

### Root Directory Layout
```
koushien-sim/
├── .next/                    # Next.js build output
├── .git/                     # Git repository
├── node_modules/             # Dependencies
├── public/                   # Static assets (SVG icons, etc.)
├── src/                      # Source code (see below)
├── tests/                    # Test files (vitest)
├── scripts/                  # Playtest & utility scripts
├── package.json              # Dependencies & scripts
├── tsconfig.json             # TypeScript config
├── tsconfig.build.json       # Build-specific TS config (excludes tests)
├── next.config.ts            # Next.js configuration
├── vitest.config.ts          # Vitest test runner config
├── vercel.json               # Deployment config
└── [Documentation files]     # Phase docs, reports, guides

```

### Source Code Structure (`src/`)
```
src/
├── app/                      # Next.js pages & UI components
│   ├── layout.tsx            # Root layout (SSR safe)
│   ├── page.tsx              # Home page (game hub)
│   ├── globals.css           # Global styles
│   ├── page.module.css       # Home page styles
│   ├── layout.module.css     # Layout styles
│   ├── favicon.ico           # Favicon
│   ├── save/
│   │   ├── SaveLoadPanel.tsx # Save/Load UI modal
│   │   └── SaveLoadPanel.module.css
│   ├── team/                 # Team management pages
│   │   ├── page.tsx          # Team roster & lineup
│   │   ├── [playerId]/page.tsx # Player detail page
│   │   └── team.module.css
│   ├── player/
│   │   └── [playerId]/page.tsx # Player stats detail
│   ├── scout/
│   │   └── page.tsx          # Scout/recruitment interface
│   ├── tournament/
│   │   └── page.tsx          # Tournament bracket view
│   ├── results/
│   │   └── page.tsx          # Match results history
│   ├── news/
│   │   └── page.tsx          # News/information feed
│   ├── ob/
│   │   └── page.tsx          # Alumni/graduates view
│   └── school/
│       └── [schoolId]/page.tsx # School detail page
│
├── engine/                   # Game logic & simulation
│   ├── index.ts              # Engine exports
│   ├── types/                # Type definitions (see below)
│   ├── core/                 # Core utilities
│   │   ├── rng.ts           # Random number generator (seeded)
│   │   ├── id.ts            # ID generation
│   │   └── ...
│   ├── world/                # World state & simulation
│   │   ├── world-state.ts    # WorldState type definition
│   │   ├── world-ticker.ts   # Day-by-day simulation
│   │   ├── create-world.ts   # World initialization
│   │   ├── school-generator.ts # AI school generation
│   │   ├── tournament-bracket.ts # Tournament logic
│   │   ├── year-transition.ts # Year-end state changes
│   │   ├── scout/            # Scout system
│   │   │   └── scout-system.ts
│   │   └── person-state.ts   # Middle school students
│   ├── player/               # Player generation & stats
│   │   ├── generate.ts       # Player generation
│   │   ├── stats.ts          # Stat calculations
│   │   └── ...
│   ├── team/                 # Team operations
│   │   ├── lineup.ts         # Lineup generation/management
│   │   └── ...
│   ├── growth/               # Player growth mechanics
│   │   ├── calculate.ts      # Growth calculations
│   │   ├── practice.ts       # Practice effects
│   │   ├── batch-growth.ts   # Batch growth for simulated schools
│   │   └── ...
│   ├── match/                # Match simulation
│   ├── calendar/             # Game calendar & scheduling
│   ├── shared/               # Shared utilities
│   └── save/                 # Save/Load system (Phase 8)
│       ├── save-manager.ts   # Generic save manager (OLD - not used)
│       ├── world-save-manager.ts # **MAIN SAVE SYSTEM**
│       └── world-serializer.ts # WorldState serialization
│
├── platform/                 # Platform abstractions
│   ├── index.ts              # Exports
│   ├── license/              # License management
│   └── storage/              # Storage abstraction layer
│       ├── adapter.ts        # Storage interface
│       ├── memory.ts         # In-memory storage
│       ├── indexeddb.ts      # IndexedDB adapter
│       ├── localstorage.ts   # LocalStorage adapter
│       └── index.ts          # Exports
│
├── stores/                   # Zustand state management
│   ├── world-store.ts        # **MAIN GAME STATE (WorldState)**
│   └── game-store.ts         # Legacy game state (Phase 1/2)
│
└── ui/                       # UI utilities & projectors
    └── projectors/           # ViewState generators
        ├── homeProjector.ts
        ├── teamProjector.ts
        ├── playerProjector.ts
        ├── scoutProjector.ts
        ├── tournamentProjector.ts
        ├── resultsProjector.ts
        ├── obProjector.ts
        └── view-state-types.ts # ViewState interfaces
```

### Test Structure (`tests/`)
```
tests/
├── setup.ts                  # Vitest setup
├── sample-players.ts         # Test fixtures
├── e2e/
│   └── full-season.test.ts   # End-to-end season simulation
├── engine/
│   ├── calendar/
│   ├── core/
│   ├── growth/
│   ├── integration/
│   ├── match/
│   ├── player/
│   ├── save/                 # Save system tests
│   ├── team/
│   └── world/
├── platform/
├── stores/
│   └── world-store.test.ts
└── ui/
    └── projectors/
```

---

## Dependencies & Scripts

### package.json
```json
{
  "name": "koushien-sim",
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "16.2.3",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "zustand": "^5.0.12",        // State management
    "dexie": "^4.4.2",           // IndexedDB wrapper (for future cloud save)
    "seedrandom": "^3.0.5",      // Seeded RNG
    "vitest": "^4.1.4",          // Test runner
    "happy-dom": "^20.8.9"       // DOM emulation for tests
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/node": "^20",
    "@types/seedrandom": "^3.0.8"
  }
}
```

### Available Scripts
- **`npm run dev`** — Start Next.js dev server (hot reload)
- **`npm run build`** — Build for production
- **`npm run start`** — Start production server
- **`vitest`** (implicitly) — Run tests with Vitest

---

## Architecture Overview

### High-Level Design

```
┌─────────────────────────────────────────────────────────┐
│                   Next.js App Router                     │
│  (SSR-safe layout, client-side pages with 'use client') │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
    ┌───▼────────┐            ┌──────▼──────┐
    │  App Pages │            │ SaveLoadUI  │
    │ (page.tsx) │            │   (Modal)   │
    └───┬────────┘            └──────┬──────┘
        │                            │
        └──────────────┬─────────────┘
                       │
        ┌──────────────▼──────────────┐
        │   Zustand Store (Context)   │
        │   useWorldStore()           │
        │  - worldState: WorldState   │
        │  - advanceDay()             │
        │  - saveGame()               │
        │  - loadGame()               │
        └──────────────┬──────────────┘
                       │
    ┌──────────────────┼──────────────────┐
    │                  │                  │
┌───▼────────┐  ┌──────▼──────┐  ┌───────▼──┐
│   Engine   │  │  Projectors │  │  Storage │
│  (Game     │  │  (ViewState │  │ (Save    │
│   Logic)   │  │   Builders) │  │  System) │
└────────────┘  └─────────────┘  └──────────┘
    │                  │              │
    │                  │              │
│   ├─ world-state   ├─ homeProjector    ├─ world-save-manager.ts
│   ├─ world-ticker   ├─ teamProjector    │  (Main save API)
│   ├─ tournament     ├─ playerProjector  │
│   ├─ scout-system   ├─ scoutProjector   ├─ localStorage (Primary)
│   ├─ player gen     └─ ...              └─ IndexedDB (Fallback)
│   └─ growth calc
```

### Data Flow: Save/Load (Phase 8)

```
User Action (Click "セーブ" button)
        │
        ▼
┌──────────────────────┐
│ SaveLoadPanel.tsx    │ Show modal, select slot
└──────┬───────────────┘
       │
       ▼
┌──────────────────────────┐
│ useWorldStore.saveGame() │ Get current WorldState
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│ world-save-manager.ts    │
│ saveWorldState()         │ Serialize state
│                          │ Compute checksum
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│ world-serializer.ts      │ JSON stringify + validation
│ serializeWorldState()    │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│ localStorage (browser)   │ Store WorldSaveEntry
│ key: "koushien_save_..." │ (meta + stateJson + checksum)
└──────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16 + React 19 (App Router) |
| **State** | Zustand (simple, hook-based) |
| **UI** | CSS Modules (BEM-ish naming) |
| **Game Logic** | TypeScript (Pure functions + immutable) |
| **Randomness** | Seeded RNG (deterministic) |
| **Storage** | Browser localStorage (4MB limit) |
| **Testing** | Vitest + Happy-DOM |
| **Deployment** | Vercel (vercel.json configured) |

---

## Core Systems

### 1. WorldState (The Game World)

**File:** `src/engine/world/world-state.ts`

```typescript
interface WorldState {
  // --- Identity & seed ---
  seed: string;                    // For reproducible RNG
  playerSchoolId: string;          // Player's school ID
  
  // --- Time ---
  currentDate: GameDate;           // { year, month, day }
  
  // --- Schools & People ---
  schools: HighSchool[];           // All 47 prefectural schools (+ simulated)
  middleSchoolPlayers: MiddleSchoolPlayer[];  // Upcoming recruits
  personRegistry: PersonRegistry;  // All persons (coaches, scouts, etc.)
  
  // --- Season State ---
  seasonState: {
    phase: SeasonPhase;            // e.g., 'spring_practice', 'summer_tournament'
    yearResults: YearResults;      // Win records for this year
  }
  
  // --- Manager ---
  manager: Manager;                // Player's manager stats
  
  // --- Tournaments ---
  activeTournament: TournamentBracket | null;  // Current bracket
  tournamentHistory: TournamentBracket[];       // Past tournaments
  
  // --- Scout State ---
  scoutState: ScoutState;
  
  // --- Simulation Metadata ---
  rng: RNG;                        // Runtime RNG instance
}

type SeasonPhase = 
  | 'spring_practice'
  | 'summer_tournament'
  | 'koshien'
  | 'post_summer'
  | 'autumn_tournament'
  | 'off_season'
  | 'pre_season';
```

### 2. Game Progression

**File:** `src/engine/world/world-ticker.ts`

```typescript
function advanceWorldDay(
  world: WorldState,
  practiceMenu: PracticeMenuId,
  rng: RNG
): { nextWorld: WorldState; result: WorldDayResult }
```

**Returns:**
```typescript
interface WorldDayResult {
  dayOfYear: number;
  practiceMenuApplied: PracticeMenuId;
  playerGrowth: { playerId: string; growthData: ... }[];
  playerMatchResult?: MatchResult;      // If tournament match occurred
  playerMatchSide?: 'home' | 'away';
  playerMatchOpponent?: string;
  seasonTransition?: SeasonPhase;       // If season changed
  worldNews: NewsItem[];
  scoutablePlayerIds: string[];
}
```

### 3. Zustand Store (world-store.ts)

**Main hook for UI:** `useWorldStore()`

```typescript
interface WorldStore {
  // --- State ---
  worldState: WorldState | null;
  isLoading: boolean;
  lastDayResult: WorldDayResult | null;
  recentResults: WorldDayResult[];
  recentNews: NewsItem[];
  
  // --- Game lifecycle ---
  newWorldGame(config: NewWorldConfig): void;
  advanceDay(menuId?: PracticeMenuId): WorldDayResult | null;
  advanceWeek(menuId?: PracticeMenuId): WorldDayResult[];
  
  // --- ViewState projections (transform WorldState → UI model) ---
  getHomeView(): HomeViewState | null;
  getTeamView(): TeamViewState | null;
  getPlayerView(playerId: string): PlayerDetailViewState | null;
  getScoutView(filters?: ScoutSearchFilter): ScoutViewState | null;
  getTournamentView(): TournamentViewState | null;
  getResultsView(): ResultsViewState | null;
  getOBView(): OBViewState | null;
  
  // --- Scout actions ---
  scoutVisit(playerId: string): { success, message };
  recruitPlayerAction(playerId: string): { success, message };
  addToWatch(playerId: string): void;
  removeFromWatch(playerId: string): void;
  
  // --- Save/Load (Phase 8) ---
  saveGame(slotId: WorldSaveSlotId, displayName: string): Promise<WorldSaveResult>;
  loadGame(slotId: WorldSaveSlotId): Promise<WorldLoadResult>;
  deleteSave(slotId: WorldSaveSlotId): void;
  listSaves(): WorldSaveSlotMeta[];
  triggerAutoSave(trigger: 'monthly' | 'year_end' | 'pre_tournament'): Promise<WorldSaveResult>;
  getStorageUsage(): number;
  
  // --- Tournament ---
  startTournament(type: TournamentType): void;
  simulateTournament(): void;
}
```

### 4. ViewState Projectors

**Purpose:** Transform WorldState → UI-friendly structures (reactive, pre-computed)

**Files:** `src/ui/projectors/*.ts`

Example:
```typescript
// src/ui/projectors/homeProjector.ts
function projectHome(world: WorldState, recentNews: NewsItem[]): HomeViewState {
  const playerSchool = findSchool(world.playerSchoolId);
  return {
    date: { ...world.currentDate, japaneseDisplay: "Year 1 4月1日" },
    team: {
      schoolName: playerSchool.name,
      teamOverall: calculateTeamStrength(playerSchool),
      playerCount: playerSchool.players.length,
      acePlayerName: ...,
      // ... etc
    },
    tournament: world.activeTournament ? projectTournamentInfo(...) : null,
    featuredPlayers: top3PlayersByGrowth(...),
    upcomingSchedule: [
      { description: "夏の大会開始", monthDay: "7月10日" },
      ...
    ],
    scoutBudgetRemaining: world.scoutState.monthlyBudget - world.scoutState.monthlyUsed,
    recentNews: recentNews.slice(0, 5),
    // ... and more
  };
}
```

### 5. Save/Load System (Phase 8)

**Main API:** `src/engine/save/world-save-manager.ts`

```typescript
// Save slots (6 total)
export const WORLD_SAVE_SLOTS = {
  SLOT_1: 'world_slot_1',           // Manual slot 1
  SLOT_2: 'world_slot_2',           // Manual slot 2
  SLOT_3: 'world_slot_3',           // Manual slot 3
  AUTO_YEAR: 'world_auto_year',     // Year-end protected
  AUTO_MONTHLY: 'world_auto_monthly', // Monthly rotation
  PRE_TOURNAMENT: 'world_pre_tournament', // Pre-tournament
};

// Public API
export async function saveWorldState(
  slotId: WorldSaveSlotId,
  world: WorldState,
  displayName: string,
): Promise<WorldSaveResult>;

export async function loadWorldState(
  slotId: WorldSaveSlotId,
): Promise<WorldLoadResult>;

export function deleteWorldSave(slotId: WorldSaveSlotId): void;
export function listWorldSaves(): WorldSaveSlotMeta[];
export function getStorageUsedBytes(): number;
```

**Storage Backend:**
- **Primary:** Browser `localStorage` (4MB limit with warning)
- **Fallback:** IndexedDB (via Dexie) — *prepared but not currently active*

**Meta Structure (localStorage):**
```
Key: "koushien_save_world_slot_1"
Value: {
  slotId: "world_slot_1",
  meta: {
    slotId: "world_slot_1",
    displayName: "スロット 1",
    schoolName: "桜葉高校",
    managerName: "監督",
    currentDate: { year: 1, month: 7, day: 15 },
    seasonPhase: "summer_tournament",
    winRate: "夏3回戦 秋2回戦",
    savedAt: 1713340800000,
    version: "6.0.0",
    isProtected: false,
  },
  stateJson: "{\"seed\":\"...\",\"playerSchoolId\":\"...\", ...}",  // Full serialized
  checksum: "abc123def456..."  // SHA-256 hex of stateJson
}

Key: "koushien_save_meta_list"
Value: [
  { slotId: "world_slot_1", displayName: "...", schoolName: "...", ... },
  { slotId: "world_auto_year", displayName: "...", ... },
  ...
]
```

---

## Current Save System (Phase 8)

### SaveLoadPanel.tsx

**File:** `src/app/save/SaveLoadPanel.tsx`

Modal UI component shown when user clicks "💾 セーブ" or "📂 ロード" buttons.

**Features:**
- Two tabs: "セーブ" (Save) and "ロード" (Load)
- 3 manual slots + 3 auto-save slots (read-only)
- Confirmation dialogs for overwrite/load/delete
- Storage usage bar (shows % of 4MB limit)
- Error/success messages
- Slot metadata display (school name, manager, date, phase, win record)

**Flow:**
1. User clicks "セーブ" button in header
2. Modal opens with Save tab active
3. User selects a manual slot (with existing save = shows overwrite warning)
4. Confirmation dialog
5. Call `useWorldStore.saveGame(slotId, displayName)`
6. Toast notification on success/error

### Serialization (world-serializer.ts)

```typescript
export function serializeWorldState(world: WorldState): string {
  // 1. Strip RNG instance (non-serializable)
  const rngless = { ...world, rng: undefined };
  
  // 2. JSON.stringify with custom replacer for Date objects
  return JSON.stringify(rngless, customReplacer);
}

export function deserializeWorldState(json: string): WorldState {
  // 1. Parse JSON
  const data = JSON.parse(json, customReviver);
  
  // 2. Restore RNG from seed
  data.rng = createRNG(data.seed);
  
  // 3. Validate structure
  if (!validateWorldSaveData(data)) {
    throw new Error('Invalid save data structure');
  }
  
  return data;
}

export async function computeWorldChecksum(json: string): Promise<string> {
  // Use crypto.subtle.digest for SHA-256 (browser API)
  const buffer = new TextEncoder().encode(json);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

---

## App Pages & Routes

All pages in `src/app/*/page.tsx` are **client components** (`'use client'`).

| Route | File | Purpose |
|-------|------|---------|
| `/` | `page.tsx` | **Home hub** — setup, practice menu, progress, news |
| `/team` | `team/page.tsx` | Roster view, lineup management |
| `/team/[playerId]` | `team/[playerId]/page.tsx` | Player stats detail |
| `/player/[playerId]` | `player/[playerId]/page.tsx` | Same as above (alt route) |
| `/scout` | `scout/page.tsx` | Scout search & recruitment |
| `/tournament` | `tournament/page.tsx` | Active bracket & match schedule |
| `/results` | `results/page.tsx` | Match result history |
| `/news` | `news/page.tsx` | Archived news feed |
| `/ob` | `ob/page.tsx` | Alumni/graduated players |
| `/school/[schoolId]` | `school/[schoolId]/page.tsx` | Opponent school profile |

### Layout (layout.tsx)

```typescript
export const metadata: Metadata = {
  title: "甲子園への道 — 高校野球シミュレーション",
  description: "...",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
```

**Note:** No middleware.ts exists. Root layout is SSR-safe and renders children as-is.

---

## Type Definitions

### Core Type Files

**File:** `src/engine/types/`

#### `calendar.ts`
```typescript
export interface GameDate {
  year: number;        // 1, 2, 3, ...
  month: number;       // 1–12
  day: number;         // 1–31
  dayOfYear: number;
  quarterYear: 1 | 2 | 3 | 4;
}

export type PracticeMenuId =
  | 'batting_basic'
  | 'batting_live'
  | 'pitching_basic'
  | 'pitching_bullpen'
  | 'fielding_drill'
  | 'running'
  | 'rest';
```

#### `player.ts`
```typescript
export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  stats: PlayerStats;
  enrollmentYear: -1 | 0 | 1;  // -1: 3rd year, 0: 2nd, 1: 1st
  middleSchoolName: string;
  isWatched: boolean;
  // ... 20+ stat fields
}

export type Position = 'P' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF';
```

#### `team.ts`
```typescript
export interface Team {
  id: string;
  name: string;
  prefecture: string;
  reputation: number;
  players: Player[];
  lineup: Lineup | null;
  facilities: FacilityLevel;
}

export interface Lineup {
  battingOrder: string[];  // Player IDs
  pitcher: string;
  catcher: string;
}
```

#### `game-state.ts`
```typescript
export interface SaveSlotMeta {
  slotId: string;
  schoolName: string;
  currentDate: { year, month, day };
  playTimeMinutes: number;
  savedAt: number;  // Unix timestamp
  version: string;
}
```

### ViewState Types

**File:** `src/ui/projectors/view-state-types.ts`

UI-friendly read-only structures transformed from WorldState:

```typescript
export interface HomeViewState {
  date: { year, month, day, japaneseDisplay: string };
  team: {
    schoolName: string;
    teamOverall: number;
    playerCount: number;
    acePlayerName?: string;
    aceOverall?: number;
    anchorPlayerName?: string;
    anchorOverall?: number;
  };
  tournament: TournamentInfoState | null;
  todayTask: { type: 'match' | 'off' | 'scout' | 'practice'; detail: string };
  featuredPlayers: PlayerSummary[];
  upcomingSchedule: { description: string; monthDay: string }[];
  scoutBudgetRemaining: number;
  scoutBudgetTotal: number;
  recentNews: NewsItem[];
  seasonPhaseLabel: string;
  isInTournamentSeason: boolean;
  tournamentStart?: { name: string; date: string; daysAway: number };
}
```

---

## Testing Setup

### Vitest Configuration

**File:** `vitest.config.ts`
```typescript
export default defineConfig({
  test: {
    environment: 'happy-dom',  // DOM emulation
    globals: true,             // No need to import describe, it, expect
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

### Test Directories

- **`tests/e2e/`** — Full game simulation (5 years)
- **`tests/engine/`** — Game logic units (growth, match, player, save, world, team, etc.)
- **`tests/stores/`** — Zustand store behavior
- **`tests/platform/`** — Storage adapter tests
- **`tests/ui/projectors/`** — ViewState generation

### Example Test
```typescript
// tests/engine/save/world-save-manager.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { saveWorldState, loadWorldState } from '@/engine/save/world-save-manager';

describe('World Save Manager', () => {
  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();
  });

  it('should save and load a world state', async () => {
    const world = createTestWorldState();
    
    const saveResult = await saveWorldState('world_slot_1', world, 'Test');
    expect(saveResult.success).toBe(true);
    
    const loadResult = await loadWorldState('world_slot_1');
    expect(loadResult.success).toBe(true);
    expect(loadResult.world?.playerSchoolId).toBe(world.playerSchoolId);
  });
});
```

---

## Key Integration Points

### 1. Home Page (`page.tsx`)

**Setup flow:**
```
SetupScreen (no game) → onStart(schoolName, pref, manager)
                          ↓
                    newWorldGame(config)
                          ↓
                    worldState initialized
                          ↓
                    HomeContent rendered
```

**Key functions called:**
- `useWorldStore.newWorldGame()` — Initialize
- `useWorldStore.advanceDay()` — Progress 1 day
- `useWorldStore.advanceWeek()` — Progress 7 days max (stop at match)
- `useWorldStore.getHomeView()` — Render current state

**Save/Load integration:**
- Click "💾 セーブ" → Opens SaveLoadPanel (tab='save')
- Click "📂 ロード" → Opens SaveLoadPanel (tab='load')
- SaveLoadPanel calls `saveGame()` / `loadGame()`

### 2. Storage Persistence

**localStorage keys:**
```
koushien_save_world_slot_1
koushien_save_world_slot_2
koushien_save_world_slot_3
koushien_save_world_auto_year
koushien_save_world_auto_monthly
koushien_save_world_pre_tournament
koushien_save_meta_list  ← Index of all saves
```

**Size estimate:**
- Per save: ~200–500 KB (WorldState is large)
- With 3 manual + 3 auto = ~2–3 MB typical
- Warning at 4MB limit

### 3. Projectors & UI Binding

```typescript
// In component:
const view = useWorldStore(s => s.getHomeView());

// view is computed once per getHomeView() call
// UI re-renders when worldState changes (via Zustand)
// Projectors are pure functions (no side effects)
```

---

## Phase 9 Implementation Notes

### Goals for Phase 9

1. **Cloud Save** — Sync to backend (MongoDB/Firebase)
2. **User Authentication** — Login/signup with credentials
3. **School Selection Screen** — Choose a school instead of setup form
4. **Cross-device Play** — Load game on different device

### Proposed Architecture Changes

#### 1. New API Endpoints (Next.js App Router)

Create `src/app/api/` directory:

```
src/app/api/
├── auth/
│   ├── signup/route.ts           # POST /api/auth/signup
│   ├── login/route.ts            # POST /api/auth/login
│   ├── logout/route.ts           # POST /api/auth/logout
│   └── refresh/route.ts          # POST /api/auth/refresh
├── saves/
│   ├── route.ts                  # GET/POST /api/saves (list, create)
│   └── [saveId]/route.ts         # GET/PUT/DELETE /api/saves/[saveId]
└── schools/
    └── route.ts                  # GET /api/schools (list available)
```

#### 2. Auth Context/Store

```typescript
// src/stores/auth-store.ts
interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  
  signup(email, password): Promise<{ success, error? }>;
  login(email, password): Promise<{ success, error? }>;
  logout(): void;
  refreshToken(): Promise<boolean>;
}

export const useAuthStore = create<AuthStore>(...)
```

#### 3. Expanded Save System

Dual-layer save (local + cloud):

```typescript
// src/engine/save/cloud-save-manager.ts
export async function saveToCloud(
  slotId: WorldSaveSlotId,
  world: WorldState,
  displayName: string,
  userId: string,  // NEW
  token: string,   // NEW
): Promise<CloudSaveResult>

// src/engine/save/world-save-manager.ts (enhanced)
export async function syncSaveToCloud(
  slotId: WorldSaveSlotId,
  userId: string,
  token: string,
): Promise<SyncResult>

export async function downloadCloudSave(
  saveId: string,
  userId: string,
  token: string,
): Promise<WorldState | null>
```

#### 4. School Selection Screen

**File:** `src/app/school-select/page.tsx` (new)

```typescript
function SchoolSelectionScreen() {
  const [schools, setSchools] = useState<HighSchool[]>([]);
  
  useEffect(() => {
    // GET /api/schools
    fetch('/api/schools')
      .then(r => r.json())
      .then(data => setSchools(data));
  }, []);
  
  const handleSelectSchool = (schoolId: string) => {
    // Route to game with pre-selected school
    router.push(`/?school=${schoolId}`);
  };
  
  return <SchoolGrid schools={schools} onSelect={handleSelectSchool} />;
}
```

#### 5. Database Schema (Example: MongoDB)

```javascript
// Collections
db.users.create({
  _id: ObjectId,
  email: string,
  passwordHash: string,  // bcrypt
  createdAt: Date,
  lastLogin: Date,
  profile: {
    displayName: string,
    favoriteSchool: ObjectId,
  }
});

db.saves.create({
  _id: ObjectId,
  userId: ObjectId,  // FK to users
  displayName: string,
  schoolName: string,
  currentDate: { year, month, day },
  stateJson: string,  // Encrypted or plain
  checksum: string,
  createdAt: Date,
  updatedAt: Date,
  isCloudSynced: boolean,
  cloudVersion: number,  // For conflict resolution
});

db.schools.create({
  _id: ObjectId,
  name: string,
  prefecture: string,
  reputation: number,
  playstyle: string,
});
```

#### 6. Middleware & Auth Tokens

**File:** `src/middleware.ts` (NEW)

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  
  // Public routes
  if (request.nextUrl.pathname.startsWith('/auth')) {
    return NextResponse.next();
  }
  
  // Protected API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    try {
      const user = await verifyToken(token);
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-user-id', user.id);
      return NextResponse.next({
        request: { headers: requestHeaders },
      });
    } catch (err) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*'],
};
```

#### 7. Serialization: Handle Sensitive Data

```typescript
// worldSerializer should encrypt PII in cloud saves?
// Or keep same as Phase 8 (client-side only)?

// Option A: Encrypt before sending to cloud
export function encryptWorldState(world: WorldState, key: string): string {
  const json = serializeWorldState(world);
  return encryptAES(json, key);  // User's password as key
}

// Option B: Trust HTTPS + database encryption
// (Simpler for MVP, but less secure)
```

### Integration with Existing Code

1. **Minimal changes to game engine** — Save format stays same
2. **Update HomeContent** — Add cloud sync indicator
3. **Update SaveLoadPanel** — Show cloud saves + sync status
4. **Update useWorldStore** — Add cloud sync methods
5. **New auth pages** — `/auth/login`, `/auth/signup`
6. **New middleware** — Token validation for `/api/*`

### Testing Strategy

```typescript
// tests/api/auth.test.ts
describe('POST /api/auth/login', () => {
  it('should return token on valid credentials', async () => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com', password: 'pass' }),
    });
    expect(res.status).toBe(200);
    const { token } = await res.json();
    expect(token).toBeDefined();
  });
});

// tests/stores/auth-store.test.ts
describe('useAuthStore', () => {
  it('should persist token to localStorage', async () => {
    const store = renderHook(() => useAuthStore());
    await store.result.current.login('test@example.com', 'pass');
    expect(localStorage.getItem('auth_token')).toBeTruthy();
  });
});

// tests/engine/save/cloud-save-manager.test.ts
describe('Cloud Save', () => {
  it('should sync local save to cloud', async () => {
    const result = await syncSaveToCloud('world_slot_1', userId, token);
    expect(result.success).toBe(true);
  });
});
```

---

## Summary

| Aspect | Details |
|--------|---------|
| **Language** | TypeScript (strict mode) |
| **Framework** | Next.js 16 (App Router) |
| **State** | Zustand (world-store.ts) |
| **Storage** | Browser localStorage (4MB limit) |
| **Testing** | Vitest + Happy-DOM |
| **Current Phases** | 1–8 (game logic, local save/load) |
| **Pending Phase 9** | Cloud sync, auth, school selection |
| **Deployment** | Vercel (configured) |
| **Key Files** | `page.tsx`, `world-store.ts`, `world-save-manager.ts`, `SaveLoadPanel.tsx` |

