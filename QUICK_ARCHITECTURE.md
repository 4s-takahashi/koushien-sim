# Koushien-Sim Quick Architecture Reference

## Core Systems at a Glance

### 🎮 Game State Models

| Model | Scope | Usage | Store |
|-------|-------|-------|-------|
| **GameState** | Single School | Phase 1/2 Classic mode | `game-store.ts` |
| **WorldState** | Multi-School | Phase 3+ World mode | `world-store.ts` |

---

### 🔄 Game Day Flow

```
START OF DAY
    ↓
Determine dayType (practice/tournament/rest)
    ↓
For Each School:
  ├─ Tier="full" (player school)   → processDay() [full sim]
  ├─ Tier="standard" (rivals)      → applyBatchGrowth() [simplified]
  └─ Tier="minimal" (distant)      → applyBulkGrowth() on Sundays [weekly]
    ↓
Middle School Growth (Sundays only)
    ↓
Generate Daily News (tournaments, upsets, drafts, OB)
    ↓
Advance Calendar Date
    ↓
IF new date = April 1 → processYearTransition()
    ↓
Return WorldDayResult
```

---

### 🎓 Year Transition Steps (3/31 → 4/1)

```
Step 0.5: AI Schools Scout
          └─ Each AI picks 1-5 middle schoolers
          
Step 0.8: Pro Draft
          └─ S/A tier seniors → pro teams
          
Step 1-2: Senior Graduation
          └─ Remove 3rd years, record career paths
          
Step 3:   Middle School Enrollment
          └─ 8-factor scoring → assign to high schools
          
Step 4:   Grade Promotion + New Recruits
          └─ Promote middle schoolers
          └─ Generate 180 new grade-1 middle schoolers
          
Step 5:   Lineup Regeneration
          └─ autoGenerateLineup() for all schools
          
Step 6:   Reputation Update
          └─ Based on tournament results from previous year
          
Step 7:   Season Reset
          └─ Clear tournament records, reset scout budget
          
Step 8:   Tier Update
          └─ Recalculate simulation tiers
```

---

### 📊 Key Data Types

#### PlayerStats (0-100 scale)
```
├─ Base Stats (all players)
│  ├─ stamina, speed, armStrength, fielding, focus, mental
│
├─ Batting Stats (all players)
│  ├─ contact, power, eye, technique
│
└─ Pitching Stats (pitchers only)
   ├─ velocity, control, stamina
   └─ pitch types (1-7 varieties)
```

#### Overall Rating Formula
```
baseAvg = (stamina + speed + arm + fielding + focus + mental) / 6
batAvg = (contact + power + eye + technique) / 4
overall = (baseAvg * 0.5 + batAvg * 0.5)

For Middle School (0-50 → 0-100):
overall *= 2
```

#### Quality Tiers
```
S  ≥ 70 overall   [Super elite]
A  ≥ 55 overall   [Pro eligible]
B  ≥ 40 overall   [College prospect]
C  ≥ 25 overall   [Developing]
D  < 25 overall   [Fringe]
```

---

### 🎯 Scout System Mechanics

```
SCOUT WORKFLOW:

1. searchMiddleSchoolers(filters)
   └─ Returns middle school candidates (grade, prefecture, reputation)

2. addToWatchList(playerId)
   └─ Tracks prospect in UI

3. conductScoutVisit(playerId)
   └─ Costs: 1 scout action per visit
   └─ Returns: ScoutReport with noisy stats
   └─ Confidence: 0.4–0.95 (increases with visits)

4. recruitPlayer(playerId)
   └─ Calculates success probability:
      • School reputation (30%)
      • Scout status (25%)
      • Local preference (20%)
      • Prestige factor (15%)
      • Coach compatibility (10%)
   └─ Success: 5%–95% (clamped)
   └─ Result: Adds to scoutedBy, may lock targetSchoolId
```

---

### 📋 Draft System

```
DRAFT ELIGIBILITY:
  └─ 3rd year players with overall ≥ 40 (C tier+)

DRAFT ROUND:
  1. Identify candidates (overall ≥ 55 = S/A tier)
  2. Each pro team picks 1-3 players (weighted by ranking)
  3. Negotiation success:
     • S tier: 95%
     • A tier: 80%

CAREER PATHS (after draft):
  ├─ Pro (if picked & negotiation success) → 0.95 or 0.80 prob
  ├─ University (if overall ≥ 55 + mental ≥ 50) → up to 60%
  ├─ Corporate (if overall ≥ 45) → up to 50%
  └─ Retirement (default) → 100%
```

---

### 🏫 Enrollment Algorithm (Middle School → High School)

Uses **5-factor scoring**:

```
SCORE = 0

1. School Reputation (30%)
   score += (school.reputation × player.overall/50) × 0.30

2. Scout Status (25%)
   score += 200 if targetSchoolId = school  [locked in]
   score += 100 if scoutedBy includes school

3. Local Preference (20%)
   score += 80 if prefecture matches

4. Prestige Bias (15%)
   score += 60 if school.reputation > 70 AND player.overall > 30

5. Coach Compatibility (10%)
   score += compatibility_score × 0.10

RANDOM FACTOR: ±20

SELECTION: Softmax probability weighted by score
           Respects school capacity (3-18 players)
```

---

### 💡 Constants & Tuning

#### Growth System
```
STAT_MIN/MAX: 1–100
VELOCITY: 80–160 (km/h)
PITCH_LEVEL: 1–7 (variety)
VARIANCE: ×0.7 to ×1.3 (RNG multiplier)
CAMP_MULTIPLIER: ×1.5
MATCH_GROWTH: ×2.0
```

#### Match System
```
FASTBALL_RATIO: 40% of pitches
CONTACT_BASE: 85%
CONTACT_PENALTY (breaking): –3%
CONTACT_PENALTY (velocity): –0.0015 per km/h
FAIR_RATE: 54%
HOME_RUN_DISTANCE: 90m
FLY_CATCH_RATE: 85%
GROUND_OUT_RATE: 60%
```

#### Reputation Changes
```
Summer tournament best ≥ 4 → +3 rep
Summer tournament best ≥ 3 → +1 rep
Autumn tournament best ≥ 3 → +1 rep
Koshien appearance → +5 rep
Koshien best round ≥ 2 → +3 rep
Per pro player drafted → +2 rep
Random variance → ±2
Final range: 1–100
```

---

### 🏗️ Architecture Patterns

#### 1. Immutability
- All state returns new objects (spread operators)
- No direct mutations
- Enables time-travel debugging

#### 2. RNG Seeding
- `createRNG('seed')` → parent RNG
- `rng.derive('namespace')` → child RNG
- Deterministic replays enabled

#### 3. Projector Pattern
- `engine/` = pure simulation
- `ui/projectors/` = state → view transformation
- Clean separation of concerns

#### 4. Tier System (for performance)
- **full**: Player school (detailed physics)
- **standard**: Regional rivals (batch growth daily)
- **minimal**: Distant schools (bulk growth weekly)

#### 5. WorldState Transactions
- Year transition is atomic
- Multi-step operations executed in order
- Maintains global consistency

---

### 📁 Key Files Reference

| File | Purpose |
|------|---------|
| `scout-system.ts` | Scout operations, recruitment |
| `draft-system.ts` | Pro draft, career determination |
| `year-transition.ts` | Year-end graduation & enrollment |
| `world-ticker.ts` | Daily world progression |
| `growth/constants.ts` | Growth tuning parameters |
| `match/constants.ts` | Match mechanics tuning |
| `match/types.ts` | Match result structures |
| `game-store.ts` | Single-school state (Phase 1/2) |
| `world-store.ts` | Multi-school state (Phase 3+) |
| `resultsProjector.ts` | Match results display |
| `news-generator.ts` | Daily news generation |

---

### 🧪 Testing Patterns

```typescript
// Standard test structure
import { describe, it, expect, beforeEach } from 'vitest';
import { createRNG } from '@/engine/core/rng';

describe('Feature', () => {
  let rng: RNG;
  
  beforeEach(() => {
    rng = createRNG('test-seed');  // Deterministic
  });
  
  it('should do X', () => {
    const result = functionUnderTest(data, rng);
    expect(result).toEqual(expected);
  });
});
```

**Test Files by System:**
- `scout-system.test.ts` — Scout logic
- `draft-system.test.ts` — Draft mechanics
- `year-transition.test.ts` — Year transitions
- `world-ticker.test.ts` — Day progression
- `integration.test.ts` — Full workflows

---

### 🔗 Data Flow Summary

```
USER INPUT
    ↓
UI Component → Zustand Store (world-store/game-store)
    ↓
Dispatch Action (advanceDay, scoutVisit, recruitPlayer, etc.)
    ↓
Engine Function (pure simulation)
    ↓
RNG Seeded Operations
    ↓
Return Updated State
    ↓
Projectors Transform → ViewState
    ↓
React Components Render
```

---

### 📈 Simulation Tiers (Performance Optimization)

| Tier | Usage | Growth Calc | Frequency |
|------|-------|------------|-----------|
| **full** | Player school | Detailed physics | Every day |
| **standard** | Regional rivals | Batch growth | Every day |
| **minimal** | Distant schools | Bulk growth | Sundays only |

---

### 🎓 Career Progression

```
MIDDLE SCHOOL (Grades 1-3)
    └─ Stats: 0-50 scale
    └─ Growth: Class-based, slower
    └─ Year 3 Fall: Scout recruitment begins
    │
    ↓ (Year transition)
    │
HIGH SCHOOL (Grades 1-3)
    └─ Stats: 0-100 scale
    └─ Growth: Match-based, faster
    └─ Year 3 Spring: Draft eligible
    │
    ↓ (Year transition / Draft)
    │
POST-GRADUATE
    ├─ Pro (Drafted)
    ├─ University (Scholarship or Regular)
    ├─ Corporate Baseball
    └─ Retirement
```

---

### 🚀 Quick Start for Extensions

1. **Add new coach style**: Modify `person-blueprint.ts` CoachStyle
2. **Tune difficulty**: Edit `GROWTH_CONSTANTS` or `MATCH_CONSTANTS`
3. **New scout metric**: Add filter to `scout-system.ts` searchMiddleSchoolers()
4. **Custom news**: Add case to `news-generator.ts` generateDailyNews()
5. **New tournament**: Extend `year-transition.ts` reputation logic

---

**Version**: 0.1.0 (MVP)
**Last Updated**: April 16, 2026
