/**
 * Lightweight, fail-safe analytics tracker.
 *
 * Design goals (must never regress the app):
 *  - Every public call is wrapped so it can NEVER throw to the caller.
 *  - Events are buffered and flushed in the background — no awaited calls in UI paths.
 *  - On failure (network down, backend off) the buffer is simply dropped.
 *  - Identity is UUID-only: a member UUID (fed via setAnalyticsIdentity) or the
 *    guest's local `hw-guest-id`. No username/email is ever collected.
 *
 * Nothing here is imported by critical paths in a blocking way; if this whole module
 * failed to load, the app would keep working (callers just no-op).
 */
import { doPost, getCommonHeaders } from './api.service';
import { environment } from '../config/environment';

export type AnalyticsEventType = 'PAGE_VIEW' | 'BUTTON' | 'FEATURE';

interface AnalyticsEvent {
  userUuid: string | null;
  guest: boolean;
  sessionId: string;
  eventType: AnalyticsEventType;
  eventName: string;
  path: string;
  locale: string;
  device: string;
  referrer?: string;
  durationMs?: number;
}

const TRACK_URL = '/frontend-api/api/fe/analytics/track';
const FLUSH_INTERVAL_MS = 10_000;
const MAX_BUFFER = 20;
const SESSION_KEY = 'hw-analytics-session';

let identity: { uuid: string | null; guest: boolean } = { uuid: null, guest: true };
let buffer: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersAttached = false;

/**
 * Feed the current identity (call from AuthContext). Members pass their UUID with
 * guest=false; logged-out visitors pass (null, true).
 */
export function setAnalyticsIdentity(uuid: string | null, guest: boolean): void {
  try {
    identity = { uuid: uuid || null, guest };
  } catch {
    /* never throw */
  }
}

/** Record an event. Fire-and-forget; safe to call from anywhere. */
export function track(
  eventType: AnalyticsEventType,
  eventName: string,
  extra?: { path?: string; durationMs?: number; referrer?: string }
): void {
  try {
    if (!eventName) return;
    const guest = identity.guest || !identity.uuid;
    const userUuid = guest ? getGuestId() : identity.uuid;
    buffer.push({
      userUuid,
      guest,
      sessionId: getSessionId(),
      eventType,
      eventName: String(eventName).slice(0, 255),
      path: (extra?.path ?? window.location.pathname).slice(0, 512),
      locale: getLocale(),
      device: getDevice(),
      referrer: extra?.referrer,
      durationMs: extra?.durationMs,
    });
    attachLifecycleListeners();
    if (buffer.length >= MAX_BUFFER) {
      flush();
    } else {
      scheduleFlush();
    }
  } catch {
    /* analytics must never affect the app */
  }
}

/** Convenience wrapper for page-view events. */
export function trackPageView(path: string, durationMs?: number): void {
  track('PAGE_VIEW', path, {
    path,
    durationMs,
    referrer: getExternalReferrer(),
  });
}

// ── internals ────────────────────────────────────────────────────────────────

function scheduleFlush(): void {
  try {
    if (flushTimer) return;
    flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
  } catch {
    /* noop */
  }
}

/** Normal background flush via the shared axios path (full security headers). */
function flush(): void {
  try {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (buffer.length === 0) return;
    const events = buffer;
    buffer = [];
    // doPost already resolves to a safe response on error (never rejects), but guard anyway.
    Promise.resolve(doPost(TRACK_URL, { events })).catch(() => {
      /* drop on failure */
    });
  } catch {
    /* noop */
  }
}

/**
 * Best-effort flush on page hide. keepalive fetch survives unload and — unlike
 * navigator.sendBeacon — can carry our required security headers.
 */
function flushOnHide(): void {
  try {
    if (buffer.length === 0) return;
    const events = buffer;
    buffer = [];
    fetch(environment.backendBaseUrl + TRACK_URL, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', ...getCommonHeaders() },
      body: JSON.stringify({ events }),
    }).catch(() => {
      /* best effort */
    });
  } catch {
    /* noop */
  }
}

function attachLifecycleListeners(): void {
  try {
    if (listenersAttached || typeof window === 'undefined') return;
    listenersAttached = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushOnHide();
    });
    window.addEventListener('pagehide', flushOnHide);
  } catch {
    /* noop */
  }
}

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return 'nosession';
  }
}

/** Guest UUID: reuse the existing social guest id if present, else the session id. */
function getGuestId(): string {
  try {
    return localStorage.getItem('hw-guest-id') || getSessionId();
  } catch {
    return getSessionId();
  }
}

function getLocale(): string {
  try {
    return (
      localStorage.getItem('i18nextLng') ||
      document.documentElement.lang ||
      (navigator.language || 'en').slice(0, 5)
    );
  } catch {
    return 'en';
  }
}

function getDevice(): string {
  try {
    return window.innerWidth > 0 && window.innerWidth < 768 ? 'mobile' : 'desktop';
  } catch {
    return 'unknown';
  }
}

function getExternalReferrer(): string | undefined {
  try {
    const ref = document.referrer;
    if (ref && !ref.startsWith(window.location.origin)) return ref.slice(0, 512);
  } catch {
    /* noop */
  }
  return undefined;
}
