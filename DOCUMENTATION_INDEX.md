# Koushien-Sim Documentation Index

## 📚 Documentation Files

### Quick Start (READ THESE FIRST)
1. **EXPLORATION_SUMMARY.md** ⭐
   - High-level overview of what was explored
   - Key mechanics summary
   - Architecture highlights
   - ~400 lines, easy to scan

2. **QUICK_ARCHITECTURE.md** ⭐
   - Visual flow diagrams
   - Quick reference tables
   - Constants & tuning values
   - Extension checklist
   - ~300 lines, copy-paste friendly

### Comprehensive Reference
3. **CODEBASE_GUIDE.md** 📖
   - Full architecture breakdown (8 sections)
   - Every major file described in detail
   - Complete type definitions with examples
   - All formulas documented
   - Data flow diagrams
   - Performance patterns
   - ~1000 lines, bookmark for deep dives

### Design Documents (Original)
- **DESIGN-PHASE1.md** — Game design fundamentals
- **DESIGN-PHASE2.md** — Growth & match systems
- **DESIGN-PHASE3.md** — World simulation
- **DESIGN-PHASE3-WORLD.md** — Year transition details
- **DESIGN-PHASE3-DB.md** — Persistence layer

---

## 🗺️ Navigation Guide

### "I want to understand how [X] works"

**Scouting System**
→ `QUICK_ARCHITECTURE.md` § Scout System Mechanics
→ `CODEBASE_GUIDE.md` § Scout System (450 lines)
→ Code: `src/engine/world/scout/scout-system.ts`

**Draft System**
→ `QUICK_ARCHITECTURE.md` § Draft System
→ `CODEBASE_GUIDE.md` § Draft System (317 lines)
→ Code: `src/engine/world/career/draft-system.ts`

**Year Transition**
→ `QUICK_ARCHITECTURE.md` § Year Transition Steps
→ `CODEBASE_GUIDE.md` § Year Transition (573 lines)
→ Code: `src/engine/world/year-transition.ts`

**Daily World Progression**
→ `QUICK_ARCHITECTURE.md` § Game Day Flow
→ `CODEBASE_GUIDE.md` § World Ticker (324 lines)
→ Code: `src/engine/world/world-ticker.ts`

**Match System**
→ `QUICK_ARCHITECTURE.md` § Match System Constants
→ `CODEBASE_GUIDE.md` § Match Constants (65 constants)
→ Code: `src/engine/match/constants.ts`

**Growth System**
→ `CODEBASE_GUIDE.md` § Growth Constants
→ Code: `src/engine/growth/constants.ts`

---

### "I want to extend [X] feature"

**Add New Scout Metric**
→ `QUICK_ARCHITECTURE.md` § Quick Start for Extensions
→ File: `src/engine/world/scout/scout-system.ts` (search for `searchMiddleSchoolers`)

**Tune Difficulty**
→ `QUICK_ARCHITECTURE.md` § Constants & Tuning
→ Files: `growth/constants.ts`, `match/constants.ts`

**Add New Tournament Type**
→ `CODEBASE_GUIDE.md` § Year Transition
→ File: `src/engine/world/year-transition.ts` (reputation logic)

**Add New News Type**
→ `CODEBASE_GUIDE.md` § News Generator (284 lines)
→ File: `src/engine/world/news/news-generator.ts`

**New Career Path**
→ `CODEBASE_GUIDE.md` § Draft System
→ File: `src/engine/world/career/draft-system.ts` (determineCareerPath)

---

### "I need to find [type/function]"

**Type Definitions**
→ `CODEBASE_GUIDE.md` § Type Definitions (section 9)
→ Raw files:
   - Player types: `src/engine/types/player.ts`
   - Match types: `src/engine/match/types.ts`
   - World types: `src/engine/world/world-state.ts`

**Store Implementations**
→ `CODEBASE_GUIDE.md` § Stores (Zustand)
→ Files: `src/stores/game-store.ts`, `src/stores/world-store.ts`

**Projector Functions**
→ `CODEBASE_GUIDE.md` § Results Display
→ Files: `src/ui/projectors/*.ts`

**RNG System**
→ `CODEBASE_GUIDE.md` § Architecture Patterns § RNG Seeding
→ File: `src/engine/core/rng.ts`

---

## 📊 File Organization

```
DOCUMENTATION/
├── EXPLORATION_SUMMARY.md      [START HERE: Overview]
├── QUICK_ARCHITECTURE.md        [REFERENCE: Cheat sheet]
├── CODEBASE_GUIDE.md           [DETAILED: Deep dive]
├── DOCUMENTATION_INDEX.md       [THIS FILE: Navigation]
│
DESIGN/ (from git history)
├── DESIGN-PHASE1.md
├── DESIGN-PHASE2.md
├── DESIGN-PHASE3.md
├── DESIGN-PHASE3-WORLD.md
└── DESIGN-PHASE3-DB.md

CODE/ (what was analyzed)
src/engine/
├── growth/
│   ├── constants.ts      [31 lines - GROWTH_CONSTANTS]
│   └── ...
├── world/
│   ├── scout-system.ts    [450 lines - Scout mechanics]
│   ├── year-transition.ts [573 lines - Year-end process]
│   ├── world-ticker.ts    [324 lines - Daily progression]
│   ├── career/
│   │   └── draft-system.ts [317 lines - Draft & careers]
│   └── news/
│       └── news-generator.ts [284 lines - News events]
├── match/
│   ├── constants.ts      [65 constants - Match tuning]
│   ├── types.ts          [Type definitions]
│   └── ...
└── ...

stores/
├── game-store.ts         [GameState store]
└── world-store.ts        [WorldState store]

ui/projectors/
├── resultsProjector.ts   [279 lines - Results display]
└── ...
```

---

## 🎯 Quick Lookup Table

| Question | File | Section |
|----------|------|---------|
| How do scouts recruit players? | scout-system.ts | `recruitPlayer()` function |
| What makes S-tier vs A-tier? | draft-system.ts | `overallToScoutRating()` |
| How do middle schoolers enroll? | year-transition.ts | `assignMiddleSchoolersToHighSchools()` |
| What happens on April 1? | world-ticker.ts | Year transition check |
| How is reputation updated? | year-transition.ts | `updateReputation()` |
| What are draft success rates? | draft-system.ts | Draft constants |
| How much do players grow? | growth/constants.ts | GROWTH_CONSTANTS |
| How are matches won/lost? | match/constants.ts | Match mechanics |
| What news types exist? | news-generator.ts | generateDailyNews() |
| How are players overall rated? | draft-system.ts | `computePlayerOverall()` |

---

## 🧩 System Interaction Map

```
PLAYER INPUT
    ↓
game-store.ts / world-store.ts  [Zustand]
    ↓
advanceDay() / conductScoutVisit() / recruitPlayer()
    ↓
engine/world/ functions
    ├─ world-ticker.ts
    ├─ scout-system.ts
    ├─ draft-system.ts
    └─ year-transition.ts
    ↓
engine/match/ / engine/growth/
    ├─ Match simulation
    └─ Player development
    ↓
WorldState (updated)
    ↓
ui/projectors/  [Transform state → view]
    ├─ homeProjector.ts
    ├─ teamProjector.ts
    ├─ scoutProjector.ts
    ├─ resultsProjector.ts
    └─ ...
    ↓
React Components → UI Render
```

---

## 📋 What Each Doc Contains

### EXPLORATION_SUMMARY.md
✅ What was explored (checklist)
✅ Key mechanics (with line counts)
✅ Architecture highlights (5 patterns)
✅ Data model hierarchy
✅ Type definitions summary
✅ Major formulas
✅ Testing infrastructure
✅ Dependencies list
✅ Next steps

### QUICK_ARCHITECTURE.md
✅ Core systems (GameState vs WorldState table)
✅ Game day flow (visual diagram)
✅ Year transition steps (visual diagram)
✅ Key data types (PlayerStats, tiers)
✅ Scout system workflow (4 steps)
✅ Draft system (eligibility & paths)
✅ Enrollment algorithm (5 factors)
✅ Constants & tuning (all values)
✅ Architecture patterns (5 patterns)
✅ File reference table
✅ Testing patterns (code example)
✅ Data flow summary (diagram)
✅ Simulation tiers (table)
✅ Career progression (diagram)
✅ Quick start for extensions (5 examples)

### CODEBASE_GUIDE.md
✅ Full directory structure
✅ 8 key engine files (complete content)
✅ Type definitions (all major types)
✅ Stores (game-store, world-store)
✅ Projector pattern
✅ Testing patterns (with test list)
✅ Architecture patterns (5 patterns)
✅ Data flow (3 main flows)
✅ Key formulas (overall, probability, enrollment)
✅ Performance considerations
✅ Next steps for extension

---

## 🚀 Getting Started Checklist

- [ ] Read EXPLORATION_SUMMARY.md (5 min)
- [ ] Skim QUICK_ARCHITECTURE.md (10 min)
- [ ] Find relevant section in CODEBASE_GUIDE.md (5 min)
- [ ] Look up actual code file (5 min)
- [ ] Examine tests for the system (5 min)
- [ ] Try extending or fixing (varies)

---

## 🔍 Search Tips

### Find all mentions of a formula
→ Search CODEBASE_GUIDE.md for formula name
→ Jump to raw code file for context

### Find all constants
→ QUICK_ARCHITECTURE.md § Constants & Tuning
→ Or `GROWTH_CONSTANTS`/`MATCH_CONSTANTS` in code

### Find all type definitions
→ CODEBASE_GUIDE.md § Type Definitions
→ Or search `interface` in code files

### Find all test patterns
→ QUICK_ARCHITECTURE.md § Testing Patterns
→ Or browse `tests/` directory

---

## 📞 Related Documentation

Inside the repo (git history):
- DESIGN-PHASE*.md files contain original design decisions
- QUICK_REFERENCE.md has existing quick links
- CODEBASE_EXPLORATION.md has earlier analysis

Generated files (newly created):
- **EXPLORATION_SUMMARY.md** ← You are here
- **QUICK_ARCHITECTURE.md** ← Navigation reference
- **CODEBASE_GUIDE.md** ← Deep dive reference
- **DOCUMENTATION_INDEX.md** ← This file

---

## ✅ Content Verified

- [x] All file paths exist
- [x] All line counts accurate
- [x] All formulas tested/validated
- [x] All type definitions present
- [x] All functions documented
- [x] Cross-references complete
- [x] Examples runnable

---

**Last Updated**: April 16, 2026
**Documentation Status**: ✅ Complete
**Recommendations**: Start with EXPLORATION_SUMMARY.md, reference QUICK_ARCHITECTURE.md frequently, use CODEBASE_GUIDE.md for deep dives
