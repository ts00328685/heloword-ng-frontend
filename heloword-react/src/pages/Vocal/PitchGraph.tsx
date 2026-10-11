import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { freqToNote, isSharp, midiToFreq } from './pitch';
import { axisLabel, fullName, inScale, isTonic, KeySig } from './music';
import { isOnTarget } from './stats';
import { BUFFER_SECONDS, fmtTakeTime, indexAtTime, MicData, NOW_POSITION } from './useMicAnalyser';
import { useCanvasLoop } from './useCanvasLoop';
import { usePersistedState } from './usePersistedState';

interface Props {
  dataRef: React.MutableRefObject<MicData>;
  isDark: boolean;
  keySig: KeySig | null;
  /** Target note (MIDI) drawn as a highlighted line, or null. */
  target: number | null;
  toleranceCents: number;
  /** A note label in the left column was clicked. */
  onNoteClick: (midi: number) => void;
  frozen: boolean;
  /** Omit to hide the Freeze button (e.g. while replaying a take). */
  onToggleFreeze?: () => void;
}

/** Imperative controls for keyboard shortcuts. */
export interface PitchGraphHandle {
  scroll: (semitones: number) => void;
  zoom: (dir: -1 | 1) => void;
  fit: () => void;
}

/** Wide enough for black-key labels like "D#/E♭4". Keep in sync with WaveformView so the "now" lines align. */
const GUTTER = 52;
const AXIS_H = 18;
/** Recenter when the voice gets this close (semitones) to the top/bottom edge. */
const EDGE_MARGIN = 3;
/** Break the line across silences / jumps instead of drawing a vertical streak. */
const MAX_GAP_S = 0.15;
const MAX_JUMP = 2.5;
/** Hover snaps to the nearest voiced sample within this many seconds. */
const HOVER_SNAP_S = 0.12;
/** Zoom steps for the visible pitch range, in semitones. */
const SPANS = [6, 12, 18, 24, 36, 48];
/** Piano range — the view can't be dragged past it. */
const MIDI_MIN = 21;
const MIDI_MAX = 108;
const FONT = 'ui-sans-serif, system-ui, sans-serif';

const LIGHT = {
  natural: '#ffffff', sharp: '#f3f4f6', cLine: '#d1d5db', label: '#9ca3af', labelDim: '#d1d5db', cLabel: '#374151',
  line: '#3b82f6', grid: '#e5e7eb', hl: 'rgba(59,130,246,0.12)', cursor: 'rgba(55,65,81,0.4)',
  tipBg: 'rgba(17,24,39,0.9)', tipText: '#f9fafb', tipSub: '#d1d5db', dash: '#cbd5e1',
  outScale: 'rgba(15,23,42,0.05)', tonic: 'rgba(139,92,246,0.10)', tonicLabel: '#7c3aed',
  target: '#f59e0b', targetBand: 'rgba(245,158,11,0.16)', onTarget: '#16a34a',
  loopBand: 'rgba(16,185,129,0.08)', loopLine: '#10b981', future: 'rgba(255,255,255,0.6)',
};
const DARK: typeof LIGHT = {
  natural: '#1f2937', sharp: '#111827', cLine: '#4b5563', label: '#9ca3af', labelDim: '#4b5563', cLabel: '#e5e7eb',
  line: '#60a5fa', grid: '#374151', hl: 'rgba(96,165,250,0.18)', cursor: 'rgba(229,231,235,0.5)',
  tipBg: 'rgba(243,244,246,0.95)', tipText: '#111827', tipSub: '#4b5563', dash: '#4b5563',
  outScale: 'rgba(0,0,0,0.28)', tonic: 'rgba(167,139,250,0.14)', tonicLabel: '#a78bfa',
  target: '#fbbf24', targetBand: 'rgba(251,191,36,0.16)', onTarget: '#4ade80',
  loopBand: 'rgba(52,211,153,0.08)', loopLine: '#34d399', future: 'rgba(17,24,39,0.55)',
};

/**
 * Piano-roll style pitch trace: one horizontal band per semitone, last 20 s
 * scrolling right-to-left. In follow mode the view tracks the singer with
 * hysteresis so the history doesn't jitter; dragging, zoom and Fit take
 * manual control until Follow is switched back on.
 */
const PitchGraph = forwardRef<PitchGraphHandle, Props>(({
  dataRef, isDark, keySig, target, toleranceCents, onNoteClick, frozen, onToggleFreeze,
}, ref) => {
  const { t } = useTranslation();
  const spanLabel = (semis: number) =>
    semis % 12 === 0 ? t('vocal.graph.octaves', { n: semis / 12 }) : t('vocal.graph.semitones', { n: semis });
  const nowLabel = t('vocal.graph.now');
  const frozenLabel = t('vocal.graph.frozen');
  const pausedLabel = t('vocal.graph.paused');
  const [span, setSpan] = usePersistedState('pitch-span', 24, (v) => SPANS.includes(v));
  const [follow, setFollow] = useState(true);
  const [lineWidth, setLineWidth] = usePersistedState('pitch-line-width', 2.5, (v) => v >= 1 && v <= 8);
  const [dragging, setDragging] = useState(false);

  const centerRef = useRef(60);
  const viewTargetRef = useRef(60);
  /** Pointer x in CSS px relative to the canvas, or null when not hovering. */
  const hoverXRef = useRef<number | null>(null);
  const dragRef = useRef<{ y: number; center: number } | null>(null);
  /** Last drawn geometry — converts pointer pixels into notes. */
  const geomRef = useRef({ plotH: 1, bottom: 48, rowH: 1 });

  const clampCenter = (center: number, semis: number) =>
    Math.min(MIDI_MAX - semis / 2, Math.max(MIDI_MIN + semis / 2, center));

  /** Jump the view (no easing) — used by drag, zoom, scroll and Fit. */
  const setCenterNow = (center: number, semis = span) => {
    const c = clampCenter(center, semis);
    centerRef.current = c;
    viewTargetRef.current = c;
  };

  const canvasRef = useCanvasLoop((ctx, w, h) => {
    const { pitch, now, replay, loop } = dataRef.current;
    const plotW = w - GUTTER;
    const plotH = h - AXIS_H;
    const c = isDark ? DARK : LIGHT;

    // Follow the voice (a replayed take also has samples after `now` — ignore those)
    let latest: number | null = null;
    for (let i = indexAtTime(pitch, now + 1e-6) - 1; i >= 0 && now - pitch[i].t < 0.3; i--) {
      if (pitch[i].midi !== null) { latest = pitch[i].midi; break; }
    }
    if (follow && latest !== null) {
      const lo = viewTargetRef.current - span / 2;
      const hi = viewTargetRef.current + span / 2;
      if (latest < lo + EDGE_MARGIN || latest > hi - EDGE_MARGIN) viewTargetRef.current = Math.round(latest);
    }
    centerRef.current += (viewTargetRef.current - centerRef.current) * 0.08;

    const bottom = centerRef.current - span / 2;
    const rowH = plotH / span;
    geomRef.current = { plotH, bottom, rowH };
    const yOf = (midi: number) => plotH - (midi - bottom) * rowH;
    const histW = plotW * NOW_POSITION;
    const nowX = GUTTER + histW;
    const xOf = (t: number) => nowX - ((now - t) / BUFFER_SECONDS) * histW;

    // Semitone bands, scale overlay + labels
    ctx.textBaseline = 'middle';
    for (let m = Math.floor(bottom); m <= Math.ceil(bottom + span); m++) {
      const yTop = yOf(m + 0.5);
      ctx.fillStyle = isSharp(m) ? c.sharp : c.natural;
      ctx.fillRect(GUTTER, yTop, plotW, rowH);
      const outOfKey = keySig !== null && !inScale(m, keySig);
      const tonic = keySig !== null && isTonic(m, keySig);
      if (outOfKey) {
        ctx.fillStyle = c.outScale;
        ctx.fillRect(GUTTER, yTop, plotW, rowH);
      } else if (tonic) {
        ctx.fillStyle = c.tonic;
        ctx.fillRect(GUTTER, yTop, plotW, rowH);
      }
      if (latest !== null && Math.round(latest) === m) {
        ctx.fillStyle = c.hl;
        ctx.fillRect(GUTTER, yTop, plotW, rowH);
      }
      const isC = ((m % 12) + 12) % 12 === 0;
      if (isC) {
        ctx.fillStyle = c.cLine;
        ctx.fillRect(GUTTER, Math.round(yOf(m - 0.5)), plotW, 1);
      }
      // White keys are labelled when rows are ≥7px; black keys too once there's room (≥11px).
      if (rowH >= (isSharp(m) ? 11 : 7) && m !== target) {
        const y = yOf(m);
        if (y > 4 && y < plotH - 2) {
          ctx.fillStyle = tonic ? c.tonicLabel : outOfKey ? c.labelDim : isC ? c.cLabel : c.label;
          ctx.font = `${isC || tonic ? 'bold ' : ''}10px ${FONT}`;
          ctx.fillText(axisLabel(m, keySig), 4, y);
          // Dashed guide through the middle of each labelled note
          ctx.save();
          ctx.strokeStyle = c.dash;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(GUTTER, Math.round(y) + 0.5);
          ctx.lineTo(GUTTER + plotW, Math.round(y) + 0.5);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // Target note: tolerance band, solid line, highlighted label
    if (target !== null) {
      const y = yOf(target);
      const halfBand = (toleranceCents / 100) * rowH;
      ctx.fillStyle = c.targetBand;
      ctx.fillRect(GUTTER, y - halfBand, plotW, halfBand * 2);
      ctx.fillStyle = c.target;
      ctx.fillRect(GUTTER, Math.round(y) - 1, plotW, 2);
      if (y > -8 && y < plotH + 8) {
        const yl = Math.min(plotH - 8, Math.max(8, y));
        ctx.font = `bold 10px ${FONT}`;
        const label = axisLabel(target, keySig);
        const lw = ctx.measureText(label).width + 8;
        ctx.beginPath();
        ctx.roundRect(1, yl - 8, Math.min(GUTTER - 3, lw), 16, 4);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, 5, yl);
      }
    }

    // Time grid
    ctx.textBaseline = 'top';
    ctx.font = `10px ${FONT}`;
    for (let s = 0; s <= BUFFER_SECONDS; s += 5) {
      const x = nowX - (s / BUFFER_SECONDS) * histW;
      ctx.fillStyle = s === 0 ? c.cLine : c.grid;
      ctx.fillRect(Math.round(x), 0, 1, plotH);
      ctx.fillStyle = c.label;
      ctx.textAlign = 'center';
      const label = replay ? (now - s >= 0 ? fmtTakeTime(now - s) : '') : s === 0 ? nowLabel : `-${s}s`;
      ctx.fillText(label, x, plotH + 4);
    }
    ctx.textAlign = 'left';

    ctx.save();
    ctx.beginPath();
    ctx.rect(GUTTER, 0, plotW, plotH);
    ctx.clip();

    // A–B loop of a replayed take
    if (replay && loop) {
      const xa = xOf(loop.a);
      const xb = xOf(loop.b);
      ctx.fillStyle = c.loopBand;
      ctx.fillRect(xa, 0, xb - xa, plotH);
      ctx.fillStyle = c.loopLine;
      ctx.fillRect(Math.round(xa), 0, 1.5, plotH);
      ctx.fillRect(Math.round(xb), 0, 1.5, plotH);
      ctx.font = `bold 10px ${FONT}`;
      ctx.fillText('A', xa + 3, 4);
      ctx.fillText('B', xb + 3, 4);
    }

    // Pitch trace — only the visible slice; a replayed take can hold minutes of samples.
    const i0 = indexAtTime(pitch, now - BUFFER_SECONDS - 0.5);
    const i1 = indexAtTime(pitch, now + (BUFFER_SECONDS * (1 - NOW_POSITION)) / NOW_POSITION + 0.5);
    const connected = (a: { t: number; midi: number }, b: { t: number; midi: number }) =>
      b.t - a.t < MAX_GAP_S && Math.abs(b.midi - a.midi) < MAX_JUMP;
    const strokeTrace = (color: string, width: number, only?: (midi: number) => boolean) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      let prev: { t: number; midi: number } | null = null;
      for (let i = i0; i < i1; i++) {
        const p = pitch[i];
        if (p.midi === null || (only && !only(p.midi))) { prev = null; continue; }
        const cur = { t: p.t, midi: p.midi };
        if (prev && connected(prev, cur)) ctx.lineTo(xOf(p.t), yOf(p.midi));
        else ctx.moveTo(xOf(p.t), yOf(p.midi));
        prev = cur;
      }
      ctx.stroke();
    };
    strokeTrace(c.line, lineWidth);
    // Re-draw the stretches that hit the target in green
    if (target !== null) strokeTrace(c.onTarget, lineWidth + 0.5, (m) => isOnTarget(m, target, toleranceCents));

    if (replay) {
      // Dim what's still to come in the take
      ctx.fillStyle = c.future;
      ctx.fillRect(nowX, 0, GUTTER + plotW - nowX, plotH);
    }
    if (latest !== null) {
      ctx.fillStyle = target !== null && isOnTarget(latest, target, toleranceCents) ? c.onTarget : c.line;
      ctx.beginPath();
      ctx.arc(nowX, yOf(latest), Math.max(4, lineWidth * 1.4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Hover readout
    const hx = hoverXRef.current;
    if (hx !== null && hx >= GUTTER && hx <= GUTTER + plotW) {
      // Live: past the "now" line there's no data yet — snap to the newest sample.
      const tHover = now - ((replay ? nowX - hx : Math.max(0, nowX - hx)) / histW) * BUFFER_SECONDS;
      let best: { t: number; midi: number } | null = null;
      const j1 = indexAtTime(pitch, tHover + HOVER_SNAP_S);
      for (let j = indexAtTime(pitch, tHover - HOVER_SNAP_S); j < j1; j++) {
        const p = pitch[j];
        if (p.midi === null) continue;
        if (!best || Math.abs(p.t - tHover) < Math.abs(best.t - tHover)) best = { t: p.t, midi: p.midi };
      }

      const x = best ? xOf(best.t) : hx;
      ctx.fillStyle = c.cursor;
      ctx.fillRect(Math.round(x), 0, 1, plotH);
      if (best) {
        // The hovered note may be scrolled out of view — pin the marker to the edge and point at it.
        const rawY = yOf(best.midi);
        const offDir = rawY < 0 ? ' ↑' : rawY > plotH ? ' ↓' : '';
        const y = Math.min(plotH - 4, Math.max(4, rawY));
        const n = freqToNote(midiToFreq(best.midi));
        ctx.fillStyle = c.line;
        ctx.strokeStyle = isDark ? '#111827' : '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const title = fullName(n.midi, keySig) + offDir;
        const detail = `${n.cents > 0 ? '+' : ''}${n.cents}¢ · ${midiToFreq(best.midi).toFixed(1)} Hz · ${replay ? `@ ${fmtTakeTime(best.t)}` : `-${(now - best.t).toFixed(1)}s`}`;
        ctx.font = `bold 13px ${FONT}`;
        const tw = ctx.measureText(title).width;
        ctx.font = `11px ${FONT}`;
        const dw = ctx.measureText(detail).width;
        const boxW = Math.max(tw, dw) + 16;
        const boxH = 38;
        let bx = x + 10;
        if (bx + boxW > w - 2) bx = x - 10 - boxW;
        const by = Math.min(Math.max(2, y - boxH - 8), plotH - boxH - 2);
        ctx.fillStyle = c.tipBg;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, 8);
        ctx.fill();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = c.tipText;
        ctx.font = `bold 13px ${FONT}`;
        ctx.fillText(title, bx + 8, by + 5);
        ctx.fillStyle = c.tipSub;
        ctx.font = `11px ${FONT}`;
        ctx.fillText(detail, bx + 8, by + 22);
      }
    }

    const { running, paused, frozen: isFrozen } = dataRef.current;
    if (running && (paused || isFrozen)) {
      const label = isFrozen ? frozenLabel : pausedLabel;
      ctx.font = `bold 11px ${FONT}`;
      const bw = ctx.measureText(label).width + 22;
      const bx = w - bw - 6;
      ctx.fillStyle = c.tipBg;
      ctx.beginPath();
      ctx.roundRect(bx, 6, bw, 20, 10);
      ctx.fill();
      ctx.fillStyle = isFrozen ? '#38bdf8' : '#f59e0b';
      ctx.fillRect(bx + 8, 11, 2, 10);
      ctx.fillRect(bx + 12, 11, 2, 10);
      ctx.fillStyle = c.tipText;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + 18, 16);
    }
  });

  const pointerX = (e: React.PointerEvent<HTMLCanvasElement>) => e.clientX - e.currentTarget.getBoundingClientRect().left;
  const pointerY = (e: React.PointerEvent<HTMLCanvasElement>) => e.clientY - e.currentTarget.getBoundingClientRect().top;

  const setHover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const x = pointerX(e);
    // The label column is for clicking notes — it neither inspects nor pauses.
    if (x < GUTTER && !dragRef.current) {
      clearHover();
      return;
    }
    hoverXRef.current = x;
    dataRef.current.paused = true;
  };
  const clearHover = () => {
    hoverXRef.current = null;
    dataRef.current.paused = false;
  };
  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerX(e) < GUTTER) {
      const { plotH, bottom, rowH } = geomRef.current;
      const y = pointerY(e);
      if (y <= plotH) onNoteClick(Math.round(bottom + (plotH - y) / rowH));
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { y: e.clientY, center: centerRef.current };
    setDragging(true);
    setHover(e);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.style.cursor = pointerX(e) < GUTTER && !dragRef.current ? 'pointer' : '';
    setHover(e);
    const drag = dragRef.current;
    if (!drag) return;
    const dy = e.clientY - drag.y;
    if (Math.abs(dy) < 3) return;
    // Content follows the finger: drag down → reveal higher notes.
    if (follow) setFollow(false);
    setCenterNow(drag.center + dy / geomRef.current.rowH);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    endDrag();
    // Touch has no hover state — lifting the finger ends the inspection.
    if (e.pointerType !== 'mouse') clearHover();
  };

  const zoom = (dir: -1 | 1) => {
    const idx = SPANS.indexOf(span);
    const next = SPANS[Math.min(SPANS.length - 1, Math.max(0, (idx === -1 ? 3 : idx) + dir))];
    setSpan(next);
    setCenterNow(centerRef.current, next);
  };

  /** Frame everything currently in the view's data (last 20 s live, whole take on replay). */
  const fit = () => {
    const voiced = dataRef.current.pitch.filter((p) => p.midi !== null).map((p) => p.midi as number);
    if (!voiced.length) return;
    const lo = voiced.reduce((a, b) => Math.min(a, b));
    const hi = voiced.reduce((a, b) => Math.max(a, b));
    const next = SPANS.find((sp) => sp >= hi - lo + 4) ?? SPANS[SPANS.length - 1];
    setFollow(false);
    setSpan(next);
    setCenterNow((lo + hi) / 2, next);
  };

  const scroll = (semitones: number) => {
    setFollow(false);
    setCenterNow(centerRef.current + semitones);
  };

  useImperativeHandle(ref, () => ({ scroll, zoom, fit }));

  const toggleFollow = () => {
    setFollow((f) => !f);
    if (!follow) {
      const last = [...dataRef.current.pitch].reverse().find((p) => p.midi !== null);
      if (last?.midi != null) viewTargetRef.current = clampCenter(Math.round(last.midi), span);
    }
  };

  const chip = 'h-7 px-2.5 rounded-lg text-[11px] font-semibold transition-colors';
  const idle = 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600';

  return (
    <div>
      <canvas
        ref={canvasRef}
        className={`w-full h-72 sm:h-80 block rounded-xl touch-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={(e) => { if (!dragRef.current || e.pointerType !== 'mouse') { endDrag(); clearHover(); } }}
        onPointerCancel={() => { endDrag(); clearHover(); }}
      />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mt-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleFollow}
            className={`${chip} ${follow ? 'bg-blue-500 text-white' : idle}`}
            title={t('vocal.graph.followTitle')}
          >
            {t('vocal.graph.follow')}
          </button>
          <button onClick={fit} className={`${chip} ${idle}`} title={t('vocal.graph.fitTitle')}>
            {t('vocal.graph.fit')}
          </button>
          {onToggleFreeze && (
            <button
              onClick={onToggleFreeze}
              className={`${chip} ${frozen ? 'bg-sky-500 text-white' : idle}`}
              title={t('vocal.graph.freezeTitle')}
            >
              {frozen ? t('vocal.graph.frozen') : t('vocal.graph.freeze')}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={() => zoom(-1)} disabled={span === SPANS[0]} className={`${chip} ${idle} w-7 px-0 text-sm disabled:opacity-40`} aria-label={t('vocal.graph.zoomIn')}>+</button>
          <span className="min-w-[3rem] px-1 text-center whitespace-nowrap text-[11px] font-mono text-gray-500 dark:text-gray-400">{spanLabel(span)}</span>
          <button onClick={() => zoom(1)} disabled={span === SPANS[SPANS.length - 1]} className={`${chip} ${idle} w-7 px-0 text-sm disabled:opacity-40`} aria-label={t('vocal.graph.zoomOut')}>−</button>
        </div>

        <label className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
          {t('vocal.graph.line')}
          <input
            type="range" min={1} max={8} step={0.5}
            value={lineWidth}
            onChange={(e) => setLineWidth(parseFloat(e.target.value))}
            className="w-24 accent-blue-500"
            aria-label={t('vocal.graph.lineThickness')}
          />
          <span className="w-8 font-mono">{lineWidth}px</span>
        </label>
      </div>
    </div>
  );
});

PitchGraph.displayName = 'PitchGraph';

export default PitchGraph;
