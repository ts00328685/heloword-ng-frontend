import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import { useSocial } from '../../contexts/SocialContext';
import { computeRoomId, Friend, OnlineUser } from '../../services/social.service';

// ── Sub-components ────────────────────────────────────────────────────────

const Avatar: React.FC<{ name: string; online?: boolean; size?: 'sm' | 'md' }> = ({
  name,
  online,
  size = 'md',
}) => {
  const initials = name.slice(0, 2).toUpperCase();
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  return (
    <div className={`relative flex-shrink-0 ${sz} rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center font-semibold text-blue-600 dark:text-blue-400`}>
      {initials}
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-800 ${
            online ? 'bg-green-400' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        />
      )}
    </div>
  );
};

// ── Chat Panel ────────────────────────────────────────────────────────────

const ChatPanel: React.FC<{
  targetUserId: string;
  targetDisplayName: string;
  onClose: () => void;
}> = ({ targetUserId, targetDisplayName, onClose }) => {
  const { t } = useTranslation();
  const { myUserId, myDisplayName, messageMap, sendMessage } = useSocial();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const roomId = computeRoomId(myUserId, targetUserId);
  const messages = messageMap[roomId] ?? [];

  React.useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const text = input;
    setInput('');
    await sendMessage(text);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-100 dark:bg-gray-950 sm:items-center sm:justify-center">
      <div className="flex flex-col w-full max-w-2xl h-full sm:h-[85vh] sm:rounded-2xl sm:shadow-2xl bg-white dark:bg-gray-900 overflow-hidden">
        {/* Chat header */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm flex-shrink-0">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <Avatar name={targetDisplayName} size="sm" />
          <span className="font-semibold text-gray-800 dark:text-gray-100 flex-1 truncate">
            {targetDisplayName}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {messages.length === 0 && (
            <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-8">
              {t('social.noMessages')}
            </p>
          )}
          {messages.map((msg) => {
            const isMine = msg.senderUserId === myUserId;
            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                    isMine
                      ? 'bg-blue-500 text-white rounded-br-sm'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-sm'
                  }`}
                >
                  {msg.content}
                  <div className={`text-[10px] mt-0.5 ${isMine ? 'text-blue-200' : 'text-gray-400'}`}>
                    {new Date(msg.sentAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex items-end gap-2 px-4 pb-6 pt-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={t('social.messagePlaceholder')}
            className="flex-1 resize-none rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white rounded-2xl transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Nickname edit modal ───────────────────────────────────────────────────

const NicknameModal: React.FC<{
  friend: Friend;
  onClose: () => void;
}> = ({ friend, onClose }) => {
  const { t } = useTranslation();
  const { doUpdateFriendNickname } = useSocial();
  const [value, setValue] = useState(friend.myNickname ?? '');

  const handleSave = async () => {
    await doUpdateFriendNickname(friend.id, value.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">{t('social.setNickname')}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{t('social.nicknameHint', { name: friend.displayName })}</p>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder={t('social.nicknamePlaceholder')}
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">
            {t('social.cancel')}
          </button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors">
            {t('social.save')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Social Page ──────────────────────────────────────────────────────

const SocialPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const {
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
    doSendFriendRequest,
    doAcceptFriendRequest,
    doRejectFriendRequest,
    doRemoveFriend,
  } = useSocial();

  const [activeTab, setActiveTab] = useState<'online' | 'friends' | 'messages'>('online');
  const [roomsLoading, setRoomsLoading] = useState(false);

  React.useEffect(() => {
    if (activeTab !== 'messages') return;
    setRoomsLoading(true);
    loadChatRooms().finally(() => setRoomsLoading(false));
  }, [activeTab]);
  const [nicknameTarget, setNicknameTarget] = useState<Friend | null>(null);
  const [friendRequestInput, setFriendRequestInput] = useState('');
  const [sendingRequest, setSendingRequest] = useState(false);
  const [friendRequestError, setFriendRequestError] = useState<string | null>(null);
  const [friendRequestSuccess, setFriendRequestSuccess] = useState(false);

  // Resolve target display name for chat
  const chatTargetUser: OnlineUser | Friend | undefined =
    onlineUsers.find((u) => u.userId === activeChatUserId)
    ?? friends.find((f) => f.otherUserId === activeChatUserId);
  const chatDisplayName = chatTargetUser?.displayName || activeChatUserId || '';

  if (activeChatUserId) {
    return (
      <ChatPanel
        targetUserId={activeChatUserId}
        targetDisplayName={chatDisplayName}
        onClose={closeChat}
      />
    );
  }

  const otherOnlineUsers = onlineUsers.filter((u) => u.userId !== myUserId);
  const acceptedFriends = friends.filter((f) => f.status === 'ACCEPTED');
  const pendingReceived = friends.filter((f) => f.status === 'PENDING_RECEIVED');
  const pendingSent = friends.filter((f) => f.status === 'PENDING_SENT');
  const totalUnread = Object.values(unreadCounts).reduce((s, n) => s + n, 0);

  // Resolve a display name: friends (with nickname) → online users → message senderDisplayName → userId
  const resolveDisplayName = (userId: string, hint?: import('../../services/social.service').ChatMessage): string => {
    const friend = acceptedFriends.find((f) => f.otherUserId === userId);
    if (friend) return friend.myNickname || friend.displayName;
    const online = onlineUsers.find((u) => u.userId === userId);
    if (online) return online.displayName;
    // Use display name stored in the message if the other person was the sender
    if (hint && hint.senderUserId === userId) return hint.senderDisplayName;
    // Scan already-loaded messages for that room to find one sent by them
    const roomMsgs = messageMap[hint?.roomId ?? ''] ?? [];
    const theirMsg = roomMsgs.find((m) => m.senderUserId === userId);
    if (theirMsg) return theirMsg.senderDisplayName;
    return userId;
  };

  const handleSendFriendRequest = async () => {
    const target = friendRequestInput.trim();
    if (!target) return;
    setSendingRequest(true);
    setFriendRequestError(null);
    setFriendRequestSuccess(false);
    try {
      await doSendFriendRequest(target);
      setFriendRequestInput('');
      setFriendRequestSuccess(true);
      setTimeout(() => setFriendRequestSuccess(false), 3000);
    } catch (e: any) {
      setFriendRequestError(e?.message || t('social.requestFailed'));
    } finally {
      setSendingRequest(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title={t('nav.social')} />

      <main className="flex-1 pb-20 px-4 pt-4 max-w-2xl mx-auto w-full">

        {/* My identity badge */}
        <div className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl p-3 mb-4 border border-gray-200 dark:border-gray-700 shadow-sm">
          <Avatar name={myDisplayName} online={true} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{myDisplayName}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
              {isLoggedIn ? t('social.loggedIn') : t('social.guestMode')}
            </p>
          </div>
          {!isLoggedIn && (
            <button
              onClick={() => navigate('/login')}
              className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-xl transition-colors"
            >
              {t('common.login')}
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-1 mb-4 gap-1">
          {(['online', 'friends', 'messages'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab === 'online' ? (
                <>
                  {t('social.tabOnline')}
                  {otherOnlineUsers.length > 0 && (
                    <span className="ml-1.5 text-xs bg-white/20 rounded-full px-1.5">{otherOnlineUsers.length}</span>
                  )}
                </>
              ) : tab === 'friends' ? (
                <>
                  {t('social.tabFriends')}
                  {pendingReceived.length > 0 && (
                    <span className="ml-1.5 text-xs bg-orange-400 text-white rounded-full px-1.5">{pendingReceived.length}</span>
                  )}
                </>
              ) : (
                <>
                  {t('social.tabMessages')}
                  {totalUnread > 0 && (
                    <span className="ml-1.5 text-xs bg-red-500 text-white rounded-full px-1.5">{totalUnread > 99 ? '99+' : totalUnread}</span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>

        {/* ── Online tab ── */}
        {activeTab === 'online' && (
          <div className="space-y-2">
            {otherOnlineUsers.length === 0 ? (
              <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
                {t('social.noOneOnline')}
              </div>
            ) : (
              otherOnlineUsers.map((u) => (
                <div
                  key={u.userId}
                  className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl p-3 border border-gray-200 dark:border-gray-700 shadow-sm"
                >
                  <Avatar name={u.displayName} online={true} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{u.displayName}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {u.isGuest ? t('social.guestUser') : t('social.member')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openChat(u.userId, u.displayName)}
                      className="relative p-2 bg-blue-50 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-500 rounded-xl transition-colors"
                      title={t('social.chat')}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      {(unreadCounts[u.userId] ?? 0) > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                          {unreadCounts[u.userId] > 99 ? '99+' : unreadCounts[u.userId]}
                        </span>
                      )}
                    </button>
                    {isLoggedIn && !u.isGuest && (
                      <button
                        onClick={() => doSendFriendRequest(u.userId).catch(() => {})}
                        className="p-2 bg-green-50 dark:bg-green-900/40 hover:bg-green-100 dark:hover:bg-green-900/60 text-green-500 rounded-xl transition-colors"
                        title={t('social.addFriend')}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Friends tab ── */}
        {activeTab === 'friends' && (
          <div className="space-y-4">
            {!isLoggedIn ? (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 text-center">
                <p className="text-sm text-blue-600 dark:text-blue-400 mb-3">{t('social.loginForFriends')}</p>
                <button
                  onClick={() => navigate('/login')}
                  className="text-sm bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-xl transition-colors"
                >
                  {t('common.login')}
                </button>
              </div>
            ) : (
              <>
                {/* Send friend request */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t('social.addFriendByUsername')}</p>
                  <div className="flex gap-2">
                    <input
                      value={friendRequestInput}
                      onChange={(e) => { setFriendRequestInput(e.target.value); setFriendRequestError(null); setFriendRequestSuccess(false); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendFriendRequest()}
                      placeholder={t('social.usernamePlaceholder')}
                      className={`flex-1 rounded-xl border bg-gray-50 dark:bg-gray-900 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 ${friendRequestError ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'}`}
                    />
                    <button
                      onClick={handleSendFriendRequest}
                      disabled={sendingRequest || !friendRequestInput.trim()}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-sm rounded-xl transition-colors"
                    >
                      {sendingRequest ? '...' : t('social.add')}
                    </button>
                  </div>
                  {friendRequestError && (
                    <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">{friendRequestError}</p>
                  )}
                  {friendRequestSuccess && (
                    <p className="mt-1.5 text-xs text-green-500 dark:text-green-400">{t('social.requestSent')}</p>
                  )}
                </div>

                {/* Pending received */}
                {pendingReceived.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-1 mb-2">
                      {t('social.pendingRequests')} ({pendingReceived.length})
                    </p>
                    <div className="space-y-2">
                      {pendingReceived.map((f) => (
                        <div key={f.id} className="flex items-center gap-3 bg-orange-50 dark:bg-orange-900/20 rounded-2xl p-3 border border-orange-200 dark:border-orange-800">
                          <Avatar name={f.displayName} />
                          <p className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{f.displayName}</p>
                          <button onClick={() => doAcceptFriendRequest(f.id)} className="text-xs bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg transition-colors">
                            {t('social.accept')}
                          </button>
                          <button onClick={() => doRejectFriendRequest(f.id)} className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors ml-1">
                            {t('social.reject')}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Accepted friends */}
                {acceptedFriends.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-1 mb-2">
                      {t('social.friends')} ({acceptedFriends.length})
                    </p>
                    <div className="space-y-2">
                      {acceptedFriends.map((f) => (
                        <div key={f.id} className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl p-3 border border-gray-200 dark:border-gray-700 shadow-sm">
                          <Avatar name={f.displayName} online={f.isOnline} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                              {f.myNickname || f.displayName}
                            </p>
                            {f.myNickname && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{f.otherUserId}</p>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => openChat(f.otherUserId, f.myNickname || f.displayName)}
                              className="relative p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/40 rounded-xl transition-colors"
                              title={t('social.chat')}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                              {(unreadCounts[f.otherUserId] ?? 0) > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                                  {unreadCounts[f.otherUserId] > 99 ? '99+' : unreadCounts[f.otherUserId]}
                                </span>
                              )}
                            </button>
                            <button
                              onClick={() => setNicknameTarget(f)}
                              className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-colors"
                              title={t('social.setNickname')}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => doRemoveFriend(f.id).catch(() => {})}
                              className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-colors"
                              title={t('social.removeFriend')}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pending sent */}
                {pendingSent.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-1 mb-2">
                      {t('social.pendingSent')} ({pendingSent.length})
                    </p>
                    <div className="space-y-2">
                      {pendingSent.map((f) => (
                        <div key={f.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-3 border border-gray-200 dark:border-gray-700 opacity-80">
                          <Avatar name={f.displayName} />
                          <p className="flex-1 text-sm text-gray-600 dark:text-gray-400 truncate">{f.displayName}</p>
                          <span className="text-xs text-gray-400 dark:text-gray-500">{t('social.pending')}</span>
                          <button onClick={() => doRemoveFriend(f.id).catch(() => {})} className="text-xs text-gray-300 hover:text-red-500 dark:hover:text-red-400 ml-2 transition-colors">
                            {t('social.cancel')}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {acceptedFriends.length === 0 && pendingReceived.length === 0 && pendingSent.length === 0 && (
                  <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">
                    {t('social.noFriends')}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Messages tab ── */}
        {activeTab === 'messages' && (
          <div className="space-y-2">
            {roomsLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : chatRooms.length === 0 ? (
              <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
                {t('social.noConversations')}
              </div>
            ) : (
              chatRooms.map((msg) => {
                const otherUserId = msg.senderUserId === myUserId ? msg.recipientUserId : msg.senderUserId;
                const displayName = resolveDisplayName(otherUserId, msg);
                const unread = unreadCounts[otherUserId] ?? 0;
                const isMine = msg.senderUserId === myUserId;
                const preview = isMine ? `${t('social.you')}: ${msg.content}` : msg.content;
                const time = new Date(msg.sentAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

                return (
                  <button
                    key={msg.roomId}
                    onClick={() => openChat(otherUserId, displayName)}
                    className="w-full flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl p-3 border border-gray-200 dark:border-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-left"
                  >
                    <div className="relative flex-shrink-0">
                      <Avatar name={displayName} online={onlineUsers.some((u) => u.userId === otherUserId)} />
                      {unread > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={`text-sm font-semibold truncate ${unread > 0 ? 'text-gray-900 dark:text-gray-50' : 'text-gray-800 dark:text-gray-100'}`}>
                          {displayName}
                        </p>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0">{time}</span>
                      </div>
                      <p className={`text-xs truncate mt-0.5 ${unread > 0 ? 'text-gray-700 dark:text-gray-300 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
                        {preview}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

      </main>

      {nicknameTarget && (
        <NicknameModal friend={nicknameTarget} onClose={() => setNicknameTarget(null)} />
      )}
    </div>
  );
};

export default SocialPage;
