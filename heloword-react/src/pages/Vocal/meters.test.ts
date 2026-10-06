import { describe, expect, it } from 'vitest';
import { fmtTakeTime, indexAtTime } from './useMicAnalyser';

describe('indexAtTime', () => {
  const pts = [0, 0.5, 1, 1.5, 2].map((t) => ({ t }));
  it('finds the first sample at or after t', () => {
    expect(indexAtTime(pts, -1)).toBe(0);
    expect(indexAtTime(pts, 0)).toBe(0);
    expect(indexAtTime(pts, 0.7)).toBe(2);
    expect(indexAtTime(pts, 1.5)).toBe(3);
    expect(indexAtTime(pts, 9)).toBe(5);
    expect(indexAtTime([], 1)).toBe(0);
  });
});

describe('fmtTakeTime', () => {
  it('formats m:ss.s', () => {
    expect(fmtTakeTime(0)).toBe('0:00.0');
    expect(fmtTakeTime(12.34)).toBe('0:12.3');
    expect(fmtTakeTime(75.5)).toBe('1:15.5');
    expect(fmtTakeTime(59.96)).toBe('1:00.0');
  });
});
