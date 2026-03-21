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
