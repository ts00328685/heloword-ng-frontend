import { useSyncExternalStore } from 'react';

/**
 * Furigana display preference, shared app-wide.
 *
 * All Japanese text from the backend (articles, AI output, word lists) marks
 * readings as 漢字[かな]. 'top' renders them as ruby above the kanji; 'side'
 * keeps them inline after it. Stored in localStorage; every mounted view
 * re-renders when it changes.
 */
export type FuriganaMode = 'top' | 'side';

const KEY = 'hw-furigana-mode';
const listeners = new Set<() => void>();

export function getFuriganaMode(): FuriganaMode {
  try {
    return localStorage.getItem(KEY) === 'side' ? 'side' : 'top';
  } catch {
    return 'top';
  }
}

export function setFuriganaMode(mode: FuriganaMode): void {
  try { localStorage.setItem(KEY, mode); } catch {}
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) listener(); };
  window.addEventListener('storage', onStorage); // other tabs
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}

export function useFuriganaMode(): FuriganaMode {
  return useSyncExternalStore(subscribe, getFuriganaMode, () => 'top');
}

/**
 * A kanji run followed by its kana reading: 記者会見[きしゃかいけん], 組[く]み.
 * The reading must be kana only, so bracketed notes in Chinese/English text
 * (e.g. 注意[note]) are left alone.
 */
export const READING_RE = /([㐀-䶿一-鿿豈-﫿々〆ヶ]+)\[([ぁ-ゖァ-ヺー・]+)\]/g;

export interface ReadingSpan {
  /** Start of the kanji base in the source string. */
  start: number;
  /** End of the closing bracket (exclusive). */
  end: number;
  base: string;
  reading: string;
}

export function findReadings(text: string): ReadingSpan[] {
  const out: ReadingSpan[] = [];
  READING_RE.lastIndex = 0;
  for (let m = READING_RE.exec(text); m; m = READING_RE.exec(text)) {
    out.push({ start: m.index, end: m.index + m[0].length, base: m[1], reading: m[2] });
  }
  return out;
}

/**
 * Move a cut position out of any 漢字[かな] unit (to its end), so slicing the
 * text for highlights never separates a kanji from its reading.
 */
export function snapOutOfReading(spans: ReadingSpan[], index: number): number {
  for (const s of spans) {
    if (index > s.start && index < s.end) return s.end;
    if (s.start >= index) break;
  }
  return index;
}
