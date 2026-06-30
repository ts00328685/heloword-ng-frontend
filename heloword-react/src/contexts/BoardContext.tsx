import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import { LiveBoardSession, fetchActiveSession } from '../services/board.service';

interface BoardContextType {
  /** The single currently-live session, or null when nothing is live. */
  activeSession: LiveBoardSession | null;
  /** Re-fetch the active session from the backend. */
  refreshActive: () => Promise<void>;
  /** Apply a session-state update learned from a WebSocket broadcast. */
  applyActiveBroadcast: (session: LiveBoardSession | null) => void;
}

const BoardContext = createContext<BoardContextType>({} as BoardContextType);

export const useBoard = () => useContext(BoardContext);

const POLL_INTERVAL_MS = 30_000;

export const BoardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { hasCheckedLoginStatus } = useAuth();
  const [activeSession, setActiveSession] = useState<LiveBoardSession | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshActive = useCallback(async () => {
    const session = await fetchActiveSession();
    setActiveSession(session && session.boardState === 'ACTIVE' ? session : null);
  }, []);

  // Apply a /topic/board/active broadcast: ACTIVE → set; ENDED → clear if it matches.
  const applyActiveBroadcast = useCallback((session: LiveBoardSession | null) => {
    if (!session) {
      setActiveSession(null);
      return;
    }
    if (session.boardState === 'ACTIVE') {
      setActiveSession(session);
    } else {
      setActiveSession((prev) => (prev && prev.id === session.id ? null : prev));
    }
  }, []);

  useEffect(() => {
    if (!hasCheckedLoginStatus) return;
    refreshActive();
    pollRef.current = setInterval(refreshActive, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [hasCheckedLoginStatus, refreshActive]);

  return (
    <BoardContext.Provider value={{ activeSession, refreshActive, applyActiveBroadcast }}>
      {children}
    </BoardContext.Provider>
  );
};
