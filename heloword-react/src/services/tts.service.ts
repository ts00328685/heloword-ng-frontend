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

/** Find the best available voice for a BCP-47 code, with prefix fallback. */
function findVoice(langCode: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
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
    .replace(/(\[.*?\]|\(.*?\)) */g, '')
    .replace(/(<.*?>) */g, '')
    .trim();
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

  const { speed = 1.0, volume = 0.2, pitch = 1.2 } = options;
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

export function cancelPronouncing(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
