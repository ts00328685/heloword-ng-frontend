import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import FuriganaText, { renderFurigana } from '../../components/FuriganaText';
import { useSessionState } from '../../hooks/useSessionState';
import { NHKParagraph, NHKVocabItem } from '../../services/nhkArticle.service';
import { findReadings, ReadingSpan, useFuriganaMode } from '../../utils/furigana';
import { LookupLang, stripReadings } from '../../utils/wordLookup';

/**
 * Recall mode for articles: the article's vocabulary words are blanked out in
 * the text, showing only their meaning as a cue. Tap a blank to reveal the
 * word, then mark whether you remembered it. Forgotten words are listed at the
 * end so they can be looked up and saved.
 */

/** 'shown' = revealed but not yet marked. */
export type RecallMark = 'shown' | 'knew' | 'missed';

export interface RecallTarget {
  start: number;
  end: number;
  /** `${paragraphIndex}:${vocabIndex}` — every occurrence of a word shares it. */
  key: string;
  item: NHKVocabItem;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** Widen [start, end) so it never cuts through a 漢字[かな] unit. */
function snapOut(spans: ReadingSpan[], start: number, end: number): [number, number] {
  for (const s of spans) {
    if (start > s.start && start < s.end) start = s.start;
    if (end > s.start && end < s.end) end = s.end;
  }
  return [start, end];
}

/** Where each vocabulary word appears in the displayed paragraph (non-overlapping, in order). */
export function findRecallTargets(display: string, vocab: NHKVocabItem[], lang: LookupLang, paragraphIndex: number): RecallTarget[] {
  const { text, map } = stripReadings(display);
  const haystack = lang === 'en' ? text.toLowerCase() : text;
  const spans = findReadings(display);
  // `len` = matched characters, so a longer word wins even when snapping makes spans equal.
  const found: (RecallTarget & { len: number })[] = [];

  vocab.forEach((item, v) => {
    const plain = stripReadings(item.word || '').text.trim();
    if (!plain) return;
    let needle = lang === 'en' ? plain.toLowerCase() : plain;
    // Japanese words are listed in dictionary form (迎える) but often appear
    // conjugated (迎えました): fall back to the kanji stem when it's specific enough.
    if (lang === 'ja' && !haystack.includes(needle)) {
      const stem = needle.replace(/[ぁ-ゖ]+$/, '');
      if (stem.length < 2 || stem === needle) return;
      needle = stem;
    }
    for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) {
      const end = i + needle.length;
      if (lang === 'en' && (WORD_CHAR.test(haystack[i - 1] ?? '') || WORD_CHAR.test(haystack[end] ?? ''))) continue;
      const [s, e] = snapOut(spans, map[i], map[end - 1] + 1);
      found.push({ start: s, end: e, key: `${paragraphIndex}:${v}`, item, len: needle.length });
    }
  });

  // Longer words win when occurrences overlap.
  found.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start) || b.len - a.len);
  const out: RecallTarget[] = [];
  for (const { len: _len, ...t } of found) {
    if (out.length && t.start < out[out.length - 1].end) continue;
    out.push(t);
  }
  return out;
}

/** Recall mode on/off and marks, kept for the article across navigation. */
export function useArticleRecall(articleKey: string) {
  const [on, setOn] = useSessionState<boolean>('article-recall:on', false);
  const [marks, setMarks] = useSessionState<Record<string, RecallMark>>(`article-recall:${articleKey}`, {});
  const setMark = useCallback(
    (key: string, mark: RecallMark) => setMarks((m) => ({ ...m, [key]: mark })),
    [setMarks],
  );
  const reset = useCallback(() => setMarks({}), [setMarks]);
  return { on, toggle: () => setOn((v) => !v), marks, setMark, reset };
}

// ── Paragraph text with blanks ───────────────────────────────────────────────

export const RecallText: React.FC<{
  text: string;
  targets: RecallTarget[];
  marks: Record<string, RecallMark>;
  onMark: (key: string, mark: RecallMark) => void;
}> = ({ text, targets, marks, onMark }) => {
  const { t } = useTranslation();
  const mode = useFuriganaMode();
  const piece = (from: number, to: number) => (to > from ? renderFurigana(text.slice(from, to), mode) : null);

  const out: React.ReactNode[] = [];
  let last = 0;
  targets.forEach((target, i) => {
    out.push(<React.Fragment key={`t${i}`}>{piece(last, target.start)}</React.Fragment>);
    const mark = marks[target.key];
    const word = piece(target.start, target.end);
    if (!mark) {
      out.push(
        <button
          key={`b${i}`}
          type="button"
          onClick={() => onMark(target.key, 'shown')}
          aria-label={t('articleRecall.reveal')}
          className="mx-0.5 px-1.5 rounded-sm border-b border-dashed border-accent bg-accent-soft text-[0.78em] text-accent align-baseline hover:bg-accent/15 transition-colors"
        >
          {target.item.meaning_zh || target.item.meaning_en || '＿＿'}
        </button>,
      );
    } else if (mark === 'shown') {
      out.push(
        <span key={`b${i}`} className="whitespace-nowrap">
          <span className="text-accent">{word}</span>
          <button
            type="button"
            onClick={() => onMark(target.key, 'knew')}
            aria-label={t('articleRecall.knew')}
            className="ml-1 inline-flex items-center justify-center w-6 h-6 align-middle rounded-full border border-line text-success hover:border-success/50"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
          </button>
          <button
            type="button"
            onClick={() => onMark(target.key, 'missed')}
            aria-label={t('articleRecall.missed')}
            className="ml-1 inline-flex items-center justify-center w-6 h-6 align-middle rounded-full border border-line text-danger hover:border-danger/50"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </span>,
      );
    } else {
      out.push(
        <span
          key={`b${i}`}
          className={`underline decoration-2 underline-offset-4 ${mark === 'knew' ? 'decoration-success/60' : 'decoration-danger/60'}`}
        >
          {word}
        </span>,
      );
    }
    last = target.end;
  });
  out.push(<React.Fragment key="tail">{piece(last, text.length)}</React.Fragment>);
  return <>{out}</>;
};

// ── Summary ──────────────────────────────────────────────────────────────────

export function recallTargetsByParagraph(paragraphs: NHKParagraph[], lang: LookupLang): RecallTarget[][] {
  return paragraphs.map((p, i) => findRecallTargets(p.original, p.vocabulary ?? [], lang, i));
}

export const RecallSummary: React.FC<{
  targets: RecallTarget[][];
  marks: Record<string, RecallMark>;
  onWordTap: (paragraphIndex: number, item: NHKVocabItem) => void;
  onReset: () => void;
}> = ({ targets, marks, onWordTap, onReset }) => {
  const { t } = useTranslation();
  const words = useMemo(() => {
    const seen = new Map<string, RecallTarget>();
    targets.flat().forEach((tg) => { if (!seen.has(tg.key)) seen.set(tg.key, tg); });
    return [...seen.values()];
  }, [targets]);
  if (words.length === 0) return null;

  const knew = words.filter((w) => marks[w.key] === 'knew').length;
  const missed = words.filter((w) => marks[w.key] === 'missed');
  const left = words.length - knew - missed.length;

  return (
    <section className="rounded-xl border border-line bg-surface p-4 mb-5" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-ink">
          {left === 0 ? t('articleRecall.done') : t('articleRecall.progress', { left })}
        </p>
        <button onClick={onReset} className="text-xs text-ink-faint hover:text-ink transition-colors">
          {t('articleRecall.reset')}
        </button>
      </div>
      <p className="text-xs text-ink-muted mt-1 tabular-nums">
        {t('articleRecall.score', { knew, missed: missed.length, total: words.length })}
      </p>
      {missed.length > 0 && (
        <div className="mt-3 pt-3 border-t border-line">
          <p className="text-[11px] text-ink-faint mb-2">{t('articleRecall.missedList')}</p>
          <div className="flex flex-wrap gap-2">
            {missed.map((w) => (
              <button
                key={w.key}
                data-analytics="article.recall.missed_word"
                onClick={() => onWordTap(Number(w.key.split(':')[0]), w.item)}
                className="h-auto min-h-[32px] px-2.5 py-1 rounded-md border border-line text-sm text-ink hover:border-ink/30 transition-colors"
              >
                <FuriganaText text={w.item.word} />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
