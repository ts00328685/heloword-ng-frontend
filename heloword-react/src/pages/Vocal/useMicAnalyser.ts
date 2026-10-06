import { useCallback, useEffect, useRef, useState } from 'react';
import { detectPitch, freqToMidi, freqToNote, midiToFreq, NoteInfo } from './pitch';

/** How much history the graphs keep, in seconds. */
export const BUFFER_SECONDS = 20;
/** Where "now" sits across the graphs (0 = left, 1 = right); the rest is empty runway. */
export const NOW_POSITION = 0.8;

export interface PitchPoint { t: number; midi: number | null }
export interface WavePoint { t: number; min: number; max: number }

export interface MicData {
  pitch: PitchPoint[];
  wave: WavePoint[];
  /** "Now" on the time axis, in seconds. Live: performance clock, frozen while stopped. Replay: audio position. */
  now: number;
  running: boolean;
  /** Set by the pitch graph while hovered — sampling halts so the view holds still. */
  paused: boolean;
  /** Replaying a take: data exists after `now` and times are seconds into the take. */
  replay?: boolean;
}

/** Meter data captured alongside a recording; `t` is seconds from the start of the take. */
export interface TakeMeters {
  pitch: PitchPoint[];
  wave: WavePoint[];
}

const FFT_SIZE = 2048;
const SMOOTH_WINDOW = 5;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * Opens the microphone and samples it every animation frame into rolling
 * 20-second pitch & waveform buffers. Buffers live in a ref (not state) so
 * 60 fps updates don't re-render React; only the big note readout is state.
 */
export const useMicAnalyser = () => {
  const dataRef = useRef<MicData>({ pitch: [], wave: [], now: performance.now() / 1000, running: false, paused: false });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<NoteInfo | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const captureRef = useRef<(TakeMeters & { start: number }) | null>(null);

  /** Start copying every analysed frame into a take (call when recording starts). */
  const beginCapture = useCallback(() => {
    captureRef.current = { start: performance.now() / 1000, pitch: [], wave: [] };
  }, []);

  const endCapture = useCallback((): TakeMeters => {
    const c = captureRef.current;
    captureRef.current = null;
    return { pitch: c?.pitch ?? [], wave: c?.wave ?? [] };
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    dataRef.current.running = false;
    setRunning(false);
    setNote(null);
  }, []);

  /** Opens the mic (no-op if already open) and resolves to its stream, or null on failure. */
  const start = useCallback(async (): Promise<MediaStream | null> => {
    if (ctxRef.current) return streamRef.current;
    setError(null);
    try {
      // Turn off voice-call processing — it flattens dynamics and smears pitch.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      // Not connected to destination — we never want to hear the mic back.
      ctx.createMediaStreamSource(stream).connect(analyser);

      streamRef.current = stream;
      ctxRef.current = ctx;

      const buf = new Float32Array(FFT_SIZE);
      const recent: (number | null)[] = [];
      let lastNoteUpdate = 0;
      let pausedAt: number | null = null;
      const data = dataRef.current;
      data.pitch = [];
      data.wave = [];
      data.running = true;
      data.paused = false;
      setRunning(true);

      const tick = () => {
        const t = performance.now() / 1000;
        const capture = captureRef.current;

        if (data.paused) {
          if (pausedAt === null) pausedAt = t;
          // Hovering freezes the view, but a take being recorded must keep its meters in sync with the audio.
          if (!capture) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }
        } else if (pausedAt !== null) {
          // Slide history forward by the paused time so the trace resumes without a gap.
          const shift = t - pausedAt;
          for (const p of data.wave) p.t += shift;
          for (const p of data.pitch) p.t += shift;
          if (!capture) recent.length = 0;
          pausedAt = null;
        }

        analyser.getFloatTimeDomainData(buf);

        let min = 0;
        let max = 0;
        for (let i = 0; i < buf.length; i++) {
          if (buf[i] < min) min = buf[i];
          else if (buf[i] > max) max = buf[i];
        }

        // Median over the last few frames kills single-frame octave glitches.
        const hz = detectPitch(buf, ctx.sampleRate);
        recent.push(hz === null ? null : freqToMidi(hz));
        if (recent.length > SMOOTH_WINDOW) recent.shift();
        const voiced = recent.filter((m): m is number => m !== null);
        const midi = hz !== null && voiced.length >= 3 ? median(voiced) : null;

        if (capture) {
          const ct = t - capture.start;
          capture.wave.push({ t: ct, min, max });
          capture.pitch.push({ t: ct, midi });
        }
        if (data.paused) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        data.wave.push({ t, min, max });
        data.pitch.push({ t, midi });

        const cutoff = t - BUFFER_SECONDS - 1;
        while (data.wave.length && data.wave[0].t < cutoff) data.wave.shift();
        while (data.pitch.length && data.pitch[0].t < cutoff) data.pitch.shift();
        data.now = t;

        if (t - lastNoteUpdate > 0.08) {
          lastNoteUpdate = t;
          setNote(midi === null ? null : freqToNote(midiToFreq(midi)));
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return stream;
    } catch (e) {
      stop();
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { dataRef, running, error, note, start, stop, beginCapture, endCapture };
};

/** First index whose `t` is ≥ `t` (points are time-sorted) — lets graphs skip off-screen samples of long takes. */
export const indexAtTime = (points: { t: number }[], t: number): number => {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/** Seconds → "m:ss.s" for take timestamps. */
export const fmtTakeTime = (s: number): string => {
  const r = Math.round(s * 10) / 10; // round first so 59.96 → 1:00.0, not 0:60.0
  const m = Math.floor(r / 60);
  return `${m}:${(r - m * 60).toFixed(1).padStart(4, '0')}`;
};
