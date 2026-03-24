# Heloword React Frontend

## Stack
- React 18 + TypeScript + Vite + Tailwind CSS
- Runs on port 4200 (dev), `npm run dev` to start

## API
- Dev base URL: `/k8s` (proxied to `localhost:9487` via `vite.config.ts`)
- Prod base URL: `/k8s/micro-infra-gateway/v1` (proxied to `heloword.com`)
- Controlled by `VITE_BACKEND_BASE_URL` in `.env.local` (set to `/k8s/micro-infra-gateway/v1` to hit prod from local)
- All calls go through `src/services/api.service.ts` → `doPost()` / `doGet()`
- Common headers (cv, X-REQUEST-ID, Authorization, ChannelCode, ClientIp) injected automatically

## Key services called
- `/service-auth/api/auth/*` — init-cookie, init-cipher, login, logout, Google OAuth
- `/frontend-api/api/fe/user` — session check on app load
- `/frontend-api/api/fe/home/dashboard` — home page word/sentence lists
- `/frontend-api/api/fe/quiz/*` — quiz settings and records

## Project structure
- `src/pages/` — page components (Home, Login, Vocabulary, Review, Stats, Info)
- `src/components/` — shared components (Header, BottomTabs, AlertDialog, etc.)
- `src/contexts/` — React contexts (AuthContext, DataContext, UIContext, ThemeContext)
- `src/services/api.service.ts` — all HTTP calls
- `src/config/environment.ts` — env config
- `vite.config.ts` — dev proxy config

## Backend location
`~/ryan/projects_ryan/heloword-micro/workspace/heloword-micro/microservice`

---

## Main Feature: Ebbinghaus Spaced Repetition

Heloword's core feature is group-based spaced repetition based on the Ebbinghaus forgetting curve.

### Review intervals (default)
| Review | Interval |
|--------|----------|
| 1 | 20 minutes |
| 2 | 1 hour |
| 3 | 8 hours |
| 4 | 1 day |
| 5 | 2 days |
| 6 | 6 days |
| 7 | 31 days |

Intervals are user-configurable via `QuizSettingModal` and stored in `localStorage` under key `hw-review-intervals`.

### Group identity
A review group is identified by `type:min:max` (e.g. `wordEnglishList:1:50`). Multiple quiz sessions for the same range (across different days) all belong to the same group key. The review schedule is computed by walking the chronological sequence of completed sessions for that key.

### State machine (per group)
- **UNFINISHED** — most recent session has `finishedCount < total` → always due, notify immediately
- **DUE** — interval has elapsed since last full completion (`now >= lastCompletionTime + interval`)
- **FRESH** — grace window missed (`now >= dueTime + 0.5 × interval`) → progress resets to level 0
- **SCHEDULED** — next review not yet due, show countdown

**Grace window rule:** if the user doesn't review within `dueTime + 50%` of the current interval, the group is treated as "forgotten" and the review level resets to 0.
Example: 20-minute interval → grace window ends at 20 + 10 = 30 minutes after last completion.

### Recommendation
Keep each group to **20–50 words** for best results with the forgetting curve timing.

### Key files
| File | Purpose |
|------|---------|
| `src/utils/ebbinghaus.ts` | Core engine: `computeGroupStates()`, intervals, formatting |
| `src/contexts/NotificationContext.tsx` | Provides `dueGroups`, `groupStates`, `dueCount` |
| `src/services/guestStorage.service.ts` | Guest localStorage group state computation |
| `src/pages/Review/ReviewPage.tsx` | Review history with status badges and scheduling info |
| `src/components/QuizSettingModal.tsx` | Group configuration + interval configurator |
| `src/models/index.ts` | `DueGroup` interface |
| `microservice/.../NotificationServiceImpl.java` | Backend (legacy per-word); intervals kept in sync |
