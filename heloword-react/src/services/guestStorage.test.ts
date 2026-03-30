// @vitest-environment jsdom
/**
 * Integration tests for the guest storage pipeline.
 *
 * These tests exercise the full chain:
 *   localStorage writes → guestSettingsToQuizSettings() → computeGroupStates()
 *
 * They validate that what the user experiences in the Review page (status,
 * level, due timing) matches the underlying Ebbinghaus algorithm applied
 * to their stored session data.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  saveGuestSetting,
  saveGuestRecord,
  getGuestSettings,
  getGuestRecords,
  guestSettingsToQuizSettings,
  computeGuestDueGroups,
  computeAllGuestGroupStates,
  deleteGuestGroup,
  saveGuestGroupOverride,
  getGuestGroupOverrides,
  deleteGuestGroupOverride,
  getFinishedIdsBySetting,
  GuestSetting,
  GuestRecord,
} from './guestStorage.service';
import { DEFAULT_INTERVALS_MS, getIntervals, saveIntervals } from '../utils/ebbinghaus';

// ─── Time constants ──────────────────────────────────────────────────────────
const MIN  = 60_000;
const HOUR = 60 * MIN;
const DAY  = 24 * HOUR;

/** Fixed "now" used as base for all relative timestamps */
const BASE = new Date('2025-06-01T12:00:00Z').getTime();

function isoAt(offsetMs: number): string {
  return new Date(BASE + offsetMs).toISOString();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

let settingCounter = 0;
let recordCounter  = 0;

function makeSetting(opts: Partial<GuestSetting> & { min: number; max: number }): GuestSetting {
  return {
    id: `s${++settingCounter}`,
    timestamp: isoAt(-2 * HOUR),
    type: 'wordEnglishList',
    tableName: 'word_english',
    total: 9481,
    ...opts,
  };
}

function makeRecord(settingId: string, answerId: number, opts?: Partial<GuestRecord>): GuestRecord {
  return {
    id: `r${++recordCounter}`,
    settingId,
    answerId,
    answerTableName: 'word_english',
    timeSpent: 5,
    finishedTime: isoAt(0),
    wrongCount: 0,
    quizIndex: answerId - 1,
    ...opts,
  };
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  settingCounter = 0;
  recordCounter  = 0;
  vi.useFakeTimers();
  vi.setSystemTime(BASE);
});

afterEach(() => {
  vi.useRealTimers();
});

// ===========================================================================
// 1. Persistence round-trips
// ===========================================================================

describe('saveGuestSetting / getGuestSettings', () => {
  it('persists a setting to localStorage and retrieves it', () => {
    const s = makeSetting({ min: 1, max: 100 });
    saveGuestSetting(s);
    expect(getGuestSettings()).toEqual([s]);
  });

  it('accumulates multiple settings', () => {
    const s1 = makeSetting({ min: 1, max: 100 });
    const s2 = makeSetting({ min: 101, max: 200 });
    saveGuestSetting(s1);
    saveGuestSetting(s2);
    expect(getGuestSettings()).toHaveLength(2);
  });
});

describe('saveGuestRecord / getGuestRecords', () => {
  it('persists a record and retrieves it', () => {
    const r = makeRecord('s1', 42);
    saveGuestRecord(r);
    expect(getGuestRecords()).toEqual([r]);
  });

  it('accumulates multiple records', () => {
    saveGuestRecord(makeRecord('s1', 1));
    saveGuestRecord(makeRecord('s1', 2));
    saveGuestRecord(makeRecord('s1', 3));
    expect(getGuestRecords()).toHaveLength(3);
  });
});

// ===========================================================================
// 2. guestSettingsToQuizSettings — data shape conversion
// ===========================================================================

describe('guestSettingsToQuizSettings', () => {
  it('returns empty array when no settings exist', () => {
    expect(guestSettingsToQuizSettings()).toEqual([]);
  });

  it('maps a setting with no records → finishedCount=0, no latestFinishedTime', () => {
    const s = makeSetting({ min: 1, max: 50 });
    saveGuestSetting(s);
    const qs = guestSettingsToQuizSettings();
    expect(qs).toHaveLength(1);
    expect(qs[0].finishedCount).toBe(0);
    expect(qs[0].latestFinishedTime).toBeUndefined();
    expect(qs[0].min).toBe(1);
    expect(qs[0].max).toBe(50);
    expect(qs[0].type).toBe('wordEnglishList');
  });

  it('counts only records with wrongCount=0 for finishedCount', () => {
    const s = makeSetting({ min: 1, max: 10 });
    saveGuestSetting(s);
    saveGuestRecord(makeRecord(s.id, 1, { wrongCount: 0 }));  // correct
    saveGuestRecord(makeRecord(s.id, 2, { wrongCount: 2 }));  // wrong — not counted
    saveGuestRecord(makeRecord(s.id, 3, { wrongCount: 0 }));  // correct
    const qs = guestSettingsToQuizSettings();
    expect(qs[0].finishedCount).toBe(2); // only word 1 and 3
  });

  it('deduplicates repeated answerId within a session (same word answered correctly twice)', () => {
    const s = makeSetting({ min: 1, max: 10 });
    saveGuestSetting(s);
    saveGuestRecord(makeRecord(s.id, 5, { wrongCount: 0 }));
    saveGuestRecord(makeRecord(s.id, 5, { wrongCount: 0 })); // same word again
    const qs = guestSettingsToQuizSettings();
    expect(qs[0].finishedCount).toBe(1); // SET dedup: still 1
  });

  it('latestFinishedTime is the most recent correct record finishedTime', () => {
    const s = makeSetting({ min: 1, max: 10 });
    saveGuestSetting(s);
    saveGuestRecord(makeRecord(s.id, 1, { wrongCount: 0, finishedTime: isoAt(-30 * MIN) }));
    saveGuestRecord(makeRecord(s.id, 2, { wrongCount: 0, finishedTime: isoAt(-5 * MIN) }));
    saveGuestRecord(makeRecord(s.id, 3, { wrongCount: 0, finishedTime: isoAt(-15 * MIN) }));
    const qs = guestSettingsToQuizSettings();
    expect(qs[0].latestFinishedTime?.toISOString()).toBe(isoAt(-5 * MIN));
  });

  it('wrong-only records do not set latestFinishedTime', () => {
    const s = makeSetting({ min: 1, max: 10 });
    saveGuestSetting(s);
    saveGuestRecord(makeRecord(s.id, 1, { wrongCount: 1 }));
    saveGuestRecord(makeRecord(s.id, 2, { wrongCount: 3 }));
    const qs = guestSettingsToQuizSettings();
    expect(qs[0].latestFinishedTime).toBeUndefined();
    expect(qs[0].finishedCount).toBe(0);
  });

  it('produces one QuizSetting per GuestSetting (multiple sessions = multiple entries)', () => {
    // Same group, two separate sessions
    const s1 = makeSetting({ min: 1, max: 50, timestamp: isoAt(-DAY) });
    const s2 = makeSetting({ min: 1, max: 50, timestamp: isoAt(-HOUR) });
    saveGuestSetting(s1);
    saveGuestSetting(s2);
    const qs = guestSettingsToQuizSettings();
    expect(qs).toHaveLength(2); // one per session, not one per group
  });
});

// ===========================================================================
// 3. computeAllGuestGroupStates — Ebbinghaus pipeline
// ===========================================================================

describe('computeAllGuestGroupStates', () => {
  it('returns empty map when no data', () => {
    expect(computeAllGuestGroupStates().size).toBe(0);
  });

  it('group with no completed records → UNFINISHED', () => {
    const s = makeSetting({ min: 1, max: 10 });
    saveGuestSetting(s);
    // No records at all → finishedCount=0 < rangeSize=10
    const states = computeAllGuestGroupStates();
    expect(states.get('wordEnglishList:1:10')?.status).toBe('UNFINISHED');
  });

  it('group fully completed recently → SCHEDULED', () => {
    const s = makeSetting({ min: 1, max: 3, timestamp: isoAt(-10 * MIN) });
    saveGuestSetting(s);
    // Complete all 3 words 10 minutes ago
    [1, 2, 3].forEach((id) =>
      saveGuestRecord(makeRecord(s.id, id, { wrongCount: 0, finishedTime: isoAt(-10 * MIN) })),
    );
    // Now is BASE; completed 10 min ago → due in 20 min → SCHEDULED
    const states = computeAllGuestGroupStates();
    expect(states.get('wordEnglishList:1:3')?.status).toBe('SCHEDULED');
    expect(states.get('wordEnglishList:1:3')?.reviewLevel).toBe(0);
  });

  it('group completed and interval elapsed → DUE', () => {
    const completedAt = isoAt(-25 * MIN); // 25 min ago, past 20-min interval
    const s = makeSetting({ min: 1, max: 2, timestamp: isoAt(-25 * MIN) });
    saveGuestSetting(s);
    [1, 2].forEach((id) =>
      saveGuestRecord(makeRecord(s.id, id, { wrongCount: 0, finishedTime: completedAt })),
    );
    const states = computeAllGuestGroupStates();
    expect(states.get('wordEnglishList:1:2')?.status).toBe('DUE');
  });

  it('group completed and grace window passed → FRESH', () => {
    const completedAt = isoAt(-35 * MIN); // 35 min ago, past 30-min grace
    const s = makeSetting({ min: 1, max: 2, timestamp: isoAt(-35 * MIN) });
    saveGuestSetting(s);
    [1, 2].forEach((id) =>
      saveGuestRecord(makeRecord(s.id, id, { wrongCount: 0, finishedTime: completedAt })),
    );
    const states = computeAllGuestGroupStates();
    expect(states.get('wordEnglishList:1:2')?.status).toBe('FRESH');
    expect(states.get('wordEnglishList:1:2')?.reviewLevel).toBe(0);
  });

  it('two on-time reviews → level 1', () => {
    const T0 = isoAt(-4 * HOUR);
    const T1 = isoAt(-4 * HOUR + 10 * MIN); // 10 min after T0 — within 30-min grace

    const s0 = makeSetting({ min: 1, max: 2, timestamp: isoAt(-4 * HOUR) });
    const s1 = makeSetting({ min: 1, max: 2, timestamp: isoAt(-4 * HOUR + 10 * MIN) });
    saveGuestSetting(s0);
    saveGuestSetting(s1);

    [1, 2].forEach((id) =>
      saveGuestRecord(makeRecord(s0.id, id, { wrongCount: 0, finishedTime: T0 })),
    );
    [1, 2].forEach((id) =>
      saveGuestRecord(makeRecord(s1.id, id, { wrongCount: 0, finishedTime: T1 })),
    );

    // Level 1: interval = 1 hour; T1 + 1hr = BASE - 4hr + 1hr10min = BASE - 2hr50min
    // now (BASE) is well past that → FRESH (missed 1hr grace of 90min from T1)
    const states = computeAllGuestGroupStates();
    const group = states.get('wordEnglishList:1:2')!;
    expect(group.reviewLevel).toBe(1);
    expect(group.status).toBe('FRESH'); // 4hr elapsed >> 1.5hr grace
  });

  it('different type:min:max ranges → separate group keys', () => {
    const sEn   = makeSetting({ type: 'wordEnglishList',  min: 1,    max: 1000 });
    const sJp   = makeSetting({ type: 'wordJapaneseList', min: 1,    max: 500  });
    const sEn2  = makeSetting({ type: 'wordEnglishList',  min: 1001, max: 2000 });
    saveGuestSetting(sEn);
    saveGuestSetting(sJp);
    saveGuestSetting(sEn2);

    const states = computeAllGuestGroupStates();
    expect(states.has('wordEnglishList:1:1000')).toBe(true);
    expect(states.has('wordJapaneseList:1:500')).toBe(true);
    expect(states.has('wordEnglishList:1001:2000')).toBe(true);
    expect(states.size).toBe(3); // three independent groups
  });

  it('same type, same range, different sessions → ONE group (multiple reviews)', () => {
    // Two sessions of wordEnglishList:1:2 on different days — should be 1 group
    const s1 = makeSetting({ min: 1, max: 2, timestamp: isoAt(-2 * DAY) });
    const s2 = makeSetting({ min: 1, max: 2, timestamp: isoAt(-HOUR) });
    saveGuestSetting(s1);
    saveGuestSetting(s2);

    const states = computeAllGuestGroupStates();
    expect(states.size).toBe(1);
    expect(states.has('wordEnglishList:1:2')).toBe(true);
  });
});

// ===========================================================================
// 4. computeGuestDueGroups — filter to actionable groups only
// ===========================================================================

describe('computeGuestDueGroups', () => {
  it('returns empty array when no sessions', () => {
    expect(computeGuestDueGroups()).toEqual([]);
  });

  it('excludes SCHEDULED groups (not yet due)', () => {
    const s = makeSetting({ min: 1, max: 2 });
    saveGuestSetting(s);
    [1, 2].forEach((id) =>
      saveGuestRecord(makeRecord(s.id, id, { wrongCount: 0, finishedTime: isoAt(-5 * MIN) })),
    );
    // Completed 5 min ago → SCHEDULED (due in 15 min)
    expect(computeGuestDueGroups()).toHaveLength(0);
  });

  it('includes DUE groups', () => {
    const s = makeSetting({ min: 1, max: 2 });
    saveGuestSetting(s);
    [1, 2].forEach((id) =>
      saveGuestRecord(makeRecord(s.id, id, { wrongCount: 0, finishedTime: isoAt(-25 * MIN) })),
    );
    const due = computeGuestDueGroups();
    expect(due).toHaveLength(1);
    expect(due[0].status).toBe('DUE');
    expect(due[0].groupKey).toBe('wordEnglishList:1:2');
  });

  it('includes FRESH groups', () => {
    const s = makeSetting({ min: 1, max: 2 });
    saveGuestSetting(s);
    [1, 2].forEach((id) =>
      saveGuestRecord(makeRecord(s.id, id, { wrongCount: 0, finishedTime: isoAt(-2 * HOUR) })),
    );
    const due = computeGuestDueGroups();
    expect(due).toHaveLength(1);
    expect(due[0].status).toBe('FRESH');
  });

  it('includes UNFINISHED groups', () => {
    const s = makeSetting({ min: 1, max: 10 });
    saveGuestSetting(s);
    // Only 5 of 10 answered correctly
    [1, 2, 3, 4, 5].forEach((id) =>
      saveGuestRecord(makeRecord(s.id, id, { wrongCount: 0 })),
    );
    const due = computeGuestDueGroups();
    expect(due).toHaveLength(1);
    expect(due[0].status).toBe('UNFINISHED');
  });

  it('returns multiple actionable groups across different ranges', () => {
    // Group A: DUE
    const sA = makeSetting({ min: 1, max: 2 });
    saveGuestSetting(sA);
    [1, 2].forEach((id) =>
      saveGuestRecord(makeRecord(sA.id, id, { wrongCount: 0, finishedTime: isoAt(-25 * MIN) })),
    );
    // Group B: UNFINISHED (different range)
    const sB = makeSetting({ min: 101, max: 110 });
    saveGuestSetting(sB);
    saveGuestRecord(makeRecord(sB.id, 101, { wrongCount: 0 }));
    // Group C: SCHEDULED (not actionable)
    const sC = makeSetting({ min: 201, max: 202 });
    saveGuestSetting(sC);
    [201, 202].forEach((id) =>
      saveGuestRecord(makeRecord(sC.id, id, { wrongCount: 0, finishedTime: isoAt(-2 * MIN) })),
    );

    const due = computeGuestDueGroups();
    expect(due).toHaveLength(2);
    expect(due.map((g) => g.status).sort()).toEqual(['DUE', 'UNFINISHED']);
  });
});

// ===========================================================================
// 5. deleteGuestGroup
// ===========================================================================

describe('deleteGuestGroup', () => {
  it('removes settings and records for the specified group', () => {
    const s = makeSetting({ min: 1, max: 10 });
    saveGuestSetting(s);
    saveGuestRecord(makeRecord(s.id, 1));
    saveGuestRecord(makeRecord(s.id, 2));

    deleteGuestGroup('wordEnglishList', 1, 10);

    expect(getGuestSettings()).toHaveLength(0);
    expect(getGuestRecords()).toHaveLength(0);
  });

  it('only removes the target group; leaves other groups intact', () => {
    const sA = makeSetting({ min: 1, max: 10 });
    const sB = makeSetting({ min: 11, max: 20 });
    saveGuestSetting(sA);
    saveGuestSetting(sB);
    saveGuestRecord(makeRecord(sA.id, 1));
    saveGuestRecord(makeRecord(sB.id, 11));

    deleteGuestGroup('wordEnglishList', 1, 10);

    expect(getGuestSettings()).toHaveLength(1);
    expect(getGuestSettings()[0].min).toBe(11);
    expect(getGuestRecords()).toHaveLength(1);
    expect(getGuestRecords()[0].answerId).toBe(11);
  });

  it('removes group level override when group is deleted', () => {
    const s = makeSetting({ min: 1, max: 10 });
    saveGuestSetting(s);
    saveGuestGroupOverride('wordEnglishList:1:10', 3);
    expect(getGuestGroupOverrides()['wordEnglishList:1:10']).toBeDefined();

    deleteGuestGroup('wordEnglishList', 1, 10);
    expect(getGuestGroupOverrides()['wordEnglishList:1:10']).toBeUndefined();
  });
});

// ===========================================================================
// 6. Manual level override pipeline
// ===========================================================================

describe('saveGuestGroupOverride → computeAllGuestGroupStates', () => {
  it('override forces a specific level and SCHEDULED status', () => {
    const s = makeSetting({ min: 1, max: 2 });
    saveGuestSetting(s);
    [1, 2].forEach((id) =>
      saveGuestRecord(makeRecord(s.id, id, { wrongCount: 0, finishedTime: isoAt(-DAY) })),
    );
    // Without override: FRESH (past grace)
    expect(computeAllGuestGroupStates().get('wordEnglishList:1:2')?.status).toBe('FRESH');

    // Set override at level 3 right now → SCHEDULED (next due in 1 day)
    vi.setSystemTime(BASE); // ensure override.setAt = BASE
    saveGuestGroupOverride('wordEnglishList:1:2', 3);

    const states = computeAllGuestGroupStates();
    const g = states.get('wordEnglishList:1:2')!;
    expect(g.status).toBe('SCHEDULED');
    expect(g.reviewLevel).toBe(3);
    // Next review at BASE + 1 day (DEFAULT_INTERVALS_MS[3])
    expect(g.nextReviewTime?.getTime()).toBeCloseTo(BASE + DEFAULT_INTERVALS_MS[3], -3);
  });
});

// ===========================================================================
// 7. Level walk across multiple sessions (Ebbinghaus progression)
// ===========================================================================

describe('Ebbinghaus level progression via guest storage', () => {
  it('three on-time reviews advance through levels 0 → 1 → 2', () => {
    // Session 1: completed at T0 = BASE - 4hr
    const T0 = isoAt(-4 * HOUR);
    const s0 = makeSetting({ min: 1, max: 2, timestamp: isoAt(-4 * HOUR) });
    saveGuestSetting(s0);
    [1, 2].forEach((id) =>
      saveGuestRecord(makeRecord(s0.id, id, { wrongCount: 0, finishedTime: T0 })),
    );

    // Session 2: completed at T0 + 15 min (within INT[0]=20min grace=30min → level 1)
    const T1 = isoAt(-4 * HOUR + 15 * MIN);
    const s1 = makeSetting({ min: 1, max: 2, timestamp: isoAt(-4 * HOUR + 15 * MIN) });
    saveGuestSetting(s1);
    [1, 2].forEach((id) =>
      saveGuestRecord(makeRecord(s1.id, id, { wrongCount: 0, finishedTime: T1 })),
    );

    // Session 3: completed at T1 + 45 min (within INT[1]=1hr grace=1.5hr → level 2)
    const T2 = isoAt(-4 * HOUR + 60 * MIN);
    const s2 = makeSetting({ min: 1, max: 2, timestamp: isoAt(-4 * HOUR + 60 * MIN) });
    saveGuestSetting(s2);
    [1, 2].forEach((id) =>
      saveGuestRecord(makeRecord(s2.id, id, { wrongCount: 0, finishedTime: T2 })),
    );

    // Now = BASE; T2 = BASE - 3hr; INT[2]=8hr → due at BASE + 5hr → SCHEDULED
    const states = computeAllGuestGroupStates();
    const g = states.get('wordEnglishList:1:2')!;
    expect(g.reviewLevel).toBe(2);
    expect(g.status).toBe('SCHEDULED');
  });

  it('missed grace window resets level to 0', () => {
    const T0 = isoAt(-2 * HOUR);
    const T1 = isoAt(-2 * HOUR + 35 * MIN); // 35 min after T0 — past 30-min grace

    const s0 = makeSetting({ min: 1, max: 2, timestamp: isoAt(-2 * HOUR) });
    const s1 = makeSetting({ min: 1, max: 2, timestamp: isoAt(-2 * HOUR + 35 * MIN) });
    saveGuestSetting(s0);
    saveGuestSetting(s1);
    [1, 2].forEach((id) => saveGuestRecord(makeRecord(s0.id, id, { wrongCount: 0, finishedTime: T0 })));
    [1, 2].forEach((id) => saveGuestRecord(makeRecord(s1.id, id, { wrongCount: 0, finishedTime: T1 })));

    // T1 was 85 min ago → level reset to 0 at T1; INT[0]=20min grace=30min
    // graceEnd = T1 + 30min = BASE - 55min → now > graceEnd → FRESH, level 0
    const states = computeAllGuestGroupStates();
    const g = states.get('wordEnglishList:1:2')!;
    expect(g.reviewLevel).toBe(0);
    expect(g.status).toBe('FRESH');
  });
});

// ===========================================================================
// 8. getIntervals / saveIntervals
// ===========================================================================

describe('getIntervals / saveIntervals', () => {
  it('returns DEFAULT_INTERVALS_MS when localStorage is empty', () => {
    expect(getIntervals()).toEqual(DEFAULT_INTERVALS_MS);
  });

  it('returns stored intervals when valid array is saved', () => {
    const custom = [10 * MIN, 30 * MIN, 2 * HOUR];
    saveIntervals(custom);
    expect(getIntervals()).toEqual(custom);
  });

  it('returns DEFAULT when empty array is saved', () => {
    saveIntervals([]);
    expect(getIntervals()).toEqual(DEFAULT_INTERVALS_MS);
  });

  it('returns DEFAULT when array contains a zero value', () => {
    saveIntervals([0, 30 * MIN]);
    expect(getIntervals()).toEqual(DEFAULT_INTERVALS_MS);
  });

  it('returns DEFAULT when array contains a negative value', () => {
    saveIntervals([-1, 30 * MIN]);
    expect(getIntervals()).toEqual(DEFAULT_INTERVALS_MS);
  });

  it('returns DEFAULT when localStorage contains malformed JSON', () => {
    localStorage.setItem('hw-review-intervals', 'not-json{{{');
    expect(getIntervals()).toEqual(DEFAULT_INTERVALS_MS);
  });

  it('returns DEFAULT when localStorage contains a non-array JSON value', () => {
    localStorage.setItem('hw-review-intervals', JSON.stringify({ foo: 123 }));
    expect(getIntervals()).toEqual(DEFAULT_INTERVALS_MS);
  });

  it('saveIntervals then getIntervals round-trips correctly', () => {
    const custom = [5 * MIN, 20 * MIN, HOUR, 6 * HOUR, DAY];
    saveIntervals(custom);
    expect(getIntervals()).toEqual(custom);
  });
});

// ===========================================================================
// 9. getFinishedIdsBySetting
// ===========================================================================

describe('getFinishedIdsBySetting', () => {
  it('returns empty array when no records exist', () => {
    expect(getFinishedIdsBySetting('s1')).toEqual([]);
  });

  it('returns only wrongCount=0 records for the given settingId', () => {
    const s = makeSetting({ min: 1, max: 5 });
    saveGuestSetting(s);
    saveGuestRecord(makeRecord(s.id, 1, { wrongCount: 0 }));
    saveGuestRecord(makeRecord(s.id, 2, { wrongCount: 1 })); // wrong — excluded
    saveGuestRecord(makeRecord(s.id, 3, { wrongCount: 0 }));
    const ids = getFinishedIdsBySetting(s.id);
    expect(ids).toContain(1);
    expect(ids).toContain(3);
    expect(ids).not.toContain(2);
    expect(ids).toHaveLength(2);
  });

  it('excludes records belonging to a different settingId', () => {
    const sA = makeSetting({ min: 1, max: 5 });
    const sB = makeSetting({ min: 6, max: 10 });
    saveGuestSetting(sA);
    saveGuestSetting(sB);
    saveGuestRecord(makeRecord(sA.id, 1, { wrongCount: 0 }));
    saveGuestRecord(makeRecord(sB.id, 6, { wrongCount: 0 }));
    expect(getFinishedIdsBySetting(sA.id)).toEqual([1]);
    expect(getFinishedIdsBySetting(sB.id)).toEqual([6]);
  });

  it('returns duplicate answerIds without deduplication (raw list)', () => {
    // getFinishedIdsBySetting returns a raw list — same answerId twice is possible
    const s = makeSetting({ min: 1, max: 5 });
    saveGuestSetting(s);
    saveGuestRecord(makeRecord(s.id, 5, { wrongCount: 0 }));
    saveGuestRecord(makeRecord(s.id, 5, { wrongCount: 0 })); // same word, second correct record
    const ids = getFinishedIdsBySetting(s.id);
    expect(ids).toHaveLength(2); // not deduplicated here
    expect(ids.filter((id) => id === 5)).toHaveLength(2);
  });
});

// ===========================================================================
// 10. deleteGuestGroup — edge cases
// ===========================================================================

describe('deleteGuestGroup — edge cases', () => {
  it('delete when no records for that group — still removes the setting', () => {
    const s = makeSetting({ min: 1, max: 10 });
    saveGuestSetting(s);
    // No records saved
    deleteGuestGroup('wordEnglishList', 1, 10);
    expect(getGuestSettings()).toHaveLength(0);
  });

  it('delete non-existent group — no error, storage unchanged', () => {
    const s = makeSetting({ min: 1, max: 10 });
    saveGuestSetting(s);
    saveGuestRecord(makeRecord(s.id, 1));
    // Delete a different group that does not exist
    expect(() => deleteGuestGroup('wordEnglishList', 999, 9999)).not.toThrow();
    // Original data unchanged
    expect(getGuestSettings()).toHaveLength(1);
    expect(getGuestRecords()).toHaveLength(1);
  });

  it('deleting one session of a multi-session group only removes matching settings', () => {
    const s1 = makeSetting({ min: 1, max: 10, timestamp: isoAt(-DAY) });
    const s2 = makeSetting({ min: 1, max: 10, timestamp: isoAt(-HOUR) });
    const sOther = makeSetting({ min: 11, max: 20 });
    saveGuestSetting(s1);
    saveGuestSetting(s2);
    saveGuestSetting(sOther);
    saveGuestRecord(makeRecord(s1.id, 1));
    saveGuestRecord(makeRecord(s2.id, 2));
    saveGuestRecord(makeRecord(sOther.id, 11));

    // Delete the group wordEnglishList:1:10 → removes both s1 and s2
    deleteGuestGroup('wordEnglishList', 1, 10);

    const remainingSettings = getGuestSettings();
    expect(remainingSettings).toHaveLength(1);
    expect(remainingSettings[0].min).toBe(11);
    const remainingRecords = getGuestRecords();
    expect(remainingRecords).toHaveLength(1);
    expect(remainingRecords[0].answerId).toBe(11);
  });
});

// ===========================================================================
// 11. saveGuestGroupOverride / deleteGuestGroupOverride — edge cases
// ===========================================================================

describe('saveGuestGroupOverride — edge cases', () => {
  it('saving override twice — second write wins', () => {
    saveGuestGroupOverride('wordEnglishList:1:10', 2);
    saveGuestGroupOverride('wordEnglishList:1:10', 5);
    expect(getGuestGroupOverrides()['wordEnglishList:1:10'].level).toBe(5);
  });

  it('override with level=0 is stored correctly', () => {
    saveGuestGroupOverride('wordEnglishList:1:10', 0);
    expect(getGuestGroupOverrides()['wordEnglishList:1:10'].level).toBe(0);
  });

  it('getGuestGroupOverrides reads back a valid Date object for setAt', () => {
    vi.setSystemTime(BASE);
    saveGuestGroupOverride('wordEnglishList:1:10', 3);
    const overrides = getGuestGroupOverrides();
    const setAt = overrides['wordEnglishList:1:10'].setAt;
    expect(setAt).toBeInstanceOf(Date);
    expect(setAt.getTime()).toBeCloseTo(BASE, -3);
  });
});

describe('deleteGuestGroupOverride — edge cases', () => {
  it('delete non-existent key — no error, no crash', () => {
    expect(() => deleteGuestGroupOverride('nonexistent:key')).not.toThrow();
  });

  it('delete one key, other keys remain intact', () => {
    saveGuestGroupOverride('wordEnglishList:1:10', 2);
    saveGuestGroupOverride('wordEnglishList:11:20', 4);
    deleteGuestGroupOverride('wordEnglishList:1:10');
    const overrides = getGuestGroupOverrides();
    expect(overrides['wordEnglishList:1:10']).toBeUndefined();
    expect(overrides['wordEnglishList:11:20']).toBeDefined();
    expect(overrides['wordEnglishList:11:20'].level).toBe(4);
  });
});

// ===========================================================================
// 12. Multiple overrides for different groups
// ===========================================================================

describe('multiple overrides — independent groups', () => {
  it('two different group overrides are both stored and retrievable', () => {
    saveGuestGroupOverride('wordEnglishList:1:100', 2);
    saveGuestGroupOverride('wordJapaneseList:1:50', 5);
    const overrides = getGuestGroupOverrides();
    expect(overrides['wordEnglishList:1:100'].level).toBe(2);
    expect(overrides['wordJapaneseList:1:50'].level).toBe(5);
  });

  it('two override groups are each applied independently in computeAllGuestGroupStates', () => {
    // Group A: completed 100 days ago, override at level 3 → SCHEDULED
    const sA = makeSetting({ type: 'wordEnglishList', min: 1, max: 2, timestamp: isoAt(-100 * DAY) });
    saveGuestSetting(sA);
    [1, 2].forEach((id) =>
      saveGuestRecord(makeRecord(sA.id, id, { wrongCount: 0, finishedTime: isoAt(-100 * DAY) })),
    );

    // Group B: completed 100 days ago, override at level 1 → SCHEDULED
    const sB = makeSetting({ type: 'wordJapaneseList', min: 1, max: 2, timestamp: isoAt(-100 * DAY) });
    saveGuestSetting(sB);
    [1, 2].forEach((id) =>
      saveGuestRecord(makeRecord(sB.id, id, { wrongCount: 0, finishedTime: isoAt(-100 * DAY) })),
    );

    // Both overrides set at BASE (now) → both SCHEDULED
    saveGuestGroupOverride('wordEnglishList:1:2', 3);
    saveGuestGroupOverride('wordJapaneseList:1:2', 1);

    const states = computeAllGuestGroupStates();
    expect(states.get('wordEnglishList:1:2')?.status).toBe('SCHEDULED');
    expect(states.get('wordEnglishList:1:2')?.reviewLevel).toBe(3);
    expect(states.get('wordJapaneseList:1:2')?.status).toBe('SCHEDULED');
    expect(states.get('wordJapaneseList:1:2')?.reviewLevel).toBe(1);
  });
});

// ===========================================================================
// 13. computeGuestDueGroups with overrides
// ===========================================================================

describe('computeGuestDueGroups — with overrides', () => {
  it('override-forced DUE group is included in due groups', () => {
    const s = makeSetting({ min: 1, max: 2 });
    saveGuestSetting(s);
    [1, 2].forEach((id) =>
      saveGuestRecord(makeRecord(s.id, id, { wrongCount: 0, finishedTime: isoAt(-100 * DAY) })),
    );
    // Without override: FRESH (very old)
    // Override 25 min ago at level 0 → DUE (INT[0]=20min → dueTime = BASE - 5min, within grace)
    vi.setSystemTime(new Date(BASE - 25 * MIN));
    saveGuestGroupOverride('wordEnglishList:1:2', 0);
    vi.setSystemTime(BASE); // restore to "now"

    const due = computeGuestDueGroups();
    expect(due).toHaveLength(1);
    expect(due[0].status).toBe('DUE');
  });

  it('override-forced SCHEDULED group is NOT included in due groups', () => {
    const s = makeSetting({ min: 1, max: 2 });
    saveGuestSetting(s);
    [1, 2].forEach((id) =>
      saveGuestRecord(makeRecord(s.id, id, { wrongCount: 0, finishedTime: isoAt(-100 * DAY) })),
    );
    // Override right now at level 2 → SCHEDULED (INT[2]=8hr, due in 8hr)
    saveGuestGroupOverride('wordEnglishList:1:2', 2);

    const due = computeGuestDueGroups();
    expect(due).toHaveLength(0);
  });
});

// ===========================================================================
// 14. Level cap end-to-end via guest storage
// ===========================================================================

describe('level cap end-to-end via guest storage', () => {
  it('8+ on-time completions via guest storage → reviewLevel ≤ 6', () => {
    const timestamps: Array<string> = [];
    let cur = BASE - 400 * DAY;
    timestamps.push(new Date(cur).toISOString());
    const localIntervals = DEFAULT_INTERVALS_MS;
    for (let i = 0; i < 9; i++) {
      const intervalIdx = Math.min(i, localIntervals.length - 1);
      // Advance by 110% of the interval (within grace of 150%)
      cur = cur + localIntervals[intervalIdx] * 1.1;
      timestamps.push(new Date(cur).toISOString());
    }

    // Create one GuestSetting + records per completion
    timestamps.forEach((ts) => {
      const s = makeSetting({ min: 1, max: 3, timestamp: ts });
      saveGuestSetting(s);
      [1, 2, 3].forEach((id) =>
        saveGuestRecord(makeRecord(s.id, id, { wrongCount: 0, finishedTime: ts })),
      );
    });

    const states = computeAllGuestGroupStates();
    const g = states.get('wordEnglishList:1:3')!;
    expect(g.reviewLevel).toBeLessThanOrEqual(6);
  });
});

// ===========================================================================
// 15. Single-word group (min=max, range=1) via guest storage
// ===========================================================================

describe('single-word group (min=max) via guest storage', () => {
  it('1 correct record for range=1 → SCHEDULED', () => {
    const s = makeSetting({ min: 50, max: 50, timestamp: isoAt(-10 * MIN) });
    saveGuestSetting(s);
    saveGuestRecord(makeRecord(s.id, 50, { wrongCount: 0, finishedTime: isoAt(-10 * MIN) }));

    const states = computeAllGuestGroupStates();
    expect(states.get('wordEnglishList:50:50')?.status).toBe('SCHEDULED');
  });

  it('0 correct records for range=1 → UNFINISHED', () => {
    const s = makeSetting({ min: 50, max: 50, timestamp: isoAt(-10 * MIN) });
    saveGuestSetting(s);
    // No records saved

    const states = computeAllGuestGroupStates();
    expect(states.get('wordEnglishList:50:50')?.status).toBe('UNFINISHED');
  });
});

// ===========================================================================
// 16. guestSettingsToQuizSettings — additional edge cases
// ===========================================================================

describe('guestSettingsToQuizSettings — additional edge cases', () => {
  it('records from a different settingId are ignored', () => {
    const sA = makeSetting({ min: 1, max: 5 });
    const sB = makeSetting({ min: 6, max: 10 });
    saveGuestSetting(sA);
    saveGuestSetting(sB);
    // Only save records for sB
    [6, 7, 8, 9, 10].forEach((id) =>
      saveGuestRecord(makeRecord(sB.id, id, { wrongCount: 0 })),
    );
    const qs = guestSettingsToQuizSettings();
    const qsA = qs.find((q) => q.min === 1 && q.max === 5)!;
    expect(qsA.finishedCount).toBe(0);
    expect(qsA.latestFinishedTime).toBeUndefined();
  });

  it('all records for a setting have wrongCount > 0 → finishedCount=0, no latestFinishedTime', () => {
    const s = makeSetting({ min: 1, max: 3 });
    saveGuestSetting(s);
    [1, 2, 3].forEach((id) =>
      saveGuestRecord(makeRecord(s.id, id, { wrongCount: 2 })),
    );
    const qs = guestSettingsToQuizSettings();
    expect(qs[0].finishedCount).toBe(0);
    expect(qs[0].latestFinishedTime).toBeUndefined();
  });

  it('setting with min=max=50 (rangeSize=1) → correctly maps to min=50 max=50', () => {
    const s = makeSetting({ min: 50, max: 50 });
    saveGuestSetting(s);
    const qs = guestSettingsToQuizSettings();
    expect(qs[0].min).toBe(50);
    expect(qs[0].max).toBe(50);
  });
});

// ===========================================================================
// 17. computeAllGuestGroupStates with corrupted localStorage
// ===========================================================================

describe('computeAllGuestGroupStates — resilience to corrupted storage', () => {
  it('corrupted settings JSON → returns empty map gracefully', () => {
    localStorage.setItem('hw-guest-settings', 'CORRUPTED{{');
    expect(() => computeAllGuestGroupStates()).not.toThrow();
    expect(computeAllGuestGroupStates().size).toBe(0);
  });

  it('corrupted records JSON → falls back gracefully (settings present, records empty)', () => {
    const s = makeSetting({ min: 1, max: 3, timestamp: isoAt(-10 * MIN) });
    saveGuestSetting(s);
    localStorage.setItem('hw-guest-records', 'NOT-VALID-JSON');
    // Records read returns [] on parse error; finishedCount=0 → UNFINISHED
    const states = computeAllGuestGroupStates();
    expect(states.get('wordEnglishList:1:3')?.status).toBe('UNFINISHED');
  });
});

// ===========================================================================
// 18. saveGuestSetting — additional persistence tests
// ===========================================================================

describe('saveGuestSetting — additional tests', () => {
  it('settings with same type but different ranges are stored as separate entries', () => {
    const s1 = makeSetting({ min: 1,   max: 100 });
    const s2 = makeSetting({ min: 101, max: 200 });
    const s3 = makeSetting({ min: 201, max: 300 });
    saveGuestSetting(s1);
    saveGuestSetting(s2);
    saveGuestSetting(s3);
    const stored = getGuestSettings();
    expect(stored).toHaveLength(3);
    expect(stored.map((s) => s.min).sort((a,b)=>a-b)).toEqual([1, 101, 201]);
  });

  it('same setting saved twice creates two entries (no dedup at storage level)', () => {
    const s = makeSetting({ min: 1, max: 10 });
    saveGuestSetting(s);
    saveGuestSetting(s);
    expect(getGuestSettings()).toHaveLength(2);
  });
});

// ===========================================================================
// 19. saveGuestRecord — additional persistence tests
// ===========================================================================

describe('saveGuestRecord — additional tests', () => {
  it('records with different settingIds are all stored', () => {
    const r1 = makeRecord('s1', 1);
    const r2 = makeRecord('s2', 2);
    const r3 = makeRecord('s3', 3);
    saveGuestRecord(r1);
    saveGuestRecord(r2);
    saveGuestRecord(r3);
    expect(getGuestRecords()).toHaveLength(3);
  });

  it('record with wrongCount=5 is stored correctly', () => {
    const r = makeRecord('s1', 1, { wrongCount: 5 });
    saveGuestRecord(r);
    expect(getGuestRecords()[0].wrongCount).toBe(5);
  });
});

// ===========================================================================
// 20. guestSettingsToQuizSettings — timestamp mapping
// ===========================================================================

describe('guestSettingsToQuizSettings — timestamp field', () => {
  it('maps GuestSetting.timestamp string to Date object', () => {
    const s = makeSetting({ min: 1, max: 5, timestamp: isoAt(-2 * HOUR) });
    saveGuestSetting(s);
    const qs = guestSettingsToQuizSettings();
    expect(qs[0].timestamp).toBeInstanceOf(Date);
    expect(qs[0].timestamp.getTime()).toBeCloseTo(BASE - 2 * HOUR, -3);
  });

  it('isSelected is always true', () => {
    const s = makeSetting({ min: 1, max: 5 });
    saveGuestSetting(s);
    expect(guestSettingsToQuizSettings()[0].isSelected).toBe(true);
  });

  it('tableName is mapped correctly', () => {
    const s = makeSetting({ min: 1, max: 5, tableName: 'word_japanese' });
    saveGuestSetting(s);
    expect(guestSettingsToQuizSettings()[0].tableName).toBe('word_japanese');
  });
});

// ===========================================================================
// 21. computeGuestDueGroups — additional tests
// ===========================================================================

describe('computeGuestDueGroups — additional edge cases', () => {
  it('UNFINISHED group (no records) is included', () => {
    const s = makeSetting({ min: 1, max: 5 });
    saveGuestSetting(s);
    // No records → finishedCount=0, rangeSize=5 → UNFINISHED
    const due = computeGuestDueGroups();
    expect(due).toHaveLength(1);
    expect(due[0].status).toBe('UNFINISHED');
  });

  it('groupKey in DueGroup matches type:min:max pattern', () => {
    const s = makeSetting({ min: 5, max: 10 });
    saveGuestSetting(s);
    [5, 6, 7, 8, 9, 10].forEach((id) =>
      saveGuestRecord(makeRecord(s.id, id, { wrongCount: 0, finishedTime: isoAt(-25 * MIN) })),
    );
    const due = computeGuestDueGroups();
    expect(due[0].groupKey).toBe('wordEnglishList:5:10');
  });

  it('DUE group has correct min, max, type fields', () => {
    const s = makeSetting({ type: 'wordJapaneseList', min: 10, max: 20 });
    saveGuestSetting(s);
    [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].forEach((id) =>
      saveGuestRecord(makeRecord(s.id, id, { wrongCount: 0, finishedTime: isoAt(-25 * MIN) })),
    );
    const due = computeGuestDueGroups();
    expect(due[0].type).toBe('wordJapaneseList');
    expect(due[0].min).toBe(10);
    expect(due[0].max).toBe(20);
  });
});

// ===========================================================================
// 22. getGuestGroupOverrides — empty storage
// ===========================================================================

describe('getGuestGroupOverrides — baseline', () => {
  it('returns empty object when no overrides saved', () => {
    expect(getGuestGroupOverrides()).toEqual({});
  });

  it('returns empty object when overrides key contains malformed JSON', () => {
    localStorage.setItem('hw-group-level-overrides', 'INVALID{');
    expect(getGuestGroupOverrides()).toEqual({});
  });
});

// ===========================================================================
// 23. deleteGuestGroup removes override for that exact type:min:max
// ===========================================================================

describe('deleteGuestGroup — also removes override', () => {
  it('deleteGuestGroup clears only the matching group override', () => {
    saveGuestGroupOverride('wordEnglishList:1:10', 2);
    saveGuestGroupOverride('wordEnglishList:11:20', 3);
    const s = makeSetting({ min: 1, max: 10 });
    saveGuestSetting(s);

    deleteGuestGroup('wordEnglishList', 1, 10);

    const overrides = getGuestGroupOverrides();
    expect(overrides['wordEnglishList:1:10']).toBeUndefined();
    expect(overrides['wordEnglishList:11:20']).toBeDefined();
  });
});

// ===========================================================================
// 24. FRESH group re-entry progress bug — regression tests
//
// Bug: Guest enters a FRESH (forgotten) group, completes 1/10 words, returns
// to the Review page and sees 10/10 instead of 1/10.
//
// Root cause: ReviewPage was passing _guestId for ALL groups (including
// FRESH/DUE), causing VocabularyQuizPage to append new records to the OLD
// fully-completed session. This kept finishedCount >= rangeSize, flipping
// latestFinishedTime to now → computeGroupStates saw the session as just
// completed → status=SCHEDULED → displayCompleted=group.total (10/10).
//
// Fix: _guestId is now only set when the most recent session is genuinely
// unfinished (finishedCount < rangeSize). FRESH/DUE groups get a NEW session.
// ===========================================================================

describe('FRESH group re-entry — new session (correct behavior after fix)', () => {
  // This mirrors what the fixed code does: a NEW GuestSetting is created for
  // a FRESH group instead of reusing the old one.

  it('entering a FRESH group creates a new session; 1/10 words → UNFINISHED', () => {
    // Old session: all 10 words completed 35 minutes ago (FRESH: past 30-min grace)
    const oldSession = makeSetting({ min: 1, max: 10, timestamp: isoAt(-35 * MIN) });
    saveGuestSetting(oldSession);
    for (let id = 1; id <= 10; id++) {
      saveGuestRecord(makeRecord(oldSession.id, id, { wrongCount: 0, finishedTime: isoAt(-35 * MIN) }));
    }
    // Confirm baseline: group is FRESH
    expect(computeAllGuestGroupStates().get('wordEnglishList:1:10')?.status).toBe('FRESH');

    // User enters the group → NEW session created (fixed behavior)
    const newSession = makeSetting({ min: 1, max: 10, timestamp: isoAt(0) });
    saveGuestSetting(newSession);
    // User completes 1 word
    saveGuestRecord(makeRecord(newSession.id, 3, { wrongCount: 0, finishedTime: isoAt(0) }));

    const states = computeAllGuestGroupStates();
    const g = states.get('wordEnglishList:1:10')!;
    // New session has finishedCount=1 < rangeSize=10 → UNFINISHED, not SCHEDULED
    expect(g.status).toBe('UNFINISHED');
  });

  it('new session after FRESH: finishedCount reflects only the new session words', () => {
    const oldSession = makeSetting({ min: 1, max: 10, timestamp: isoAt(-35 * MIN) });
    saveGuestSetting(oldSession);
    for (let id = 1; id <= 10; id++) {
      saveGuestRecord(makeRecord(oldSession.id, id, { wrongCount: 0, finishedTime: isoAt(-35 * MIN) }));
    }

    // New session: answer 3 words
    const newSession = makeSetting({ min: 1, max: 10, timestamp: isoAt(0) });
    saveGuestSetting(newSession);
    [1, 2, 3].forEach((id) =>
      saveGuestRecord(makeRecord(newSession.id, id, { wrongCount: 0, finishedTime: isoAt(0) })),
    );

    // The new session has finishedCount=3 < 10 → UNFINISHED (not SCHEDULED)
    const qs = guestSettingsToQuizSettings();
    const newQs = qs.find((q) => q.min === 1 && q.max === 10 && q.finishedCount === 3);
    expect(newQs).toBeDefined();
    expect(newQs!.finishedCount).toBe(3);

    const g = computeAllGuestGroupStates().get('wordEnglishList:1:10')!;
    expect(g.status).toBe('UNFINISHED');
  });

  it('new session after FRESH: completing all 10 words → SCHEDULED', () => {
    const oldSession = makeSetting({ min: 1, max: 10, timestamp: isoAt(-35 * MIN) });
    saveGuestSetting(oldSession);
    for (let id = 1; id <= 10; id++) {
      saveGuestRecord(makeRecord(oldSession.id, id, { wrongCount: 0, finishedTime: isoAt(-35 * MIN) }));
    }

    // New session: complete all 10 words
    const newSession = makeSetting({ min: 1, max: 10, timestamp: isoAt(0) });
    saveGuestSetting(newSession);
    for (let id = 1; id <= 10; id++) {
      saveGuestRecord(makeRecord(newSession.id, id, { wrongCount: 0, finishedTime: isoAt(0) }));
    }

    const g = computeAllGuestGroupStates().get('wordEnglishList:1:10')!;
    // Fully completed → SCHEDULED (level resets since old completion was out of grace)
    expect(g.status).toBe('SCHEDULED');
    expect(g.reviewLevel).toBe(0);
  });
});

describe('FRESH group re-entry — old session reuse (demonstrates the bug)', () => {
  // This mirrors what the BUGGY code did: appending new records to the old
  // session's settingId instead of creating a new one.
  // These tests document WHY the bug caused wrong output so it cannot regress.

  it('appending 1 new record to a fully-completed old session keeps finishedCount >= rangeSize', () => {
    const session = makeSetting({ min: 1, max: 10, timestamp: isoAt(-35 * MIN) });
    saveGuestSetting(session);
    for (let id = 1; id <= 10; id++) {
      saveGuestRecord(makeRecord(session.id, id, { wrongCount: 0, finishedTime: isoAt(-35 * MIN) }));
    }
    // Bug: one new word appended to the SAME old session
    saveGuestRecord(makeRecord(session.id, 11, { wrongCount: 0, finishedTime: isoAt(0) }));

    // finishedCount is now 11 (new word is a unique ID) — still >= rangeSize=10
    const qs = guestSettingsToQuizSettings();
    expect(qs[0].finishedCount).toBeGreaterThanOrEqual(10);
  });

  it('appending a duplicate word ID to old session does not change finishedCount (Set dedup)', () => {
    const session = makeSetting({ min: 1, max: 10, timestamp: isoAt(-35 * MIN) });
    saveGuestSetting(session);
    for (let id = 1; id <= 10; id++) {
      saveGuestRecord(makeRecord(session.id, id, { wrongCount: 0, finishedTime: isoAt(-35 * MIN) }));
    }
    // Bug: the new word happens to be a duplicate of an already-answered word
    saveGuestRecord(makeRecord(session.id, 5, { wrongCount: 0, finishedTime: isoAt(0) }));

    const qs = guestSettingsToQuizSettings();
    // Set dedup: finishedCount stays at 10 (not 11)
    expect(qs[0].finishedCount).toBe(10);
    // latestFinishedTime updates to now
    expect(qs[0].latestFinishedTime?.getTime()).toBeCloseTo(BASE, -3);
  });

  it('appending to old session and updating latestFinishedTime flips status to SCHEDULED (the bug)', () => {
    const session = makeSetting({ min: 1, max: 10, timestamp: isoAt(-35 * MIN) });
    saveGuestSetting(session);
    for (let id = 1; id <= 10; id++) {
      saveGuestRecord(makeRecord(session.id, id, { wrongCount: 0, finishedTime: isoAt(-35 * MIN) }));
    }
    // Before re-entry: FRESH
    expect(computeAllGuestGroupStates().get('wordEnglishList:1:10')?.status).toBe('FRESH');

    // Bug simulation: new word appended to OLD session (finishedTime=now)
    saveGuestRecord(makeRecord(session.id, 5, { wrongCount: 0, finishedTime: isoAt(0) }));

    // latestFinishedTime = now → completedTimes = [now] → prevTime = now
    // dueTime = now + 20min → now < dueTime → SCHEDULED (wrong!)
    const g = computeAllGuestGroupStates().get('wordEnglishList:1:10')!;
    expect(g.status).toBe('SCHEDULED'); // ← this is the buggy state
  });
});

describe('DUE group re-entry — new session (correct behavior after fix)', () => {
  it('entering a DUE group creates a new session; 1/5 words → UNFINISHED', () => {
    // Old session: complete 5 words 25 min ago (DUE: past 20-min interval, within 30-min grace)
    const oldSession = makeSetting({ min: 1, max: 5, timestamp: isoAt(-25 * MIN) });
    saveGuestSetting(oldSession);
    for (let id = 1; id <= 5; id++) {
      saveGuestRecord(makeRecord(oldSession.id, id, { wrongCount: 0, finishedTime: isoAt(-25 * MIN) }));
    }
    expect(computeAllGuestGroupStates().get('wordEnglishList:1:5')?.status).toBe('DUE');

    // New session (fixed behavior): create a fresh session
    const newSession = makeSetting({ min: 1, max: 5, timestamp: isoAt(0) });
    saveGuestSetting(newSession);
    // User completes 1 word
    saveGuestRecord(makeRecord(newSession.id, 2, { wrongCount: 0, finishedTime: isoAt(0) }));

    const g = computeAllGuestGroupStates().get('wordEnglishList:1:5')!;
    expect(g.status).toBe('UNFINISHED');
  });
});
