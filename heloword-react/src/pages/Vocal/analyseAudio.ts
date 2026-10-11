import { analysePitch, createPitchSmoother } from './pitch';
import { measureQuality } from './voiceQuality';
import type { TakeMeters } from './useMicAnalyser';

/** Plenty for voice (≤ 1.1 kHz) and ~9× cheaper for YIN than 48 kHz. */
const ANALYSIS_RATE = 16000;
/** Same window length as live capture (2048 samples @ 48 kHz ≈ 43 ms). */
const WINDOW = Math.round(0.0427 * ANALYSIS_RATE);
/** One frame per 1/60 s, like the live animation-frame sampler. */
const HOP = Math.round(ANALYSIS_RATE / 60);
/** Voice-quality window, matching live capture (4096 samples @ 48 kHz ≈ 85 ms). */
const QUALITY_WINDOW = Math.round(0.0853 * ANALYSIS_RATE);
/** Frames between yields to the UI thread. */
const CHUNK = 1500;

/**
 * Decodes any browser-playable audio and renders it at `rate` with
 * `channels` channels (downmixing / resampling as needed).
 */
export const decodeAudio = async (blob: Blob, rate: number, channels?: number): Promise<AudioBuffer> => {
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    ctx.close().catch(() => {});
  }
  const ch = channels ?? decoded.numberOfChannels;
  const offline = new OfflineAudioContext(ch, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  return offline.startRendering();
};

export interface AnalysedAudio {
  meters: TakeMeters;
  seconds: number;
}

/**
 * Builds pitch & waveform meters for an audio file the same way live capture
 * does, so imported audio replays in the charts like a recorded take.
 */
export const analyseAudio = async (blob: Blob, onProgress?: (fraction: number) => void): Promise<AnalysedAudio> => {
  // Downmix + resample in one offline render.
  const rendered = await decodeAudio(blob, ANALYSIS_RATE, 1);
  const samples = rendered.getChannelData(0);

  const meters: Required<TakeMeters> = { pitch: [], wave: [], quality: [] };
  const smoother = createPitchSmoother();
  const total = Math.max(1, Math.floor((samples.length - WINDOW) / HOP));
  for (let f = 0; f < total; f++) {
    const start = f * HOP;
    const frame = samples.subarray(start, start + WINDOW);
    let min = 0;
    let max = 0;
    for (let i = 0; i < frame.length; i++) {
      if (frame[i] < min) min = frame[i];
      else if (frame[i] > max) max = frame[i];
    }
    // Stamp at the window's end — live frames hold the most recent samples.
    const t = (start + WINDOW) / ANALYSIS_RATE;
    meters.wave.push({ t, min, max });
    const detected = analysePitch(frame, ANALYSIS_RATE);
    const midi = smoother.push(detected?.hz ?? null);
    meters.pitch.push({ t, midi });
    if (detected && midi !== null) {
      const end = start + WINDOW;
      const qFrame = samples.subarray(Math.max(0, end - QUALITY_WINDOW), end);
      meters.quality.push({ t, ...measureQuality(qFrame, ANALYSIS_RATE, detected.hz, detected.aperiodicity) });
    }

    if (f % CHUNK === CHUNK - 1) {
      onProgress?.(f / total);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress?.(1);
  return { meters, seconds: rendered.duration };
};
