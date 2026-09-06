import { Sentence } from '../../models';

/** Stable identity for a word across retest clones (clones keep id + tableName). */
export const wordKey = (w: Sentence) => `${w.id}:${w.tableName ?? ''}`;

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The prompt side: the word itself, falling back to the sentence for sentence-only entries. */
export const promptText = (w: Sentence) => (w.word || w.sentence || '').replace(/\[[^\]]*\]/g, '').trim();

/**
 * The answer side. Chinese UI prefers the Chinese gloss; everything else prefers English.
 * Either can be missing in the data, so both directions fall back to the other.
 */
export const meaningText = (w: Sentence, uiLang: string) => {
  const zhFirst = uiLang.startsWith('zh');
  const ch = (w.translateCh || '').trim();
  const en = (w.translateEn || '').trim();
  return (zhFirst ? ch || en : en || ch) || promptText(w);
};

/** Line colours for 連連看 connectors — picked at random per pair, readable on both themes. */
export const LINE_COLORS = [
  '#f97316', // orange
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#22c55e', // green
  '#eab308', // yellow
  '#3b82f6', // blue
  '#ef4444', // red
  '#14b8a6', // teal
  '#a855f7', // purple
];

export const randomLineColor = (used: string[]) => {
  const free = LINE_COLORS.filter((c) => !used.includes(c));
  const pool = free.length > 0 ? free : LINE_COLORS;
  return pool[Math.floor(Math.random() * pool.length)];
};

/**
 * Pick `count` filler words from `pool`, excluding anything already in `exclude`.
 * Used to keep a board challenging when the queue tail is shorter than the board size.
 */
export function pickDecoys(pool: Sentence[], exclude: Sentence[], count: number): Sentence[] {
  if (count <= 0) return [];
  const taken = new Set(exclude.map(wordKey));
  const candidates = pool.filter((w) => !taken.has(wordKey(w)));
  return shuffle(candidates).slice(0, count);
}
