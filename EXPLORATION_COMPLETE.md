# Koushien-Sim Project: Complete Codebase Exploration ✅

**Date:** April 17, 2026  
**Project:** 甲子園への道 (Road to Koshien) — High School Baseball Simulation  
**Status:** Phase 8 Complete (Local Save/Load), Exploration Complete for Phase 9

---

## What You Asked For

> "Explore the koushien-sim project and give me a comprehensive overview including:
> 1. Full directory structure
> 2. Dependencies & scripts
> 3. Middleware & configuration
> 4. Main pages & layouts
> 5. Save-related files
> 6. Type definitions
> 7. TypeScript config
> 8. Testing setup"

✅ **All completed.** Three detailed documents have been generated.

---

## Generated Documentation

### 1. **PHASE9_ARCHITECTURE_OVERVIEW.md** (1,108 lines)
**The complete technical reference**

This is your primary resource for understanding the codebase. It contains:
- ✅ Full src/ directory structure with descriptions
- ✅ All dependencies explained
- ✅ Architecture overview diagrams
- ✅ Core systems (WorldState, Game Progression, Zustand Store)
- ✅ Current Save System (Phase 8) deep dive
- ✅ All 9 app pages documented
- ✅ Complete type definitions
- ✅ Testing setup
- ✅ Integration points
- ✅ **Phase 9 implementation notes (detailed)**

**Use this when you need:**
- Understanding how the game engine works
- Seeing the full data flow
- Understanding the current save system
- Planning Phase 9 architecture changes
- Reference for type definitions
- Database schema examples for Phase 9

---

### 2. **PHASE9_QUICK_START.md** (599 lines)
**The implementation playbook for Phase 9**

Quick, actionable guide for implementing cloud save + auth + school selection:
- 📋 30-second project summary
- 📁 New directory structure for Phase 9
- 🎯 Key decision points with recommendations
- 🛣️ 7-phase implementation roadmap (timeline included)
- 💻 Code patterns & conventions
- ⚙️ Environment variables to add
- 📝 Key files to modify
- ✓ Quick implementation checklist
- 🚨 Common pitfalls & solutions

**Use this when you need:**
- To start implementing Phase 9
- Quick reference for code patterns
- Understanding what to build next
- Code examples (Zustand, API routes, protected pages)
- Implementation checklist

---

### 3. **PHASE9_ARCHITECTURE_DIAGRAM.txt** (356 lines)
**Visual system architecture**

ASCII diagrams showing:
- Client-side structure (Next.js pages → Zustand → Storage)
- Server-side structure (API routes → Middleware → Database)
- Data flow: User saves to cloud
- Data flow: User logs in
- Modified components in Phase 9
- Environment variables structure
- Implementation timeline (weeks/days)

**Use this when you need:**
- Quick visual understanding of the system
- Explaining architecture to others
- Database schema visualization
- Understanding data flow
- Planning implementation phases

---

## Key Findings: Project Structure

### Technology Stack
| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router) |
| **Frontend** | React 19.2.4 |
| **State** | Zustand 5.0.12 |
| **Storage** | Browser localStorage (4MB limit) |
| **Testing** | Vitest 4.1.4 + Happy-DOM |
| **Language** | TypeScript 5 (strict mode) |
| **Deployment** | Vercel |

### Current Architecture (Phase 8)

```
┌─────────────────────────────────────────┐
│      Next.js Pages (9 game screens)     │
├─────────────────────────────────────────┤
│  useWorldStore (Zustand) ← Central hub  │
├─────────────────────────────────────────┤
│   Game Engine (World Simulation)        │
├─────────────────────────────────────────┤
│ Save System: localStorage (6 slots)     │
└─────────────────────────────────────────┘
```

### Current Save System (Phase 8)

**Storage:** Browser `localStorage`
- **3 Manual slots:** `world_slot_1`, `world_slot_2`, `world_slot_3`
- **3 Auto slots:** 
  - `world_auto_year` (Year-end protected)
  - `world_auto_monthly` (Monthly rotation)
  - `world_pre_tournament` (Pre-tournament backup)

**Per save:** ~200-500 KB (WorldState is large)
**Storage limit:** 4MB with warning at 75%

**Format:**
```
Key: "koushien_save_world_slot_1"
Value: {
  slotId: string,
  meta: { schoolName, managerName, date, phase, winRate, ... },
  stateJson: string (full WorldState serialized),
  checksum: string (SHA-256)
}
```

### Main Pages
1. `/` — Home hub (practice, progress, news)
2. `/team` — Roster & lineup management
3. `/team/[playerId]` — Player detail
4. `/scout` — Recruit/scout players
5. `/tournament` — Bracket & schedule
6. `/results` — Match history
7. `/news` — News feed
8. `/ob` — Alumni
9. `/school/[schoolId]` — School detail

### Root Layout
- **SSR-safe** — Can run on server
- **No middleware yet** — Simple pass-through
- **Metadata set** — Title, description, viewport

---

## Critical Files for Implementation

### For Understanding the Game
- `src/engine/world/world-state.ts` — Game state structure
- `src/engine/world/world-ticker.ts` — Day-by-day progression
- `src/stores/world-store.ts` — Game state management

### For Save/Load (Phase 8)
- `src/engine/save/world-save-manager.ts` — Main save API (localStorage)
- `src/engine/save/world-serializer.ts` — Serialization logic
- `src/app/save/SaveLoadPanel.tsx` — UI modal component

### For Phase 9 Implementation
- `src/app/page.tsx` — Will need auth redirect check
- `src/app/save/SaveLoadPanel.tsx` — Will add cloud save section
- `src/stores/world-store.ts` — Will add cloud methods
- `src/middleware.ts` — **NEW** — Token validation
- `src/app/api/` — **NEW** — API routes

---

## Phase 9 At A Glance

### What Gets Added
1. **Authentication** — Email/password login (Firebase or custom JWT)
2. **Cloud Saves** — Sync saves to backend (MongoDB/Firebase)
3. **School Selection** — Choose from 47 schools before game
4. **Middleware** — Protect API routes with tokens
5. **Database** — Store users, saves, and schools

### Implementation Phases
1. **Auth Backend** (2-3 days) — Login/signup endpoints
2. **Auth UI + Store** (1-2 days) — Frontend auth interface
3. **Cloud Save Endpoints** (2-3 days) — /api/saves/* routes
4. **SaveLoadPanel Integration** (1 day) — Show cloud saves
5. **School Selection** (2 days) — Choose school UI
6. **Middleware** (1 day) — Token validation
7. **Testing & Polish** (2-3 days) — E2E tests

**Total:** ~10-12 days of development

### Key Decision Points
- **Auth:** Email/password (recommended) vs OAuth
- **Database:** Firebase (recommended) vs MongoDB
- **Encryption:** Client-side (optional) vs HTTPS only
- **Sync:** Auto (recommended) vs on-demand

---

## Quick Reference: File Locations

### Game Logic
- **World State:** `src/engine/world/world-state.ts`
- **Progression:** `src/engine/world/world-ticker.ts`
- **Tournament:** `src/engine/world/tournament-bracket.ts`
- **Scout System:** `src/engine/world/scout/scout-system.ts`
- **Player Gen:** `src/engine/player/generate.ts`
- **Growth System:** `src/engine/growth/*`

### State Management
- **Main Store:** `src/stores/world-store.ts`
- **Auth Store (NEW):** Will be at `src/stores/auth-store.ts`
- **Legacy Store:** `src/stores/game-store.ts` (unused)

### UI
- **Pages:** `src/app/*/page.tsx`
- **Save/Load:** `src/app/save/SaveLoadPanel.tsx`
- **Projectors:** `src/ui/projectors/*.ts` (WorldState → ViewState)

### Save System
- **Main API:** `src/engine/save/world-save-manager.ts`
- **Serializer:** `src/engine/save/world-serializer.ts`
- **Cloud (NEW):** Will be at `src/engine/save/cloud-save-manager.ts`

### API Routes (Phase 9)
- **Auth:** `src/app/api/auth/*.ts` (NEW)
- **Saves:** `src/app/api/saves/*.ts` (NEW)
- **Schools:** `src/app/api/schools/route.ts` (NEW)

### Configuration
- **Next.js Config:** `next.config.ts`
- **TypeScript Config:** `tsconfig.json`
- **Test Config:** `vitest.config.ts`

### Types
- **Game Types:** `src/engine/types/*`
- **ViewState:** `src/ui/projectors/view-state-types.ts`
- **Save Metadata:** `src/engine/save/world-save-manager.ts`

### Tests
- **E2E:** `tests/e2e/full-season.test.ts`
- **Engine:** `tests/engine/*`
- **Stores:** `tests/stores/*.test.ts`

---

## Development Workflow

### Running the Project
```bash
# Development
npm run dev          # Hot reload at http://localhost:3000

# Build
npm run build        # Next.js build

# Production
npm run start        # Serve production build

# Testing
npm test             # Run Vitest
npm test -- --ui    # Vitest UI
```

### Key Dependencies
```json
{
  "next": "16.2.3",          // Framework
  "react": "19.2.4",         // UI library
  "zustand": "5.0.12",       // State management
  "dexie": "4.4.2",          // IndexedDB wrapper (future use)
  "seedrandom": "3.0.5",     // Deterministic RNG
  "vitest": "4.1.4",         // Test framework
  "typescript": "5"          // Language
}
```

---

## Testing Strategy

### Current (Phase 8)
- **Engine tests:** Growth, player gen, tournament simulation
- **E2E test:** Full 5-year season simulation
- **Store test:** Zustand store behavior

### Phase 9 Will Add
- **Auth tests:** Signup, login, token refresh
- **Save tests:** Local + cloud sync
- **API tests:** Endpoint validation
- **Integration tests:** Auth + Save + School selection

### Test Setup
- **Framework:** Vitest (Jest-compatible)
- **Environment:** Happy-DOM (lightweight browser simulator)
- **Patterns:** Describe/it, async/await, mocking

---

## Known Limitations & Notes

### Phase 8 (Current)
- ✅ Game is fully playable offline
- ✅ Saves only use browser localStorage
- ✅ No user accounts
- ✅ No cross-device sync
- ✅ No cloud backup

### Phase 9 Will Solve
- 🔐 User authentication
- ☁️ Cloud backup & sync
- 🎯 School selection before game
- 🔄 Cross-device gameplay
- 📊 Server-side analytics (future)

### Not in Scope (Phase 10+)
- Password reset flows
- OAuth (Google/GitHub login)
- Advanced analytics
- Leaderboards
- Multiplayer
- Mobile app (web-only)

---

## How to Use These Documents

### I want to **understand the codebase**
→ Read `PHASE9_ARCHITECTURE_OVERVIEW.md` (sections 1-9)

### I want to **understand Phase 9 changes**
→ Start with `PHASE9_QUICK_START.md` (30-second summary)
→ Then read `PHASE9_ARCHITECTURE_OVERVIEW.md` (section 10)

### I want to **start implementing Phase 9**
→ Use `PHASE9_QUICK_START.md` (roadmap + code patterns)
→ Refer to `PHASE9_ARCHITECTURE_DIAGRAM.txt` (data flows)
→ Check `PHASE9_ARCHITECTURE_OVERVIEW.md` for details

### I want to **explain this to someone**
→ Show them `PHASE9_ARCHITECTURE_DIAGRAM.txt` (visual overview)
→ Use `PHASE9_QUICK_START.md` for decisions
→ Reference `PHASE9_ARCHITECTURE_OVERVIEW.md` for deep dives

### I want to **find a specific file**
→ Use "Quick Reference: File Locations" section in this document

### I want to **understand the current save system**
→ Read `PHASE9_ARCHITECTURE_OVERVIEW.md` section 5 (Phase 8 Save System)

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| **Source files (.ts/.tsx)** | 50+ |
| **Game pages** | 9 |
| **Save slots** | 6 |
| **Type files** | 5 |
| **Store hooks** | 2 |
| **Test directories** | 7 |
| **Engine modules** | 10+ |
| **UI projectors** | 7 |
| **Lines of code (src/)** | ~10,000+ |
| **Documentation generated** | 2,063 lines |
| **Estimated Phase 9 effort** | 10-12 days |

---

## Next Steps

### If you're ready to build Phase 9:
1. Read `PHASE9_QUICK_START.md` thoroughly
2. Make key architecture decisions (auth, database, encryption)
3. Set up backend infrastructure (Firebase/MongoDB)
4. Start with Phase 9.1 (Auth Backend)
5. Use `PHASE9_ARCHITECTURE_DIAGRAM.txt` as reference
6. Follow code patterns from `PHASE9_QUICK_START.md`

### If you need clarification:
1. Refer to `PHASE9_ARCHITECTURE_OVERVIEW.md` for deep dives
2. Check "Quick Reference" section for file locations
3. Review code patterns in `PHASE9_QUICK_START.md`

### If you want to understand Phase 8:
1. Read `PHASE9_ARCHITECTURE_OVERVIEW.md` sections 1-9
2. Focus on save-related files listed above
3. Review test examples in Phase 8

---

## Document Index

```
📄 PHASE9_ARCHITECTURE_OVERVIEW.md
   ├─ 1. Project Structure
   ├─ 2. Dependencies & Scripts
   ├─ 3. Architecture Overview
   ├─ 4. Core Systems
   ├─ 5. Current Save System (Phase 8)
   ├─ 6. App Pages & Routes
   ├─ 7. Type Definitions
   ├─ 8. Testing Setup
   ├─ 9. Key Integration Points
   └─ 10. Phase 9 Implementation Notes

📄 PHASE9_QUICK_START.md
   ├─ 30-Second Summary
   ├─ File Structure for Phase 9
   ├─ Key Decision Points
   ├─ Implementation Roadmap (7 phases)
   ├─ Code Patterns & Conventions
   ├─ Environment Variables
   ├─ Key Files to Modify
   ├─ Quick Checklist
   ├─ Common Pitfalls & Solutions
   └─ Resources & Links

📄 PHASE9_ARCHITECTURE_DIAGRAM.txt
   ├─ Full System Architecture (Client + Server)
   ├─ Data Flow: User Saves to Cloud
   ├─ Data Flow: User Logs In
   ├─ Modified Components in Phase 9
   ├─ Environment Variables
   └─ Implementation Timeline

📄 EXPLORATION_COMPLETE.md (this file)
   ├─ Overview of all documents
   ├─ Quick reference guide
   ├─ File locations
   └─ How to use these documents
```

---

## Final Notes

✅ **Exploration complete.** All requested information is documented:
- ✅ Full directory structure
- ✅ Dependencies & scripts
- ✅ Middleware & configuration (none exists yet)
- ✅ Main pages & layouts
- ✅ Save-related files (detailed)
- ✅ Type definitions (complete)
- ✅ TypeScript config
- ✅ Testing setup
- ✅ **Plus Phase 9 planning** (bonus)

The codebase is well-structured, modern TypeScript, and ready for Phase 9 implementation. The three generated documents provide everything needed to understand the current system and plan the cloud save + auth + school selection features.

**Happy coding! 🚀⚾**

