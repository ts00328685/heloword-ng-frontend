import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { patchWebmHeader, probeDuration, withWebmDuration } from './webmDuration';

/** Minimal MediaRecorder-style webm: EBML header, unknown-size Segment, Info (no Duration), Cluster. */
const header = (withDuration = false) => {
  const ebml = [0x1a, 0x45, 0xdf, 0xa3, 0x84, 0x42, 0x86, 0x81, 0x01];
  const segment = [0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
  const scale = [0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40]; // 1,000,000
  const duration = withDuration ? [0x44, 0x89, 0x84, 0x41, 0x20, 0x00, 0x00] : [];
  const infoBody = [...scale, ...duration];
  const info = [0x15, 0x49, 0xa9, 0x66, 0x80 | infoBody.length, ...infoBody];
  const cluster = [0x1f, 0x43, 0xb6, 0x75, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xe7, 0x81, 0x00];
  return new Uint8Array([...ebml, ...segment, ...info, ...cluster]);
};

/** Finds the Duration element and reads its float value. */
const readDuration = (b: Uint8Array) => {
  for (let i = 0; i < b.length - 3; i++) {
    if (b[i] === 0x44 && b[i + 1] === 0x89 && b[i + 2] === 0x88) {
      return new DataView(b.buffer, b.byteOffset + i + 3, 8).getFloat64(0);
    }
  }
  return null;
};

describe('patchWebmHeader', () => {
  it('adds the duration in milliseconds (default timecode scale)', () => {
    const patched = patchWebmHeader(header(), 3.5);
    expect(patched).not.toBeNull();
    expect(readDuration(patched!)).toBeCloseTo(3500);
  });

  it('keeps what follows Info untouched', () => {
    const src = header();
    const patched = patchWebmHeader(src, 1)!;
    expect(Array.from(patched.slice(-15))).toEqual(Array.from(src.slice(-15)));
    expect(patched.length).toBe(src.length + 11 + 7); // Duration element + wider Info size field
  });

  it('leaves files that already have a duration alone', () => {
    expect(patchWebmHeader(header(true), 2)).toBeNull();
  });

  it('ignores non-webm data and bad durations', () => {
    expect(patchWebmHeader(new Uint8Array([0, 1, 2, 3]), 2)).toBeNull();
    expect(patchWebmHeader(header(), 0)).toBeNull();
    expect(patchWebmHeader(header(), NaN)).toBeNull();
  });
});

describe('withWebmDuration', () => {
  it('rewrites a webm blob and keeps its type', async () => {
    const out = await withWebmDuration(new Blob([header()], { type: 'audio/webm;codecs=opus' }), 2);
    expect(out.type).toBe('audio/webm;codecs=opus');
    expect(readDuration(new Uint8Array(await out.arrayBuffer()))).toBeCloseTo(2000);
  });

  it('passes other formats through', async () => {
    const mp4 = new Blob([header()], { type: 'audio/mp4' });
    expect(await withWebmDuration(mp4, 2)).toBe(mp4);
  });
});

/** Stand-in <audio>: records seeks, lets the test set the duration and fire events. */
const fakeMedia = (duration: number) => {
  const target = new EventTarget();
  const seeks: number[] = [];
  const el = {
    duration,
    _t: 0,
    get currentTime() { return this._t; },
    set currentTime(v: number) { this._t = v; seeks.push(v); },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    fire: (type: string) => target.dispatchEvent(new Event(type)),
  };
  return { el, seeks };
};

describe('probeDuration', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does nothing when the duration is known', () => {
    const { el, seeks } = fakeMedia(5);
    const done = vi.fn();
    probeDuration(el as unknown as HTMLMediaElement, done);
    expect(seeks).toEqual([]);
    expect(done).toHaveBeenCalled();
  });

  it('ignores an early timeupdate and returns to 0 once the duration is measured', () => {
    const { el, seeks } = fakeMedia(Infinity);
    const done = vi.fn();
    probeDuration(el as unknown as HTMLMediaElement, done);
    expect(seeks).toEqual([1e101]);
    el.fire('timeupdate'); // before the browser knows the length — must not jump back yet
    expect(seeks).toEqual([1e101]);
    el.duration = 4.2;
    el.fire('durationchange');
    expect(seeks).toEqual([1e101, 0]);
    expect(done).not.toHaveBeenCalled();
    el.fire('seeked');
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('still returns to 0 if the duration never arrives', () => {
    const { el, seeks } = fakeMedia(Infinity);
    probeDuration(el as unknown as HTMLMediaElement, () => {});
    vi.advanceTimersByTime(3000);
    expect(seeks).toEqual([1e101, 0]);
  });

  it('can be cancelled', () => {
    const { el, seeks } = fakeMedia(Infinity);
    const cancel = probeDuration(el as unknown as HTMLMediaElement, () => {});
    cancel();
    el.duration = 3;
    el.fire('durationchange');
    vi.advanceTimersByTime(5000);
    expect(seeks).toEqual([1e101]);
  });
});
