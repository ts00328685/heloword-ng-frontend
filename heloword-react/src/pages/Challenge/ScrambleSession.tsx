import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Session structure for sentence scramble: a daily set (or a "today's mistakes"
 * set) with a progress bar and an end card, an in-a-row streak, and a queue
 * that brings back sentences you needed help with.
 */

export const SET_SIZE = 10;

export interface ScrambleRun {
  kind: 'daily' | 'mistakes';
  total: number;
  done: number;
  /** Solved without hint / show answer / reset / skip. */
  clean: number;
  bestStreak: number;
  startedAt: number;
  finishedAt?: number;
  /** Sentences to play, in order (mistakes set only). */
  queue?: string[];
}

/** A sentence to bring back once `dueAt` sentences have been finished this session. */
export interface RetryItem {
  lang: 'jp' | 'en';
  sentence: string;
  dueAt: number;
  /** How many times it has already come back. */
  returns: number;
}

/** How many sentences later a missed one comes back. */
export const RETRY_GAP = 3;
/** A sentence comes back at most this many times per session. */
export const MAX_RETURNS = 2;

export function newRun(kind: ScrambleRun['kind'], queue?: string[]): ScrambleRun {
  return {
    kind,
    total: queue ? queue.length : SET_SIZE,
    done: 0,
    clean: 0,
    bestStreak: 0,
    startedAt: Date.now(),
    queue,
  };
}

// ── Top row: streak + set progress / start ─────────────────────────────────────

export const SessionBar: React.FC<{
  run: ScrambleRun | null;
  streak: number;
  /** The sentence on screen has already been counted (solved / answer shown). */
  counted: boolean;
  onStartDaily: () => void;
  onEndRun: () => void;
}> = ({ run, streak, counted, onStartDaily, onEndRun }) => {
  const { t } = useTranslation();
  const active = run && !run.finishedAt;
  // Number of the sentence on screen: stays put until the next one appears.
  const current = run ? (counted ? run.done : run.done + 1) : 0;
  return (
    <div className="flex items-center gap-3 min-h-[32px]">
      {active ? (
        <>
          <div className="flex-1 flex gap-1" aria-label={t('scramble.dailyProgress', { n: current, total: run.total })}>
            {Array.from({ length: run.total }, (_, i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                  i < run.done ? 'bg-ink' : i === run.done && !counted ? 'bg-accent' : 'bg-ink/10'
                }`}
              />
            ))}
          </div>
          <span className="text-xs tabular-nums text-ink-muted shrink-0">{current} / {run.total}</span>
          <button onClick={onEndRun} className="text-xs text-ink-faint hover:text-ink transition-colors shrink-0">
            {t('scramble.endSet')}
          </button>
        </>
      ) : run?.finishedAt ? null : (
        <button
          onClick={onStartDaily}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line bg-surface text-xs text-ink hover:border-ink/30 transition-colors"
        >
          {t('scramble.dailySet')}
          <svg className="w-3 h-3 text-ink-faint" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>
      )}
      <span
        className={`ml-auto shrink-0 text-xs tabular-nums transition-colors ${streak >= 3 ? 'text-accent' : 'text-ink-faint'}`}
        aria-live="polite"
      >
        {streak > 0 ? t('scramble.streak', { count: streak }) : ''}
      </span>
    </div>
  );
};

// ── End card ─────────────────────────────────────────────────────────────────

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const RunEndCard: React.FC<{
  run: ScrambleRun;
  mistakesCount: number;
  onAgain: () => void;
  onMistakes: () => void;
  onFree: () => void;
}> = ({ run, mistakesCount, onAgain, onMistakes, onFree }) => {
  const { t } = useTranslation();
  const pct = run.total > 0 ? Math.round((run.clean / run.total) * 100) : 0;
  const stats = [
    { label: t('scramble.cleanSolves'), value: `${run.clean} / ${run.total}` },
    { label: t('scramble.accuracy'), value: `${pct}%` },
    { label: t('scramble.timeUsed'), value: fmtTime((run.finishedAt ?? Date.now()) - run.startedAt) },
    { label: t('scramble.bestStreak'), value: String(run.bestStreak) },
  ];
  return (
    <section className="rounded-md border border-line bg-surface px-5 py-6 animate-fade-in">
      <p className="text-[11px] tracking-wide text-ink-faint">
        {run.kind === 'mistakes' ? t('scramble.mistakesSet') : t('scramble.dailySet')}
      </p>
      <h2 className="font-serif text-2xl text-ink mt-2">
        {pct >= 80 ? t('scramble.endGreat') : t('scramble.endDone')}
      </h2>
      <dl className="grid grid-cols-2 gap-px mt-5 rounded-md overflow-hidden border border-line bg-line">
        {stats.map((s) => (
          <div key={s.label} className="bg-surface px-3 py-3">
            <dt className="text-[11px] text-ink-faint">{s.label}</dt>
            <dd className="font-serif text-xl text-ink tabular-nums mt-1">{s.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 flex flex-wrap gap-2">
        <button onClick={onAgain} className="h-10 px-4 rounded-md bg-ink text-paper text-sm font-medium hover:bg-ink/85 transition-colors">
          {t('scramble.again')}
        </button>
        {mistakesCount > 0 && (
          <button onClick={onMistakes} className="h-10 px-4 rounded-md border border-line text-sm text-ink hover:border-ink/30 transition-colors">
            {t('scramble.practiceMistakes', { count: mistakesCount })}
          </button>
        )}
        <button onClick={onFree} className="h-10 px-3 text-sm text-ink-muted hover:text-ink transition-colors">
          {t('scramble.backToFree')}
        </button>
      </div>
    </section>
  );
};

// ── Tap feedback (opt-in) ────────────────────────────────────────────────────

let audioCtx: AudioContext | null = null;

/** A very short, soft tick plus a light vibration where supported. */
export function tapFeedback(): void {
  try { navigator.vibrate?.(8); } catch {}
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.05);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
  } catch {}
}
