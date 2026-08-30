/**
 * Shared text-to-speech service.
 *
 * Key fixes vs. the old inline copies:
 * - `utterance.lang` is always set explicitly, so the browser uses the correct
 *   language even when no matching voice object is found (critical on mobile Chrome).
 * - Voice lookup uses a prefix fallback (`ja` matches `ja-JP`, `ja-JP-x-*`, etc.)
 *   so it works across devices that ship slightly different locale strings.
 * - Voices are loaded asynchronously on mobile Chrome; we wait for `voiceschanged`
 *   before speaking so the right voice is actually available.
 */

import { getTTSSettings } from './ttsSettings.service';

export const TTS_LANG_MAP: Record<string, string> = {
  en: 'en-US',
  de: 'de-DE',
  jp: 'ja-JP',
  ja: 'ja-JP',
  ch: 'zh-TW',
  zh: 'zh-TW',
};

/** Convert a word's `language` field to a BCP-47 locale code. */
export function toLangCode(lang: string): string {
  return TTS_LANG_MAP[lang] ?? TTS_LANG_MAP[lang?.toLowerCase()] ?? 'en-US';
}

/** Find the best available voice for a BCP-47 code, with prefix fallback.
 *  On iOS, prefers Samantha for en-US (clearest built-in English voice). */
export function findVoice(langCode: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (langCode === 'en-US') {
    const samantha = voices.find((v) => (v.name.toLowerCase().includes('google') || v.name.toLowerCase().includes('samantha') || v.name.toLowerCase().includes('premium') || v.name.toLowerCase().includes('enhanced')) && v.lang === 'en-US');
    if (samantha) return samantha;
  }
  if (langCode === 'ja-JP') {
    const kyoko = voices.find((v) => (v.name.toLowerCase().includes('google') || v.name.toLowerCase().includes('kyoko') || v.name.toLowerCase().includes('premium') || v.name.toLowerCase().includes('enhanced')) && v.lang === 'ja-JP');
    if (kyoko) return kyoko;
  }
  const prefix = langCode.split('-')[0]; // e.g. 'ja' from 'ja-JP'
  return (
    voices.find((v) => v.lang === langCode) ??
    voices.find((v) => v.lang.startsWith(prefix)) ??
    null
  );
}

/** Strip ruby/bracket annotations and HTML tags from a word string. */
export function cleanWordText(text: string): string {
  return text
    .replace(/(\[.*?\]|\(.*?\)|（.*?）|【.*?】) */g, '')
    .replace(/(<.*?>) */g, '')
    .trim();
}

/** A character of the source text that survived cleaning, with where it came from. */
interface SrcChar {
  c: string;
  /** Index in the source string (UTF-16 code units). */
  i: number;
}

/** Cleaned TTS text plus, per character, the index it came from in the source. */
export interface MappedText {
  text: string;
  /** map[i] is the source index of text[i]; strictly increasing. */
  map: number[];
}

/** Ruby/bracket annotations and HTML tags, all stripped before speaking. */
const ANNOTATION_PATTERNS = [/\[.*?\]/g, /（.*?）/g, /\(.*?\)/g, /【.*?】/g, /<[^>]*>/g];

const HAS_KANA = /[ぁ-ゖ゠-ヿ]/;

const toText = (chars: SrcChar[]): string => chars.map((ch) => ch.c).join('');

const trimChars = (chars: SrcChar[]): SrcChar[] => {
  let start = 0;
  let end = chars.length;
  while (start < end && /\s/.test(chars[start].c)) start++;
  while (end > start && /\s/.test(chars[end - 1].c)) end--;
  return chars.slice(start, end);
};

/** Split on '\n', keeping each line's terminating newline so it can be re-joined. */
function splitLines(chars: SrcChar[]): { chars: SrcChar[]; sep: SrcChar | null }[] {
  const lines: { chars: SrcChar[]; sep: SrcChar | null }[] = [];
  let current: SrcChar[] = [];
  for (const ch of chars) {
    if (ch.c === '\n') {
      lines.push({ chars: current, sep: ch });
      current = [];
    } else {
      current.push(ch);
    }
  }
  lines.push({ chars: current, sep: null });
  return lines;
}

/** Split after every '。', matching `String.split(/(?<=。)/)` (no empty trailing part). */
function splitAfterPeriod(chars: SrcChar[]): SrcChar[][] {
  const parts: SrcChar[][] = [];
  let current: SrcChar[] = [];
  for (const ch of chars) {
    current.push(ch);
    if (ch.c === '。') {
      parts.push(current);
      current = [];
    }
  }
  if (current.length > 0) parts.push(current);
  return parts.length > 0 ? parts : [[]];
}

/**
 * Prepare sentence text for TTS while remembering where every spoken character
 * came from, so word-boundary events can be mapped back onto the displayed text.
 *
 * Strips bracket annotations and, for Japanese, discards any trailing
 * Chinese/English translation lines that lack hiragana/katakana characters.
 */
export function cleanSentenceForTTSMapped(text: string, lang: string): MappedText {
  const removed = new Array<boolean>(text.length).fill(false);
  for (const pattern of ANNOTATION_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      for (let i = match.index; i < match.index + match[0].length; i++) removed[i] = true;
      if (match[0].length === 0) pattern.lastIndex++;
    }
  }

  const kept: SrcChar[] = [];
  for (let i = 0; i < text.length; i++) if (!removed[i]) kept.push({ c: text[i], i });

  // Collapse runs of spaces (the `/ {2,}/g → ' '` step), then trim.
  let chars = kept.filter((ch, idx) => !(ch.c === ' ' && kept[idx - 1]?.c === ' '));
  chars = trimChars(chars);

  if (lang === 'jp' || lang === 'ja') {
    const lines = splitLines(chars);
    if (lines.length > 1) {
      const jpLines = lines.filter((line) => HAS_KANA.test(toText(line.chars)));
      if (jpLines.length > 0) {
        const joined: SrcChar[] = [];
        jpLines.forEach((line, idx) => {
          if (idx > 0) {
            const sep = jpLines[idx - 1].sep;
            if (sep) joined.push(sep);
          }
          joined.push(...line.chars);
        });
        chars = trimChars(joined);
      }
    } else {
      // Single line: strip segments after 。 that contain no kana
      const parts = splitAfterPeriod(chars);
      const jpParts = parts.filter((part) => {
        const s = toText(part);
        return !s.trim() || HAS_KANA.test(s);
      });
      if (jpParts.length > 0 && jpParts.length < parts.length) {
        chars = trimChars(jpParts.flat());
      }
    }
  }

  return { text: toText(chars), map: chars.map((ch) => ch.i) };
}

/** Prepare sentence text for TTS. See `cleanSentenceForTTSMapped`. */
export function cleanSentenceForTTS(text: string, lang: string): string {
  return cleanSentenceForTTSMapped(text, lang).text;
}

/** A half-open range of character offsets. */
export interface TextRange {
  start: number;
  end: number;
}

/** Characters that end a readable phrase (the highlight advances at these). */
const PHRASE_BREAK = /[。．.！!？?、，,；;：:…\n]/;
/** Closing marks that belong to the phrase they follow. */
const PHRASE_TAIL = /[\s」』）)】｝}"'”’]/;

/**
 * Split text into phrase-sized chunks for highlighting: break at punctuation,
 * cap the length (at a space where the script has them), and merge fragments
 * too short to be worth showing on their own.
 *
 * Highlighting a phrase rather than a single word keeps the marker readable —
 * word boundaries fire far too quickly to follow, and engines report a length
 * of one character for scripts that do not use spaces.
 */
export function splitPhrases(text: string, maxLength = 36, minLength = 8): TextRange[] {
  const ranges: TextRange[] = [];
  let start = 0;
  let i = 0;

  while (i < text.length) {
    const overLong = i - start + 1 >= maxLength;
    if (!PHRASE_BREAK.test(text[i]) && !overLong && i < text.length - 1) {
      i++;
      continue;
    }

    let end = i + 1;
    if (overLong && !PHRASE_BREAK.test(text[i])) {
      const lastSpace = text.lastIndexOf(' ', end - 1);
      if (lastSpace > start) end = lastSpace + 1;
    }
    while (end < text.length && PHRASE_TAIL.test(text[end])) end++;
    ranges.push({ start, end });
    start = end;
    i = end;
  }
  if (start < text.length) ranges.push({ start, end: text.length });

  // Fold stubs ("はい、") into the phrase that follows them.
  const merged: TextRange[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && previous.end - previous.start < minLength) previous.end = range.end;
    else merged.push({ ...range });
  }
  return merged;
}

export interface SpeakOptions {
  speed?: number;
  volume?: number;
  pitch?: number;
}

/**
 * Speak `word` in the given language.
 *
 * @param word  Raw word string (kanji annotations will be stripped).
 * @param lang  Language code from the word model: 'en' | 'de' | 'jp' | 'ch'.
 */
export function pronounceWord(word: string, lang: string, options: SpeakOptions = {}): void {
  if (!word || !('speechSynthesis' in window)) return;

  const s = getTTSSettings();
  const { speed = s.speed, volume = s.volume, pitch = s.pitch } = options;
  const cleaned = cleanWordText(word);
  const langCode = toLangCode(lang);

  window.speechSynthesis.cancel();

  const speak = () => {
    const utterance = new SpeechSynthesisUtterance(cleaned);
    // Always set lang — this is the critical fix for mobile Chrome.
    // Without it, when voice is null the browser falls back to the system
    // default language (which may be Chinese on a Chinese device).
    utterance.lang = langCode;
    utterance.voice = findVoice(langCode);
    utterance.pitch = pitch;
    utterance.rate = speed;
    utterance.volume = volume;
    window.speechSynthesis.speak(utterance);
  };

  // Mobile Chrome loads voices asynchronously; getVoices() returns [] on first call.
  if (window.speechSynthesis.getVoices().length > 0) {
    speak();
  } else {
    window.speechSynthesis.addEventListener('voiceschanged', speak, { once: true });
  }
}

/**
 * Speak a sentence in the given BCP-47 lang code, then call onDone.
 * Handles async voice loading on mobile Chrome automatically.
 *
 * `onBoundary` reports the word about to be spoken as an offset into `text`.
 * Not every engine emits boundary events (notably Android's Google TTS), so
 * callers must treat it as an enhancement, not a guarantee.
 */
export function speakSentence(
  text: string,
  langCode: string,
  options: SpeakOptions = {},
  onDone: () => void = () => {},
  onBoundary?: (charIndex: number, charLength: number) => void,
): void {
  if (!('speechSynthesis' in window)) { onDone(); return; }
  const s = getTTSSettings();
  const { speed = s.speed, volume = s.volume, pitch = s.pitch } = options;

  const doSpeak = () => {
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = langCode;
    utt.rate = speed;
    utt.volume = volume;
    utt.pitch = pitch;
    utt.voice = findVoice(langCode);
    utt.onend = onDone;
    utt.onerror = onDone;
    if (onBoundary) {
      utt.onboundary = (e) => {
        if (e.name && e.name !== 'word') return;
        // charLength is optional in the spec; fall back to the next whitespace,
        // and to a single character for scripts that do not use spaces.
        let length = e.charLength ?? 0;
        if (!length) {
          const next = text.slice(e.charIndex).search(/\s/);
          length = next > 0 ? next : 1;
        }
        onBoundary(e.charIndex, length);
      };
    }
    window.speechSynthesis.speak(utt);
  };

  if (window.speechSynthesis.getVoices().length > 0) {
    doSpeak();
  } else {
    window.speechSynthesis.addEventListener('voiceschanged', doSpeak, { once: true });
  }
}

export function cancelPronouncing(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
