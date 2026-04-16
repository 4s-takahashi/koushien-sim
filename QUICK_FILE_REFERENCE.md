# Koushien-Sim: Quick File Reference Guide

**Generated:** 2026-04-16 | **Project:** High School Baseball Simulator

---

## 1. HOME PAGE (src/app/page.tsx)

**16,594 bytes | Main game dashboard**

### Sections:
- **SetupScreen** (conditional): Form for initial game creation
- **HomeContent** (main): Dashboard when game is active
  - Header: School name, date, phase badge, save/load buttons
  - Navigation: 6 links to other pages
  - Tournament banner (conditional)
  - Cards in 2-column grid:
    - Today's Task (full-width): Practice selector + advance buttons
    - Team Overview: Strength, players, ace, anchor
    - Featured Players: Top 5 with rank badges
    - Upcoming Schedule: Next events
    - Scout Budget: Monthly allocation dots
    - Recent News: Color-coded importance
    - Quick Menu: Page links

### State Management:
```tsx
useWorldStore((s) => s.worldState)      // Current game state
useWorldStore((s) => s.newWorldGame)    // Start new game
useWorldStore((s) => s.advanceDay)      // Progress by 1 day
useWorldStore((s) => s.advanceWeek)     // Progress by 7 days
useWorldStore((s) => s.getHomeView)     // Get view data
```

### Practice Menus (7 types):
1. `batting_basic` — 基礎打撃練習
2. `batting_live` — 実戦打撃練習
3. `pitching_basic` — 投球基礎練習
4. `pitching_bullpen` — 投手ブルペン強化
5. `fielding_drill` — 守備練習
6. `running` — 走塁・体力練習
7. `rest` — 休養（疲労回復）

---

## 2. HOME PAGE CSS (src/app/page.module.css)

**8,042 bytes | Page-specific styles**

### Layout:
```css
.main {
  grid-template-columns: 1fr 1fr;  /* 2-column grid */
  gap: 16px;
  max-width: 960px;
}

.cardFull { grid-column: 1 / -1; }  /* Full-width cards */
```

### Color Scheme:
- Header: `--color-primary` (crimson)
- Navigation: `--color-accent` (deep green)
- Cards: `--color-surface` (light washi)

### Task Badge Colors:
```css
.taskBadgePractice { background: var(--color-primary); }  /* Primary */
.taskBadgeMatch    { background: #c00020; }               /* Red */
.taskBadgeOff      { background: #666; }                  /* Gray */
.taskBadgeScout    { background: var(--color-accent); }   /* Green */
```

### Rank Badges:
```css
.rankS { color: var(--color-rank-s); }  /* Gold #b8860b */
.rankA { color: var(--color-rank-a); }  /* Crimson */
.rankB { color: var(--color-rank-b); }  /* Green */
.rankC { color: var(--color-rank-c); }  /* Gray */
```

### ⚠️ **NO @media queries** — Desktop-only!

---

## 3. ALL PAGES (7 total)

| Route | File | Purpose |
|-------|------|---------|
| `/` | `src/app/page.tsx` | Home/dashboard |
| `/team` | `src/app/team/page.tsx` | Roster & lineup |
| `/team/:id` | `src/app/team/[playerId]/page.tsx` | Player detail |
| `/scout` | `src/app/scout/page.tsx` | Recruitment |
| `/tournament` | `src/app/tournament/page.tsx` | Tournament bracket |
| `/results` | `src/app/results/page.tsx` | Match history |
| `/ob` | `src/app/ob/page.tsx` | Graduates |

**All pages have:**
- Header with school name + date + phase
- Navigation bar (6 links)
- Main content with `max-width: 960px`
- Card-based layout with CSS modules

---

## 4. SAVE/LOAD SYSTEM

### SaveLoadPanel.tsx
**Full-screen modal for save/load operations**

### Slots (6 total):
**Manual (User-controlled):**
- `world_slot_1` — User slot 1
- `world_slot_2` — User slot 2
- `world_slot_3` — User slot 3

**Auto (System-managed, read-only):**
- `world_auto_year` — Year-end protected save
- `world_auto_monthly` — Monthly auto-save
- `world_pre_tournament` — Pre-tournament auto-save

### SaveLoadPanel.module.css
```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  z-index: 1000;
}

.panel {
  width: min(560px, 96vw);  /* Responsive! */
  max-height: 90vh;
  overflow-y: auto;
}
```

**Features:**
- Tab interface (Save/Load)
- Slot cards (icon, metadata, actions)
- Confirmation dialogs (overwrite/load/delete)
- Storage usage bar (4MB limit)

---

## 5. SAVE ENGINE (src/engine/save/)

### world-save-manager.ts
**Main save/load API (359 lines)**

#### Constants:
```typescript
WORLD_SAVE_VERSION = '6.0.0'

WORLD_SAVE_SLOTS = {
  SLOT_1: 'world_slot_1',
  SLOT_2: 'world_slot_2',
  SLOT_3: 'world_slot_3',
  AUTO_YEAR: 'world_auto_year',
  AUTO_MONTHLY: 'world_auto_monthly',
  PRE_TOURNAMENT: 'world_pre_tournament',
}
```

#### Public Functions:
```typescript
// Manual save
saveWorldState(slotId, world, displayName): Promise<WorldSaveResult>

// Auto-saves
autoSaveYearEnd(world): Promise<WorldSaveResult>
autoSaveMonthly(world): Promise<WorldSaveResult>
autoSavePreTournament(world): Promise<WorldSaveResult>

// Load/delete/list
loadWorldState(slotId): Promise<WorldLoadResult>
deleteWorldSave(slotId): void
listWorldSaves(): WorldSaveSlotMeta[]
getStorageUsedBytes(): number
```

#### WorldSaveSlotMeta:
```typescript
{
  slotId: string
  displayName: string       // "スロット 1"
  schoolName: string
  managerName: string
  currentDate: { year, month, day }
  seasonPhase: string       // "spring_practice", etc.
  winRate: string           // "夏2回戦 秋3回戦"
  savedAt: number           // Unix timestamp
  version: string           // "6.0.0"
  isProtected: boolean      // Read-only?
}
```

### world-serializer.ts
**Handles Map↔object conversion & checksums (146 lines)**

```typescript
serializeWorldState(state): string        // → JSON
deserializeWorldState(json): WorldState   // ← JSON
validateWorldSaveData(data): boolean      // Check validity
computeWorldChecksum(json): Promise<string> // SHA-256 (or DJB2 fallback)
```

### Storage Details:
- **Backend:** Browser `localStorage`
- **Key prefix:** `'koushien_save_'`
- **Meta list key:** `'koushien_save_meta_list'`
- **Size limit:** 4MB (warning threshold)
- **Checksum:** SHA-256 via Web Crypto API (fallback to DJB2)
- **SSR-safe:** Checks `typeof window`

---

## 6. GLOBAL CSS (src/app/globals.css)

**1,679 bytes | CSS variables + resets**

### Color Variables:
```css
:root {
  /* Backgrounds */
  --color-bg:        #f5f0e8;   /* Washi paper */
  --color-surface:   #fffdf7;   /* Light washi */

  /* UI Colors */
  --color-primary:   #8b0000;   /* Crimson */
  --color-accent:    #2d4a3e;   /* Deep green */
  --color-border:    #c8b99a;   /* Dry grass */

  /* Text */
  --color-text:      #2c2014;   /* Ink black */
  --color-text-sub:  #6b5a4a;   /* Light ink */

  /* Ranks */
  --color-rank-s:    #b8860b;   /* Gold */
  --color-rank-a:    #8b0000;   /* Crimson */
  --color-rank-b:    #2d4a3e;   /* Green */
  --color-rank-c:    #6b5a4a;   /* Gray */
  --color-rank-d:    #999;
  --color-rank-e:    #bbb;

  /* Fonts */
  --font-serif:      'Noto Serif JP', serif;
  --font-sans:       'Noto Sans JP', sans-serif;
}
```

### Global Resets:
```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font-sans); font-size: 14px; background: var(--color-bg); }
h1,h2,h3 { font-family: var(--font-serif); font-weight: bold; }
```

---

## 7. LAYOUT MODULE (src/app/layout.module.css)

**2,774 bytes | Reusable layout patterns**

### Common Classes:
```css
.header      /* Sticky, primary color, white text */
.nav         /* Accent color, horizontal links */
.navLink     /* 13px, padding, hover effect */
.navLinkActive /* Bold, lighter background */

.main        /* Max-width 960px, centered */

.card        /* Surface color, border, padding */
.cardTitle   /* Serif font, primary color, border-bottom */

.btn         /* Base button styles */
.btnPrimary  /* Primary color background */
.btnAccent   /* Accent color background */
.btnOutline  /* Transparent with border */

.rankS, .rankA, .rankB, .rankC, .rankD, .rankE
  /* Text colors for ranks */

.newsHigh, .newsMedium, .newsLow
  /* 3px left borders for importance */
```

---

## 8. ROOT LAYOUT (src/app/layout.tsx)

**389 bytes | Minimal**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "甲子園シミュレーター",
  description: "高校野球シミュレーションゲーム",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
```

---

## 9. NAVIGATION PATTERN (All Pages)

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

**Active state:**
```tsx
className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
```

---

## 10. CSS MODULES PATTERN

All pages follow this pattern:

```tsx
import styles from './page.module.css';

export default function PageName() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>...</header>
      <nav className={styles.nav}>...</nav>
      <main className={styles.main}>...</main>
    </div>
  );
}
```

---

## 11. STATE MANAGEMENT (Zustand)

**src/stores/world-store.ts (14,156 bytes)**

```tsx
const state = useWorldStore((s) => s.worldState)
const newGame = useWorldStore((s) => s.newWorldGame)
const advanceDay = useWorldStore((s) => s.advanceDay)
const advanceWeek = useWorldStore((s) => s.advanceWeek)
const save = useWorldStore((s) => s.saveGame)
const load = useWorldStore((s) => s.loadGame)
const delete = useWorldStore((s) => s.deleteSave)
const list = useWorldStore((s) => s.listSaves)
const usage = useWorldStore((s) => s.getStorageUsage)
```

---

## 12. CRITICAL GAPS

⚠️ **NO MOBILE RESPONSIVE DESIGN**
- No @media queries anywhere
- Fixed max-width: 960px
- 4-column grids will break on tablets
- Text 13-14px (unreadable on mobile)
- Header nav needs hamburger menu
- Save panel not touch-optimized

🔧 **Missing:**
- Media queries for 1024px, 768px, 480px, 375px
- Hamburger navigation menu
- Touch-friendly button sizes (48x48px minimum)
- Responsive grids with auto-fit
- Font scaling with `clamp()`
- Viewport meta tag

---

## 13. QUICK FILE CHECKLIST

### CSS Modules (9 files):
- ✓ `page.module.css` (home)
- ✓ `layout.module.css` (layout)
- ✓ `team/page.module.css`
- ✓ `team/[playerId]/page.module.css`
- ✓ `scout/page.module.css`
- ✓ `tournament/page.module.css`
- ✓ `results/page.module.css`
- ✓ `ob/page.module.css`
- ✓ `save/SaveLoadPanel.module.css`

### Page Components (7 files):
- ✓ `app/page.tsx`
- ✓ `app/team/page.tsx`
- ✓ `app/team/[playerId]/page.tsx`
- ✓ `app/scout/page.tsx`
- ✓ `app/tournament/page.tsx`
- ✓ `app/results/page.tsx`
- ✓ `app/ob/page.tsx`

### Save System (5 files):
- ✓ `engine/save/world-save-manager.ts`
- ✓ `engine/save/world-serializer.ts`
- ✓ `engine/save/save-manager.ts`
- ✓ `engine/save/serializer.ts`
- ✓ `engine/save/index.ts`

### Global Files (3):
- ✓ `app/layout.tsx`
- ✓ `app/globals.css`
- ✓ `app/layout.module.css`

---

## 14. SAVE FLOW DIAGRAM

```
User clicks Save
    ↓
SaveLoadPanel.tsx → handleSaveClick()
    ↓
ConfirmDialog (overwrite check if slot occupied)
    ↓
useWorldStore.saveGame(slotId, label)
    ↓
world-save-manager.saveWorldState(slotId, world, displayName)
    ↓
world-serializer.serializeWorldState(state)
    → Converts Map fields to plain objects
    ↓
world-serializer.computeWorldChecksum(json)
    → SHA-256 (with DJB2 fallback)
    ↓
localStorage['koushien_save_{slotId}'] = JSON.stringify(entry)
    ↓
Update meta list
    ↓
SaveLoadPanel shows success message
```

---

## 15. KEY CONSTANTS & ENUMS

**Season Phases:**
```typescript
'spring_practice'    // 春季練習
'summer_tournament'  // 夏大会
'koshien'           // 甲子園
'post_summer'       // 夏以降
'autumn_tournament' // 秋大会
'off_season'        // オフ
'pre_season'        // 始動期
```

**Task Types:**
```typescript
'match'    // ⚾ 試合日
'off'      // 💤 休養日
'scout'    // 🔍 スカウト
'practice' // 🏋 練習日
```

---

**Last Updated:** 2026-04-16  
**Full Report:** See PROJECT_EXPLORATION.md for comprehensive details
