# Heloword React — Progress Tracker

This file tracks every plan and implementation step for the React rewrite of Heloword.

---

## Project Goal

Rewrite the Angular/Ionic `heloword-ng-frontend` project into a React SPA with no Ionic dependency,
while keeping:
- Identical API endpoints & authentication (Google OAuth)
- Same request security headers
- Mobile-first, responsive design
- All quiz logic including wrong-answer re-queuing and spaced repetition

---

## Architecture Decisions

| Concern | Angular (Original) | React (New) |
|---|---|---|
| Framework | Angular 13 + Ionic 6 | React 18 + Vite |
| Styling | Ionic components + SCSS | Tailwind CSS |
| Routing | Angular Router | React Router v6 |
| State | BehaviorSubject + Services | React Context + hooks |
| HTTP | HttpClient + interceptors | Axios + interceptors |
| Auth | angularx-social-login | @react-oauth/google |
| Crypto | crypto-js | crypto-js (same) |
| Build | Angular CLI | Vite |

---

## Step-by-Step Progress

### Phase 1 — Project Exploration ✅
- [x] Read all Angular source files
- [x] Catalogue all pages, services, guards, interceptors
- [x] Document all API endpoints (9 POST endpoints)
- [x] Understand auth flow
- [x] Understand quiz logic (shuffle, validate, re-queue, track)

### Phase 2 — Project Scaffolding ✅
- [x] Create `heloword-react/` folder
- [x] `package.json` — React 18, Vite, Tailwind, Axios, crypto-js, @react-oauth/google
- [x] `vite.config.ts` — dev proxy `/k8s` → backend, port 4200
- [x] `tsconfig.json` / `tsconfig.node.json`
- [x] `tailwind.config.js` + `postcss.config.js`
- [x] `index.html` — mobile meta tags, safe-area, viewport

### Phase 3 — Configuration & Models ✅
- [x] `src/config/environment.ts` — mirrors Angular environments (dev/prod via Vite's `import.meta.env`)
- [x] `src/models/index.ts` — User, Word, Sentence, QuizSetting, CommonResponse, WordStore, SentenceStore, TYPE_TO_TABLE_MAP, WORD_SENTENCE_TITLE_MAP

### Phase 4 — Services ✅
- [x] `src/services/utils.service.ts` — request signing helpers
- [x] `src/services/api.service.ts`
  - Axios instance with `withCredentials: true`
  - Request/response interceptors; `9403` triggers logout
  - `doPost` / `doGet` exported functions
  - `resetApiInstance()` for post-logout cleanup

### Phase 5 — Contexts (State Management) ✅
- [x] `src/contexts/AuthContext.tsx`
  - Stores User state; `isLoggedIn` derived from `email`
  - `updateUser`, `logout` (calls /logout API → resets state → reloads)
  - `hasAnyRole`, `hasAllRoles`
  - `hasCheckedLoginStatus` flag (mirrors Angular service)
- [x] `src/contexts/DataContext.tsx`
  - Stores `wordStore` (English/German/Japanese words)
  - Stores `sentenceStore` (English/German/Japanese sentences)
  - `clearAllStore`, `isWordStoreEmpty`, `isSentenceStoreEmpty`
- [x] `src/contexts/UIContext.tsx`
  - `showToast` (auto-hides after duration)
  - `showAlert` / `dismissAlert`
  - `showLoading` / `hideLoading`
  - `showSystemError`

### Phase 6 — Components ✅
- [x] `src/components/AppInitializer.tsx`
  - Equivalent of Angular `PageActivateGuard`
  - Runs session bootstrap on app first load
  - Shows startup loading state; gates children until ready
- [x] `src/components/Header.tsx` — sticky header, back button, user avatar, login/logout
- [x] `src/components/BottomTabs.tsx` — 5-tab nav using NavLink with active state
- [x] `src/components/Toast.tsx` — top/bottom positioned toast
- [x] `src/components/AlertDialog.tsx` — modal alert with dismiss
- [x] `src/components/LoadingSpinner.tsx` — full-screen loading overlay
- [x] `src/components/QuizSettingModal.tsx`
  - Lists all word groups from DataContext
  - Toggle select, min/max range input per group
  - Validates at least one group selected
  - Navigates to `/vocabulary/quiz` with quizSettings state

### Phase 7 — Pages ✅
- [x] `src/pages/Home/HomePage.tsx`
  - Fetches dashboard data (words + sentences)
  - Fills English words with sentence snippets when logged in
  - Word sections with "View All" navigation
  - Hero card with "Go to Quiz" CTA
- [x] `src/pages/Login/LoginPage.tsx`
  - Google OAuth via `@react-oauth/google`
  - Calls `/service-auth/api/auth/verify-google-id` with credential
  - Updates AuthContext on success
- [x] `src/pages/Vocabulary/VocabularyPage.tsx` — entry page with quiz start button
- [x] `src/pages/Vocabulary/VocabularyListPage.tsx` — scrollable word list with FAB to open quiz modal
- [x] `src/pages/Vocabulary/VocabularyQuizPage.tsx`
  - Full quiz logic port from Angular
  - Language-specific answer validation (German normalization, Japanese Kanji/Kata)
  - Wrong answer tracking + re-queue to end of list
  - Auto-pronunciation (Web Speech API) with speed/volume
  - Per-question counters: pronounceCount, deleteCount, wrongCount
  - Record saving (only on correct, zero-wrong answers)
  - Settings panel: auto-pronounce, auto-focus, masks, Japanese mode
  - Progress bar
- [x] `src/pages/Review/ReviewPage.tsx`
  - Fetches quiz history grouped by date
  - Sorted by latestFinishedTime desc
  - Progress bar per group, "Resume" functionality
  - Calls get-record-ids-by-setting-ids before resuming
- [x] `src/pages/Stats/StatsPage.tsx` — placeholder (mirrors Angular)
- [x] `src/pages/Info/InfoPage.tsx` — app info, developer profile, forgetting curve link

### Phase 8 — App Entry ✅
- [x] `src/App.tsx` — context providers, Router, Routes, BottomTabsWrapper (hides on quiz/login)
- [x] `src/main.tsx` — React 18 `createRoot`
- [x] `src/index.css` — Tailwind directives, safe-area utilities, custom scrollbar, range input

### Phase 9 — Documentation ✅
- [x] `progress.md` (this file)
- [x] `README.md` — full project documentation

---

## API Endpoints Used

| Method | Path | Purpose |
|---|---|---|
| POST | `/frontend-api/api/fe/user` | Get current user from session |
| POST | `/frontend-api/api/fe/home/dashboard` | Get all word/sentence lists |
| POST | `/frontend-api/api/fe/quiz/save-setting-records` | Save quiz settings batch |
| POST | `/frontend-api/api/fe/quiz/save-single-record` | Save one quiz answer record |
| POST | `/frontend-api/api/fe/quiz/get-quiz-settings` | Get quiz history |
| POST | `/frontend-api/api/fe/quiz/get-record-ids-by-setting-ids` | Get finished record IDs for resume |

---

## Known Differences from Angular Version

| Feature | Angular | React |
|---|---|---|
| Google Login | angularx-social-login SDK | @react-oauth/google SDK |
| Google sign-in payload | socialUser object | `{ credential, provider, idToken }` |
| Popover for quiz settings | Ionic PopoverController | Custom modal component |
| Toast / Alert UI | Ionic controllers | Custom React components |
| Loading UI | Ionic LoadingController | Custom overlay component |
| Route params | Angular BehaviorSubject store | React Router `location.state` |
| IP detection | Angular HttpClient JSONP | `fetch()` to IP detection service |

---

## Pending / Future Work

- [ ] Statistics page (currently a placeholder, like the Angular version)
- [ ] Add `.env` / `.env.production` files for backend URL configuration
- [ ] Add error boundary component
- [ ] Add PWA manifest
- [ ] Unit tests (Vitest + React Testing Library)
- [ ] Dark mode support via Tailwind `dark:` classes
