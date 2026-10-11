import { useCallback, useEffect, useRef, useState } from 'react';
import { usePersistedState } from './usePersistedState';

export const MIN_BPM = 30;
export const MAX_BPM = 240;
/** Common bar lengths: simple (2–5), odd (5, 7), compound (6, 9, 12) and 8 / 16 for subdivision practice. */
export const BEAT_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 12, 16];
/** Look-ahead scheduler (Chris Wilson, "A Tale of Two Clocks"). */
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;

export const clampBpm = (n: number) => Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(n)));

/**
 * Metronome state + Web Audio scheduler. Clicks are scheduled on the audio
 * clock so timing stays tight even while the main thread draws graphs.
 * Shared by the Metronome panel and the bottom dock.
 */
export const useMetronome = () => {
  const [bpm, setBpm] = usePersistedState('metronome-bpm', 100, (v) => v >= MIN_BPM && v <= MAX_BPM);
  const [volume, setVolume] = usePersistedState('metronome-volume', 0.7, (v) => v >= 0 && v <= 1);
  const [beats, setBeats] = usePersistedState('metronome-beats', 4, (v) => BEAT_OPTIONS.includes(v));
  const [playing, setPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(-1);

  const bpmRef = useRef(bpm);
  const beatsRef = useRef(beats);
  const volumeRef = useRef(volume);
  bpmRef.current = bpm;
  beatsRef.current = beats;
  volumeRef.current = volume;

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const timerRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const nextTimeRef = useRef(0);
  const beatIdxRef = useRef(0);
  const queueRef = useRef<{ beat: number; time: number }[]>([]);
  const tapsRef = useRef<number[]>([]);

  useEffect(() => {
    if (masterRef.current && ctxRef.current) {
      masterRef.current.gain.setTargetAtTime(volume, ctxRef.current.currentTime, 0.01);
    }
  }, [volume]);

  const click = (ctx: AudioContext, dest: AudioNode, time: number, accent: boolean) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.frequency.value = accent ? 1500 : 1000;
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(1, time + 0.001);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(env).connect(dest);
    osc.start(time);
    osc.stop(time + 0.06);
  };

  const stop = useCallback(() => {
    clearInterval(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    queueRef.current = [];
    setPlaying(false);
    setCurrentBeat(-1);
  }, []);

  const start = useCallback(async () => {
    if (!ctxRef.current) {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = volumeRef.current;
      master.connect(ctx.destination);
      ctxRef.current = ctx;
      masterRef.current = master;
    }
    const ctx = ctxRef.current;
    const master = masterRef.current!;
    await ctx.resume();

    beatIdxRef.current = 0;
    nextTimeRef.current = ctx.currentTime + 0.05;
    queueRef.current = [];

    const schedule = () => {
      while (nextTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_S) {
        const beat = beatIdxRef.current % beatsRef.current;
        click(ctx, master, nextTimeRef.current, beat === 0);
        queueRef.current.push({ beat, time: nextTimeRef.current });
        nextTimeRef.current += 60 / bpmRef.current;
        beatIdxRef.current = beat + 1;
      }
    };
    schedule();
    timerRef.current = window.setInterval(schedule, LOOKAHEAD_MS);

    const draw = () => {
      const q = queueRef.current;
      let latest = -1;
      while (q.length && q[0].time <= ctx.currentTime) latest = q.shift()!.beat;
      if (latest !== -1) setCurrentBeat(latest);
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    setPlaying(true);
  }, []);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    ctxRef.current?.close().catch(() => {});
  }, []);

  const tap = () => {
    const now = performance.now();
    const taps = tapsRef.current.filter((t) => now - t < 2500);
    taps.push(now);
    tapsRef.current = taps.slice(-6);
    if (tapsRef.current.length >= 2) {
      const ts = tapsRef.current;
      const avg = (ts[ts.length - 1] - ts[0]) / (ts.length - 1);
      setBpm(clampBpm(60000 / avg));
    }
  };

  const toggle = () => { if (playing) stop(); else start(); };

  return { bpm, setBpm, volume, setVolume, beats, setBeats, playing, currentBeat, start, stop, toggle, tap };
};

export type MetronomeApi = ReturnType<typeof useMetronome>;
