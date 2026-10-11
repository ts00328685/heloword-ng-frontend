import { describe, expect, it } from 'vitest';
import { encodePcmToMp3, toInt16 } from './encodeMp3';

const RATE = 44100;
const tone = (hz: number, seconds: number) =>
  Float32Array.from({ length: RATE * seconds }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / RATE));

/** Every MP3 frame starts with an 11-bit sync word. */
const startsWithFrameSync = (b: Uint8Array) => b[0] === 0xff && (b[1] & 0xe0) === 0xe0;

describe('encodePcmToMp3', () => {
  it('encodes mono PCM to a 128 kbps MP3', async () => {
    const progress: number[] = [];
    const blob = await encodePcmToMp3([tone(440, 2)], RATE, (p) => progress.push(p));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(blob.type).toBe('audio/mpeg');
    expect(startsWithFrameSync(bytes)).toBe(true);
    // 128 kbps × 2 s ≈ 32 KB
    expect(bytes.length).toBeGreaterThan(28_000);
    expect(bytes.length).toBeLessThan(36_000);
    expect(progress[progress.length - 1]).toBe(1);
  });

  it('encodes stereo when given two channels', async () => {
    const blob = await encodePcmToMp3([tone(440, 1), tone(660, 1)], RATE);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(startsWithFrameSync(bytes)).toBe(true);
    // Channel-mode bits (byte 3, top two bits): 11 = mono, anything else = stereo
    expect(bytes[3] >> 6).not.toBe(3);
  });
});

describe('toInt16 (volume)', () => {
  const src = Float32Array.from([0.5, -0.5, 0.9, -0.9]);
  it('scales by gain', () => {
    expect(Array.from(toInt16(src, 0, 2, 1))).toEqual([16383, -16384]);
    expect(Array.from(toInt16(src, 0, 2, 0.5))).toEqual([8191, -8192]);
  });
  it('clips at full scale when boosted too far', () => {
    expect(Array.from(toInt16(src, 2, 4, 2))).toEqual([32767, -32768]);
  });
});
