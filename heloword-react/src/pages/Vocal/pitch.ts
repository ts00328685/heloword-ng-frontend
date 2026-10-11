/**
 * Pitch detection + note helpers for the vocal trainer.
 * Pure functions only — no Web Audio here, so they're unit-testable.
 */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** Same pitch classes spelled with flats — sharps and flats name the same black key. */
export const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

/** Human voice range we bother searching (≈ D2 … C6). */
export const MIN_FREQ = 70;
export const MAX_FREQ = 1100;

/** Fractional MIDI number (A4 = 69 = 440 Hz). */
export const freqToMidi = (freq: number): number => 69 + 12 * Math.log2(freq / 440);

export const midiToFreq = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** "A4", "C#3" … for an integer MIDI number. */
export const midiToNoteName = (midi: number): string => {
  const m = Math.round(midi);
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
};

/** "D♭4" for MIDI 61 — the flat spelling (naturals are unchanged). */
export const midiToFlatName = (midi: number): string => {
  const m = Math.round(midi);
  return `${FLAT_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
};

/** "C#4 / D♭4" for black keys, "C4" for white keys. */
export const midiToFullName = (midi: number): string => {
  const sharp = midiToNoteName(midi);
  const flat = midiToFlatName(midi);
  return sharp === flat ? sharp : `${sharp} / ${flat}`;
};

/** Compact axis label: "C#/D♭4" for black keys, "C4" for white keys. */
export const midiToAxisLabel = (midi: number): string => {
  const m = Math.round(midi);
  const pc = ((m % 12) + 12) % 12;
  const octave = Math.floor(m / 12) - 1;
  return NOTE_NAMES[pc] === FLAT_NAMES[pc] ? `${NOTE_NAMES[pc]}${octave}` : `${NOTE_NAMES[pc]}/${FLAT_NAMES[pc]}${octave}`;
};

export const isSharp = (midi: number): boolean => NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12].includes('#');

export interface NoteInfo {
  name: string;
  midi: number;
  /** -50 … +50, how far off the nearest semitone. */
  cents: number;
}

export const freqToNote = (freq: number): NoteInfo => {
  const exact = freqToMidi(freq);
  const midi = Math.round(exact);
  return { name: midiToNoteName(midi), midi, cents: Math.round((exact - midi) * 100) };
};

/** Root-mean-square amplitude of a frame (0 … 1). */
export const rms = (buf: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
};

export interface PitchResult {
  hz: number;
  /**
   * YIN's normalised difference at the detected period (0 = perfectly
   * periodic). It approximates the aperiodic share of the signal's energy,
   * which is what HNR measures.
   */
  aperiodicity: number;
}

/**
 * YIN fundamental-frequency estimator (de Cheveigné & Kawahara, 2002).
 * Returns Hz, or null when the frame is unvoiced / too quiet / out of range.
 */
export const detectPitch = (
  buf: Float32Array,
  sampleRate: number,
  opts?: { threshold?: number; minRms?: number },
): number | null => analysePitch(buf, sampleRate, opts)?.hz ?? null;

/** YIN with its periodicity measure — see {@link PitchResult}. */
export const analysePitch = (
  buf: Float32Array,
  sampleRate: number,
  { threshold = 0.15, minRms = 0.01 }: { threshold?: number; minRms?: number } = {},
): PitchResult | null => {
  if (rms(buf) < minRms) return null;

  const tauMin = Math.floor(sampleRate / MAX_FREQ);
  const tauMax = Math.min(Math.floor(sampleRate / MIN_FREQ), Math.floor(buf.length / 2));
  const w = buf.length - tauMax;
  if (tauMax <= tauMin || w <= 0) return null;

  // Step 2: difference function
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < w; i++) {
      const delta = buf[i] - buf[i + tau];
      sum += delta * delta;
    }
    d[tau] = sum;
  }

  // Step 3: cumulative mean normalised difference
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    cmnd[tau] = running === 0 ? 1 : (d[tau] * tau) / running;
  }

  // Step 4: absolute threshold — first dip below threshold, then walk to its local minimum
  let tauEst = -1;
  for (let tau = Math.max(2, tauMin); tau < tauMax; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 < tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauEst = tau;
      break;
    }
  }
  if (tauEst === -1) return null;

  // Step 5: parabolic interpolation for sub-sample precision
  const x0 = cmnd[tauEst - 1];
  const x1 = cmnd[tauEst];
  const x2 = cmnd[tauEst + 1] ?? x1;
  const denom = x0 + x2 - 2 * x1;
  const better = denom !== 0 ? tauEst + (x0 - x2) / (2 * denom) : tauEst;

  const freq = sampleRate / better;
  return freq >= MIN_FREQ && freq <= MAX_FREQ ? { hz: freq, aperiodicity: Math.max(0, x1) } : null;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * Per-stream pitch smoother: median over the last few frames kills
 * single-frame octave glitches. Shared by live capture and file analysis so
 * both draw the same line.
 */
export const createPitchSmoother = (window = 5) => {
  const recent: (number | null)[] = [];
  return {
    /** Feed one frame's raw Hz (or null); returns the smoothed MIDI value or null. */
    push(hz: number | null): number | null {
      recent.push(hz === null ? null : freqToMidi(hz));
      if (recent.length > window) recent.shift();
      const voiced = recent.filter((m): m is number => m !== null);
      return hz !== null && voiced.length >= 3 ? median(voiced) : null;
    },
    reset() {
      recent.length = 0;
    },
  };
};
