import { useEffect, useRef } from 'react';
import type { MicData } from './useMicAnalyser';

export type DrawFn = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

/** Idle charts redraw this often (ms) — enough for anything a wake-up event misses. */
const IDLE_INTERVAL_MS = 250;
/** After a render or user input, draw every frame this long (ms) so easing and hover settle. */
const WAKE_MS = 1000;
const WAKE_EVENTS = ['pointermove', 'pointerdown', 'pointerup', 'wheel', 'keydown', 'resize'] as const;

/** Mic open or a take replaying — the chart's data is moving. */
export const isLiveData = (d: MicData) => d.running || !!d.replay;

/**
 * Keeps a canvas sized to its CSS box (HiDPI-aware) and redraws it every
 * animation frame. `draw` receives CSS-pixel dimensions.
 *
 * To spare slower devices it skips drawing while the canvas is off screen or
 * hidden, and while `isLive` says nothing is moving it only redraws for a
 * moment after a render or user input (plus a slow refresh).
 */
export const useCanvasLoop = (draw: DrawFn, isLive?: () => boolean) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const isLiveRef = useRef(isLive);
  isLiveRef.current = isLive;
  /** Keep drawing every frame until this time (performance.now()). */
  const awakeUntilRef = useRef(0);
  // Every render can change what's drawn (theme, key, target…).
  awakeUntilRef.current = performance.now() + WAKE_MS;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let onScreen = true;
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) awakeUntilRef.current = performance.now() + WAKE_MS;
    });
    io.observe(canvas);

    const wake = () => { awakeUntilRef.current = performance.now() + WAKE_MS; };
    WAKE_EVENTS.forEach((e) => window.addEventListener(e, wake, { passive: true }));

    let raf = 0;
    let lastDraw = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!onScreen) return;
      const live = isLiveRef.current ? isLiveRef.current() : true;
      if (!live && now > awakeUntilRef.current && now - lastDraw < IDLE_INTERVAL_MS) return;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return; // hidden (e.g. collapsed panel)
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawRef.current(ctx, w, h);
      lastDraw = now;
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      WAKE_EVENTS.forEach((e) => window.removeEventListener(e, wake));
    };
  }, []);

  return canvasRef;
};
