# Koushien-Sim Project - Comprehensive Code Exploration

## Executive Summary

The **koushien-sim** project is a **High School Baseball Simulator** (高校野球シミュレーター) built with **Next.js 14** (React), **TypeScript**, and **Zustand** for state management. It simulates a complete player progression system across multiple school years, tournament seasons, and career paths.

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [File Contents - Core Files Read](#file-contents-core-files-read)
3. [State Management](#state-management)
4. [Key Data Flow](#key-data-flow)
5. [UI/Navigation Architecture](#uinavigation-architecture)
6. [World Progression System](#world-progression-system)
7. [Tournament System](#tournament-system)
8. [Modal & Dialog Implementation](#modal--dialog-implementation)

---

## Project Structure

```
src/
├── app/                           # Next.js 14 App Router pages
│   ├── page.tsx                   # Home page (ホーム)
│   ├── layout.tsx                 # Root layout
│   ├── tournament/
│   │   ├── page.tsx               # Tournament view
│   │   └── page.module.css        # Styling
│   ├── team/
│   ├── scout/
│   ├── results/
│   ├── news/
│   ├── ob/
│   ├── player/
│   ├── school/
│   └── save/
│       └── SaveLoadPanel.tsx      # Save/Load modal component
│
├── stores/                        # Zustand stores
│   ├── world-store.ts             # Main world state (WorldState)
│   └── game-store.ts              # Legacy game state (GameState)
│
├── engine/                        # Game logic layer
│   ├── world/
│   │   ├── world-state.ts         # WorldState interface definition
│   │   ├── world-ticker.ts        # Day advancement logic
│   │   ├── tournament-bracket.ts  # Tournament generation & simulation
│   │   ├── create-world.ts        # World initialization
│   │   ├── year-transition.ts     # Year/graduation logic
│   │   ├── scout/
│   │   │   └── scout-system.ts    # Scout/recruit mechanics
│   │   └── news/
│   │       └── news-generator.ts  # News generation
│   │
│   ├── calendar/
│   │   ├── game-calendar.ts       # Date utilities, season phase computation
│   │   ├── day-processor.ts       # Single day processing
│   │   └── schedule.ts            # Tournament schedule
│   │
│   ├── types/
│   │   ├── calendar.ts            # GameDate, PracticeMenuId, DayType
│   │   ├── player.ts              # Player, PlayerStats
│   │   ├── team.ts                # Team, Lineup, Manager
│   │   └── game-state.ts          # GameState (legacy)
│   │
│   ├── growth/                    # Player growth calculation
│   ├── match/                     # Match simulation
│   ├── player/                    # Player generation
│   ├── team/                      # Team management
│   ├── save/                      # Save/Load persistence
│   └── core/                      # RNG, ID generation
│
└── ui/
    └── projectors/                # ViewState generation (Pure functions)
        ├── homeProjector.ts       # Home screen ViewState
        ├── tournamentProjector.ts # Tournament ViewState
        ├── teamProjector.ts
        ├── playerProjector.ts
        ├── scoutProjector.ts
        ├── resultsProjector.ts
        ├── obProjector.ts
        └── view-state-types.ts    # All ViewState interfaces
```

---

## File Contents - Core Files Read

### 1. **src/app/page.tsx** (557 lines)

**Purpose**: Home page UI - main hub for player management and day progression

**Key Components**:
- **SetupScreen**: Initial game setup form (school name, prefecture, manager name)
- **WelcomeBanner**: First-play tutorial (Year 1, Day 1)
- **ProgressIndicator**: Shows current date, season phase, next tournament, team overall
- **HomeContent**: Main page layout with:
  - Header with save/load buttons
  - Navigation bar (7 main pages)
  - Tournament banner (when in season)
  - Today's task display
  - Practice menu selection
  - Day/Week advancement buttons
  - Team summary with ace & anchor batters
  - Featured players (top 3 by ability + form)
  - Upcoming schedule (3 next events)
  - Scout budget display
  - Recent news (top 5 with importance sorting)
  - Quick menu links

**State Management**:
```typescript
const advanceDay = useWorldStore((s) => s.advanceDay);
const advanceWeek = useWorldStore((s) => s.advanceWeek);
const getHomeView = useWorldStore((s) => s.getHomeView);
```

**Flow**:
1. User selects practice menu (7 options: batting, pitching, fielding, running, rest, etc.)
2. Clicks "▶ 練習して1日進む" or "▶▶ 1週間まとめて進む"
3. Store calls `advanceDay(menuId)` or `advanceWeek(menuId)`
4. UI updates with new WorldState

---

### 2. **src/app/tournament/page.tsx** (317 lines)

**Purpose**: Tournament bracket display and simulation UI

**Key Components**:
- **MatchCell**: Single match display (home/away teams, scores, bye indication)
  - Shows player school matches with red border
  - Shows upsets with 🔥 icon
  - Shows completed matches with winner highlighting
  - Handles bye matches ("不戦勝")
  
- **RoundColumn**: Single tournament round column
  
- **BracketView**: Full tournament bracket with:
  - Round filter tabs (all / round1 / round2 / etc.)
  - Horizontal scrollable grid
  - Legend (◎=自校, 🔥=番狂わせ)
  - "Simulate all matches" button

**Tournament Structure**:
- 48 teams total
- 6 rounds
- Round 1: 32 teams → 16 matches
- Round 2: 16 seeded + 16 winners → 16 matches
- Rounds 3-6: Single elimination to final

**Data Flow**:
```typescript
const getTournamentView = useWorldStore((s) => s.getTournamentView);
const startTournament = useWorldStore((s) => s.startTournament);
const simulateTournament = useWorldStore((s) => s.simulateTournament);
```

---

### 3. **src/stores/world-store.ts** (405 lines)

**Purpose**: Main Zustand store managing WorldState and all game actions

**Store State**:
```typescript
interface WorldStore {
  worldState: WorldState | null;              // Current game state
  isLoading: boolean;
  lastDayResult: WorldDayResult | null;       // Last day's result
  recentResults: WorldDayResult[];            // Last 30 days
  recentNews: WorldDayResult['worldNews'];    // Last 20 news items
}
```

**Key Actions**:
1. **newWorldGame(config)**: Create new game
   - Takes: schoolName, prefecture, managerName, seed?
   - Creates 23 initial players (8 grade3, 7 grade2, 8 grade1)
   - Initializes WorldState via `createWorldState()`
   - Resets recent results/news

2. **advanceDay(menuId)**: Single day progression
   - Default menu: 'batting_basic'
   - Calls `advanceWorldDay(worldState, menuId, rng)`
   - Updates recent results (max 30)
   - Updates recent news (max 20)
   - Returns WorldDayResult

3. **advanceWeek(menuId)**: 7x advanceDay calls

4. **ViewState Projectors**:
   - `getHomeView()` → projectHome()
   - `getTeamView()` → projectTeam()
   - `getPlayerView(playerId)` → projectPlayer()
   - `getScoutView(filters)` → projectScout()
   - `getTournamentView()` → projectTournament()
   - `getResultsView()` → projectResults()
   - `getOBView()` → projectOB()

5. **Scout Actions**:
   - `scoutVisit(playerId)`: Visit middle school, get scout report
   - `recruitPlayerAction(playerId)`: Recruit player
   - `addToWatch(playerId)`, `removeFromWatch(playerId)`

6. **Save/Load Actions**:
   - `saveGame(slotId, displayName)`: Save to indexed DB
   - `loadGame(slotId)`: Load from indexed DB
   - `deleteSave(slotId)`, `listSaves()`, `triggerAutoSave(trigger)`

7. **Tournament Actions**:
   - `startTournament(type)`: Create bracket ('summer'|'autumn'|'koshien')
   - `simulateTournament()`: Run all remaining matches

---

### 4. **src/ui/projectors/homeProjector.ts** (282 lines)

**Purpose**: Pure function to convert WorldState → HomeViewState for UI

**Key Helper Functions**:

1. **makeDateView(year, month, day)**: DateView
   - Calculates day of week (Year1/4/1 = Monday)
   - Returns: year, month, day, displayString, japaneseDisplay

2. **getSeasonPhaseLabel(phase)**: Maps phase enum to Japanese labels
   - spring_practice → "春季練習"
   - summer_tournament → "夏の大会"
   - koshien → "甲子園"
   - post_summer → "夏以降練習"
   - autumn_tournament → "秋の大会"
   - off_season → "オフシーズン"
   - pre_season → "始動"

3. **findAce(players)**: Best pitcher by overall
4. **findAnchor(players, lineup)**: 4th batter (batting order position [3])
5. **computeTeamOverall(players)**: Average of all player overalls
6. **overallToRank(overall)**: Converts 0-100 overall → S/A/B/C/D/E

7. **buildFeaturedPlayers(players)**: Top 3 players by overall + low fatigue
   - Scores each player: overall + (50 - fatigue) * 0.3
   - Returns reason: "絶好調" (fatigue<20), "好調" (fatigue<35), "総合力上位"

8. **buildTodayTask(phase, scoutBudgetRemaining)**: HomeTodayTask
   - If in tournament: type='match', detail about tournament
   - If off_season: type='off', recommend rest
   - If scout budget > 0: type='scout', show remaining visits
   - Else: type='practice', choose menu

9. **buildUpcomingSchedule(month)**: Next 3 schedule items
   - 入学式 (Enrollment - April)
   - 夏の大会 (Summer tournament - July)
   - 甲子園 (Koshien - August)
   - 秋の大会 (Autumn tournament - September)
   - ドラフト会議 (Pro draft - October)
   - 卒業式 (Graduation - March)

10. **getNewsIcon(type, headline)**: Returns emoji icon by news type
    - upset → 🔥
    - draft → 📋
    - record → 📊 or 🏆 (if OB)
    - tournament_result → ⚾ / 🏆 / 📋
    - injury → 🏥
    - no_hitter → ✨
    - Default → 📰

---

### 5. **src/engine/world/world-state.ts** (238 lines)

**Purpose**: Type definitions for the complete game world state

**Key Interfaces**:

1. **HighSchool** (replaces Team)
   ```typescript
   interface HighSchool {
     // Team-compatible fields
     id, name, prefecture, reputation, players, lineup, facilities
     
     // HighSchool-specific
     simulationTier: 'full'|'standard'|'minimal'
     coachStyle: CoachStyle
     yearResults: YearResults
     _summary: TeamSummary | null  // Cache
   }
   ```

2. **MiddleSchoolPlayer** (Junior high students)
   ```typescript
   interface MiddleSchoolPlayer {
     id, firstName, lastName
     middleSchoolGrade: 1|2|3
     middleSchoolName, prefecture
     currentStats: PlayerStats
     targetSchoolId: string | null  // Where they're going
     scoutedBy: string[]
   }
   ```

3. **YearResults**
   ```typescript
   interface YearResults {
     summerBestRound: number
     autumnBestRound: number
     koshienAppearance: boolean
     koshienBestRound: number
     proPlayersDrafted: number
   }
   ```

4. **SeasonState**
   ```typescript
   type SeasonPhase =
     | 'spring_practice'
     | 'summer_tournament'
     | 'koshien'
     | 'post_summer'
     | 'autumn_tournament'
     | 'off_season'
     | 'pre_season';
   ```

5. **ScoutState**
   ```typescript
   interface ScoutState {
     watchList: string[]
     scoutReports: Map<string, ScoutReport>
     recruitAttempts: Map<string, RecruitResult>
     monthlyScoutBudget: number  // 3-5 visits
     usedScoutThisMonth: number
   }
   ```

6. **WorldState** (Main container)
   ```typescript
   interface WorldState {
     version, seed, currentDate
     playerSchoolId, manager, settings, weeklyPlan
     prefecture, schools: HighSchool[], middleSchoolPool
     personRegistry: PersonRegistry
     activeTournament?: TournamentBracket | null
     tournamentHistory?: TournamentBracket[]
     seasonState: SeasonState
     scoutState: ScoutState
   }
   ```

---

### 6. **src/engine/world/world-ticker.ts** (300+ lines, partial read)

**Purpose**: Advance the world by 1 day, process all schools/players, generate news

**Key Exports**:

1. **WorldDayResult** interface
   ```typescript
   interface WorldDayResult {
     date: GameDate
     playerSchoolResult: DayResult          // Phase 1 result
     playerMatchResult?: MatchResult | null // Match result (Phase 4.1+)
     playerMatchOpponent?: string | null
     playerMatchSide?: 'home'|'away'|null
     playerMatchInnings?: InningResult[]    // Phase 6+
     worldNews: WorldNewsItem[]
     seasonTransition: SeasonPhase | null
   }
   ```

2. **WorldNewsItem**
   ```typescript
   interface WorldNewsItem {
     type: 'tournament_result'|'upset'|'no_hitter'|'record'|'draft'|'injury'
     headline: string
     involvedSchoolIds: string[]
     involvedPlayerIds: string[]
     importance: 'high'|'medium'|'low'
   }
   ```

3. **advanceWorldDay(worldState, menuId, rng)**
   - Process player school (Tier 1 - full simulation)
   - Process other schools (Tier 2 or 3 - batch/bulk growth)
   - Process middle school players
   - Generate daily news
   - Check season transitions
   - Return: { nextWorld: WorldState, result: WorldDayResult }

4. **Tier-based processing**:
   - **Tier 1 (Full)**: Player school only - uses processDay() from Phase 1
   - **Tier 2 (Standard)**: Other schools - batch growth calculation
   - **Tier 3 (Minimal)**: Distant schools - weekly bulk growth (Sundays only)

5. **computeSeasonPhase(date)**: Date → SeasonPhase
   - 4/1–7/9: spring_practice
   - 7/10–7/30: summer_tournament
   - 7/31–9/14: post_summer
   - 9/15–10/14: autumn_tournament
   - 10/15–1/31: off_season
   - 2/1–3/31: pre_season

6. **getDayOfWeek(date)**: 0=Sun, 1=Mon, ..., 6=Sat

---

### 7. **src/engine/world/tournament-bracket.ts** (300+ lines, partial read)

**Purpose**: Tournament bracket structure and simulation

**Key Types**:

1. **TournamentType** = 'summer' | 'autumn' | 'koshien'

2. **TournamentMatch**
   ```typescript
   interface TournamentMatch {
     matchId: string
     round: number
     matchIndex: number
     homeSchoolId: string | null
     awaySchoolId: string | null
     winnerId: string | null
     homeScore: number | null
     awayScore: number | null
     isBye: boolean
     isUpset: boolean
   }
   ```

3. **TournamentBracket**
   ```typescript
   interface TournamentBracket {
     id: string
     type: TournamentType
     year: number
     totalTeams: number  // 48
     rounds: TournamentRound[]  // 6 rounds
     isCompleted: boolean
     champion: string | null
   }
   ```

**Tournament Structure**:
- 48 schools
- 6 rounds
- Seeding: Top 16 by reputation get byes to round 2
- Round 1: 32 schools → 16 matches → 16 winners
- Round 2: 16 winners + 16 seeded = 32 schools → 16 matches
- Rounds 3-6: 8 → 4 → 2 → 1 (Final)

**Functions**:

1. **createTournamentBracket(id, type, year, schools, rng)**
   - Sorts schools by reputation + light shuffle
   - Creates empty match slots
   - Returns incomplete bracket (no winners yet)

2. **simulateTournamentRound(bracket, roundNumber, schools, rng)**
   - Simulates all matches in given round
   - Calculates win probability based on reputation difference
   - Generates scores
   - Propagates winners to next round
   - Returns updated bracket

3. **simulateFullTournament(bracket, schools, rng)**
   - Calls simulateTournamentRound() for each round sequentially
   - Returns completed bracket with champion

4. **getRoundName(round, totalRounds)**: Generates round name
   - "決勝" (Final)
   - "準決勝" (Semifinals)
   - "準々決勝（ベスト8）" (Quarterfinals)
   - etc.

---

### 8. **src/ui/projectors/view-state-types.ts** (439 lines)

**Purpose**: All ViewState interfaces for UI rendering (read-only projections)

**Key ViewState Types**:

1. **HomeViewState**
   - date, team, seasonPhase, seasonPhaseLabel
   - recentNews, upcomingSchedule
   - scoutBudgetRemaining, scoutBudgetTotal
   - todayTask, featuredPlayers
   - isTournamentDay, isInTournamentSeason

2. **TeamViewState**
   - schoolName, prefecture, reputation, reputationLabel
   - totalStrength, pitchingStrength, battingStrength, defenseStrength
   - players: PlayerRowView[], lineup, grade counts

3. **PlayerDetailViewState**
   - Full player profile (name, position, stats)
   - baseStats, battingStats, pitchingStats (with rank/bar)
   - condition (fatigue, injury, mood)
   - battingRecord, pitchingRecord

4. **ScoutViewState**
   - watchList: WatchListPlayerView[]
   - scoutReports: ScoutReportView[]
   - budgetRemaining, budgetTotal, budgetUsed
   - searchResults: ProspectSearchResultView[]

5. **TournamentViewState**
   - seasonPhase, seasonPhaseLabel, currentYear
   - yearResults (summer/autumn best round, Koshien appearance)
   - activeBracket: TournamentBracketView | null
   - historyBrackets: TournamentBracketView[]
   - placeholder text

6. **ResultsViewState**
   - recentResults: ScoreboardView[]
   - seasonRecord (wins/losses/draws)

7. **OBViewState**
   - graduates: OBPlayerView[]
   - Counts: totalGraduates, proCount, universityCount, etc.

---

### 9. **src/ui/projectors/tournamentProjector.ts** (160 lines)

**Purpose**: Convert TournamentBracket → TournamentViewState

**Main Function: projectTournament(worldState)**

**Logic**:
1. Build school name map for quick lookup
2. Project active tournament (if exists)
3. Project history (last 5, reversed)
4. Calculate player school's best round
5. Determine if player school won
6. Return TournamentViewState with placeholder text

---

### 10. **src/app/layout.tsx** (25 lines)

**Purpose**: Root layout for Next.js 14

```typescript
export const metadata = {
  title: "甲子園への道 — 高校野球シミュレーション",
  description: "高校野球シミュレーションゲーム..."
};
```

---

### 11. **src/app/save/SaveLoadPanel.tsx** (370 lines)

**Purpose**: Modal/overlay for save/load functionality

**Features**:
1. **Tab System**: Save / Load tabs
2. **Slot Cards**:
   - 3 manual slots (SLOT_1, SLOT_2, SLOT_3)
   - 3 auto slots (AUTO_YEAR, AUTO_MONTHLY, PRE_TOURNAMENT) — read-only

3. **Confirmation Dialogs**:
   - Save confirmation (with overwrite warning)
   - Load confirmation (warns current progress lost)
   - Delete confirmation (warns non-reversible)

4. **Metadata Display** (if save exists):
   - School name, manager name
   - Game date, season phase
   - Win rate, saved timestamp

5. **Storage Usage Bar**:
   - Shows KB / 4MB used
   - Warns if >75% full

**Modal Structure**:
```
Overlay (click to close)
  → Panel (stopPropagation)
     → panelHeader (title + close button)
     → tabs (Save / Load)
     → body
        → message (success/error/warning)
        → slot cards
        → auto slot section
        → storage bar
     → ConfirmDialog (conditional)
```

**State Management**:
```typescript
const [tab, setTab] = useState<'save'|'load'>('save');
const [saves, setSaves] = useState<WorldSaveSlotMeta[]>([]);
const [message, setMessage] = useState<...>();
const [confirm, setConfirm] = useState<...>();
const [storageBytes, setStorageBytes] = useState(0);
```

---

### 12. **src/stores/game-store.ts** (200+ lines, partial read)

**Purpose**: Legacy Zustand store for Phase 1/2 GameState (still used, parallel to world-store)

**Similar to world-store but for smaller GameState**

---

### 13. **src/engine/calendar/game-calendar.ts** (127 lines)

**Purpose**: Calendar utilities and date arithmetic

**Functions**:
1. **createGameDate(year, month, day)**: Validates and returns GameDate
2. **getDaysInMonth(year, month)**: 28-31 days (no leap year)
3. **advanceDate(date)**: Increment date by 1 day
4. **compareDates(a, b)**: Returns -1/0/1
5. **dateDiffDays(from, to)**: Days between
6. **formatDate(date)**: "Year X月Y日" format
7. **getGrade(enrollmentYear, currentYear)**: Returns 1/2/3 or null
8. **getDayType(date, schedule)**: Returns DayType
   - 'ceremony_day' (enrollment/graduation)
   - 'tournament_day' (matches)
   - 'camp_day' (training camps)
   - 'off_day' (December-January, rest)
   - 'school_day' (normal)

---

## State Management

### Architecture: Zustand (React hooks)

```
Browser UI (React Components)
        ↓
Zustand Store (world-store.ts / game-store.ts)
        ↓
Pure ViewState Projectors (homeProjector.ts, etc.)
        ↓
World Engine (world-ticker.ts, tournament-bracket.ts, etc.)
        ↓
Persistence Layer (IndexedDB via save-manager.ts)
```

### Key Store: world-store.ts

**State**:
- `worldState`: Current game state (or null)
- `recentResults`: Last 30 days of WorldDayResult
- `recentNews`: Last 20 news items

**Actions** (all sync, mutations happen in set()):
- `newWorldGame()`: Init
- `advanceDay(menuId)`: 1 day
- `advanceWeek(menuId)`: 7 days
- ViewState getters (pure functions)
- Scout actions
- Save/Load actions
- Tournament actions

**Integration with UI**:
```typescript
// In page.tsx
const advanceDay = useWorldStore((s) => s.advanceDay);
const getHomeView = useWorldStore((s) => s.getHomeView);

// Handler
const handleAdvanceDay = () => {
  advanceDay(selectedMenu);  // Mutates store
  // Component re-renders via React hook
};
```

---

## Key Data Flow

### 1. Game Initialization

```
User fills SetupScreen → newWorldGame(config)
  ↓
Zustand: newWorldGame()
  ├─ Generate 23 players
  ├─ Create team
  ├─ Create manager
  ├─ Call createWorldState()
  └─ set({ worldState, isLoading: false })
  ↓
HomeContent re-renders (gets worldState from hook)
  ↓
getHomeView() → projectHome(worldState)
  ↓
Rendered UI
```

### 2. Single Day Progression

```
User selects menu, clicks "練習して1日進む"
  ↓
advanceDay(menuId)
  ├─ Get current worldState
  ├─ Create RNG from seed + date
  ├─ Call advanceWorldDay()
  │   ├─ Process player school (Tier 1)
  │   ├─ Process other schools (Tier 2/3)
  │   ├─ Process middle school pool
  │   └─ Generate news
  ├─ Accumulate recentResults (max 30)
  ├─ Accumulate recentNews (max 20)
  ├─ set({ worldState: nextWorld, ... })
  └─ Return WorldDayResult
  ↓
UI component's handlers update their state
  ↓
Re-render shows new date, team power, etc.
```

### 3. Tournament Flow

```
User clicks "夏大会を開始" on tournament page
  ↓
startTournament('summer')
  ├─ Get current worldState
  ├─ Create tournament ID
  ├─ Create RNG
  ├─ Call createTournamentBracket()
  │   ├─ Sort schools by reputation
  │   ├─ Seed top 16
  │   └─ Create empty match slots
  ├─ set({ worldState: { ...worldState, activeTournament: bracket } })
  └─ No simulation yet (awaits user action)
  ↓
User clicks "大会を全試合シミュレート"
  ↓
simulateTournament()
  ├─ For each round (1-6):
  │   └─ simulateTournamentRound()
  │       ├─ Simulate all matches
  │       ├─ Generate scores
  │       └─ Propagate winners
  ├─ Store completed bracket + history
  └─ set({ worldState: {..., activeTournament: completed, tournamentHistory: [...]} })
  ↓
BracketView displays completed bracket
```

### 4. News Generation

After advanceDay(), worldNews generated based on:
- Tournament upsets
- Player records (no-hitters, etc.)
- Draft news
- Injury news
- OB achievements

News items have:
- type, headline, involvedSchoolIds, involvedPlayerIds, importance
- Importance determined by event significance
- UI displays icons based on type

---

## UI/Navigation Architecture

### Navigation Bar (Persistent)

Located in both home and tournament pages:
```
<nav className={styles.nav}>
  ├─ ホーム (/)
  ├─ チーム (/team)
  ├─ ニュース (/news)
  ├─ スカウト (/scout)
  ├─ 大会 (/tournament)
  ├─ 試合結果 (/results)
  └─ OB (/ob)
</nav>
```

**Styling**: Light transparent background with hover effects

### Header Bar

Shows:
- School name (left)
- Current date, season phase (right)
- Save/Load buttons (right, small)

```
<header className={styles.header}>
  <span>School Name</span>
  <div>
    <button>💾 セーブ</button>
    <button>📂 ロード</button>
  </div>
</header>
```

---

## Modal & Dialog Implementation

### SaveLoadPanel (Overlay Modal)

**Structure**:
```
<div className={styles.overlay} onClick={onClose}>
  <div className={styles.panel} onClick={e => e.stopPropagation()}>
    {/* Tab header */}
    {/* Slot cards */}
    {/* Confirmation dialogs */}
  </div>
</div>
```

**CSS Approach**:
- Overlay: fixed, fullscreen, semi-transparent
- Panel: centered, white background, shadow
- Click outside closes
- Dialogs layer on top of panel

**Confirmation Dialog**:
```typescript
<ConfirmDialog
  title="..."
  message="..."
  onConfirm={() => {...}}
  onCancel={() => setConfirm(null)}
/>
```

Rendered conditionally: `{confirm && <ConfirmDialog ... />}`

---

## World Progression System

### Season Phases (per year)

```
4/1–7/9         spring_practice      (練習期間)
7/10–7/30       summer_tournament    (夏の大会)
7/31–9/14       post_summer          (夏以降練習)
9/15–10/14      autumn_tournament    (秋の大会)
10/15–1/31      off_season           (オフシーズン)
2/1–3/31        pre_season           (始動期間)
```

**Special**: koshien phase during summer (August?)

### Daily Processing (advanceWorldDay)

1. **Player School (Tier 1 - Full)**
   - Uses `processDay()` from Phase 1
   - Practice menu applied
   - Growth calculation
   - Match simulation (if scheduled)
   - Detailed stats

2. **Other Schools (Tier 2/3)**
   - Batch or bulk growth
   - No match details
   - Simple stat progression

3. **Middle School Pool**
   - Weekly growth (Sundays only for Tier 3)
   - Growth multiplier by grade (1st < 2nd < 3rd)

4. **News Generation**
   - Check for upsets (high-reputation loss to low)
   - Check records (no-hitters, etc.)
   - Check tournaments
   - Determine importance

5. **Season Check**
   - If date enters new phase, `seasonTransition` is set
   - UI can react (display banner, etc.)

---

## Tournament System

### 48-School Structure

**Seeding**:
- Top 16 schools (by reputation) → 2-round bye (enter round 2)
- Bottom 32 schools → Round 1 (16 matches)

**Bracket Layout** (6 rounds):
```
Round 1: 32 → 16 (16 matches)
Round 2: 16 seeded + 16 winners = 32 → 16 (16 matches)
Round 3: 16 → 8 (8 matches)
Round 4: 8 → 4 (4 matches)
Round 5: 4 → 2 (2 matches)
Round 6: 2 → 1 (1 match - Final)
```

### Match Simulation Logic

**Win Probability** (reputation-based):
```typescript
const repDiff = (home.reputation - away.reputation) / 100;
const homeWinProb = Math.max(0.15, Math.min(0.85, 0.5 + repDiff * 0.6));
```

**Score Generation**:
```typescript
const runDiff = Math.max(1, 1 + (winner.reputation - loser.reputation) / 30 + rng.next() * 3);
const winnerScore = loserScore + runDiff;
```

**Upset Detection**:
```typescript
const isUpset = loser.reputation - winner.reputation > 15;
```

### Bracket Display (Tournament Page)

- Horizontal scrollable grid
- 6 columns (one per round)
- Match cells show:
  - Home/away team names
  - Scores (if completed)
  - Winner highlighting
  - Red border for player school
  - 🔥 for upsets
  - "不戦勝" for byes

- Round filter tabs (all / R1 / R2 / etc.)

---

## Additional Architecture Notes

### RNG (Random Number Generator)

```typescript
const rng = createRNG(worldState.seed + ':' + dateStr);
// Used for:
// - Player generation
// - Growth calculations
// - Tournament draws
// - Match outcomes
```

Seeded for reproducibility.

### Projector Functions

All are **pure functions**:
```typescript
// homeProjector.ts
export function projectHome(worldState, recentNews): HomeViewState
```

**Pattern**:
1. Extract data from WorldState
2. Compute derived values
3. Return read-only ViewState
4. No side effects

### Data Persistence

**Save/Load** via IndexedDB:
- 3 manual slots
- 3 auto slots (year-end, monthly, pre-tournament)
- Checksum validation
- Storage usage tracking (4MB limit)

---

## Summary of Key Takeaways

### Strengths:
1. **Clear separation**: Engine (pure logic) ← → Store (state) ← → UI (projectors + components)
2. **Type safety**: All data flows through strongly-typed interfaces
3. **Seeded RNG**: Reproducible game progression
4. **Scalable**: 48 schools simulated in parallel with tiered detail levels
5. **Modular**: Each system (tournaments, scouts, news) isolated

### Main Files for Extension:
- **Day advancement**: `world-ticker.ts`
- **Tournament logic**: `tournament-bracket.ts`
- **UI display**: Projectors in `ui/projectors/`
- **New pages**: Create in `src/app/[feature]/page.tsx`

### For Adding Features:
1. Define types in `engine/types/` or `engine/world/world-state.ts`
2. Implement logic in `engine/world/` or relevant subsystem
3. Create projector in `ui/projectors/`
4. Add ViewState to `view-state-types.ts`
5. Create page or component in `src/app/` using hooks from `world-store.ts`

