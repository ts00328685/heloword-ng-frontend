import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useAiInsight } from '../../hooks/useAiInsight';
import { getWordInsight } from '../../services/llm.service';
import { pronounceWord } from '../../services/tts.service';
import { track } from '../../services/analytics.service';
import { stripReadings } from '../../utils/wordLookup';
import { Sentence } from '../../models';
import AddToGroupModal from '../AddToGroupModal';
import AiWordTools from '../AiWordTools';
import FuriganaText from '../FuriganaText';
import TapToLookup from '../TapToLookup';
import WordPractice from '../WordPractice';
import { wordKey } from './boardUtils';

/**
 * Everything you can do with one quiz word, opened by long-pressing it in any
 * play mode: pronounce, save to a word list, AI explanation, AI example,
 * write-your-own sentence (AI-checked), memory hook, pairings and fill-in-the-blank.
 */
const WordToolsSheet: React.FC<{
  word: Sentence;
  onClose: () => void;
  /** Which mode opened it, for analytics: 'blast', 'matching', 'drop', 'choice'. */
  context: string;
}> = ({ word, onClose, context }) => {
  const { t, i18n } = useTranslation();
  const { isLoggedIn } = useAuth();
  const [saving, setSaving] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const insight = useAiInsight('quiz:sheet:insight');

  const raw = word.word || word.sentence || '';
  const plain = stripReadings(raw).text;
  const lang = word.language || 'en';
  const key = wordKey(word);

  useEffect(() => { track('FEATURE', 'quiz.word_sheet', { label: context }); }, [context]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fetchInsight = () => getWordInsight(plain, word.translateEn || '', word.translateCh || '', i18n.language, lang);

  const toggleExplain = () => {
    if (explainOpen) { setExplainOpen(false); return; }
    setExplainOpen(true);
    insight.run(key, fetchInsight);
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

  return ReactDOM.createPortal(
    <>
      {/* Hidden while the save modal (z-50) is open so it isn't covered; closing the modal brings it back. */}
      {!saving && (<>
      <div className="fixed inset-0 z-[55] bg-black/20" onClick={onClose} data-no-analytics />
      <div role="dialog" aria-label={plain} className="fixed inset-x-0 bottom-0 z-[56] flex justify-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl mx-auto mb-[64px] px-4">
          <div className="bg-surface rounded-2xl shadow-2xl border border-line p-4 animate-chatbot-slide-up max-h-[calc(100dvh-140px)] overflow-y-auto overscroll-contain">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <FuriganaText text={raw} className="text-lg font-semibold text-ink leading-relaxed break-words" />
                <button
                  data-analytics="quiz.word_sheet.pronounce"
                  onClick={() => pronounceWord(plain, lang)}
                  className="p-1 rounded-lg text-ink-faint hover:text-ink-muted hover:bg-ink/5 shrink-0"
                  aria-label={t('chatbot.pronounce')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-3-3m3 3l3-3M9 9H5a2 2 0 00-2 2v2a2 2 0 002 2h4l5 5V4L9 9z" />
                  </svg>
                </button>
              </div>
              <button
                data-analytics="quiz.word_sheet.close"
                onClick={onClose}
                className="p-1.5 rounded-lg text-ink-faint hover:bg-ink/5 shrink-0"
                aria-label={t('wordLookup.close')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-1">
              {word.translateCh && <p className="text-sm text-ink">{word.translateCh}</p>}
              {word.translateEn && <p className="text-xs text-accent mt-0.5">{word.translateEn}</p>}
            </div>

            {word.word && word.sentence && (
              <div className="mt-3 pt-2 border-t border-line">
                <p className="text-[10px] text-ink-faint mb-0.5">{t('wordLookup.sentence')}</p>
                <TapToLookup className="text-xs text-ink-muted leading-relaxed" lang={lang === 'jp' ? 'ja' : 'en'}>{word.sentence}</TapToLookup>
              </div>
            )}

            <WordPractice
              className="mt-3"
              word={plain}
              meaningEn={word.translateEn}
              wordLang={lang === 'jp' ? 'jp' : 'en'}
              analytics="quiz.word_sheet"
              leading={<>
                {isLoggedIn
                  ? action(t('wordLookup.save'), () => setSaving(true), false, 'quiz.word_sheet.save')
                  : (
                    <a href="/login" data-analytics="quiz.word_sheet.login" className="text-xs text-ink-muted underline underline-offset-2 hover:text-ink mr-1">
                      {t('wordLookup.saveLoginHint')}
                    </a>
                  )}
                {action(t('llm.insight'), toggleExplain, explainOpen, 'quiz.word_sheet.explain')}
              </>}
            />

            {explainOpen && (
              <div className="mt-3 border-l-2 border-accent pl-3 animate-slide-down">
                {insight.loading ? (
                  <p className="text-sm text-ink-faint animate-pulse">{t('llm.thinking')}</p>
                ) : insight.error ? (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-danger flex-1">{t('llm.error')}</p>
                    <button data-analytics="quiz.word_sheet.explain.retry" onClick={() => insight.retry(key, fetchInsight)} className="text-xs text-accent underline">↺</button>
                  </div>
                ) : (
                  <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap"><TapToLookup>{insight.text}</TapToLookup></p>
                )}
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-line">
              <AiWordTools
                cacheKey={key}
                word={plain}
                wordLang={lang}
                meaningZh={word.translateCh || ''}
                tools={['hook', 'colloc', 'cloze']}
              />
            </div>
          </div>
        </div>
      </div>
      </>)}
      {saving && <AddToGroupModal word={word} onClose={() => setSaving(false)} />}
    </>,
    document.body,
  );
};

export default WordToolsSheet;
