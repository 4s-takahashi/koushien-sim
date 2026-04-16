# Phase 6 Implementation Checklist

## Quick Reference for Development

### Project Status
- **Codebase Size**: ~1,200 LOC (engine), ~500 LOC (UI/stores)
- **Test Coverage**: 446 tests passing (Vitest)
- **Tech Stack**: Next.js 16.2.3, React 19.2.4, TypeScript 5, Zustand 5.0.12
- **Architecture**: Projector pattern (pure ViewState generators)

---

## Feature 1: Save/Load System Enhancement

### Phase 6.1a: SaveManager Extension
- [ ] Create `WorldStateSaveManager` interface
- [ ] Extend `save-manager.ts` to accept `WorldState`
- [ ] Update version to `2.0.0`
- [ ] Implement version migration logic (1.0.0 → 2.0.0)
- [ ] Add `saveWorldGame()`, `loadWorldGame()` methods
- [ ] Write 8+ tests for serialization/deserialization

**Files to Modify:**
```
src/engine/save/save-manager.ts
src/engine/save/serializer.ts
src/stores/world-store.ts
```

**Key Functions:**
```typescript
interface WorldSaveData {
  slotId: string;
  version: string;
  worldStateJson: string;
  checksum: string;
  savedAt: number;
}

function serializeWorldState(state: WorldState): string
function deserializeWorldState(json: string): WorldState
function migrateV1toV2(v1State: any): WorldState
```

### Phase 6.1b: Save/Load UI
- [ ] Create `src/app/save/page.tsx`
- [ ] Design save slot list interface
- [ ] Add load/delete/export/import buttons
- [ ] Create modal for save slot details
- [ ] Integrate with world-store actions
- [ ] Add confirmation dialogs

**UI Components Needed:**
- SaveSlotList (displays all saves)
- SaveSlotCard (individual save preview)
- SaveDialog (create new save)
- ConfirmDialog (delete/overwrite)

### Phase 6.1c: Auto-save Integration
- [ ] Add `autoSaveEnabled` flag to GameSettings
- [ ] Create auto-save hook (saves every 5-10 minutes)
- [ ] Add auto-save indicator to UI
- [ ] Implement recovery from auto-save
- [ ] Write integration tests

---

## Feature 2: Tournament UI Enhancement

### Phase 6.2a: Tournament Data Structure
- [ ] Define `Tournament` interface in world-state.ts
- [ ] Create `TournamentBracket` type
- [ ] Add tournament fields to `WorldState`
- [ ] Implement tournament scheduling logic
- [ ] Write data structure tests

**Key Types:**
```typescript
interface Tournament {
  id: string;
  name: string;
  season: 'spring' | 'summer' | 'autumn' | 'koshien';
  startDate: GameDate;
  endDate: GameDate;
  teams: string[];  // school IDs
  bracket: BracketMatch[];
  currentRound: number;
  isCompleted: boolean;
}

interface BracketMatch {
  id: string;
  round: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  result?: MatchResult;
  scheduledDate?: GameDate;
}
```

### Phase 6.2b: Tournament Projector
- [ ] Implement `projectTournament()` function
- [ ] Generate active tournament list
- [ ] Calculate bracket positions
- [ ] Format tournament progress
- [ ] Add tournament-specific highlights
- [ ] Write 10+ projector tests

**Function Signature:**
```typescript
function projectTournament(worldState: WorldState): TournamentViewState
```

### Phase 6.2c: Tournament UI Rendering
- [ ] Create `tournament/page.tsx`
- [ ] Design bracket visualization
- [ ] Add match schedule display
- [ ] Show team advancement
- [ ] Display completed tournament history
- [ ] Add team standings table

---

## Feature 3: Match Display Enhancement

### Phase 6.3a: InningResult in MatchResult
- [ ] Modify `src/engine/match/types.ts`
- [ ] Add optional `inningResults?: InningResult[]` to MatchResult
- [ ] Update game simulation to populate inningResults
- [ ] Test data flow through match pipeline

**Type Change:**
```typescript
interface MatchResult {
  // ... existing fields ...
  inningResults?: InningResult[];  // NEW
  gameLog?: MatchEvent[];          // NEW (optional)
}
```

### Phase 6.3b: ResultsProjector Enhancement
- [ ] Populate `InningScoreView` from inningResults
- [ ] Enhance highlight detection algorithm
- [ ] Improve pitcher summary calculation
- [ ] Add play-by-play flow generation
- [ ] Write 15+ comprehensive tests

**Key Functions to Update:**
```typescript
function buildInningScoreView(inningResults: InningResult[]): InningScoreView
function generateHighlights(inningResults: InningResult[]): MatchHighlightView[]
function buildPitcherSummary(result: MatchResult): PitcherSummaryView
```

### Phase 6.3c: Results Page Enhancement
- [ ] Update `results/page.tsx` UI
- [ ] Add inning-by-inning scoreboard display
- [ ] Create interactive play-by-play viewer
- [ ] Add detailed statistics tables
- [ ] Implement match replay feature

**UI Components:**
- ScoreboardDisplay (inning by inning)
- PlayByPlayViewer (sequential plays)
- MatchStatistics (detailed stats)
- HighlightReel (key moments)

---

## Feature 4: Deploy Preparation

### Phase 6.4a: Build & Performance
- [ ] Run production build: `npm run build`
- [ ] Audit bundle size
- [ ] Test Next.js image optimization
- [ ] Verify API routes (if any)
- [ ] Performance profiling

**Checklist:**
```
[ ] npm run build succeeds
[ ] No TypeScript errors (strict mode)
[ ] No console warnings/errors
[ ] Bundle size < 500KB (initial)
[ ] Lighthouse score > 90
[ ] All tests pass (446/446)
```

### Phase 6.4b: Production Configuration
- [ ] Review next.config.ts for production settings
- [ ] Configure environment variables
- [ ] Set up error logging/monitoring
- [ ] Enable caching headers
- [ ] Configure CORS if needed

### Phase 6.4c: Deployment Testing
- [ ] Test on production-like environment
- [ ] Cross-browser testing (Chrome, Firefox, Safari)
- [ ] Mobile responsiveness testing
- [ ] Save/load functionality in production
- [ ] Auto-save reliability

### Phase 6.4d: Hosting Setup
- [ ] Choose hosting provider (Vercel, Netlify, etc.)
- [ ] Configure CI/CD pipeline
- [ ] Set up domain/DNS
- [ ] Enable HTTPS
- [ ] Configure backups

---

## Testing Checklist

### New Unit Tests Required
- [ ] SaveManager.saveWorldGame()
- [ ] SaveManager.loadWorldGame()
- [ ] Version migration (1.0.0 → 2.0.0)
- [ ] Tournament bracket generation
- [ ] InningResult → ScoreboardView mapping
- [ ] Auto-save trigger and recovery

### Integration Tests
- [ ] Complete save/load cycle
- [ ] Play match → Save → Load → Verify results
- [ ] Tournament progression (multiple rounds)
- [ ] Year transition with tournament data persistence

### UI Tests
- [ ] Save slot rendering
- [ ] Load game from slot
- [ ] Delete save with confirmation
- [ ] Tournament bracket visualization
- [ ] Results scoreboard display

### Performance Tests
- [ ] Save file size < 5 MB
- [ ] Load time < 500ms
- [ ] UI render time < 100ms
- [ ] Tournament bracket render < 200ms

---

## File Modification Summary

### New Files to Create
```
src/engine/save/world-serializer.ts         # WorldState serialization
src/app/save/page.tsx                       # Save/load UI
src/app/save/save-dialog.tsx                # Modal component
src/ui/hooks/useAutoSave.ts                 # Auto-save hook
tests/engine/save/world-save.test.ts        # Tests
tests/ui/projectors/tournamentProjector.test.ts  # Tests
tests/app/save.integration.test.ts          # Integration tests
```

### Existing Files to Modify
```
src/engine/save/save-manager.ts             # Add WorldState support
src/engine/save/serializer.ts               # Add world serialization
src/engine/match/types.ts                   # Add inningResults to MatchResult
src/engine/world/world-state.ts             # Add Tournament type
src/stores/world-store.ts                   # Add save/load actions
src/ui/projectors/tournamentProjector.ts    # Full implementation
src/ui/projectors/resultsProjector.ts       # InningResult processing
src/ui/projectors/view-state-types.ts       # Type expansion
src/app/tournament/page.tsx                 # Tournament UI
src/app/results/page.tsx                    # Enhanced results display
src/app/layout.tsx                          # Add save navigation link
```

---

## Estimated Implementation Timeline

| Task | Estimated Time | Priority |
|------|---|---|
| SaveManager extension | 4 hours | P1 (Critical) |
| Save/load UI | 6 hours | P1 (Critical) |
| Tournament data structure | 3 hours | P2 (High) |
| Tournament projector | 4 hours | P2 (High) |
| Tournament UI | 5 hours | P2 (High) |
| InningResult in MatchResult | 2 hours | P2 (High) |
| Results projector enhancement | 4 hours | P2 (High) |
| Results page UI | 5 hours | P2 (High) |
| Testing (all) | 10 hours | P1 (Critical) |
| Deploy prep & testing | 6 hours | P3 (Medium) |
| **TOTAL** | **49 hours** | **~1 week** |

---

## Validation Criteria

### Save/Load Feature
- ✅ Can save at any point in game
- ✅ Can load and resume from save
- ✅ Auto-save triggers every 5 minutes
- ✅ Export/import saves as base64
- ✅ All tests pass
- ✅ No memory leaks

### Tournament Feature
- ✅ Tournament brackets display correctly
- ✅ Match scheduling works
- ✅ Tournament progress persists across saves
- ✅ Completed tournament history tracks
- ✅ All tests pass

### Results Display
- ✅ Inning-by-inning scoreboard shows
- ✅ Play-by-play flow is accurate
- ✅ Highlights are relevant and limited
- ✅ Statistics are calculated correctly
- ✅ All tests pass

### Deployment
- ✅ Production build succeeds
- ✅ No TypeScript errors in strict mode
- ✅ 446 tests all pass
- ✅ Lighthouse score ≥ 90
- ✅ Successfully deploys to hosting
- ✅ Save/load works in production

---

## Quick Command Reference

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npx vitest

# Run tests with UI
npx vitest --ui

# Build for production
npm run build

# Start production server
npm start

# Type check
npx tsc --noEmit

# Check specific test file
npx vitest src/path/to/test.test.ts
```

---

## Key Documentation Files to Reference

1. **PHASE6_EXPLORATION.md** (this project) — Comprehensive codebase analysis
2. **CODEBASE_GUIDE.md** — Detailed architecture guide
3. **QUICK_REFERENCE.md** — Quick implementation reference
4. **PHASE5_REPORT.md** — Phase 5 completion status
5. **DESIGN-PHASE3-DB.md** — Data model reference

---

## Emergency Rollback Procedure

If something breaks critically:

```bash
# Stash changes
git stash

# Check git log for last good commit
git log --oneline

# Revert to last good state
git reset --hard <commit_hash>

# Restart from clean slate
npm install
npm run dev
```

