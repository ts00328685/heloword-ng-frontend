import React from 'react';
import { BUFFER_SECONDS, MicData, NOW_POSITION } from './useMicAnalyser';
import { useCanvasLoop } from './useCanvasLoop';

interface Props {
  dataRef: React.MutableRefObject<MicData>;
  isDark: boolean;
}

const GUTTER = 36;
const TICKS = [1, 0.5, 0, -0.5, -1];

/** Audacity-style min/max envelope of the mic signal over the last 20 s. */
const WaveformView: React.FC<Props> = ({ dataRef, isDark }) => {
  const canvasRef = useCanvasLoop((ctx, w, h) => {
    const { wave, now } = dataRef.current;
    const plotW = w - GUTTER;
    const pad = 6;
    const yOf = (v: number) => pad + ((1 - v) / 2) * (h - pad * 2);

    const c = isDark
      ? { bg: '#111827', grid: '#374151', label: '#9ca3af', wave: '#818cf8', zero: '#6b7280' }
      : { bg: '#f8fafc', grid: '#e5e7eb', label: '#6b7280', wave: '#6366f1', zero: '#9ca3af' };

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

    // Bucket samples into one min/max pair per pixel column
    const cols = Math.max(1, Math.floor(plotW * NOW_POSITION));
    const mins = new Float32Array(cols);
    const maxs = new Float32Array(cols);
    const has = new Uint8Array(cols);
    for (const p of wave) {
      const age = now - p.t;
      if (age < 0 || age > BUFFER_SECONDS) continue;
      const col = Math.min(cols - 1, Math.floor((1 - age / BUFFER_SECONDS) * cols));
      if (!has[col]) { mins[col] = p.min; maxs[col] = p.max; has[col] = 1; }
      else { if (p.min < mins[col]) mins[col] = p.min; if (p.max > maxs[col]) maxs[col] = p.max; }
    }

    ctx.fillStyle = c.wave;
    for (let i = 0; i < cols; i++) {
      if (!has[i]) continue;
      const yTop = yOf(maxs[i]);
      const yBot = yOf(mins[i]);
      ctx.fillRect(GUTTER + i, yTop, 1, Math.max(1, yBot - yTop));
    }

    // "Now" marker — same position as on the pitch graph
    ctx.fillStyle = c.zero;
    ctx.fillRect(GUTTER + cols, 0, 1, h);
  });

  return <canvas ref={canvasRef} className="w-full h-36 block rounded-xl" />;
};

export default WaveformView;
