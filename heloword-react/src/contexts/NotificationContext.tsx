import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { doPost } from '../services/api.service';
import { DueGroup, QuizSetting } from '../models';
import { computeGroupStates, getIntervals, GroupLevelOverride } from '../utils/ebbinghaus';
import { computeGuestDueGroups, computeAllGuestGroupStates } from '../services/guestStorage.service';

interface NotificationContextType {
  /** Groups that are UNFINISHED, DUE, or FRESH — drives the orange badge. */
  dueGroups: DueGroup[];
  /** All group states including SCHEDULED — used by ReviewPage for status badges. */
  groupStates: Map<string, DueGroup>;
  /** Number of due/fresh/unfinished groups — used for the nav badge. */
  dueCount: number;
  /** Re-fetch quiz settings and recompute (logged-in users). */
  refresh: () => Promise<void>;
  /** Recompute from localStorage (guest users, call after finishing a quiz). */
  refreshGuest: () => void;
  /** Recompute statuses from cached data without an API call (cheap, safe to call on a timer). */
  recompute: () => void;
}

const NotificationContext = createContext<NotificationContextType>({
  dueGroups: [],
  groupStates: new Map(),
  dueCount: 0,
  refresh: async () => {},
  refreshGuest: () => {},
  recompute: () => {},
});

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoggedIn } = useAuth();
  const [dueGroups, setDueGroups]   = useState<DueGroup[]>([]);
  const [groupStates, setGroupStates] = useState<Map<string, DueGroup>>(new Map());
  const hasFetched = useRef(false);
  const cachedSettingsRef = useRef<QuizSetting[]>([]);
  const cachedOverridesRef = useRef<Record<string, GroupLevelOverride>>({});

  const applySettings = useCallback((settings: QuizSetting[], overrides?: Record<string, GroupLevelOverride>) => {
    cachedSettingsRef.current = settings;
    if (overrides) cachedOverridesRef.current = overrides;
    const states = computeGroupStates(settings, getIntervals(), overrides);
    setGroupStates(states);
    setDueGroups(
      Array.from(states.values()).filter(
        (g) => g.status === 'UNFINISHED' || g.status === 'DUE' || g.status === 'FRESH',
      ),
    );
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [settingsRes, overridesRes] = await Promise.all([
        doPost('/frontend-api/api/fe/quiz/get-quiz-settings'),
        doPost('/frontend-api/api/fe/quiz/get-group-overrides'),
      ]);
      if (settingsRes.code === '0000' && settingsRes.data) {
        const flat: QuizSetting[] = Object.values(
          settingsRes.data as Record<string, QuizSetting[]>,
        ).flat();
        const overrides: Record<string, GroupLevelOverride> = {};
        if (overridesRes.code === '0000' && Array.isArray(overridesRes.data)) {
          for (const o of overridesRes.data) {
            overrides[o.groupKey] = { level: o.levelOverride, setAt: new Date(o.setAt) };
          }
        }
        applySettings(flat, overrides);
      }
    } catch {
      // non-critical — silently ignore
    }
  }, [applySettings]);

  const refreshGuest = useCallback(() => {
    setGroupStates(computeAllGuestGroupStates());
    setDueGroups(computeGuestDueGroups());
  }, []);

  // Recompute statuses from cached data without an API call.
  // Safe to call on a timer — no network cost.
  const recompute = useCallback(() => {
    if (!isLoggedIn) {
      refreshGuest();
    } else if (cachedSettingsRef.current.length > 0) {
      applySettings(cachedSettingsRef.current, cachedOverridesRef.current);
    }
  }, [isLoggedIn, refreshGuest, applySettings]);

  useEffect(() => {
    if (isLoggedIn) {
      if (hasFetched.current) return;
      hasFetched.current = true;
      refresh();
    } else {
      refreshGuest();
    }
  }, [isLoggedIn, refresh, refreshGuest]);

  // Reset on logout
  useEffect(() => {
    if (!isLoggedIn) {
      hasFetched.current = false;
      refreshGuest();
    }
  }, [isLoggedIn, refreshGuest]);

  return (
    <NotificationContext.Provider value={{
      dueGroups,
      groupStates,
      dueCount: dueGroups.length,
      refresh,
      refreshGuest,
      recompute,
    }}>
      {children}
    </NotificationContext.Provider>
  );
};
