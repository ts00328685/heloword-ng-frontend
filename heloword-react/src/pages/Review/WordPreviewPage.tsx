import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { Sentence } from '../../models';

interface PreviewState {
  words: Sentence[];
  groupName: string;
}

const LANG_MAP: Record<string, string> = {
  en: 'en-US',
  de: 'de-DE',
  jp: 'ja-JP',
  ch: 'zh-TW',
};

const pronounceWord = (word: string, lang: string) => {
  if (!word || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const cleaned = word.replace(/(\[.*?\]|\(.*?\)) */g, '').replace(/(<.*?>) */g, '');
  const langCode = LANG_MAP[lang] || 'en-US';
  const synthesis = window.speechSynthesis;
  const voice = synthesis.getVoices().find((v) => v.lang === langCode) || null;
  const utterance = new SpeechSynthesisUtterance(cleaned);
  utterance.voice = voice;
  utterance.pitch = 1.2;
  utterance.rate = 1.0;
  utterance.volume = 0.2;
  synthesis.speak(utterance);
};

const WordPreviewPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as PreviewState | null;

  const words: Sentence[] = state?.words ?? [];
  const groupName: string = state?.groupName ?? '';

  // Per-word revealed state — starts all hidden
  const [revealed, setRevealed] = useState<boolean[]>(() => words.map(() => false));
  const allHidden = revealed.every((v) => !v);
  const allRevealed = revealed.every((v) => v);

  if (!state || words.length === 0) {
    navigate(-1);
    return null;
  }

  const toggleOne = (i: number) => {
    setRevealed((prev) => {
      const next = [...prev];
      next[i] = !next[i];
      return next;
    });
  };

  const hideAll = () => setRevealed(words.map(() => false));
  const showAll = () => setRevealed(words.map(() => true));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <Header title={groupName || t('review.preview', '先預習')} showBack />

      {/* Toolbar */}
      <div className="sticky top-14 z-10 bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-4 py-2.5 flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('review.previewWordCount', { count: words.length })}
        </p>
        <div className="flex gap-2">
          <button
            onClick={hideAll}
            disabled={allHidden}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-40 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {t('review.previewHideAll', '隱藏全部')}
          </button>
          <button
            onClick={showAll}
            disabled={allRevealed}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-40 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {t('review.previewShowAll', '顯示全部')}
          </button>
        </div>
      </div>

      {/* Word list */}
      <main className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 max-w-xl mx-auto w-full pb-8">
        {words.map((word, i) => (
          <div
            key={word.id ?? i}
            className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden"
          >
            {/* Word row */}
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-base font-bold text-gray-900 dark:text-white leading-snug break-words">
                    {word.word}
                  </p>
                  <button
                    onClick={() => pronounceWord(word.word, word.language ?? 'en')}
                    className="shrink-0 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-400 dark:text-gray-500"
                    aria-label="Pronounce"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  </button>
                </div>
                {word.sentence && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 italic truncate">
                    {word.sentence}
                  </p>
                )}
              </div>
              {/* Toggle button */}
              <button
                onClick={() => toggleOne(i)}
                className="shrink-0 p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-400 dark:text-gray-500"
                aria-label={revealed[i] ? t('review.previewHide', 'Hide') : t('review.previewReveal', 'Reveal')}
              >
                {revealed[i] ? (
                  /* Eye-off */
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  /* Eye */
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Meaning area */}
            <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-2.5 min-h-[40px] flex items-center">
              {revealed[i] ? (
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-200 font-medium">
                    {word.translateEn}
                  </p>
                  {word.translateCh && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{word.translateCh}</p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 w-full">
                  <div className="h-3 rounded-full bg-gray-200 dark:bg-gray-700 flex-1 max-w-[180px]" />
                  <div className="h-3 rounded-full bg-gray-200 dark:bg-gray-700 w-16" />
                  <p className="text-xs text-gray-300 dark:text-gray-600 ml-auto">
                    {t('review.previewTapReveal', '點擊眼睛顯示')}
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
};

export default WordPreviewPage;
