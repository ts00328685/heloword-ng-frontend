import { describe, expect, it } from 'vitest';
import { detectPitch, freqToNote, midiToNoteName } from './pitch';

const SR = 48000;
const tone = (hz: number, amp = 0.5, n = 2048) =>
  Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));

describe('note helpers', () => {
  it('names notes', () => {
    expect(midiToNoteName(69)).toBe('A4');
    expect(midiToNoteName(60)).toBe('C4');
    expect(midiToNoteName(61)).toBe('C#4');
  });
  it('measures cents off the nearest note', () => {
    expect(freqToNote(440)).toEqual({ name: 'A4', midi: 69, cents: 0 });
    expect(freqToNote(445).cents).toBe(20);
  });
});

describe('detectPitch', () => {
  it.each([82.41, 130.81, 220, 440, 659.25, 987.77])('detects %s Hz within 1%%', (hz) => {
    const got = detectPitch(tone(hz), SR);
    expect(got).not.toBeNull();
    expect(Math.abs(got! - hz) / hz).toBeLessThan(0.01);
  });
  it('detects the fundamental of a harmonic-rich tone', () => {
    const buf = tone(196);
    const h2 = tone(392, 0.4);
    const h3 = tone(588, 0.3);
    for (let i = 0; i < buf.length; i++) buf[i] += h2[i] + h3[i];
    expect(Math.abs(detectPitch(buf, SR)! - 196)).toBeLessThan(2);
  });
  it('returns null for silence and noise', () => {
    expect(detectPitch(new Float32Array(2048), SR)).toBeNull();
    const noise = Float32Array.from({ length: 2048 }, () => Math.random() * 0.6 - 0.3);
    expect(detectPitch(noise, SR)).toBeNull();
  });
});
