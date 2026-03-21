import React, { useEffect } from 'react';
import { useSocial } from '../contexts/SocialContext';

const AUTO_DISMISS_MS = 5_000;

const MessageNotificationToast: React.FC = () => {
  const { notifications, dismissNotification, openChat, onlineUsers } = useSocial();

  // Auto-dismiss each notification after 5 s
  useEffect(() => {
    if (notifications.length === 0) return;
    const latest = notifications[notifications.length - 1];
    const timer = setTimeout(() => dismissNotification(latest.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notifications, dismissNotification]);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {notifications.map((n) => {
        const online = onlineUsers.some((u) => u.userId === n.senderUserId);
        return (
          <div
            key={n.id}
            className="pointer-events-auto flex items-start gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg px-4 py-3 max-w-xs w-72 cursor-pointer hover:shadow-xl transition-shadow"
            onClick={() => {
              openChat(n.senderUserId, n.senderDisplayName);
              dismissNotification(n.id);
            }}
          >
            {/* Avatar */}
            <div className="relative flex-shrink-0 mt-0.5">
              <div className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center text-white text-sm font-semibold">
                {n.senderDisplayName.charAt(0).toUpperCase()}
              </div>
              {online && (
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-white dark:border-gray-800" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                {n.senderDisplayName}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-2">
                {n.content}
              </p>
            </div>

            {/* Dismiss */}
            <button
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ml-1"
              onClick={(e) => {
                e.stopPropagation();
                dismissNotification(n.id);
              }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default MessageNotificationToast;
