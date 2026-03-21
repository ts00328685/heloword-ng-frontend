import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { doPost } from '../services/api.service';
import { DueWord } from '../models';

interface NotificationContextType {
  dueWords: DueWord[];
  dueCount: number;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>({
  dueWords: [],
  dueCount: 0,
  refresh: async () => {},
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

  useEffect(() => {
    if (!isLoggedIn || hasFetched.current) return;
    hasFetched.current = true;
    refresh();
  }, [isLoggedIn, refresh]);

  // Reset when user logs out
  useEffect(() => {
    if (!isLoggedIn) {
      setDueWords([]);
      hasFetched.current = false;
    }
  }, [isLoggedIn]);

  return (
    <NotificationContext.Provider value={{ dueWords, dueCount: dueWords.length, refresh }}>
      {children}
    </NotificationContext.Provider>
  );
};
