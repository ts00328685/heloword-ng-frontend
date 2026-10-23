import React from 'react';
import { useTranslation } from 'react-i18next';
import { KeySig, ROOT_LABELS, SCALES, spellNote } from './music';
import { usePersistedState } from './usePersistedState';
import { TargetTally } from './stats';

/** Target picker range: C2 … C6, a generous singing range. */
const TARGET_NOTES = Array.from({ length: 49 }, (_, i) => 84 - i);
export const TOLERANCES = [10, 25, 50];

interface Props {
  keyRoot: number;
  keyScale: number;
  onKeyRoot: (root: number) => void;
  onKeyScale: (scale: number) => void;
  keySig: KeySig | null;

  target: number | null;
  onTarget: (midi: number | null) => void;
  tolerance: number;
  onTolerance: (cents: number) => void;
  onPlayTarget: () => void;
  drone: boolean;
  onDrone: (on: boolean) => void;
  toneVolume: number;
  onToneVolume: (v: number) => void;

  tally: TargetTally | null;
  /** Omit when the tally can't be reset (replay — it's computed from the take). */
  onResetTally?: () => void;
}

const select = 'h-8 px-2 rounded-lg border border-line bg-surface text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent';
const chip = 'h-8 px-2.5 rounded-lg text-[11px] font-semibold transition-colors';
const idle = 'bg-ink/5 text-ink-muted hover:bg-ink/10';
const label = 'min-w-[3rem] shrink-0 text-[11px] font-semibold uppercase tracking-wide text-ink-faint';

const secs = (s: number) => `${s.toFixed(1)}s`;

/** Compact hold readout, shown in the header so it stays visible when folded. */
const HoldBadge: React.FC<{ tally: TargetTally }> = ({ tally }) => {
  const { t } = useTranslation();
  return (
    <span className={`font-mono tabular-nums ${tally.current > 0 ? 'text-success font-semibold' : 'text-ink-faint '}`}>
      {tally.current > 0 ? `✓ ${secs(tally.current)}` : '—'} · {t('vocal.practice.best', { time: secs(tally.longest) })}
    </span>
  );
};

/** Key/scale overlay and target-note controls under the pitch chart — foldable to save height. */
const PracticeBar: React.FC<Props> = (p) => {
  const { t } = useTranslation();
  const [open, setOpen] = usePersistedState('practice-open', true);
  const keyText = p.keySig ? `${ROOT_LABELS[p.keyRoot]} ${t(`vocal.scales.${p.keySig.scale.id}`)}` : t('vocal.practice.off');
  const targetText = p.target !== null ? `${spellNote(p.target, p.keySig)} ±${p.tolerance}¢` : t('vocal.practice.none');

  return (
    <div className="mt-3 pt-3 border-t border-line">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-3 w-full text-left"
        aria-expanded={open}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{t('vocal.practice.title')}</span>
        <span className="flex items-center gap-3 min-w-0 text-[11px] text-ink-muted">
          {!open && <span className="truncate">{t('vocal.practice.summary', { key: keyText, target: targetText })}</span>}
          {p.target !== null && p.tally && <HoldBadge tally={p.tally} />}
          <svg className={`w-4 h-4 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Key */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={label}>{t('vocal.practice.key')}</span>
            <select value={p.keyRoot} onChange={(e) => p.onKeyRoot(Number(e.target.value))} className={select} aria-label={t('vocal.practice.keyRoot')}>
              {ROOT_LABELS.map((name, i) => <option key={name} value={i}>{name}</option>)}
            </select>
            <select value={p.keyScale} onChange={(e) => p.onKeyScale(Number(e.target.value))} className={select} aria-label={t('vocal.practice.scale')}>
              {SCALES.map((sc, i) => <option key={i} value={i}>{sc ? t(`vocal.scales.${sc.id}`) : t('vocal.practice.off')}</option>)}
            </select>
            {p.keySig && (
              <span className="text-[11px] text-ink-faint">
                {t('vocal.practice.keyHint')}
              </span>
            )}
          </div>

          {/* Target */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={label}>{t('vocal.practice.target')}</span>
            <select
              value={p.target ?? ''}
              onChange={(e) => p.onTarget(e.target.value === '' ? null : Number(e.target.value))}
              className={select}
              aria-label={t('vocal.practice.targetNote')}
            >
              <option value="">{t('vocal.practice.none')}</option>
              {TARGET_NOTES.map((m) => <option key={m} value={m}>{spellNote(m, p.keySig)}</option>)}
            </select>
            <button onClick={p.onPlayTarget} disabled={p.target === null} className={`${chip} ${idle} disabled:opacity-40`} title={t('vocal.practice.playTitle')}>
              {t('vocal.practice.play')}
            </button>
            <button
              onClick={() => p.onDrone(!p.drone)}
              disabled={p.target === null}
              className={`${chip} ${p.drone && p.target !== null ? 'bg-ink text-paper' : idle} disabled:opacity-40`}
              title={t('vocal.practice.droneTitle')}
            >
              {t('vocal.practice.drone')}
            </button>
            <div className="flex items-center gap-1" role="group" aria-label={t('vocal.practice.tolerance')}>
              {TOLERANCES.map((c) => (
                <button
                  key={c}
                  onClick={() => p.onTolerance(c)}
                  className={`${chip} px-2 ${p.tolerance === c ? 'bg-ink text-paper' : idle}`}
                  title={t('vocal.practice.toleranceTitle', { cents: c })}
                >
                  ±{c}¢
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-ink-muted" title={t('vocal.practice.toneVolume')}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg>
              <input
                type="range" min={0} max={1} step={0.05}
                value={p.toneVolume}
                onChange={(e) => p.onToneVolume(parseFloat(e.target.value))}
                className="w-20 accent-amber-500"
                aria-label={t('vocal.practice.toneVolume')}
              />
            </label>
          </div>

          {/* Time on target */}
          {p.target !== null && p.tally && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-14">
              <span className={`text-sm font-semibold tabular-nums ${p.tally.current > 0 ? 'text-success ' : 'text-ink-faint '}`}>
                {p.tally.current > 0 ? t('vocal.practice.holding', { time: secs(p.tally.current) }) : t('vocal.practice.notOnTarget')}
              </span>
              <span className="text-xs text-ink-muted tabular-nums">{t('vocal.practice.longest')} <b>{secs(p.tally.longest)}</b></span>
              <span className="text-xs text-ink-muted tabular-nums">{t('vocal.practice.total')} <b>{secs(p.tally.total)}</b></span>
              {p.onResetTally && (
                <button onClick={p.onResetTally} className="text-[11px] font-semibold text-accent hover:underline">{t('vocal.practice.reset')}</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PracticeBar;
