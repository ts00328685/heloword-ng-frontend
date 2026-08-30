import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NHKParagraph } from '../../services/nhkArticle.service';
import {
  cancelPronouncing,
  cleanSentenceForTTSMapped,
  cleanWordText,
  speakSentence,
  splitPhrases,
  TextRange,
} from '../../services/tts.service';

export type LangKey = 'original' | 'zh' | 'en' | 'ja';

const TRANSLATION_TTS: Record<LangKey, string> = {
  original: 'ja-JP',
  en: 'en-US',
  zh: 'zh-TW',
  ja: 'ja-JP',
};

/**
 * One utterance: a single phrase of a paragraph. Paragraphs are spoken one
 * phrase at a time so the highlight can follow real speech events — WebKit and
 * Android's TTS never report word boundaries, but they do start and end each
 * utterance, and a phrase-sized utterance is a phrase-sized highlight.
 */
type SpeechItem = {
  /** Paragraph this phrase belongs to; drives the playing/stop button state. */
  key: string;
  /** Text handed to the speech engine (annotations stripped). */
  text: string;
  langCode: string;
  /** map[i] = index of text[i] in the displayed text; absent for single words. */
  map?: number[];
  /** Bounds of this phrase in the displayed text. */
  range?: TextRange;
};

/** What a speaker button asks for. `cleanLang` marks it as a sentence: it gets
 *  sentence cleaning and word highlighting; without it the raw text is spoken
 *  as a single vocabulary word. */
export interface SpeakRequest {
  key: string;
  raw: string;
  langCode: string;
  mode: SpeakMode;
  cleanLang?: string;
}

/**
 * What to highlight in the displayed text: the phrase being read (a calm band
 * that shows the words just ahead) and, inside it, the current word.
 */
export interface SpokenRange {
  key: string;
  /** Phrase bounds in the displayed text. */
  start: number;
  end: number;
  /** Current word bounds in the displayed text. */
  wordStart: number;
  wordEnd: number;
}

/**
 * sequence — read this paragraph, then keep going through the rest of the article.
 * once     — read this paragraph and stop.
 * repeat   — read this paragraph over and over until stopped.
 */
export type SpeakMode = 'sequence' | 'once' | 'repeat';

/**
 * Article playback in three modes (see SpeakMode). A run ends when the user
 * presses stop on the button that is playing, starts another one, switches
 * language, or leaves the page. Vocabulary words are always one-shot.
 */
export function useArticleSpeech({
  paragraphs,
  activeLang,
  originalTtsCode = 'ja-JP',
  originalCleanLang = 'ja',
}: {
  paragraphs: NHKParagraph[];
  activeLang: LangKey;
  originalTtsCode?: string;
  originalCleanLang?: string;
}) {
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [speakingMode, setSpeakingMode] = useState<SpeakMode | null>(null);
  const [spokenRange, setSpokenRange] = useState<SpokenRange | null>(null);
  const speakingKeyRef = useRef<string | null>(null);
  const speakingModeRef = useRef<SpeakMode | null>(null);
  // Bumped whenever playback should abandon whatever it was doing; callbacks
  // from cancelled utterances compare against it and bail out.
  const runIdRef = useRef(0);

  const paragraphsRef = useRef(paragraphs);
  paragraphsRef.current = paragraphs;
  const activeLangRef = useRef(activeLang);
  activeLangRef.current = activeLang;

  const stop = useCallback(() => {
    runIdRef.current += 1;
    cancelPronouncing();
    speakingKeyRef.current = null;
    speakingModeRef.current = null;
    setSpeakingKey(null);
    setSpeakingMode(null);
    setSpokenRange(null);
  }, []);

  useEffect(() => () => { stop(); }, [stop]);
  useEffect(() => { stop(); }, [activeLang, stop]);

  const buildQueue = useCallback(
    ({ key, raw, langCode, mode, cleanLang }: SpeakRequest): SpeechItem[] => {
      /** Split a paragraph into one utterance per phrase, each mapped back to
       *  its place in the displayed text. */
      const phrasesOf = (
        itemKey: string,
        source: string,
        code: string,
        lang: string,
      ): SpeechItem[] => {
        const { text, map } = cleanSentenceForTTSMapped(source, lang);
        if (!text.trim()) return [];
        return splitPhrases(text)
          .map(({ start, end }) => {
            const chunk = map.slice(start, end);
            return {
              key: itemKey,
              text: text.slice(start, end),
              langCode: code,
              map: chunk,
              range: chunk.length
                ? { start: chunk[0], end: chunk[chunk.length - 1] + 1 }
                : undefined,
            };
          })
          .filter((item) => item.text.trim().length > 0);
      };

      const self: SpeechItem[] = cleanLang
        ? phrasesOf(key, raw, langCode, cleanLang)
        : [{ key, langCode, text: cleanWordText(raw) }];

      const match = /^(\d+)-(original|translation)$/.exec(key);
      if (mode !== 'sequence' || !match) return self;

      const start = Number(match[1]);
      const track = match[2];
      const lang = activeLangRef.current;
      const items: SpeechItem[] = [];

      for (let i = start; i < paragraphsRef.current.length; i++) {
        const p = paragraphsRef.current[i];
        const text = track === 'original' ? p.original : lang === 'original' ? '' : p[lang];
        if (!text?.trim()) continue;
        items.push(
          ...(track === 'original'
            ? phrasesOf(`${i}-original`, text, originalTtsCode, originalCleanLang)
            : phrasesOf(`${i}-translation`, text, TRANSLATION_TTS[lang], lang)),
        );
      }

      return items.length > 0 ? items : self;
    },
    [originalCleanLang, originalTtsCode],
  );

  const playFrom = useCallback(
    (items: SpeechItem[], index: number, runId: number, mode: SpeakMode) => {
      if (runId !== runIdRef.current) return;
      if (index >= items.length) {
        if (mode === 'repeat') {
          // Short breath between repeats; also keeps an empty/failing utterance
          // from turning the loop into a tight recursion.
          window.setTimeout(() => {
            if (runId === runIdRef.current) playFrom(items, 0, runId, mode);
          }, 500);
          return;
        }
        speakingKeyRef.current = null;
        speakingModeRef.current = null;
        setSpeakingKey(null);
        setSpeakingMode(null);
        setSpokenRange(null);
        return;
      }

      const item = items[index];
      speakingKeyRef.current = item.key;
      speakingModeRef.current = mode;
      setSpeakingKey(item.key);
      setSpeakingMode(mode);
      // The phrase is highlighted for exactly as long as its own utterance
      // speaks — no timing estimate involved.
      setSpokenRange(
        item.range
          ? {
              key: item.key,
              start: item.range.start,
              end: item.range.end,
              wordStart: item.range.start,
              wordEnd: item.range.start,
            }
          : null,
      );

      const map = item.map;
      speakSentence(
        item.text,
        item.langCode,
        {},
        () => {
          if (runId !== runIdRef.current) return;
          playFrom(items, index + 1, runId, mode);
        },
        {
          // Where the engine does report word boundaries (Chromium on desktop),
          // add the word marker inside the phrase.
          onBoundary:
            map && item.range
              ? (charIndex, charLength) => {
                  if (runId !== runIdRef.current) return;
                  const from = Math.min(charIndex, map.length - 1);
                  const to = Math.min(charIndex + charLength, map.length) - 1;
                  if (from < 0 || to < from) return;
                  setSpokenRange({
                    key: item.key,
                    start: item.range!.start,
                    end: item.range!.end,
                    wordStart: map[from],
                    wordEnd: map[to] + 1,
                  });
                }
              : undefined,
        },
      );
    },
    [],
  );

  const triggerSpeak = useCallback(
    (request: SpeakRequest) => {
      if (speakingKeyRef.current === request.key && speakingModeRef.current === request.mode) {
        stop();
        return;
      }
      runIdRef.current += 1;
      const runId = runIdRef.current;
      cancelPronouncing();
      playFrom(buildQueue(request), 0, runId, request.mode);
    },
    [buildQueue, playFrom, stop],
  );

  return { speakingKey, speakingMode, spokenRange, triggerSpeak, stopSpeaking: stop };
}

const MODE_ICON: Record<SpeakMode, (cls: string) => React.ReactElement> = {
  // Play-through: a playlist with a play head.
  sequence: (cls) => (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h12M4 11h9M4 16h6" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 13l7 4-7 4v-8z" />
    </svg>
  ),
  // Single read: plain speaker.
  once: (cls) => (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 5.05a9 9 0 010 12.728M9 9H5a2 2 0 00-2 2v2a2 2 0 002 2h4l5 5V4L9 9z" />
    </svg>
  ),
  // Loop the same paragraph.
  repeat: (cls) => (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  ),
};

const MODE_LABEL: Record<SpeakMode, string> = {
  sequence: 'nhk.playSequence',
  once: 'nhk.playOnce',
  repeat: 'nhk.playRepeat',
};

const SPEAK_MODES: SpeakMode[] = ['sequence', 'once', 'repeat'];

export const SpeakerButton: React.FC<{
  onClick: (e: React.MouseEvent) => void;
  isPlaying?: boolean;
  small?: boolean;
  mode?: SpeakMode;
}> = ({ onClick, isPlaying, small, mode = 'once' }) => {
  const { t } = useTranslation();
  const label = isPlaying ? t('nhk.stopPlaying') : t(MODE_LABEL[mode]);
  return (
    <button
      onClick={onClick}
      title={label}
      className={`${small ? 'p-0.5' : 'p-1'} rounded-md transition-colors shrink-0 ${
        isPlaying
          ? 'text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
      }`}
      aria-label={label}
    >
      {isPlaying ? (
        <svg className={small ? 'w-3.5 h-3.5' : 'w-4 h-4'} viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="1" />
        </svg>
      ) : (
        MODE_ICON[mode](small ? 'w-3.5 h-3.5' : 'w-4 h-4')
      )}
    </button>
  );
};

/** The three playback modes, stacked one per line beside a paragraph. */
export const SpeakerControls: React.FC<{
  speakKey: string;
  raw: string;
  langCode: string;
  cleanLang: string;
  speakingKey: string | null;
  speakingMode: SpeakMode | null;
  onSpeak: (request: SpeakRequest) => void;
}> = ({ speakKey, raw, langCode, cleanLang, speakingKey, speakingMode, onSpeak }) => (
  <div className="flex flex-col items-center gap-0.5 shrink-0">
    {SPEAK_MODES.map((mode) => (
      <SpeakerButton
        key={mode}
        mode={mode}
        isPlaying={speakingKey === speakKey && speakingMode === mode}
        onClick={(e) => {
          e.stopPropagation();
          onSpeak({ key: speakKey, raw, langCode, cleanLang, mode });
        }}
      />
    ))}
  </div>
);

/**
 * Paragraph text with the phrase being read tinted and the current word marked
 * inside it. The phrase band moves a clause at a time — slow enough to follow,
 * and it shows the next few words before they are spoken.
 */
const SpokenText: React.FC<{ text: string; range: SpokenRange | null }> = ({ text, range }) => {
  if (!range) return <>{text}</>;

  const clamp = (n: number) => Math.max(0, Math.min(n, text.length));
  const start = clamp(range.start);
  const end = Math.max(start, clamp(range.end));
  if (start === end) return <>{text}</>;

  const wordStart = Math.max(start, Math.min(clamp(range.wordStart), end));
  const wordEnd = Math.max(wordStart, Math.min(clamp(range.wordEnd), end));

  return (
    <>
      {text.slice(0, start)}
      <mark className="-mx-0.5 px-0.5 rounded bg-sky-500/10 dark:bg-sky-400/15 text-inherit">
        {text.slice(start, wordStart)}
        {wordEnd > wordStart && (
          <mark className="rounded-sm bg-sky-200 dark:bg-sky-400/45 text-sky-900 dark:text-white">
            {text.slice(wordStart, wordEnd)}
          </mark>
        )}
        {text.slice(wordEnd, end)}
      </mark>
      {text.slice(end)}
    </>
  );
};

export const ParagraphCard: React.FC<{
  paragraph: NHKParagraph;
  activeLang: LangKey;
  index: number;
  speakingKey: string | null;
  speakingMode: SpeakMode | null;
  spokenRange: SpokenRange | null;
  onSpeak: (request: SpeakRequest) => void;
  originalTtsCode?: string;
  originalCleanLang?: string;
  vocabTtsCode?: string;
}> = ({
  paragraph,
  activeLang,
  index,
  speakingKey,
  speakingMode,
  spokenRange,
  onSpeak,
  originalTtsCode = 'ja-JP',
  originalCleanLang = 'ja',
  vocabTtsCode = 'ja-JP',
}) => {
  const { t } = useTranslation();
  const [translationOpen, setTranslationOpen] = useState(false);
  const [grammarOpen, setGrammarOpen] = useState(false);
  const [vocabOpen, setVocabOpen] = useState(false);
  const translation = activeLang === 'original' ? null : paragraph[activeLang];

  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setTranslationOpen(false); }, [activeLang]);

  const originalKey = `${index}-original`;
  const translationKey = `${index}-translation`;
  const isSpeaking = speakingKey === originalKey || speakingKey === translationKey;

  // Continuous playback walks into cards the user never touched: reveal the
  // translation being read and bring the card (and its stop button) on screen.
  useEffect(() => {
    if (speakingKey === translationKey) setTranslationOpen(true);
  }, [speakingKey, translationKey]);

  useEffect(() => {
    if (isSpeaking) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [isSpeaking]);

  return (
    <div ref={cardRef} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="p-4">
        <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mb-2">#{index + 1}</p>
        <div className="flex items-start gap-1">
          <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed flex-1">
            <SpokenText
              text={paragraph.original}
              range={spokenRange?.key === originalKey ? spokenRange : null}
            />
          </p>
          <SpeakerControls
            speakKey={originalKey}
            raw={paragraph.original}
            langCode={originalTtsCode}
            cleanLang={originalCleanLang}
            speakingKey={speakingKey}
            speakingMode={speakingMode}
            onSpeak={onSpeak}
          />
        </div>
      </div>

      {translation && (
        <>
          <button
            onClick={() => setTranslationOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 border-t border-gray-100 dark:border-gray-700 border-l-2 border-l-sky-400 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            <span className="text-sky-600 dark:text-sky-400">
              💬 {activeLang === 'en' ? 'EN' : activeLang === 'zh' ? '繁中' : '日文'}
            </span>
            <svg
              className={`w-3.5 h-3.5 text-gray-400 transition-transform ${translationOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {translationOpen && (
            <div className="flex items-start gap-1 px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed flex-1">
                <SpokenText
                  text={translation}
                  range={spokenRange?.key === translationKey ? spokenRange : null}
                />
              </p>
              <SpeakerControls
                speakKey={translationKey}
                raw={translation}
                langCode={TRANSLATION_TTS[activeLang]}
                cleanLang={activeLang}
                speakingKey={speakingKey}
                speakingMode={speakingMode}
                onSpeak={onSpeak}
              />
            </div>
          )}
        </>
      )}

      {paragraph.grammar && (
        <>
          <button
            onClick={() => setGrammarOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 border-t border-gray-100 dark:border-gray-700 border-l-2 border-l-violet-400 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            <span className="text-violet-600 dark:text-violet-400">📝 {t('nhk.grammar')}</span>
            <svg
              className={`w-3.5 h-3.5 text-gray-400 transition-transform ${grammarOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {grammarOpen && (
            <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">{paragraph.grammar}</p>
            </div>
          )}
        </>
      )}

      {paragraph.vocabulary?.length > 0 && (
        <>
          <button
            onClick={() => setVocabOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 border-t border-gray-100 dark:border-gray-700 border-l-2 border-l-amber-400 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            <span className="text-amber-600 dark:text-amber-400">📚 {t('nhk.vocabulary')} ({paragraph.vocabulary.length})</span>
            <svg
              className={`w-3.5 h-3.5 text-gray-400 transition-transform ${vocabOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {vocabOpen && (
            <div className="overflow-x-auto border-t border-gray-100 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-750">
                    <th className="text-left px-4 py-2 text-xs text-gray-500 dark:text-gray-400 font-medium">{t('nhk.word')}</th>
                    <th className="text-left px-4 py-2 text-xs text-gray-500 dark:text-gray-400 font-medium">中文</th>
                    <th className="text-left px-4 py-2 text-xs text-gray-500 dark:text-gray-400 font-medium">English</th>
                  </tr>
                </thead>
                <tbody>
                  {paragraph.vocabulary.map((v, i) => {
                    const vocabKey = `${index}-vocab-${i}`;
                    return (
                      <tr
                        key={i}
                        className="border-t border-gray-100 dark:border-gray-700 border-l-2 border-l-transparent hover:border-l-amber-400/60 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-amber-600 dark:text-amber-400">{v.word}</span>
                            <SpeakerButton
                              small
                              isPlaying={speakingKey === vocabKey}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSpeak({
                                  key: vocabKey,
                                  raw: v.word,
                                  langCode: vocabTtsCode,
                                  mode: 'once',
                                });
                              }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-700 dark:text-gray-200">{v.meaning_zh}</td>
                        <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs">{v.meaning_en}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};
