import { describe, expect, it } from 'vitest';
import { peakLevel, tallyTake, takeStats, TargetMeter } from './stats';

/** 60 fps frames from a list of [seconds, midi | null] segments. */
const frames = (...segs: [number, number | null][]) => {
  const out: { t: number; midi: number | null }[] = [];
  let t = 0;
  for (const [dur, midi] of segs) {
    for (let i = 0; i < Math.round(dur * 60); i++) {
      out.push({ t, midi });
      t += 1 / 60;
    }
  }
  return out;
};

describe('takeStats', () => {
  it('returns null when nothing was sung', () => {
    expect(takeStats(frames([2, null]))).toBeNull();
  });
  it('summarises range and tuning', () => {
    const s = takeStats(frames([1, 57], [1, null], [1, 69.3]))!;
    expect(Math.round(s.low)).toBe(57);
    expect(Math.round(s.high)).toBe(69);
    expect(s.range).toBe(12);
    expect(s.inTune).toBeCloseTo(0.5, 1); // A3 dead on, A4 30¢ sharp
    expect(s.avgCents).toBeCloseTo(15, 0);
    expect(s.sung).toBeCloseTo(2, 1);
  });
});

describe('TargetMeter', () => {
  it('measures holds, longest and total', () => {
    const t = tallyTake(frames([1, 69], [0.5, 60], [2, 69.1]), 69, 25);
    expect(t.longest).toBeCloseTo(2, 1);
    expect(t.total).toBeCloseTo(3, 1);
    expect(t.current).toBeCloseTo(2, 1);
  });
  it('bridges short detection dropouts but not long ones', () => {
    expect(tallyTake(frames([1, 69], [0.1, null], [1, 69]), 69, 25).longest).toBeGreaterThan(1.9);
    expect(tallyTake(frames([1, 69], [0.5, null], [1, 69]), 69, 25).longest).toBeLessThan(1.1);
  });
  it('respects the tolerance', () => {
    expect(tallyTake(frames([1, 69.3]), 69, 25).total).toBe(0);
    expect(tallyTake(frames([1, 69.3]), 69, 50).total).toBeGreaterThan(0.9);
  });
  it('resets the current hold after leaving the target', () => {
    const m = new TargetMeter(69, 25);
    frames([1, 69], [0.5, 72]).forEach((p) => m.push(p.t, p.midi));
    expect(m.current).toBe(0);
    expect(m.longest).toBeGreaterThan(0.9);
  });
  it('can stop part-way through a take', () => {
    expect(tallyTake(frames([3, 69]), 69, 25, 1).total).toBeCloseTo(1, 1);
  });
});

describe('peakLevel', () => {
  it('finds the loudest sample on either side of zero', () => {
    expect(peakLevel([{ min: -0.2, max: 0.3 }, { min: -0.6, max: 0.1 }])).toBe(0.6);
    expect(peakLevel([])).toBe(0);
  });
});
