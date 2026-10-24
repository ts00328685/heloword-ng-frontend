import React, { useState } from 'react';
import TapToLookup from './TapToLookup';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { explainSentence, ExplainSentenceResult } from '../services/llm.service';
import { aiErrorMessage } from '../utils/aiError';

const SESSION_PREFIX = 'ai:explain-sentence:';

function readCache(sentence: string): ExplainSentenceResult | null {
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + sentence);
    return raw ? (JSON.parse(raw) as ExplainSentenceResult) : null;
  } catch {
    return null;
  }
}

function writeCache(sentence: string, result: ExplainSentenceResult) {
  try { sessionStorage.setItem(SESSION_PREFIX + sentence, JSON.stringify(result)); } catch {}
}

/**
 * "解析這句": the sentence split into chunks with what each one does, the
 * grammar points worth knowing, and a natural translation. Remount (via `key`)
 * for another sentence.
 */
const SentenceBreakdown: React.FC<{ sentence: string; analytics: string }> = ({ sentence, analytics }) => {
  const { t } = useTranslation();
  const { isLoggedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ExplainSentenceResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const cached = readCache(sentence);
    if (cached) { setResult(cached); return; }
    setLoading(true);
    setError('');
    try {
      const r = await explainSentence(sentence);
      writeCache(sentence, r);
      setResult(r);
    } catch (e) {
      setError(aiErrorMessage(e, isLoggedIn));
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (!result && !loading) load();
  };

  return (
    <div>
      <button
        data-analytics={analytics}
        onClick={toggle}
        aria-expanded={open}
        className="mt-1.5 inline-flex items-center gap-1 text-xs text-accent hover:underline underline-offset-2"
      >
        {t('sentenceBreakdown.action')}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
      </button>

      {open && (
        <div className="mt-2 animate-slide-down">
          {loading && <p className="text-sm text-ink-faint animate-pulse">{t('llm.thinking')}</p>}
          {error && (
            <div className="flex items-center gap-2">
              <p className="text-xs text-danger flex-1">{error}</p>
              <button onClick={load} className="text-xs text-accent underline">↺</button>
            </div>
          )}
          {result && (
            <div className="space-y-3">
              <ol className="rounded-md border border-line divide-y divide-line">
                {result.chunks.map((c, i) => (
                  <li key={i} className="flex gap-3 px-3 py-2">
                    <span className="text-[11px] text-ink-faint tabular-nums pt-0.5 w-3 shrink-0">{i + 1}</span>
                    <span className="min-w-0">
                      <TapToLookup as="div" className="text-sm text-ink leading-relaxed">{c.text}</TapToLookup>
                      <span className="block text-xs text-ink-muted mt-0.5">{c.note}</span>
                    </span>
                  </li>
                ))}
              </ol>
              {result.points.length > 0 && (
                <div>
                  <p className="text-[10px] text-ink-faint mb-1">{t('sentenceBreakdown.points')}</p>
                  <ul className="space-y-1">
                    {result.points.map((p, i) => (
                      <li key={i} className="text-xs leading-relaxed">
                        <TapToLookup className="text-ink font-medium">{p.text}</TapToLookup>
                        <span className="text-ink-muted">：{p.note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="border-l-2 border-accent pl-3">
                <p className="text-[10px] text-ink-faint mb-0.5">{t('sentenceBreakdown.translation')}</p>
                <p className="text-sm text-ink leading-relaxed">{result.translation}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SentenceBreakdown;
