/**
 * Comprehensive tests for the Ebbinghaus forgetting curve engine.
 *
 * Key constants (DEFAULT_INTERVALS_MS):
 *   [0] 20 min
 *   [1] 1 hour
 *   [2] 8 hours
 *   [3] 1 day
 *   [4] 2 days
 *   [5] 6 days
 *   [6] 31 days
 *
 * Grace window: dueTime + 50% of currentInterval  (= 1.5× interval from last completion)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  computeGroupStates,
  DEFAULT_INTERVALS_MS,
  formatInterval,
  formatRelativeTime,
  getGroupKey,
  parseGroupKey,
  type GroupLevelOverride,
} from './ebbinghaus';
import type { QuizSetting } from '../models';

// ---------------------------------------------------------------------------
// Shorthand time constants (ms)
// ---------------------------------------------------------------------------
const MIN  = 60_000;
const HOUR = 60 * MIN;
const DAY  = 24 * HOUR;

const INT = DEFAULT_INTERVALS_MS; // [20min, 1hr, 8hr, 1day, 2day, 6day, 31day]

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Fixed "now" used as base for all relative timestamps. */
const BASE = new Date('2025-06-01T12:00:00Z').getTime();

function t(offsetMs: number): Date {
  return new Date(BASE + offsetMs);
}

function makeCompleted(opts: {
  type?: string;
  min?: number;
  max?: number;
  total?: number;
  timestamp?: Date;
  latestFinishedTime: Date;
  finishedCount?: number;
}): QuizSetting {
  const min   = opts.min   ?? 1;
  const max   = opts.max   ?? 100;
  const total = opts.total ?? (max - min + 1);
  return {
    type: opts.type ?? 'wordEnglishList',
    min,
    max,
    total,
    tableName: 'wordEnglishList',
    isSelected: true,
    timestamp: opts.timestamp ?? opts.latestFinishedTime,
    latestFinishedTime: opts.latestFinishedTime,
    finishedCount: opts.finishedCount ?? total,
  };
}

function makeUnfinished(opts: {
  type?: string;
  min?: number;
  max?: number;
  total?: number;
  timestamp?: Date;
  finishedCount?: number;
}): QuizSetting {
  const min   = opts.min   ?? 1;
  const max   = opts.max   ?? 100;
  const total = opts.total ?? (max - min + 1);
  return {
    type: opts.type ?? 'wordEnglishList',
    min,
    max,
    total,
    tableName: 'wordEnglishList',
    isSelected: true,
    timestamp: opts.timestamp ?? new Date(BASE),
    finishedCount: opts.finishedCount ?? 0,
  };
}

/** Helper: run computeGroupStates with a fixed "now" via fake timers. */
function runAt(nowMs: number, settings: QuizSetting[], overrides?: Record<string, GroupLevelOverride>) {
  vi.setSystemTime(nowMs);
  return computeGroupStates(settings, INT, overrides);
}

const KEY = getGroupKey('wordEnglishList', 1, 100);

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ===========================================================================
// 1. Utility functions
// ===========================================================================

describe('getGroupKey / parseGroupKey', () => {
  it('round-trips correctly', () => {
    const key = getGroupKey('wordEnglishList', 1, 2000);
    expect(key).toBe('wordEnglishList:1:2000');
    expect(parseGroupKey(key)).toEqual({ type: 'wordEnglishList', min: 1, max: 2000 });
  });

  it('round-trips with type containing colons-like separator chars (no colons)', () => {
    const key = getGroupKey('wordJapaneseList', 100, 500);
    expect(parseGroupKey(key)).toEqual({ type: 'wordJapaneseList', min: 100, max: 500 });
  });
});

describe('formatInterval', () => {
  it('formats minutes', () => {
    expect(formatInterval(20 * MIN)).toBe('20 min');
    expect(formatInterval(45 * MIN)).toBe('45 min');
  });

  it('formats exactly 1 hour', () => {
    expect(formatInterval(HOUR)).toBe('1 hour');
  });

  it('formats multiple hours', () => {
    expect(formatInterval(8 * HOUR)).toBe('8 hours');
  });

  it('formats exactly 1 day', () => {
    expect(formatInterval(DAY)).toBe('1 day');
  });

  it('formats multiple days', () => {
    expect(formatInterval(6 * DAY)).toBe('6 days');
    expect(formatInterval(31 * DAY)).toBe('31 days');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2025-06-01T12:00:00Z');

  it('future — minutes', () => {
    expect(formatRelativeTime(new Date(now.getTime() + 20 * MIN), now)).toBe('in 20 min');
  });

  it('past — minutes', () => {
    expect(formatRelativeTime(new Date(now.getTime() - 20 * MIN), now)).toBe('20 min ago');
  });

  it('future — 1 hour', () => {
    expect(formatRelativeTime(new Date(now.getTime() + HOUR), now)).toBe('in 1 hour');
  });

  it('past — hours', () => {
    expect(formatRelativeTime(new Date(now.getTime() - 3 * HOUR), now)).toBe('3 hours ago');
  });

  it('future — 1 day', () => {
    expect(formatRelativeTime(new Date(now.getTime() + DAY), now)).toBe('in 1 day');
  });

  it('past — days', () => {
    expect(formatRelativeTime(new Date(now.getTime() - 3 * DAY), now)).toBe('3 days ago');
  });
});

// ===========================================================================
// 2. Empty / no completions
// ===========================================================================

describe('computeGroupStates — empty / no completions', () => {
  it('returns empty map for empty settings array', () => {
    const result = runAt(BASE, []);
    expect(result.size).toBe(0);
  });

  it('group with no latestFinishedTime → UNFINISHED level 0', () => {
    const settings = [makeUnfinished({ timestamp: t(-1 * HOUR) })];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.status).toBe('UNFINISHED');
    expect(g.reviewLevel).toBe(0);
    expect(g.nextReviewTime).toBeUndefined();
    expect(g.lastCompletionTime).toBeUndefined();
  });

  it('group with finishedCount < rangeSize → UNFINISHED', () => {
    const settings = [
      makeCompleted({ latestFinishedTime: t(-2 * HOUR), finishedCount: 50 }), // 50/100
    ];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.status).toBe('UNFINISHED');
    expect(g.reviewLevel).toBe(0);
  });
});

// ===========================================================================
// 3. Single completion — status depends on how much time has passed
// ===========================================================================

describe('computeGroupStates — single completion', () => {
  // First interval = 20 min; grace = 20 + 10 = 30 min from completion

  it('SCHEDULED: completed recently, next review not yet due', () => {
    // Completed 10 min ago → due in 10 min → SCHEDULED
    const settings = [makeCompleted({ latestFinishedTime: t(-10 * MIN) })];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.status).toBe('SCHEDULED');
    expect(g.reviewLevel).toBe(0);
    expect(g.nextReviewTime).toEqual(new Date(BASE - 10 * MIN + INT[0]));
  });

  it('DUE: exactly at due time (20 min elapsed)', () => {
    const completedAt = t(-20 * MIN);
    const settings = [makeCompleted({ latestFinishedTime: completedAt })];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.status).toBe('DUE');
    expect(g.reviewLevel).toBe(0);
  });

  it('DUE: between due time and grace end (25 min elapsed)', () => {
    const settings = [makeCompleted({ latestFinishedTime: t(-25 * MIN) })];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.status).toBe('DUE');
    expect(g.reviewLevel).toBe(0);
  });

  it('DUE: exactly 1ms before grace end', () => {
    // grace = 30 min from completion, so 30 min - 1ms elapsed = still DUE
    const settings = [makeCompleted({ latestFinishedTime: t(-(30 * MIN - 1)) })];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.status).toBe('DUE');
  });

  it('FRESH: grace window missed (31 min elapsed — past 30-min grace)', () => {
    const settings = [makeCompleted({ latestFinishedTime: t(-31 * MIN) })];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.status).toBe('FRESH');
    expect(g.reviewLevel).toBe(0);
  });

  it('FRESH: very old completion (7 days elapsed)', () => {
    const settings = [makeCompleted({ latestFinishedTime: t(-7 * DAY) })];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.status).toBe('FRESH');
    expect(g.reviewLevel).toBe(0);
  });
});

// ===========================================================================
// 4. Level progression — on-time reviews
// ===========================================================================

describe('computeGroupStates — level advancement', () => {
  it('advances to level 1 after two on-time completions', () => {
    // T0: initial completion
    // T1: review within 20-min window (at T0 + 15 min)
    const T0 = t(-3 * HOUR);
    const T1 = new Date(T0.getTime() + 15 * MIN); // within grace of T0
    const settings = [
      makeCompleted({ timestamp: T0, latestFinishedTime: T0 }),
      makeCompleted({ timestamp: T1, latestFinishedTime: T1 }),
    ];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    // Level 1 interval = 1 hour; due at T1 + 1hr
    // T1 = BASE - 3hr + 15min; T1 + 1hr = BASE - 2hr 45min → already in the past, status depends on how far
    expect(g.reviewLevel).toBe(1);
  });

  it('advances through multiple levels correctly', () => {
    // Build a history that advances level 0→1→2→3
    // INT[0]=20min, INT[1]=1hr, INT[2]=8hr, INT[3]=1day
    // grace multiplier: 1.5x interval
    const T0 = t(-100 * DAY); // very old starting point

    // Within 30 min of T0 → advances to level 1
    const T1 = new Date(T0.getTime() + 10 * MIN);
    // Within 90 min of T1 (INT[1]=1hr grace=1.5hr) → advances to level 2
    const T2 = new Date(T1.getTime() + HOUR + 10 * MIN);
    // Within 12hr of T2 (INT[2]=8hr grace=12hr) → advances to level 3
    const T3 = new Date(T2.getTime() + 8 * HOUR + 30 * MIN);
    // Within 36hr of T3 (INT[3]=1day grace=1.5day) → advances to level 4
    const T4 = new Date(T3.getTime() + DAY + 6 * HOUR);

    const settings = [T0, T1, T2, T3, T4].map((ts) =>
      makeCompleted({ timestamp: ts, latestFinishedTime: ts }),
    );
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.reviewLevel).toBe(4);
    expect(g.lastCompletionTime).toEqual(T4);
  });

  it('level is capped at intervals.length - 1 (6) for many completions', () => {
    // Create 10 on-time completions — level should cap at 6 (not go to 7, 8, 9...)
    // Each completion happens at 10% of the current interval after the previous one
    // so it is always within the grace window (1.5× interval).
    const timestamps: Date[] = [];
    let cur = new Date(BASE - 200 * DAY);
    timestamps.push(cur);
    for (let i = 0; i < 9; i++) {
      const intervalIdx = Math.min(i, INT.length - 1);
      cur = new Date(cur.getTime() + INT[intervalIdx] * 1.1); // just past due (within grace)
      timestamps.push(cur);
    }

    const settings = timestamps.map((ts) =>
      makeCompleted({ timestamp: ts, latestFinishedTime: ts }),
    );
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.reviewLevel).toBe(INT.length - 1); // must be exactly 6, not higher
  });
});

// ===========================================================================
// 5. Grace window miss → level reset
// ===========================================================================

describe('computeGroupStates — grace window miss resets level', () => {
  it('misses grace on second review → resets to level 0', () => {
    // T0: initial completion; T1: 35 min later (past 30-min grace)
    const T0 = t(-2 * HOUR);
    const T1 = new Date(T0.getTime() + 35 * MIN); // missed grace
    const settings = [
      makeCompleted({ timestamp: T0, latestFinishedTime: T0 }),
      makeCompleted({ timestamp: T1, latestFinishedTime: T1 }),
    ];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    // T1 = BASE - 2hr + 35min = BASE - 85min
    // level=0 after reset, INT[0]=20min, dueTime = T1 + 20min = BASE - 65min
    // graceEnd = BASE - 65min + 10min = BASE - 55min
    // now (BASE) > graceEnd → FRESH
    expect(g.reviewLevel).toBe(0);
    expect(g.status).toBe('FRESH');
  });

  it('misses grace on second review but then reviews again on time → level 1', () => {
    // T0: initial; T1: past grace (reset to 0); T2: within 30min of T1
    const T0 = t(-4 * HOUR);
    const T1 = new Date(T0.getTime() + 35 * MIN);    // missed grace → level 0
    const T2 = new Date(T1.getTime() + 10 * MIN);   // on time → level 1
    const settings = [
      makeCompleted({ timestamp: T0, latestFinishedTime: T0 }),
      makeCompleted({ timestamp: T1, latestFinishedTime: T1 }),
      makeCompleted({ timestamp: T2, latestFinishedTime: T2 }),
    ];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.reviewLevel).toBe(1);
    // T2 = BASE - 4hr + 45min; level 1 INT = 1hr; due at T2 + 1hr
    // = BASE - 4hr + 45min + 1hr = BASE - 2hr 15min → past due
    expect(g.status).toBe('FRESH'); // past grace for level 1 (1hr + 30min = 90min grace from T2)
  });

  it('level 3 → miss grace → resets to 0', () => {
    // Build level 3, then miss the level-3 review
    const T0 = t(-60 * DAY);
    const T1 = new Date(T0.getTime() + 10 * MIN);              // level 0→1
    const T2 = new Date(T1.getTime() + HOUR + 10 * MIN);       // level 1→2
    const T3 = new Date(T2.getTime() + 8 * HOUR + 30 * MIN);  // level 2→3

    // Miss level-3 grace: INT[3]=1day, graceEnd = T3 + 1.5day
    // T4 = T3 + 2 days → level resets to 0
    const T4 = new Date(T3.getTime() + 2 * DAY);

    const settings = [T0, T1, T2, T3, T4].map((ts) =>
      makeCompleted({ timestamp: ts, latestFinishedTime: ts }),
    );
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.reviewLevel).toBe(0);
  });
});

// ===========================================================================
// 6. UNFINISHED overrides completed history
// ===========================================================================

describe('computeGroupStates — UNFINISHED overrides', () => {
  it('in-progress session overrides previous completions → UNFINISHED', () => {
    // Old completed session (would be SCHEDULED)
    const oldCompleted = makeCompleted({ latestFinishedTime: t(-5 * MIN) });
    // Newer started-but-incomplete session
    const currentUnfinished = makeUnfinished({
      timestamp: t(-2 * MIN),
      finishedCount: 30, // only 30/100 done
    });
    const settings = [oldCompleted, currentUnfinished];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.status).toBe('UNFINISHED');
  });

  it('unfinished session with 0 finishedCount → UNFINISHED', () => {
    const settings = [makeUnfinished({ finishedCount: 0 })];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.status).toBe('UNFINISHED');
  });

  it('finishedCount exactly equal to rangeSize → NOT unfinished', () => {
    // 100 words, finishedCount=100
    const settings = [
      makeCompleted({ min: 1, max: 100, latestFinishedTime: t(-10 * MIN), finishedCount: 100 }),
    ];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.status).toBe('SCHEDULED');
  });
});

// ===========================================================================
// 7. Manual override
// ===========================================================================

describe('computeGroupStates — manual level override', () => {
  it('override sets level and computes SCHEDULED status', () => {
    const settings = [makeCompleted({ latestFinishedTime: t(-100 * DAY) })];
    const overrideTime = t(-10 * MIN); // 10 min ago
    const overrides: Record<string, GroupLevelOverride> = {
      [KEY]: { level: 2, setAt: overrideTime },
    };
    const result = runAt(BASE, settings, overrides);
    const g = result.get(KEY)!;
    // INT[2] = 8hr; due at overrideTime + 8hr = BASE + 7hr50min → SCHEDULED
    expect(g.reviewLevel).toBe(2);
    expect(g.status).toBe('SCHEDULED');
    expect(g.nextReviewTime).toEqual(new Date(overrideTime.getTime() + INT[2]));
    expect(g.lastCompletionTime).toEqual(overrideTime);
  });

  it('override past due time → DUE', () => {
    const settings = [makeCompleted({ latestFinishedTime: t(-100 * DAY) })];
    // Override at level 0, set 25 min ago (INT[0]=20min, so due 5 min ago, grace = 30min)
    const overrideTime = t(-25 * MIN);
    const overrides: Record<string, GroupLevelOverride> = {
      [KEY]: { level: 0, setAt: overrideTime },
    };
    const result = runAt(BASE, settings, overrides);
    const g = result.get(KEY)!;
    expect(g.reviewLevel).toBe(0);
    expect(g.status).toBe('DUE');
  });

  it('override past grace end → FRESH', () => {
    const settings = [makeCompleted({ latestFinishedTime: t(-100 * DAY) })];
    // Override at level 0, set 35 min ago → past 30-min grace
    const overrideTime = t(-35 * MIN);
    const overrides: Record<string, GroupLevelOverride> = {
      [KEY]: { level: 0, setAt: overrideTime },
    };
    const result = runAt(BASE, settings, overrides);
    const g = result.get(KEY)!;
    expect(g.status).toBe('FRESH');
  });

  it('override at level 6 (max) uses intervals[6]', () => {
    const settings = [makeCompleted({ latestFinishedTime: t(-100 * DAY) })];
    const overrideTime = t(-1 * DAY);
    const overrides: Record<string, GroupLevelOverride> = {
      [KEY]: { level: 6, setAt: overrideTime },
    };
    const result = runAt(BASE, settings, overrides);
    const g = result.get(KEY)!;
    expect(g.reviewLevel).toBe(6);
    // INT[6] = 31 days; due at overrideTime + 31 days → SCHEDULED
    expect(g.status).toBe('SCHEDULED');
    expect(g.nextReviewTime).toEqual(new Date(overrideTime.getTime() + INT[6]));
  });

  it('override takes precedence over completion history', () => {
    // History says FRESH (very old completion), override says SCHEDULED
    const settings = [makeCompleted({ latestFinishedTime: t(-100 * DAY) })];
    const overrideTime = t(-5 * MIN); // recent override → SCHEDULED
    const overrides: Record<string, GroupLevelOverride> = {
      [KEY]: { level: 3, setAt: overrideTime },
    };
    const result = runAt(BASE, settings, overrides);
    const g = result.get(KEY)!;
    expect(g.status).toBe('SCHEDULED');
    expect(g.reviewLevel).toBe(3);
  });
});

// ===========================================================================
// 8. Multiple independent groups
// ===========================================================================

describe('computeGroupStates — multiple groups', () => {
  it('two groups are computed independently', () => {
    const KEY_A = getGroupKey('wordEnglishList', 1, 100);
    const KEY_B = getGroupKey('wordJapaneseList', 1, 50);

    const settingA = makeCompleted({
      type: 'wordEnglishList', min: 1, max: 100,
      latestFinishedTime: t(-10 * MIN), // SCHEDULED
    });
    const settingB = makeCompleted({
      type: 'wordJapaneseList', min: 1, max: 50,
      latestFinishedTime: t(-50 * MIN), // FRESH (past 30-min grace at level 0)
      finishedCount: 50,
    });

    const result = runAt(BASE, [settingA, settingB]);
    expect(result.get(KEY_A)!.status).toBe('SCHEDULED');
    expect(result.get(KEY_B)!.status).toBe('FRESH');
  });

  it('same type different ranges → separate groups', () => {
    const KEY_1 = getGroupKey('wordEnglishList', 1, 1000);
    const KEY_2 = getGroupKey('wordEnglishList', 1001, 2000);

    const s1 = makeCompleted({
      min: 1, max: 1000, total: 1000,
      latestFinishedTime: t(-10 * MIN),
      finishedCount: 1000,
    });
    const s2 = makeCompleted({
      min: 1001, max: 2000, total: 1000,
      latestFinishedTime: t(-25 * MIN), // DUE
      finishedCount: 1000,
    });

    const result = runAt(BASE, [s1, s2]);
    expect(result.get(KEY_1)!.status).toBe('SCHEDULED');
    expect(result.get(KEY_2)!.status).toBe('DUE');
  });

  it('multiple sessions for same group all contribute to level computation', () => {
    // 3 on-time completions → level 2
    const T0 = t(-4 * HOUR);
    const T1 = new Date(T0.getTime() + 15 * MIN);   // on time → level 1
    const T2 = new Date(T1.getTime() + 45 * MIN);   // on time (INT[1]=1hr, grace=1.5hr) → level 2

    const settings = [T0, T1, T2].map((ts) =>
      makeCompleted({ timestamp: ts, latestFinishedTime: ts }),
    );
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.reviewLevel).toBe(2);
  });
});

// ===========================================================================
// 9. Grace window boundary conditions (exact ms)
// ===========================================================================

describe('computeGroupStates — grace window boundaries', () => {
  // Level 0: INT=20min, due at +20min, grace ends at +30min

  it('exactly at due time → DUE (not SCHEDULED)', () => {
    // completed 20 min ago exactly
    const settings = [makeCompleted({ latestFinishedTime: t(-20 * MIN) })];
    const result = runAt(BASE, settings);
    expect(result.get(KEY)!.status).toBe('DUE');
  });

  it('1ms before due time → SCHEDULED', () => {
    const settings = [makeCompleted({ latestFinishedTime: t(-(20 * MIN - 1)) })];
    const result = runAt(BASE, settings);
    expect(result.get(KEY)!.status).toBe('SCHEDULED');
  });

  it('exactly at grace end → FRESH (not DUE)', () => {
    // grace end = completion + 30min → completed 30 min ago exactly
    const settings = [makeCompleted({ latestFinishedTime: t(-30 * MIN) })];
    const result = runAt(BASE, settings);
    expect(result.get(KEY)!.status).toBe('FRESH');
  });

  it('1ms before grace end → DUE', () => {
    const settings = [makeCompleted({ latestFinishedTime: t(-(30 * MIN - 1)) })];
    const result = runAt(BASE, settings);
    expect(result.get(KEY)!.status).toBe('DUE');
  });
});

// ===========================================================================
// 10. Range size calculation (custom ranges)
// ===========================================================================

describe('computeGroupStates — custom range groups', () => {
  it('custom range: rangeSize = max - min + 1', () => {
    // Range 51–100 = 50 words
    const settings = [
      makeCompleted({ min: 51, max: 100, total: 200, latestFinishedTime: t(-10 * MIN), finishedCount: 50 }),
    ];
    const KEY_CUSTOM = getGroupKey('wordEnglishList', 51, 100);
    const result = runAt(BASE, settings);
    const g = result.get(KEY_CUSTOM)!;
    expect(g.status).toBe('SCHEDULED');
  });

  it('custom range: partially done session → UNFINISHED', () => {
    const settings = [
      makeCompleted({ min: 51, max: 100, total: 200, latestFinishedTime: t(-10 * MIN), finishedCount: 30 }),
    ];
    const KEY_CUSTOM = getGroupKey('wordEnglishList', 51, 100);
    const result = runAt(BASE, settings);
    const g = result.get(KEY_CUSTOM)!;
    expect(g.status).toBe('UNFINISHED');
  });
});

// ===========================================================================
// 11. nextReviewTime and lastCompletionTime values
// ===========================================================================

describe('computeGroupStates — returned timestamps', () => {
  it('SCHEDULED: nextReviewTime is in the future', () => {
    const completedAt = t(-5 * MIN);
    const settings = [makeCompleted({ latestFinishedTime: completedAt })];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.nextReviewTime!.getTime()).toBeGreaterThan(BASE);
    expect(g.nextReviewTime).toEqual(new Date(completedAt.getTime() + INT[0]));
  });

  it('lastCompletionTime matches the most recent completed session (via level walk)', () => {
    const T0 = t(-4 * HOUR);
    const T1 = new Date(T0.getTime() + 15 * MIN);
    const settings = [
      makeCompleted({ timestamp: T0, latestFinishedTime: T0 }),
      makeCompleted({ timestamp: T1, latestFinishedTime: T1 }),
    ];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.lastCompletionTime).toEqual(T1);
  });

  it('UNFINISHED groups have no nextReviewTime', () => {
    const settings = [makeUnfinished({})];
    const result = runAt(BASE, settings);
    expect(result.get(KEY)!.nextReviewTime).toBeUndefined();
  });
});

// ===========================================================================
// 12. Edge cases
// ===========================================================================

describe('computeGroupStates — edge cases', () => {
  it('settings list with duplicate timestamps for same group are handled', () => {
    // Two settings at same time — only one should count for completedTimes
    const ts = t(-10 * MIN);
    const settings = [
      makeCompleted({ timestamp: ts, latestFinishedTime: ts }),
      makeCompleted({ timestamp: ts, latestFinishedTime: ts }),
    ];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    // Both map to same key; completedTimes may have [ts, ts]
    // level walk: T0=ts, T1=ts; interval=20min, graceEnd=ts+30min; ts <= ts+30min → level=1
    // Level 1, INT[1]=1hr; dueTime = ts + 1hr; now = ts + 10min → SCHEDULED
    expect(g.status).toBe('SCHEDULED');
    expect(g.reviewLevel).toBe(1);
  });

  it('mixed completed and unfinished sessions for same group', () => {
    const T0 = t(-4 * HOUR);
    const T1 = new Date(T0.getTime() + 15 * MIN);

    const settings = [
      makeCompleted({ timestamp: T0, latestFinishedTime: T0 }),
      makeCompleted({ timestamp: T1, latestFinishedTime: T1 }), // level 1
      // Newest session is unfinished → UNFINISHED status overrides
      makeUnfinished({ timestamp: t(-5 * MIN), finishedCount: 10 }),
    ];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.status).toBe('UNFINISHED');
  });

  it('single setting with no min/max falls back to 1 and total', () => {
    const s: QuizSetting = {
      type: 'wordEnglishList',
      total: 50,
      tableName: 'wordEnglishList',
      isSelected: true,
      timestamp: t(-10 * MIN),
      latestFinishedTime: t(-10 * MIN),
      finishedCount: 50,
    };
    const result = runAt(BASE, [s]);
    // key = wordEnglishList:1:50
    const KEY_FALLBACK = getGroupKey('wordEnglishList', 1, 50);
    const g = result.get(KEY_FALLBACK)!;
    expect(g).toBeDefined();
    expect(g.status).toBe('SCHEDULED');
    expect(g.min).toBe(1);
    expect(g.max).toBe(50);
  });
});
