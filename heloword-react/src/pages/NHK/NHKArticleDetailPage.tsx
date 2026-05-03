import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { fetchNHKArticleById, NHKArticleDetail, NHKParagraph } from '../../services/nhkArticle.service';
import { speakSentence, cleanSentenceForTTS, cleanWordText, cancelPronouncing } from '../../services/tts.service';

type LangKey = 'original' | 'zh' | 'en' | 'ja';

const LANG_TO_TTS_CODE: Record<LangKey, string> = {
  original: 'ja-JP',
  en: 'en-US',
  zh: 'zh-TW',
  ja: 'ja-JP',
};

const LANG_TABS: { key: LangKey; label: string }[] = [
  { key: 'original', label: '原文' },
  { key: 'zh', label: '繁中' },
  { key: 'en', label: 'EN' },
  { key: 'ja', label: '日文' },
];

const SpeakerButton: React.FC<{
  onClick: (e: React.MouseEvent) => void;
  isPlaying?: boolean;
  small?: boolean;
}> = ({ onClick, isPlaying, small }) => (
  <button
    onClick={onClick}
    className={`${small ? 'p-0.5' : 'p-1'} rounded-md transition-colors shrink-0 ${
      isPlaying
        ? 'text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300'
        : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
    }`}
    aria-label={isPlaying ? 'Stop' : 'Speak'}
  >
    {isPlaying ? (
      <svg className={small ? 'w-3.5 h-3.5' : 'w-4 h-4'} viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="6" width="12" height="12" rx="1" />
      </svg>
    ) : (
      <svg className={small ? 'w-3.5 h-3.5' : 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 5.05a9 9 0 010 12.728M9 9H5a2 2 0 00-2 2v2a2 2 0 002 2h4l5 5V4L9 9z" />
      </svg>
    )}
  </button>
);

const ParagraphCard: React.FC<{
  paragraph: NHKParagraph;
  activeLang: LangKey;
  index: number;
  speakingKey: string | null;
  onSpeak: (key: string, text: string, langCode: string) => void;
}> = ({ paragraph, activeLang, index, speakingKey, onSpeak }) => {
  const { t } = useTranslation();
  const [translationOpen, setTranslationOpen] = useState(false);
  const [grammarOpen, setGrammarOpen] = useState(false);
  const [vocabOpen, setVocabOpen] = useState(false);
  const translation = activeLang === 'original' ? null : paragraph[activeLang];

  useEffect(() => { setTranslationOpen(false); }, [activeLang]);

  const originalKey = `${index}-original`;
  const translationKey = `${index}-translation`;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="p-4">
        <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mb-2">#{index + 1}</p>
        <div className="flex items-start gap-1">
          <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed flex-1">{paragraph.original}</p>
          <SpeakerButton
            isPlaying={speakingKey === originalKey}
            onClick={(e) => { e.stopPropagation(); onSpeak(originalKey, cleanSentenceForTTS(paragraph.original, 'ja'), 'ja-JP'); }}
          />
        </div>
      </div>

      {translation && (
        <>
          <button
            onClick={() => setTranslationOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 border-t border-gray-100 dark:border-gray-700 border-l-2 border-l-sky-400 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            <span className="text-sky-600 dark:text-sky-400">💬 {activeLang === 'en' ? 'EN' : activeLang === 'zh' ? '繁中' : '日文'}</span>
            <svg
              className={`w-3.5 h-3.5 text-gray-400 transition-transform ${translationOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {translationOpen && (
            <div className="flex items-start gap-1 px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed flex-1">{translation}</p>
              <SpeakerButton
                isPlaying={speakingKey === translationKey}
                onClick={(e) => { e.stopPropagation(); onSpeak(translationKey, cleanSentenceForTTS(translation, activeLang), LANG_TO_TTS_CODE[activeLang]); }}
              />
            </div>
          )}
        </>
      )}

      {paragraph.grammar && (
        <>
          <button
            onClick={() => setGrammarOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 border-t border-gray-100 dark:border-gray-700 border-l-2 border-l-violet-400 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            <span className="text-violet-600 dark:text-violet-400">📝 {t('nhk.grammar')}</span>
            <svg
              className={`w-3.5 h-3.5 text-gray-400 transition-transform ${grammarOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {grammarOpen && (
            <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">{paragraph.grammar}</p>
            </div>
          )}
        </>
      )}

      {paragraph.vocabulary?.length > 0 && (
        <>
          <button
            onClick={() => setVocabOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 border-t border-gray-100 dark:border-gray-700 border-l-2 border-l-amber-400 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            <span className="text-amber-600 dark:text-amber-400">📚 {t('nhk.vocabulary')} ({paragraph.vocabulary.length})</span>
            <svg
              className={`w-3.5 h-3.5 text-gray-400 transition-transform ${vocabOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {vocabOpen && (
            <div className="overflow-x-auto border-t border-gray-100 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-750">
                    <th className="text-left px-4 py-2 text-xs text-gray-500 dark:text-gray-400 font-medium">{t('nhk.word')}</th>
                    <th className="text-left px-4 py-2 text-xs text-gray-500 dark:text-gray-400 font-medium">中文</th>
                    <th className="text-left px-4 py-2 text-xs text-gray-500 dark:text-gray-400 font-medium">English</th>
                  </tr>
                </thead>
                <tbody>
                  {paragraph.vocabulary.map((v, i) => {
                    const vocabKey = `${index}-vocab-${i}`;
                    return (
                      <tr key={i} className="border-t border-gray-100 dark:border-gray-700 border-l-2 border-l-transparent hover:border-l-amber-400/60 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-amber-600 dark:text-amber-400">{v.word}</span>
                            <SpeakerButton
                              small
                              isPlaying={speakingKey === vocabKey}
                              onClick={(e) => { e.stopPropagation(); onSpeak(vocabKey, cleanWordText(v.word), 'ja-JP'); }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-700 dark:text-gray-200">{v.meaning_zh}</td>
                        <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs">{v.meaning_en}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};


const NHKArticleDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [article, setArticle] = useState<NHKArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeLang, setActiveLang] = useState<LangKey>('zh');
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const speakingKeyRef = useRef<string | null>(null);

  // Stop speech on unmount
  useEffect(() => () => { cancelPronouncing(); }, []);

  // Stop speech when switching language tabs
  useEffect(() => {
    cancelPronouncing();
    speakingKeyRef.current = null;
    setSpeakingKey(null);
  }, [activeLang]);

  const triggerSpeak = useCallback((key: string, text: string, langCode: string) => {
    if (speakingKeyRef.current === key) {
      cancelPronouncing();
      speakingKeyRef.current = null;
      setSpeakingKey(null);
      return;
    }
    // Update ref before cancelling so the outgoing speech's onerror callback
    // sees the new key and does not clear the state we are about to set.
    speakingKeyRef.current = key;
    setSpeakingKey(key);
    cancelPronouncing();
    speakSentence(text, langCode, {}, () => {
      if (speakingKeyRef.current === key) {
        speakingKeyRef.current = null;
        setSpeakingKey(null);
      }
    });
  }, []);

  useEffect(() => {
    if (!id) return;
    fetchNHKArticleById(id)
      .then((data) => {
        if (!data) setError(true);
        else setArticle(data);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  const paragraphs = (article?.paragraphs ?? []).filter(Boolean);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 animate-page-enter">
      <Header title={t('nhk.title')} showBack />

      <main className="flex-1 pb-20 px-4 pt-4 max-w-2xl mx-auto w-full">
        {loading && (
          <div className="space-y-4 mt-2">
            <div className="h-7 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-3/4" />
            <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-1/3" />
            <div className="flex gap-2 mt-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-9 w-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
              ))}
            </div>
            <div className="space-y-3 mt-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">😞</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm">{t('nhk.loadError')}</p>
            <button
              onClick={() => navigate('/nhk-articles')}
              className="mt-4 text-sm text-blue-500 hover:text-blue-700 dark:hover:text-blue-300"
            >
              {t('nhk.backToList')}
            </button>
          </div>
        )}

        {article && (
          <>
            {/* Article title & meta */}
            <div className="mb-4">
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-snug mb-2">
                {article.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                <span>🇯🇵 日文原文</span>
                <span>·</span>
                <span>{new Date(article.createDate).toLocaleDateString('zh-TW')}</span>
                {article.sourceUrl && (
                  <>
                    <span>·</span>
                    <a
                      href={article.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-0.5 hover:text-blue-500 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      {t('nhk.source')}
                    </a>
                  </>
                )}
              </div>
            </div>

            {/* Language tabs */}
            <div className="flex gap-1.5 mb-4 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
              {LANG_TABS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveLang(key)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    activeLang === key
                      ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Paragraphs */}
            <div className="space-y-3 mb-5">
              {paragraphs.length > 0 ? (
                paragraphs.map((p, i) => (
                  <ParagraphCard
                    key={i}
                    paragraph={p}
                    activeLang={activeLang}
                    index={i}
                    speakingKey={speakingKey}
                    onSpeak={triggerSpeak}
                  />
                ))
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                  {t('nhk.noParagraphs')}
                </p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default NHKArticleDetailPage;
