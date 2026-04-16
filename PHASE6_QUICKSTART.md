# Phase 6 Quick Start Guide

## What You Need to Know Before Starting

### Project at a Glance
- **Language**: TypeScript + React
- **Framework**: Next.js 16.2.3 (latest App Router)
- **State**: Zustand 5.0.12
- **Tests**: Vitest (446 tests, all passing)
- **Architecture**: Projector pattern (WorldState → ViewState → UI)
- **Latest Feature**: Phase 5 complete — world simulation, player growth, draft system

### Where Everything Lives

**Core Engine** (`src/engine/`):
- Match simulation: `match/` (runGame, quickGame, statGame)
- World management: `world/` (advanceWorldDay, year-transition)
- Growth system: `growth/` (daily/batch/bulk growth)
- Save/load: `save/` (currently GameState only)

**UI & State** (`src/stores/` + `src/ui/projectors/`):
- State: `useWorldStore` (Zustand) — main game state
- Projectors: Pure functions turning WorldState → ViewState
- Pages: `src/app/` — Next.js pages

**Tests**: `tests/` mirrors `src/` structure

### Key Files for Phase 6

| Feature | Main File | Status |
|---------|-----------|--------|
| Save/Load | `src/engine/save/save-manager.ts` | Needs WorldState |
| Tournament | `src/ui/projectors/tournamentProjector.ts` | Placeholder |
| Results | `src/ui/projectors/resultsProjector.ts` | Partial |
| World State | `src/engine/world/world-state.ts` | Ready |
| Match Sim | `src/engine/match/types.ts` | Ready |

---

## Before You Code: 3 Essential Commands

```bash
# 1. Install everything
npm install

# 2. Run tests to verify baseline
npx vitest

# 3. Start dev server
npm run dev
# Visit http://localhost:3000
```

**Expected Results:**
- ✅ All 446 tests pass
- ✅ Dev server runs without errors
- ✅ Home page loads with game dashboard

---

## The 4 Phase 6 Features Explained

### Feature 1: Save/Load System
**What**: Let players save and load games
**Why**: Game is lost when browser closes (IndexedDB is temporary)
**Files**: `save-manager.ts`, `serializer.ts`, new `save/page.tsx`
**Difficulty**: ⭐⭐⭐ (Medium) — Mostly plumbing

### Feature 2: Tournament UI
**What**: Display tournament brackets and progress
**Why**: Currently a placeholder; users want to see tournament info
**Files**: `tournamentProjector.ts`, `tournament/page.tsx`
**Difficulty**: ⭐⭐⭐⭐ (Hard) — Needs new data structures

### Feature 3: Match Display
**What**: Show play-by-play results, inning-by-inning scores
**Why**: Currently shows only final score
**Files**: `resultsProjector.ts`, `match/types.ts`, `results/page.tsx`
**Difficulty**: ⭐⭐ (Easy) — Mostly UI work

### Feature 4: Deploy Prep
**What**: Make sure everything works in production
**Why**: Currently dev-only, needs prod testing
**Files**: `next.config.ts`, package.json, build output
**Difficulty**: ⭐ (Very Easy) — Just configuration

---

## Architecture: The Projector Pattern

**Golden Rule**: Never access WorldState directly in UI components.

```
WorldState (engine state)
       ↓
   Projector (pure function)
       ↓
ViewState (UI-friendly data)
       ↓
React Component (renders ViewState)
```

**Example**:
```typescript
// ❌ WRONG: Direct access
const { worldState } = useWorldStore();
const schoolName = worldState.schools[0].name;

// ✅ RIGHT: Via projector
const homeView = useWorldStore(state => state.getHomeView());
const schoolName = homeView.team.schoolName;
```

---

## Type System Quick Reference

### Three Main State Types

```typescript
// GameState (Phase 1/2) — Single school, single day
interface GameState {
  team: Team;
  currentDate: GameDate;
  // ... match history, etc.
}

// WorldState (Phase 3+) — Full world, 48 schools
interface WorldState {
  schools: HighSchool[];  // 48 total
  middleSchoolPool: MiddleSchoolPlayer[];
  personRegistry: PersonRegistry;  // Career tracking
  currentDate: GameDate;
  // ... tournaments, scouting, etc.
}

// ViewState (UI) — Read-only, curated
interface HomeViewState {
  date: DateView;
  team: HomeTeamSummary;
  recentNews: HomeNewsItem[];
  // ... game-ready data
}
```

### Key Engine Types

```typescript
// Match result — stores all game info
interface MatchResult {
  winner: 'home' | 'away' | 'draw';
  finalScore: { home: number; away: number };
  inningScores: { home: number[]; away: number[] };
  inningResults?: InningResult[];  // ← PHASE 6: Add this
  // ... pitcher stats, batter stats, etc.
}

// Inning result — per-inning breakdown
interface InningResult {
  inningNumber: number;
  half: 'top' | 'bottom';
  atBats: AtBatResult[];
  runsScored: number;
}

// At-bat result — single at-bat
interface AtBatResult {
  batterId: string;
  pitcherId: string;
  pitches: PitchResult[];  // Each pitch thrown
  outcome: AtBatOutcome;   // 'home_run', 'strikeout', etc.
  rbiCount: number;
}
```

---

## Recommended Implementation Order

### Priority 1: Save/Load (Do First!)
Why? Blocks everything else — can't test features without saving.

**Steps**:
1. Extend SaveManager to accept WorldState
2. Write serialization logic
3. Create save/load UI page
4. Write 8+ tests

**Est. Time**: 10 hours

### Priority 2: Results Display (Do Second!)
Why? Easiest to test, no dependencies.

**Steps**:
1. Add `inningResults` field to MatchResult
2. Update resultsProjector to use it
3. Enhance results page UI
4. Write 15+ tests

**Est. Time**: 10 hours

### Priority 3: Tournament UI (Do Third!)
Why? Needs save/load working, but UI is complex.

**Steps**:
1. Define Tournament and BracketMatch types
2. Add to WorldState
3. Implement tournamentProjector
4. Create tournament page
5. Write 10+ tests

**Est. Time**: 15 hours

### Priority 4: Deploy (Do Last!)
Why? Just configuration, no code changes.

**Steps**:
1. Fix any lint/type errors
2. Run production build
3. Test in prod environment
4. Deploy

**Est. Time**: 6 hours

---

## Common Patterns in Codebase

### Pattern 1: RNG Derivation (Always Do This)
```typescript
// ✅ Correct: Derived RNG for reproducibility
const schoolRng = rng.derive(`school:${school.id}`);
const playerRng = schoolRng.derive(`player:${player.id}`);

// ❌ Wrong: Using shared RNG
const random = Math.random();  // Never!
```

### Pattern 2: Cache Invalidation
```typescript
// After modifying players, invalidate cache
school = {
  ...school,
  players: updatedPlayers,
  _summary: null,  // ← CRITICAL: Invalidate cache
};
```

### Pattern 3: Tier-Based Simulation
```typescript
// Different calculations for different schools
if (school.simulationTier === 'full') {
  // Tier 1: Full simulation (player school)
  advanceSchoolFull(school, ...);
} else if (school.simulationTier === 'standard') {
  // Tier 2: Batch growth (rivals)
  advanceSchoolStandard(school, ...);
} else {
  // Tier 3: Minimal growth (others)
  advanceSchoolMinimal(school, ...);
}
```

### Pattern 4: Year Transition
```typescript
// Year transition happens on April 1
// 9-step process:
// Step 0: Snapshot
// Step 1-2: Graduate seniors
// Step 3: Enroll middle schoolers
// Step 4: Promote grades, generate new grade-1s
// Step 5-8: Various updates
// Step 9: Snapshot

// See year-transition.ts for details
```

---

## Testing: Quick Cheat Sheet

### Run All Tests
```bash
npx vitest
```

### Run Specific Test File
```bash
npx vitest tests/engine/save/save.test.ts
```

### Run Matching Tests
```bash
npx vitest --grep "SaveManager"
```

### Watch Mode (Auto-rerun on change)
```bash
npx vitest --watch
```

### With UI Dashboard
```bash
npx vitest --ui
```

### Test a Specific Function
```typescript
describe('SaveManager', () => {
  it('saves WorldState correctly', () => {
    // Test code here
  });
});
```

---

## Debugging Tips

### 1. Add Console Logs
```typescript
const { worldState } = useWorldStore();
console.log('Current world state:', worldState);
```

### 2. Use DevTools
- Open browser DevTools (F12)
- Check React Components tab
- Inspect Zustand store

### 3. Check Tests First
If a feature breaks:
1. Run tests to see what failed
2. Look at test to understand expected behavior
3. Fix implementation to match test

### 4. Type Errors Help!
TypeScript will catch type mismatches at compile time:
```bash
npx tsc --noEmit
```

### 5. Performance Profiling
```typescript
console.time('operation');
// ... code to measure ...
console.timeEnd('operation');
```

---

## Git Workflow for Phase 6

```bash
# 1. Create feature branch
git checkout -b phase6/save-load

# 2. Make changes
# ... edit files ...

# 3. Run tests
npx vitest

# 4. Commit
git add .
git commit -m "feat: Add WorldState save/load support"

# 5. Repeat 2-4 for next feature

# 6. Push when done
git push origin phase6/save-load
```

**Commit Message Format**:
```
feat: Add feature (new functionality)
fix: Fix bug
docs: Update documentation
test: Add tests
refactor: Restructure code
chore: Dev dependencies, config
```

---

## Critical Decisions Made in Previous Phases

1. **Projector Pattern**: All UI data goes through pure projectors
2. **Tier-Based Simulation**: Not all schools simulated equally (performance)
3. **PersonRegistry**: Unified player tracking across all life stages
4. **Seeded RNG**: All randomness is reproducible (deterministic)
5. **WorldState**: Single source of truth for game world

**Don't Change These!** They're foundational.

---

## Where to Find Help

### Documentation Files in Project
- `PHASE6_EXPLORATION.md` — Detailed codebase analysis (comprehensive!)
- `CODEBASE_GUIDE.md` — Architecture and type definitions
- `QUICK_REFERENCE.md` — Phase 3.5 quick ref (still relevant)
- `DESIGN-PHASE3-DB.md` — Data model details

### In Code
- Function signatures are well-documented
- JSDoc comments explain complex logic
- Type definitions are self-documenting

### Tests
- Tests are the best documentation
- Look at test cases to understand how things work
- Copy test patterns for new features

---

## Success Criteria for Phase 6

When you're done, verify:

```
✅ Save/Load
   - Can save game at any point
   - Can load and resume
   - Auto-save works
   - All save tests pass

✅ Tournament UI
   - Brackets display
   - Tournament progress visible
   - Results persist
   - All tournament tests pass

✅ Results Display
   - Inning-by-inning scores show
   - Play-by-play visible
   - All results tests pass

✅ Deploy Ready
   - npm run build succeeds
   - 446/446 tests pass
   - No TypeScript errors
   - Can deploy to production

✅ Code Quality
   - All tests pass
   - No console errors
   - Types are strict
   - No memory leaks
```

---

## You're Ready! 🚀

Start with save/load, follow the implementation order, and refer back to this guide whenever stuck.

**Key File to Reference First**: `/PHASE6_EXPLORATION.md` — it has everything!

Good luck! 💪
