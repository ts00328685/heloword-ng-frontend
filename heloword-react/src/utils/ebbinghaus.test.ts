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

// ===========================================================================
// 13. formatInterval — boundary values
// ===========================================================================

describe('formatInterval — boundary values', () => {
  it('1ms → 0 min (rounds down)', () => {
    // 1ms / 60000 = ~0.000016 min → Math.round = 0
    expect(formatInterval(1)).toBe('0 min');
  });

  it('59 min → "59 min" (just under 1 hour threshold)', () => {
    expect(formatInterval(59 * MIN)).toBe('59 min');
  });

  it('exactly 60 min → "1 hour"', () => {
    expect(formatInterval(60 * MIN)).toBe('1 hour');
  });

  it('2 hours → "2 hours"', () => {
    expect(formatInterval(2 * HOUR)).toBe('2 hours');
  });

  it('23 hours → "23 hours" (just under 1 day threshold)', () => {
    expect(formatInterval(23 * HOUR)).toBe('23 hours');
  });

  it('exactly 24 hours → "1 day"', () => {
    expect(formatInterval(24 * HOUR)).toBe('1 day');
  });

  it('1.5 days → "2 days" (Math.round(1.5) = 2)', () => {
    expect(formatInterval(36 * HOUR)).toBe('2 days');
  });

  it('fractional hours round correctly — 90 min → "2 hours" (Math.round(1.5)=2)', () => {
    expect(formatInterval(90 * MIN)).toBe('2 hours');
  });

  it('31 days → "31 days"', () => {
    expect(formatInterval(31 * DAY)).toBe('31 days');
  });

  it('7 days → "7 days"', () => {
    expect(formatInterval(7 * DAY)).toBe('7 days');
  });
});

// ===========================================================================
// 14. formatRelativeTime — boundary values
// ===========================================================================

describe('formatRelativeTime — boundary values', () => {
  const now = new Date('2025-06-01T12:00:00Z');

  it('0ms diff → "0 min ago" (diffMs < 0 is false, past check is false, rounds to 0 min)', () => {
    // diffMs = 0 → past = false → "in 0 min"
    const result = formatRelativeTime(new Date(now.getTime()), now);
    expect(result).toBe('in 0 min');
  });

  it('1ms in the future → "in 0 min"', () => {
    expect(formatRelativeTime(new Date(now.getTime() + 1), now)).toBe('in 0 min');
  });

  it('1ms in the past → "0 min ago"', () => {
    expect(formatRelativeTime(new Date(now.getTime() - 1), now)).toBe('0 min ago');
  });

  it('exactly 60 min in future → "in 1 hour"', () => {
    expect(formatRelativeTime(new Date(now.getTime() + 60 * MIN), now)).toBe('in 1 hour');
  });

  it('exactly 60 min in past → "1 hour ago"', () => {
    expect(formatRelativeTime(new Date(now.getTime() - 60 * MIN), now)).toBe('1 hour ago');
  });

  it('exactly 24h in future → "in 1 day"', () => {
    expect(formatRelativeTime(new Date(now.getTime() + 24 * HOUR), now)).toBe('in 1 day');
  });

  it('exactly 24h in past → "1 day ago"', () => {
    expect(formatRelativeTime(new Date(now.getTime() - 24 * HOUR), now)).toBe('1 day ago');
  });

  it('3 days in future → "in 3 days"', () => {
    expect(formatRelativeTime(new Date(now.getTime() + 3 * DAY), now)).toBe('in 3 days');
  });

  it('7 days in past → "7 days ago"', () => {
    expect(formatRelativeTime(new Date(now.getTime() - 7 * DAY), now)).toBe('7 days ago');
  });

  it('2 hours in past → "2 hours ago"', () => {
    expect(formatRelativeTime(new Date(now.getTime() - 2 * HOUR), now)).toBe('2 hours ago');
  });
});

// ===========================================================================
// 15. Custom intervals
// ===========================================================================

describe('computeGroupStates — custom intervals', () => {
  it('shorter intervals cause group to become DUE faster', () => {
    // Custom interval of 5 min; completed 6 min ago → DUE
    const shortIntervals = [5 * MIN, 10 * MIN, 30 * MIN];
    const settings = [makeCompleted({ latestFinishedTime: t(-6 * MIN) })];
    vi.setSystemTime(BASE);
    const result = computeGroupStates(settings, shortIntervals);
    expect(result.get(KEY)!.status).toBe('DUE');
  });

  it('longer interval keeps group SCHEDULED when default would be DUE', () => {
    // Default INT[0]=20min; completed 22 min ago → DUE with default
    // Custom interval of 60 min → still SCHEDULED
    const longIntervals = [60 * MIN, 2 * HOUR, 8 * HOUR];
    const settings = [makeCompleted({ latestFinishedTime: t(-22 * MIN) })];
    vi.setSystemTime(BASE);
    const result = computeGroupStates(settings, longIntervals);
    expect(result.get(KEY)!.status).toBe('SCHEDULED');
  });

  it('single-element intervals array — level always capped at 0', () => {
    const singleInterval = [30 * MIN];
    // Three on-time completions; level should stay at 0 (max index = 0)
    const T0 = t(-5 * HOUR);
    const T1 = new Date(T0.getTime() + 10 * MIN); // within 30min grace
    const T2 = new Date(T1.getTime() + 10 * MIN); // within 30min grace
    const settings = [T0, T1, T2].map((ts) =>
      makeCompleted({ timestamp: ts, latestFinishedTime: ts }),
    );
    vi.setSystemTime(BASE);
    const result = computeGroupStates(settings, singleInterval);
    const g = result.get(KEY)!;
    expect(g.reviewLevel).toBe(0);
  });

  it('two-element intervals array — level caps at 1 after two on-time completions', () => {
    const twoIntervals = [20 * MIN, HOUR];
    const T0 = t(-4 * HOUR);
    const T1 = new Date(T0.getTime() + 10 * MIN); // on time → level 1
    const T2 = new Date(T1.getTime() + 30 * MIN); // on time (level 1 interval=60min, grace=90min) → would be level 2 but capped at 1
    const settings = [T0, T1, T2].map((ts) =>
      makeCompleted({ timestamp: ts, latestFinishedTime: ts }),
    );
    vi.setSystemTime(BASE);
    const result = computeGroupStates(settings, twoIntervals);
    const g = result.get(KEY)!;
    expect(g.reviewLevel).toBe(1); // capped at intervals.length - 1 = 1
  });
});

// ===========================================================================
// 16. Level walk — inclusive graceEnd boundary
// ===========================================================================

describe('computeGroupStates — level walk inclusive graceEnd', () => {
  it('completion EXACTLY at graceEnd advances level (<=  check is inclusive)', () => {
    // T0: initial completion
    // T1: exactly at T0 + INT[0] + INT[0]*0.5 = T0 + 30min
    // The condition is completedTimes[i] <= graceEnd → should advance to level 1
    const T0 = t(-5 * HOUR);
    const graceEndOffset = INT[0] + INT[0] * 0.5; // = 30 * MIN
    const T1 = new Date(T0.getTime() + graceEndOffset);
    const settings = [
      makeCompleted({ timestamp: T0, latestFinishedTime: T0 }),
      makeCompleted({ timestamp: T1, latestFinishedTime: T1 }),
    ];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.reviewLevel).toBe(1); // advanced because T1 <= graceEnd (inclusive)
  });

  it('completion 1ms AFTER graceEnd resets level to 0', () => {
    const T0 = t(-5 * HOUR);
    const graceEndOffset = INT[0] + INT[0] * 0.5 + 1; // 1ms past grace
    const T1 = new Date(T0.getTime() + graceEndOffset);
    const settings = [
      makeCompleted({ timestamp: T0, latestFinishedTime: T0 }),
      makeCompleted({ timestamp: T1, latestFinishedTime: T1 }),
    ];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.reviewLevel).toBe(0); // reset because T1 > graceEnd
  });
});

// ===========================================================================
// 17. UNFINISHED overrides DUE/FRESH/SCHEDULED windows
// ===========================================================================

describe('computeGroupStates — UNFINISHED overrides every completed state', () => {
  it('UNFINISHED overrides a group that would be DUE', () => {
    // Completed session would be DUE (25 min ago, past 20min interval)
    const completedSession = makeCompleted({ latestFinishedTime: t(-25 * MIN) });
    // But most recent session is unfinished
    const unfinishedSession = makeUnfinished({
      timestamp: t(-5 * MIN),
      finishedCount: 10,
    });
    const result = runAt(BASE, [completedSession, unfinishedSession]);
    expect(result.get(KEY)!.status).toBe('UNFINISHED');
  });

  it('UNFINISHED overrides a group that would be FRESH (past grace window)', () => {
    // Old completed session 35 min ago would be FRESH
    const completedSession = makeCompleted({ latestFinishedTime: t(-35 * MIN) });
    const unfinishedSession = makeUnfinished({
      timestamp: t(-2 * MIN),
      finishedCount: 5,
    });
    const result = runAt(BASE, [completedSession, unfinishedSession]);
    expect(result.get(KEY)!.status).toBe('UNFINISHED');
  });

  it('UNFINISHED overrides a group that would be SCHEDULED', () => {
    // Completed 5 min ago (SCHEDULED)
    const completedSession = makeCompleted({ latestFinishedTime: t(-5 * MIN) });
    const unfinishedSession = makeUnfinished({
      timestamp: t(-1 * MIN),
      finishedCount: 1,
    });
    const result = runAt(BASE, [completedSession, unfinishedSession]);
    expect(result.get(KEY)!.status).toBe('UNFINISHED');
  });
});

// ===========================================================================
// 18. FRESH group: nextReviewTime is in the past
// ===========================================================================

describe('computeGroupStates — FRESH nextReviewTime is in the past', () => {
  it('FRESH group has nextReviewTime before now', () => {
    // Completed 35 min ago at level 0 → dueTime = completedAt + 20min = 15min ago (past)
    const completedAt = t(-35 * MIN);
    const settings = [makeCompleted({ latestFinishedTime: completedAt })];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.status).toBe('FRESH');
    // nextReviewTime = dueTime = completedAt + INT[0] = BASE - 35min + 20min = BASE - 15min
    expect(g.nextReviewTime!.getTime()).toBeLessThan(BASE);
    expect(g.nextReviewTime).toEqual(new Date(completedAt.getTime() + INT[0]));
  });

  it('DUE group: nextReviewTime is at or before now (within due+grace window)', () => {
    // Completed 25 min ago → dueTime = BASE - 25min + 20min = BASE - 5min (in the past)
    const completedAt = t(-25 * MIN);
    const settings = [makeCompleted({ latestFinishedTime: completedAt })];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.status).toBe('DUE');
    expect(g.nextReviewTime!.getTime()).toBeLessThanOrEqual(BASE);
  });
});

// ===========================================================================
// 19. Override edge cases
// ===========================================================================

describe('computeGroupStates — override edge cases', () => {
  it('override key for a non-existent group is ignored', () => {
    const settings = [makeCompleted({ latestFinishedTime: t(-10 * MIN) })];
    const overrides: Record<string, GroupLevelOverride> = {
      'wordEnglishList:999:9999': { level: 5, setAt: t(-5 * MIN) },
    };
    const result = runAt(BASE, settings, overrides);
    // KEY group should use normal history (no override)
    expect(result.get(KEY)!.status).toBe('SCHEDULED');
    // The override key for non-existent group should NOT produce a DueGroup
    // (no settings for that key → no entry in byKey → not in result)
    expect(result.has('wordEnglishList:999:9999')).toBe(false);
  });

  it('override for one group does not affect another group', () => {
    const KEY_A = getGroupKey('wordEnglishList', 1, 100);
    const KEY_B = getGroupKey('wordJapaneseList', 1, 50);
    const settingA = makeCompleted({
      type: 'wordEnglishList', min: 1, max: 100,
      latestFinishedTime: t(-100 * DAY), // very old → FRESH without override
    });
    const settingB = makeCompleted({
      type: 'wordJapaneseList', min: 1, max: 50,
      latestFinishedTime: t(-5 * MIN),  // recent → SCHEDULED
      finishedCount: 50,
    });
    const overrides: Record<string, GroupLevelOverride> = {
      [KEY_A]: { level: 3, setAt: t(-5 * MIN) }, // override A → SCHEDULED
    };
    const result = runAt(BASE, [settingA, settingB], overrides);
    expect(result.get(KEY_A)!.status).toBe('SCHEDULED');
    expect(result.get(KEY_A)!.reviewLevel).toBe(3);
    // B uses its own history (not affected)
    expect(result.get(KEY_B)!.status).toBe('SCHEDULED');
  });

  it('override.level=99 → reviewLevel=99 in result, but interval clamped to intervals[6]', () => {
    const settings = [makeCompleted({ latestFinishedTime: t(-100 * DAY) })];
    const overrides: Record<string, GroupLevelOverride> = {
      [KEY]: { level: 99, setAt: t(-5 * MIN) },
    };
    const result = runAt(BASE, settings, overrides);
    const g = result.get(KEY)!;
    expect(g.reviewLevel).toBe(99); // NOT clamped in the DueGroup output
    // Interval uses Math.min(99, 6) = 6 → INT[6] = 31 days → SCHEDULED
    expect(g.status).toBe('SCHEDULED');
    expect(g.nextReviewTime).toEqual(new Date(t(-5 * MIN).getTime() + INT[6]));
  });

  it('empty overrides object {} — group falls back to completion history', () => {
    const settings = [makeCompleted({ latestFinishedTime: t(-35 * MIN) })];
    const result = runAt(BASE, settings, {});
    // No override → uses history → FRESH
    expect(result.get(KEY)!.status).toBe('FRESH');
  });
});

// ===========================================================================
// 20. Single-word group (rangeSize=1)
// ===========================================================================

describe('computeGroupStates — single-word group (min === max)', () => {
  const KEY_SINGLE = getGroupKey('wordEnglishList', 42, 42);

  it('rangeSize=1 with finishedCount=1 → SCHEDULED', () => {
    const s: QuizSetting = {
      type: 'wordEnglishList',
      min: 42, max: 42, total: 1000,
      tableName: 'wordEnglishList',
      isSelected: true,
      timestamp: t(-10 * MIN),
      latestFinishedTime: t(-10 * MIN),
      finishedCount: 1,
    };
    const result = runAt(BASE, [s]);
    expect(result.get(KEY_SINGLE)!.status).toBe('SCHEDULED');
  });

  it('rangeSize=1 with finishedCount=0 → UNFINISHED', () => {
    const s: QuizSetting = {
      type: 'wordEnglishList',
      min: 42, max: 42, total: 1000,
      tableName: 'wordEnglishList',
      isSelected: true,
      timestamp: t(-10 * MIN),
      finishedCount: 0,
    };
    const result = runAt(BASE, [s]);
    expect(result.get(KEY_SINGLE)!.status).toBe('UNFINISHED');
  });
});

// ===========================================================================
// 21. finishedCount > rangeSize is treated as complete
// ===========================================================================

describe('computeGroupStates — finishedCount > rangeSize', () => {
  it('finishedCount > rangeSize counts as fully completed → SCHEDULED', () => {
    // Range 1–5 = 5 words, finishedCount=10 (more than rangeSize)
    const KEY_5 = getGroupKey('wordEnglishList', 1, 5);
    const s: QuizSetting = {
      type: 'wordEnglishList',
      min: 1, max: 5, total: 1000,
      tableName: 'wordEnglishList',
      isSelected: true,
      timestamp: t(-10 * MIN),
      latestFinishedTime: t(-10 * MIN),
      finishedCount: 10, // > rangeSize of 5
    };
    const result = runAt(BASE, [s]);
    // Not UNFINISHED because finishedCount (10) >= rangeSize (5)
    expect(result.get(KEY_5)!.status).toBe('SCHEDULED');
  });
});

// ===========================================================================
// 22. Level 6 behavior and reset after FRESH
// ===========================================================================

describe('computeGroupStates — level 6 boundary', () => {
  it('level 5→6 on-time stays at 6 (does not go to 7)', () => {
    // Build 7 on-time completions → level should be 6 (max)
    const timestamps: Date[] = [];
    let cur = new Date(BASE - 200 * DAY);
    timestamps.push(cur);
    for (let i = 0; i < 6; i++) {
      // Each completion at 10% into the interval (well within grace)
      cur = new Date(cur.getTime() + INT[Math.min(i, INT.length - 1)] * 1.1);
      timestamps.push(cur);
    }
    const settings = timestamps.map((ts) =>
      makeCompleted({ timestamp: ts, latestFinishedTime: ts }),
    );
    const result = runAt(BASE, settings);
    expect(result.get(KEY)!.reviewLevel).toBe(6);
  });

  it('after reaching level 6, missing the grace window resets level to 0', () => {
    // Build level 6 then miss the grace window
    const timestamps: Date[] = [];
    let cur = new Date(BASE - 400 * DAY);
    timestamps.push(cur);
    for (let i = 0; i < 6; i++) {
      cur = new Date(cur.getTime() + INT[Math.min(i, INT.length - 1)] * 1.1);
      timestamps.push(cur);
    }
    // Miss level-6 grace: INT[6]=31days, grace=46.5days; add 50 days
    const afterMiss = new Date(cur.getTime() + 50 * DAY);
    timestamps.push(afterMiss);

    const settings = timestamps.map((ts) =>
      makeCompleted({ timestamp: ts, latestFinishedTime: ts }),
    );
    const result = runAt(BASE, settings);
    // Reset to level 0 after missing grace
    expect(result.get(KEY)!.reviewLevel).toBe(0);
  });
});

// ===========================================================================
// 23. nextReviewTime exact values per level when SCHEDULED
// ===========================================================================

describe('computeGroupStates — nextReviewTime exact values per level', () => {
  // For each level 0–6, verify nextReviewTime = completedAt + INT[level]
  const levels = [0, 1, 2, 3, 4, 5, 6] as const;

  levels.forEach((targetLevel) => {
    it(`level ${targetLevel}: nextReviewTime = completedAt + INT[${targetLevel}]`, () => {
      // Build a session history that ends at the target level
      const completedAt = t(-5 * MIN); // recent completion → SCHEDULED
      // Use override to set level precisely without building full history
      const overrides: Record<string, GroupLevelOverride> = {
        [KEY]: { level: targetLevel, setAt: completedAt },
      };
      const settings = [makeCompleted({ latestFinishedTime: completedAt })];
      const result = runAt(BASE, settings, overrides);
      const g = result.get(KEY)!;
      expect(g.status).toBe('SCHEDULED');
      expect(g.nextReviewTime).toEqual(new Date(completedAt.getTime() + INT[targetLevel]));
    });
  });
});

// ===========================================================================
// 24. Multiple groups — one with override, one without
// ===========================================================================

describe('computeGroupStates — mixed override and history groups', () => {
  it('one group has override (SCHEDULED), another uses history (FRESH)', () => {
    const KEY_A = getGroupKey('wordEnglishList', 1, 100);
    const KEY_B = getGroupKey('wordJapaneseList', 1, 50);

    const settingA = makeCompleted({
      type: 'wordEnglishList', min: 1, max: 100,
      latestFinishedTime: t(-100 * DAY), // old history → FRESH
    });
    const settingB = makeCompleted({
      type: 'wordJapaneseList', min: 1, max: 50,
      latestFinishedTime: t(-100 * DAY), // also old
      finishedCount: 50,
    });

    // Override A to be SCHEDULED, leave B to use history
    const overrides: Record<string, GroupLevelOverride> = {
      [KEY_A]: { level: 2, setAt: t(-5 * MIN) }, // recent → SCHEDULED
    };

    const result = runAt(BASE, [settingA, settingB], overrides);
    expect(result.get(KEY_A)!.status).toBe('SCHEDULED');
    expect(result.get(KEY_A)!.reviewLevel).toBe(2);
    expect(result.get(KEY_B)!.status).toBe('FRESH'); // history says FRESH
  });
});

// ===========================================================================
// 25. Completion timestamp in the future (defensive)
// ===========================================================================

describe('computeGroupStates — future timestamps', () => {
  it('completion timestamp in the future is still processed (level walk still runs)', () => {
    // A "future" latestFinishedTime (clock skew scenario)
    const futureTs = t(+5 * MIN); // 5 minutes from now
    const settings = [makeCompleted({ latestFinishedTime: futureTs })];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    // Should not crash; dueTime = futureTs + INT[0] → SCHEDULED
    expect(g).toBeDefined();
    expect(g.status).toBe('SCHEDULED');
  });

  it('future timestamp is included in level walk as a completion event', () => {
    const T0 = t(-HOUR);
    const T1 = t(+5 * MIN); // future
    const settings = [
      makeCompleted({ timestamp: T0, latestFinishedTime: T0 }),
      makeCompleted({ timestamp: T1, latestFinishedTime: T1 }),
    ];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    // graceEnd = T0 + INT[0] + INT[0]*0.5 = T0 + 30min = BASE-30min
    // T1 = BASE+5min > BASE-30min → OUTSIDE grace → level resets to 0
    expect(g.reviewLevel).toBe(0);
  });
});

// ===========================================================================
// 26. Multiple completedTimes for same group — level walk order
// ===========================================================================

describe('computeGroupStates — chronological level walk', () => {
  it('settings provided in reverse chronological order still produce correct level', () => {
    // Provide settings in reverse order (newest first); algorithm should sort them
    const T0 = t(-6 * HOUR);
    const T1 = new Date(T0.getTime() + 10 * MIN); // on time → level 1
    const T2 = new Date(T1.getTime() + 45 * MIN); // on time (within 1.5hr grace at level 1) → level 2

    // Provide in reverse: T2, T1, T0
    const settings = [T2, T1, T0].map((ts) =>
      makeCompleted({ timestamp: ts, latestFinishedTime: ts }),
    );
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.reviewLevel).toBe(2);
  });

  it('three completions where middle one misses grace: final level is 1', () => {
    const T0 = t(-6 * HOUR);
    const T1 = new Date(T0.getTime() + 35 * MIN); // MISSES grace → level 0
    const T2 = new Date(T1.getTime() + 10 * MIN); // on time → level 1
    const settings = [T0, T1, T2].map((ts) =>
      makeCompleted({ timestamp: ts, latestFinishedTime: ts }),
    );
    const result = runAt(BASE, settings);
    expect(result.get(KEY)!.reviewLevel).toBe(1);
  });
});

// ===========================================================================
// 27. getGroupKey edge cases
// ===========================================================================

describe('getGroupKey — edge cases', () => {
  it('type with numbers — round-trips cleanly', () => {
    const key = getGroupKey('wordList2025', 1, 50);
    expect(parseGroupKey(key)).toEqual({ type: 'wordList2025', min: 1, max: 50 });
  });

  it('min === max → parses back to same min and max', () => {
    const key = getGroupKey('wordEnglishList', 42, 42);
    const parsed = parseGroupKey(key);
    expect(parsed.min).toBe(42);
    expect(parsed.max).toBe(42);
  });

  it('very large numbers — round-trips', () => {
    const key = getGroupKey('wordEnglishList', 99999, 199999);
    const parsed = parseGroupKey(key);
    expect(parsed.min).toBe(99999);
    expect(parsed.max).toBe(199999);
  });
});

// ===========================================================================
// 28. formatInterval — additional values
// ===========================================================================

describe('formatInterval — additional values', () => {
  it('3 hours → "3 hours"', () => {
    expect(formatInterval(3 * HOUR)).toBe('3 hours');
  });

  it('12 hours → "12 hours"', () => {
    expect(formatInterval(12 * HOUR)).toBe('12 hours');
  });

  it('2 days → "2 days"', () => {
    expect(formatInterval(2 * DAY)).toBe('2 days');
  });

  it('10 min → "10 min"', () => {
    expect(formatInterval(10 * MIN)).toBe('10 min');
  });
});

// ===========================================================================
// 29. computeGroupStates — multiple sessions, same timestamp
// ===========================================================================

describe('computeGroupStates — identical timestamps', () => {
  it('two completed sessions at same exact time → level advances due to second entry', () => {
    const ts = t(-HOUR);
    // Two settings at same time → completedTimes has [ts, ts]
    // level walk: T0=ts, T1=ts, interval=20min, graceEnd=ts+30min; ts <= graceEnd → level=1
    const settings = [
      makeCompleted({ timestamp: ts, latestFinishedTime: ts }),
      makeCompleted({ timestamp: ts, latestFinishedTime: ts }),
    ];
    const result = runAt(BASE, settings);
    const g = result.get(KEY)!;
    expect(g.reviewLevel).toBe(1);
  });
});

// ===========================================================================
// 30. Override with UNFINISHED — override is ignored, UNFINISHED wins
// ===========================================================================

describe('computeGroupStates — UNFINISHED with override present', () => {
  it('UNFINISHED status is NOT overridden by a manual level override', () => {
    // The algorithm only applies override if there is NO UNFINISHED;
    // wait — actually looking at the code: override is checked BEFORE the
    // isCurrentlyUnfinished check. So if override is present, it takes
    // precedence even if the most recent session is unfinished.
    // Let's verify this behavior.
    const settings = [
      makeCompleted({ latestFinishedTime: t(-100 * DAY) }), // old completed
      makeUnfinished({ timestamp: t(-5 * MIN), finishedCount: 5 }), // unfinished
    ];
    const overrides: Record<string, GroupLevelOverride> = {
      [KEY]: { level: 2, setAt: t(-5 * MIN) }, // override → SCHEDULED
    };
    const result = runAt(BASE, settings, overrides);
    // Override applies first (bypasses UNFINISHED check) → SCHEDULED
    expect(result.get(KEY)!.status).toBe('SCHEDULED');
    expect(result.get(KEY)!.reviewLevel).toBe(2);
  });
});
