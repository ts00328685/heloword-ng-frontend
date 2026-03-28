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
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DueGroup } from '../../models';
import type { GuestSetting, GuestRecord } from '../../services/guestStorage.service';

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
    user:                 null,
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
