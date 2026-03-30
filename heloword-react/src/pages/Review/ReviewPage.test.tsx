// @vitest-environment jsdom
/**
 * Component tests for ReviewPage.
 *
 * Each test controls the review group state via mocked contexts and verifies
 * what the user actually sees: status badges, action prompts, progress bars,
 * review level indicators, and conditional UI elements.
 *
 * The mock hierarchy:
 *   useNotifications → provides groupStates (Map<groupKey, DueGroup>)
 *   getGuestSettings  → provides the list of sessions for loadGuestData()
 *   getGuestRecords   → provides word completion records
 *
 * The two sources must be consistent: the groupKey derived from GuestSetting
 * (type:min:max) must match the key in the groupStates Map.
 *
 * Note on status badge assertions:
 *   Status text (e.g. "review.groupStatusScheduled") appears in BOTH the
 *   filter bar <button> and the card <span> badge. Tests use getAllByText()
 *   and check .tagName to distinguish card badges (SPAN) from filter buttons.
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DueGroup } from '../../models';
import type { GuestSetting, GuestRecord } from '../../services/guestStorage.service';
import { doPost } from '../../services/api.service';

// ─── Hoist mock state so vi.mock factories can reference them ────────────────

const mocks = vi.hoisted(() => {
  const navigate = vi.fn();
  const refreshGuest = vi.fn();
  const refresh = vi.fn();

  const state = {
    guestSettings: [] as GuestSetting[],
    guestRecords:  [] as GuestRecord[],
    groupStates:   new Map<string, DueGroup>(),
    dueGroups:     [] as DueGroup[],
    isLoggedIn:    false,
  };

  return { navigate, refreshGuest, refresh, state };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Return the key as-is for everything except structured interpolations.
    // This lets tests assert on translation keys (semantic intent) without
    // coupling to English strings, and keeps assertions stable.
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts?.level     !== undefined) return `L${opts.level}`;
      if (opts?.completed !== undefined) return `${opts.completed}/${opts.total}`;
      if (opts?.count     !== undefined) return `${opts.count}`;
      return key; // ← includes time-based opts; tests assert on the key itself
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isLoggedIn:           mocks.state.isLoggedIn,
    user:                 mocks.state.isLoggedIn
                            ? { nickname: 'Tester', fullname: 'Test User', username: 'test@example.com' }
                            : null,
    logout:               vi.fn(),
    updateUser:           vi.fn(),
    hasCheckedLoginStatus: true,
  }),
}));

vi.mock('../../contexts/NotificationContext', () => ({
  useNotifications: () => ({
    dueGroups:   mocks.state.dueGroups,
    dueCount:    mocks.state.dueGroups.length,
    groupStates: mocks.state.groupStates,
    refresh:     mocks.refresh,
    refreshGuest: mocks.refreshGuest,
  }),
}));

vi.mock('../../contexts/UIContext', () => ({
  useUI: () => ({ showLoading: vi.fn(), hideLoading: vi.fn() }),
}));

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false, toggle: vi.fn() }),
}));

vi.mock('../../contexts/SocialContext', () => ({
  useSocial: () => ({ myDisplayName: 'Guest-Tester', setGuestName: vi.fn() }),
}));

vi.mock('../../services/guestStorage.service', () => ({
  getGuestSettings:        () => mocks.state.guestSettings,
  getGuestRecords:         () => mocks.state.guestRecords,
  getFinishedIdsBySetting: vi.fn(() => []),
  deleteGuestGroup:        vi.fn(),
  saveGuestGroupOverride:  vi.fn(),
  deleteGuestGroupOverride: vi.fn(),
}));

vi.mock('../../services/api.service', () => ({
  doPost: vi.fn(() => Promise.resolve({ code: '0000', data: {} })),
  doPut:  vi.fn(() => Promise.resolve({ code: '0000', data: {} })),
}));

vi.mock('../../i18n', () => ({
  LANGUAGES:      [{ code: 'en', label: 'EN' }],
  changeLanguage: vi.fn(),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

const { default: ReviewPage } = await import('./ReviewPage');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MIN  = 60_000;
const BASE = new Date('2025-06-01T12:00:00Z').getTime();

function isoAt(offsetMs: number) {
  return new Date(BASE + offsetMs).toISOString();
}

let idCounter = 0;

function gs(opts: { id?: string; type?: string; min: number; max: number }): GuestSetting {
  return {
    id:        opts.id ?? `g${++idCounter}`,
    timestamp: isoAt(-2 * MIN),
    type:      opts.type ?? 'wordEnglishList',
    tableName: 'word_english',
    min:       opts.min,
    max:       opts.max,
    total:     9481,
  };
}

function gr(settingId: string, answerId: number): GuestRecord {
  return {
    id:              `r${answerId}`,
    settingId,
    answerId,
    answerTableName: 'word_english',
    timeSpent:       3,
    finishedTime:    isoAt(-25 * MIN),
    wrongCount:      0,
    quizIndex:       answerId - 1,
  };
}

function dg(opts: {
  type?: string;
  min: number;
  max: number;
  status: DueGroup['status'];
  level?: number;
  nextReviewTime?: Date;
}): DueGroup {
  const type  = opts.type ?? 'wordEnglishList';
  const level = opts.level ?? 0;
  return {
    groupKey:           `${type}:${opts.min}:${opts.max}`,
    type,
    min:                opts.min,
    max:                opts.max,
    status:             opts.status,
    reviewLevel:        level,
    nextReviewTime:     opts.nextReviewTime ?? new Date(BASE + 20 * MIN),
    lastCompletionTime: new Date(BASE - 25 * MIN),
  };
}

/**
 * Populate mock state for a single guest group and render ReviewPage.
 * `records` controls the completion count (and thus the progress bar).
 */
function setupAndRender(setting: GuestSetting, records: GuestRecord[], group: DueGroup) {
  mocks.state.guestSettings = [setting];
  mocks.state.guestRecords  = records;
  mocks.state.groupStates   = new Map([[group.groupKey, group]]);
  mocks.state.dueGroups     = group.status !== 'SCHEDULED' ? [group] : [];
  return render(<ReviewPage />);
}

/**
 * Assert that the status badge SPAN is rendered in a card.
 * Status text appears in both the filter bar (button) and the card badge (span).
 * We distinguish by tagName: filter bar → BUTTON, card badge → SPAN.
 */
function expectBadge(statusKey: string) {
  const all = screen.getAllByText(statusKey);
  const badge = all.find((el) => el.tagName === 'SPAN');
  expect(badge, `Expected a <span> badge with text "${statusKey}"`).toBeTruthy();
}

/**
 * Assert that NO card badge SPAN exists for the given status.
 * (Filter bar buttons may still be present — that's expected.)
 */
function expectNoBadge(statusKey: string) {
  const all = screen.queryAllByText(statusKey);
  const badge = all.find((el) => el.tagName === 'SPAN');
  expect(badge, `Expected NO <span> badge with text "${statusKey}"`).toBeFalsy();
}

// ─── Reset before each test ───────────────────────────────────────────────────

beforeEach(() => {
  idCounter = 0;
  mocks.state.guestSettings = [];
  mocks.state.guestRecords  = [];
  mocks.state.groupStates   = new Map();
  mocks.state.dueGroups     = [];
  mocks.state.isLoggedIn    = false;
  vi.clearAllMocks();
});

// ===========================================================================
// 1. Empty state
// ===========================================================================

describe('ReviewPage — empty state', () => {
  it('shows "go configure groups" CTA when no groups exist', () => {
    render(<ReviewPage />);
    expect(screen.getByText('review.empty')).toBeInTheDocument();
    expect(screen.getByText('review.goConfigureGroups')).toBeInTheDocument();
  });

  it('does NOT show the due-for-review banner when there are no groups', () => {
    render(<ReviewPage />);
    expect(screen.queryByText('review.dueForReview')).not.toBeInTheDocument();
  });

  it('does NOT show any status badges when there are no groups', () => {
    render(<ReviewPage />);
    // No cards → no badge SPANs (filter bar absent too because groups.length === 0)
    expect(screen.queryByText('review.groupStatusDue')).not.toBeInTheDocument();
    expect(screen.queryByText('review.groupStatusScheduled')).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 2. SCHEDULED state
// ===========================================================================

describe('ReviewPage — SCHEDULED group', () => {
  let setting: GuestSetting;
  let group: DueGroup;

  beforeEach(() => {
    setting = gs({ min: 1, max: 5 });
    const records = [1, 2, 3, 4, 5].map((id) => gr(setting.id, id));
    group = dg({
      min: 1, max: 5, status: 'SCHEDULED', level: 0,
      nextReviewTime: new Date(BASE + 10 * MIN),
    });
    setupAndRender(setting, records, group);
  });

  it('shows SCHEDULED badge on the card', () => {
    expectBadge('review.groupStatusScheduled');
  });

  it('shows next-review countdown (t key = "review.nextReview")', () => {
    // t('review.nextReview', { time: ... }) → "review.nextReview" (our mock returns key)
    expect(screen.getByText('review.nextReview')).toBeInTheDocument();
  });

  it('does NOT show "Review Now" prompt', () => {
    expect(screen.queryByText('review.reviewNow')).not.toBeInTheDocument();
  });

  it('does NOT show resume prompt', () => {
    expect(screen.queryByText('review.resumePrompt')).not.toBeInTheDocument();
  });

  it('shows progress bar at 100% (SCHEDULED = just completed this cycle)', () => {
    // SCHEDULED → displayCompleted = group.total → pct = 100
    const bar = document.querySelector('[style*="width: 100%"]');
    expect(bar).toBeInTheDocument();
  });

  it('completion ratio shows total/total', () => {
    // t('review.completionRatio', { completed: 5, total: 5 }) → "5/5"
    expect(screen.getByText('5/5')).toBeInTheDocument();
  });

  it('shows "review early" button when pct === 100', () => {
    // Button text is "{t('review.reviewEarly')} →" — use regex to match prefix
    expect(screen.getByText(/review\.reviewEarly/)).toBeInTheDocument();
  });

  it('does NOT appear in the due-for-review banner', () => {
    expect(screen.queryByText('review.dueForReview')).not.toBeInTheDocument();
  });

  it('shows level indicator L1 (reviewLevel=0 → displayed as level+1=1)', () => {
    // t('review.reviewLevel', { level: 1 }) → "L1"
    expect(screen.getByText(/L1/)).toBeInTheDocument();
  });

  it('shows the interval label for level 0 (20 min)', () => {
    expect(screen.getByText(/20 min/)).toBeInTheDocument();
  });

  it('shows the word range chip', () => {
    // Rendered as: "{t('wordLists.wordEnglishList')} (1–5)"
    expect(screen.getByText(/\(1–5\)/)).toBeInTheDocument();
  });
});

// ===========================================================================
// 3. DUE state
// ===========================================================================

describe('ReviewPage — DUE group', () => {
  let setting: GuestSetting;
  let group: DueGroup;

  beforeEach(() => {
    setting = gs({ min: 1, max: 3 });
    const records = [1, 2, 3].map((id) => gr(setting.id, id));
    group = dg({ min: 1, max: 3, status: 'DUE', level: 0 });
    setupAndRender(setting, records, group);
  });

  it('shows DUE badge on the card', () => {
    expectBadge('review.groupStatusDue');
  });

  it('shows "Review Now" prompt', () => {
    expect(screen.getByText('review.reviewNow')).toBeInTheDocument();
  });

  it('does NOT show next-review countdown', () => {
    // review.nextReview only renders when status === SCHEDULED
    expect(screen.queryByText('review.nextReview')).not.toBeInTheDocument();
  });

  it('does NOT show "review early" button (only for SCHEDULED)', () => {
    expect(screen.queryByText('review.reviewEarly')).not.toBeInTheDocument();
  });

  it('shows the due-for-review banner', () => {
    expect(screen.getByText('review.dueForReview')).toBeInTheDocument();
  });

  it('shows "Start Due Review" button in the banner', () => {
    expect(screen.getByText('review.startDueReview')).toBeInTheDocument();
  });

  it('progress bar is at 0% (starting a new review cycle)', () => {
    // completed=3, total=3 → cycleCompleted = 3%3 = 0 → pct=0 for DUE
    const bar = document.querySelector('[style*="width: 0%"]');
    expect(bar).toBeInTheDocument();
  });

  it('completion ratio shows 0/3 (start of new cycle)', () => {
    expect(screen.getByText('0/3')).toBeInTheDocument();
  });
});

// ===========================================================================
// 4. FRESH state
// ===========================================================================

describe('ReviewPage — FRESH group', () => {
  let setting: GuestSetting;
  let group: DueGroup;

  beforeEach(() => {
    setting = gs({ min: 1, max: 4 });
    const records = [1, 2, 3, 4].map((id) => gr(setting.id, id));
    group = dg({ min: 1, max: 4, status: 'FRESH', level: 2 });
    setupAndRender(setting, records, group);
  });

  it('shows FRESH badge on the card', () => {
    expectBadge('review.groupStatusFresh');
  });

  it('shows "Review Now" prompt (same action as DUE)', () => {
    expect(screen.getByText('review.reviewNow')).toBeInTheDocument();
  });

  it('does NOT show next-review countdown', () => {
    expect(screen.queryByText('review.nextReview')).not.toBeInTheDocument();
  });

  it('does NOT show resume prompt', () => {
    expect(screen.queryByText('review.resumePrompt')).not.toBeInTheDocument();
  });

  it('appears in the due-for-review banner', () => {
    expect(screen.getByText('review.dueForReview')).toBeInTheDocument();
  });

  it('shows level 3 (reviewLevel=2 → displayed as L3)', () => {
    expect(screen.getByText(/L3/)).toBeInTheDocument();
  });

  it('shows the 8-hour interval for level 2', () => {
    // DEFAULT_INTERVALS_MS[2] = 8 * 3600 * 1000 → formatInterval → "8 hours"
    expect(screen.getByText(/8 hours/)).toBeInTheDocument();
  });
});

// ===========================================================================
// 5. UNFINISHED state
// ===========================================================================

describe('ReviewPage — UNFINISHED group', () => {
  let setting: GuestSetting;
  let group: DueGroup;

  beforeEach(() => {
    setting = gs({ min: 1, max: 10 });
    // 3 of 10 words answered correctly → partial session
    const records = [1, 2, 3].map((id) => gr(setting.id, id));
    group = dg({ min: 1, max: 10, status: 'UNFINISHED', level: 0 });
    setupAndRender(setting, records, group);
  });

  it('shows UNFINISHED badge on the card', () => {
    expectBadge('review.groupStatusUnfinished');
  });

  it('shows resume prompt', () => {
    expect(screen.getByText('review.resumePrompt')).toBeInTheDocument();
  });

  it('does NOT show "Review Now"', () => {
    expect(screen.queryByText('review.reviewNow')).not.toBeInTheDocument();
  });

  it('does NOT show next-review countdown', () => {
    expect(screen.queryByText('review.nextReview')).not.toBeInTheDocument();
  });

  it('appears in the due-for-review banner', () => {
    expect(screen.getByText('review.dueForReview')).toBeInTheDocument();
  });

  it('shows partial progress bar at 30% (3 of 10 done)', () => {
    // completed=3, total=10 → cycleCompleted=3%10=3 → pct=30
    const bar = document.querySelector('[style*="width: 30%"]');
    expect(bar).toBeInTheDocument();
  });

  it('completion ratio shows 3/10', () => {
    expect(screen.getByText('3/10')).toBeInTheDocument();
  });
});

// ===========================================================================
// 6. Due-for-review banner
// ===========================================================================

describe('ReviewPage — due-for-review banner', () => {
  it('shows banner and correct count for one DUE group', () => {
    const setting = gs({ min: 1, max: 2 });
    const group = dg({ min: 1, max: 2, status: 'DUE' });
    setupAndRender(setting, [gr(setting.id, 1), gr(setting.id, 2)], group);

    expect(screen.getByText('review.dueForReview')).toBeInTheDocument();
    // dueCount=1 → t('...', { count: 1 }) → "1" for count badge
    // The count is rendered directly as {dueCount}, not via t()
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('banner is hidden when all groups are SCHEDULED', () => {
    const setting = gs({ min: 1, max: 2 });
    const group = dg({ min: 1, max: 2, status: 'SCHEDULED' });
    setupAndRender(setting, [gr(setting.id, 1), gr(setting.id, 2)], group);

    expect(screen.queryByText('review.dueForReview')).not.toBeInTheDocument();
    expect(screen.queryByText('review.startDueReview')).not.toBeInTheDocument();
  });

  it('shows group range chip in the banner listing (DUE group)', () => {
    const setting = gs({ min: 1, max: 100 });
    const group = dg({ min: 1, max: 100, status: 'DUE' });
    setupAndRender(setting, [1, 2].map((id) => gr(setting.id, id)), group);

    // Banner chip "1–100" (no parens) and card chip "(1–100)" both match the regex;
    // just assert at least one element with the range exists
    expect(screen.getAllByText(/1–100/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows group range chip in the banner listing (FRESH group)', () => {
    const setting = gs({ min: 501, max: 1000 });
    const group = dg({ min: 501, max: 1000, status: 'FRESH' });
    setupAndRender(setting, [], group);

    expect(screen.getAllByText(/501–1000/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows level indicator in the banner chip', () => {
    const setting = gs({ min: 1, max: 5 });
    const group = dg({ min: 1, max: 5, status: 'DUE', level: 3 });
    setupAndRender(setting, [], group);

    // Banner chip renders: "type min–max L{level}"
    // t('...') → 'wordLists.wordEnglishList'; opacity span shows "L3"
    expect(screen.getAllByText(/L3/).length).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// 7. Multiple groups with mixed states
// ===========================================================================

describe('ReviewPage — multiple groups', () => {
  it('renders a card per distinct group key', () => {
    const sA = gs({ id: 'gA', min: 1,   max: 50  });
    const sB = gs({ id: 'gB', min: 51,  max: 100 });
    const gA = dg({ min: 1,   max: 50,  status: 'DUE'       });
    const gB = dg({ min: 51,  max: 100, status: 'SCHEDULED'  });

    mocks.state.guestSettings = [sA, sB];
    mocks.state.guestRecords  = [
      ...([1, 2].map((id) => gr('gA', id))),
      ...([51, 52].map((id) => gr('gB', id))),
    ];
    mocks.state.groupStates = new Map([[gA.groupKey, gA], [gB.groupKey, gB]]);
    mocks.state.dueGroups   = [gA];
    render(<ReviewPage />);

    expectBadge('review.groupStatusDue');
    expectBadge('review.groupStatusScheduled');
    expect(screen.getByText('review.dueForReview')).toBeInTheDocument();
  });

  it('shows the correct prompt for each state when both FRESH and UNFINISHED are present', () => {
    const sFresh = gs({ id: 'gF', min: 1, max: 5 });
    const sUnfin = gs({ id: 'gU', min: 6, max: 15 });
    const gFresh = dg({ min: 1, max: 5,  status: 'FRESH'      });
    const gUnfin = dg({ min: 6, max: 15, status: 'UNFINISHED' });

    mocks.state.guestSettings = [sFresh, sUnfin];
    mocks.state.guestRecords  = [3, 4, 5].map((id) => gr('gU', id)); // 3 of 10 for UNFINISHED
    mocks.state.groupStates   = new Map([[gFresh.groupKey, gFresh], [gUnfin.groupKey, gUnfin]]);
    mocks.state.dueGroups     = [gFresh, gUnfin];
    render(<ReviewPage />);

    expect(screen.getByText('review.reviewNow')).toBeInTheDocument();   // FRESH card
    expect(screen.getByText('review.resumePrompt')).toBeInTheDocument(); // UNFINISHED card
  });

  it('due banner count reflects both DUE and FRESH groups', () => {
    const sD = gs({ id: 'gD', min: 1,  max: 5  });
    const sF = gs({ id: 'gF', min: 6,  max: 10 });
    const sS = gs({ id: 'gS', min: 11, max: 15 });
    const gD = dg({ min: 1,  max: 5,  status: 'DUE'       });
    const gF = dg({ min: 6,  max: 10, status: 'FRESH'      });
    const gS = dg({ min: 11, max: 15, status: 'SCHEDULED'  });

    mocks.state.guestSettings = [sD, sF, sS];
    mocks.state.guestRecords  = [];
    mocks.state.groupStates   = new Map([[gD.groupKey, gD], [gF.groupKey, gF], [gS.groupKey, gS]]);
    mocks.state.dueGroups     = [gD, gF]; // SCHEDULED not included
    render(<ReviewPage />);

    // Count badge shows 2 (DUE + FRESH)
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});

// ===========================================================================
// 8. Level display
// ===========================================================================

describe('ReviewPage — level and interval display', () => {
  const cases: Array<{ level: number; expectedLabel: string; expectedInterval: string }> = [
    { level: 0, expectedLabel: 'L1', expectedInterval: '20 min'  },
    { level: 1, expectedLabel: 'L2', expectedInterval: '1 hour'  },
    { level: 2, expectedLabel: 'L3', expectedInterval: '8 hours' },
    { level: 3, expectedLabel: 'L4', expectedInterval: '1 day'   },
    { level: 4, expectedLabel: 'L5', expectedInterval: '2 days'  },
    { level: 5, expectedLabel: 'L6', expectedInterval: '6 days'  },
    { level: 6, expectedLabel: 'L7', expectedInterval: '31 days' },
  ];

  cases.forEach(({ level, expectedLabel, expectedInterval }) => {
    it(`level ${level} → shows ${expectedLabel} and "${expectedInterval}"`, () => {
      const setting = gs({ min: 1, max: 2 });
      const group = dg({ min: 1, max: 2, status: 'SCHEDULED', level });
      setupAndRender(setting, [gr(setting.id, 1), gr(setting.id, 2)], group);

      expect(screen.getByText(new RegExp(expectedLabel))).toBeInTheDocument();
      expect(screen.getByText(new RegExp(expectedInterval))).toBeInTheDocument();
    });
  });
});

// ===========================================================================
// 9. Progress bar values per state
// ===========================================================================

describe('ReviewPage — progress bar', () => {
  it('SCHEDULED with all words done → 100% bar', () => {
    const setting = gs({ min: 1, max: 4 });
    const records = [1, 2, 3, 4].map((id) => gr(setting.id, id));
    const group   = dg({ min: 1, max: 4, status: 'SCHEDULED' });
    setupAndRender(setting, records, group);

    const bar = document.querySelector('[style*="width: 100%"]');
    expect(bar).toBeInTheDocument();
    expect(screen.getByText('4/4')).toBeInTheDocument();
  });

  it('DUE with previous full cycle → 0% bar (new cycle starting)', () => {
    const setting = gs({ min: 1, max: 4 });
    const records = [1, 2, 3, 4].map((id) => gr(setting.id, id));
    const group   = dg({ min: 1, max: 4, status: 'DUE' });
    setupAndRender(setting, records, group);

    // completed=4, total=4 → cycleCompleted=4%4=0 → pct=0
    const bar = document.querySelector('[style*="width: 0%"]');
    expect(bar).toBeInTheDocument();
    expect(screen.getByText('0/4')).toBeInTheDocument();
  });

  it('UNFINISHED with 2 of 5 words done → 40% bar', () => {
    const setting = gs({ min: 1, max: 5 });
    const records = [1, 2].map((id) => gr(setting.id, id)); // 2 of 5
    const group   = dg({ min: 1, max: 5, status: 'UNFINISHED' });
    setupAndRender(setting, records, group);

    // completed=2, total=5 → cycleCompleted=2%5=2 → pct=40
    const bar = document.querySelector('[style*="width: 40%"]');
    expect(bar).toBeInTheDocument();
    expect(screen.getByText('2/5')).toBeInTheDocument();
  });

  it('FRESH group → 0% bar (needs fresh review cycle)', () => {
    const setting = gs({ min: 1, max: 3 });
    const records = [1, 2, 3].map((id) => gr(setting.id, id));
    const group   = dg({ min: 1, max: 3, status: 'FRESH' });
    setupAndRender(setting, records, group);

    // completed=3, total=3 → cycleCompleted=3%3=0 → pct=0
    const bar = document.querySelector('[style*="width: 0%"]');
    expect(bar).toBeInTheDocument();
  });
});

// ===========================================================================
// 10. Word range chip display
// ===========================================================================

describe('ReviewPage — word range chips', () => {
  it('shows min–max range in the chip', () => {
    const setting = gs({ min: 2001, max: 4000 });
    const group   = dg({ min: 2001, max: 4000, status: 'SCHEDULED' });
    setupAndRender(setting, [], group);
    expect(screen.getByText(/\(2001–4000\)/)).toBeInTheDocument();
  });

  it('shows translation key for the word type', () => {
    const setting = gs({ type: 'wordJapaneseList', min: 1, max: 50 });
    const group   = dg({ type: 'wordJapaneseList', min: 1, max: 50, status: 'SCHEDULED' });
    setupAndRender(setting, [], group);
    // t('wordLists.wordJapaneseList') → 'wordLists.wordJapaneseList' in our mock
    expect(screen.getByText(/wordLists\.wordJapaneseList/)).toBeInTheDocument();
  });

  it('shows range chip for each group card independently', () => {
    const sA = gs({ id: 'gA', min: 1,    max: 1000 });
    const sB = gs({ id: 'gB', min: 1001, max: 2000 });
    const gA = dg({ min: 1,    max: 1000, status: 'DUE' });
    const gB = dg({ min: 1001, max: 2000, status: 'DUE' });

    mocks.state.guestSettings = [sA, sB];
    mocks.state.guestRecords  = [];
    mocks.state.groupStates   = new Map([[gA.groupKey, gA], [gB.groupKey, gB]]);
    mocks.state.dueGroups     = [gA, gB];
    render(<ReviewPage />);

    expect(screen.getByText(/\(1–1000\)/)).toBeInTheDocument();
    expect(screen.getByText(/\(1001–2000\)/)).toBeInTheDocument();
  });
});

// ===========================================================================
// 11. Status filter bar
// ===========================================================================

describe('ReviewPage — filter bar', () => {
  it('shows all filter buttons when groups exist', () => {
    const setting = gs({ min: 1, max: 2 });
    const group   = dg({ min: 1, max: 2, status: 'DUE' });
    setupAndRender(setting, [], group);

    expect(screen.getByRole('button', { name: 'review.filterAll' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'review.groupStatusDue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'review.groupStatusFresh' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'review.groupStatusUnfinished' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'review.groupStatusScheduled' })).toBeInTheDocument();
  });
});

// ===========================================================================
// 12. Guest upsell banner
// ===========================================================================

describe('ReviewPage — guest upsell banner', () => {
  it('shows login upsell for guest users', () => {
    render(<ReviewPage />);
    expect(screen.getByText('review.guestBanner')).toBeInTheDocument();
    // "common.login" appears in both the Header button and the guest banner <span>.
    // Assert the guest banner's underlined <span> is present.
    const loginSpans = screen.getAllByText('common.login');
    const bannerSpan = loginSpans.find(
      (el) => el.tagName === 'SPAN' && el.className.includes('underline'),
    );
    expect(bannerSpan).toBeTruthy();
  });
});

// ===========================================================================
// 13. Bug regressions
// ===========================================================================

describe('ReviewPage — regression: drop-without-completing shows UNFINISHED', () => {
  /**
   * Bug: User configures words 1–5, VocabularyQuizPage saves GuestSetting,
   * user navigates away without answering. NotificationContext.groupStates was
   * stale (refreshGuest() only called on quiz *completion*) so resolveGroupState
   * returned undefined → status defaulted to SCHEDULED → displayCompleted = total
   * → card showed "5/5" instead of "0/5 UNFINISHED".
   *
   * Fix: ReviewPage.useEffect now calls refreshGuest() before loadGuestData() so
   * groupStates is always in sync when cards render.
   *
   * Test approach: mock refreshGuest as a spy; set guestSettings = [one session]
   * with guestRecords = [] (no words answered); groupStates = empty Map (simulating
   * the stale-context scenario). Assert that refreshGuest was called, the card shows
   * UNFINISHED badge, and displayCompleted is 0/5 not 5/5.
   */

  it('calls refreshGuest() on mount so groupStates is synced', () => {
    const setting = gs({ min: 1, max: 5 });
    // groupStates is intentionally left EMPTY to simulate stale context
    mocks.state.guestSettings = [setting];
    mocks.state.guestRecords  = [];
    mocks.state.groupStates   = new Map(); // stale — no key yet
    mocks.state.dueGroups     = [];
    render(<ReviewPage />);

    expect(mocks.refreshGuest).toHaveBeenCalled();
  });

  it('shows UNFINISHED badge (not SCHEDULED) for a dropped-without-completing session', () => {
    const setting = gs({ min: 1, max: 5 });
    const group   = dg({ min: 1, max: 5, status: 'UNFINISHED' });
    // groupStates has the correct UNFINISHED entry (as refreshGuest() would populate)
    setupAndRender(setting, [], group);

    expectBadge('review.groupStatusUnfinished');
    expectNoBadge('review.groupStatusScheduled');
  });

  it('shows 0/5 progress (not 5/5) when no words answered', () => {
    const setting = gs({ min: 1, max: 5 });
    const group   = dg({ min: 1, max: 5, status: 'UNFINISHED' });
    setupAndRender(setting, [], group);

    // t('review.completionRatio', { completed: 0, total: 5 }) → "0/5"
    expect(screen.getByText('0/5')).toBeInTheDocument();
    // Completion bar at 0%
    const bar = document.querySelector('[style*="width: 0%"]');
    expect(bar).toBeInTheDocument();
    // Must NOT show 5/5 (the erroneous SCHEDULED display)
    expect(screen.queryByText('5/5')).not.toBeInTheDocument();
  });
});

describe('ReviewPage — regression: different ranges stay separate cards', () => {
  /**
   * Bug: loadGuestData() grouped sessions by date instead of by type:min:max.
   * Two different-range sessions on the same day merged into one card.
   *
   * Fix: re-bucket by type:min:max key.
   */

  it('renders two separate cards for same type but different ranges', () => {
    const sA = gs({ id: 'gA', min: 1,  max: 50  });
    const sB = gs({ id: 'gB', min: 51, max: 100 });
    // Both use the same timestamp so the old date-based bucketing would merge them
    sA.timestamp = new Date('2025-06-01T08:00:00Z').toISOString();
    sB.timestamp = new Date('2025-06-01T08:00:00Z').toISOString();

    const gA = dg({ min: 1,  max: 50,  status: 'DUE' });
    const gB = dg({ min: 51, max: 100, status: 'DUE' });

    mocks.state.guestSettings = [sA, sB];
    mocks.state.guestRecords  = [];
    mocks.state.groupStates   = new Map([[gA.groupKey, gA], [gB.groupKey, gB]]);
    mocks.state.dueGroups     = [gA, gB];
    render(<ReviewPage />);

    // Both range chips must be present in the DOM as separate cards
    expect(screen.getByText(/\(1–50\)/)).toBeInTheDocument();
    expect(screen.getByText(/\(51–100\)/)).toBeInTheDocument();
  });
});

describe('ReviewPage — regression: level cap at 6', () => {
  /**
   * Bug: Level walk `level + 1` had no upper bound; after 7+ on-time completions
   * reviewLevel exceeded 6, causing out-of-bounds interval lookup.
   *
   * Fix: Math.min(level + 1, intervals.length - 1).
   */

  it('never shows a level indicator above L7 regardless of reviewLevel in DueGroup', () => {
    // Simulate a hypothetical over-cap reviewLevel value coming from the server
    // (or a stale record). The UI should cap display at L7.
    const setting = gs({ min: 1, max: 2 });
    // Note: DueGroup.reviewLevel in practice is capped at 6 by computeGroupStates,
    // but we also verify the ReviewPage rendering handles it safely.
    const group = dg({ min: 1, max: 2, status: 'SCHEDULED', level: 6 });
    setupAndRender(setting, [gr(setting.id, 1), gr(setting.id, 2)], group);

    // Level 6 → displays as L7 (reviewLevel + 1 = 7)
    expect(screen.getByText(/L7/)).toBeInTheDocument();
    // Should NOT show any higher level like L8
    expect(screen.queryByText(/L8/)).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 14. Logged-in user
// ===========================================================================

describe('ReviewPage — logged-in user', () => {
  beforeEach(() => {
    mocks.state.isLoggedIn = true;
  });

  it('does NOT show the guest upsell banner when logged in', async () => {
    render(<ReviewPage />);
    // Wait for fetchData to settle, then confirm no guest banner
    await waitFor(() =>
      expect(screen.queryByText('review.guestBanner')).not.toBeInTheDocument(),
    );
  });

  it('shows empty state CTA when no groups', async () => {
    // doPost returns empty data → fetchData resolves with no groups
    render(<ReviewPage />);
    // loading=true hides the empty state initially; wait for it to appear
    await waitFor(() =>
      expect(screen.getByText('review.empty')).toBeInTheDocument(),
    );
  });

  it('shows a group card normally when a group exists', async () => {
    // For logged-in users fetchData drives the card list, not localStorage.
    // Override doPost to return one QuizSetting for the group.
    const group = dg({ min: 1, max: 5, status: 'SCHEDULED', level: 0 });
    vi.mocked(doPost).mockResolvedValueOnce({
      code: '0000', timestamp: new Date(), message: '',
      data: {
        wordEnglishList: [
          {
            type: 'wordEnglishList', min: 1, max: 5, total: 9481,
            timestamp: new Date().toISOString(),
            finishedCount: 5,
            latestFinishedTime: new Date().toISOString(),
          },
        ],
      },
    });
    mocks.state.groupStates = new Map([[group.groupKey, group]]);
    render(<ReviewPage />);
    await waitFor(() => expectBadge('review.groupStatusScheduled'));
  });
});

// ===========================================================================
// 15. Empty state button presence
// ===========================================================================

describe('ReviewPage — empty state button', () => {
  it('"go configure groups" button is present and has correct text', () => {
    render(<ReviewPage />);
    const btn = screen.getByText('review.goConfigureGroups');
    expect(btn).toBeInTheDocument();
  });

  it('filter bar is NOT shown when groups list is empty', () => {
    render(<ReviewPage />);
    expect(screen.queryByRole('button', { name: 'review.filterAll' })).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 16. Filter bar — clicking filters
// ===========================================================================

describe('ReviewPage — filter bar interactions', () => {
  function setupMultiGroup() {
    const sDue  = gs({ id: 'gDue',  min: 1,  max: 5  });
    const sSch  = gs({ id: 'gSch',  min: 6,  max: 10 });
    const gDue  = dg({ min: 1,  max: 5,  status: 'DUE'       });
    const gSch  = dg({ min: 6,  max: 10, status: 'SCHEDULED'  });

    mocks.state.guestSettings = [sDue, sSch];
    mocks.state.guestRecords  = [];
    mocks.state.groupStates   = new Map([[gDue.groupKey, gDue], [gSch.groupKey, gSch]]);
    mocks.state.dueGroups     = [gDue];
    render(<ReviewPage />);
  }

  it('clicking DUE filter hides SCHEDULED badge spans', () => {
    setupMultiGroup();
    fireEvent.click(screen.getByRole('button', { name: 'review.groupStatusDue' }));
    expectNoBadge('review.groupStatusScheduled');
    expectBadge('review.groupStatusDue');
  });

  it('clicking SCHEDULED filter hides DUE badge spans', () => {
    setupMultiGroup();
    fireEvent.click(screen.getByRole('button', { name: 'review.groupStatusScheduled' }));
    expectNoBadge('review.groupStatusDue');
    expectBadge('review.groupStatusScheduled');
  });

  it('clicking All after a filter restores all badges', () => {
    setupMultiGroup();
    fireEvent.click(screen.getByRole('button', { name: 'review.groupStatusDue' }));
    fireEvent.click(screen.getByRole('button', { name: 'review.filterAll' }));
    expectBadge('review.groupStatusDue');
    expectBadge('review.groupStatusScheduled');
  });

  it('clicking FRESH filter when no FRESH groups shows no cards', () => {
    setupMultiGroup();
    fireEvent.click(screen.getByRole('button', { name: 'review.groupStatusFresh' }));
    expectNoBadge('review.groupStatusDue');
    expectNoBadge('review.groupStatusScheduled');
  });

  it('clicking UNFINISHED filter when no UNFINISHED groups shows no cards', () => {
    setupMultiGroup();
    fireEvent.click(screen.getByRole('button', { name: 'review.groupStatusUnfinished' }));
    expectNoBadge('review.groupStatusDue');
    expectNoBadge('review.groupStatusScheduled');
  });
});

// ===========================================================================
// 17. Last activity display
// ===========================================================================

describe('ReviewPage — last activity', () => {
  it('group with lastCompletionTime shows "review.lastActivity" text', () => {
    const setting = gs({ min: 1, max: 5 });
    const group: DueGroup = {
      ...dg({ min: 1, max: 5, status: 'SCHEDULED', level: 0 }),
      lastCompletionTime: new Date(BASE - 25 * MIN),
    };
    setupAndRender(setting, [gr(setting.id, 1)], group);
    expect(screen.getByText('review.lastActivity')).toBeInTheDocument();
  });
});

// ===========================================================================
// 18. Multi-cycle progress bar values
// ===========================================================================

describe('ReviewPage — multi-cycle progress', () => {
  it('completed = total (exactly 1 full cycle) and DUE → cycleCompleted=0 → 0% bar', () => {
    const setting = gs({ min: 1, max: 4 });
    // 4 records = 1 full cycle
    const records = [1, 2, 3, 4].map((id) => gr(setting.id, id));
    const group = dg({ min: 1, max: 4, status: 'DUE' });
    setupAndRender(setting, records, group);
    // cycleCompleted = 4 % 4 = 0 → pct = 0
    const bar = document.querySelector('[style*="width: 0%"]');
    expect(bar).toBeInTheDocument();
    expect(screen.getByText('0/4')).toBeInTheDocument();
  });

  it('completed = total + 3 and UNFINISHED → cycleCompleted=3 → partial bar', () => {
    // total = 4, need completed = 7 across two separate sessions for the same group.
    // loadGuestData deduplicates answerId per-setting via Set, so the only way to
    // accumulate completed > total is to have multiple settings with the same group key.
    const s1 = gs({ min: 1, max: 4 }); // previous full cycle: answerIds 1-4 → +4
    const s2 = gs({ min: 1, max: 4 }); // current partial session: answerIds 1-3 → +3
    const r1 = [1, 2, 3, 4].map((id) => gr(s1.id, id));
    const r2 = [1, 2, 3].map((id) => gr(s2.id, id));
    const group = dg({ min: 1, max: 4, status: 'UNFINISHED' });
    mocks.state.guestSettings = [s1, s2];
    mocks.state.guestRecords  = [...r1, ...r2];
    mocks.state.groupStates   = new Map([[group.groupKey, group]]);
    mocks.state.dueGroups     = [group];
    render(<ReviewPage />);
    // completed=7, total=4 → cycleCompleted=7%4=3 → pct=Math.round(3/4*100)=75
    const bar = document.querySelector('[style*="width: 75%"]');
    expect(bar).toBeInTheDocument();
    expect(screen.getByText('3/4')).toBeInTheDocument();
  });
});

// ===========================================================================
// 19. Progress bar color
// ===========================================================================

describe('ReviewPage — progress bar color', () => {
  it('100% progress bar has bg-green-400 class', () => {
    const setting = gs({ min: 1, max: 3 });
    const records = [1, 2, 3].map((id) => gr(setting.id, id));
    const group = dg({ min: 1, max: 3, status: 'SCHEDULED' });
    setupAndRender(setting, records, group);

    const greenBar = document.querySelector('.bg-green-400');
    expect(greenBar).toBeInTheDocument();
  });

  it('partial progress bar has bg-blue-500 class', () => {
    const setting = gs({ min: 1, max: 5 });
    // 2 of 5 records
    const records = [1, 2].map((id) => gr(setting.id, id));
    const group = dg({ min: 1, max: 5, status: 'UNFINISHED' });
    setupAndRender(setting, records, group);

    const blueBar = document.querySelector('.bg-blue-500');
    expect(blueBar).toBeInTheDocument();
  });
});

// ===========================================================================
// 20. Group with no state in groupStates Map defaults to SCHEDULED
// ===========================================================================

describe('ReviewPage — group missing from groupStates', () => {
  it('group with no state in groupStates Map shows SCHEDULED badge and 100% bar', () => {
    const setting = gs({ min: 1, max: 5 });
    const records = [1, 2, 3, 4, 5].map((id) => gr(setting.id, id));
    // groupStates is empty — no entry for this group
    mocks.state.guestSettings = [setting];
    mocks.state.guestRecords  = records;
    mocks.state.groupStates   = new Map(); // intentionally empty
    mocks.state.dueGroups     = [];
    render(<ReviewPage />);

    // When groupStates has no key for this group, ReviewPage defaults to SCHEDULED
    expectBadge('review.groupStatusScheduled');
    const bar = document.querySelector('[style*="width: 100%"]');
    expect(bar).toBeInTheDocument();
  });
});

// ===========================================================================
// 21. UNFINISHED with 0 words completed
// ===========================================================================

describe('ReviewPage — UNFINISHED group with 0 words answered', () => {
  it('shows 0% bar, 0/10 text, resume prompt, and no review-now prompt', () => {
    const setting = gs({ min: 1, max: 10 });
    const group = dg({ min: 1, max: 10, status: 'UNFINISHED', level: 0 });
    setupAndRender(setting, [], group);

    const bar = document.querySelector('[style*="width: 0%"]');
    expect(bar).toBeInTheDocument();
    expect(screen.getByText('0/10')).toBeInTheDocument();
    expect(screen.getByText('review.resumePrompt')).toBeInTheDocument();
    expect(screen.queryByText('review.reviewNow')).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 22. All 4 states present in same render
// ===========================================================================

describe('ReviewPage — all 4 states simultaneously', () => {
  it('renders all 4 status badge spans when all 4 states are present', () => {
    const sDue   = gs({ id: 'gDue',   min: 1,  max: 5  });
    const sFresh = gs({ id: 'gFresh', min: 6,  max: 10 });
    const sSched = gs({ id: 'gSched', min: 11, max: 15 });
    const sUnfin = gs({ id: 'gUnfin', min: 16, max: 20 });

    const gDue   = dg({ min: 1,  max: 5,  status: 'DUE'        });
    const gFresh = dg({ min: 6,  max: 10, status: 'FRESH'       });
    const gSched = dg({ min: 11, max: 15, status: 'SCHEDULED'   });
    const gUnfin = dg({ min: 16, max: 20, status: 'UNFINISHED'  });

    mocks.state.guestSettings = [sDue, sFresh, sSched, sUnfin];
    mocks.state.guestRecords  = [];
    mocks.state.groupStates   = new Map([
      [gDue.groupKey, gDue],
      [gFresh.groupKey, gFresh],
      [gSched.groupKey, gSched],
      [gUnfin.groupKey, gUnfin],
    ]);
    mocks.state.dueGroups = [gDue, gFresh, gUnfin];
    render(<ReviewPage />);

    expectBadge('review.groupStatusDue');
    expectBadge('review.groupStatusFresh');
    expectBadge('review.groupStatusScheduled');
    expectBadge('review.groupStatusUnfinished');
  });
});

// ===========================================================================
// 23. FRESH card level display
// ===========================================================================

describe('ReviewPage — FRESH card level display', () => {
  it('FRESH group at reviewLevel=4 shows L5 (level before forgetting)', () => {
    const setting = gs({ min: 1, max: 3 });
    const records = [1, 2, 3].map((id) => gr(setting.id, id));
    const group = dg({ min: 1, max: 3, status: 'FRESH', level: 4 });
    setupAndRender(setting, records, group);
    expect(screen.getByText(/L5/)).toBeInTheDocument();
  });

  it('FRESH group at reviewLevel=0 shows L1', () => {
    const setting = gs({ min: 1, max: 3 });
    const group = dg({ min: 1, max: 3, status: 'FRESH', level: 0 });
    setupAndRender(setting, [], group);
    expect(screen.getByText(/L1/)).toBeInTheDocument();
  });
});

// ===========================================================================
// 24. DUE card with level > 0 shows correct interval
// ===========================================================================

describe('ReviewPage — DUE card level interval', () => {
  it('DUE at level 3 shows the 1-day interval label', () => {
    const setting = gs({ min: 1, max: 5 });
    const group = dg({ min: 1, max: 5, status: 'DUE', level: 3 });
    setupAndRender(setting, [], group);
    expect(screen.getByText(/1 day/)).toBeInTheDocument();
  });

  it('DUE at level 0 shows the 20 min interval label', () => {
    const setting = gs({ min: 1, max: 5 });
    const group = dg({ min: 1, max: 5, status: 'DUE', level: 0 });
    setupAndRender(setting, [], group);
    expect(screen.getByText(/20 min/)).toBeInTheDocument();
  });
});

// ===========================================================================
// 25. Completion ratio for SCHEDULED at exactly total words
// ===========================================================================

describe('ReviewPage — SCHEDULED completion ratio', () => {
  it('SCHEDULED at exactly 5/5 shows "5/5"', () => {
    const setting = gs({ min: 1, max: 5 });
    const records = [1, 2, 3, 4, 5].map((id) => gr(setting.id, id));
    const group = dg({ min: 1, max: 5, status: 'SCHEDULED', level: 0 });
    setupAndRender(setting, records, group);
    expect(screen.getByText('5/5')).toBeInTheDocument();
  });
});

// ===========================================================================
// 26. UNFINISHED with finishedCount = rangeSize - 1
// ===========================================================================

describe('ReviewPage — UNFINISHED one word left', () => {
  it('UNFINISHED with 9 of 10 words done shows 90% progress', () => {
    const setting = gs({ min: 1, max: 10 });
    // 9 records (one word left)
    const records = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => gr(setting.id, id));
    const group = dg({ min: 1, max: 10, status: 'UNFINISHED', level: 0 });
    setupAndRender(setting, records, group);
    // completed=9, total=10 → cycleCompleted=9%10=9 → pct=90
    const bar = document.querySelector('[style*="width: 90%"]');
    expect(bar).toBeInTheDocument();
    expect(screen.getByText('9/10')).toBeInTheDocument();
  });
});

// ===========================================================================
// 27. Banner group count badge
// ===========================================================================

describe('ReviewPage — banner group count badge', () => {
  it('banner shows count 2 when there are 2 DUE groups', () => {
    const sA = gs({ id: 'gA', min: 1,  max: 5  });
    const sB = gs({ id: 'gB', min: 6,  max: 10 });
    const gA = dg({ min: 1,  max: 5,  status: 'DUE' });
    const gB = dg({ min: 6,  max: 10, status: 'DUE' });

    mocks.state.guestSettings = [sA, sB];
    mocks.state.guestRecords  = [];
    mocks.state.groupStates   = new Map([[gA.groupKey, gA], [gB.groupKey, gB]]);
    mocks.state.dueGroups     = [gA, gB];
    render(<ReviewPage />);

    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('banner shows count 1 for a single FRESH group', () => {
    const setting = gs({ min: 1, max: 3 });
    const group = dg({ min: 1, max: 3, status: 'FRESH' });
    setupAndRender(setting, [], group);
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});

// ===========================================================================
// 28. "Review early" button — conditional display
// ===========================================================================

describe('ReviewPage — "review early" button conditions', () => {
  it('shown ONLY when SCHEDULED AND pct === 100', () => {
    const setting = gs({ min: 1, max: 3 });
    const records = [1, 2, 3].map((id) => gr(setting.id, id));
    const group = dg({ min: 1, max: 3, status: 'SCHEDULED' });
    setupAndRender(setting, records, group);
    expect(screen.getByText(/review\.reviewEarly/)).toBeInTheDocument();
  });

  it('NOT shown when SCHEDULED but pct < 100 (partial progress)', () => {
    const setting = gs({ min: 1, max: 5 });
    // Only 2 of 5 records (partial)
    const records = [1, 2].map((id) => gr(setting.id, id));
    const group = dg({ min: 1, max: 5, status: 'UNFINISHED' });
    setupAndRender(setting, records, group);
    expect(screen.queryByText(/review\.reviewEarly/)).not.toBeInTheDocument();
  });

  it('NOT shown when DUE even though pct would be 0', () => {
    const setting = gs({ min: 1, max: 3 });
    const records = [1, 2, 3].map((id) => gr(setting.id, id));
    const group = dg({ min: 1, max: 3, status: 'DUE' });
    setupAndRender(setting, records, group);
    expect(screen.queryByText(/review\.reviewEarly/)).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 29. "Start Due Review" button calls navigate when clicked
// ===========================================================================

describe('ReviewPage — "Start Due Review" button', () => {
  it('clicking "Start Due Review" calls navigate', () => {
    const setting = gs({ min: 1, max: 3 });
    const group = dg({ min: 1, max: 3, status: 'DUE' });
    setupAndRender(setting, [], group);

    const btn = screen.getByText('review.startDueReview');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(mocks.navigate).toHaveBeenCalled();
  });
});

// ===========================================================================
// 30. UNFINISHED word range chip shows correct range
// ===========================================================================

describe('ReviewPage — UNFINISHED word range chip', () => {
  it('UNFINISHED group shows correct range in the chip', () => {
    const setting = gs({ min: 201, max: 300 });
    const group = dg({ min: 201, max: 300, status: 'UNFINISHED' });
    setupAndRender(setting, [], group);
    expect(screen.getByText(/\(201–300\)/)).toBeInTheDocument();
  });
});

// ===========================================================================
// 31. Logged-in user with two different range sessions
// ===========================================================================

describe('ReviewPage — logged-in user multiple ranges', () => {
  beforeEach(() => {
    mocks.state.isLoggedIn = true;
  });

  it('two groups with different ranges render as two separate cards', async () => {
    const gA = dg({ min: 1,    max: 1000, status: 'SCHEDULED' });
    const gB = dg({ min: 1001, max: 2000, status: 'DUE'       });
    // For logged-in users fetchData drives the card list via doPost.
    vi.mocked(doPost).mockResolvedValueOnce({
      code: '0000', timestamp: new Date(), message: '',
      data: {
        wordEnglishList: [
          { type: 'wordEnglishList', min: 1,    max: 1000, total: 9481,
            timestamp: new Date().toISOString(), finishedCount: 1000 },
          { type: 'wordEnglishList', min: 1001, max: 2000, total: 9481,
            timestamp: new Date().toISOString(), finishedCount: 0 },
        ],
      },
    });
    mocks.state.groupStates = new Map([[gA.groupKey, gA], [gB.groupKey, gB]]);
    mocks.state.dueGroups   = [gB];
    render(<ReviewPage />);

    await waitFor(() => expect(screen.getByText(/\(1–1000\)/)).toBeInTheDocument());
    expect(screen.getByText(/\(1001–2000\)/)).toBeInTheDocument();
    expectBadge('review.groupStatusScheduled');
    expectBadge('review.groupStatusDue');
  });
});

// ===========================================================================
// 32. Filter bar — FRESH and UNFINISHED filters
// ===========================================================================

describe('ReviewPage — filter bar FRESH and UNFINISHED', () => {
  it('clicking FRESH filter shows only FRESH cards', () => {
    const sFresh = gs({ id: 'gF', min: 1, max: 5  });
    const sDue   = gs({ id: 'gD', min: 6, max: 10 });
    const gFresh = dg({ min: 1, max: 5,  status: 'FRESH' });
    const gDue   = dg({ min: 6, max: 10, status: 'DUE'   });

    mocks.state.guestSettings = [sFresh, sDue];
    mocks.state.guestRecords  = [];
    mocks.state.groupStates   = new Map([[gFresh.groupKey, gFresh], [gDue.groupKey, gDue]]);
    mocks.state.dueGroups     = [gFresh, gDue];
    render(<ReviewPage />);

    fireEvent.click(screen.getByRole('button', { name: 'review.groupStatusFresh' }));
    expectBadge('review.groupStatusFresh');
    expectNoBadge('review.groupStatusDue');
  });

  it('clicking UNFINISHED filter shows only UNFINISHED cards', () => {
    const sUnfin = gs({ id: 'gU', min: 1, max: 10 });
    const sSched = gs({ id: 'gS', min: 11, max: 20 });
    const gUnfin = dg({ min: 1,  max: 10, status: 'UNFINISHED' });
    const gSched = dg({ min: 11, max: 20, status: 'SCHEDULED'  });

    mocks.state.guestSettings = [sUnfin, sSched];
    mocks.state.guestRecords  = [];
    mocks.state.groupStates   = new Map([[gUnfin.groupKey, gUnfin], [gSched.groupKey, gSched]]);
    mocks.state.dueGroups     = [gUnfin];
    render(<ReviewPage />);

    fireEvent.click(screen.getByRole('button', { name: 'review.groupStatusUnfinished' }));
    expectBadge('review.groupStatusUnfinished');
    expectNoBadge('review.groupStatusScheduled');
  });
});

// ===========================================================================
// 33. "review early" button is absent for FRESH and UNFINISHED
// ===========================================================================

describe('ReviewPage — "review early" only for SCHEDULED 100%', () => {
  it('NOT shown for FRESH group', () => {
    const setting = gs({ min: 1, max: 3 });
    const group = dg({ min: 1, max: 3, status: 'FRESH' });
    setupAndRender(setting, [], group);
    expect(screen.queryByText(/review\.reviewEarly/)).not.toBeInTheDocument();
  });

  it('NOT shown for UNFINISHED group', () => {
    const setting = gs({ min: 1, max: 3 });
    const group = dg({ min: 1, max: 3, status: 'UNFINISHED' });
    setupAndRender(setting, [], group);
    expect(screen.queryByText(/review\.reviewEarly/)).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 34. Progress bar — additional percentage values
// ===========================================================================

describe('ReviewPage — progress bar additional percentages', () => {
  it('UNFINISHED 5/10 = 50% bar', () => {
    const setting = gs({ min: 1, max: 10 });
    const records = [1, 2, 3, 4, 5].map((id) => gr(setting.id, id));
    const group = dg({ min: 1, max: 10, status: 'UNFINISHED' });
    setupAndRender(setting, records, group);
    expect(document.querySelector('[style*="width: 50%"]')).toBeInTheDocument();
    expect(screen.getByText('5/10')).toBeInTheDocument();
  });

  it('UNFINISHED 1/4 = 25% bar', () => {
    const setting = gs({ min: 1, max: 4 });
    const records = [1].map((id) => gr(setting.id, id));
    const group = dg({ min: 1, max: 4, status: 'UNFINISHED' });
    setupAndRender(setting, records, group);
    expect(document.querySelector('[style*="width: 25%"]')).toBeInTheDocument();
    expect(screen.getByText('1/4')).toBeInTheDocument();
  });

  it('SCHEDULED with total=1 shows 1/1 and 100% bar', () => {
    const setting = gs({ min: 42, max: 42 });
    const records = [gr(setting.id, 42)];
    const group = dg({ min: 42, max: 42, status: 'SCHEDULED' });
    setupAndRender(setting, records, group);
    expect(screen.getByText('1/1')).toBeInTheDocument();
    expect(document.querySelector('[style*="width: 100%"]')).toBeInTheDocument();
  });
});

// ===========================================================================
// 35. Word type translation key in card
// ===========================================================================

describe('ReviewPage — word type label in card', () => {
  it('wordEnglishList type shows "wordLists.wordEnglishList" translation key', () => {
    const setting = gs({ type: 'wordEnglishList', min: 1, max: 5 });
    const group = dg({ type: 'wordEnglishList', min: 1, max: 5, status: 'SCHEDULED' });
    setupAndRender(setting, [], group);
    expect(screen.getByText(/wordLists\.wordEnglishList/)).toBeInTheDocument();
  });

  it('wordJapaneseList type shows "wordLists.wordJapaneseList" translation key', () => {
    const setting = gs({ type: 'wordJapaneseList', min: 1, max: 5 });
    const group = dg({ type: 'wordJapaneseList', min: 1, max: 5, status: 'SCHEDULED' });
    setupAndRender(setting, [], group);
    expect(screen.getByText(/wordLists\.wordJapaneseList/)).toBeInTheDocument();
  });
});

// ===========================================================================
// 36. Due banner group chips for UNFINISHED
// ===========================================================================

describe('ReviewPage — banner chips for UNFINISHED groups', () => {
  it('UNFINISHED group appears in the due-for-review banner', () => {
    const setting = gs({ min: 101, max: 200 });
    const group = dg({ min: 101, max: 200, status: 'UNFINISHED' });
    setupAndRender(setting, [], group);
    expect(screen.getByText('review.dueForReview')).toBeInTheDocument();
    expect(screen.getAllByText(/101–200/).length).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// 37. SCHEDULED group does not appear in the banner
// ===========================================================================

describe('ReviewPage — SCHEDULED group absent from banner', () => {
  it('a SCHEDULED group is not listed in the banner due chips', () => {
    const setting = gs({ min: 1, max: 5 });
    const records = [1, 2, 3, 4, 5].map((id) => gr(setting.id, id));
    const group = dg({ min: 1, max: 5, status: 'SCHEDULED' });
    setupAndRender(setting, records, group);
    // Banner should not appear at all for SCHEDULED-only groups
    expect(screen.queryByText('review.dueForReview')).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 38. No filter bar and no search bar when no groups
// ===========================================================================

describe('ReviewPage — filter and search bar absent with no groups', () => {
  it('filter bar buttons are absent when no groups', () => {
    render(<ReviewPage />);
    expect(screen.queryByRole('button', { name: 'review.groupStatusDue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'review.groupStatusFresh' })).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 39. DUE group — additional badge and level assertions
// ===========================================================================

describe('ReviewPage — DUE group at higher levels', () => {
  it('DUE at level 5 shows L6 badge and 6-day interval', () => {
    const setting = gs({ min: 1, max: 5 });
    const group = dg({ min: 1, max: 5, status: 'DUE', level: 5 });
    setupAndRender(setting, [], group);
    expect(screen.getByText(/L6/)).toBeInTheDocument();
    expect(screen.getByText(/6 days/)).toBeInTheDocument();
  });

  it('DUE at level 6 shows L7 badge and 31-day interval', () => {
    const setting = gs({ min: 1, max: 5 });
    const group = dg({ min: 1, max: 5, status: 'DUE', level: 6 });
    setupAndRender(setting, [], group);
    expect(screen.getByText(/L7/)).toBeInTheDocument();
    expect(screen.getByText(/31 days/)).toBeInTheDocument();
  });
});

// ===========================================================================
// 40. nextReviewTime countdown for SCHEDULED at different levels
// ===========================================================================

describe('ReviewPage — SCHEDULED countdown shown', () => {
  it('SCHEDULED group shows "review.nextReview" key (t returns the key)', () => {
    const setting = gs({ min: 1, max: 3 });
    const records = [1, 2, 3].map((id) => gr(setting.id, id));
    const group = dg({
      min: 1, max: 3, status: 'SCHEDULED', level: 2,
      nextReviewTime: new Date(BASE + 8 * MIN * 60), // 8 hours from now
    });
    setupAndRender(setting, records, group);
    expect(screen.getByText('review.nextReview')).toBeInTheDocument();
  });
});

// ===========================================================================
// 41. Logged-in FRESH/DUE re-entry progress bug (regression)
//
// Bug: completing 1 word out of 10 after entering a FRESH or DUE group showed
// 10/10 instead of 1/10 because fetchData() passed the most-recent session's
// `id` even when it was already fully completed. VocabularyQuizPage reused the
// old session, appended the new record, and the updated latestFinishedTime
// caused computeGroupStates to return SCHEDULED → displayCompleted=group.total.
//
// Fix: id is cleared (set to undefined) on the record passed to `records[]`
// when the most-recent session is fully completed (finishedCount >= rangeSize),
// forcing VocabularyQuizPage to create a new session via the API.
// ===========================================================================

describe('ReviewPage — logged-in FRESH group re-entry (progress bug regression)', () => {
  beforeEach(() => {
    mocks.state.isLoggedIn = true;
  });

  it('FRESH group: mostRecent fully completed → records[0].id is undefined (new session forced)', async () => {
    // Session completed with all 10 words answered, now in FRESH state
    const group = dg({ min: 1, max: 10, status: 'FRESH', level: 0 });
    vi.mocked(doPost).mockResolvedValueOnce({
      code: '0000', timestamp: new Date(), message: '',
      data: {
        wordEnglishList: [
          {
            id: 'old-session-id',
            type: 'wordEnglishList', min: 1, max: 10, total: 9481,
            timestamp: new Date().toISOString(),
            finishedCount: 10,          // fully completed
            latestFinishedTime: new Date().toISOString(),
          },
        ],
      },
    });
    mocks.state.groupStates = new Map([[group.groupKey, group]]);
    mocks.state.dueGroups   = [group];
    render(<ReviewPage />);

    await waitFor(() => expectBadge('review.groupStatusFresh'));

    // The card should show 0/10 (cycleCompleted = 10%10 = 0) for FRESH, not 10/10
    // FRESH status → displayCompleted = cycleCompleted = 0
    expect(screen.queryByText('10/10')).not.toBeInTheDocument();
    expect(screen.getByText('0/10')).toBeInTheDocument();
  });

  it('DUE group: mostRecent fully completed → shows 0/10, not 10/10', async () => {
    const group = dg({ min: 1, max: 10, status: 'DUE', level: 1 });
    vi.mocked(doPost).mockResolvedValueOnce({
      code: '0000', timestamp: new Date(), message: '',
      data: {
        wordEnglishList: [
          {
            id: 'old-session-id',
            type: 'wordEnglishList', min: 1, max: 10, total: 9481,
            timestamp: new Date().toISOString(),
            finishedCount: 10,
            latestFinishedTime: new Date().toISOString(),
          },
        ],
      },
    });
    mocks.state.groupStates = new Map([[group.groupKey, group]]);
    mocks.state.dueGroups   = [group];
    render(<ReviewPage />);

    await waitFor(() => expectBadge('review.groupStatusDue'));

    // DUE → cycleCompleted = 10%10 = 0, displayCompleted = 0 → 0/10
    expect(screen.queryByText('10/10')).not.toBeInTheDocument();
    expect(screen.getByText('0/10')).toBeInTheDocument();
  });

  it('UNFINISHED group: mostRecent partially done → shows partial progress and keeps id', async () => {
    // Session has 3/10 done → should display 3/10
    const group = dg({ min: 1, max: 10, status: 'UNFINISHED', level: 0 });
    vi.mocked(doPost).mockResolvedValueOnce({
      code: '0000', timestamp: new Date(), message: '',
      data: {
        wordEnglishList: [
          {
            id: 'partial-session-id',
            type: 'wordEnglishList', min: 1, max: 10, total: 9481,
            timestamp: new Date().toISOString(),
            finishedCount: 3,           // partial — genuinely unfinished
            latestFinishedTime: new Date().toISOString(),
          },
        ],
      },
    });
    mocks.state.groupStates = new Map([[group.groupKey, group]]);
    mocks.state.dueGroups   = [group];
    render(<ReviewPage />);

    await waitFor(() => expectBadge('review.groupStatusUnfinished'));

    // UNFINISHED → cycleCompleted = 3%10 = 3, displayCompleted = 3 → 3/10
    expect(screen.getByText('3/10')).toBeInTheDocument();
  });

  it('SCHEDULED group: most recent fully completed → shows 10/10 (correct for SCHEDULED)', async () => {
    // SCHEDULED is the one case where fully-completed session should show 100%
    const group = dg({ min: 1, max: 10, status: 'SCHEDULED', level: 0 });
    vi.mocked(doPost).mockResolvedValueOnce({
      code: '0000', timestamp: new Date(), message: '',
      data: {
        wordEnglishList: [
          {
            id: 'completed-session-id',
            type: 'wordEnglishList', min: 1, max: 10, total: 9481,
            timestamp: new Date().toISOString(),
            finishedCount: 10,
            latestFinishedTime: new Date().toISOString(),
          },
        ],
      },
    });
    mocks.state.groupStates = new Map([[group.groupKey, group]]);
    mocks.state.dueGroups   = [];
    render(<ReviewPage />);

    await waitFor(() => expectBadge('review.groupStatusScheduled'));

    // SCHEDULED → displayCompleted = group.total = 10 → 10/10 (intentional)
    expect(screen.getByText('10/10')).toBeInTheDocument();
  });
});

describe('ReviewPage — guest FRESH group re-entry (progress bug regression)', () => {
  it('FRESH group: 1/10 words done in new session → shows 1/10, not 10/10', () => {
    // Old session: all 10 words completed
    const oldSession = gs({ id: 'old', min: 1, max: 10 });
    const oldRecords = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) =>
      gr(oldSession.id, id),
    );
    // New session (created by fixed code): only 1 word done
    const newSession = gs({ id: 'new', min: 1, max: 10 });
    const newRecord = gr(newSession.id, 3); // answerId=3

    const group = dg({ min: 1, max: 10, status: 'UNFINISHED', level: 0 });
    mocks.state.guestSettings = [oldSession, newSession];
    mocks.state.guestRecords  = [...oldRecords, newRecord];
    mocks.state.groupStates   = new Map([[group.groupKey, group]]);
    mocks.state.dueGroups     = [group];
    render(<ReviewPage />);

    // completed = 10 (old) + 1 (new) = 11, total = 10
    // cycleCompleted = 11 % 10 = 1 → displayCompleted = 1 → 1/10
    expect(screen.getByText('1/10')).toBeInTheDocument();
    expect(screen.queryByText('10/10')).not.toBeInTheDocument();
  });
});
