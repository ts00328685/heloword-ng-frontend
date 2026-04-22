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
    const samantha = voices.find((v) => v.name === 'Samantha' && v.lang === 'en-US');
    if (samantha) return samantha;
  }
  if (langCode === 'ja-JP') {
    const kyoko = voices.find((v) => v.name === 'Kyoko' && v.lang === 'ja-JP');
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

/**
 * Prepare sentence text for TTS.
 * Strips bracket annotations and, for Japanese, discards any trailing
 * Chinese/English translation lines that lack hiragana/katakana characters.
 */
export function cleanSentenceForTTS(text: string, lang: string): string {
  let cleaned = text
    .replace(/\[.*?\]/g, '')
    .replace(/（.*?）/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/【.*?】/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();

  if (lang === 'jp' || lang === 'ja') {
    const hasKana = /[ぁ-ゖ゠-ヿ]/;
    // If multi-line, keep only lines containing hiragana/katakana
    const lines = cleaned.split('\n');
    if (lines.length > 1) {
      const jpLines = lines.filter(l => hasKana.test(l));
      if (jpLines.length > 0) cleaned = jpLines.join('\n').trim();
    } else {
      // Single line: strip segments after 。 that contain no kana
      const parts = cleaned.split(/(?<=。)/);
      const jpParts = parts.filter(p => !p.trim() || hasKana.test(p));
      if (jpParts.length > 0 && jpParts.length < parts.length) {
        cleaned = jpParts.join('').trim();
      }
    }
  }

  return cleaned;
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
 */
export function speakSentence(
  text: string,
  langCode: string,
  options: SpeakOptions = {},
  onDone: () => void = () => {},
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
