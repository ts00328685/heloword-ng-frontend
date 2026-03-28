/**
 * Ebbinghaus Forgetting Curve — Spaced Repetition Engine
 *
 * Core feature of Heloword. Users configure word groups and complete them;
 * the app schedules reviews at increasing intervals based on the forgetting curve.
 *
 * Default review schedule (after completing a group):
 *   Review 1 : 20 minutes
 *   Review 2 : 1 hour
 *   Review 3 : 8 hours
 *   Review 4 : 1 day
 *   Review 5 : 2 days
 *   Review 6 : 6 days
 *   Review 7 : 31 days
 *
 * State machine per group (identified by type:min:max):
 *   UNFINISHED — most recent session incomplete → always due, notify immediately
 *   DUE        — interval elapsed since last completion → review now
 *   FRESH      — grace window missed (1.5× interval) → progress resets, notify immediately
 *   SCHEDULED  — next review not yet due → show countdown
 *
 * Grace window: if the user doesn't review within dueTime + 50% of the current
 * interval, the group is considered "FRESH" (forgotten) and the review level
 * resets to 0. E.g. for the 20-min interval, grace window = 20 + 10 = 30 min.
 */

import { DueGroup, QuizSetting } from '../models';

export const DEFAULT_INTERVALS_MS: number[] = [
  20 * 60 * 1000,           // 20 min
  60 * 60 * 1000,           // 1 hour
  8 * 60 * 60 * 1000,       // 8 hours
  24 * 60 * 60 * 1000,      // 1 day
  2 * 24 * 60 * 60 * 1000,  // 2 days
  6 * 24 * 60 * 60 * 1000,  // 6 days
  31 * 24 * 60 * 60 * 1000, // 31 days
];

const INTERVALS_KEY = 'hw-review-intervals';

export function getIntervals(): number[] {
  try {
    const raw = localStorage.getItem(INTERVALS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as number[];
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((v) => typeof v === 'number' && v > 0)) {
        return parsed;
      }
    }
  } catch {}
  return [...DEFAULT_INTERVALS_MS];
}

export function saveIntervals(intervals: number[]): void {
  try {
    localStorage.setItem(INTERVALS_KEY, JSON.stringify(intervals));
  } catch {}
}

/** Human-readable interval label: "20 min", "1 hour", "3 days", etc. */
export function formatInterval(ms: number): string {
  const min = ms / 60_000;
  if (min < 60) return `${Math.round(min)} min`;
  const h = ms / 3_600_000;
  if (h < 24) return h === 1 ? '1 hour' : `${Math.round(h)} hours`;
  const d = ms / 86_400_000;
  return d === 1 ? '1 day' : `${Math.round(d)} days`;
}

/** Relative time label: "in 2 hours", "3 days ago", etc. */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = date.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const past = diffMs < 0;

  const min = Math.round(abs / 60_000);
  if (abs < 60 * 60_000) {
    return past ? `${min} min ago` : `in ${min} min`;
  }
  const h = Math.round(abs / 3_600_000);
  if (abs < 24 * 3_600_000) {
    const label = h === 1 ? '1 hour' : `${h} hours`;
    return past ? `${label} ago` : `in ${label}`;
  }
  const d = Math.round(abs / 86_400_000);
  const label = d === 1 ? '1 day' : `${d} days`;
  return past ? `${label} ago` : `in ${label}`;
}

export function getGroupKey(type: string, min: number, max: number): string {
  return `${type}:${min}:${max}`;
}

export function parseGroupKey(key: string): { type: string; min: number; max: number } {
  const idx = key.indexOf(':');
  const rest = key.slice(idx + 1);
  const idx2 = rest.indexOf(':');
  return {
    type: key.slice(0, idx),
    min: parseInt(rest.slice(0, idx2), 10),
    max: parseInt(rest.slice(idx2 + 1), 10),
  };
}

export interface GroupLevelOverride {
  level: number;
  setAt: Date;
}

/**
 * Computes the review state for every unique word group across all settings.
 *
 * A "group" is identified by (type:min:max). Settings for the same range on
 * different days are treated as separate review sessions of the same group.
 *
 * @param allSettings - flat array of all QuizSettings (across all dates)
 * @param intervals   - Ebbinghaus intervals in ms (from getIntervals())
 * @param overrides   - optional map of groupKey → manual level override
 */
export function computeGroupStates(
  allSettings: QuizSetting[],
  intervals: number[],
  overrides?: Record<string, GroupLevelOverride>,
): Map<string, DueGroup> {
  const now = Date.now();
  const result = new Map<string, DueGroup>();

  // Bucket settings by group key
  const byKey: Record<string, QuizSetting[]> = {};
  for (const s of allSettings) {
    const key = getGroupKey(s.type, s.min ?? 1, s.max ?? s.total);
    (byKey[key] ??= []).push(s);
  }

  for (const [key, settings] of Object.entries(byKey)) {
    const { type, min, max } = parseGroupKey(key);

    // Apply manual level override if present
    if (overrides && overrides[key]) {
      const { level, setAt } = overrides[key];
      const prevTime = setAt.getTime();
      const currentInterval = intervals[Math.min(level, intervals.length - 1)];
      const dueTime = prevTime + currentInterval;
      const graceEnd = dueTime + currentInterval * 0.5;
      let status: DueGroup['status'];
      if (now >= graceEnd) {
        status = 'FRESH';
      } else if (now >= dueTime) {
        status = 'DUE';
      } else {
        status = 'SCHEDULED';
      }
      result.set(key, {
        groupKey: key, type, min, max, status,
        reviewLevel: level,
        nextReviewTime: new Date(dueTime),
        lastCompletionTime: setAt,
      });
      continue;
    }

    // Most recent session (by timestamp)
    const sorted = [...settings].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    const mostRecent = sorted[0];
    // Use the actual quiz range size (max - min + 1) rather than the full list size
    // stored in `total`, so custom-range quizzes (e.g. words 51–100) can complete.
    const rangeSize = (mostRecent.max ?? mostRecent.total) - (mostRecent.min ?? 1) + 1;
    const isCurrentlyUnfinished = (mostRecent.finishedCount ?? 0) < rangeSize;

    // All sessions that were fully completed, sorted chronologically
    const completedTimes = settings
      .filter((s) => {
        const size = (s.max ?? s.total) - (s.min ?? 1) + 1;
        return s.latestFinishedTime && (s.finishedCount ?? 0) >= size;
      })
      .map((s) => new Date(s.latestFinishedTime!).getTime())
      .sort((a, b) => a - b);

    if (completedTimes.length === 0) {
      result.set(key, { groupKey: key, type, min, max, status: 'UNFINISHED', reviewLevel: 0 });
      continue;
    }

    // Walk the completion sequence to compute effective review level.
    // If a completion falls outside the grace window of the previous level,
    // the streak resets to 0.
    let level = 0;
    let prevTime = completedTimes[0];

    for (let i = 1; i < completedTimes.length; i++) {
      const interval = intervals[Math.min(level, intervals.length - 1)];
      const graceEnd = prevTime + interval + interval * 0.5; // due + 50% grace
      level = completedTimes[i] <= graceEnd ? Math.min(level + 1, intervals.length - 1) : 0;
      prevTime = completedTimes[i];
    }

    const lastCompletionTime = new Date(prevTime);
    const currentInterval = intervals[Math.min(level, intervals.length - 1)];
    const dueTime = prevTime + currentInterval;
    const graceEnd = dueTime + currentInterval * 0.5;

    let status: DueGroup['status'];
    if (isCurrentlyUnfinished) {
      status = 'UNFINISHED';
    } else if (now >= graceEnd) {
      status = 'FRESH'; // missed the window → reset progress
    } else if (now >= dueTime) {
      status = 'DUE';
    } else {
      status = 'SCHEDULED';
    }

    result.set(key, {
      groupKey: key,
      type,
      min,
      max,
      status,
      reviewLevel: level,
      nextReviewTime: new Date(dueTime),
      lastCompletionTime,
    });
  }

  return result;
}
