import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MicData, ScopeFrame } from './useMicAnalyser';
import { useCanvasLoop } from './useCanvasLoop';

interface Props {
  dataRef: React.MutableRefObject<MicData>;
  isDark: boolean;
  /** Replaying a take — raw audio isn't kept, so the scope can't show it. */
  replay: boolean;
}

const MAX_CYCLES = 3;
/** Older traces drawn behind the current one, fading out. */
const GHOSTS = 4;
const FONT = 'ui-sans-serif, system-ui, sans-serif';

/**
 * Pitch-locked oscilloscope: a few vocal-fold cycles drawn in place, scaled
 * to full height so the *shape* is visible at any loudness. Firm closure
 * shows sharp spikes once per cycle; breathy phonation looks rounded,
 * almost sine-like.
 */
const CycleScope: React.FC<Props> = ({ dataRef, isDark, replay }) => {
  const { t } = useTranslation();
  const ghostsRef = useRef<Float32Array[]>([]);
  /** The mic hook makes a new ScopeFrame per analysed frame (the sample buffer itself is reused). */
  const lastFrameRef = useRef<ScopeFrame | null>(null);
  const hint = replay ? t('vocal.quality.scopeLiveOnly') : t('vocal.quality.scopeHint');

  const canvasRef = useCanvasLoop((ctx, w, h) => {
    const c = isDark
      ? { bg: '#111827', grid: '#374151', line: '#a78bfa', ghost: '167,139,250', text: '#9ca3af' }
      : { bg: '#f8fafc', grid: '#e5e7eb', line: '#7c3aed', ghost: '124,58,237', text: '#6b7280' };
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = c.grid;
    ctx.fillRect(0, Math.round(h / 2), w, 1);

    const scope = dataRef.current.scope;
    const hz = !replay && scope?.hz ? scope.hz : null;

    if (scope && hz) {
      const { samples, sampleRate } = scope;
      const period = sampleRate / hz;
      const cycles = Math.max(1, Math.min(MAX_CYCLES, Math.floor(samples.length / period) - 1));
      // Lock to the strongest peak in the earliest cycle so successive frames line up.
      const from = Math.max(0, Math.floor(samples.length - (cycles + 1) * period));
      let start = from;
      for (let i = from; i < from + period && i < samples.length; i++) if (samples[i] > samples[start]) start = i;
      const span = Math.min(Math.floor(cycles * period), samples.length - start);

      // A new frame from the mic (not a repeat while paused) → resample into a trace.
      if (scope !== lastFrameRef.current) {
        lastFrameRef.current = scope;
        let peak = 1e-6;
        for (let i = 0; i < span; i++) peak = Math.max(peak, Math.abs(samples[start + i]));
        const trace = new Float32Array(Math.max(2, Math.floor(w)));
        for (let x = 0; x < trace.length; x++) trace[x] = samples[start + Math.floor((x / trace.length) * span)] / peak;
        ghostsRef.current = [trace, ...ghostsRef.current].slice(0, GHOSTS + 1);
      }

      // Cycle boundaries
      ctx.save();
      ctx.strokeStyle = c.grid;
      ctx.setLineDash([2, 4]);
      for (let k = 1; k < cycles; k++) {
        const x = Math.round((k / cycles) * w) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      ctx.restore();

      const amp = h * 0.42;
      ghostsRef.current.forEach((trace, gi) => {
        ctx.strokeStyle = gi === 0 ? c.line : `rgba(${c.ghost},${0.35 - gi * 0.07})`;
        ctx.lineWidth = gi === 0 ? 2 : 1.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let x = 0; x < trace.length; x++) {
          const y = h / 2 - trace[x] * amp;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });

      ctx.fillStyle = c.text;
      ctx.font = `10px ${FONT}`;
      ctx.textBaseline = 'top';
      ctx.fillText(`${cycles} × ${hz.toFixed(0)} Hz`, 6, 5);
    } else {
      ghostsRef.current = [];
      ctx.fillStyle = c.text;
      ctx.font = `11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hint, w / 2, h / 2 - 12);
      ctx.textAlign = 'left';
    }
  });

  return <canvas ref={canvasRef} className="w-full h-36 block rounded-xl" aria-label={t('vocal.quality.scopeTitle')} />;
};

export default CycleScope;
