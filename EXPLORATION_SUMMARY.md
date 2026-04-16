# Koushien-Sim Codebase Exploration Summary

**Completed**: April 16, 2026 | **Project Version**: 0.1.0 (MVP)

---

## 📋 What Was Explored

### 1. **Directory Structure**
   - ✅ Top-level layout (src/, tests/, scripts/, public/)
   - ✅ Full src/ tree mapping (87 TypeScript files)
   - ✅ Key subdirectories: engine/, stores/, ui/, platform/
   - ✅ Scripts directory: sample-pitch.ts utility

### 2. **Engine Core Files** (8 files, 2,300+ lines)

| File | Lines | Purpose |
|------|-------|---------|
| `growth/constants.ts` | 31 | Growth tuning parameters |
| `scout/scout-system.ts` | 450 | Scout recruitment mechanics |
| `year-transition.ts` | 573 | Year-end graduation & enrollment |
| `career/draft-system.ts` | 317 | Pro draft & career paths |
| `match/constants.ts` | 65 | Match mechanics tuning |
| `world-ticker.ts` | 324 | Daily world progression |
| `resultsProjector.ts` | 279 | Match results display |
| `news-generator.ts` | 284 | Daily news generation |

### 3. **Type Definitions**
   - ✅ Match types: MatchResult, InningResult, AtBatResult, AtBatOutcome
   - ✅ WorldState structure with HighSchool & MiddleSchoolPlayer
   - ✅ Scout system types: ScoutReport, RecruitResult, ScoutState
   - ✅ Career paths: CareerPath union types
   - ✅ Player stats (base, batting, pitching)

### 4. **Store Architecture**
   - ✅ `game-store.ts`: Zustand store for GameState (Phase 1/2)
   - ✅ `world-store.ts`: Zustand store for WorldState (Phase 3+)
   - ✅ Both use seeded RNG for deterministic saves
   - ✅ Projector pattern for state → view transformation

### 5. **Testing Patterns**
   - ✅ 20+ test files found (Vitest framework)
   - ✅ Standard pattern: describe/it/expect with beforeEach fixtures
   - ✅ RNG seeding for deterministic tests
   - ✅ Test categories: systems, integration, projectors

---

## 🎮 Key Game Mechanics Discovered

### Scout System (450 lines)
- **Workflow**: Search → Watch → Visit (with confidence) → Recruit
- **Visit mechanics**: Noisy observation with 0.4–0.95 confidence
- **Recruitment**: 5-factor probability (reputation, scout status, local, prestige, coach fit)
- **AI recruiting**: Each school scouts 1–5 players based on reputation

### Draft System (317 lines)
- **Eligibility**: Overall ≥ 40 (C tier); only ≥ 55 (S/A) get pro offers
- **Process**: 12 teams × 1-3 picks each, weighted by ranking
- **Negotiation**: S tier 95%, A tier 80% success rate
- **Career paths**: Pro (95%/80%) → University (up to 60%) → Corporate (up to 50%) → Retire

### Year Transition (573 lines)
- **8-step atomic transaction** (3/31 → 4/1)
- **Enrollment algorithm**: 5-factor scoring with softmax selection
- **Reputation system**: Tournament results → ±2 to +5 reputation
- **New cohorts**: 180 new grade-1 middle schoolers generated annually

### Match System (65 constants)
- **Contact rate**: 85% base, –3% for breaking, –0.0015 per km/h velocity
- **HR threshold**: 90m distance
- **Fielding**: 85% fly catch, 60% ground out, 25% double play
- **Confidence**: +10 for hits, +20 for HR, –8 for strikeouts (in-game)

### World Simulation (324 lines)
- **Tier system**: full/standard/minimal for performance
- **Daily flow**: 1) School processing → 2) Middle school growth → 3) News → 4) Date check
- **Year detection**: April 1 triggers processYearTransition()
- **News generation**: Prospects, upsets, draft, OB activity

---

## 🏗️ Architecture Highlights

### 1. **Immutable State Management**
   - All mutations return new objects (spread operators)
   - Time-travel debugging possible
   - No side effects in core engine

### 2. **RNG System**
   - Seeded determinism with `seedrandom`
   - Hierarchical RNG derivation: `rng.derive('namespace')`
   - Enables perfect replay capability

### 3. **Projector Pattern**
   - `engine/` = pure simulation (zero UI dependencies)
   - `ui/projectors/` = state transformation only
   - Clean separation of concerns

### 4. **Performance Optimization**
   - **Tier system**: Scales compute from full→standard→minimal
   - **Batch/bulk growth**: Reduces daily calculations for non-player schools
   - **Cache**: `HighSchool._summary` for team strength metrics
   - **Weekly batching**: Middle school grows only on Sundays at minimal tier

### 5. **Type Safety**
   - Full TypeScript with strict mode
   - Discriminated unions for outcomes (AtBatOutcome types)
   - Generic RNG system with proper typing

---

## 📊 Data Model Hierarchy

```
PLAYER PROGRESSION:
  Middle School (Grades 1-3, 0-50 scale)
    → Year 3 Scout Recruitment
    → High School (Grades 1-3, 0-100 scale)
    → Year 3 Pro Draft
    → Post-Graduate:
        ├─ Pro Baseball (12 teams, 95%/80% success)
        ├─ University (12 schools, up to 60% prob)
        ├─ Corporate Baseball (12 companies, up to 50% prob)
        └─ Retirement (100% fallback)

SCHOOL SIMULATION:
  HighSchool:
    ├─ Team (players, lineup, facilities)
    ├─ Coach Style (offense, defense, practice, aggressiveness)
    ├─ Year Results (tournament performance)
    ├─ Reputation (1-100, updated annually)
    └─ Simulation Tier (full/standard/minimal)

SCOUT STATE:
  ├─ Watch List (tracked prospects)
  ├─ Scout Reports (noisy observations)
  ├─ Recruit Attempts (history)
  └─ Monthly Budget (scout actions)
```

---

## 🧩 Key Type Definitions Summary

### PlayerStats
```typescript
{
  base: { stamina, speed, armStrength, fielding, focus, mental },
  batting: { contact, power, eye, technique },
  pitching: null | { velocity, control, stamina, pitches: Record<type, level> }
}
```

### MatchResult
```typescript
{
  winner: 'home' | 'away' | 'draw',
  finalScore: { home, away },
  inningScores: { home: number[], away: number[] },
  totalInnings: number,
  mvpPlayerId: string | null,
  batterStats: MatchBatterStat[],
  pitcherStats: MatchPitcherStat[]
}
```

### ScoutReport
```typescript
{
  playerId: string,
  observedStats: Partial<PlayerStats>,
  confidence: number,  // 0-1
  scoutComment: string,
  estimatedQuality: 'S' | 'A' | 'B' | 'C' | 'D'
}
```

### CareerPath
```typescript
| { type: 'pro', team: string, pickRound: number }
| { type: 'university', school: string, hasScholarship: boolean }
| { type: 'corporate', company: string }
| { type: 'retire' }
```

---

## 📈 Major Formulas

### Overall Rating
```
baseAvg = (stamina + speed + arm + fielding + focus + mental) / 6
batAvg = (contact + power + eye + technique) / 4
overall = baseAvg × 0.5 + batAvg × 0.5

For middle school (0-50 → 0-100):
overall *= 2
```

### Recruitment Success Probability
```
prob = 0.3              [base]
     + (rep/100) × 0.3  [reputation factor]
     + 0.15 if already scouted
     + 0.1 if local
     + 0.1 if coach compatible
     - rivals × 0.08    [competition penalty]
     
Final: clamp(0.05, prob, 0.95)
```

### Enrollment Scoring
```
score = (rep × overall/50) × 0.3      [reputation, 30%]
      + 200 if targetSchoolId match   [locked, 25%]
      + 80 if local                    [prefectures, 20%]
      + 60 if prestige match          [for S/A tiers, 15%]
      + compatibility × 0.1            [coach fit, 10%]
      + rng(−20, +20)                  [random, ±20]
```

---

## 🧪 Testing Infrastructure

**Framework**: Vitest 4.1.4
**Test Count**: 20+ test files
**Pattern**: describe/it/expect with seeded RNG

**Key Test Categories**:
- Growth system (growth calculations)
- Scout system (recruitment, visits)
- Draft system (eligibility, negotiations)
- Year transitions (graduation, enrollment)
- World ticker (daily progression)
- Integration (full game flows)
- Projectors (UI state generation)

---

## 📦 Dependencies

### Core
- **next**: 16.2.3 (framework)
- **react**: 19.2.4 (UI)
- **zustand**: 5.0.12 (state management)

### Persistence
- **dexie**: 4.4.2 (IndexedDB wrapper)

### Utilities
- **seedrandom**: 3.0.5 (seeded RNG)

### Testing
- **vitest**: 4.1.4 (test framework)
- **@vitest/ui**: 4.1.4 (test dashboard)
- **happy-dom**: 20.8.9 (DOM simulation)

---

## 📄 Documentation Generated

Created two comprehensive guides in the project:

1. **CODEBASE_GUIDE.md** (968 lines)
   - Full architecture breakdown
   - Complete file descriptions
   - Type definitions with examples
   - Formulas and mechanics
   - Data flow diagrams
   - Performance considerations

2. **QUICK_ARCHITECTURE.md** (300+ lines)
   - Quick reference tables
   - Flow diagrams (game day, year transition)
   - Key constants & tuning
   - Testing patterns
   - Extension checklist

---

## 🎯 High-Level System Summary

### Phase 1/2: GameState (Single School)
- Classic baseball manager sim
- Full control over one team
- Detailed match physics
- Player development focus

### Phase 3+: WorldState (Multi-School)
- 40+ simultaneous schools
- Scout system for recruiting
- Draft system for pro entry
- Simulation tiers for performance
- Career tracking post-graduation
- Daily news generation

### Core Engine Components
1. **RNG System**: Deterministic seeding
2. **Growth Engine**: Multi-factor progression
3. **Match Simulator**: Pitch-by-pitch physics
4. **Scout System**: 5-factor recruitment
5. **Draft System**: Pro career paths
6. **Year Transition**: Atomic annual transaction
7. **News Generator**: Context-aware events

---

## 🚀 Ready for Extensions

The codebase is modular and well-structured for additions:

- ✅ Tournament bracket system
- ✅ Advanced tactical AI
- ✅ Custom difficulty tuning
- ✅ Save game versioning
- ✅ Replay system
- ✅ Player trading system
- ✅ International recruitment

All core systems have clear extension points and test patterns.

---

## 📝 Notes for Future Work

1. **WorldState** is the master state (Phase 3+) while **GameState** remains for backward compatibility
2. **RNG derivation** ensures all operations are reproducible
3. **Tier system** prevents bottlenecks with 40+ schools
4. **Scout reports** intentionally include observation error for realism
5. **Year transition** is atomic to prevent inconsistencies
6. **News system** is extensible with new event types

---

**Exploration Completed**: ✅
**Files Analyzed**: 8 core engine files + types + stores + tests
**Lines of Code Reviewed**: 3,000+
**Type Definitions Catalogued**: 40+
**Formulas Documented**: 10+

**Next Steps**: Use these guides for:
- Feature development
- Bug fixing
- Performance optimization
- Testing new mechanics
- Documentation updates

