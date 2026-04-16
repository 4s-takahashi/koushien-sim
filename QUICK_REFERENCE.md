# Quick Reference Guide - Phase 3.5 Implementation

## Critical Concepts for Phase 3.5

### 1. ID Persistence (CRITICAL)
- MiddleSchoolPlayer.id → Player.id (same)
- PersonRegistry tracks by ID across lifetime
- Must be identical in all stages

### 2. Life Stages
```
Middle School (grades 1-3)
  ↓ (April 1 of year 4)
High School (grades 1-3) 
  ↓ (March 31 of year 7)
Graduate (career path determined)
  ↓ (Optional: pro, university, corporate)
OB/Retired
```

### 3. Three Tiers (DESIGN CRITICAL)

| Tier | Schools | Daily | Match | Growth | Cost |
|------|---------|-------|-------|--------|------|
| 1 | Player's (1) | Full | runGame | applyDailyGrowth | 50ms |
| 2 | Rivals (3-5) | Simplified | quickGame | applyBatchGrowth | 5ms |
| 3 | Others (42) | Minimal | statGame | applyBulkGrowth (Sun) | 0.5ms |

### 4. Year Transition (9 Steps)

```
Step 0: Snapshot
Step 1-2: Graduate 3rd year → career path → remove
Step 3: Enroll 3rd year middle → convert → assign
Step 4: Promote middle schoolers + generate 180 new grade 1
Step 5: Rebuild lineups
Step 6: Update reputation
Step 7: Reset season
Step 8: Update tiers
Step 9: Snapshot
```

### 5. Growth Curves (StatGrowthCurve)

Each ability has:
- `baseRate`: 0.01-1.0 daily growth base
- `peakAge`: 13-18 (when strongest growth)
- `peakWidth`: 1.0-3.0 (bell curve width)
- `variance`: Daily variation amplitude
- `slumpPenalty`: Growth reduction while in slump
- `practiceAffinity`: Per-practice-type multipliers

### 6. Conversion Formula: MiddleSchoolPlayer → Player

```typescript
convertToHighSchoolPlayer(ms, enrollmentYear, facilities, rng):
  - ID: same as ms.id
  - stats: ms.currentStats (no change)
  - ceiling: ms.currentStats + random(30-65) × facility_boost
  - condition: reset (fatigue=0, injury=null)
  - career: reset (start fresh)
  - mental: partial transfer + reset stress
  - growth_type: random assignment (20% early, 55% normal, 20% late, 5% genius)
```

### 7. Annual Cycle (Simplified)

```
April:    Middle school entry/promotion, high school entry
May-July: Spring tournaments
Aug-Dec:  Scouting active for middle school grade 3
Jan-Feb:  Enrollment decision finalized
Mar 31:   Graduation
Apr 1:    New year (all transitions)
```

### 8. Key Functions

**worldState.ts**:
- `createEmptyYearResults()`
- `createDefaultWeeklyPlan()`
- `createInitialSeasonState()`

**hydrate.ts**:
- `hydratePlayer(blueprint, state, year)` → Player
- `dehydratePlayer(player, state)` → State
- `convertToHighSchoolPlayer(ms, year, facilities, rng)` → Player

**year-transition.ts**:
- `processYearTransition(world, rng)` → WorldState
- Internal: `graduateSeniors()`, `assignMiddleSchoolersToHighSchools()`, `generateNewMiddleSchoolers()`

**world-ticker.ts**:
- `advanceWorldDay(world, menuId, rng)` → {nextWorld, result}
- Internal: `advanceSchoolFull()`, `advanceSchoolStandard()`, `advanceSchoolMinimal()`, `advanceMiddleSchool()`

**tier-manager.ts**:
- `updateSimulationTiers(world, recentlyFaced, schoolTournamentCounts)` → WorldState
- `applyTournamentFacing(world, facedIds)` → WorldState

**growth-curve.ts**:
- `peakMultiplier(age, peakAge, peakWidth)` → 0.2-1.5
- `calculateStatGainV3(curve, ctx, rng)` → number
- Helpers: `moodMultiplier()`, `fatigueMultiplier()`, `traitMultiplier()`, `ceilingPenalty()`

**school-generator.ts**:
- `generateAISchools(playerSchool, prefecture, year, rng)` → HighSchool[] (47)

**create-world.ts**:
- `createWorldState(team, manager, prefecture, seed, rng)` → WorldState

**person-state.ts**:
- Types: `PersonState`, `PersonStage`, `PersonRegistry`, `PersonRegistryEntry`
- Factories: `createEmptyCumulativeGrowth()`, `createEmptyCareerRecord()`

**person-blueprint.ts**:
- Type: `PersonBlueprint` (DB-immutable), `GrowthProfile`, `StatGrowthCurve`

### 9. Data Model Diagram

```
WorldState
├─ schools: HighSchool[] (48)
│  ├─ id, name, prefecture, reputation
│  ├─ players: Player[] (20-25 per school)
│  ├─ simulationTier: 'full'|'standard'|'minimal'
│  ├─ coachStyle: {...offenseType, defenseType, practiceEmphasis, aggressiveness}
│  ├─ yearResults: {summerBestRound, autumnBestRound, koshienAppearance, ...}
│  └─ lineup: Lineup | null
├─ middleSchoolPool: MiddleSchoolPlayer[] (500+)
│  ├─ id
│  ├─ firstName, lastName
│  ├─ middleSchoolGrade: 1|2|3
│  ├─ currentStats: PlayerStats
│  ├─ targetSchoolId: string | null (set by Feb)
│  └─ scoutedBy: string[] (high school IDs)
├─ personRegistry: PersonRegistry
│  └─ entries: Map<id, PersonRegistryEntry>
│     ├─ retention: 'full'|'tracked'|'archived'|'forgotten'
│     ├─ stage: PersonStage (discriminated union)
│     ├─ state?: PersonState (if full)
│     └─ graduateSummary?: {...} (if tracked)
└─ currentDate, manager, settings, weeklyPlan, seasonState, ...

PersonBlueprint (DB, immutable)
├─ id, generationId
├─ firstName, lastName, birthYear
├─ prefecture, hometown, middleSchool
├─ height, weight, throwingHand, battingSide
├─ primaryPosition, subPositions
├─ traits, personality
├─ initialStats (at middle school entry)
├─ ceilingStats (peak possible)
└─ growthProfile: {growthType, curves[stat], slumpRisk, ...}
```

### 10. Phase 3.5 Implementation Checklist

**Week 1**:
- [ ] MiddleSchoolPlayer integration with PersonRegistry
- [ ] Update year-transition.ts Step 3 to use recruitment logic
- [ ] Scouting system (visibility, cost, tracking)
- [ ] Recruitment/persuasion system

**Week 1.5**:
- [ ] Draft system skeleton
- [ ] Integration tests for 3-year middle school cycle
- [ ] Integration tests for scouting → recruitment → enrollment
- [ ] Tier equivalence tests (if not done in Phase 3.0)

**Completion criteria**:
- Middle school student can be generated, scout, recruited, enrolled, graduated
- ID preserved throughout
- PersonRegistry tracks all stages
- 10-year run stable (roster sizes maintained)

### 11. Testing Checklist

**Tier Equivalence** (if not in Phase 3.0):
- Same player in Tier 1 (daily) vs Tier 2 (batch) vs Tier 3 (weekly)
- Compare stats after 1 year → ±10-15% tolerance
- Match scores: runGame vs quickGame vs statGame ±5-10%

**Lifecycle**:
- Middle school grade 1 generated with ID X
- Grown for 3 years
- Converted to high school with same ID X
- Grown for 3 years
- Graduated with same ID X in registry
- Can track all stages by ID

**Scouting**:
- Scout a student → visibility increases
- Can view detailed stats after multiple scouts
- Recruitment offer sent → targetSchoolId set
- On April 1, enrolled to target school

**Enrollment**:
- Recruited students prioritized to target schools
- Unrecruited students assigned by reputation weighting
- Each school gets 3-18 students (including recruited + backup)
- No student assigned to multiple schools

**Draft** (TBD design):
- All graduating 3rd-year students eligible
- Pick order: TBD (snake? random? strength-based?)
- Pro/University/Corporate assignments

### 12. RNG Usage Pattern

```typescript
// Always use derived RNGs for reproducibility
const schoolRng = rng.derive(`school:${school.id}`);
const playerRng = schoolRng.derive(`player:${player.id}`);
const statRng = playerRng.derive(`stat:contact`);
const value = statRng.intBetween(0, 100);

// Never use Math.random()
// Always specify seed at WorldState creation
```

### 13. Cache Invalidation

After any player list mutation:
```typescript
school = {
  ...school,
  players: updatedPlayers,
  _summary: null,  // CRITICAL: Invalidate cache
};
```

### 14. Performance Targets

- **1 year**: < 60 seconds
- **5 years**: < 5 minutes
- **20 years**: < 20 minutes
- **Memory**: < 50 MB for complete state
- **Save**: < 5 MB (JSON)

### 15. Integration Test Template

```typescript
describe('Phase 3.5 Middle School Integration', () => {
  it('middle school student → high school → graduate preserves ID', () => {
    // Create world
    // Generate middle schooler
    // Advance 3 years
    // Convert to high school
    // Advance 3 years
    // Graduate
    // Verify same ID throughout PersonRegistry
  });
  
  it('scouting → recruitment → enrollment workflow', () => {
    // Player scouts middle schooler
    // Player recruits with persuasion
    // Advance to April 1
    // Verify student enrolled to target school
  });
  
  it('20-year run maintains population stability', () => {
    // Run 20 years
    // Verify each school has 15-30 players
    // Verify middle school pool has 400-700 students
    // Verify roster turnover is healthy
  });
});
```

---

**Key Files to Modify in Phase 3.5**:
1. `year-transition.ts` - Step 3 logic (enrollment from pool instead of random)
2. `person-state.ts` - Add MiddleSchoolPlayer to PersonRegistry
3. New: `middle-school/growth.ts` - Middle school specific growth
4. New: `middle-school/scouting.ts` - Visibility & tracking
5. New: `middle-school/recruitment.ts` - Persuasion logic
6. New: `middle-school/draft.ts` - Draft system
7. Update: Tests for all above

