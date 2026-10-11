import { describe, expect, it } from 'vitest';
import { altName, axisLabel, fullName, inScale, isTonic, makeKey, spellNote, usesFlats } from './music';

const C_MAJOR = makeKey(0, 1)!;
const F_MAJOR = makeKey(5, 1)!;
const B_MAJOR = makeKey(11, 1)!;
const D_MINOR = makeKey(2, 2)!;
const A_MINOR_PENT = makeKey(9, 5)!;

describe('makeKey', () => {
  it('returns null for "off"', () => {
    expect(makeKey(0, 0)).toBeNull();
  });
});

describe('scale membership', () => {
  it('knows which notes are in C major', () => {
    expect(inScale(60, C_MAJOR)).toBe(true); // C4
    expect(inScale(61, C_MAJOR)).toBe(false); // C#4
    expect(inScale(71, C_MAJOR)).toBe(true); // B4
  });
  it('handles pentatonics', () => {
    // A minor pentatonic: A C D E G
    expect([57, 60, 62, 64, 67].every((m) => inScale(m, A_MINOR_PENT))).toBe(true);
    expect(inScale(59, A_MINOR_PENT)).toBe(false); // B
  });
  it('finds the tonic in any octave', () => {
    expect(isTonic(45, A_MINOR_PENT)).toBe(true);
    expect(isTonic(69, A_MINOR_PENT)).toBe(true);
    expect(isTonic(70, A_MINOR_PENT)).toBe(false);
  });
});

describe('spelling', () => {
  it('uses flats in flat keys, sharps otherwise', () => {
    expect(usesFlats(F_MAJOR)).toBe(true);
    expect(usesFlats(D_MINOR)).toBe(true); // relative of F major
    expect(usesFlats(B_MAJOR)).toBe(false);
    expect(spellNote(70, F_MAJOR)).toBe('B♭4');
    expect(spellNote(70, B_MAJOR)).toBe('A#4');
  });
  it('falls back to both spellings with no key', () => {
    expect(axisLabel(61, null)).toBe('C#/D♭4');
    expect(fullName(61, null)).toBe('C#4 / D♭4');
    expect(altName(61, null)).toBe('D♭4');
    expect(altName(60, null)).toBeNull();
    expect(altName(61, F_MAJOR)).toBeNull();
    expect(axisLabel(61, F_MAJOR)).toBe('D♭4');
  });
});
