import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { checkSentence, CheckSentenceResult, getSampleSentence } from '../services/llm.service';
import { pronounceWord } from '../services/tts.service';
import { aiErrorMessage } from '../utils/aiError';
import { stripReadings } from '../utils/wordLookup';
import FuriganaText from './FuriganaText';

/**
 * Practise one word: "AI 例句" fetches an example sentence, "我來造句" lets the
 * learner write their own and has AI check it. Used by the word lookup sheet
 * and the vocabulary quiz. Remount (via `key`) to reset for another word.
 */
const WordPractice: React.FC<{
  /** Plain word, readings stripped. */
  word: string;
  meaningEn?: string;
  wordLang: 'jp' | 'en';
  /** Rendered before the two actions, e.g. a save button. */
  leading?: React.ReactNode;
  /** data-analytics prefix, e.g. 'article.lookup'. */
  analytics: string;
  className?: string;
}> = ({ word, meaningEn = '', wordLang, leading, analytics, className = '' }) => {
  const { t, i18n } = useTranslation();
  const { isLoggedIn } = useAuth();
  const [panel, setPanel] = useState<'example' | 'write' | null>(null);
  const [example, setExample] = useState<{ text: string; loading: boolean } | null>(null);
  const [draft, setDraft] = useState('');
  const [check, setCheck] = useState<{ result?: CheckSentenceResult; error?: string; loading: boolean } | null>(null);
  const plainWord = word;

  const showExample = async () => {
    if (panel === 'example') { setPanel(null); return; }
    setPanel('example');
    if (example?.text) return;
    setExample({ text: '', loading: true });
    try {
      const text = await getSampleSentence(plainWord, meaningEn, i18n.language, wordLang);
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

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        {leading}
        {action(t('wordLookup.aiExample'), showExample, panel === 'example', `${analytics}.example`)}
        {action(t('wordLookup.mySentence'), () => setPanel(p => (p === 'write' ? null : 'write')), panel === 'write', `${analytics}.write`)}
      </div>

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
                    data-analytics={`${analytics}.check`}
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
  );
};

export default WordPractice;
