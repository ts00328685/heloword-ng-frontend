import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NHKParagraph } from '../../services/nhkArticle.service';
import { cancelPronouncing, cleanSentenceForTTS, cleanWordText, speakSentence } from '../../services/tts.service';

export type LangKey = 'original' | 'zh' | 'en' | 'ja';

const TRANSLATION_TTS: Record<LangKey, string> = {
  original: 'ja-JP',
  en: 'en-US',
  zh: 'zh-TW',
  ja: 'ja-JP',
};

type SpeechItem = { key: string; text: string; langCode: string };

/**
 * Article playback: clicking a paragraph speaker starts a continuous run that
 * keeps going through the following paragraphs (same track — original or
 * translation) until the user presses stop on the paragraph being spoken,
 * starts another one, switches language, or leaves the page.
 * Vocabulary words stay one-shot.
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
  const speakingKeyRef = useRef<string | null>(null);
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
    setSpeakingKey(null);
  }, []);

  useEffect(() => () => { stop(); }, [stop]);
  useEffect(() => { stop(); }, [activeLang, stop]);

  const buildQueue = useCallback(
    (key: string, text: string, langCode: string): SpeechItem[] => {
      const match = /^(\d+)-(original|translation)$/.exec(key);
      if (!match) return [{ key, text, langCode }];

      const start = Number(match[1]);
      const track = match[2];
      const lang = activeLangRef.current;
      const items: SpeechItem[] = [];

      for (let i = start; i < paragraphsRef.current.length; i++) {
        const p = paragraphsRef.current[i];
        const raw = track === 'original' ? p.original : lang === 'original' ? '' : p[lang];
        if (!raw?.trim()) continue;
        items.push(
          track === 'original'
            ? {
                key: `${i}-original`,
                text: cleanSentenceForTTS(raw, originalCleanLang),
                langCode: originalTtsCode,
              }
            : {
                key: `${i}-translation`,
                text: cleanSentenceForTTS(raw, lang),
                langCode: TRANSLATION_TTS[lang],
              },
        );
      }

      return items.length > 0 ? items : [{ key, text, langCode }];
    },
    [originalCleanLang, originalTtsCode],
  );

  const playFrom = useCallback((items: SpeechItem[], index: number, runId: number) => {
    if (runId !== runIdRef.current) return;
    if (index >= items.length) {
      speakingKeyRef.current = null;
      setSpeakingKey(null);
      return;
    }
    const item = items[index];
    speakingKeyRef.current = item.key;
    setSpeakingKey(item.key);
    speakSentence(item.text, item.langCode, {}, () => {
      if (runId !== runIdRef.current) return;
      playFrom(items, index + 1, runId);
    });
  }, []);

  const triggerSpeak = useCallback(
    (key: string, text: string, langCode: string) => {
      if (speakingKeyRef.current === key) {
        stop();
        return;
      }
      runIdRef.current += 1;
      const runId = runIdRef.current;
      cancelPronouncing();
      playFrom(buildQueue(key, text, langCode), 0, runId);
    },
    [buildQueue, playFrom, stop],
  );

  return { speakingKey, triggerSpeak, stopSpeaking: stop };
}

export const SpeakerButton: React.FC<{
  onClick: (e: React.MouseEvent) => void;
  isPlaying?: boolean;
  small?: boolean;
}> = ({ onClick, isPlaying, small }) => (
  <button
    onClick={onClick}
    className={`${small ? 'p-0.5' : 'p-1'} rounded-md transition-colors shrink-0 ${
      isPlaying
        ? 'text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300'
        : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
    }`}
    aria-label={isPlaying ? 'Stop' : 'Speak'}
  >
    {isPlaying ? (
      <svg className={small ? 'w-3.5 h-3.5' : 'w-4 h-4'} viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="6" width="12" height="12" rx="1" />
      </svg>
    ) : (
      <svg className={small ? 'w-3.5 h-3.5' : 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 5.05a9 9 0 010 12.728M9 9H5a2 2 0 00-2 2v2a2 2 0 002 2h4l5 5V4L9 9z" />
      </svg>
    )}
  </button>
);

export const ParagraphCard: React.FC<{
  paragraph: NHKParagraph;
  activeLang: LangKey;
  index: number;
  speakingKey: string | null;
  onSpeak: (key: string, text: string, langCode: string) => void;
  originalTtsCode?: string;
  originalCleanLang?: string;
  vocabTtsCode?: string;
}> = ({
  paragraph,
  activeLang,
  index,
  speakingKey,
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
          <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed flex-1">{paragraph.original}</p>
          <SpeakerButton
            isPlaying={speakingKey === originalKey}
            onClick={(e) => {
              e.stopPropagation();
              onSpeak(originalKey, cleanSentenceForTTS(paragraph.original, originalCleanLang), originalTtsCode);
            }}
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
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed flex-1">{translation}</p>
              <SpeakerButton
                isPlaying={speakingKey === translationKey}
                onClick={(e) => {
                  e.stopPropagation();
                  onSpeak(translationKey, cleanSentenceForTTS(translation, activeLang), TRANSLATION_TTS[activeLang]);
                }}
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
                                onSpeak(vocabKey, cleanWordText(v.word), vocabTtsCode);
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
