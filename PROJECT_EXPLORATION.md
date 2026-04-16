# Koushien-Sim Project: Thorough Exploration Report

**Date:** 2026-04-16  
**Project:** koushien-sim (High School Baseball Simulator)  
**Location:** /home/work/.openclaw/workspace/projects/koushien-sim

---

## 1. DIRECTORY STRUCTURE OVERVIEW

### Root Level
```
koushien-sim/
├── src/                    # Source code
│   ├── app/               # Next.js App Router (UI pages)
│   ├── engine/            # Game logic, world state, simulation
│   ├── platform/          # Storage adapters, platform abstractions
│   ├── stores/            # Zustand state management
│   └── ui/                # UI projection/view models
├── tests/                 # Test files (vitest)
├── public/                # Static assets
├── scripts/               # Utility scripts
├── node_modules/          # Dependencies
├── .next/                 # Next.js build output
└── [config files]         # tsconfig.json, next.config.ts, vitest.config.ts, etc.
```

### Source Code Structure (src/)
```
src/
├── app/                   # Next.js App Router Pages & Layouts
│   ├── page.tsx           # HOME PAGE (Entry point)
│   ├── page.module.css    # Home page styles
│   ├── layout.tsx         # Root layout wrapper
│   ├── layout.module.css  # Layout styles (header, nav, card patterns)
│   ├── globals.css        # Global CSS variables & resets
│   ├── favicon.ico
│   ├── save/              # Save/Load UI
│   │   ├── SaveLoadPanel.tsx
│   │   └── SaveLoadPanel.module.css
│   ├── team/              # Team roster page
│   │   ├── page.tsx
│   │   ├── page.module.css
│   │   └── [playerId]/    # Individual player detail page
│   │       ├── page.tsx
│   │       └── page.module.css
│   ├── scout/             # Scout/Recruitment page
│   │   ├── page.tsx
│   │   └── page.module.css
│   ├── tournament/        # Tournament bracket page
│   │   ├── page.tsx
│   │   └── page.module.css
│   ├── results/           # Match results page
│   │   ├── page.tsx
│   │   └── page.module.css
│   └── ob/                # OB/Graduates page
│       ├── page.tsx
│       └── page.module.css
│
├── engine/                # Game simulation engine
│   ├── calendar/          # Game calendar & day processor
│   │   ├── day-processor.ts
│   │   ├── game-calendar.ts
│   │   ├── schedule.ts
│   │   └── index.ts
│   ├── match/             # Baseball match simulation
│   │   ├── game.ts
│   │   ├── at-bat.ts
│   │   ├── pitch/         # Pitch-level mechanics
│   │   ├── tactics.ts
│   │   ├── result.ts
│   │   └── constants.ts
│   ├── world/             # World state & season management
│   │   ├── world-state.ts
│   │   ├── create-world.ts
│   │   ├── world-ticker.ts
│   │   ├── year-transition.ts
│   │   ├── tournament-bracket.ts
│   │   ├── scout/         # Scout system
│   │   ├── person-state.ts
│   │   ├── school-generator.ts
│   │   └── [other world modules]
│   ├── save/              # Save/Load management
│   │   ├── world-save-manager.ts   # Main save API
│   │   ├── world-serializer.ts     # WorldState serialization
│   │   ├── save-manager.ts
│   │   ├── serializer.ts
│   │   └── index.ts
│   ├── growth/            # Player growth mechanics
│   │   ├── calculate.ts
│   │   ├── batch-growth.ts
│   │   ├── constants.ts
│   │   └── [other growth modules]
│   ├── types/             # TypeScript type definitions
│   │   ├── player.ts
│   │   ├── team.ts
│   │   ├── game-state.ts
│   │   ├── calendar.ts
│   │   └── index.ts
│   ├── player/            # Player generation & data
│   │   ├── generate.ts
│   │   ├── name-dict.ts
│   │   └── index.ts
│   ├── team/              # Team roster & lineup
│   │   ├── roster.ts
│   │   ├── lineup.ts
│   │   ├── enrollment.ts
│   │   └── index.ts
│   ├── core/              # Core utilities
│   │   ├── rng.ts         # RNG implementation
│   │   ├── id.ts
│   │   └── index.ts
│   ├── shared/            # Shared utilities
│   │   ├── stat-utils.ts
│   │   └── index.ts
│   └── index.ts
│
├── stores/                # Zustand state management
│   ├── world-store.ts     # Main world state store
│   └── game-store.ts
│
├── ui/                    # UI projection/view models
│   ├── projectors/        # View state builders (for rendering)
│   │   ├── view-state-types.ts
│   │   ├── homeProjector.ts
│   │   └── [other projectors]
│   └── [UI utilities]
│
└── platform/              # Platform abstraction layer
    ├── storage/           # Storage adapters
    │   ├── memory.ts
    │   └── local-storage.ts
    └── index.ts
```

---

## 2. ALL PAGE FILES IN src/app/

### Page Files Identified: 7 pages

| Path | Component | Purpose |
|------|-----------|---------|
| `src/app/page.tsx` | HomePage | Main home/dashboard (setup + game progress) |
| `src/app/team/page.tsx` | TeamPage | Roster, lineup, player stats |
| `src/app/team/[playerId]/page.tsx` | PlayerDetailPage | Individual player profile |
| `src/app/scout/page.tsx` | ScoutPage | Recruitment/scouting interface |
| `src/app/tournament/page.tsx` | TournamentPage | Tournament bracket & info |
| `src/app/results/page.tsx` | ResultsPage | Match history & results |
| `src/app/ob/page.tsx` | OBPage | OB/graduated players list |

**Navigation Structure:**
- All pages have consistent header (team name, date, phase) + navigation bar
- Navigation links: ホーム / チーム / スカウト / 大会 / 試合結果 / OB
- Home page has an additional save/load button in header

---

## 3. CSS MODULE FILES

### Total CSS Module Files: 9

| File | Page/Component | Purpose |
|------|----------------|---------|
| `src/app/page.module.css` | Home page | Grid layout, cards, setup screen, today's task |
| `src/app/layout.module.css` | Layout wrapper | Reusable layout components (header, nav, card) |
| `src/app/team/page.module.css` | Team page | Stats grid, player table, lineup display |
| `src/app/team/[playerId]/page.module.css` | Player detail | Player profile, stat cards |
| `src/app/scout/page.module.css` | Scout page | Budget bar, player grid, recruit cards |
| `src/app/tournament/page.module.css` | Tournament page | Bracket display, match info |
| `src/app/results/page.module.css` | Results page | Match result list, stats |
| `src/app/ob/page.module.css` | OB page | Graduate player list |
| `src/app/save/SaveLoadPanel.module.css` | Save/Load modal | Modal overlay, slot cards, buttons |

### CSS Variable System (globals.css)

**Color Palette (Japanese traditional):**
```css
--color-bg:        #f5f0e8;   /* Washi paper (和紙) */
--color-surface:   #fffdf7;   /* Light washi */
--color-border:    #c8b99a;   /* Dry grass (枯草) */
--color-primary:   #8b0000;   /* Crimson/Maroon (えんじ) */
--color-accent:    #2d4a3e;   /* Deep green (深緑) */
--color-text:      #2c2014;   /* Ink black (墨) */
--color-text-sub:  #6b5a4a;   /* Light ink (薄墨) */

/* Rank colors */
--color-rank-s:    #b8860b;   /* Gold */
--color-rank-a:    #8b0000;   /* Crimson */
--color-rank-b:    #2d4a3e;   /* Deep green */
--color-rank-c:    #6b5a4a;   /* Light ink */
--color-rank-d:    #999;
--color-rank-e:    #bbb;
```

**Fonts:**
```css
--font-serif:  'Noto Serif JP', 'Yu Mincho', serif;
--font-sans:   'Noto Sans JP', 'Yu Gothic', sans-serif;
```

---

## 4. KEY FILES CONTENT SUMMARY

### 4.1 src/app/layout.tsx
- **Type:** Root layout component
- **Content:** Metadata setup (title: "甲子園シミュレーター"), HTML/body wrapper
- **Language:** Japanese ("高校野球シミュレーションゲーム")
- **Child render:** `{children}` only

### 4.2 src/app/page.tsx (HOME PAGE - Full Content)

**Purpose:** Main game interface - home dashboard with setup, game progress, team info

**Key Sections:**
1. **SetupScreen:** Initial game creation form
   - School name input (default: "桜葉高校")
   - Prefecture input (default: "新潟")
   - Manager name input (default: "監督")
   - Start button triggers `newWorldGame()`

2. **HomeContent:** Main game interface
   - Header: School name, date, phase badge, Save/Load buttons
   - Navigation bar: Links to all 6 pages
   - Tournament banner (conditional, shown during tournament season)
   
3. **Main Content Cards (2-column grid on desktop):**
   - **Today's Task Card** (full-width):
     - Shows task type: 試合 (match), 休養 (off), スカウト (scout), or 練習 (practice)
     - Practice menu selector dropdown
     - Buttons: "練習して1日進む" (advance 1 day), "1週間まとめて進む" (advance 1 week)
   
   - **Team Overview Card:**
     - Total team strength, player count
     - Ace pitcher info & rating
     - Batting anchor (4番) info & rating
   
   - **Featured Players Card:**
     - Top players with rank badges (S/A/B/C)
     - Overall rating, reason for feature
   
   - **Upcoming Schedule Card:**
     - Next 5-6 scheduled events with dates
   
   - **Scout Budget Card:**
     - Monthly scouting budget remaining
     - Visual dot display (used vs free)
     - Link to Scout page
   
   - **Recent News Card** (full-width):
     - News items with importance level (high/medium/low)
     - Color-coded left border
     - Icons and headlines
   
   - **Quick Menu Card:**
     - Links to Team, Scout, Tournament, Results, OB pages

**State Management:**
- Uses `useWorldStore` Zustand store
- Methods: `newWorldGame`, `advanceDay`, `advanceWeek`, `getHomeView`, `saveGame`, `loadGame`

**Practice Menus (7 types):**
```typescript
[
  { id: 'batting_basic',    label: '基礎打撃練習' },
  { id: 'batting_live',     label: '実戦打撃練習' },
  { id: 'pitching_basic',   label: '投球基礎練習' },
  { id: 'pitching_bullpen', label: '投手ブルペン強化' },
  { id: 'fielding_drill',   label: '守備練習' },
  { id: 'running',          label: '走塁・体力練習' },
  { id: 'rest',             label: '休養（疲労回復）' },
]
```

### 4.3 src/app/page.module.css (HOME PAGE CSS - Full Content)

**Layout:**
- 2-column grid layout (960px max-width)
- `.main` uses `grid-template-columns: 1fr 1fr`
- Gap: 16px
- Full-width cards use `grid-column: 1 / -1`

**Key Components:**

1. **Header** (`.header`):
   - Background: `--color-primary` (crimson)
   - Flexbox layout, max-width 960px
   - Title + meta info (date, phase, save/load buttons)

2. **Navigation** (`.nav`):
   - Background: `--color-accent` (deep green)
   - Inline navigation links
   - Active link has lighter background

3. **Cards** (`.card`):
   - Background: `--color-surface`
   - 1px border in `--color-border`
   - Padding: 16px
   - Title with bottom border

4. **Today's Task Card** (`.todayCard`):
   - Left border: 3px in primary color
   - Task badges: Practice (primary), Match (red #c00020), Off (gray #666), Scout (accent)
   - Menu dropdown + button row

5. **Team Grid** (`.teamGrid`):
   - `grid-template-columns: auto 1fr` for label/value pairs
   - Overall strength in large serif font (22px)

6. **Featured Players** (`.featuredList`):
   - Links with rank badges (S/A/B/C)
   - Hover background effect
   - Rank colors match color variables

7. **News Items** (`.newsList`):
   - 3px left border indicating importance
   - High (primary), Medium (accent), Low (border color)

8. **Budget Bar** (`.budgetBar`):
   - Dot visualization (12px circles)
   - Used dots filled with primary color
   - Free dots transparent

9. **Setup Screen** (`.setupScreen`):
   - Max-width: 420px, centered at 80px top margin
   - Form inputs with focus state
   - Submit button styled as primary

**NO MEDIA QUERIES** — Currently desktop-only

---

## 5. NAVIGATION COMPONENT

**Navigation Pattern (found in all pages):**

```tsx
<nav className={styles.nav}>
  <div className={styles.navInner}>
    <Link href="/" className={styles.navLink}>ホーム</Link>
    <Link href="/team" className={styles.navLink}>チーム</Link>
    <Link href="/scout" className={styles.navLink}>スカウト</Link>
    <Link href="/tournament" className={styles.navLink}>大会</Link>
    <Link href="/results" className={styles.navLink}>試合結果</Link>
    <Link href="/ob" className={styles.navLink}>OB</Link>
  </div>
</nav>
```

**Dynamic Active State:**
```tsx
className={`${styles.navLink} ${currentPage === 'team' ? styles.navLinkActive : ''}`}
```

**Styling** (from layout.module.css):
- `.navLink`: White text, 13px, 8px top/bottom padding, 16px left/right
- `.navLink:hover`: Light background (rgba 0.12), white text
- `.navLinkActive`: More opaque background (rgba 0.2), bold, white text

---

## 6. src/app/layout.module.css (LAYOUT CSS - Full Content)

**Purpose:** Reusable layout component styles used across pages

**Components:**

1. **Wrapper** (`.wrapper`):
   - Max-width: 960px
   - Centered with `margin: 0 auto`
   - Padding: 0 16px

2. **Header** (`.header`):
   - Sticky positioning (`position: sticky`, `top: 0`, `z-index: 100`)
   - Background: `--color-primary` (crimson)
   - White text
   - Padding: 10px 16px

3. **Header Inner** (`.headerInner`):
   - Flexbox with space-between
   - Gap: 16px
   - Title + date on right

4. **Navigation** (`.nav`):
   - Background: `--color-accent` (deep green)
   - Flexbox with no gap (tight)

5. **Main Content** (`.main`):
   - Max-width: 960px
   - Padding: 20px 16px
   - Margin: 0 auto

6. **Card System** (`.card`, `.cardTitle`):
   - Surface color background
   - Border & border-radius
   - Consistent padding (16px)
   - Title with bottom border, serif font, primary color

7. **Button Variants** (`.btn`, `.btnPrimary`, `.btnAccent`, `.btnOutline`):
   - `.btn`: Base styles (border-radius, padding, opacity transition)
   - `.btnPrimary`: Primary color background
   - `.btnAccent`: Accent color background
   - `.btnOutline`: Transparent with border

8. **Rank Badges** (`.rankS` through `.rankE`):
   - Color-coded text (using rank color variables)
   - Bold for S/A

9. **News Importance** (`.newsHigh`, `.newsMedium`, `.newsLow`):
   - 3px left border in respective colors

---

## 7. src/app/save/SaveLoadPanel.tsx (SAVE/LOAD COMPONENT - Full Content)

**Purpose:** Modal UI for saving and loading game state

**Slot Configuration:**

Manual Slots:
- `WORLD_SAVE_SLOTS.SLOT_1` ("スロット 1")
- `WORLD_SAVE_SLOTS.SLOT_2` ("スロット 2")
- `WORLD_SAVE_SLOTS.SLOT_3` ("スロット 3")

Auto Slots (read-only):
- `AUTO_YEAR`: "年度終了前 自動保護" (Year-end protected auto-save)
- `AUTO_MONTHLY`: "月次 自動セーブ" (Monthly auto-save)
- `PRE_TOURNAMENT`: "大会前 自動セーブ" (Pre-tournament auto-save)

**Subcomponents:**

1. **SlotCard:**
   - Shows slot icon (💾 if saved, 📂 if empty)
   - Slot name + metadata (school, manager, date, win rate, timestamp)
   - Action buttons (Save/Load/Delete based on mode)
   - Read-only indicator for auto slots

2. **ConfirmDialog:**
   - Overlay with centered dialog
   - Title + message
   - Confirm/Cancel buttons
   - Used for: save overwrite, load confirmation, delete confirmation

**Main Features:**
- Tab interface: "💾 セーブ" and "📂 ロード"
- Message display (success/error/warning)
- Storage usage bar (4MB limit)
- Auto-save section clearly separated
- Responsive modal (min 560px, max 96vw)

**State Hooks:**
- `useWorldStore`: `saveGame`, `loadGame`, `deleteSave`, `listSaves`, `getStorageUsage`
- Message feedback system
- Confirmation dialog system

---

## 8. src/app/save/SaveLoadPanel.module.css (SAVE/LOAD CSS - Key Styles)

**Modal Design:**
```css
.overlay {
  position: fixed;
  inset: 0;              /* Covers full screen */
  background: rgba(0,0,0,0.55);
  z-index: 1000;
}

.panel {
  width: min(560px, 96vw);  /* Responsive width */
  max-height: 90vh;
  overflow-y: auto;
}
```

**Slot Card** (`.slotCard`):
- Flexbox layout: icon | info | actions
- Hover background change
- Meta text in small gray font (11px)

**Buttons:**
- `.btnPrimary`: Primary color (save)
- `.btnAccent`: Accent color (load)
- `.btnDanger`: Red text on transparent (delete)
- `.btnGhost`: Transparent with border (cancel)

**Messages:**
- `.messageSuccess`: Green background, green border
- `.messageError`: Light red background
- `.messageWarning`: Yellow background

**Storage Bar:**
- Horizontal fill bar (4px height)
- Warning color (orange) above 75% usage

---

## 9. CSS: RESPONSIVE DESIGN STATUS

**Current State:** ⚠️ **NO MEDIA QUERIES**

Checked files:
- `src/app/page.module.css`: No @media rules
- `src/app/layout.module.css`: No @media rules
- `src/app/save/SaveLoadPanel.module.css`: No @media rules
- `src/app/team/page.module.css`: No @media rules
- `src/app/scout/page.module.css`: No @media rules

**Current Breakpoints:**
- None implemented
- Fixed max-width: 960px on all containers
- Relative sizing (16px padding, flex wrapping)
- Mobile will likely require horizontal scrolling or overflow issues

---

## 10. src/engine/save/ DIRECTORY

### Files:
1. **world-save-manager.ts** (359 lines)
   - Main save/load API for WorldState
   - localStorage-based persistence
   - 3 manual slots + 3 auto slots

2. **world-serializer.ts** (146 lines)
   - Converts WorldState to/from JSON
   - Handles Map↔object conversion (for Scout state, person registry)
   - SHA-256 checksum computation (Web Crypto API with DJB2 fallback)

3. **save-manager.ts** (3311 bytes)
   - Lower-level save manager

4. **serializer.ts** (2151 bytes)
   - Lower-level serialization

5. **index.ts** (62 bytes)
   - Module exports

### world-save-manager.ts Details

**Constants:**
```typescript
WORLD_SAVE_VERSION = '6.0.0'

WORLD_SAVE_SLOTS = {
  SLOT_1: 'world_slot_1',
  SLOT_2: 'world_slot_2',
  SLOT_3: 'world_slot_3',
  AUTO_YEAR: 'world_auto_year',           // Year-end protected
  AUTO_MONTHLY: 'world_auto_monthly',     // Monthly rotation
  PRE_TOURNAMENT: 'world_pre_tournament', // Tournament prep
}
```

**WorldSaveSlotMeta Interface:**
```typescript
{
  slotId: WorldSaveSlotId
  displayName: string
  schoolName: string
  managerName: string
  currentDate: { year, month, day }
  seasonPhase: string
  winRate: string        // "夏Xレ秋Yレ" format
  savedAt: number        // Unix timestamp
  version: string
  isProtected: boolean   // Read-only for auto slots
}
```

**Public Functions:**
- `saveWorldState(slotId, world, displayName)` → Promise<WorldSaveResult>
- `autoSaveYearEnd(world)` → Protected year-end save
- `autoSaveMonthly(world)` → Monthly rotation save
- `autoSavePreTournament(world)` → Tournament prep save
- `loadWorldState(slotId)` → Promise<WorldLoadResult>
- `deleteWorldSave(slotId)` → void
- `listWorldSaves()` → WorldSaveSlotMeta[]
- `getWorldSaveMeta(slotId)` → WorldSaveSlotMeta | null
- `getStorageUsedBytes()` → number
- `clearAllWorldSaves()` → void (debug)

**Storage Details:**
- Uses browser `localStorage`
- SSR-safe checks (typeof window check)
- Key prefix: `'koushien_save_'`
- Meta list key: `'koushien_save_meta_list'`
- 4MB warning threshold
- Checksum validation on load

---

## 11. tests/engine/save/ DIRECTORY

### Files:
1. **save.test.ts** (147 lines)
   - Tests for serializer, save manager, round-trip save/load
   - Memory storage adapter tests
   - Export/import functionality tests

2. **phase6/** subdirectory
   - Phase 6 specific save tests

### Test Coverage (save.test.ts):
- Serialize/deserialize round-trip
- Validation of save data
- Save/load to slots
- Save deletion
- List saves
- Auto-save functionality
- Export/import cycle

---

## 12. GLOBAL CSS ANALYSIS (src/app/globals.css)

**Color System (Japanese Traditional Palette):**
```css
/* Backgrounds */
--color-bg:        #f5f0e8;   /* Washi paper */
--color-surface:   #fffdf7;   /* Light washi */

/* Borders & Text */
--color-border:    #c8b99a;   /* Dry grass */
--color-text:      #2c2014;   /* Ink black */
--color-text-sub:  #6b5a4a;   /* Light ink */

/* UI Colors */
--color-primary:   #8b0000;   /* Crimson (えんじ) */
--color-accent:    #2d4a3e;   /* Deep green */

/* Rank Colors */
--color-rank-s:    #b8860b;   /* Gold (highest) */
--color-rank-a:    #8b0000;   /* Crimson */
--color-rank-b:    #2d4a3e;   /* Green */
--color-rank-c:    #6b5a4a;   /* Gray */
--color-rank-d:    #999;
--color-rank-e:    #bbb;

/* Fonts */
--font-serif:      'Noto Serif JP', serif
--font-sans:       'Noto Sans JP', sans-serif
```

**Reset & Base:**
- `*` box-sizing: border-box, no margin/padding
- `body`: var(--font-sans), 14px, background color
- `h1,h2,h3`: serif font
- `table`: Full width, border-collapse
- `th,td`: 6px 10px padding, 1px bottom border
- `th`: Light red background, primary color text

---

## 13. STORES DIRECTORY ANALYSIS

### Files in src/stores/:

1. **world-store.ts** (14,156 bytes)
   - Main Zustand store for game state
   - Manages: world state, save/load, day/week advancement
   - Methods like: `newWorldGame()`, `advanceDay()`, `advanceWeek()`, `saveGame()`, `loadGame()`

2. **game-store.ts** (6,651 bytes)
   - Secondary game store (legacy or game-specific)

---

## 14. README.md CONTENT

**Summary:** Default Next.js boilerplate README
- Getting started: npm run dev
- Port: localhost:3000
- Technology: Next.js with create-next-app
- Generic docs links

**Note:** This is the default README — project-specific documentation is in other markdown files (CODEBASE_GUIDE.md, PHASE6_REPORT.md, etc.)

---

## 15. DESKTOP-FIRST GRID LAYOUTS

### page.module.css
```css
.main {
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
```
- 2 equal columns
- Cards naturally stack in 2-column grid
- Full-width cards use `grid-column: 1 / -1`

### team/page.module.css
```css
.statsBar {
  grid-template-columns: repeat(4, 1fr);
}
```
- 4-column stat card grid
- No responsive breakpoints

### scout/page.module.css
```css
.grid {
  grid-template-columns: 1fr 1fr;
}
```
- 2-column grid for sections

**Problem:** All grids are rigid. Mobile devices at 375-480px width will have severe layout issues.

---

## 16. SUMMARY OF KEY FILES

| File | Size (approx) | Purpose | Language |
|------|---------------|---------|----------|
| src/app/page.tsx | 16,594 bytes | Home page component | TSX |
| src/app/page.module.css | 8,042 bytes | Home page styles | CSS Modules |
| src/app/layout.tsx | 389 bytes | Root layout | TSX |
| src/app/layout.module.css | 2,774 bytes | Layout styles | CSS Modules |
| src/app/globals.css | 1,679 bytes | Global CSS vars | CSS |
| src/app/save/SaveLoadPanel.tsx | Full component | Save/load UI | TSX |
| src/app/save/SaveLoadPanel.module.css | 278 lines | Save modal styles | CSS Modules |
| src/engine/save/world-save-manager.ts | 359 lines | Save API | TS |
| src/engine/save/world-serializer.ts | 146 lines | Serialization | TS |
| tests/engine/save/save.test.ts | 147 lines | Save tests | TS (Vitest) |

---

## 17. COMPONENT PATTERN OBSERVATIONS

### Consistent Across All Pages:
1. **Header bar** with school name + date + phase
2. **Navigation bar** below header (6 links)
3. **Main container** with max-width 960px
4. **Card-based layout** for content sections
5. **Serif font for headings** (Japanese traditional aesthetic)
6. **Color-coded badges** (rank S/A/B/C, task type, importance)
7. **Hover effects** on interactive elements
8. **2-column grid** for main content (where applicable)

### No Cross-Page Shared Components:
- Each page has its own `page.tsx` + `page.module.css`
- No reusable component library visible in app/ directory
- Header/nav are re-implemented per page

### State Management:
- Centralized `useWorldStore` Zustand hook
- Single source of truth for game state
- Methods called directly from event handlers

---

## 18. TECHNICAL STACK SUMMARY

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js (App Router) |
| **Language** | TypeScript |
| **Styling** | CSS Modules |
| **State** | Zustand |
| **Testing** | Vitest |
| **Storage** | Browser localStorage |
| **Serialization** | JSON + custom Map handling |
| **Crypto** | Web Crypto API (SHA-256) |

---

## KEY FINDINGS

✅ **Strengths:**
- Clear separation of concerns (pages, styles, engine)
- Consistent UI pattern across all pages
- Japanese traditional aesthetic (color palette, fonts)
- Save/load system with multiple slots + auto-save
- Full TypeScript coverage
- Responsive components (flexbox, grid)
- User-friendly save/load modal

⚠️ **Gaps:**
- **NO mobile responsive design** — no @media queries anywhere
- All fixed max-widths (960px)
- 4-column grids will break on mobile
- Text at 13-14px (small on mobile)
- 2-column layouts need collapse to 1 column
- Header navigation needs hamburger menu for mobile
- Save panel at 560px width needs responsive adjustment

🔧 **Missing:**
- Media queries for tablets/mobile
- Breakpoints for 768px, 480px viewports
- Touch-friendly button sizes (currently 8-12px padding)
- Responsive nav menu
- Flexible grids with auto-columns

---

## ARCHITECTURE INSIGHTS

**Page Routing:**
- Home: `/`
- Team: `/team`, `/team/{playerId}`
- Scout: `/scout`
- Tournament: `/tournament`
- Results: `/results`
- OB: `/ob`

**Data Flow:**
1. User action on page → calls store method
2. Store method updates WorldState
3. Component re-renders with new view state
4. On save: WorldState → serialize → localStorage
5. On load: localStorage → deserialize → WorldState

**Zustand Pattern:**
```tsx
const variable = useWorldStore((s) => s.propertyOrMethod);
```

**CSS Pattern:**
- Modules import as `import styles from './page.module.css'`
- Applied as `className={styles.className}`
- Color variables via CSS custom properties
- No Tailwind or runtime CSS-in-JS

