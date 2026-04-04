import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Client } from '@stomp/stompjs';
import { useAuth } from './AuthContext';
import { environment } from '../config/environment';
import {
  VocabShareRequest,
  fetchVocabShareInbox,
  acceptVocabShare,
  rejectVocabShare,
} from '../services/vocabShare.service';
import {
  ChatMessage,
  Friend,
  OnlineUser,
  acceptFriendRequest,
  computeRoomId,
  fetchChatRooms,
  fetchFriends,
  fetchMessages,
  fetchOnlineUsers,
  fetchUnreadCounts,
  getOrCreateGuestIdentity,
  markRoomRead,
  removeOnlineUser,
  removeOnlineUserBeacon,
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

  mutedUserIds: Set<string>;
  muteUser: (userId: string) => void;
  unmuteUser: (userId: string) => void;

  hideOnlineStatus: boolean;
  setHideOnlineStatus: (hide: boolean) => void;

  /** roomId → messages[] */
  messageMap: Record<string, ChatMessage[]>;

  /** Latest message per room, sorted by most recent */
  chatRooms: ChatMessage[];
  loadChatRooms: () => Promise<void>;

  activeChatUserId: string | null;
  openChat: (userId: string, displayName: string) => void;
  closeChat: () => void;

  sendMessage: (content: string) => Promise<void>;

  notifications: MessageNotification[];
  dismissNotification: (id: string) => void;

  doSendFriendRequest: (addresseeUsername: string) => Promise<void>;
  doAcceptFriendRequest: (id: number) => Promise<void>;
  vocabShares: VocabShareRequest[];
  doAcceptVocabShare: (id: number) => Promise<void>;
  doRejectVocabShare: (id: number) => Promise<void>;
  refreshVocabShares: () => Promise<void>;
  doRejectFriendRequest: (id: number) => Promise<void>;
  doRemoveFriend: (id: number) => Promise<void>;
  doUpdateFriendNickname: (id: number, nickname: string) => Promise<void>;

  refreshFriends: () => Promise<void>;
  setGuestName: (name: string) => void;
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
  const [chatRooms, setChatRooms] = useState<ChatMessage[]>([]);
  const [activeChatUserId, setActiveChatUserId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<MessageNotification[]>([]);
  const [mutedUserIds, setMutedUserIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('hw-muted-users');
      return stored ? new Set<string>(JSON.parse(stored)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  const [hideOnlineStatus, setHideOnlineStatusState] = useState<boolean>(
    () => localStorage.getItem('hw-hide-online') === 'true'
  );
  const hideOnlineStatusRef = useRef(hideOnlineStatus);
  hideOnlineStatusRef.current = hideOnlineStatus;
  const activeChatUserIdRef = useRef<string | null>(null);
  const mutedUserIdsRef = useRef<Set<string>>(mutedUserIds);
  mutedUserIdsRef.current = mutedUserIds;
  const refreshFriendsRef = useRef<() => void>(() => {});
  const [vocabShares, setVocabShares] = useState<VocabShareRequest[]>([]);
  const refreshVocabSharesRef = useRef<() => Promise<void>>(async () => {});

  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsClientRef = useRef<Client | null>(null);
  const pollChatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMsgTimestampRef = useRef<number>(0);

  // ── Identity ────────────────────────────────────────────────────────────

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

  // ── WebSocket (STOMP) connection ─────────────────────────────────────────

  const connectWebSocket = useCallback((userId: string) => {
    if (wsClientRef.current?.active) {
      wsClientRef.current.deactivate();
    }

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    // Prod: direct ingress to frontend-api (bypasses gateway — WS upgrade can't carry cv header)
    // Dev:  Vite proxy rule for /k8s/frontend-api/api/fe/ws routes directly to localhost:7001
    const wsBasePath = environment.production ? '/k8s/frontend-api/v1' : '/k8s/frontend-api/api';
    const wsUrl = `${proto}://${window.location.host}${wsBasePath}/fe/ws`;

    const client = new Client({
      brokerURL: wsUrl,
      reconnectDelay: 5000,
      onConnect: () => {
        // Fetch current list immediately so the UI isn't empty until next heartbeat
        fetchOnlineUsers().then(setOnlineUsers).catch(() => {});

        // Online users broadcast
        client.subscribe('/topic/online-users', (frame) => {
          try {
            const users: OnlineUser[] = JSON.parse(frame.body);
            setOnlineUsers(users);
          } catch {
            // ignore parse errors
          }
        });

        // Per-user: incoming chat messages
        client.subscribe(`/topic/social/${userId}/messages`, (frame) => {
          try {
            const msg: ChatMessage = JSON.parse(frame.body);
            const roomId = msg.roomId;

            setMessageMap((prev) => {
              const existing = prev[roomId] ?? [];
              if (existing.some((m) => m.id === msg.id)) return prev;
              const updated = [...existing, msg].sort(
                (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
              );
              return { ...prev, [roomId]: updated };
            });

            if (activeChatUserIdRef.current !== msg.senderUserId) {
              const isMuted = mutedUserIdsRef.current.has(msg.senderUserId);
              if (!isMuted) {
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
            }
          } catch {
            // ignore parse errors
          }
        });

        // Per-user: incoming friend requests
        client.subscribe(`/topic/social/${userId}/friend-requests`, () => {
          refreshFriendsRef.current();
        });

        client.subscribe(`/topic/social/${userId}/vocab-share`, () => {
          refreshVocabSharesRef.current();
        });
      },
      onStompError: (frame) => {
        console.warn('STOMP error', frame.headers['message']);
      },
    });

    client.activate();
    wsClientRef.current = client;
  }, []);

  // ── Heartbeat + WebSocket connect when identity is ready ──────────────────

  const prevUserIdRef = useRef<string>('');

  useEffect(() => {
    if (!myUserId) return;

    const isGuest = !isLoggedIn;

    if (prevUserIdRef.current && prevUserIdRef.current !== myUserId) {
      removeOnlineUser(prevUserIdRef.current).catch(() => {});
    }
    prevUserIdRef.current = myUserId;

    const beat = () => {
      if (hideOnlineStatusRef.current) return;
      sendHeartbeat(myUserId, myDisplayName, isGuest).catch(() => {});
    };
    if (!hideOnlineStatusRef.current) beat();
    heartbeatRef.current = setInterval(beat, 30_000);

    connectWebSocket(myUserId);

    if (isLoggedIn) {
      fetchFriends().then(setFriends).catch(() => {});
      fetchUnreadCounts(myUserId).then(setUnreadCounts).catch(() => {});
      refreshVocabSharesRef.current();
    }

    // Tab close: keepalive fetch completes even as the page unloads
    const handleBeforeUnload = () => removeOnlineUserBeacon(myUserId);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      removeOnlineUser(myUserId).catch(() => {});
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (wsClientRef.current) {
        wsClientRef.current.deactivate();
        wsClientRef.current = null;
      }
    };
  }, [myUserId, myDisplayName, isLoggedIn, connectWebSocket]);

  // ── Chat polling ──────────────────────────────────────────────────────────

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

  // ── Actions ───────────────────────────────────────────────────────────────

  const openChat = useCallback((userId: string, _displayName: string) => {
    lastMsgTimestampRef.current = 0;
    activeChatUserIdRef.current = userId;
    setActiveChatUserId(userId);
    setUnreadCounts((prev) => {
      if (!prev[userId]) return prev;
      const next = { ...prev };
      delete next[userId];
      return next;
    });
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

  const loadChatRooms = useCallback(async () => {
    if (!myUserId) return;
    const rooms = await fetchChatRooms(myUserId).catch(() => [] as ChatMessage[]);
    setChatRooms(rooms);
    // Merge into messageMap so chats opened from the Messages tab have their last message pre-loaded
    setMessageMap((prev) => {
      const next = { ...prev };
      rooms.forEach((msg) => {
        if (!next[msg.roomId]) next[msg.roomId] = [msg];
      });
      return next;
    });
  }, [myUserId]);

  const refreshFriends = useCallback(async () => {
    if (!isLoggedIn) return;
    const f = await fetchFriends().catch(() => null);
    if (f !== null) setFriends(f);
  }, [isLoggedIn]);

  refreshFriendsRef.current = refreshFriends;

  const refreshVocabShares = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const inbox = await fetchVocabShareInbox();
      setVocabShares(inbox);
    } catch { /* ignore */ }
  }, [isLoggedIn]);

  refreshVocabSharesRef.current = refreshVocabShares;

  const doAcceptVocabShare = useCallback(async (id: number) => {
    await acceptVocabShare(id);
    await refreshVocabShares();
  }, [refreshVocabShares]);

  const doRejectVocabShare = useCallback(async (id: number) => {
    await rejectVocabShare(id);
    setVocabShares((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const doSendFriendRequest = useCallback(async (addresseeUsername: string) => {
    await sendFriendRequest(addresseeUsername);
    await refreshFriends();
  }, [refreshFriends]);

  const doAcceptFriendRequest = useCallback(async (id: number) => {
    await acceptFriendRequest(id);
    const updated = await fetchFriends().catch(() => null);
    if (updated !== null) {
      setFriends(updated);
      // Verify the request actually moved to ACCEPTED — if it's still PENDING the
      // backend silently failed (e.g. service-record auth error swallowed upstream).
      const stillPending = updated.some((f) => f.id === id && f.status !== 'ACCEPTED');
      if (stillPending) {
        throw new Error('Accept did not take effect — please try again');
      }
    }
  }, []);

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

  const muteUser = useCallback((userId: string) => {
    setMutedUserIds((prev) => {
      const next = new Set(prev);
      next.add(userId);
      localStorage.setItem('hw-muted-users', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const unmuteUser = useCallback((userId: string) => {
    setMutedUserIds((prev) => {
      const next = new Set(prev);
      next.delete(userId);
      localStorage.setItem('hw-muted-users', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const setHideOnlineStatus = useCallback((hide: boolean) => {
    hideOnlineStatusRef.current = hide;
    setHideOnlineStatusState(hide);
    localStorage.setItem('hw-hide-online', hide ? 'true' : 'false');
    if (hide) {
      removeOnlineUser(myUserId).catch(() => {});
    } else {
      sendHeartbeat(myUserId, myDisplayName, !isLoggedIn).catch(() => {});
    }
  }, [myUserId, myDisplayName, isLoggedIn]);

  const setGuestName = useCallback((name: string) => {
    localStorage.setItem('hw-guest-name', name);
    setMyDisplayName(name);
  }, []);

  return (
    <SocialContext.Provider
      value={{
        myUserId,
        myDisplayName,
        onlineUsers,
        friends,
        unreadCounts,
        messageMap,
        chatRooms,
        loadChatRooms,
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
        setGuestName,
        mutedUserIds,
        muteUser,
        unmuteUser,
        hideOnlineStatus,
        setHideOnlineStatus,
        vocabShares,
        doAcceptVocabShare,
        doRejectVocabShare,
        refreshVocabShares: refreshVocabSharesRef.current,
      }}
    >
      {children}
    </SocialContext.Provider>
  );
};
