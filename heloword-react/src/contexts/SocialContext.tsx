import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import { environment } from '../config/environment';
import {
  ChatMessage,
  Friend,
  OnlineUser,
  acceptFriendRequest,
  computeRoomId,
  fetchFriends,
  fetchMessages,
  fetchUnreadCounts,
  getOrCreateGuestIdentity,
  markRoomRead,
  removeOnlineUser,
  rejectFriendRequest,
  removeFriend,
  sendChatMessage,
  sendFriendRequest,
  sendHeartbeat,
  updateFriendNickname,
} from '../services/social.service';

export interface MessageNotification {
  id: string;
  senderUserId: string;
  senderDisplayName: string;
  content: string;
  roomId: string;
  receivedAt: number;
}

interface SocialContextType {
  myUserId: string;
  myDisplayName: string;

  onlineUsers: OnlineUser[];
  friends: Friend[];
  unreadCounts: Record<string, number>;

  /** roomId → messages[] */
  messageMap: Record<string, ChatMessage[]>;

  activeChatUserId: string | null;
  openChat: (userId: string, displayName: string) => void;
  closeChat: () => void;

  sendMessage: (content: string) => Promise<void>;

  notifications: MessageNotification[];
  dismissNotification: (id: string) => void;

  doSendFriendRequest: (addresseeUsername: string) => Promise<void>;
  doAcceptFriendRequest: (id: number) => Promise<void>;
  doRejectFriendRequest: (id: number) => Promise<void>;
  doRemoveFriend: (id: number) => Promise<void>;
  doUpdateFriendNickname: (id: number, nickname: string) => Promise<void>;

  refreshFriends: () => Promise<void>;
}

const SocialContext = createContext<SocialContextType>({} as SocialContextType);

export const useSocial = () => useContext(SocialContext);

export const SocialProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoggedIn, user, hasCheckedLoginStatus } = useAuth();

  const [myUserId, setMyUserId] = useState('');
  const [myDisplayName, setMyDisplayName] = useState('');

  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [messageMap, setMessageMap] = useState<Record<string, ChatMessage[]>>({});
  const [activeChatUserId, setActiveChatUserId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<MessageNotification[]>([]);
  const activeChatUserIdRef = useRef<string | null>(null);
  // Stable ref so SSE closure can call the latest refreshFriends without recreation
  const refreshFriendsRef = useRef<() => void>(() => {});

  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const sseReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sseReconnectDelayRef = useRef<number>(1_000);
  const pollChatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMsgTimestampRef = useRef<number>(0);

  // ── Identity ────────────────────────────────────────────────────────────
  // Wait until auth is confirmed so we never send a ghost guest heartbeat
  // on behalf of a user who is actually logged in.

  useEffect(() => {
    if (!hasCheckedLoginStatus) return;
    if (isLoggedIn && user) {
      setMyUserId(user.username);
      setMyDisplayName(user.nickname || user.fullname || user.username);
    } else {
      const { userId, displayName } = getOrCreateGuestIdentity();
      setMyUserId(userId);
      setMyDisplayName(displayName);
    }
  }, [hasCheckedLoginStatus, isLoggedIn, user]);

  // ── SSE subscription (per-user: online-users + new-message events) ──────

  const connectSse = useCallback((userId: string) => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }

    const url = `${environment.backendBaseUrl}/frontend-api/api/fe/social/stream/${encodeURIComponent(userId)}`;
    const es = new EventSource(url, { withCredentials: true });

    es.addEventListener('online-users', (e: MessageEvent) => {
      try {
        const users: OnlineUser[] = JSON.parse(e.data);
        setOnlineUsers(users);
        sseReconnectDelayRef.current = 1_000;
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener('new-message', (e: MessageEvent) => {
      try {
        const msg: ChatMessage = JSON.parse(e.data);
        const roomId = msg.roomId;

        // Append to message map so active chat auto-updates
        setMessageMap((prev) => {
          const existing = prev[roomId] ?? [];
          if (existing.some((m) => m.id === msg.id)) return prev;
          const updated = [...existing, msg].sort(
            (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
          );
          return { ...prev, [roomId]: updated };
        });

        // If chat with this sender is not open: increment badge + show toast
        if (activeChatUserIdRef.current !== msg.senderUserId) {
          setUnreadCounts((prev) => ({
            ...prev,
            [msg.senderUserId]: (prev[msg.senderUserId] ?? 0) + 1,
          }));
          const notif: MessageNotification = {
            id: `${msg.id}-${Date.now()}`,
            senderUserId: msg.senderUserId,
            senderDisplayName: msg.senderDisplayName,
            content: msg.content,
            roomId,
            receivedAt: Date.now(),
          };
          setNotifications((prev) => [...prev, notif]);
        }
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener('new-friend-request', () => {
      refreshFriendsRef.current();
    });

    es.onerror = () => {
      es.close();
      sseRef.current = null;
      const delay = sseReconnectDelayRef.current;
      sseReconnectDelayRef.current = Math.min(delay * 2, 30_000);
      sseReconnectRef.current = setTimeout(() => connectSse(userId), delay);
    };

    sseRef.current = es;
  }, []);

  // ── Heartbeat + SSE connect when identity is ready ───────────────────────

  const prevUserIdRef = useRef<string>('');

  useEffect(() => {
    if (!myUserId) return;

    const isGuest = !isLoggedIn;

    // If identity changed (guest UUID → real username on login, or vice versa),
    // explicitly remove the old entry so it doesn't linger for 90 s.
    if (prevUserIdRef.current && prevUserIdRef.current !== myUserId) {
      removeOnlineUser(prevUserIdRef.current).catch(() => {});
    }
    prevUserIdRef.current = myUserId;

    // Clear any pending reconnect from a previous identity
    if (sseReconnectRef.current) clearTimeout(sseReconnectRef.current);
    sseReconnectDelayRef.current = 1_000;

    // Heartbeat keeps this user's entry alive in Redis and triggers SSE broadcasts
    const beat = () => sendHeartbeat(myUserId, myDisplayName, isGuest).catch(() => {});
    beat();
    heartbeatRef.current = setInterval(beat, 30_000);

    // Subscribe via SSE for real-time online list + targeted message notifications
    connectSse(myUserId);

    // Logged-in extras
    if (isLoggedIn) {
      fetchFriends().then(setFriends).catch(() => {});
      fetchUnreadCounts(myUserId).then(setUnreadCounts).catch(() => {});
    }

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (sseReconnectRef.current) clearTimeout(sseReconnectRef.current);
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, [myUserId, myDisplayName, isLoggedIn, connectSse]);

  // ── Chat polling ────────────────────────────────────────────────────────

  useEffect(() => {
    if (pollChatRef.current) clearInterval(pollChatRef.current);
    if (!activeChatUserId || !myUserId) return;

    const roomId = computeRoomId(myUserId, activeChatUserId);

    const pollMessages = () => {
      fetchMessages(roomId, lastMsgTimestampRef.current || undefined).then((msgs) => {
        if (msgs.length > 0) {
          setMessageMap((prev) => {
            const existing = prev[roomId] ?? [];
            const existingIds = new Set(existing.map((m) => m.id));
            const newMsgs = msgs.filter((m) => !existingIds.has(m.id));
            if (newMsgs.length === 0) return prev;
            const updated = [...existing, ...newMsgs].sort(
              (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
            );
            lastMsgTimestampRef.current = new Date(updated[updated.length - 1].sentAt).getTime();
            return { ...prev, [roomId]: updated };
          });
          markRoomRead(roomId, myUserId).catch(() => {});
        }
      }).catch(() => {});
    };

    // Load full history on open
    fetchMessages(roomId).then((msgs) => {
      setMessageMap((prev) => ({ ...prev, [roomId]: msgs }));
      if (msgs.length > 0) {
        lastMsgTimestampRef.current = new Date(msgs[msgs.length - 1].sentAt).getTime();
      }
      markRoomRead(roomId, myUserId).catch(() => {});
    }).catch(() => {});

    pollChatRef.current = setInterval(pollMessages, 5_000);
    return () => {
      if (pollChatRef.current) clearInterval(pollChatRef.current);
    };
  }, [activeChatUserId, myUserId]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const openChat = useCallback((userId: string, _displayName: string) => {
    lastMsgTimestampRef.current = 0;
    activeChatUserIdRef.current = userId;
    setActiveChatUserId(userId);
    // Clear unread badge for this sender
    setUnreadCounts((prev) => {
      if (!prev[userId]) return prev;
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    // Dismiss any pending notifications from this user
    setNotifications((prev) => prev.filter((n) => n.senderUserId !== userId));
  }, []);

  const closeChat = useCallback(() => {
    activeChatUserIdRef.current = null;
    setActiveChatUserId(null);
    lastMsgTimestampRef.current = 0;
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!activeChatUserId || !myUserId || !content.trim()) return;
    const roomId = computeRoomId(myUserId, activeChatUserId);
    const msg = await sendChatMessage(myUserId, myDisplayName, activeChatUserId, content.trim());
    if (msg) {
      setMessageMap((prev) => {
        const existing = prev[roomId] ?? [];
        return { ...prev, [roomId]: [...existing, msg] };
      });
    }
  }, [activeChatUserId, myUserId, myDisplayName]);

  const refreshFriends = useCallback(async () => {
    if (!isLoggedIn) return;
    const f = await fetchFriends().catch(() => [] as Friend[]);
    setFriends(f);
  }, [isLoggedIn]);

  // Keep ref up to date so SSE closure can always call the latest version
  refreshFriendsRef.current = refreshFriends;

  const doSendFriendRequest = useCallback(async (addresseeUsername: string) => {
    await sendFriendRequest(addresseeUsername);
    await refreshFriends();
  }, [refreshFriends]);

  const doAcceptFriendRequest = useCallback(async (id: number) => {
    await acceptFriendRequest(id);
    await refreshFriends();
  }, [refreshFriends]);

  const doRejectFriendRequest = useCallback(async (id: number) => {
    await rejectFriendRequest(id);
    await refreshFriends();
  }, [refreshFriends]);

  const doRemoveFriend = useCallback(async (id: number) => {
    await removeFriend(id);
    await refreshFriends();
  }, [refreshFriends]);

  const doUpdateFriendNickname = useCallback(async (id: number, nickname: string) => {
    await updateFriendNickname(id, nickname);
    await refreshFriends();
  }, [refreshFriends]);

  return (
    <SocialContext.Provider
      value={{
        myUserId,
        myDisplayName,
        onlineUsers,
        friends,
        unreadCounts,
        messageMap,
        activeChatUserId,
        openChat,
        closeChat,
        sendMessage,
        notifications,
        dismissNotification,
        doSendFriendRequest,
        doAcceptFriendRequest,
        doRejectFriendRequest,
        doRemoveFriend,
        doUpdateFriendNickname,
        refreshFriends,
      }}
    >
      {children}
    </SocialContext.Provider>
  );
};
