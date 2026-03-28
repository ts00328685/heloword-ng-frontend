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
  GuestSetting,
  GuestRecord,
} from './guestStorage.service';
import { DEFAULT_INTERVALS_MS } from '../utils/ebbinghaus';

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
