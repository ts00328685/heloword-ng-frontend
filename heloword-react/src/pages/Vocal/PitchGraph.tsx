import React, { useRef } from 'react';
import { freqToNote, isSharp, midiToFreq, midiToNoteName } from './pitch';
import { BUFFER_SECONDS, MicData, NOW_POSITION } from './useMicAnalyser';
import { useCanvasLoop } from './useCanvasLoop';

interface Props {
  dataRef: React.MutableRefObject<MicData>;
  isDark: boolean;
  /** Visible range in semitones. */
  span: number;
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

/**
 * Piano-roll style pitch trace: one horizontal band per semitone, last 20 s
 * scrolling right-to-left. The view follows the singer with hysteresis so
 * the history doesn't jitter vertically on every note.
 */
const PitchGraph: React.FC<Props> = ({ dataRef, isDark, span }) => {
  const centerRef = useRef(60);
  const targetRef = useRef(60);
  /** Pointer x in CSS px relative to the canvas, or null when not hovering. */
  const hoverXRef = useRef<number | null>(null);

  const canvasRef = useCanvasLoop((ctx, w, h) => {
    const { pitch, now } = dataRef.current;
    const plotW = w - GUTTER;
    const plotH = h - AXIS_H;

    // Follow the voice
    let latest: number | null = null;
    for (let i = pitch.length - 1; i >= 0 && now - pitch[i].t < 0.3; i--) {
      if (pitch[i].midi !== null) { latest = pitch[i].midi; break; }
    }
    if (latest !== null) {
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
    ctx.lineWidth = 2.5;
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
      ctx.arc(nowX, yOf(latest), 4, 0, Math.PI * 2);
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
        const y = yOf(best.midi);
        const n = freqToNote(midiToFreq(best.midi));
        ctx.fillStyle = c.line;
        ctx.strokeStyle = isDark ? '#111827' : '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const title = n.name;
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
    dataRef.current.paused = false;
  };

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-72 sm:h-80 block rounded-xl cursor-crosshair touch-pan-y"
      onPointerMove={setHover}
      onPointerDown={setHover}
      onPointerLeave={clearHover}
      onPointerCancel={clearHover}
    />
  );
};

export default PitchGraph;
