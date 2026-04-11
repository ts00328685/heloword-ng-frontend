import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useSocial } from '../contexts/SocialContext';
import { sendVocabShare } from '../services/vocabShare.service';
import { fetchPublicShareStatus, requestPublicShare, PublicShareStatus } from '../services/customVocab.service';

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

  // Public share request state
  const [publicStatus, setPublicStatus] = useState<PublicShareStatus | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [publicError, setPublicError] = useState('');
  const [publicSuccess, setPublicSuccess] = useState('');

  useEffect(() => {
    fetchPublicShareStatus(groupId).then(setPublicStatus).catch(() => {});
  }, [groupId]);

  const handleRequestPublicShare = async () => {
    setRequesting(true);
    setPublicError('');
    setPublicSuccess('');
    try {
      const status = await requestPublicShare(groupId);
      setPublicStatus(status);
      setPublicSuccess(t('sharedVocab.requestSuccess'));
    } catch {
      setPublicError(t('sharedVocab.requestError'));
    } finally {
      setRequesting(false);
    }
  };

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

  return ReactDOM.createPortal(
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

        {/* Public share request section */}
        <div className="mb-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 004 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300 truncate">
                {t('sharedVocab.requestPublicShare')}
              </span>
            </div>
            <button
              onClick={() => setInfoOpen((v) => !v)}
              className="w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-800 text-blue-600 dark:text-blue-300 text-[10px] font-bold flex items-center justify-center shrink-0 ml-2 hover:bg-blue-300 dark:hover:bg-blue-700 transition-colors"
              aria-label="info"
            >
              ?
            </button>
          </div>

          {infoOpen && (
            <p className="mt-2 text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
              {t('sharedVocab.requestPublicShareInfo')}
            </p>
          )}

          <div className="mt-2.5 flex items-center gap-2">
            {publicStatus?.status === 'PENDING' ? (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-700">
                {t('sharedVocab.pendingApproval')}
              </span>
            ) : publicStatus?.status === 'APPROVED' ? (
              <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2.5 py-1 rounded-lg border border-green-200 dark:border-green-700">
                {t('sharedVocab.approved')}
              </span>
            ) : publicStatus?.status === 'REJECTED' ? (
              <span className="text-xs font-medium text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-700">
                {t('sharedVocab.rejected')}
              </span>
            ) : (
              <button
                onClick={handleRequestPublicShare}
                disabled={requesting}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
              >
                {requesting ? t('sharedVocab.requesting') : t('sharedVocab.requestPublicShare')}
              </button>
            )}
            {publicSuccess && <span className="text-xs text-green-600 dark:text-green-400">{publicSuccess}</span>}
            {publicError && <span className="text-xs text-red-500">{publicError}</span>}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-100 dark:border-gray-800 mb-3" />

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
    </div>,
    document.body
  );
};

export default ShareVocabGroupModal;
