// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { findReadings, getFuriganaMode, setFuriganaMode, snapOutOfReading } from './furigana';

describe('findReadings', () => {
  it('finds kanji runs with kana readings', () => {
    const text = '記者会見[きしゃかいけん]で首相[しゅしょう]が話[はな]した';
    expect(findReadings(text).map((r) => [r.base, r.reading])).toEqual([
      ['記者会見', 'きしゃかいけん'], ['首相', 'しゅしょう'], ['話', 'はな'],
    ]);
  });

  it('handles okurigana splits like 組[く]み合[あ]わせる', () => {
    expect(findReadings('組[く]み合[あ]わせる').map((r) => r.base)).toEqual(['組', '合']);
  });

  it('ignores non-kana brackets (Chinese/English notes)', () => {
    expect(findReadings('注意[note] 這個字[參考]')).toEqual([]);
  });
});

describe('snapOutOfReading', () => {
  const text = 'はい、記者会見[きしゃかいけん]です';
  const spans = findReadings(text); // unit spans 3..16

  it('leaves cuts outside a unit alone', () => {
    expect(snapOutOfReading(spans, 3)).toBe(3);
    expect(snapOutOfReading(spans, 16)).toBe(16);
  });

  it('moves a cut inside the kanji or its reading to the end of the unit', () => {
    expect(snapOutOfReading(spans, 7)).toBe(16);  // just after 記者会見, before [
    expect(snapOutOfReading(spans, 10)).toBe(16); // inside the reading
  });
});

describe('furigana mode preference', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to above the kanji', () => {
    expect(getFuriganaMode()).toBe('top');
  });

  it('remembers the choice', () => {
    setFuriganaMode('side');
    expect(getFuriganaMode()).toBe('side');
    setFuriganaMode('top');
    expect(getFuriganaMode()).toBe('top');
  });
});
