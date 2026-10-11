import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BUFFER_SECONDS, fmtTakeTime, indexAtTime, MicData, NOW_POSITION } from './useMicAnalyser';
import { useCanvasLoop } from './useCanvasLoop';
import { closureIndex, QualityCalibration, QualityPoint, ZONES, zoneOf } from './voiceQuality';

interface Props {
  dataRef: React.MutableRefObject<MicData>;
  isDark: boolean;
  calibration: QualityCalibration;
}

/** Same as PitchGraph / WaveformView so the "now" lines align. */
const GUTTER = 52;
const MAX_GAP_S = 0.15;
/** Exponential smoothing of the drawn line — per-frame values are jumpy. */
const SMOOTH = 0.18;
const HOVER_SNAP_S = 0.15;
const FONT = 'ui-sans-serif, system-ui, sans-serif';

export const ZONE_COLORS = {
  breathy: { light: 'rgba(14,165,233,0.10)', dark: 'rgba(56,189,248,0.10)', solid: '#0ea5e9' },
  balanced: { light: 'rgba(16,185,129,0.10)', dark: 'rgba(52,211,153,0.10)', solid: '#10b981' },
  firm: { light: 'rgba(245,158,11,0.12)', dark: 'rgba(251,191,36,0.10)', solid: '#f59e0b' },
} as const;

/** Breathy (bottom) … firm (top) over the last 20 s, aligned with the pitch chart. */
const ClosureTrace: React.FC<Props> = ({ dataRef, isDark, calibration }) => {
  const { t } = useTranslation();
  const hoverXRef = useRef<number | null>(null);
  const labels = {
    firm: t('vocal.quality.zone.firm'),
    balanced: t('vocal.quality.zone.balanced'),
    breathy: t('vocal.quality.zone.breathy'),
  };

  const canvasRef = useCanvasLoop((ctx, w, h) => {
    const { quality, now, replay } = dataRef.current;
    const plotW = w - GUTTER;
    const histW = plotW * NOW_POSITION;
    const nowX = GUTTER + histW;
    const xOf = (time: number) => nowX - ((now - time) / BUFFER_SECONDS) * histW;
    const pad = 4;
    const yOf = (index: number) => pad + (1 - index / 100) * (h - pad * 2);
    const c = isDark
      ? { label: '#9ca3af', line: '#e5e7eb', grid: '#374151', tipBg: 'rgba(243,244,246,0.95)', tipText: '#111827', tipSub: '#4b5563', future: 'rgba(17,24,39,0.55)' }
      : { label: '#6b7280', line: '#374151', grid: '#e5e7eb', tipBg: 'rgba(17,24,39,0.9)', tipText: '#f9fafb', tipSub: '#d1d5db', future: 'rgba(255,255,255,0.6)' };

    // Zone bands + labels
    const bands: [keyof typeof ZONE_COLORS, number, number][] = [
      ['firm', ZONES.firmAbove, 100],
      ['balanced', ZONES.breathyBelow, ZONES.firmAbove],
      ['breathy', 0, ZONES.breathyBelow],
    ];
    ctx.font = `10px ${FONT}`;
    ctx.textBaseline = 'middle';
    for (const [zone, lo, hi] of bands) {
      ctx.fillStyle = isDark ? ZONE_COLORS[zone].dark : ZONE_COLORS[zone].light;
      ctx.fillRect(GUTTER, yOf(hi), plotW, yOf(lo) - yOf(hi));
      ctx.fillStyle = ZONE_COLORS[zone].solid;
      ctx.fillText(labels[zone], 4, (yOf(lo) + yOf(hi)) / 2, GUTTER - 6);
    }
    ctx.fillStyle = c.grid;
    ctx.fillRect(Math.round(nowX), 0, 1, h);

    // Index line (only the visible slice; a replayed take can be long)
    ctx.save();
    ctx.beginPath();
    ctx.rect(GUTTER, 0, plotW, h);
    ctx.clip();
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let prevT = -Infinity;
    let smooth = 0;
    const i1 = indexAtTime(quality, now + (BUFFER_SECONDS * (1 - NOW_POSITION)) / NOW_POSITION + 0.5);
    for (let i = indexAtTime(quality, now - BUFFER_SECONDS - 0.5); i < i1; i++) {
      const q = quality[i];
      const idx = closureIndex(q, calibration);
      if (idx === null) continue;
      const continues = q.t - prevT < MAX_GAP_S;
      smooth = continues ? smooth + (idx - smooth) * SMOOTH : idx;
      if (continues) ctx.lineTo(xOf(q.t), yOf(smooth));
      else ctx.moveTo(xOf(q.t), yOf(smooth));
      prevT = q.t;
    }
    ctx.stroke();
    if (replay) {
      ctx.fillStyle = c.future;
      ctx.fillRect(nowX, 0, GUTTER + plotW - nowX, h);
    }
    ctx.restore();

    // Hover readout
    const hx = hoverXRef.current;
    if (hx !== null && hx >= GUTTER) {
      const tHover = now - ((replay ? nowX - hx : Math.max(0, nowX - hx)) / histW) * BUFFER_SECONDS;
      let best: QualityPoint | null = null;
      const j1 = indexAtTime(quality, tHover + HOVER_SNAP_S);
      for (let j = indexAtTime(quality, tHover - HOVER_SNAP_S); j < j1; j++) {
        if (!best || Math.abs(quality[j].t - tHover) < Math.abs(best.t - tHover)) best = quality[j];
      }
      const x = best ? xOf(best.t) : hx;
      ctx.fillStyle = c.grid;
      ctx.fillRect(Math.round(x), 0, 1, h);
      const idx = best ? closureIndex(best, calibration) : null;
      if (best && idx !== null) {
        const title = `${idx} · ${labels[zoneOf(idx)]}`;
        const parts = [
          best.h1h2 !== null ? `H1–H2 ${best.h1h2.toFixed(1)} dB` : null,
          `HNR ${best.hnr.toFixed(0)} dB`,
          `${t('vocal.quality.tilt')} ${best.tilt.toFixed(0)} dB`,
          replay ? `@ ${fmtTakeTime(best.t)}` : null,
        ].filter(Boolean);
        // The chart can be narrow (it shares a row with the gauge): wrap the
        // measures onto as many lines as needed, then keep the box inside the canvas.
        const PAD = 7;
        const LINE_H = 13;
        const maxTextW = Math.max(60, w - 4 - PAD * 2);
        ctx.font = `bold 12px ${FONT}`;
        const titleW = ctx.measureText(title).width;
        ctx.font = `10px ${FONT}`;
        const lines: string[] = [];
        for (const part of parts as string[]) {
          const joined = lines.length ? `${lines[lines.length - 1]} · ${part}` : part;
          if (lines.length && ctx.measureText(joined).width <= maxTextW) lines[lines.length - 1] = joined;
          else lines.push(part);
        }
        const textW = Math.max(titleW, ...lines.map((l) => ctx.measureText(l).width));
        const boxW = Math.min(w - 4, textW + PAD * 2);
        const boxH = 20 + lines.length * LINE_H;
        // Prefer the right of the cursor, flip left if it doesn't fit, then clamp to the canvas.
        let bx = x + 8;
        if (bx + boxW > w - 2) bx = x - 8 - boxW;
        bx = Math.min(Math.max(2, bx), w - 2 - boxW);
        // Sit at the top unless that would cover the hovered point (firm readings are drawn high).
        const by = yOf(idx) < boxH + 10 ? h - boxH - 2 : 2;
        ctx.fillStyle = c.tipBg;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, 7);
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.rect(bx, by, boxW, boxH);
        ctx.clip();
        ctx.textBaseline = 'top';
        ctx.fillStyle = c.tipText;
        ctx.font = `bold 12px ${FONT}`;
        ctx.fillText(title, bx + PAD, by + 4);
        ctx.fillStyle = c.tipSub;
        ctx.font = `10px ${FONT}`;
        lines.forEach((line, i) => ctx.fillText(line, bx + PAD, by + 19 + i * LINE_H));
        ctx.restore();
      }
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
      className="w-full h-36 block rounded-xl cursor-crosshair touch-pan-y"
      aria-label={t('vocal.quality.traceTitle')}
      onPointerMove={setHover}
      onPointerDown={setHover}
      onPointerUp={(e) => { if (e.pointerType !== 'mouse') clearHover(); }}
      onPointerLeave={clearHover}
      onPointerCancel={clearHover}
    />
  );
};

export default ClosureTrace;
