import { describe, expect, it } from 'vitest';
import { analysePitch } from './pitch';
import {
  closureIndex, DEFAULT_CALIBRATION, fft, hnrFromAperiodicity, makeCalibration, measureQuality,
  medianQuality, summariseQuality, zoneOf,
} from './voiceQuality';

const SR = 48000;

/** Deterministic noise so tests don't flake. */
const noise = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296 - 0.5;
};

/** A sung tone with given harmonic amplitudes plus white "air" noise. */
const voice = (f0: number, harmonics: number[], air: number, n = 4096) => {
  const rand = noise(42);
  return Float32Array.from({ length: n }, (_, i) => {
    let s = 0;
    harmonics.forEach((a, k) => { s += a * Math.sin((2 * Math.PI * f0 * (k + 1) * i) / SR); });
    return 0.25 * s + air * rand();
  });
};

/** Breathy: fundamental dominates, steep roll-off, lots of air. */
const breathy = voice(220, [1, 0.25, 0.08, 0.03, 0.01], 0.12);
/** Firm: strong, slowly falling harmonics (sharp closure pulses), little air. */
const firm = voice(220, [1, 1.1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25], 0.01);

const measure = (buf: Float32Array) => {
  const p = analysePitch(buf.subarray(buf.length - 2048), SR)!;
  return measureQuality(buf, SR, p.hz, p.aperiodicity);
};

describe('fft', () => {
  it('puts a pure tone in its bin', () => {
    const n = 64;
    const re = Float64Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * 5 * i) / n));
    const im = new Float64Array(n);
    fft(re, im);
    const mags = Array.from(re, (r, k) => Math.hypot(r, im[k]));
    expect(mags[5]).toBeCloseTo(n / 2, 6);
    expect(mags[59]).toBeCloseTo(n / 2, 6);
    expect(mags[4]).toBeLessThan(1e-9);
  });
});

describe('hnrFromAperiodicity', () => {
  it('maps periodic → high, noisy → low', () => {
    expect(hnrFromAperiodicity(0.01)).toBeCloseTo(19.96, 1);
    expect(hnrFromAperiodicity(0.5)).toBeCloseTo(0, 5);
    expect(hnrFromAperiodicity(0)).toBeCloseTo(40, 2);
  });
});

describe('measureQuality', () => {
  const b = measure(breathy);
  const f = measure(firm);

  it('finds a larger H1–H2 for breathy phonation', () => {
    expect(b.h1h2!).toBeGreaterThan(8);
    expect(f.h1h2!).toBeLessThan(2);
  });
  it('finds a lower HNR for breathy phonation', () => {
    expect(b.hnr).toBeLessThan(f.hnr - 5);
  });
  it('finds a flatter spectral tilt for firm phonation', () => {
    expect(f.tilt).toBeGreaterThan(b.tilt + 5);
  });
  it('skips H1–H2 on very high notes', () => {
    const high = voice(880, [1, 0.5, 0.25], 0.01);
    expect(measure(high).h1h2).toBeNull();
  });
  it('places them at opposite ends of the closure index', () => {
    const bi = closureIndex(b)!;
    const fi = closureIndex(f)!;
    expect(zoneOf(bi)).toBe('breathy');
    expect(zoneOf(fi)).toBe('firm');
  });
});

describe('closure index & calibration', () => {
  it('maps calibration endpoints to 0 and 100', () => {
    expect(closureIndex(DEFAULT_CALIBRATION.breathy)).toBe(0);
    expect(closureIndex(DEFAULT_CALIBRATION.firm)).toBe(100);
  });
  it('reweights when H1–H2 is missing', () => {
    expect(closureIndex({ ...DEFAULT_CALIBRATION.firm, h1h2: null })).toBe(100);
  });
  it('uses the singer’s own endpoints', () => {
    const cal = makeCalibration({ h1h2: 8, hnr: 12, tilt: -28 }, { h1h2: 2, hnr: 20, tilt: -18 });
    expect(closureIndex({ h1h2: 5, hnr: 16, tilt: -23 }, cal)).toBe(50);
  });
  it('falls back to defaults for measures that did not separate', () => {
    const cal = makeCalibration({ h1h2: 6, hnr: 15, tilt: -25 }, { h1h2: 6.5, hnr: 22, tilt: -15 });
    expect(cal.breathy.h1h2).toBe(DEFAULT_CALIBRATION.breathy.h1h2);
    expect(cal.firm.hnr).toBe(22);
  });
  it('ignores a measure that moved the wrong way', () => {
    // "Firm" sample with *higher* H1–H2 than the breathy one — sung the wrong way round
    const cal = makeCalibration({ h1h2: 3, hnr: 12, tilt: -28 }, { h1h2: 9, hnr: 20, tilt: -18 });
    expect(cal.breathy.h1h2).toBe(DEFAULT_CALIBRATION.breathy.h1h2);
    expect(cal.firm.h1h2).toBe(DEFAULT_CALIBRATION.firm.h1h2);
    expect(cal.firm.hnr).toBe(20);
  });
  it('summarises a take with medians', () => {
    const pts = [
      { t: 0, h1h2: 4, hnr: 15, tilt: -20 },
      { t: 1, h1h2: 6, hnr: 17, tilt: -22 },
      { t: 2, h1h2: 30, hnr: 1, tilt: -60 }, // one glitch frame
    ];
    expect(medianQuality(pts)).toEqual({ h1h2: 6, hnr: 15, tilt: -22 });
    expect(summariseQuality(pts)!.index).toBe(closureIndex({ h1h2: 6, hnr: 15, tilt: -22 }));
    expect(summariseQuality([])).toBeNull();
  });
});
