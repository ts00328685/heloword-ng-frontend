import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { lookupWord, LookupResult } from '../services/llm.service';
import { pronounceWord } from '../services/tts.service';
import { track } from '../services/analytics.service';
import { aiErrorMessage } from '../utils/aiError';
import { LookupLang, stripReadings, TappedWord } from '../utils/wordLookup';
import { Sentence } from '../models';
import AddToGroupModal from './AddToGroupModal';
import FuriganaText from './FuriganaText';
import WordPractice from './WordPractice';

type Source = 'article' | 'ai';

const SESSION_PREFIX = 'ai:lookup:';

/** Same tap twice in a session (or across re-renders) never calls the server again. */
function readCache(key: string): LookupResult | null {
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + key);
    return raw ? (JSON.parse(raw) as LookupResult) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: LookupResult): void {
  try { sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify(value)); } catch { /* quota/private mode */ }
}

/**
 * Bottom sheet for a word tapped while reading. Article vocabulary answers instantly and
 * free; anything else is explained by the AI in the context of its sentence.
 */
const WordLookupSheet: React.FC<{
  tapped: TappedWord;
  lang: LookupLang;
  onClose: () => void;
  /** Where the tap happened, for analytics: 'article' or 'ai_text'. */
  context?: string;
}> = ({ tapped, lang, onClose, context = 'article' }) => {
  const { t } = useTranslation();
  const { isLoggedIn } = useAuth();
  const [result, setResult] = useState<LookupResult | null>(null);
  const [source, setSource] = useState<Source>('ai');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const latest = useRef(tapped);
  latest.current = tapped;

  useEffect(() => {
    setError('');
    if (tapped.vocab) {
      setSource('article');
      setResult({ word: tapped.vocab.word, meaningZh: tapped.vocab.meaning_zh, meaningEn: tapped.vocab.meaning_en });
      track('FEATURE', `${context}.word_tap`, { label: 'article' });
      return;
    }
    setSource('ai');
    const key = `${lang}|${tapped.word}|${tapped.sentenceText}`;
    const cached = readCache(key);
    track('FEATURE', `${context}.word_tap`, { label: cached ? 'cache' : 'ai' });
    if (cached) { setResult(cached); return; }

    setResult(null);
    lookupWord(tapped.word, tapped.sentenceText, lang)
      .then((r) => {
        writeCache(key, r);
        if (latest.current === tapped) setResult(r);
      })
      .catch((e) => {
        if (latest.current === tapped) setError(aiErrorMessage(e, isLoggedIn));
      });
  }, [tapped, lang, isLoggedIn, context]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const plainWord = result ? stripReadings(result.word).text : tapped.word;

  const action = (label: string, onClick: () => void, active = false, analytics?: string) => (
    <button
      data-analytics={analytics}
      onClick={onClick}
      className={`h-8 px-3 rounded-md border text-xs transition-colors ${
        active ? 'border-ink text-ink bg-ink/5' : 'border-line text-ink-muted hover:text-ink hover:border-ink/30'
      }`}
    >
      {label}
    </button>
  );

  const asSentence: Sentence | null = result
    ? {
        id: 0,
        status: 1,
        word: result.word,
        translateEn: result.meaningEn,
        translateCh: result.meaningZh,
        sentence: tapped.sentence,
        language: lang === 'ja' ? 'jp' : 'en',
        tableName: undefined,
      }
    : null;

  return ReactDOM.createPortal(
    <>
      {/* Hidden while the save modal (z-50) is open so it isn't covered; closing the modal brings it back. */}
      {!saving && (<>
      <div className="fixed inset-0 z-[55]" onClick={onClose} data-no-analytics />
      <div
        role="dialog"
        aria-label={tapped.word}
        className="fixed inset-x-0 bottom-0 z-[56] flex justify-center pointer-events-none"
      >
        <div className="pointer-events-auto w-full max-w-2xl mx-auto mb-[64px] px-4">
          <div className="bg-surface rounded-2xl shadow-2xl border border-line p-4 animate-chatbot-slide-up">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <FuriganaText text={result?.word ?? tapped.word} className="text-lg font-semibold text-ink leading-relaxed" />
                  <button
                    data-analytics="article.lookup.pronounce"
                    onClick={() => pronounceWord(plainWord, lang === 'ja' ? 'jp' : 'en')}
                    className="p-1 rounded-lg text-ink-faint hover:text-ink-muted hover:bg-ink/5"
                    aria-label={t('chatbot.pronounce')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-3-3m3 3l3-3M9 9H5a2 2 0 00-2 2v2a2 2 0 002 2h4l5 5V4L9 9z" />
                    </svg>
                  </button>
                </div>
                {result && (
                  <span className="text-[10px] text-ink-faint">
                    {source === 'article' ? t('wordLookup.fromArticle') : t('wordLookup.fromAi')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  data-analytics="article.lookup.close"
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-ink-faint hover:bg-ink/5"
                  aria-label={t('wordLookup.close')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="mt-2 min-h-[2.5rem]">
              {error ? (
                <p className="text-sm text-danger">{error}</p>
              ) : result ? (
                <>
                  {result.meaningZh && <p className="text-sm text-ink">{result.meaningZh}</p>}
                  {result.meaningEn && <p className="text-xs text-accent mt-0.5">{result.meaningEn}</p>}
                </>
              ) : (
                <p className="text-sm text-ink-faint animate-pulse">{t('llm.thinking')}</p>
              )}
            </div>

            <div className="mt-3 pt-2 border-t border-line">
              <p className="text-[10px] text-ink-faint mb-0.5">{t('wordLookup.sentence')}</p>
              <FuriganaText text={tapped.sentence} className="text-xs text-ink-muted leading-relaxed" />
            </div>

            {result && (
              <WordPractice
                key={`${tapped.sentence}|${tapped.start}|${plainWord}`}
                className="mt-3"
                word={plainWord}
                meaningEn={result.meaningEn}
                wordLang={lang === 'ja' ? 'jp' : 'en'}
                analytics="article.lookup"
                leading={isLoggedIn && asSentence
                  ? action(t('wordLookup.saveToList'), () => setSaving(true), false, 'article.lookup.save')
                  : (
                    <a href="/login" data-analytics="article.lookup.login" className="text-xs text-ink-muted underline underline-offset-2 hover:text-ink mr-1">
                      {t('wordLookup.saveLoginHint')}
                    </a>
                  )}
              />
            )}
          </div>
        </div>
      </div>
      </>)}
      {saving && asSentence && <AddToGroupModal word={asSentence} onClose={() => setSaving(false)} />}
    </>,
    document.body,
  );
};

export default WordLookupSheet;
