# Heloword React Frontend

## Stack
React 18 + TypeScript + Vite + Tailwind CSS · port 4200 · `npm run dev`

## API
- Dev: `/k8s` → proxied to `localhost:9487` (vite.config.ts)
- Prod: `/k8s/micro-infra-gateway/v1` → `heloword.com`
- Switch via `VITE_BACKEND_BASE_URL` in `.env.local`
- All HTTP: `src/services/api.service.ts` → `doPost()`/`doGet()` (Axios interceptor injects security headers)

## Endpoints
- `/service-auth/api/auth/*` — login/logout/Google OAuth
- `/frontend-api/api/fe/user` — session check
- `/frontend-api/api/fe/home/dashboard` — word/sentence lists
- `/frontend-api/api/fe/quiz/*` — quiz settings & records

## Structure
- `src/pages/` — Home, Login, Vocabulary, Review, Stats, Info
- `src/components/` — Header, BottomTabs, AlertDialog, QuizSettingModal
- `src/contexts/` — AuthContext, DataContext, UIContext, ThemeContext, NotificationContext
- `src/services/api.service.ts` — all HTTP
- `src/config/environment.ts` — env config
- `vite.config.ts` — dev proxy

## Backend
`~/ryan/projects_ryan/heloword-micro/workspace/heloword-micro/microservice`

---

## Ebbinghaus Spaced Repetition

Group key: `type:min:max` (e.g. `wordEnglishList:1:50`). Recommended 20–50 words/group.

### Default intervals
1→20min · 2→1h · 3→8h · 4→1d · 5→2d · 6→6d · 7→31d
Configurable in `QuizSettingModal`, stored in `localStorage` key `hw-review-intervals`.

### Group states
- **UNFINISHED** — `finishedCount < total` → always due
- **DUE** — `now >= lastCompletionTime + interval`
- **FRESH** — `now >= dueTime + 0.5×interval` → level resets to 0 (grace window expired)
- **SCHEDULED** — not yet due, show countdown

### Key files
| File | Purpose |
|------|---------|
| `src/utils/ebbinghaus.ts` | Core: `computeGroupStates()`, intervals, formatting |
| `src/contexts/NotificationContext.tsx` | `dueGroups`, `groupStates`, `dueCount` |
| `src/services/guestStorage.service.ts` | Guest localStorage state |
| `src/pages/Review/ReviewPage.tsx` | Review history, status badges |
| `src/components/QuizSettingModal.tsx` | Group config + interval editor |
| `src/models/index.ts` | `DueGroup` interface |
