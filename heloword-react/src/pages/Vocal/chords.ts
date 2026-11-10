/**
 * Quick chords for the piano: the seven diatonic triads of the current key
 * (C major with no key set) plus the dominant seventh. Pentatonic and blues
 * keys use their parent major / natural-minor scale. Pure — see chords.test.ts.
 */
import { KeySig, spellNote } from './music';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

export interface Chord {
  /** Spelled for the key, e.g. "F#m", "B°", "G7". */
  name: string;
  /** Function in the key, e.g. "ii", "V7". */
  roman: string;
  /** Semitones above the key's tonic (0–11) for the root. */
  root: number;
  /** Semitones above the chord root, root first. */
  intervals: number[];
}

const QUALITIES: { third: number; fifth: number; suffix: string; romanSuffix: string; upper: boolean }[] = [
  { third: 4, fifth: 7, suffix: '', romanSuffix: '', upper: true },
  { third: 3, fifth: 7, suffix: 'm', romanSuffix: '', upper: false },
  { third: 3, fifth: 6, suffix: '°', romanSuffix: '°', upper: false },
  { third: 4, fifth: 8, suffix: '+', romanSuffix: '+', upper: true },
];

/** Chord-root name without octave, using the key's sharps / flats. */
const rootName = (pc: number, key: KeySig | null) => spellNote(60 + pc, key).replace(/-?\d+$/, '');

export const quickChords = (key: KeySig | null): Chord[] => {
  const tonic = key?.root ?? 0;
  const steps = key?.scale.minor ? NATURAL_MINOR : MAJOR;
  const at = (i: number) => steps[i % 7] + 12 * Math.floor(i / 7);

  const triads = steps.map((_, d): Chord => {
    const third = at(d + 2) - at(d);
    const fifth = at(d + 4) - at(d);
    const q = QUALITIES.find((x) => x.third === third && x.fifth === fifth)!;
    const roman = q.upper ? ROMAN[d] : ROMAN[d].toLowerCase();
    return {
      name: rootName(tonic + steps[d], key) + q.suffix,
      roman: roman + q.romanSuffix,
      root: steps[d],
      intervals: [0, third, fifth],
    };
  });

  // V7 — in minor keys too, where it borrows the raised leading tone.
  const dominant: Chord = { name: `${rootName(tonic + 7, key)}7`, roman: 'V7', root: 7, intervals: [0, 4, 7, 10] };
  return [...triads, dominant];
};

/** MIDI notes for a chord with its root at or above `low` (within one octave). */
export const chordNotes = (chord: Chord, key: KeySig | null, low: number): number[] => {
  const pc = ((key?.root ?? 0) + chord.root) % 12;
  const root = low + ((pc - low) % 12 + 12) % 12;
  return chord.intervals.map((i) => root + i);
};
