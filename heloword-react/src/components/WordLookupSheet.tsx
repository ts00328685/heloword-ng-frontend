import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { checkSentence, CheckSentenceResult, getSampleSentence, lookupWord, LookupResult } from '../services/llm.service';
import { pronounceWord } from '../services/tts.service';
import { track } from '../services/analytics.service';
import { aiErrorMessage } from '../utils/aiError';
import { LookupLang, stripReadings, TappedWord } from '../utils/wordLookup';
import { Sentence } from '../models';
import AddToGroupModal from './AddToGroupModal';
import FuriganaText from './FuriganaText';

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
  const { t, i18n } = useTranslation();
  const { isLoggedIn } = useAuth();
  const [result, setResult] = useState<LookupResult | null>(null);
  const [source, setSource] = useState<Source>('ai');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // Practice actions: an AI example sentence, or the learner's own sentence checked by AI.
  const [panel, setPanel] = useState<'example' | 'write' | null>(null);
  const [example, setExample] = useState<{ text: string; loading: boolean } | null>(null);
  const [draft, setDraft] = useState('');
  const [check, setCheck] = useState<{ result?: CheckSentenceResult; error?: string; loading: boolean } | null>(null);
  const latest = useRef(tapped);
  latest.current = tapped;

  useEffect(() => {
    setError('');
    setPanel(null); setExample(null); setDraft(''); setCheck(null);
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
  const wordLang = lang === 'ja' ? 'jp' : 'en';

  const showExample = async () => {
    if (panel === 'example') { setPanel(null); return; }
    setPanel('example');
    if (example?.text) return;
    setExample({ text: '', loading: true });
    try {
      const text = await getSampleSentence(plainWord, result?.meaningEn ?? '', i18n.language, wordLang);
      setExample({ text, loading: false });
    } catch (e) {
      setExample({ text: aiErrorMessage(e, isLoggedIn), loading: false });
    }
  };

  const runCheck = async () => {
    const sentence = draft.trim();
    if (!sentence) return;
    setCheck({ loading: true });
    try {
      setCheck({ result: await checkSentence(plainWord, wordLang, sentence), loading: false });
    } catch (e) {
      setCheck({ error: aiErrorMessage(e, isLoggedIn), loading: false });
    }
  };

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
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {isLoggedIn && asSentence
                  ? action(t('wordLookup.saveToList'), () => setSaving(true), false, 'article.lookup.save')
                  : (
                    <a href="/login" data-analytics="article.lookup.login" className="text-xs text-ink-muted underline underline-offset-2 hover:text-ink mr-1">
                      {t('wordLookup.saveLoginHint')}
                    </a>
                  )}
                {action(t('wordLookup.aiExample'), showExample, panel === 'example', 'article.lookup.example')}
                {action(t('wordLookup.mySentence'), () => setPanel(p => (p === 'write' ? null : 'write')), panel === 'write', 'article.lookup.write')}
              </div>
            )}

            {panel === 'example' && example && (
              <div className="mt-3 border-l-2 border-accent pl-3 animate-slide-down">
                {example.loading
                  ? <p className="text-sm text-ink-faint animate-pulse">{t('llm.thinking')}</p>
                  : (
                    <div className="flex items-start gap-2">
                      <p className="flex-1 text-sm text-ink leading-relaxed whitespace-pre-wrap"><FuriganaText text={example.text} /></p>
                      <button
                        onClick={() => pronounceWord(stripReadings(example.text.split('\n')[0]).text, wordLang)}
                        className="shrink-0 p-1 text-ink-faint hover:text-accent"
                        aria-label={t('chatbot.pronounce')}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg>
                      </button>
                    </div>
                  )}
              </div>
            )}

            {panel === 'write' && (
              <div className="mt-3 space-y-2 animate-slide-down">
                <div className="flex gap-2">
                  <input
                    value={draft}
                    onChange={(e) => { setDraft(e.target.value); setCheck(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') runCheck(); }}
                    placeholder={t('wordLookup.writePlaceholder', { word: plainWord })}
                    className="flex-1 min-w-0 h-9 px-3 rounded-md border border-line bg-surface text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-ink/40"
                  />
                  <button
                    data-analytics="article.lookup.check"
                    onClick={runCheck}
                    disabled={!draft.trim() || check?.loading}
                    className="shrink-0 h-9 px-3 rounded-md bg-ink text-paper text-xs font-medium disabled:opacity-40"
                  >
                    {check?.loading ? '…' : t('wordLookup.check')}
                  </button>
                </div>
                {check && !check.loading && (
                  check.error
                    ? <p className="text-xs text-danger">{check.error}</p>
                    : check.result?.ok
                      ? <p className="text-xs text-success">{t('wordLookup.checkOk')}</p>
                      : (
                        <p className="text-xs text-ink leading-relaxed border-l-2 border-accent pl-2">
                          <span className="text-ink-muted">{t('wordLookup.checkFix')}</span> <FuriganaText text={check.result?.fix ?? ''} />
                        </p>
                      )
                )}
              </div>
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
