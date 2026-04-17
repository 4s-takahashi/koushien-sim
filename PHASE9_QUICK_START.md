# Phase 9 Implementation Quick Start

**Status:** Planning phase for Cloud Save + Login + School Selection  
**Target:** Add authentication and cloud synchronization to existing Phase 8 (local save/load)

---

## 30-Second Summary

### What is Already Built (Phase 8)
- ✅ Complete game engine (world simulation)
- ✅ Zustand store (`useWorldStore()`) manages WorldState
- ✅ Local save/load with 6 slots (3 manual + 3 auto) using localStorage
- ✅ Save panel UI (`SaveLoadPanel.tsx`) with modal
- ✅ Serialization & checksum validation
- ✅ 9 game pages (home, team, scout, tournament, results, etc.)

### What Phase 9 Adds
- 🔐 **Authentication** — Signup/login endpoints + Auth store
- ☁️ **Cloud Sync** — Save to backend + download on other devices
- 🏫 **School Selection** — Choose school before game instead of setup form
- 🔄 **Middleware** — Token validation for protected API routes
- 📊 **Database** — Store users and saves (MongoDB/Firebase)

---

## File Structure for Phase 9

### NEW Directories
```
src/
├── app/
│   ├── auth/                    # NEW
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── auth.module.css
│   ├── api/                     # NEW
│   │   ├── auth/
│   │   │   ├── signup/route.ts
│   │   │   ├── login/route.ts
│   │   │   ├── logout/route.ts
│   │   │   └── refresh/route.ts
│   │   ├── saves/
│   │   │   ├── route.ts         # GET /api/saves (list), POST (create)
│   │   │   └── [saveId]/route.ts # GET/PUT/DELETE
│   │   └── schools/
│   │       └── route.ts         # GET /api/schools
│   ├── school-select/          # NEW
│   │   ├── page.tsx
│   │   └── school-select.module.css
│   └── dashboard/              # NEW
│       └── page.tsx             # Post-login hub
│
├── middleware.ts               # NEW - Auth & token validation
│
├── stores/
│   ├── world-store.ts          # MODIFIED - add cloud sync methods
│   ├── auth-store.ts           # NEW
│   └── game-store.ts           # (unchanged)
│
├── engine/
│   ├── save/
│   │   ├── world-save-manager.ts   # MODIFIED - add cloud methods
│   │   ├── cloud-save-manager.ts   # NEW
│   │   └── sync-manager.ts         # NEW - conflict resolution
│   └── auth/                       # NEW
│       └── jwt-utils.ts            # Token encode/decode
│
├── api/                        # NEW - API helpers
│   ├── auth-client.ts          # Fetch wrapper for auth endpoints
│   └── save-client.ts          # Fetch wrapper for save endpoints
│
└── lib/                        # NEW - Utilities
    ├── encryption.ts           # Encrypt/decrypt saves (optional)
    └── constants.ts            # API endpoints, endpoints
```

### MODIFIED Directories
```
src/
├── app/
│   ├── page.tsx                # MODIFIED - add "Cloud Login" button, show auth state
│   └── save/
│       └── SaveLoadPanel.tsx   # MODIFIED - show cloud saves, sync status
│
└── stores/
    └── world-store.ts          # MODIFIED - add cloud sync actions
```

---

## Key Decision Points

### 1. Authentication Strategy
```
Option A: Email + Password (traditional)
├─ Pro: Simple, familiar
└─ Con: Need password reset, account recovery

Option B: OAuth (Google/GitHub login)
├─ Pro: No password management
└─ Con: External dependency

Recommendation for MVP: Option A (email/password)
```

### 2. Storage Layer
```
Option A: MongoDB (Atlas)
├─ Pro: Flexible schema, generous free tier
└─ Con: Need to manage connection

Option B: Firebase (Firestore/Auth)
├─ Pro: Managed, auth included
└─ Con: Vendor lock-in

Recommendation for MVP: Firebase (faster setup)
```

### 3. Save Encryption
```
Option A: Encrypt client-side before sending
├─ Pro: Maximum privacy, server can't read
└─ Con: Complex, key management issues

Option B: HTTPS + database encryption
├─ Pro: Simple, industry standard
└─ Con: Server can decrypt (less private)

Recommendation for MVP: Option B
```

### 4. Sync Strategy
```
Option A: Always sync to cloud (auto)
├─ Pro: Never lose data
└─ Con: Slower saves, network required

Option B: On-demand sync button
├─ Pro: Fast, works offline
└─ Con: Can lose data if device dies

Recommendation for MVP: Option B (with warning)
```

---

## Implementation Roadmap

### Phase 9.1: Authentication Backend (2–3 days)

**Endpoints:**
```
POST /api/auth/signup
{
  email: string;
  password: string;
  displayName: string;
}
→ { success: boolean; userId?: string; token?: string; error?: string }

POST /api/auth/login
{ email: string; password: string }
→ { success: boolean; token?: string; refreshToken?: string; error?: string }

POST /api/auth/refresh
{ refreshToken: string }
→ { token: string }

POST /api/auth/logout
→ { success: boolean }
```

**Database:**
```
users {
  _id: ObjectId;
  email: string (unique);
  passwordHash: string (bcrypt);
  displayName: string;
  createdAt: Date;
  lastLogin: Date;
}
```

**Steps:**
1. Create Next.js API routes in `src/app/api/auth/`
2. Set up Firebase Auth or custom JWT
3. Hash passwords with bcrypt
4. Implement token refresh logic
5. Test with Vitest + Mock Fetch

---

### Phase 9.2: Auth UI + Store (1–2 days)

**Components:**
- `src/app/auth/login/page.tsx` — Email/password form
- `src/app/auth/signup/page.tsx` — Registration form
- `src/stores/auth-store.ts` — Zustand auth state

**Auth Store Interface:**
```typescript
interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  signup(email: string, password: string, displayName: string): Promise<void>;
  login(email: string, password: string): Promise<void>;
  logout(): void;
  restoreSession(): Promise<void>;  // Called on app load
}
```

**Features:**
- Form validation
- Loading states
- Error messages
- Redirect to home on success
- Persist token to localStorage
- Restore session on page reload

---

### Phase 9.3: Cloud Save Endpoints (2–3 days)

**Endpoints:**
```
GET /api/saves
→ { saves: CloudSaveSlot[] }

POST /api/saves
{ displayName: string; worldState: WorldState; slotId?: string }
→ { success: boolean; saveId: string; error?: string }

GET /api/saves/[saveId]
→ { save: CloudSaveSlot }

PUT /api/saves/[saveId]
{ worldState: WorldState; slotId?: string }
→ { success: boolean }

DELETE /api/saves/[saveId]
→ { success: boolean }
```

**Database:**
```
saves {
  _id: ObjectId;
  userId: ObjectId (FK users._id);
  displayName: string;
  schoolName: string;
  currentDate: { year, month, day };
  stateJson: string;
  checksum: string;
  createdAt: Date;
  updatedAt: Date;
  isLocalOnly: boolean;
  version: number;  // For conflict resolution
}
```

**Steps:**
1. Create `/api/saves/*` routes
2. Implement DB schema
3. Add SaveCloud type to engine/save
4. Update saveWorldState to include cloud option
5. Test upload/download/delete

---

### Phase 9.4: SaveLoadPanel Integration (1 day)

**Changes:**
```typescript
// SaveLoadPanel.tsx now shows:
- Local saves (as before, with "Sync to Cloud" button)
- Cloud saves (if logged in)
- Sync status indicator
- Conflict resolution UI (if local ≠ cloud)
```

**New UI Elements:**
- Login button (if not authenticated)
- Sync indicator (pending, success, error)
- Cloud save list + download button
- "Download from Cloud" section

---

### Phase 9.5: School Selection Screen (2 days)

**Files:**
- `src/app/school-select/page.tsx` — Grid of all 47 schools
- `src/app/api/schools/route.ts` — GET schools list
- Database: `schools` collection (seeded with all 47 prefectural schools)

**Flow:**
```
User logs in
  ↓
Redirected to /school-select
  ↓
Shows grid of 47 schools with reputation/playstyle
  ↓
User clicks school
  ↓
newWorldGame({ schoolName, prefecture, ... })
  ↓
Game starts
```

**Schools Data:**
```typescript
interface SchoolData {
  id: string;
  name: string;
  prefecture: string;
  historicalReputation: number;
  suggestedPlaystyle: 'aggressive' | 'defensive' | 'balanced';
  description: string;  // "Powerhouse", "Rising", "Underdog", etc.
}
```

---

### Phase 9.6: Middleware + Protected Routes (1 day)

**middleware.ts:**
```typescript
// Intercept all /api/saves requests
// Verify token in Authorization header
// Attach user info to request context
// Redirect /dashboard if not authenticated
```

**Protected Routes:**
- `/api/saves/*`
- `/api/auth/refresh`
- `/dashboard`

---

### Phase 9.7: Testing & Polish (2–3 days)

**Test Files:**
```
tests/
├── api/
│   ├── auth.test.ts      # Signup, login, token refresh
│   └── saves.test.ts     # Create, list, delete saves
├── stores/
│   └── auth-store.test.ts
└── engine/
    └── save/
        └── cloud-save-manager.test.ts
```

**E2E Test:**
```
1. Signup new account
2. Create game
3. Save locally
4. Save to cloud
5. Logout
6. Login
7. Load from cloud
8. Verify world state intact
```

---

## Code Patterns & Conventions

### Zustand Store Pattern
```typescript
// stores/auth-store.ts
import { create } from 'zustand';

interface AuthStore {
  user: User | null;
  isLoading: boolean;
  
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  isLoading: false,
  
  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const { token, user } = await res.json();
      localStorage.setItem('auth_token', token);
      set({ user, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },
  
  logout: () => {
    localStorage.removeItem('auth_token');
    set({ user: null });
  },
}));
```

### API Endpoint Pattern
```typescript
// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    
    // Validate
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password required' },
        { status: 400 },
      );
    }
    
    // Check user in DB
    const user = await db.users.findOne({ email });
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 },
      );
    }
    
    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 },
      );
    }
    
    // Generate token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
    
    return NextResponse.json({ token, user: { id: user._id, email: user.email } });
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
```

### Protected Page Pattern
```typescript
// app/dashboard/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading, restoreSession } = useAuthStore();
  
  useEffect(() => {
    restoreSession().then(() => {
      if (!user) router.push('/auth/login');
    });
  }, []);
  
  if (isLoading) return <LoadingSpinner />;
  if (!user) return null;
  
  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome, {user.email}</p>
    </div>
  );
}
```

---

## Environment Variables (to add)

```env
# .env.local (NOT committed to git!)

# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/koushien
# OR
FIREBASE_PROJECT_ID=...
FIREBASE_PRIVATE_KEY=...
FIREBASE_CLIENT_EMAIL=...

# Auth
JWT_SECRET=your-secret-key-here
JWT_EXPIRATION=7d
REFRESH_TOKEN_SECRET=another-secret

# API
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_APP_ENV=development
```

---

## Key Files to Modify

| File | Change | Impact |
|------|--------|--------|
| `src/app/page.tsx` | Add login redirect check, show "Cloud Login" button | Home now requires auth (optional) |
| `src/app/save/SaveLoadPanel.tsx` | Add cloud save list, sync button | Users can see & manage cloud saves |
| `src/stores/world-store.ts` | Add `saveToCloud()`, `loadFromCloud()`, `syncSave()` | Save system aware of cloud |
| `src/engine/save/world-save-manager.ts` | Keep local logic, add optional cloud param | No breaking changes |
| `src/middleware.ts` | NEW — Token validation | API routes protected |
| `next.config.ts` | Add env vars, redirect rules (maybe) | Deployment config |

---

## Quick Checklist

### Backend Setup
- [ ] Choose database (Firebase vs MongoDB)
- [ ] Setup auth (Firebase Auth vs custom JWT)
- [ ] Create API routes (`/api/auth/*`, `/api/saves/*`)
- [ ] Deploy backend (Vercel/Cloud Run)
- [ ] Test endpoints with Postman

### Frontend Setup
- [ ] Create auth store (`auth-store.ts`)
- [ ] Create auth pages (`/auth/login`, `/auth/signup`)
- [ ] Create school selection (`/school-select`)
- [ ] Update `SaveLoadPanel.tsx` with cloud UI
- [ ] Add middleware for protected routes

### Database
- [ ] Users table (email, passwordHash, etc.)
- [ ] Saves table (userId, worldState, etc.)
- [ ] Schools table (all 47 prefectural schools)
- [ ] Create indexes (users.email, saves.userId)

### Testing
- [ ] Auth flow E2E test
- [ ] Cloud save/load test
- [ ] Conflict resolution test
- [ ] Token refresh test

### Deployment
- [ ] Set env vars on Vercel
- [ ] Test staging deployment
- [ ] Monitor error logs
- [ ] Enable analytics

---

## Common Pitfalls & Solutions

### Problem: Token expires mid-game
**Solution:** Implement silent token refresh (before expiry) using refresh token

### Problem: Network latency during save
**Solution:** Show pending indicator, allow offline save locally, sync when online

### Problem: Save conflicts (local ≠ cloud)
**Solution:** Show both versions, let user choose (cloud has timestamp)

### Problem: CORS errors on API calls
**Solution:** Ensure API routes return proper headers, use credentials: 'include'

### Problem: Password reset requests
**Solution:** Out of scope for MVP, but plan for Phase 10

---

## Resources

- **Next.js API Routes:** https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- **Zustand Docs:** https://github.com/pmndrs/zustand
- **Firebase Auth:** https://firebase.google.com/docs/auth
- **JWT Tokens:** https://jwt.io/
- **Bcrypt:** https://www.npmjs.com/package/bcrypt
- **MongoDB:** https://www.mongodb.com/

