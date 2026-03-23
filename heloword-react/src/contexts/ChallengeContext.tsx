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

interface ChallengeContextType {
  rooms: ChallengeRoom[];
  currentRoom: ChallengeRoom | null;
  lastEvent: ChallengeEvent | null;
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

  // Derive userId/displayName from auth or localStorage guest identity
  const myUserId: string = (() => {
    if (isLoggedIn && user) return user.username;
    return localStorage.getItem('hw-guest-id') || `guest-${Date.now()}`;
  })();
  const myDisplayName: string = (() => {
    if (isLoggedIn && user) return user.nickname || user.fullname || user.username;
    const id = localStorage.getItem('hw-guest-id') || '';
    const shortId = id.replace(/-/g, '').slice(-4).toUpperCase();
    return localStorage.getItem('hw-guest-name') || `Guest-${shortId}`;
  })();
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
      setLastEvent(null);
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

  const startGameAction = useCallback(async () => {
    if (!currentRoom) return;
    await startGame(currentRoom.id, myUserId);
  }, [currentRoom, myUserId]);

  const submitAnswer = useCallback((answer: string, questionId: string) => {
    if (!currentRoom || !stompClientRef.current?.active) return;
    stompClientRef.current.publish({
      destination: `/app/challenge/room/${currentRoom.id}/answer`,
      body: JSON.stringify({ userId: myUserId, displayName: myDisplayName, guest: isGuest, answer, questionId }),
    });
  }, [currentRoom, myUserId, myDisplayName, isGuest]);

  return (
    <ChallengeContext.Provider value={{
      rooms, currentRoom, lastEvent,
      joinRoomAction, leaveRoomAction, startGameAction, submitAnswer,
    }}>
      {children}
    </ChallengeContext.Provider>
  );
};
