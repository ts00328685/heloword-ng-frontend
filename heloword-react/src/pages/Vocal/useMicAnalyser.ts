import { useCallback, useEffect, useRef, useState } from 'react';
import { analysePitch, createPitchSmoother, freqToNote, midiToFreq, NoteInfo } from './pitch';
import { measureQuality, QualityPoint, QualityValues } from './voiceQuality';

/** How much history the graphs keep, in seconds. */
export const BUFFER_SECONDS = 20;
/** Where "now" sits across the graphs (0 = left, 1 = right); the rest is empty runway. */
export const NOW_POSITION = 0.8;

export interface PitchPoint { t: number; midi: number | null }
export interface WavePoint { t: number; min: number; max: number }

/** Latest raw frame, for the cycle (oscilloscope) view. Live only. */
export interface ScopeFrame {
  samples: Float32Array;
  sampleRate: number;
  /** Detected fundamental, or null when unvoiced. */
  hz: number | null;
}

export type FrameListener = (t: number, midi: number | null, quality: QualityValues | null) => void;

export interface MicData {
  pitch: PitchPoint[];
  wave: WavePoint[];
  /** Voice-quality measures for voiced frames only (so it's sparser than `pitch`). */
  quality: QualityPoint[];
  scope?: ScopeFrame | null;
  /** "Now" on the time axis, in seconds. Live: performance clock, frozen while stopped. Replay: audio position. */
  now: number;
  running: boolean;
  /** Set by the pitch graph while hovered — sampling halts so the view holds still. */
  paused: boolean;
  /** Freeze button / Space — like `paused`, but stays on until toggled off. */
  frozen?: boolean;
  /** Replaying a take: data exists after `now` and times are seconds into the take. */
  replay?: boolean;
  /** A–B loop of the replayed take, in take seconds. */
  loop?: { a: number; b: number } | null;
  /** Replayed take's volume — the waveform is drawn at the level that will be heard / saved. */
  gain?: number;
}

/** Meter data captured alongside a recording; `t` is seconds from the start of the take. */
export interface TakeMeters {
  pitch: PitchPoint[];
  wave: WavePoint[];
  /** Missing on takes recorded before voice-quality analysis existed. */
  quality?: QualityPoint[];
}

const FFT_SIZE = 2048;
/** Longer window for voice quality: sharper harmonics, ~85 ms at 48 kHz. */
const QUALITY_FFT_SIZE = 4096;

/**
 * Opens the microphone and samples it every animation frame into rolling
 * 20-second pitch & waveform buffers. Buffers live in a ref (not state) so
 * 60 fps updates don't re-render React; only the big note readout is state.
 */
export const useMicAnalyser = () => {
  const dataRef = useRef<MicData>({ pitch: [], wave: [], quality: [], now: performance.now() / 1000, running: false, paused: false });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Last note detected — held through silences (and after the mic stops). */
  const [note, setNote] = useState<NoteInfo | null>(null);
  /** Whether `note` is being sung right now, or is held from earlier. */
  const [voiced, setVoiced] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const captureRef = useRef<(Required<TakeMeters> & { start: number }) | null>(null);
  /** Called for every frame added to the live view (not while paused/frozen). */
  /** Monitor (hear yourself) level; 0 = off. Kept in a ref so it applies when the mic starts. */
  const monitorLevelRef = useRef(0);
  const monitorGainRef = useRef<GainNode | null>(null);
  /** Rough mic-to-ear delay of the monitor path, once the mic is open. */
  const [monitorLatencyMs, setMonitorLatencyMs] = useState<number | null>(null);

  /** Route the mic to the speakers/headphones at `level` (0 turns monitoring off). */
  const setMonitorLevel = useCallback((level: number) => {
    monitorLevelRef.current = level;
    const g = monitorGainRef.current;
    if (g) g.gain.setTargetAtTime(level, g.context.currentTime, 0.02);
  }, []);

  /** Called for every frame added to the live view (not while paused/frozen). */
  const frameListenersRef = useRef(new Set<FrameListener>());
  /** Subscribe to live frames; returns the unsubscribe function. */
  const addFrameListener = useCallback((fn: FrameListener) => {
    frameListenersRef.current.add(fn);
    return () => { frameListenersRef.current.delete(fn); };
  }, []);

  /** Start copying every analysed frame into a take (call when recording starts). */
  const beginCapture = useCallback(() => {
    captureRef.current = { start: performance.now() / 1000, pitch: [], wave: [], quality: [] };
  }, []);

  const endCapture = useCallback((): TakeMeters => {
    const c = captureRef.current;
    captureRef.current = null;
    return { pitch: c?.pitch ?? [], wave: c?.wave ?? [], quality: c?.quality ?? [] };
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    monitorGainRef.current = null;
    setMonitorLatencyMs(null);
    dataRef.current.running = false;
    dataRef.current.scope = null;
    setRunning(false);
    setVoiced(false);
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
      // "interactive" asks for the smallest output buffer — matters for monitoring.
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      const qualityAnalyser = ctx.createAnalyser();
      qualityAnalyser.fftSize = QUALITY_FFT_SIZE;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      source.connect(qualityAnalyser);
      // Monitor path: silent unless switched on. Never touches the recording (MediaRecorder reads the raw stream).
      const monitor = ctx.createGain();
      monitor.gain.value = monitorLevelRef.current;
      source.connect(monitor).connect(ctx.destination);
      monitorGainRef.current = monitor;
      setMonitorLatencyMs(Math.round(((ctx.baseLatency ?? 0) + (ctx.outputLatency ?? 0)) * 1000) || null);

      streamRef.current = stream;
      ctxRef.current = ctx;

      const buf = new Float32Array(FFT_SIZE);
      const qualityBuf = new Float32Array(QUALITY_FFT_SIZE);
      const smoother = createPitchSmoother();
      let lastNoteUpdate = 0;
      let pausedAt: number | null = null;
      const data = dataRef.current;
      data.pitch = [];
      data.wave = [];
      data.quality = [];
      data.running = true;
      data.paused = false;
      setRunning(true);

      const tick = () => {
        const t = performance.now() / 1000;
        const capture = captureRef.current;

        const halted = data.paused || !!data.frozen;
        if (halted) {
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
          for (const p of data.quality) p.t += shift;
          if (!capture) smoother.reset();
          pausedAt = null;
        }

        analyser.getFloatTimeDomainData(buf);

        let min = 0;
        let max = 0;
        for (let i = 0; i < buf.length; i++) {
          if (buf[i] < min) min = buf[i];
          else if (buf[i] > max) max = buf[i];
        }

        const detected = analysePitch(buf, ctx.sampleRate);
        const midi = smoother.push(detected?.hz ?? null);
        data.scope = { samples: buf, sampleRate: ctx.sampleRate, hz: detected?.hz ?? null };

        // Voice quality only for frames the pitch line accepts as sung.
        let quality: QualityValues | null = null;
        if (detected && midi !== null) {
          qualityAnalyser.getFloatTimeDomainData(qualityBuf);
          quality = measureQuality(qualityBuf, ctx.sampleRate, detected.hz, detected.aperiodicity);
        }

        if (capture) {
          const ct = t - capture.start;
          capture.wave.push({ t: ct, min, max });
          capture.pitch.push({ t: ct, midi });
          if (quality) capture.quality.push({ t: ct, ...quality });
        }
        if (halted) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        data.wave.push({ t, min, max });
        data.pitch.push({ t, midi });
        if (quality) data.quality.push({ t, ...quality });
        frameListenersRef.current.forEach((fn) => fn(t, midi, quality));

        const cutoff = t - BUFFER_SECONDS - 1;
        while (data.wave.length && data.wave[0].t < cutoff) data.wave.shift();
        while (data.pitch.length && data.pitch[0].t < cutoff) data.pitch.shift();
        while (data.quality.length && data.quality[0].t < cutoff) data.quality.shift();
        data.now = t;

        if (t - lastNoteUpdate > 0.08) {
          lastNoteUpdate = t;
          if (midi !== null) setNote(freqToNote(midiToFreq(midi)));
          setVoiced(midi !== null);
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

  return {
    dataRef, running, error, note, voiced, start, stop, beginCapture, endCapture, addFrameListener,
    setMonitorLevel, monitorLatencyMs,
  };
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
