import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSocial } from '../contexts/SocialContext';
import { sendVocabShare } from '../services/vocabShare.service';

interface Props {
  groupId: number;
  groupName: string;
  onClose: () => void;
}

const ShareVocabGroupModal: React.FC<Props> = ({ groupId, groupName, onClose }) => {
  const { t } = useTranslation();
  const { friends } = useSocial();
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState('');

  const acceptedFriends = friends.filter((f) => f.status === 'ACCEPTED');

  const handleShare = async (userId: string) => {
    setSending(userId);
    setError('');
    try {
      await sendVocabShare(groupId, userId);
      setSent(userId);
    } catch {
      setError(t('vocabShare.sendError', 'Failed to send share request'));
    } finally {
      setSending(null);
    }
  };

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="w-full sm:max-w-sm bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl p-4 pb-8 sm:pb-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {t('vocabShare.shareTitle', 'Share Vocab Group')}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-[220px]">
              {groupName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-red-500 mb-2">{error}</p>
        )}

        {/* Friend list */}
        <div className="overflow-y-auto flex-1 -mx-1 px-1">
          {acceptedFriends.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
              {t('vocabShare.noFriends', 'No friends to share with yet.')}
            </p>
          ) : (
            <ul className="space-y-2">
              {acceptedFriends.map((friend) => {
                const displayName = friend.myNickname || friend.displayName || friend.otherUserId;
                const isSent = sent === friend.otherUserId;
                const isSending = sending === friend.otherUserId;
                return (
                  <li
                    key={friend.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800"
                  >
                    {/* Avatar + name */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                        <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                          {displayName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                        {displayName}
                      </span>
                    </div>

                    {/* Action button */}
                    {isSent ? (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium shrink-0">
                        {t('vocabShare.sent', 'Sent!')}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleShare(friend.otherUserId)}
                        disabled={isSending}
                        className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
                      >
                        {isSending
                          ? t('vocabShare.sending', 'Sending…')
                          : t('vocabShare.send', 'Share')}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShareVocabGroupModal;
