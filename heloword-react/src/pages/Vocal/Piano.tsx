import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeySig, spellNote } from './music';
import { isSharp } from './pitch';
import { usePersistedState } from './usePersistedState';

interface Props {
  isDark: boolean;
  keySig: KeySig | null;
  /** Note being sung right now (rounded MIDI), or null. */
  sung: number | null;
  /** Current target note, or null. */
  target: number | null;
  /** A key was pressed (or slid onto). */
  onKey: (midi: number) => void;
}

/** Lowest start: C1. The range never runs past C8 (MIDI 108). */
const MIN_OCTAVE = 1;
const TOP_MIDI = 108;
/** Containers at least this wide get three octaves instead of two. */
const WIDE_PX = 560;

/**
 * Computer-keyboard piano (as in most DAWs): home row = white keys, row above
 * = black keys, starting from the leftmost C. Uses `KeyboardEvent.code`, so it
 * works the same on any layout. Z / X move the range an octave.
 */
const KEY_CODES = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyO', 'KeyL', 'KeyP', 'Semicolon'];
const KEY_HINTS = ['A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Y', 'H', 'U', 'J', 'K', 'O', 'L', 'P', ';'];

const noteOnly = (midi: number, key: KeySig | null) => spellNote(midi, key).replace(/-?\d+$/, '');

/**
 * Collapsible keyboard at the top of the Pitch panel: tap (or slide across)
 * keys to hear them and set the target, optional note names, and ‹ › to move
 * the range an octave at a time. The sung note and the target light up.
 * With ⌨ on, the computer keyboard plays it too (see KEY_CODES).
 */
const Piano: React.FC<Props> = ({ isDark, keySig, sung, target, onKey }) => {
  const { t } = useTranslation();
  const [open, setOpen] = usePersistedState('piano-open', true);
  const [labels, setLabels] = usePersistedState('piano-labels', true);
  const [typing, setTyping] = usePersistedState('piano-keyboard', true);
  /** Octave of the leftmost C (3 → C3). */
  const [startOctave, setStartOctave] = usePersistedState('piano-octave', 3, (v) => Number.isInteger(v) && v >= MIN_OCTAVE && v <= 7);

  // Two octaves on phones, three when there's room.
  const boxRef = useRef<HTMLDivElement>(null);
  const [octaves, setOctaves] = useState(2);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setOctaves(entry.contentRect.width >= WIDE_PX ? 3 : 2));
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  const maxOctave = (TOP_MIDI - 12 * octaves) / 12 - 1;
  const octave = Math.min(startOctave, maxOctave);
  const low = 12 * (octave + 1);
  const high = low + 12 * octaves; // ends on a C
  const notes = Array.from({ length: high - low + 1 }, (_, i) => low + i);
  const whites = notes.filter((m) => !isSharp(m));
  const keyW = 100 / whites.length;

  // ── Pointer: press, then slide across keys (touch too — hit-test instead of pointerenter) ──
  const [pressed, setPressed] = useState<number | null>(null);
  const downRef = useRef(false);
  const midiAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-midi]');
    return el ? Number(el.dataset.midi) : null;
  };
  const press = (m: number | null) => {
    if (m === null || m === pressed) return;
    setPressed(m);
    onKey(m);
  };
  const release = () => { downRef.current = false; setPressed(null); };

  // ── Computer keyboard ──
  /** Notes held down on the computer keyboard, lit like a pressed key. */
  const [held, setHeld] = useState<ReadonlySet<number>>(new Set());
  const heldCodesRef = useRef(new Map<string, number>());
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;
  const kbdRef = useRef({ low, octave, maxOctave });
  kbdRef.current = { low, octave, maxOctave };
  const keyboardOn = open && typing;
  useEffect(() => {
    if (!keyboardOn) return;
    const sync = () => setHeld(new Set(heldCodesRef.current.values()));
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const { low: base, octave: oct, maxOctave: maxOct } = kbdRef.current;
      if (e.code === 'KeyZ' || e.code === 'KeyX') {
        // Claimed so the page's shortcuts skip it.
        e.preventDefault();
        if (!e.repeat) setStartOctave(Math.max(MIN_OCTAVE, Math.min(maxOct, oct + (e.code === 'KeyX' ? 1 : -1))));
        return;
      }
      const i = KEY_CODES.indexOf(e.code);
      if (i < 0) return;
      e.preventDefault();
      if (e.repeat || heldCodesRef.current.has(e.code)) return;
      const midi = base + i;
      heldCodesRef.current.set(e.code, midi);
      sync();
      onKeyRef.current(midi);
    };
    const up = (e: KeyboardEvent) => {
      if (heldCodesRef.current.delete(e.code)) sync();
    };
    const clear = () => { heldCodesRef.current.clear(); sync(); };
    // Capture phase: runs before the page's shortcut handler, which skips claimed keys.
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', clear);
      clear();
    };
  }, [keyboardOn, setStartOctave]);
  const hintOf = (m: number) => (keyboardOn ? KEY_HINTS[m - low] ?? null : null);

  const whiteBg = isDark ? 'bg-ink' : 'bg-surface';
  const blackBg = isDark ? 'bg-paper' : 'bg-ink';
  const whiteText = isDark ? 'text-paper/60' : 'text-ink-faint';
  const blackText = isDark ? 'text-ink/70' : 'text-paper/70';
  const stateBg = (m: number) =>
    m === pressed || held.has(m) ? 'bg-ink-muted' : m === sung ? 'bg-accent' : null;

  const step = 'w-7 h-7 rounded-lg text-ink-muted hover:bg-ink/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors';

  return (
    <div className="mb-4 rounded-xl border border-line">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint"
          aria-expanded={open}
        >
          {t('vocal.piano.title')}
          <svg className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <div className="flex items-center gap-1 text-[11px]">
            <button
              onClick={() => setLabels((v) => !v)}
              className={`h-7 px-2.5 rounded-lg font-semibold transition-colors ${labels ? 'bg-ink text-paper' : 'bg-ink/5 text-ink-muted hover:bg-ink/10'}`}
              aria-pressed={labels}
            >
              {t('vocal.piano.labels')}
            </button>
            {/* No hardware keyboard to speak of on phones */}
            <button
              onClick={() => setTyping((v) => !v)}
              className={`hidden sm:inline-flex items-center h-7 px-2.5 rounded-lg font-semibold transition-colors ${typing ? 'bg-ink text-paper' : 'bg-ink/5 text-ink-muted hover:bg-ink/10'}`}
              aria-pressed={typing}
              title={t('vocal.piano.keyboardTitle')}
            >
              ⌨ {t('vocal.piano.keyboard')}
            </button>
            <button className={step} onClick={() => setStartOctave(octave - 1)} disabled={octave <= MIN_OCTAVE} aria-label={t('vocal.piano.lower')}>‹</button>
            <span className="w-16 text-center font-mono text-ink-muted tabular-nums">{spellNote(low, null)}–{spellNote(high, null)}</span>
            <button className={step} onClick={() => setStartOctave(octave + 1)} disabled={octave >= maxOctave} aria-label={t('vocal.piano.higher')}>›</button>
          </div>
        )}
      </div>

      {open && (
        <div ref={boxRef} className="px-3 pb-3">
          <div
            className="relative h-28 select-none touch-none"
            onPointerDown={(e) => { downRef.current = true; press(midiAt(e.clientX, e.clientY)); }}
            onPointerMove={(e) => { if (downRef.current) press(midiAt(e.clientX, e.clientY)); }}
            onPointerUp={release}
            onPointerCancel={release}
            onPointerLeave={release}
            role="group"
            aria-label={t('vocal.piano.title')}
          >
            {/* White keys */}
            <div className="absolute inset-0 flex">
              {whites.map((m) => (
                <button
                  key={m}
                  data-midi={m}
                  tabIndex={-1}
                  aria-label={spellNote(m, keySig)}
                  className={`relative flex-1 h-full border border-line -ml-px first:ml-0 rounded-b-md transition-colors duration-75 ${stateBg(m) ?? whiteBg}`}
                >
                  {hintOf(m) && <span className={`hidden sm:block absolute inset-x-0 top-[64%] text-center text-[9px] leading-none font-mono font-semibold ${stateBg(m) ? 'text-paper' : 'text-ink-muted'}`}>{hintOf(m)}</span>}
                  {m === target && <span className="absolute left-1/2 bottom-5 -ml-1 w-2 h-2 rounded-full bg-accent ring-2 ring-surface" />}
                  {labels && (
                    <span className={`absolute inset-x-0 bottom-1 text-center text-[9px] leading-none font-mono ${stateBg(m) ? 'text-paper' : whiteText}`}>
                      {m % 12 === 0 ? spellNote(m, keySig) : noteOnly(m, keySig)}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {/* Black keys, centred on the line between their neighbours */}
            {notes.filter(isSharp).map((m) => {
              const left = whites.filter((w) => w < m).length * keyW;
              return (
                <button
                  key={m}
                  data-midi={m}
                  tabIndex={-1}
                  aria-label={spellNote(m, keySig)}
                  className={`absolute top-0 h-[60%] rounded-b-md transition-colors duration-75 ${stateBg(m) ?? blackBg}`}
                  style={{ left: `${left - keyW * 0.3}%`, width: `${keyW * 0.6}%` }}
                >
                  {hintOf(m) && <span className={`hidden sm:block absolute inset-x-0 top-1.5 text-center text-[9px] leading-none font-mono font-semibold ${stateBg(m) ? 'text-paper' : blackText}`}>{hintOf(m)}</span>}
                  {m === target && <span className="absolute left-1/2 bottom-4 -ml-1 w-2 h-2 rounded-full bg-accent ring-2 ring-surface" />}
                  {labels && (
                    <span className={`absolute inset-x-0 bottom-1 text-center text-[8px] leading-none font-mono ${stateBg(m) ? 'text-paper' : blackText}`}>
                      {noteOnly(m, keySig)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Piano;
