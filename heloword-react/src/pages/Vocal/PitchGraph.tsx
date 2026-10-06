import React, { useRef, useState } from 'react';
import { freqToNote, isSharp, midiToFreq, midiToNoteName } from './pitch';
import { BUFFER_SECONDS, MicData, NOW_POSITION } from './useMicAnalyser';
import { useCanvasLoop } from './useCanvasLoop';
import { usePersistedState } from './usePersistedState';

interface Props {
  dataRef: React.MutableRefObject<MicData>;
  isDark: boolean;
}

const GUTTER = 36;
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

const spanLabel = (semis: number) => (semis % 12 === 0 ? `${semis / 12} oct` : `${semis} st`);

/**
 * Piano-roll style pitch trace: one horizontal band per semitone, last 20 s
 * scrolling right-to-left. In follow mode the view tracks the singer with
 * hysteresis so the history doesn't jitter; dragging, zoom and Fit take
 * manual control until Follow is switched back on.
 */
const PitchGraph: React.FC<Props> = ({ dataRef, isDark }) => {
  const [span, setSpan] = usePersistedState('pitch-span', 24, (v) => SPANS.includes(v));
  const [follow, setFollow] = useState(true);
  const [lineWidth, setLineWidth] = usePersistedState('pitch-line-width', 2.5, (v) => v >= 1 && v <= 8);
  const [dragging, setDragging] = useState(false);

  const centerRef = useRef(60);
  const targetRef = useRef(60);
  /** Pointer x in CSS px relative to the canvas, or null when not hovering. */
  const hoverXRef = useRef<number | null>(null);
  const dragRef = useRef<{ y: number; center: number } | null>(null);
  /** Last drawn plot height — converts drag pixels into semitones. */
  const plotHRef = useRef(1);

  const clampCenter = (center: number, semis: number) =>
    Math.min(MIDI_MAX - semis / 2, Math.max(MIDI_MIN + semis / 2, center));

  /** Jump the view (no easing) — used by drag, zoom and Fit. */
  const setCenterNow = (center: number, semis = span) => {
    const c = clampCenter(center, semis);
    centerRef.current = c;
    targetRef.current = c;
  };

  const canvasRef = useCanvasLoop((ctx, w, h) => {
    const { pitch, now } = dataRef.current;
    const plotW = w - GUTTER;
    const plotH = h - AXIS_H;
    plotHRef.current = plotH;

    // Follow the voice
    let latest: number | null = null;
    for (let i = pitch.length - 1; i >= 0 && now - pitch[i].t < 0.3; i--) {
      if (pitch[i].midi !== null) { latest = pitch[i].midi; break; }
    }
    if (follow && latest !== null) {
      const lo = targetRef.current - span / 2;
      const hi = targetRef.current + span / 2;
      if (latest < lo + EDGE_MARGIN || latest > hi - EDGE_MARGIN) targetRef.current = Math.round(latest);
    }
    centerRef.current += (targetRef.current - centerRef.current) * 0.08;

    const bottom = centerRef.current - span / 2;
    const rowH = plotH / span;
    const yOf = (midi: number) => plotH - (midi - bottom) * rowH;
    const histW = plotW * NOW_POSITION;
    const nowX = GUTTER + histW;
    const xOf = (t: number) => nowX - ((now - t) / BUFFER_SECONDS) * histW;

    const c = isDark
      ? { natural: '#1f2937', sharp: '#111827', cLine: '#4b5563', label: '#9ca3af', cLabel: '#e5e7eb', line: '#60a5fa', grid: '#374151', hl: 'rgba(96,165,250,0.18)', cursor: 'rgba(229,231,235,0.5)', tipBg: 'rgba(243,244,246,0.95)', tipText: '#111827', tipSub: '#4b5563' }
      : { natural: '#ffffff', sharp: '#f3f4f6', cLine: '#d1d5db', label: '#9ca3af', cLabel: '#374151', line: '#3b82f6', grid: '#e5e7eb', hl: 'rgba(59,130,246,0.12)', cursor: 'rgba(55,65,81,0.4)', tipBg: 'rgba(17,24,39,0.9)', tipText: '#f9fafb', tipSub: '#d1d5db' };

    // Semitone bands + labels
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (let m = Math.floor(bottom); m <= Math.ceil(bottom + span); m++) {
      const yTop = yOf(m + 0.5);
      ctx.fillStyle = isSharp(m) ? c.sharp : c.natural;
      ctx.fillRect(GUTTER, yTop, plotW, rowH);
      if (latest !== null && Math.round(latest) === m) {
        ctx.fillStyle = c.hl;
        ctx.fillRect(GUTTER, yTop, plotW, rowH);
      }
      const isC = ((m % 12) + 12) % 12 === 0;
      if (isC) {
        ctx.fillStyle = c.cLine;
        ctx.fillRect(GUTTER, Math.round(yOf(m - 0.5)), plotW, 1);
      }
      if (!isSharp(m) && rowH >= 7) {
        const y = yOf(m);
        if (y > 4 && y < plotH - 2) {
          ctx.fillStyle = isC ? c.cLabel : c.label;
          ctx.font = `${isC ? 'bold ' : ''}10px ui-sans-serif, system-ui, sans-serif`;
          ctx.fillText(midiToNoteName(m), 4, y);
        }
      }
    }

    // Time grid
    ctx.fillStyle = c.label;
    ctx.textBaseline = 'top';
    for (let s = 0; s <= BUFFER_SECONDS; s += 5) {
      const x = nowX - (s / BUFFER_SECONDS) * histW;
      ctx.fillStyle = s === 0 ? c.cLine : c.grid;
      ctx.fillRect(Math.round(x), 0, 1, plotH);
      ctx.fillStyle = c.label;
      ctx.textAlign = 'center';
      ctx.fillText(s === 0 ? 'now' : `-${s}s`, x, plotH + 4);
    }
    ctx.textAlign = 'left';

    // Pitch trace
    ctx.save();
    ctx.beginPath();
    ctx.rect(GUTTER, 0, plotW, plotH);
    ctx.clip();
    ctx.strokeStyle = c.line;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    let prev: { t: number; midi: number } | null = null;
    for (const p of pitch) {
      if (p.midi === null) { prev = null; continue; }
      const x = xOf(p.t);
      const y = yOf(p.midi);
      if (prev && p.t - prev.t < MAX_GAP_S && Math.abs(p.midi - prev.midi) < MAX_JUMP) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      prev = { t: p.t, midi: p.midi };
    }
    ctx.stroke();
    if (latest !== null) {
      ctx.fillStyle = c.line;
      ctx.beginPath();
      ctx.arc(nowX, yOf(latest), Math.max(4, lineWidth * 1.4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Hover readout
    const hx = hoverXRef.current;
    if (hx !== null && hx >= GUTTER && hx <= GUTTER + plotW) {
      // Past the "now" line there's no data yet — snap to the newest sample.
      const tHover = now - (Math.max(0, nowX - hx) / histW) * BUFFER_SECONDS;
      let best: { t: number; midi: number } | null = null;
      for (const p of pitch) {
        if (p.midi === null || Math.abs(p.t - tHover) > HOVER_SNAP_S) continue;
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

        const title = n.name + offDir;
        const detail = `${n.cents > 0 ? '+' : ''}${n.cents}¢ · ${midiToFreq(best.midi).toFixed(1)} Hz · -${(now - best.t).toFixed(1)}s`;
        ctx.font = 'bold 13px ui-sans-serif, system-ui, sans-serif';
        const tw = ctx.measureText(title).width;
        ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
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
        ctx.font = 'bold 13px ui-sans-serif, system-ui, sans-serif';
        ctx.fillText(title, bx + 8, by + 5);
        ctx.fillStyle = c.tipSub;
        ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
        ctx.fillText(detail, bx + 8, by + 22);
      }
    }

    if (dataRef.current.running && dataRef.current.paused) {
      const label = 'Paused';
      ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif';
      const bw = ctx.measureText(label).width + 22;
      const bx = w - bw - 6;
      ctx.fillStyle = c.tipBg;
      ctx.beginPath();
      ctx.roundRect(bx, 6, bw, 20, 10);
      ctx.fill();
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(bx + 8, 11, 2, 10);
      ctx.fillRect(bx + 12, 11, 2, 10);
      ctx.fillStyle = c.tipText;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + 18, 16);
    }
  });

  const setHover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    hoverXRef.current = e.clientX - e.currentTarget.getBoundingClientRect().left;
    dataRef.current.paused = true;
  };
  const clearHover = () => {
    hoverXRef.current = null;
    dragRef.current = null;
    setDragging(false);
    dataRef.current.paused = false;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { y: e.clientY, center: centerRef.current };
    setDragging(true);
    setHover(e);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setHover(e);
    const drag = dragRef.current;
    if (!drag) return;
    const dy = e.clientY - drag.y;
    if (Math.abs(dy) < 3) return;
    // Content follows the finger: drag down → reveal higher notes.
    if (follow) setFollow(false);
    setCenterNow(drag.center + dy / (plotHRef.current / span));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    setDragging(false);
    // Touch has no hover state — lifting the finger ends the inspection.
    if (e.pointerType !== 'mouse') clearHover();
  };

  const zoom = (dir: -1 | 1) => {
    const idx = SPANS.indexOf(span);
    const next = SPANS[Math.min(SPANS.length - 1, Math.max(0, (idx === -1 ? 3 : idx) + dir))];
    setSpan(next);
    setCenterNow(centerRef.current, next);
  };

  /** Frame everything sung in the last 20 s. */
  const fit = () => {
    const voiced = dataRef.current.pitch.filter((p) => p.midi !== null).map((p) => p.midi as number);
    if (!voiced.length) return;
    const lo = Math.min(...voiced);
    const hi = Math.max(...voiced);
    const next = SPANS.find((sp) => sp >= hi - lo + 4) ?? SPANS[SPANS.length - 1];
    setFollow(false);
    setSpan(next);
    setCenterNow((lo + hi) / 2, next);
  };

  const toggleFollow = () => {
    setFollow((f) => !f);
    if (!follow) {
      const last = [...dataRef.current.pitch].reverse().find((p) => p.midi !== null);
      if (last?.midi != null) targetRef.current = clampCenter(Math.round(last.midi), span);
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
        onPointerLeave={(e) => { if (!dragRef.current || e.pointerType !== 'mouse') clearHover(); }}
        onPointerCancel={clearHover}
      />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mt-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleFollow}
            className={`${chip} ${follow ? 'bg-blue-500 text-white' : idle}`}
            title="Keep the view on your current note"
          >
            Follow
          </button>
          <button onClick={fit} className={`${chip} ${idle}`} title="Show everything from the last 20 seconds">
            Fit
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={() => zoom(-1)} disabled={span === SPANS[0]} className={`${chip} ${idle} w-7 px-0 text-sm disabled:opacity-40`} aria-label="Zoom in">+</button>
          <span className="w-12 text-center text-[11px] font-mono text-gray-500 dark:text-gray-400">{spanLabel(span)}</span>
          <button onClick={() => zoom(1)} disabled={span === SPANS[SPANS.length - 1]} className={`${chip} ${idle} w-7 px-0 text-sm disabled:opacity-40`} aria-label="Zoom out">−</button>
        </div>

        <label className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
          Line
          <input
            type="range" min={1} max={8} step={0.5}
            value={lineWidth}
            onChange={(e) => setLineWidth(parseFloat(e.target.value))}
            className="w-24 accent-blue-500"
            aria-label="Line thickness"
          />
          <span className="w-8 font-mono">{lineWidth}px</span>
        </label>
      </div>

      <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
        Last 20 seconds · drag up/down to scroll notes · hover to inspect (pauses capture)
      </p>
    </div>
  );
};

export default PitchGraph;
