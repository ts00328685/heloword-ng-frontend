/**
 * Keys, scales and note spelling for the vocal trainer's scale overlay.
 * Pure functions — unit-tested in music.test.ts.
 */
import { FLAT_NAMES, midiToAxisLabel, midiToFullName, midiToNoteName, NOTE_NAMES } from './pitch';

export interface Scale {
  label: string;
  /** Semitones above the root. */
  steps: number[];
  /** Spelled from the relative major (root + 3), e.g. A minor → C major. */
  minor: boolean;
}

/** Index 0 means "no key" so the persisted setting can be a plain number. */
export const SCALES: (Scale | null)[] = [
  null,
  { label: 'Major', steps: [0, 2, 4, 5, 7, 9, 11], minor: false },
  { label: 'Minor', steps: [0, 2, 3, 5, 7, 8, 10], minor: true },
  { label: 'Harmonic minor', steps: [0, 2, 3, 5, 7, 8, 11], minor: true },
  { label: 'Major pentatonic', steps: [0, 2, 4, 7, 9], minor: false },
  { label: 'Minor pentatonic', steps: [0, 3, 5, 7, 10], minor: true },
  { label: 'Blues', steps: [0, 3, 5, 6, 7, 10], minor: true },
];

/** Root names for the key picker. */
export const ROOT_LABELS = ['C', 'C#/D♭', 'D', 'E♭', 'E', 'F', 'F#/G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

export interface KeySig {
  /** Pitch class of the tonic, 0 = C. */
  root: number;
  scale: Scale;
}

/** Major keys written with flats (F, B♭, E♭, A♭, D♭); everything else uses sharps. */
const FLAT_MAJOR_ROOTS = [5, 10, 3, 8, 1];

const pc = (midi: number) => ((Math.round(midi) % 12) + 12) % 12;
const octave = (midi: number) => Math.floor(Math.round(midi) / 12) - 1;

export const makeKey = (root: number, scaleIndex: number): KeySig | null => {
  const scale = SCALES[scaleIndex];
  return scale ? { root: ((root % 12) + 12) % 12, scale } : null;
};

export const usesFlats = (key: KeySig): boolean =>
  FLAT_MAJOR_ROOTS.includes((key.root + (key.scale.minor ? 3 : 0)) % 12);

export const inScale = (midi: number, key: KeySig): boolean =>
  key.scale.steps.includes((pc(midi) - key.root + 12) % 12);

export const isTonic = (midi: number, key: KeySig): boolean => pc(midi) === key.root;

/** "B♭4" in F major, "A#4" in B major; with no key, the sharp name. */
export const spellNote = (midi: number, key: KeySig | null): string =>
  key ? `${(usesFlats(key) ? FLAT_NAMES : NOTE_NAMES)[pc(midi)]}${octave(midi)}` : midiToNoteName(midi);

/** Chart axis label: the key's spelling, or "C#/D♭4" with no key. */
export const axisLabel = (midi: number, key: KeySig | null): string =>
  key ? spellNote(midi, key) : midiToAxisLabel(midi);

/** Tooltip name: the key's spelling, or "C#4 / D♭4" with no key. */
export const fullName = (midi: number, key: KeySig | null): string =>
  key ? spellNote(midi, key) : midiToFullName(midi);

/** Secondary spelling under the big readout — only without a key, for black keys. */
export const altName = (midi: number, key: KeySig | null): string | null => {
  if (key) return null;
  const flat = `${FLAT_NAMES[pc(midi)]}${octave(midi)}`;
  return flat === midiToNoteName(midi) ? null : flat;
};
