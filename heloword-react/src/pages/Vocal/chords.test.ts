import { describe, expect, it } from 'vitest';
import { chordNotes, quickChords } from './chords';
import { makeKey } from './music';

const names = (key: Parameters<typeof quickChords>[0]) => quickChords(key).map((c) => c.name);
const romans = (key: Parameters<typeof quickChords>[0]) => quickChords(key).map((c) => c.roman);

describe('quickChords', () => {
  it('defaults to C major', () => {
    expect(names(null)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'B°', 'G7']);
    expect(romans(null)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°', 'V7']);
  });

  it('spells sharp and flat keys', () => {
    expect(names(makeKey(7, 1))).toEqual(['G', 'Am', 'Bm', 'C', 'D', 'Em', 'F#°', 'D7']);
    expect(names(makeKey(5, 1))).toEqual(['F', 'Gm', 'Am', 'B♭', 'C', 'Dm', 'E°', 'C7']);
  });

  it('uses natural minor for minor keys, with a V7', () => {
    expect(names(makeKey(9, 2))).toEqual(['Am', 'B°', 'C', 'Dm', 'Em', 'F', 'G', 'E7']);
    expect(romans(makeKey(9, 2))).toEqual(['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII', 'V7']);
  });

  it('uses the parent scale for pentatonic keys', () => {
    expect(names(makeKey(0, 4))).toEqual(names(makeKey(0, 1)));
    expect(names(makeKey(9, 5))).toEqual(names(makeKey(9, 2)));
  });
});

describe('chordNotes', () => {
  const [c, , , f, , am, , g7] = quickChords(null);
  it('roots the chord in the octave starting at `low`', () => {
    expect(chordNotes(c, null, 48)).toEqual([48, 52, 55]); // C3 E3 G3
    expect(chordNotes(f, null, 48)).toEqual([53, 57, 60]); // F3 A3 C4
    expect(chordNotes(am, null, 48)).toEqual([57, 60, 64]); // A3 C4 E4
    expect(chordNotes(g7, null, 60)).toEqual([67, 71, 74, 77]); // G4 B4 D5 F5
  });
  it('follows the key', () => {
    const d = makeKey(2, 1);
    expect(chordNotes(quickChords(d)[0], d, 48)).toEqual([50, 54, 57]); // D3 F#3 A3
  });
});
