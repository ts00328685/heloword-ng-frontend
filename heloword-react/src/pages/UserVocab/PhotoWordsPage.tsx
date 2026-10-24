import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import PhotoParseModal from '../../components/PhotoParseModal';
import { Button } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { CustomGroup } from '../../services/customVocab.service';

/**
 * Photo shortcut (/photo-words — also the app icon's long-press shortcut):
 * take a picture, fix the parsed words and meanings, save to a word list.
 */
const PhotoWordsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoggedIn, hasCheckedLoginStatus } = useAuth();
  const [saved, setSaved] = useState<{ group: CustomGroup; count: number } | null>(null);
  const [round, setRound] = useState(0);

  const leave = () => (window.history.length > 1 ? navigate(-1) : navigate('/home'));

  return (
    <div className="flex flex-col min-h-screen bg-paper">
      <Header title={t('photoWords.title')} showBack />
      <main className="flex-1 px-4 pt-6 pb-24 max-w-2xl mx-auto w-full">
        {hasCheckedLoginStatus && !isLoggedIn && (
          <section className="rounded-md border border-line bg-surface p-5">
            <p className="text-sm text-ink">{t('photoWords.loginRequired')}</p>
            <div className="mt-4">
              <Button onClick={() => navigate('/login')}>{t('photoWords.login')}</Button>
            </div>
          </section>
        )}

        {saved && (
          <section className="rounded-md border border-line bg-surface p-5 animate-fade-in">
            <p className="text-[11px] tracking-wide text-ink-faint">{t('photoWords.title')}</p>
            <h2 className="font-serif text-xl text-ink mt-2">
              {t('photoWords.savedTitle', { count: saved.count, group: saved.group.name })}
            </h2>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => { setSaved(null); setRound((r) => r + 1); }}>{t('photoWords.another')}</Button>
              <button
                onClick={() => navigate(`/user-vocab/${saved.group.id}`, { state: { group: saved.group } })}
                className="h-10 px-4 rounded-md border border-line text-sm text-ink hover:border-ink/30 transition-colors"
              >
                {t('photoWords.openGroup')}
              </button>
            </div>
          </section>
        )}
      </main>

      {isLoggedIn && !saved && (
        <PhotoParseModal
          key={round}
          onClose={leave}
          onSaved={(group, count) => setSaved({ group, count })}
        />
      )}
    </div>
  );
};

export default PhotoWordsPage;
