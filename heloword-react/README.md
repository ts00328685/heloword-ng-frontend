# Heloword React

A vocabulary learning web application built with **React 18 + Vite + Tailwind CSS**.
This is a full rewrite of the original Angular/Ionic frontend with no Ionic dependency,
maintaining identical API contracts, authentication, and security headers.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Getting Started](#getting-started)
5. [Environment Configuration](#environment-configuration)
6. [How the App Works](#how-the-app-works)
7. [Pages & Routes](#pages--routes)
8. [Quiz Logic](#quiz-logic)
9. [Development Notes](#development-notes)

---

## Features

- **Multi-language vocabulary quiz** — English, German, Japanese words & sentences
- **Spaced repetition** — Wrong answers are re-queued at the end of the quiz for retesting
- **Text-to-speech pronunciation** — Uses Web Speech API (en-US, de-DE, ja-JP, zh-TW)
- **Google OAuth login** — Sign in to save quiz history and progress
- **Quiz progress tracking** — Resume incomplete quizzes from the Review tab
- **Per-answer metrics** — Tracks time spent, pronounce count, backspace count, wrong count
- **Mobile-first responsive design** — Works on phones, tablets, and desktops
- **Secure API communication** — Encrypted headers, session cookies

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 |
| Build Tool | Vite 5 |
| Styling | Tailwind CSS 3 |
| Routing | React Router v6 |
| HTTP | Axios (with interceptors) |
| Authentication | @react-oauth/google |
| Language | TypeScript 5 |

---

## Project Structure

```
heloword-react/
├── index.html                    # App entry HTML (Vite)
├── vite.config.ts                # Vite config with dev proxy
├── tailwind.config.js            # Tailwind theme
├── tsconfig.json                 # TypeScript config
├── package.json
├── progress.md                   # Implementation progress tracker
└── src/
    ├── main.tsx                  # React root mount
    ├── App.tsx                   # Provider tree + Router + Routes
    ├── index.css                 # Tailwind + global styles
    ├── config/
    │   └── environment.ts        # Runtime config (base URLs)
    ├── models/
    │   └── index.ts              # TypeScript interfaces (User, Word, QuizSetting…)
    ├── services/
    │   ├── api.service.ts        # Axios instance, doPost/doGet, IP detection
    │   └── utils.service.ts      # Request signing utilities
    ├── contexts/
    │   ├── AuthContext.tsx       # User state, login/logout, role checks
    │   ├── DataContext.tsx       # Word & sentence store
    │   └── UIContext.tsx         # Toast, alert, loading overlay
    ├── components/
    │   ├── AppInitializer.tsx    # Session bootstrap on app load
    │   ├── Header.tsx            # Sticky page header
    │   ├── BottomTabs.tsx        # 5-tab bottom navigation
    │   ├── Toast.tsx             # Top/bottom toast notification
    │   ├── AlertDialog.tsx       # Modal alert dialog
    │   ├── LoadingSpinner.tsx    # Full-screen loading overlay
    │   └── QuizSettingModal.tsx  # Quiz group/range selector modal
    └── pages/
        ├── Home/
        │   └── HomePage.tsx      # Dashboard with word lists
        ├── Login/
        │   └── LoginPage.tsx     # Google OAuth sign-in
        ├── Vocabulary/
        │   ├── VocabularyPage.tsx      # Quiz entry (configure & start)
        │   ├── VocabularyListPage.tsx  # Scrollable word list
        │   └── VocabularyQuizPage.tsx  # Interactive quiz
        ├── Review/
        │   └── ReviewPage.tsx    # Quiz history & resume
        ├── Stats/
        │   └── StatsPage.tsx     # Statistics (placeholder)
        └── Info/
            └── InfoPage.tsx      # About / app info
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+ or pnpm

### Install & Run

```bash
# Navigate to the project
cd heloword-react

# Install dependencies
npm install

# Start development server (port 4200)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Development Proxy

In development, Vite proxies all `/k8s` requests to your backend:

```
http://localhost:4200/k8s/... → http://localhost:8080/k8s/...
```

Edit `vite.config.ts` to change the backend target.

---

## Environment Configuration

The environment is configured in `src/config/environment.ts`:

```typescript
{
  appVersion: '2025.02.01.a',
  backendBaseUrl: '/k8s',                      // dev: '/k8s', prod: '/k8s/micro-infra-gateway/v1'
  googleClientId: '',                          // Set via VITE_GOOGLE_CLIENT_ID
  userIp: '0.0.0.0',                          // Populated at runtime
}
```

To override via `.env` files:

```env
# .env.development
VITE_BACKEND_BASE_URL=/k8s

# .env.production
VITE_BACKEND_BASE_URL=/k8s/micro-infra-gateway/v1
```

---

## How the App Works

### Startup Sequence

When the app first loads, `AppInitializer` runs a bootstrap sequence to establish the session and restore login state. This runs only once per app lifecycle.

### Data Flow

```
Home page loads
  → POST /frontend-api/api/fe/home/dashboard
  → Populates DataContext (wordStore + sentenceStore)
  → English words matched with sentence examples

Quiz flow
  → User opens QuizSettingModal
  → Selects word groups + range (min/max index)
  → Navigates to /vocabulary/quiz with settings in location.state

Quiz page
  → Filters words by range, shuffles
  → On correct answer: save record (if logged in)
  → On wrong answer: push word to end of list for re-test
  → On finish: return to home
```

---

## Authentication

### Google OAuth

User clicks "Sign in with Google" → Google returns a credential → backend validates and creates a session → `AuthContext` is updated.

### Session Management

- Sessions use HTTP cookies with `withCredentials: true`
- A `9403` response code from any endpoint triggers automatic logout

---

## API Reference

All endpoints are `POST`. The backend base URL is `/k8s` (dev) or `/k8s/micro-infra-gateway/v1` (prod).

### Data Endpoints

| Endpoint | Payload | Response |
|---|---|---|
| `/frontend-api/api/fe/user` | `{}` | `{ user }` or empty |
| `/frontend-api/api/fe/home/dashboard` | `{}` | `{ wordEnglishList, wordGermanList, wordJapaneseList, sentenceEnglishList, ... }` |
| `/frontend-api/api/fe/quiz/save-setting-records` | Array of QuizSetting | `{ ids: number[] }` |
| `/frontend-api/api/fe/quiz/save-single-record` | QuizRecord object | confirmation |
| `/frontend-api/api/fe/quiz/get-quiz-settings` | `{}` | Map of date → QuizSetting[] |
| `/frontend-api/api/fe/quiz/get-record-ids-by-setting-ids` | `number[]` (settingIds) | `{ [settingId]: number[] }` |

### Common Response Format

```typescript
{
  timestamp: Date,
  code: string,   // '0000' = success, '9403' = auth error
  message: string,
  data: any
}
```

---

## Pages & Routes

| Route | Page | Auth Required |
|---|---|---|
| `/` | → redirects to `/home` | No |
| `/home` | Home — word/sentence dashboard | No (more data with login) |
| `/login` | Google OAuth login | No |
| `/vocabulary` | Vocabulary entry page | No |
| `/vocabulary/list` | Word list (passed via state) | No |
| `/vocabulary/quiz` | Interactive quiz | No (saving requires login) |
| `/review` | Quiz history & resume | Yes (shows message if not logged in) |
| `/stats` | Statistics (placeholder) | Yes |
| `/info` | App information | No |

Bottom navigation tabs are shown on all pages **except** `/vocabulary/quiz` and `/login`.

---

## Quiz Logic

The quiz engine in `VocabularyQuizPage.tsx` faithfully reimplements the Angular version:

### Answer Validation

```
1. Get raw answer (word.word || word.sentence)
2. If German: normalize umlauts (ä→a, ö→o, ü→u, ß→b)
3. If Japanese mode: use Kanji-first or Katakana-first form
4. Strip trailing punctuation (. ? ! 。)
5. Compare stripped input vs stripped answer
```

### Spaced Repetition (Wrong Answer Re-queue)

A word is re-queued at the end of the list if:
- `wrongCount > 0` at the time of correct submission
- `pronounceCount >= 3` (over-reliance on audio)
- `failWhenMaskOff` option is enabled and the sentence mask was revealed

Only perfect answers (wrongCount = 0) are saved to the backend as completed records.

### Per-Question Tracking

Each word tracks:
- `timeSpent` — seconds from question start to correct answer
- `pronounceCount` — how many times pronunciation was triggered
- `deleteCount` — how many backspace presses
- `wrongCount` — wrong attempts (5 points for reveal/enter, 1 for each overflow character)

---

## Development Notes

### Running alongside the Angular version

Both projects can run concurrently. The React app runs on port `4200` (or change in `vite.config.ts`).

### Adding new pages

1. Create a component in `src/pages/<Name>/`
2. Add a `<Route>` in `src/App.tsx`
3. Optionally add a tab in `src/components/BottomTabs.tsx`

### State passing between pages

Instead of Angular's BehaviorSubject route param store, this app uses React Router's `location.state`:

```typescript
// Navigate with state
navigate('/vocabulary/quiz', { state: { quizSettings } });

// Receive state
const location = useLocation();
const quizSettings = location.state?.quizSettings;
```

