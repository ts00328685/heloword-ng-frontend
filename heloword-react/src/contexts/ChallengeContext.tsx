import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import {
  ChallengeEvent,
  ChallengeRoom,
  fetchRooms,
  joinRoom,
  leaveRoom,
  startGame,
} from '../services/challenge.service';
import { getOrCreateGuestIdentity } from '../services/social.service';

const IDLE_KICK_MS = 5 * 60 * 1000;   // 5 minutes → auto-leave
const IDLE_WARN_MS = 4.5 * 60 * 1000; // 4 min 30 s → show warning banner

interface ChallengeContextType {
  rooms: ChallengeRoom[];
  currentRoom: ChallengeRoom | null;
  lastEvent: ChallengeEvent | null;
  idleWarning: boolean;
  joinRoomAction: (roomId: string) => Promise<void>;
  leaveRoomAction: () => Promise<void>;
  startGameAction: () => Promise<void>;
  submitAnswer: (answer: string, questionId: string) => void;
}

const ChallengeContext = createContext<ChallengeContextType>({} as ChallengeContextType);

export const useChallenge = () => useContext(ChallengeContext);

export const ChallengeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoggedIn, user } = useAuth();
  const [rooms, setRooms] = useState<ChallengeRoom[]>([]);
  const [currentRoom, setCurrentRoom] = useState<ChallengeRoom | null>(null);
  const [lastEvent, setLastEvent] = useState<ChallengeEvent | null>(null);

  // We reuse the same STOMP client from window — but here we build a lightweight
  // subscription manager using the SocialContext's ws client via a separate approach.
  // Instead, use a dedicated STOMP Client for challenge subscriptions.
  const stompClientRef = useRef<any>(null);
  const currentRoomRef = useRef<string | null>(null);

  // ── Idle-kick ──────────────────────────────────────────────────────────────
  const lastActivityRef = useRef<number>(Date.now());
  const idleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [idleWarning, setIdleWarning] = useState(false);
  // Keep a stable ref to leaveRoomAction so the interval always calls the
  // latest version without needing to be in its dependency array.
  const leaveRoomRef = useRef<() => Promise<void>>(async () => {});

  // Derive userId/displayName from auth or a stable guest identity.
  // getOrCreateGuestIdentity() ensures hw-guest-id is always written to localStorage
  // before we read it, so the display name is never "Guest-" with an empty suffix.
  const guestIdentity = isLoggedIn ? null : getOrCreateGuestIdentity();
  const myUserId: string = isLoggedIn && user ? user.username : (guestIdentity?.userId ?? `guest-${Date.now()}`);
  const myDisplayName: string = isLoggedIn && user
    ? (user.nickname || user.fullname || user.username)
    : (guestIdentity?.displayName ?? 'Guest');
  const isGuest = !isLoggedIn;

  // Connect STOMP and subscribe to room list
  useEffect(() => {
    if (stompClientRef.current?.active) return;

    import('@stomp/stompjs').then(({ Client }) => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsBasePath = import.meta.env.PROD ? '/k8s/frontend-api/v1' : '/k8s/frontend-api/api';
      const wsUrl = `${proto}://${window.location.host}${wsBasePath}/fe/ws`;

      const client = new Client({
        brokerURL: wsUrl,
        reconnectDelay: 5000,
        onConnect: () => {
          client.subscribe('/topic/challenge/rooms', (frame) => {
            try {
              setRooms(JSON.parse(frame.body));
            } catch {}
          });
          // Resubscribe to current room if any
          if (currentRoomRef.current) {
            subscribeToRoom(client, currentRoomRef.current);
          }
          // Fetch initial room list via REST
          fetchRooms().then(setRooms).catch(() => {});
        },
      });
      client.activate();
      stompClientRef.current = client;
    });

    return () => {
      stompClientRef.current?.deactivate();
      stompClientRef.current = null;
    };
  }, []);

  const subscribeToRoom = (client: any, roomId: string) => {
    client.subscribe(`/topic/challenge/room/${roomId}`, (frame: any) => {
      try {
        const event: ChallengeEvent = JSON.parse(frame.body);
        setLastEvent(event);
        if (event.room) setCurrentRoom(event.room);
        if (event.type === 'ROUND_WIN' || event.type === 'QUESTION_TIMEOUT' || event.type === 'WRONG_ANSWER') {
          // Update current room scores from event
          setCurrentRoom(prev => {
            if (!prev || !event.scores) return prev;
            return {
              ...prev,
              players: prev.players.map(p => ({
                ...p,
                score: event.scores![p.userId] ?? p.score,
              })).sort((a, b) => b.score - a.score),
            };
          });
        }
      } catch {}
    });
  };

  const joinRoomAction = useCallback(async (roomId: string) => {
    const room = await joinRoom(roomId, myUserId, myDisplayName, isGuest);
    if (room) {
      setCurrentRoom(room);
      currentRoomRef.current = roomId;
      // If the game is already in progress, synthesize a QUESTION event from the
      // room state so the late joiner sees the current word without waiting for
      // the next round.  If the backend doesn't include currentQuestion the event
      // is omitted and the player sees "Get ready…" until the next round starts.
      if (room.status === 'PLAYING' && room.currentQuestion) {
        setLastEvent({
          type: 'QUESTION',
          question: room.currentQuestion,
          questionId: room.currentQuestionId,
          hint: room.currentHint,
          timeoutSeconds: room.remainingSeconds ?? 15,
          choices: room.currentChoices,
        });
      } else {
        setLastEvent(null);
      }
      if (stompClientRef.current?.active) {
        subscribeToRoom(stompClientRef.current, roomId);
      }
    }
  }, [myUserId, myDisplayName, isGuest]);

  const leaveRoomAction = useCallback(async () => {
    if (!currentRoom) return;
    await leaveRoom(currentRoom.id, myUserId).catch(() => {});
    setCurrentRoom(null);
    currentRoomRef.current = null;
    setLastEvent(null);
  }, [currentRoom, myUserId]);

  // Keep the ref in sync so the idle interval always calls the latest version.
  useEffect(() => { leaveRoomRef.current = leaveRoomAction; }, [leaveRoomAction]);

  // Start idle tracking while in a room; tear it down on leave.
  useEffect(() => {
    if (!currentRoom) {
      if (idleIntervalRef.current) clearInterval(idleIntervalRef.current);
      idleIntervalRef.current = null;
      setIdleWarning(false);
      return;
    }

    // Reset the clock when entering a room.
    lastActivityRef.current = Date.now();
    setIdleWarning(false);

    // Any user interaction counts as activity.
    const onActivity = () => {
      lastActivityRef.current = Date.now();
      setIdleWarning(false);
    };
    document.addEventListener('pointerdown', onActivity, { passive: true });
    document.addEventListener('keydown',     onActivity, { passive: true });
    document.addEventListener('touchstart',  onActivity, { passive: true });

    // Check every 10 seconds.
    idleIntervalRef.current = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= IDLE_KICK_MS) {
        leaveRoomRef.current();
      } else if (idle >= IDLE_WARN_MS) {
        setIdleWarning(true);
      }
    }, 10_000);

    return () => {
      document.removeEventListener('pointerdown', onActivity);
      document.removeEventListener('keydown',     onActivity);
      document.removeEventListener('touchstart',  onActivity);
      if (idleIntervalRef.current) clearInterval(idleIntervalRef.current);
      idleIntervalRef.current = null;
    };
  }, [currentRoom?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const startGameAction = useCallback(async () => {
    if (!currentRoom) return;
    await startGame(currentRoom.id, myUserId);
  }, [currentRoom, myUserId]);

  const submitAnswer = useCallback((answer: string, questionId: string) => {
    if (!currentRoom || !stompClientRef.current?.active) return;
    // Submitting an answer is explicit activity — reset the idle clock.
    lastActivityRef.current = Date.now();
    setIdleWarning(false);
    stompClientRef.current.publish({
      destination: `/app/challenge/room/${currentRoom.id}/answer`,
      body: JSON.stringify({ userId: myUserId, displayName: myDisplayName, guest: isGuest, answer, questionId }),
    });
  }, [currentRoom, myUserId, myDisplayName, isGuest]);

  return (
    <ChallengeContext.Provider value={{
      rooms, currentRoom, lastEvent, idleWarning,
      joinRoomAction, leaveRoomAction, startGameAction, submitAnswer,
    }}>
      {children}
    </ChallengeContext.Provider>
  );
};
