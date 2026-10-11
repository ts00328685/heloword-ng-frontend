import React from 'react';
import { BUFFER_SECONDS, indexAtTime, MicData, NOW_POSITION } from './useMicAnalyser';
import { useCanvasLoop } from './useCanvasLoop';

interface Props {
  dataRef: React.MutableRefObject<MicData>;
  isDark: boolean;
}

/** Same as PitchGraph so both charts' "now" lines align. */
const GUTTER = 52;
const TICKS = [1, 0.5, 0, -0.5, -1];

/** Audacity-style min/max envelope of the mic signal over the last 20 s. */
const WaveformView: React.FC<Props> = ({ dataRef, isDark }) => {
  const canvasRef = useCanvasLoop((ctx, w, h) => {
    const { wave, now, replay, loop } = dataRef.current;
    // A replayed take is drawn at its playback / MP3 volume
    const g = replay ? dataRef.current.gain ?? 1 : 1;
    const plotW = w - GUTTER;
    const pad = 6;
    const yOf = (v: number) => pad + ((1 - v) / 2) * (h - pad * 2);

    const c = isDark
      ? { bg: '#111827', grid: '#374151', label: '#9ca3af', wave: '#818cf8', zero: '#6b7280', clip: '#f87171' }
      : { bg: '#f8fafc', grid: '#e5e7eb', label: '#6b7280', wave: '#6366f1', zero: '#9ca3af', clip: '#ef4444' };

    ctx.fillStyle = c.bg;
    ctx.fillRect(GUTTER, 0, plotW, h);

    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    for (const v of TICKS) {
      const y = Math.round(yOf(v));
      ctx.fillStyle = v === 0 ? c.zero : c.grid;
      ctx.fillRect(GUTTER, y, plotW, 1);
      ctx.fillStyle = c.label;
      ctx.fillText(v.toFixed(1), GUTTER - 6, y);
    }
    ctx.textAlign = 'left';

    // Bucket samples into one min/max pair per pixel column. "Now" sits at
    // NOW_POSITION; a replayed take also fills the columns to its right.
    const cols = Math.max(1, Math.floor(plotW));
    const nowCol = Math.floor(plotW * NOW_POSITION);
    const secPerCol = BUFFER_SECONDS / nowCol;
    const mins = new Float32Array(cols);
    const maxs = new Float32Array(cols);
    const has = new Uint8Array(cols);
    const tEnd = now + (cols - nowCol) * secPerCol;
    for (let i = indexAtTime(wave, now - BUFFER_SECONDS); i < wave.length && wave[i].t <= tEnd; i++) {
      const p = wave[i];
      const col = Math.min(cols - 1, Math.max(0, nowCol + Math.floor((p.t - now) / secPerCol)));
      if (!has[col]) { mins[col] = p.min; maxs[col] = p.max; has[col] = 1; }
      else { if (p.min < mins[col]) mins[col] = p.min; if (p.max > maxs[col]) maxs[col] = p.max; }
    }

    ctx.fillStyle = c.wave;
    for (let i = 0; i < cols; i++) {
      if (!has[i]) continue;
      ctx.globalAlpha = replay && i >= nowCol ? 0.35 : 1; // upcoming part of a take, dimmed
      const hi = maxs[i] * g;
      const lo = mins[i] * g;
      const clipped = hi > 1 || lo < -1;
      if (clipped) ctx.fillStyle = c.clip;
      const yTop = yOf(Math.min(1, hi));
      const yBot = yOf(Math.max(-1, lo));
      ctx.fillRect(GUTTER + i, yTop, 1, Math.max(1, yBot - yTop));
      if (clipped) ctx.fillStyle = c.wave;
    }
    ctx.globalAlpha = 1;

    // A–B loop of a replayed take
    if (replay && loop) {
      const xOf = (t: number) => GUTTER + nowCol + (t - now) / secPerCol;
      const xa = Math.max(GUTTER, xOf(loop.a));
      const xb = Math.min(GUTTER + plotW, xOf(loop.b));
      if (xb > xa) {
        ctx.fillStyle = isDark ? 'rgba(52,211,153,0.10)' : 'rgba(16,185,129,0.10)';
        ctx.fillRect(xa, 0, xb - xa, h);
      }
      ctx.fillStyle = isDark ? '#34d399' : '#10b981';
      for (const x of [xOf(loop.a), xOf(loop.b)]) {
        if (x >= GUTTER && x <= GUTTER + plotW) ctx.fillRect(Math.round(x), 0, 1.5, h);
      }
    }

    // "Now" marker — same position as on the pitch graph
    ctx.fillStyle = c.zero;
    ctx.fillRect(GUTTER + nowCol, 0, 1, h);
  });

  return <canvas ref={canvasRef} className="w-full h-36 block rounded-xl" />;
};

export default WaveformView;
