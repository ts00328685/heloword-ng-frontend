# Review System — Test Cases Specification

This document lists every meaningful scenario that should be covered by automated tests for the review/forgetting-curve system. It serves as the authoritative checklist so nothing is missed between sessions.

Status legend: ✅ implemented & passing | 🔲 not yet written

---

## Progress Tracker

| Area | Total | Done | Remaining |
|------|-------|------|-----------|
| ebbinghaus.ts (unit) | 51 | 51 ✅ | 0 |
| guestStorage.service.ts (integration) | 31 | 31 ✅ | 0 |
| ReviewPage component | 60 | 60 ✅ | 0 |
| ReviewPage — bug regression | 7 | 7 ✅ | 0 |
| NotificationContext | 0 | 0 | TBD |

---

## 1. Ebbinghaus Engine — `computeGroupStates()` ✅

All 51 tests are in `src/utils/ebbinghaus.test.ts`.

### 1.1 Empty / No-data cases
- [x] Empty settings array → returns empty Map
- [x] Single incomplete setting (no records) → UNFINISHED, level 0
- [x] Multiple settings, all incomplete → all UNFINISHED

### 1.2 SCHEDULED state
- [x] One completion, within interval → SCHEDULED
- [x] Returns correct `nextReviewTime` (lastCompletion + interval)
- [x] Returns correct `lastCompletionTime`

### 1.3 DUE state
- [x] One completion, interval elapsed but within grace → DUE
- [x] Grace window boundary — exactly at `dueTime` → DUE (not FRESH)

### 1.4 FRESH state
- [x] One completion, grace window elapsed → FRESH
- [x] Grace window boundary — exactly at `graceEnd` → FRESH
- [x] FRESH group: `reviewLevel` reflects the level reached before missing (NOT reset to 0 in the DueGroup output)

### 1.5 UNFINISHED state
- [x] Most recent session incomplete → UNFINISHED regardless of time
- [x] UNFINISHED takes priority over DUE (time has passed but session is incomplete)
- [x] UNFINISHED takes priority over FRESH
- [x] UNFINISHED takes priority over SCHEDULED

### 1.6 Level advancement (Level Walk)
- [x] 0 → 1: one on-time review
- [x] 1 → 2: second on-time review
- [x] 2 → 3: third on-time review
- [x] 3 → 4: fourth on-time review
- [x] Level cap at 6: 7th on-time review stays at 6 (does not go to 7+)
- [x] Grace miss resets level to 0

### 1.7 Grace window exact boundary tests
- [x] Completion at exactly `dueTime` (0ms late) → level advances
- [x] Completion at exactly `graceEnd` (on the boundary) → level advances
- [x] Completion 1ms after `graceEnd` → resets to 0

### 1.8 Manual override
- [x] Override present → skips level walk, uses `setAt` + `level`
- [x] Override with level=3, within interval → SCHEDULED
- [x] Override with level=3, interval elapsed → DUE
- [x] Override with level=3, grace elapsed → FRESH

### 1.9 Multiple independent groups
- [x] Two different `type:min:max` keys → each computed independently
- [x] Different ranges of the same type → separate groups, separate states

### 1.10 Custom intervals
- [x] Shorter intervals → triggers DUE/FRESH earlier than defaults

### 1.11 Returned timestamps
- [x] `nextReviewTime` is correct Date object
- [x] `lastCompletionTime` is correct Date object

### 1.12 Edge cases
- [x] `min`/`max` absent → defaults to `min=1`, `max=total`
- [x] Duplicate timestamps (two sessions at same ms) → second advances level
- [x] Level cap at 6 tested with 8+ completions

---

## 2. Guest Storage Pipeline — `guestStorage.service.ts` ✅

All 31 tests are in `src/services/guestStorage.test.ts`.

### 2.1 Persistence round-trips
- [x] `saveGuestSetting` → `getGuestSettings` round-trip
- [x] `saveGuestRecord` → `getGuestRecords` round-trip

### 2.2 `guestSettingsToQuizSettings()`
- [x] Single session, no records → `finishedCount=0`, `latestFinishedTime=undefined`
- [x] Single session, 3 correct records → `finishedCount=3`
- [x] Deduplication: same `answerId` answered twice → counted once
- [x] `wrongCount > 0` records excluded from `finishedCount`
- [x] `latestFinishedTime` = most recent correct record's `finishedTime`
- [x] One `QuizSetting` produced per `GuestSetting`

### 2.3 `computeAllGuestGroupStates()` (full pipeline)
- [x] No settings → empty Map
- [x] One session, no records → UNFINISHED
- [x] One completed session → SCHEDULED (within interval)
- [x] Completed, interval elapsed → DUE
- [x] Completed, grace elapsed → FRESH
- [x] Different ranges of same type → separate keys in Map
- [x] Same range, multiple sessions → one group key (sessions merged chronologically)

### 2.4 `computeGuestDueGroups()`
- [x] SCHEDULED group excluded
- [x] DUE group included
- [x] FRESH group included
- [x] UNFINISHED group included

### 2.5 `deleteGuestGroup()`
- [x] Removes matching GuestSettings
- [x] Removes matching GuestRecords
- [x] Removes override for that group key

### 2.6 Manual override pipeline (guest)
- [x] `saveGuestGroupOverride` → override appears in `getGuestGroupOverrides`
- [x] Override applied in `computeAllGuestGroupStates`
- [x] `deleteGuestGroupOverride` removes the override

### 2.7 Ebbinghaus progression (end-to-end via guest storage)
- [x] 3 on-time completions → level 2, SCHEDULED
- [x] Grace miss after level 1 → level resets to 0, FRESH

---

## 3. ReviewPage Component — UI Rendering ✅

All 60 tests are in `src/pages/Review/ReviewPage.test.tsx`.

### 3.1 Empty state
- [x] Shows "go configure groups" CTA when no groups
- [x] No due banner when no groups
- [x] No status badges when no groups

### 3.2 SCHEDULED state card
- [x] SCHEDULED badge (`<span>`) visible
- [x] Next-review countdown shown (`review.nextReview`)
- [x] No "Review Now" prompt
- [x] No resume prompt
- [x] Progress bar at 100%
- [x] Completion ratio shows `total/total`
- [x] "Review Early" button shown when pct=100
- [x] Not in due banner
- [x] Level indicator `L{n+1}` correct
- [x] Interval label correct (e.g. "20 min")
- [x] Word range chip shows `(min–max)`

### 3.3 DUE state card
- [x] DUE badge visible
- [x] "Review Now" prompt shown
- [x] No countdown
- [x] No "Review Early" button
- [x] In the due banner
- [x] "Start Due Review" button in banner
- [x] Progress bar at 0% (new cycle)
- [x] Completion ratio shows `0/total`

### 3.4 FRESH state card
- [x] FRESH badge visible
- [x] "Review Now" prompt shown
- [x] No countdown
- [x] No resume prompt
- [x] In the due banner
- [x] Level indicator shows level BEFORE forget (reviewLevel from DueGroup)
- [x] Interval label correct (8 hours for L3)

### 3.5 UNFINISHED state card
- [x] UNFINISHED badge visible
- [x] Resume prompt shown
- [x] No "Review Now"
- [x] No countdown
- [x] In the due banner
- [x] Progress bar at partial % (e.g. 30% for 3/10)
- [x] Completion ratio shows partial count

### 3.6 Due-for-review banner
- [x] Shows with correct count for 1 DUE group
- [x] Hidden when all groups are SCHEDULED
- [x] Group range chip in banner listing (DUE)
- [x] Group range chip in banner listing (FRESH)
- [x] Level indicator in banner chip

### 3.7 Multiple groups
- [x] One card per distinct `type:min:max` key
- [x] Mixed FRESH + UNFINISHED: each shows correct prompt
- [x] Banner count = DUE + FRESH count (excludes SCHEDULED)

### 3.8 Level display (parametrized)
- [x] level 0 → L1, 20 min
- [x] level 1 → L2, 1 hour
- [x] level 2 → L3, 8 hours
- [x] level 3 → L4, 1 day
- [x] level 4 → L5, 2 days
- [x] level 5 → L6, 6 days
- [x] level 6 → L7, 31 days

### 3.9 Progress bar values
- [x] SCHEDULED: 100% bar
- [x] DUE after full cycle: 0% bar (cycleCompleted = total%total = 0)
- [x] UNFINISHED with 2/5: 40% bar
- [x] FRESH after full cycle: 0% bar

### 3.10 Word range chips
- [x] Shows min–max in chip
- [x] Shows translation key for word type
- [x] Separate chip per group card

### 3.11 Filter bar
- [x] All filter buttons present when groups exist

### 3.12 Guest upsell banner
- [x] Guest upsell banner shown for non-logged-in users with login link span

---

## 4. ReviewPage — Bug Regression Tests 🔲

These tests cover specific bugs that were found and fixed. They exist to prevent regressions.

### 4.1 Drop-without-completing shows UNFINISHED (not 5/5)

**Bug:** User configures a group (e.g. words 1–5), VocabularyQuizPage saves the GuestSetting,
user navigates away without answering. On ReviewPage, `groupStates` was stale (refreshGuest()
only called on quiz *completion*), so `resolveGroupState` returned `undefined` → status
defaulted to SCHEDULED → displayCompleted = group.total → showed "5/5" instead of "0/5 UNFINISHED".

**Fix:** ReviewPage now calls `refreshGuest()` in its `useEffect` before `loadGuestData()` so
that `groupStates` is always up to date when cards render.

- [x] New guest group with no records → `refreshGuest()` called on ReviewPage mount
- [x] `displayCompleted` is 0 (not `group.total`) when status is UNFINISHED
- [x] `pct` is 0% (not 100%) when status is UNFINISHED; "5/5" not shown

### 4.2 Different ranges of same type stay separate cards

**Bug:** Both `loadGuestData` (guest) and `fetchData` (logged-in) were grouping sessions by
date instead of by `type:min:max`. Two ranges on the same day merged into one card, and
`quizSettings[s.type] = ...` caused the second range to overwrite the first.

**Fix:** Re-bucketing now uses `type:min:max` as the key.

- [x] Guest: Two settings with same type but different ranges (e.g. 1–50 and 51–100) on the same day → two separate cards
- [ ] Logged-in: Two sessions with same type, different ranges on the same day → two separate cards (needs fetchData mock)

### 4.3 Level cap at 6 (no overflow)

**Bug:** Level walk `level + 1` had no upper bound; after 7+ on-time completions, `reviewLevel`
exceeded 6 and caused out-of-bounds array access.

**Fix:** `Math.min(level + 1, intervals.length - 1)`.

- [x] Level 6 in DueGroup → UI shows L7 (not L8+); already covered in ebbinghaus unit tests for the algorithm itself

---

## 5. Test Cases Still Needed

### 5.1 ReviewPage — `refreshGuest()` called on mount (regression for Bug 4.1)

The three regression tests in section 4.1 should be added to `ReviewPage.test.tsx`.
The mock setup needs to verify:
1. `refreshGuest` was called (spy assertion)
2. A group with `guestSettings = [{ min:1, max:5 }]` and `guestRecords = []` renders as UNFINISHED with 0/5

### 5.2 Different-range grouping regression (section 4.2)

Two tests (guest + logged-in) verifying that two groups with the same `type` but
different `min/max` produce two separate cards.
- Guest: mock two GuestSettings (`1:1:50`, `1:51:100`) → expect two cards, two badges
- Logged-in: mock `fetchData` response with two sessions of same type, different ranges → two cards

### 5.3 Level cap regression (section 4.3)

One test: 8 completions at correct intervals → `DueGroup.reviewLevel` ≤ 6.
Already covered in `ebbinghaus.test.ts` (test: "level cap at 6"), but should be verified
end-to-end through `guestStorage.service.ts` as well.

---

## Implementation Order

1. **4.1 (drop-without-completing regression)** — most critical, direct user-facing bug
2. **4.2 (different-range separation)** — second-highest impact
3. **4.3 (level cap)** — already covered in ebbinghaus unit tests; add e2e variant

---

## Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Specific file
npx vitest run src/pages/Review/ReviewPage.test.tsx
```
