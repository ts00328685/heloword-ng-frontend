import { DueGroup, DueWord, QuizSetting } from '../models';
import { computeGroupStates, getIntervals, GroupLevelOverride } from '../utils/ebbinghaus';

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

const SETTINGS_KEY  = 'hw-guest-settings';
const RECORDS_KEY   = 'hw-guest-records';
const OVERRIDES_KEY = 'hw-group-level-overrides';

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
 * Converts guest settings + records into QuizSetting[] shape so that the shared
 * computeGroupStates() function can be used for both logged-in and guest users.
 */
export function guestSettingsToQuizSettings(): QuizSetting[] {
  const settings = getGuestSettings();
  const records  = getGuestRecords();

  return settings.map((s): QuizSetting => {
    const settingRecords = records.filter((r) => r.settingId === s.id && r.wrongCount === 0);
    const finishedCount = new Set(settingRecords.map((r) => r.answerId)).size;

    const latestRecord = settingRecords
      .slice()
      .sort((a, b) => new Date(b.finishedTime).getTime() - new Date(a.finishedTime).getTime())[0];

    return {
      id: undefined,
      timestamp: new Date(s.timestamp),
      latestFinishedTime: latestRecord ? new Date(latestRecord.finishedTime) : undefined,
      min: s.min,
      max: s.max,
      type: s.type,
      tableName: s.tableName,
      total: s.total,
      isSelected: true,
      finishedCount,
    };
  });
}

/**
 * Computes which groups are due for review using the Ebbinghaus forgetting curve.
 * Returns only groups with status UNFINISHED, DUE, or FRESH.
 */
export function computeGuestDueGroups(): DueGroup[] {
  const quizSettings = guestSettingsToQuizSettings();
  if (quizSettings.length === 0) return [];

  const states = computeGroupStates(quizSettings, getIntervals(), getGuestGroupOverrides());
  return Array.from(states.values()).filter(
    (g) => g.status === 'UNFINISHED' || g.status === 'DUE' || g.status === 'FRESH',
  );
}

/**
 * Returns all group states (including SCHEDULED) for guest users.
 * Used by ReviewPage to show status badges on all groups.
 */
export function computeAllGuestGroupStates(): Map<string, DueGroup> {
  const quizSettings = guestSettingsToQuizSettings();
  if (quizSettings.length === 0) return new Map();
  return computeGroupStates(quizSettings, getIntervals(), getGuestGroupOverrides());
}

/**
 * @deprecated — per-word due list kept for any legacy code paths.
 * Prefer computeGuestDueGroups() for the group-based notification system.
 */
export function computeGuestDueWords(): DueWord[] {
  return []; // replaced by group-based system
}

// ─── Group Level Overrides (guest) ──────────────────────────────────────────

export function getGuestGroupOverrides(): Record<string, GroupLevelOverride> {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, { level: number; setAt: string }>;
    const result: Record<string, GroupLevelOverride> = {};
    for (const [k, v] of Object.entries(parsed)) {
      result[k] = { level: v.level, setAt: new Date(v.setAt) };
    }
    return result;
  } catch {
    return {};
  }
}

export function saveGuestGroupOverride(groupKey: string, level: number): void {
  const overrides = getGuestGroupOverrides();
  overrides[groupKey] = { level, setAt: new Date() };
  try {
    const serializable = Object.fromEntries(
      Object.entries(overrides).map(([k, v]) => [k, { level: v.level, setAt: v.setAt.toISOString() }]),
    );
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(serializable));
  } catch {}
}

export function deleteGuestGroupOverride(groupKey: string): void {
  const overrides = getGuestGroupOverrides();
  delete overrides[groupKey];
  try {
    const serializable = Object.fromEntries(
      Object.entries(overrides).map(([k, v]) => [k, { level: v.level, setAt: v.setAt.toISOString() }]),
    );
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(serializable));
  } catch {}
}

// ─── Delete Group (guest) ───────────────────────────────────────────────────

export function deleteGuestGroup(type: string, min: number, max: number): void {
  const settings = getGuestSettings();
  const records  = getGuestRecords();
  const toDelete = settings.filter((s) => s.type === type && s.min === min && s.max === max);
  const deleteIds = new Set(toDelete.map((s) => s.id));
  writeJson(SETTINGS_KEY, settings.filter((s) => !deleteIds.has(s.id)));
  writeJson(RECORDS_KEY, records.filter((r) => !deleteIds.has(r.settingId)));
  const groupKey = `${type}:${min}:${max}`;
  deleteGuestGroupOverride(groupKey);
}

export { generateId };
