import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useAiInsight } from '../hooks/useAiInsight';
import {
  checkSentence, CheckSentenceResult, ClozeResult, getCloze, getCollocations, getMemoryHook,
} from '../services/llm.service';
import { aiErrorMessage } from '../utils/aiError';

type Tool = 'hook' | 'colloc' | 'cloze' | 'check';

interface Props {
  /** Stable id for client-side caching, e.g. a chat entry id */
  cacheKey: string;
  word: string;
  wordLang: string;
  meaningZh?: string;
  /** Called when a tool opens, so the parent can close its own panels */
  onOpen?: () => void;
}

const pillClass = (active: boolean) =>
  `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide transition-all duration-150 ${
    active
      ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 ring-1 ring-gray-800 dark:ring-gray-100'
      : 'text-gray-400 dark:text-gray-500 ring-1 ring-inset ring-gray-200 dark:ring-gray-700 hover:ring-gray-400 dark:hover:ring-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
  }`;

const Spark = () => (
  <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M5 0L6 4L10 5L6 6L5 10L4 6L0 5L4 4Z"/></svg>
);

/** Strips 漢字[かな] readings so typed answers can be compared with the plain form. */
const plain = (s: string) => s.replace(/\[[^\]]*\]/g, '').trim().toLowerCase();

/**
 * Extra AI learning tools for a single word: memory hook, common pairings,
 * fill-in-the-blank and "check my sentence". Each call counts toward the daily AI quota.
 */
const AiWordTools: React.FC<Props> = ({ cacheKey, word, wordLang, meaningZh = '', onOpen }) => {
  const { t } = useTranslation();
  const { isLoggedIn } = useAuth();
  const [open, setOpen] = useState<Tool | null>(null);

  const hook = useAiInsight('tools:hook');
  const colloc = useAiInsight('tools:colloc');

  const [cloze, setCloze] = useState<ClozeResult | null>(null);
  const [clozeInput, setClozeInput] = useState('');
  const [clozeResult, setClozeResult] = useState<'correct' | 'wrong' | 'revealed' | null>(null);

  const [sentence, setSentence] = useState('');
  const [check, setCheck] = useState<CheckSentenceResult | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = (tool: Tool) => {
    if (open === tool) { setOpen(null); return; }
    setOpen(tool);
    setError('');
    onOpen?.();
    if (tool === 'hook') hook.run(cacheKey, () => getMemoryHook(word, wordLang, meaningZh));
    if (tool === 'colloc') {
      colloc.run(cacheKey, () => getCollocations(word, wordLang)
        .then(list => list.map(c => `${c.phrase}　${c.meaning}`).join('\n')));
    }
    if (tool === 'cloze' && !cloze) loadCloze();
  };

  const loadCloze = async () => {
    setBusy(true);
    try {
      setCloze(await getCloze(word, wordLang));
    } catch (e) {
      setError(aiErrorMessage(e, isLoggedIn));
    } finally {
      setBusy(false);
    }
  };

  const submitCloze = () => {
    if (!cloze || !clozeInput.trim()) return;
    const ok = [cloze.answer, word].some(a => plain(a) === plain(clozeInput));
    setClozeResult(ok ? 'correct' : 'wrong');
  };

  const submitCheck = async () => {
    if (!sentence.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      setCheck(await checkSentence(word, wordLang, sentence.trim()));
    } catch (e) {
      setError(aiErrorMessage(e, isLoggedIn));
    } finally {
      setBusy(false);
    }
  };

  const textPanel = (state: ReturnType<typeof useAiInsight>) =>
    state.loading ? (
      <p className="text-xs text-gray-400 dark:text-gray-500 animate-pulse">{t('llm.thinking')}</p>
    ) : state.error ? (
      <p className="text-xs text-red-400">{t('llm.error')}</p>
    ) : (
      <p className="text-xs text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{state.text}</p>
    );

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {(['hook', 'colloc', 'cloze', 'check'] as Tool[]).map(tool => (
          <button key={tool} onClick={() => toggle(tool)} className={pillClass(open === tool)}>
            <Spark />
            {t({ hook: 'llm.memoryHook', colloc: 'llm.collocations', cloze: 'llm.cloze', check: 'llm.checkSentence' }[tool])}
            {open === tool && ' ▲'}
          </button>
        ))}
      </div>

      {open && (
        <div className="mt-2 animate-slide-down">
          <div className="bg-gray-50 dark:bg-white/[0.04] rounded-xl p-3 ring-1 ring-inset ring-gray-100 dark:ring-white/[0.06] space-y-2">
            {open === 'hook' && textPanel(hook)}
            {open === 'colloc' && textPanel(colloc)}

            {open === 'cloze' && (
              busy && !cloze ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 animate-pulse">{t('llm.thinking')}</p>
              ) : cloze ? (
                <>
                  <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed">{cloze.sentence}</p>
                  {cloze.translation && <p className="text-xs text-gray-500 dark:text-gray-400">{cloze.translation}</p>}
                  <div className="flex gap-1.5">
                    <input
                      value={clozeInput}
                      maxLength={60}
                      onChange={e => { setClozeInput(e.target.value); setClozeResult(null); }}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submitCloze(); }}
                      placeholder={t('llm.clozePlaceholder')}
                      className="flex-1 min-w-0 px-2 py-1 text-xs rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    <button onClick={submitCloze} className="px-2 py-1 text-xs rounded-lg bg-blue-500 text-white hover:bg-blue-600">{t('llm.clozeCheck')}</button>
                    <button onClick={() => setClozeResult('revealed')} className="px-2 py-1 text-xs rounded-lg text-gray-500 ring-1 ring-inset ring-gray-200 dark:ring-gray-700">{t('llm.clozeReveal')}</button>
                  </div>
                  {clozeResult === 'correct' && <p className="text-xs text-green-600 dark:text-green-400">{t('llm.clozeCorrect')}</p>}
                  {clozeResult === 'wrong' && <p className="text-xs text-red-400">{t('llm.clozeWrong')}</p>}
                  {clozeResult === 'revealed' && <p className="text-xs text-gray-700 dark:text-gray-200 font-medium">{cloze.answer}</p>}
                </>
              ) : null
            )}

            {open === 'check' && (
              <>
                <div className="flex gap-1.5 items-end">
                  <textarea
                    value={sentence}
                    maxLength={200}
                    rows={2}
                    onChange={e => { setSentence(e.target.value); setCheck(null); }}
                    placeholder={t('llm.checkPlaceholder')}
                    className="flex-1 min-w-0 px-2 py-1 text-xs rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <button
                    onClick={submitCheck}
                    disabled={!sentence.trim() || busy}
                    className="px-2 py-1 text-xs rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40"
                  >
                    {busy ? '…' : t('llm.checkSubmit')}
                  </button>
                </div>
                {check && (
                  check.ok
                    ? <p className="text-xs text-green-600 dark:text-green-400">{t('llm.sentenceCorrect')}</p>
                    : <p className="text-xs text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{check.fix}</p>
                )}
              </>
            )}

            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
};

export default AiWordTools;
