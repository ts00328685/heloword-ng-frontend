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
      <div className="w-full sm:max-w-sm bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl p-4 pb-8 sm:pb-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-ink">
              {t('vocabShare.shareTitle', 'Share Vocab Group')}
            </h2>
            <p className="text-xs text-ink-muted mt-0.5 truncate max-w-[220px]">
              {groupName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-ink/5 text-ink-muted"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Public share request section */}
        <div className="mb-3 rounded-xl bg-accent-soft border border-line p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <svg className="w-4 h-4 text-accent shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 004 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-semibold text-accent truncate">
                {t('sharedVocab.requestPublicShare')}
              </span>
            </div>
            <button
              onClick={() => setInfoOpen((v) => !v)}
              className="w-5 h-5 rounded-full bg-accent-soft text-accent text-[10px] font-semibold flex items-center justify-center shrink-0 ml-2 hover:bg-accent-soft transition-colors"
              aria-label="info"
            >
              ?
            </button>
          </div>

          {infoOpen && (
            <p className="mt-2 text-xs text-accent leading-relaxed">
              {t('sharedVocab.requestPublicShareInfo')}
            </p>
          )}

          <div className="mt-2.5 flex items-center gap-2">
            {publicStatus?.status === 'PENDING' ? (
              <span className="text-xs font-medium text-accent bg-accent-soft px-2.5 py-1 rounded-lg border border-accent/30">
                {t('sharedVocab.pendingApproval')}
              </span>
            ) : publicStatus?.status === 'APPROVED' ? (
              <span className="text-xs font-medium text-success bg-success-soft px-2.5 py-1 rounded-lg border border-success/30">
                {t('sharedVocab.approved')}
              </span>
            ) : publicStatus?.status === 'REJECTED' ? (
              <span className="text-xs font-medium text-danger bg-danger-soft px-2.5 py-1 rounded-lg border border-danger/30">
                {t('sharedVocab.rejected')}
              </span>
            ) : (
              <button
                onClick={handleRequestPublicShare}
                disabled={requesting}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-ink hover:bg-ink/85 disabled:opacity-50 text-paper transition-colors"
              >
                {requesting ? t('sharedVocab.requesting') : t('sharedVocab.requestPublicShare')}
              </button>
            )}
            {publicSuccess && <span className="text-xs text-success">{publicSuccess}</span>}
            {publicError && <span className="text-xs text-danger">{publicError}</span>}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-line mb-3" />

        {/* Error */}
        {error && (
          <p className="text-xs text-danger mb-2">{error}</p>
        )}

        {/* Friend list */}
        <div className="overflow-y-auto flex-1 -mx-1 px-1">
          {acceptedFriends.length === 0 ? (
            <p className="text-sm text-ink-faint text-center py-6">
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
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-paper"
                  >
                    {/* Avatar + name */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-accent-soft flex items-center justify-center shrink-0">
                        <span className="text-sm font-semibold text-accent">
                          {displayName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-ink truncate">
                        {displayName}
                      </span>
                    </div>

                    {/* Action button */}
                    {isSent ? (
                      <span className="text-xs text-success font-medium shrink-0">
                        {t('vocabShare.sent', 'Sent!')}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleShare(friend.otherUserId)}
                        disabled={isSending}
                        className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-ink hover:bg-ink/85 disabled:opacity-50 text-paper transition-colors"
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
