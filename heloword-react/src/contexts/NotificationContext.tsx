import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { doPost } from '../services/api.service';
import { DueWord } from '../models';
import { computeGuestDueWords } from '../services/guestStorage.service';

interface NotificationContextType {
  dueWords: DueWord[];
  dueCount: number;
  refresh: () => Promise<void>;
  refreshGuest: () => void;
}

const NotificationContext = createContext<NotificationContextType>({
  dueWords: [],
  dueCount: 0,
  refresh: async () => {},
  refreshGuest: () => {},
});

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoggedIn } = useAuth();
  const [dueWords, setDueWords] = useState<DueWord[]>([]);
  const hasFetched = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const response = await doPost('/frontend-api/api/fe/notifications/due-for-review');
      if (response.code === '0000') {
        setDueWords(response.data || []);
      }
    } catch {
      // silently ignore — notifications are non-critical
    }
  }, []);

  const refreshGuest = useCallback(() => {
    setDueWords(computeGuestDueWords());
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      if (hasFetched.current) return;
      hasFetched.current = true;
      refresh();
    } else {
      // Compute due words from localStorage for guest users
      setDueWords(computeGuestDueWords());
    }
  }, [isLoggedIn, refresh]);

  // Reset server-side state when user logs out; recompute guest due words
  useEffect(() => {
    if (!isLoggedIn) {
      hasFetched.current = false;
      setDueWords(computeGuestDueWords());
    }
  }, [isLoggedIn]);

  return (
    <NotificationContext.Provider value={{ dueWords, dueCount: dueWords.length, refresh, refreshGuest }}>
      {children}
    </NotificationContext.Provider>
  );
};
