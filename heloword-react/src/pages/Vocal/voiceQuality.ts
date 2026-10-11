/**
 * Voice-quality measures that track vocal-fold closure, from a microphone.
 *
 * A mic can't see the folds (that needs an electroglottograph), but closure
 * leaves well-known acoustic fingerprints:
 *   - H1–H2: 1st minus 2nd harmonic level. Breathy (incomplete closure) → the
 *     fundamental dominates → high. Firm/pressed → low or negative.
 *   - HNR: harmonics-to-noise ratio. Breathy → audible air → low.
 *   - Tilt: high- vs low-band energy. Firm closure → abrupt pulses → more
 *     high-frequency energy → flatter (higher) tilt.
 * They're combined into one 0 (breathy) … 100 (firm) "closure index".
 *
 * Pure functions — unit-tested in voiceQuality.test.ts.
 */

export interface QualityPoint {
  /** Seconds (same clock as the pitch points it accompanies). */
  t: number;
  /** H1–H2 in dB, or null when it can't be measured reliably (very high notes). */
  h1h2: number | null;
  /** Harmonics-to-noise ratio in dB. */
  hnr: number;
  /** Spectral tilt (alpha ratio) in dB: 1–5 kHz vs 50 Hz–1 kHz energy. */
  tilt: number;
}

export type QualityValues = Omit<QualityPoint, 't'>;

/** Endpoints of the breathy → firm scale, per measure. */
export interface QualityCalibration {
  breathy: QualityValues;
  firm: QualityValues;
}

/** Typical values for a sustained sung vowel; calibration replaces them. */
export const DEFAULT_CALIBRATION: QualityCalibration = {
  breathy: { h1h2: 12, hnr: 9, tilt: -32 },
  firm: { h1h2: -2, hnr: 24, tilt: -12 },
};

/** H1–H2 needs several clean harmonics; above ~D5 (≈ 600 Hz) it isn't meaningful. */
export const MAX_H1H2_F0 = 600;

/** Weights of each measure in the closure index (renormalised when one is missing). */
const WEIGHTS = { h1h2: 0.5, hnr: 0.3, tilt: 0.2 } as const;

/** Index boundaries for the three zones. */
export const ZONES = { breathyBelow: 33, firmAbove: 67 } as const;
export type Zone = 'breathy' | 'balanced' | 'firm';

// ── FFT ────────────────────────────────────────────────────────────────

const twiddleCache = new Map<number, { cos: Float64Array; sin: Float64Array }>();
const twiddles = (n: number) => {
  let tw = twiddleCache.get(n);
  if (!tw) {
    const cos = new Float64Array(n / 2);
    const sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      cos[i] = Math.cos((-2 * Math.PI * i) / n);
      sin[i] = Math.sin((-2 * Math.PI * i) / n);
    }
    tw = { cos, sin };
    twiddleCache.set(n, tw);
  }
  return tw;
};

/** In-place iterative radix-2 FFT. `re.length` must be a power of two. */
export const fft = (re: Float64Array, im: Float64Array): void => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  const { cos, sin } = twiddles(n);
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step];
        const wi = sin[k * step];
        const a = start + k;
        const b = a + half;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
};

const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

/** Hann-windowed power spectrum (zero-padded to a power of two). */
export const powerSpectrum = (frame: Float32Array): { power: Float64Array; size: number } => {
  const size = nextPow2(frame.length);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const n = frame.length;
  for (let i = 0; i < n; i++) re[i] = frame[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  fft(re, im);
  const power = new Float64Array(size / 2);
  for (let k = 0; k < size / 2; k++) power[k] = re[k] * re[k] + im[k] * im[k];
  return { power, size };
};

// ── Measures ───────────────────────────────────────────────────────────

const db = (p: number) => 10 * Math.log10(Math.max(p, 1e-20));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** HNR (dB) from YIN's aperiodicity (≈ noise share of the energy). */
export const hnrFromAperiodicity = (aperiodicity: number): number => {
  const d = clamp(aperiodicity, 1e-4, 0.999);
  return clamp(10 * Math.log10((1 - d) / d), -5, 40);
};

/** Strongest bin near harmonic `k` of f0 — tolerant of slight f0 error. */
const harmonicPeak = (power: Float64Array, binHz: number, f0: number, k: number) => {
  const centre = (k * f0) / binHz;
  const half = Math.max(1, (0.12 * f0) / binHz);
  let best = 0;
  for (let b = Math.max(1, Math.floor(centre - half)); b <= Math.min(power.length - 1, Math.ceil(centre + half)); b++) {
    if (power[b] > best) best = power[b];
  }
  return best;
};

const bandEnergy = (power: Float64Array, binHz: number, lo: number, hi: number) => {
  let e = 0;
  for (let b = Math.max(1, Math.floor(lo / binHz)); b <= Math.min(power.length - 1, Math.floor(hi / binHz)); b++) e += power[b];
  return e;
};

/**
 * Voice-quality measures for one voiced frame.
 * @param frame ~85 ms of audio ending at the analysis time (longer → sharper harmonics)
 * @param f0 the frame's fundamental (Hz)
 * @param aperiodicity from {@link analysePitch}
 */
export const measureQuality = (frame: Float32Array, sampleRate: number, f0: number, aperiodicity: number): QualityValues => {
  const { power, size } = powerSpectrum(frame);
  const binHz = sampleRate / size;
  const h1h2 = f0 <= MAX_H1H2_F0
    ? clamp(db(harmonicPeak(power, binHz, f0, 1)) - db(harmonicPeak(power, binHz, f0, 2)), -20, 30)
    : null;
  const tilt = clamp(db(bandEnergy(power, binHz, 1000, Math.min(5000, sampleRate / 2))) - db(bandEnergy(power, binHz, 50, 1000)), -60, 10);
  return { h1h2, hnr: hnrFromAperiodicity(aperiodicity), tilt };
};

// ── Closure index ──────────────────────────────────────────────────────

/** Where `v` sits between the breathy (0) and firm (1) endpoints; null if they're too close to tell apart. */
const position = (v: number, breathy: number, firm: number) =>
  Math.abs(firm - breathy) < 1 ? null : clamp((v - breathy) / (firm - breathy), 0, 1);

/** 0 (breathy) … 100 (firm), or null when nothing usable was measured. */
export const closureIndex = (q: QualityValues, cal: QualityCalibration = DEFAULT_CALIBRATION): number | null => {
  let sum = 0;
  let weight = 0;
  const add = (pos: number | null, w: number) => {
    if (pos === null) return;
    sum += pos * w;
    weight += w;
  };
  if (q.h1h2 !== null && cal.breathy.h1h2 !== null && cal.firm.h1h2 !== null) {
    add(position(q.h1h2, cal.breathy.h1h2, cal.firm.h1h2), WEIGHTS.h1h2);
  }
  add(position(q.hnr, cal.breathy.hnr, cal.firm.hnr), WEIGHTS.hnr);
  add(position(q.tilt, cal.breathy.tilt, cal.firm.tilt), WEIGHTS.tilt);
  return weight === 0 ? null : Math.round((100 * sum) / weight);
};

export const zoneOf = (index: number): Zone =>
  index < ZONES.breathyBelow ? 'breathy' : index > ZONES.firmAbove ? 'firm' : 'balanced';

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Median of each measure — robust "typical value" for a stretch of singing. */
export const medianQuality = (points: QualityValues[]): QualityValues | null => {
  if (!points.length) return null;
  return {
    h1h2: median(points.flatMap((p) => (p.h1h2 === null ? [] : [p.h1h2]))),
    hnr: median(points.map((p) => p.hnr))!,
    tilt: median(points.map((p) => p.tilt))!,
  };
};

/**
 * Builds a calibration from a deliberately breathy and a deliberately firm
 * sample. Measures that didn't separate the two (e.g. H1–H2 on a high note),
 * or moved the wrong way, fall back to the defaults so the index stays meaningful.
 */
export const makeCalibration = (breathy: QualityValues, firm: QualityValues): QualityCalibration => {
  /** `firmHigher`: whether firm closure should raise this measure. Wrong-way or too-close samples use the defaults. */
  const pick = <K extends keyof QualityValues>(key: K, firmHigher: boolean, minGap = 2) => {
    const b = breathy[key];
    const f = firm[key];
    const gap = b !== null && f !== null ? ((f as number) - (b as number)) * (firmHigher ? 1 : -1) : -Infinity;
    return gap >= minGap ? { b, f } : { b: DEFAULT_CALIBRATION.breathy[key], f: DEFAULT_CALIBRATION.firm[key] };
  };
  const h = pick('h1h2', false);
  const n = pick('hnr', true);
  const tl = pick('tilt', true);
  return {
    breathy: { h1h2: h.b, hnr: n.b as number, tilt: tl.b as number },
    firm: { h1h2: h.f, hnr: n.f as number, tilt: tl.f as number },
  };
};

export interface QualitySummary extends QualityValues {
  index: number | null;
}

/** Take-level summary: median measures and their closure index. */
export const summariseQuality = (points: QualityPoint[], cal?: QualityCalibration): QualitySummary | null => {
  const m = medianQuality(points);
  return m ? { ...m, index: closureIndex(m, cal) } : null;
};
