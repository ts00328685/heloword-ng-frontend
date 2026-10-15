import type { NHKVocabItem } from '../services/nhkArticle.service';

/** A word the reader tapped, resolved from a character offset in the displayed paragraph. */
export interface TappedWord {
  /** Plain word (readings stripped) — what gets looked up. */
  word: string;
  /** Bounds of the word in the displayed text, for highlighting. */
  start: number;
  end: number;
  /** Sentence as displayed (keeps 漢字[かな] readings) — saved with the word. */
  sentence: string;
  /** Same sentence with readings stripped — sent to the AI. */
  sentenceText: string;
  /** Entry from the article's own vocabulary list, when the tap falls inside one. */
  vocab?: NHKVocabItem;
}

export type LookupLang = 'ja' | 'en';

const MAX_SENTENCE = 300;
const READING_OR_TAG = /\[[^\]]*\]|<[^>]*>/g;
const KANJI = /[㐀-鿿豈-﫿々〆ヶ]/;
const KANJI_OR_KATAKANA = /[㐀-鿿豈-﫿々〆ヶ゠-ヿ]/;
const HIRAGANA_ONLY = /^[ぁ-ゟ]+$/;
/** Particles that, opening a hiragana run after kanji, mark the run as not a verb ending. */
const JA_TAIL_PARTICLE = /^[をはがのへでにともや]/;
/** Hiragana pieces that start a new unit rather than continuing a verb/adjective ending. */
const JA_BREAKS = new Set([
  'の', 'は', 'が', 'を', 'に', 'で', 'と', 'へ', 'も', 'や', 'か', 'ね', 'よ',
  'から', 'まで', 'より', 'など', 'こと', 'もの', 'ため', 'よう', 'とき', 'ところ',
  // copulas: 来週|です is a noun plus "is", not a verb ending
  'です', 'でした', 'でしょう', 'だ', 'だっ', 'だろう', 'じゃ', 'では',
]);

/**
 * Text with 漢字[かな] readings and HTML tags removed, plus where each kept
 * character sits in the displayed text (map[i] = display index of text[i]).
 */
export function stripReadings(display: string): { text: string; map: number[] } {
  const removed = new Array<boolean>(display.length).fill(false);
  READING_OR_TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = READING_OR_TAG.exec(display)) !== null) {
    for (let i = m.index; i < m.index + m[0].length; i++) removed[i] = true;
  }
  let text = '';
  const map: number[] = [];
  for (let i = 0; i < display.length; i++) {
    if (!removed[i]) {
      text += display[i];
      map.push(i);
    }
  }
  return { text, map };
}

interface Span { start: number; end: number }

function segmenter(lang: LookupLang, granularity: 'word' | 'sentence'): Intl.Segmenter | null {
  try {
    return typeof Intl !== 'undefined' && 'Segmenter' in Intl
      ? new Intl.Segmenter(lang, { granularity })
      : null;
  } catch {
    return null;
  }
}

/** Word spans over plain text. Japanese verb/adjective endings are rejoined to their stem. */
function wordSpans(text: string, lang: LookupLang): Span[] {
  const seg = segmenter(lang, 'word');
  if (!seg) return fallbackWordSpans(text, lang);

  const words = [...seg.segment(text)]
    .filter((s) => s.isWordLike)
    .map((s) => ({ start: s.index, end: s.index + s.segment.length, text: s.segment }));
  if (lang !== 'ja') return words;

  // 行 | いま | した → 行いました, but 東京 | で stays apart.
  const units: Span[] = [];
  for (const w of words) {
    const prev = units[units.length - 1];
    const continuesPrev =
      prev &&
      prev.end === w.start &&
      HIRAGANA_ONLY.test(w.text) &&
      !JA_BREAKS.has(w.text) &&
      KANJI_OR_KATAKANA.test(text.slice(prev.start, prev.end));
    if (continuesPrev) prev.end = w.end;
    else units.push({ start: w.start, end: w.end });
  }
  return units;
}

/** Used only where Intl.Segmenter is missing (old browsers). */
function fallbackWordSpans(text: string, lang: LookupLang): Span[] {
  const pattern = lang === 'ja'
    ? /[㐀-鿿豈-﫿々〆ヶ゠-ヿ]+[ぁ-ゟ]*|[ぁ-ゟ]+/g
    : /[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*/gu;
  const spans: Span[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    // 東京で → 東京 | で: a hiragana tail that opens with a particle is not a verb ending.
    const tail = lang === 'ja' ? /[\u3041-\u309f]+$/.exec(m[0]) : null;
    if (tail && tail.index > 0 && JA_TAIL_PARTICLE.test(tail[0])) {
      spans.push({ start, end: start + tail.index }, { start: start + tail.index, end });
    } else {
      spans.push({ start, end });
    }
  }
  return spans;
}

function sentenceSpan(text: string, at: number, lang: LookupLang): Span {
  const seg = segmenter(lang, 'sentence');
  if (seg) {
    for (const s of seg.segment(text)) {
      if (at >= s.index && at < s.index + s.segment.length) return { start: s.index, end: s.index + s.segment.length };
    }
  }
  const before = text.slice(0, at).search(/[^。！？.!?\n]*$/);
  const afterMatch = /[。！？.!?\n]/.exec(text.slice(at));
  return { start: Math.max(0, before), end: afterMatch ? at + afterMatch.index + 1 : text.length };
}

/** Longest article-vocabulary entry whose occurrence covers the tapped character. */
function vocabMatch(text: string, at: number, lang: LookupLang, vocab: NHKVocabItem[]): (Span & { item: NHKVocabItem }) | null {
  const haystack = lang === 'en' ? text.toLowerCase() : text;
  let best: (Span & { item: NHKVocabItem }) | null = null;
  for (const item of vocab) {
    const plain = stripReadings(item.word || '').text.trim();
    if (!plain) continue;
    const needle = lang === 'en' ? plain.toLowerCase() : plain;
    for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) {
      const end = i + needle.length;
      if (at < i || at >= end) continue;
      if (lang === 'en' && (/[\p{L}\p{N}]/u.test(haystack[i - 1] ?? '') || /[\p{L}\p{N}]/u.test(haystack[end] ?? ''))) continue;
      if (!best || end - i > best.end - best.start) best = { start: i, end, item };
    }
  }
  return best;
}

/**
 * Resolves a tap at `displayOffset` in a displayed paragraph to a word and its sentence.
 * Returns null for taps on punctuation or whitespace.
 */
export function findTappedWord(
  display: string,
  displayOffset: number,
  lang: LookupLang,
  vocab: NHKVocabItem[] = [],
): TappedWord | null {
  if (!display || displayOffset < 0 || displayOffset >= display.length) return null;
  const { text, map } = stripReadings(display);
  if (!text) return null;

  // A tap on a reading (inside [...]) counts as a tap on the kanji it annotates.
  let at = -1;
  for (let i = 0; i < map.length && map[i] <= displayOffset; i++) at = i;
  if (at < 0) return null;

  const matched = vocabMatch(text, at, lang, vocab);
  const span = matched ?? wordSpans(text, lang).find((w) => at >= w.start && at < w.end);
  if (!span) return null;

  const word = text.slice(span.start, span.end).trim();
  if (!word) return null;

  const s = sentenceSpan(text, at, lang);
  let sentence = display.slice(map[s.start], map[s.end - 1] + 1).trim();
  let sentenceText = text.slice(s.start, s.end).trim();
  if (sentenceText.length > MAX_SENTENCE) {
    // Keep a window around the word so the AI still sees its context.
    const from = Math.max(s.start, Math.min(span.start - MAX_SENTENCE / 2, s.end - MAX_SENTENCE));
    sentenceText = text.slice(from, from + MAX_SENTENCE).trim();
    sentence = display.slice(map[from], map[Math.min(from + MAX_SENTENCE, text.length) - 1] + 1).trim();
  }

  return {
    word,
    start: map[span.start],
    end: map[span.end - 1] + 1,
    sentence,
    sentenceText,
    vocab: matched?.item,
  };
}

/** True when the word contains kanji — used to decide whether a reading is worth showing. */
export function hasKanji(s: string): boolean {
  return KANJI.test(s);
}

/**
 * Character offset under a tap inside `container`, counted over its text content.
 * Uses the caret APIs (caretPositionFromPoint / caretRangeFromPoint), then checks which of
 * the two characters around the caret actually contains the point — the caret lands
 * *after* a character when its right half is tapped.
 */
export function textOffsetFromPoint(container: HTMLElement, x: number, y: number): number | null {
  const doc = container.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let node: Node | null = null;
  let offset = 0;
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) { node = pos.offsetNode; offset = pos.offset; }
  } else if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(x, y);
    if (range) { node = range.startContainer; offset = range.startOffset; }
  }
  if (!node || node.nodeType !== Node.TEXT_NODE || !container.contains(node)) return null;

  // Work in container-wide offsets: at a boundary between text nodes (e.g. around a
  // highlight <mark>) the caret may be reported at the end of the previous node while
  // the finger is on the first character of the next one.
  const texts: Text[] = [];
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);

  let caret = -1;
  let total = 0;
  for (const t of texts) {
    if (t === node) { caret = total + offset; break; }
    total += t.length;
  }
  if (caret < 0) return null;

  const locate = (globalIndex: number): { node: Text; offset: number } | null => {
    let base = 0;
    for (const t of texts) {
      if (globalIndex < base + t.length) return { node: t, offset: globalIndex - base };
      base += t.length;
    }
    return null;
  };

  const hit = [caret, caret - 1].find((g) => {
    if (g < 0) return false;
    const at = locate(g);
    if (!at) return false;
    const r = doc.createRange();
    r.setStart(at.node, at.offset);
    r.setEnd(at.node, at.offset + 1);
    const box = r.getBoundingClientRect();
    return x >= box.left - 1 && x <= box.right + 1 && y >= box.top - 1 && y <= box.bottom + 1;
  });
  return hit === undefined ? null : hit;
}

const LATIN = /[A-Za-z]/;
const KANA = /[ぁ-ゟ゠-ヿ]/;
const CJK_OR_KANA = /[ぁ-ゟ゠-ヿ㐀-鿿豈-﫿]/;

/**
 * Word lookup in AI explanations, which mix a Chinese explanation with the Japanese or
 * English being explained. The language is decided per word:
 *  - Latin letters only → English
 *  - contains kana, or kanji carrying a [reading] → Japanese (the prompts require every
 *    Japanese kanji to be written 漢字[かな]; Chinese text never has readings)
 *  - plain kanji without a reading → the Chinese explanation itself: not tappable
 */
export function findTappedWordInMixedText(display: string, displayOffset: number): (TappedWord & { lang: LookupLang }) | null {
  const ja = findTappedWord(display, displayOffset, 'ja');
  if (!ja) return null;

  if (LATIN.test(ja.word) && !CJK_OR_KANA.test(ja.word)) {
    const en = findTappedWord(display, displayOffset, 'en');
    return en ? { ...en, lang: 'en' } : null;
  }
  if (KANA.test(ja.word)) return { ...ja, lang: 'ja' };
  // kanji-only: Japanese only if a reading follows inside or right after the word
  if (display.slice(ja.start, ja.end + 1).includes('[')) return { ...ja, lang: 'ja' };
  return null;
}
