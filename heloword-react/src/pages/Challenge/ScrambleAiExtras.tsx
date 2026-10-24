import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import FuriganaText from '../../components/FuriganaText';
import TapToLookup from '../../components/TapToLookup';
import { AiDisclosure } from '../../components/ui/practice';
import { getNatural, getPoliteness, NaturalResult, PolitenessResult } from '../../services/llm.service';
import { aiScrambleRecap, aiScrambleSimilar, SimilarSentence } from '../../services/scramble.service';
import { pronounceWord } from '../../services/tts.service';
import { aiErrorMessage } from '../../utils/aiError';

type Lang = 'jp' | 'en';

// ── Today's tricky sentences (local, per day) ───────────────────────────────

const TRICKY_KEY = 'hw-scramble-tricky';
const MAX_TRICKY = 20;

interface TrickyItem { lang: Lang; sentence: string; translation: string }

interface TrickyStore {
  date: string;
  items: TrickyItem[];
  /** The previous day's items, mixed back into today's practice once. */
  yesterday?: TrickyItem[];
  yesterdayTaken?: boolean;
}

const today = () => new Date().toLocaleDateString('sv'); // YYYY-MM-DD, local time

function readTricky(): TrickyStore {
  try {
    const raw = JSON.parse(localStorage.getItem(TRICKY_KEY) || 'null') as TrickyStore | null;
    if (raw && raw.date === today() && Array.isArray(raw.items)) return raw;
    // A new day: yesterday's list becomes the one to revisit.
    if (raw && Array.isArray(raw.items)) {
      const rolled: TrickyStore = { date: today(), items: [], yesterday: raw.items, yesterdayTaken: false };
      try { localStorage.setItem(TRICKY_KEY, JSON.stringify(rolled)); } catch {}
      return rolled;
    }
  } catch {}
  return { date: today(), items: [] };
}

/** Today's tricky sentences for a language (newest last). */
export function trickyItems(lang: Lang): TrickyItem[] {
  return readTricky().items.filter((i) => i.lang === lang);
}

/** Yesterday's tricky sentences for a language — returned once per day, then marked taken. */
export function takeYesterdayTricky(lang: Lang): TrickyItem[] {
  const store = readTricky();
  if (store.yesterdayTaken || !store.yesterday?.length) return [];
  const mine = store.yesterday.filter((i) => i.lang === lang);
  if (mine.length === 0) return [];
  store.yesterday = store.yesterday.filter((i) => i.lang !== lang);
  store.yesterdayTaken = store.yesterday.length === 0;
  try { localStorage.setItem(TRICKY_KEY, JSON.stringify(store)); } catch {}
  return mine;
}

/**
 * Remember a sentence the learner struggled with today (used a hint, showed the
 * answer, reset, or asked why the order was wrong). Deduplicated, capped.
 * Returns the new count for that language.
 */
export function recordTricky(lang: Lang, sentence: string | undefined, translation: string | undefined): number {
  const store = readTricky();
  if (sentence && !store.items.some((i) => i.lang === lang && i.sentence === sentence)) {
    store.items = [...store.items, { lang, sentence, translation: translation ?? '' }].slice(-MAX_TRICKY);
    try { localStorage.setItem(TRICKY_KEY, JSON.stringify(store)); } catch {}
  }
  return store.items.filter((i) => i.lang === lang).length;
}

export function countTricky(lang: Lang): number {
  return readTricky().items.filter((i) => i.lang === lang).length;
}

// ── Shared bits ──────────────────────────────────────────────────────────────

const SpeakBtn: React.FC<{ text: string; lang: Lang; label: string }> = ({ text, lang, label }) => (
  <button
    onClick={() => pronounceWord(text, lang)}
    className="shrink-0 p-1 text-ink-faint hover:text-accent transition-colors"
    aria-label={label}
    title={label}
  >
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
    </svg>
  </button>
);

/** One labelled line: small label, sentence with furigana, speak button. */
const Variant: React.FC<{ label: string; text: string; lang: Lang }> = ({ label, text, lang }) => (
  <div className="flex items-start gap-3 py-1.5">
    <span className="shrink-0 w-12 pt-0.5 text-[11px] text-ink-faint">{label}</span>
    <p className="flex-1 text-sm text-ink leading-relaxed"><TapToLookup><FuriganaText text={text} /></TapToLookup></p>
    <SpeakBtn text={text.replace(/\[[^\]]*\]/g, '')} lang={lang} label={label} />
  </div>
);

// ── Just-solved strip: natural phrasing, politeness, one more like this ─────

export interface SolvedSentence {
  lang: Lang;
  sentence: string;
  translation: string;
}

type Panel = 'natural' | 'polite' | null;

/**
 * Actions on the sentence just solved. It stays until the next solve, so the
 * game can keep auto-advancing without these vanishing before you tap them.
 */
export const JustSolvedStrip: React.FC<{
  solved: SolvedSentence;
  isLoggedIn: boolean;
  onPlay: (item: SimilarSentence, lang: Lang) => void;
}> = ({ solved, isLoggedIn, onPlay }) => {
  const { t } = useTranslation();
  const [panel, setPanel] = useState<Panel>(null);
  const [natural, setNatural] = useState<NaturalResult | null>(null);
  const [polite, setPolite] = useState<PolitenessResult | null>(null);
  const [loading, setLoading] = useState<Panel | 'similar'>(null);
  const [error, setError] = useState('');
  const [forSentence, setForSentence] = useState(solved.sentence);

  // A new solve resets the cached answers.
  if (forSentence !== solved.sentence) {
    setForSentence(solved.sentence);
    setPanel(null); setNatural(null); setPolite(null); setError('');
  }

  const fail = (e: unknown) =>
    setError((e as Error)?.message?.startsWith('AI_') ? aiErrorMessage(e, isLoggedIn) : t('scramble.aiError'));

  const open = async (which: Exclude<Panel, null>) => {
    if (panel === which) { setPanel(null); return; }
    setPanel(which); setError('');
    if ((which === 'natural' && natural) || (which === 'polite' && polite)) return;
    setLoading(which);
    try {
      if (which === 'natural') setNatural(await getNatural(solved.sentence));
      else setPolite(await getPoliteness(solved.sentence));
    } catch (e) { fail(e); } finally { setLoading(null); }
  };

  const similar = async () => {
    setLoading('similar'); setError('');
    try {
      const item = await aiScrambleSimilar({ lang: solved.lang, sentence: solved.sentence, translation: solved.translation });
      onPlay(item, solved.lang);
    } catch (e) {
      if ((e as Error)?.message?.startsWith('AI_')) fail(e);
      else setError(t('scramble.similarError'));
    } finally { setLoading(null); }
  };

  const action = (label: string, onClick: () => void, active: boolean, busy: boolean) => (
    <button
      onClick={onClick}
      disabled={loading !== null}
      className={`h-8 px-3 rounded-md border text-xs transition-colors disabled:opacity-50 ${
        active ? 'border-ink text-ink bg-ink/5' : 'border-line text-ink-muted hover:text-ink hover:border-ink/30'
      }`}
    >
      {busy ? <span className="animate-pulse">{t('llm.thinking')}</span> : label}
    </button>
  );

  return (
    <section className="rounded-md border border-line bg-surface px-3 py-3">
      <div className="flex items-baseline gap-2 mb-2.5">
        <span className="text-[11px] tracking-wide text-ink-faint shrink-0">{t('scramble.justSolved')}</span>
        <p className="text-xs text-ink-muted truncate"><FuriganaText text={solved.sentence} /></p>
      </div>
      <div className="flex flex-wrap gap-2">
        {action(t('scramble.aiNatural'), () => open('natural'), panel === 'natural', loading === 'natural')}
        {solved.lang === 'jp' && action(t('scramble.aiPoliteness'), () => open('polite'), panel === 'polite', loading === 'polite')}
        {action(t('scramble.aiSimilar'), similar, false, loading === 'similar')}
      </div>

      {error && <p className="mt-2.5 text-xs text-danger">{error}</p>}

      {panel === 'natural' && natural && (
        <div className="mt-3 border-l-2 border-accent pl-3 animate-slide-down">
          <Variant label={t('scramble.naturalLabel')} text={natural.natural} lang={solved.lang} />
          <Variant label={t('scramble.casualLabel')} text={natural.casual} lang={solved.lang} />
          {natural.note && <p className="mt-1 text-xs text-ink-muted leading-relaxed">{natural.note}</p>}
        </div>
      )}
      {panel === 'polite' && polite && (
        <div className="mt-3 border-l-2 border-accent pl-3 animate-slide-down">
          <Variant label={t('scramble.politeCasual')} text={polite.casual} lang="jp" />
          <Variant label={t('scramble.politePolite')} text={polite.polite} lang="jp" />
          <Variant label={t('scramble.politeKeigo')} text={polite.keigo} lang="jp" />
        </div>
      )}
    </section>
  );
};

// ── Today's tricky-grammar recap ─────────────────────────────────────────────

const AiRecapMarkdown: React.FC<{ text: string }> = ({ text }) => (
  <div className="text-sm text-ink leading-relaxed space-y-2">
    {text.split('\n').filter((l) => l.trim()).map((line, i) => (
      <p key={i}><TapToLookup><FuriganaText text={line.replace(/^\s*[-*•]\s*/, '• ').replace(/\*\*/g, '')} /></TapToLookup></p>
    ))}
  </div>
);

/** "Today's tricky points": an AI summary of the grammar behind today's hard sentences. */
export const TrickyRecap: React.FC<{ lang: Lang; count: number; isLoggedIn: boolean }> = ({ lang, count, isLoggedIn }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ count: number; lang: Lang; text: string } | null>(null);

  if (count === 0) return null;

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (result && result.count === count && result.lang === lang) return;
    setLoading(true);
    try {
      const items = readTricky().items.filter((i) => i.lang === lang).slice(-10)
        .map(({ sentence, translation }) => ({ sentence, translation }));
      setResult({ count, lang, text: await aiScrambleRecap({ lang, items }) });
    } catch (e) {
      setResult({
        count, lang,
        text: (e as Error)?.message?.startsWith('AI_') ? aiErrorMessage(e, isLoggedIn) : t('scramble.aiError'),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AiDisclosure
      label={t('scramble.recap', { count })}
      analytics="ai.scramble_recap"
      open={open}
      loading={loading}
      loadingText={t('scramble.aiThinking')}
      onToggle={toggle}
    >
      {result && <AiRecapMarkdown text={result.text} />}
    </AiDisclosure>
  );
};
