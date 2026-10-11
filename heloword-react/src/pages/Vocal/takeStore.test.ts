import { describe, expect, it } from 'vitest';
import { exportTake, parseExport } from './takeStore';

describe('take export / import', () => {
  it('round-trips audio, name and meters', async () => {
    const audio = new Uint8Array([1, 2, 3, 250, 255]);
    const blob = await exportTake({
      id: 7,
      name: 'Warm-up',
      blob: new Blob([audio], { type: 'audio/webm' }),
      ext: 'webm',
      seconds: 1.5,
      createdAt: 1700000000000,
      gain: 1.5,
      meters: {
        pitch: [{ t: 0.01666, midi: 69.12345 }, { t: 0.0333, midi: null }],
        wave: [{ t: 0.01666, min: -0.25, max: 0.31234 }],
        quality: [{ t: 0.01666, h1h2: 5.12345, hnr: 18.5, tilt: -20.25 }, { t: 0.0333, h1h2: null, hnr: 12, tilt: -30 }],
      },
    });
    const back = await parseExport(blob);
    expect(back.name).toBe('Warm-up');
    expect(back.ext).toBe('webm');
    expect(back.seconds).toBe(1.5);
    expect(back.createdAt).toBe(1700000000000);
    expect(back.meters.pitch).toEqual([{ t: 0.017, midi: 69.123 }, { t: 0.033, midi: null }]);
    expect(back.meters.wave).toEqual([{ t: 0.017, min: -0.25, max: 0.312 }]);
    expect(new Uint8Array(await back.blob.arrayBuffer())).toEqual(audio);
    expect(back.blob.type).toBe('audio/webm');
    expect(back.gain).toBe(1.5);
    expect(back.meters.quality).toEqual([
      { t: 0.017, h1h2: 5.123, hnr: 18.5, tilt: -20.25 },
      { t: 0.033, h1h2: null, hnr: 12, tilt: -30 },
    ]);
  });

  it('rejects other JSON files', async () => {
    await expect(parseExport(new Blob(['{"hello":1}']))).rejects.toMatchObject({ code: 'notTakeFile' });
    await expect(parseExport(new Blob(['not json']))).rejects.toMatchObject({ code: 'invalidFile' });
  });
});
