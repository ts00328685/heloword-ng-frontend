import { DueWord } from '../models';

export interface GuestSetting {
  id: string;
  timestamp: string;   // ISO date — used to group sessions
  type: string;        // 'wordEnglishList', etc.
  tableName: string;
  min: number;
  max: number;
  total: number;
}

export interface GuestRecord {
  id: string;
  settingId: string;   // references GuestSetting.id
  answerId: number;
  answerTableName: string;
  timeSpent: number;   // seconds
  finishedTime: string; // ISO date
  wrongCount: number;
  quizIndex: number;
}

const SETTINGS_KEY = 'hw-guest-settings';
const RECORDS_KEY  = 'hw-guest-records';

// Ebbinghaus intervals in milliseconds — mirrors backend NotificationServiceImpl
const INTERVAL_MS = [
  86_400_000,    // 1 day
  86_400_000,    // 1 day
  259_200_000,   // 3 days
  604_800_000,   // 7 days
  1_209_600_000, // 14 days
  2_592_000_000, // 30 days
  7_776_000_000, // 90 days
];

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function readJson<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function writeJson<T>(key: string, data: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Silently ignore quota errors
  }
}

// ─── Settings ───────────────────────────────────────────────────────────────

export function getGuestSettings(): GuestSetting[] {
  return readJson<GuestSetting>(SETTINGS_KEY);
}

export function saveGuestSetting(setting: GuestSetting): void {
  const existing = getGuestSettings();
  writeJson(SETTINGS_KEY, [...existing, setting]);
}

// ─── Records ────────────────────────────────────────────────────────────────

export function getGuestRecords(): GuestRecord[] {
  return readJson<GuestRecord>(RECORDS_KEY);
}

export function saveGuestRecord(record: GuestRecord): void {
  const existing = getGuestRecords();
  writeJson(RECORDS_KEY, [...existing, record]);
}

// ─── Business Logic ─────────────────────────────────────────────────────────

/**
 * Returns answerId list for words answered correctly (wrongCount === 0)
 * within a given setting. Used by ReviewPage to build finishedIdMap.
 */
export function getFinishedIdsBySetting(settingId: string): number[] {
  return getGuestRecords()
    .filter((r) => r.settingId === settingId && r.wrongCount === 0)
    .map((r) => r.answerId);
}

/**
 * Computes which words are due for review using the Ebbinghaus forgetting curve.
 * Mirrors backend NotificationServiceImpl.getDueForReview().
 */
export function computeGuestDueWords(): DueWord[] {
  const records = getGuestRecords();
  if (records.length === 0) return [];

  const now = Date.now();

  // Group by answerId + answerTableName
  const groups: Record<string, GuestRecord[]> = {};
  for (const r of records) {
    const key = `${r.answerId}|${r.answerTableName}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }

  const due: DueWord[] = [];

  for (const wordRecords of Object.values(groups)) {
    const sorted = [...wordRecords].sort(
      (a, b) => new Date(b.finishedTime).getTime() - new Date(a.finishedTime).getTime()
    );

    const lastReviewTime = sorted[0].finishedTime;
    const lastReviewMs   = new Date(lastReviewTime).getTime();
    const reviewCount    = wordRecords.length;
    const correctCount   = wordRecords.filter((r) => r.wrongCount === 0).length;

    const intervalIndex  = Math.min(correctCount, INTERVAL_MS.length - 1);
    const nextReviewMs   = lastReviewMs + INTERVAL_MS[intervalIndex];

    if (nextReviewMs > now) continue; // Not due yet

    const sample = sorted[0];
    due.push({
      answerId:        sample.answerId,
      answerTableName: sample.answerTableName,
      lastReviewTime,
      nextReviewTime:  new Date(nextReviewMs).toISOString(),
      reviewCount,
      correctCount,
    });
  }

  return due;
}

export { generateId };
