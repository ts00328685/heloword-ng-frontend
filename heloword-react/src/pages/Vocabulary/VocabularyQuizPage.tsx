import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import SentenceRenderer from '../../components/SentenceRenderer';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useUI } from '../../contexts/UIContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { DueWord, QuizSetting, Sentence, SentenceStore, WordStore } from '../../models';
import { doPost } from '../../services/api.service';
import {
  generateId,
  saveGuestSetting,
  saveGuestRecord,
} from '../../services/guestStorage.service';
import { getWordInsight, getSampleSentence } from '../../services/llm.service';
import { useAiInsight } from '../../hooks/useAiInsight';

const normalizeGerman = (s: string) =>
  s.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'b');

const getJpAnswers = (answer: string) => {
  const kataInBrackets = (answer.match(/(?<=\[).+?(?=\])/g) || [])
    .flatMap((c) => c.match(/[一-龠]+|[ぁ-ゔ]+|[ァ-ヴー]+|[々〆〤ヶ]+/g) || []);

  const ansKanjiFirst = (answer.match(/[一-龠]+|[ぁ-ゔ]+|[ァ-ヴー]+|[々〆〤ヶ]+|[0-9]+/g) || [])
    .filter((c) => !kataInBrackets.includes(c))
    .join('');

  const ansKataFirst = (answer.match(/(?<=\[).+?(?=\])[一-龠]+|[ぁ-ゔ]+|[ァ-ヴー]+|[々〆〤ヶ]+|[0-9]+/g) || []).join('');

  return { ansKanjiFirst, ansKataFirst };
};

const LANG_MAP: Record<string, string> = {
  en: 'en-US',
  de: 'de-DE',
  jp: 'ja-JP',
  ch: 'zh-TW',
};

/** Extract the kana-only reading from a Japanese word string.
 *  "さ 来週[らいしゅう]" → "さらいしゅう"
 *  "書く[かく]" → "かく"  (okurigana before bracket is part of the annotated unit)
 *  Each word[reading] unit is replaced by its reading; remaining kana are kept. */
const extractKanaAnswer = (wordStr: string): string => {
  // Replace every "unit[reading]" block with just the reading.
  // [^\s\[]* matches the kanji/kana unit before the bracket (including okurigana).
  const withReadings = wordStr.replace(/[^\s\[]*\[([^\]]+)\]/g, '$1');
  // Collect all hiragana/katakana runs; skip kanji, numbers, spaces, punctuation.
  return (withReadings.match(/[ぁ-ゔァ-ヴー]+/g) || []).join('');
};

/** Split a kana string into max-9 display groups.
 *  Small kana (ゅ, ょ, etc.) are merged with the preceding character. */
const splitKanaGroups = (kana: string): string[] => {
  const small = /[ぁぃぅぇぉゃゅょっゎァィゥェォャュョッヮ]/;
  const groups: string[] = [];
  for (const ch of kana) {
    if (small.test(ch) && groups.length > 0) groups[groups.length - 1] += ch;
    else groups.push(ch);
  }
  while (groups.length > 9) {
    groups.splice(groups.length - 2, 2, groups[groups.length - 2] + groups[groups.length - 1]);
  }
  return groups;
};

const cancelPronouncing = () => {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
};

const pronounceWord = (word: string, lang: string, speed = 1.0, volume = 0.2) => {
  if (!word || !('speechSynthesis' in window)) return;
  cancelPronouncing();

  const cleaned = word.replace(/(\[.*?\]|\(.*?\)) */g, '').replace(/(<.*?>) */g, '');
  const langCode = LANG_MAP[lang] || 'en-US';
  const synthesis = window.speechSynthesis;
  const voice = synthesis.getVoices().find((v) => v.lang === langCode) || null;

  const utterance = new SpeechSynthesisUtterance(cleaned);
  utterance.voice = voice;
  utterance.pitch = 1.2;
  utterance.rate = speed;
  utterance.volume = volume;

  synthesis.speak(utterance);
};

const VocabularyQuizPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { isLoggedIn } = useAuth();
  const { wordStore, sentenceStore, isFullyLoaded, loadFullDashboard, updateWordStore, updateSentenceStore } = useData();
  const { showToast, showAlert } = useUI();
  const { refreshGuest } = useNotifications();

  const inputRef = useRef<HTMLInputElement>(null);
  const startTimeRef = useRef<Date>(new Date());

  const [wordList, setWordList] = useState<Sentence[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [totalLength, setTotalLength] = useState(0);

  const pronounceCountRef = useRef(0);
  const deleteCountRef = useRef(0);
  const wrongCountRef = useRef(0);

  const [autoPronounce, setAutoPronounce] = useState(false);
  const [autoPronounceEn, setAutoPronounceEn] = useState(false);
  const [autoPronounceCh, setAutoPronounceCh] = useState(false);
  const [autoPronounceSentence, setAutoPronounceSentence] = useState(false);
  const [autoInputFocus, setAutoInputFocus] = useState(true);
  const [enableEnMask, setEnableMaskEn] = useState(false);
  const [enableSentenceMask, setEnableSentenceMask] = useState(false);
  const [failWhenMaskOff, setFailWhenMaskOff] = useState(false);
  const [japaneseMode, setJapaneseMode] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [volume, setVolume] = useState(0.2);
  const [showSettings, setShowSettings] = useState(false);

  // AI insight / sample sentence
  const aiInsight = useAiInsight('quiz:insight');
  const aiSample  = useAiInsight('quiz:sample');

  // Japanese button-input mode
  const [jpButtonMode, setJpButtonMode] = useState(true);
  const [builtAnswer, setBuiltAnswer] = useState<string[]>([]);
  const [builtAnswerIndices, setBuiltAnswerIndices] = useState<number[]>([]);
  const [kanaGroups, setKanaGroups] = useState<string[]>([]);
  const [showJpSuccess, setShowJpSuccess] = useState(false);

  const settingIdMapRef = useRef<Map<string, number>>(new Map());
  // Collect every in-flight save-single-record promise so we can await them before navigating
  const pendingSavesRef = useRef<Promise<void>[]>([]);
  // Prevents double-trigger of goNext in JP button mode (showJpSuccess state update is async)
  const jpSuccessFiredRef = useRef(false);
  const quizSettingsRef = useRef<Record<string, QuizSetting>>({});
  const saveSettingsPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const quizSettings: Record<string, QuizSetting> = location.state?.quizSettings;
    const finishedIdMap: Record<string, number[]> = location.state?.finishedIdMap || {};

    if (!quizSettings || Object.keys(quizSettings).length === 0) {
      navigate('/home', { replace: true });
      return;
    }

    quizSettingsRef.current = quizSettings;
    showAlert(t('quiz.retestNote'));
    // Only run once — Strict Mode fires this effect twice; the null guard prevents a
    // second saveQuizSettings call and a duplicate initWordList call.
    // initWordList is called AFTER saveQuizSettings resolves so that settingIdMapRef
    // is fully populated before any word can be answered, eliminating the race where
    // save-single-record posts run without a recordQuizSettingId.
    if (saveSettingsPromiseRef.current === null) {
      const run = async () => {
        await saveQuizSettings(quizSettings);
        // initWordList closes over wordStore/sentenceStore from the first render.
        // If the user navigated here without visiting Home first the stores are empty,
        // so fetch the dashboard and pass the fresh data directly.
        let freshWords: WordStore | undefined;
        let freshSentences: SentenceStore | undefined;
        if (!isFullyLoaded) {
          try {
            const { words, sentences } = await loadFullDashboard();
            freshWords = words;
            freshSentences = sentences;
          } catch {
            // fall through — initWordList will navigate to /home if still empty
          }
        }
        initWordList(quizSettings, finishedIdMap, freshWords, freshSentences);
      };
      saveSettingsPromiseRef.current = run();
    }
  }, []);

  useEffect(() => {
    const isButtonMode = wordList[0]?.language === 'jp' && jpButtonMode && !!wordList[0]?.word;
    if (autoInputFocus && inputRef.current && !isButtonMode) {
      inputRef.current.focus();
    }
  }, [currentIndex, autoInputFocus, jpButtonMode, wordList]);

  // Reset kana buttons whenever the word changes or button mode is toggled
  useEffect(() => {
    const word = wordList[0];
    if (!word || word.language !== 'jp' || !jpButtonMode || !word.word) return;
    const kana = extractKanaAnswer(word.word);
    const groups = splitKanaGroups(kana);
    setKanaGroups([...groups].sort(() => Math.random() - 0.5));
    setBuiltAnswer([]);
    setBuiltAnswerIndices([]);
    setShowJpSuccess(false);
    jpSuccessFiredRef.current = false;
  }, [wordList[0]?.id, jpButtonMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveQuizSettings = async (quizSettings: Record<string, QuizSetting>) => {
    const settingList = Object.keys(quizSettings).map((k) => ({ _key: k, ...quizSettings[k] }));

    if (!isLoggedIn) {
      // Resume flow: settings already have _guestId from ReviewPage
      const alreadyPersistedGuest = settingList.some((s) => !!(s as any)._guestId);
      if (alreadyPersistedGuest) {
        settingList.forEach((s) => {
          settingIdMapRef.current.set(s.type, (s as any)._guestId);
        });
        return;
      }
      // New guest session: generate UUIDs and persist to localStorage
      const timestamp = new Date().toISOString();
      settingList.forEach((s) => {
        const id = generateId();
        saveGuestSetting({
          id,
          timestamp,
          type: s.type,
          tableName: s.tableName || '',
          min: s.min ?? 1,
          max: s.max ?? s.total,
          total: s.total,
        });
        settingIdMapRef.current.set(s.type, id as any);
      });
      return;
    }

    const alreadyPersisted = settingList.some((s) => !!s.id);
    if (alreadyPersisted) {
      settingList.forEach((s) => settingIdMapRef.current.set(s.type, s.id!));
      return;
    }

    try {
      const response = await doPost('/frontend-api/api/fe/quiz/save-setting-records', settingList);
      settingList.forEach((s, idx) => {
        settingIdMapRef.current.set(s.type, response.data.ids[idx]);
      });
    } catch {
      // Non-critical
    }
  };

  const saveSingleRecord = useCallback(
    (word: Sentence) => {
      if (word.recordSaved) return;
      word.recordSaved = true;

      const currentTime = new Date();
      const timeSpent = (currentTime.getTime() - startTimeRef.current.getTime()) / 1000;
      const settingId = settingIdMapRef.current.get(word._quizType || word.tableName || '');

      if (!isLoggedIn) {
        saveGuestRecord({
          id: generateId(),
          settingId: settingId ? String(settingId) : '',
          answerId: word.id,
          answerTableName: word.tableName || '',
          timeSpent,
          finishedTime: currentTime.toISOString(),
          wrongCount: wrongCountRef.current,
          quizIndex: currentIndex,
        });
        return;
      }

      const p = doPost('/frontend-api/api/fe/quiz/save-single-record', {
        answerId: word.id,
        answerTableName: word.tableName,
        timeSpent,
        quizIndex: currentIndex,
        startTime: startTimeRef.current,
        finishedTime: currentTime,
        pronounceCount: pronounceCountRef.current,
        deleteCount: deleteCountRef.current,
        wrongCount: wrongCountRef.current,
        recordQuizSettingId: settingId,
      }).then(() => {}).catch(() => {});
      pendingSavesRef.current.push(p);
    },
    [isLoggedIn, currentIndex]
  );

  const initWordList = (
    quizSettings: Record<string, QuizSetting>,
    finishedIdMap: Record<string, number[]>,
    ws?: WordStore,
    ss?: SentenceStore,
  ) => {
    const combined: Record<string, Sentence[]> = { ...(ws ?? wordStore), ...(ss ?? sentenceStore) } as any;
    let list: Sentence[] = [];

    Object.keys(quizSettings).forEach((key) => {
      if (!combined[key]) return;
      const s = quizSettings[key];
      const min = (s.min ?? 1) - 1;
      const max = s.max ?? combined[key].length;
      list = [...list, ...combined[key].slice(min, max).map((w) => ({ ...w, _quizType: key }))];
    });

    list = list.sort(() => Math.random() - 0.5);

    if (list.length === 0) {
      navigate('/home', { replace: true });
      return;
    }

    // If launched from the due-for-review section, restrict to only those words
    const dueOnlyIds: DueWord[] | undefined = location.state?.dueOnlyIds;
    if (dueOnlyIds && dueOnlyIds.length > 0) {
      const dueSet = new Set(dueOnlyIds.map((w) => `${w.answerId}|${w.answerTableName ?? ''}`));
      list = list.filter((word) => dueSet.has(`${word.id}|${word.tableName ?? ''}`));
    }

    const hasFinished = Object.keys(finishedIdMap).length > 0;
    if (hasFinished) {
      list = list.filter((word) => {
        const settingId = settingIdMapRef.current.get(word._quizType || word.tableName || '');
        const finishedIds = settingId ? finishedIdMap[settingId] || [] : [];
        return !finishedIds.includes(word.id);
      });
    }

    setWordList(list);
    setTotalLength(list.length);
    setCurrentIndex(0);
  };

  const getRawAnswer = (word: Sentence): string => {
    let answer = (word.word || word.sentence || '');

    if (japaneseMode && word.language === 'jp') {
      answer = answer.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, '');
    }
    if (japaneseMode && word.sentence) {
      answer = word.sentence;
    }

    return answer.trim().toLowerCase();
  };

  const isAnswerCorrect = (input: string, word: Sentence): boolean => {
    let answer = getRawAnswer(word);

    if (word.language === 'de') {
      answer = normalizeGerman(answer);
    }

    if (japaneseMode && word.language === 'jp') {
      const { ansKanjiFirst, ansKataFirst } = getJpAnswers(answer);
      return input === ansKanjiFirst || input === ansKataFirst;
    }

    const lastChar = answer.charAt(answer.length - 1);
    if (['.', '?', '。', '!'].includes(lastChar)) {
      answer = answer.slice(0, -1);
    }

    const trimmedAns = answer.replace(/[\W]/g, '');
    const trimmedInput = input.trim().toLowerCase().replace(/[\W]/g, '');

    if (trimmedInput.length >= trimmedAns.length && trimmedInput.includes(trimmedAns)) {
      return true;
    }
    if (trimmedInput.length > trimmedAns.length && !trimmedInput.includes(trimmedAns)) {
      wrongCountRef.current++;
    }
    return false;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    if (!val || wordList.length === 0) return;

    const current = wordList[0];
    if (isAnswerCorrect(val, current)) {
      goNext(current);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      deleteCountRef.current++;
    }
    if (e.key === 'Enter') {
      wrongCountRef.current += 5;
      const ans = getRawAnswer(wordList[0]);
      showToast(t('quiz.correctAnswer', { answer: ans }), 700, 'bottom');
    }
  };

  const goNext = useCallback(
    async (current: Sentence) => {
      cancelPronouncing();

      let needRetest = false;

      if (failWhenMaskOff && !enableSentenceMask) {
        wrongCountRef.current++;
      }
      if (pronounceCountRef.current >= 3) {
        wrongCountRef.current++;
      }

      if (wrongCountRef.current === 0) {
        saveSingleRecord(current);
      } else {
        needRetest = true;
      }

      startTimeRef.current = new Date();
      pronounceCountRef.current = 0;
      deleteCountRef.current = 0;
      wrongCountRef.current = 0;

      setWordList((prev) => {
        let next = prev.slice(1);
        if (needRetest) next = [...next, { ...current }];
        return next;
      });

      setCurrentIndex((i) => (needRetest ? i : i + 1));
      setInputValue('');

      const isLastWord = !needRetest && currentIndex + 1 >= totalLength;
      if (isLastWord) {
        // Wait for all in-flight save-single-record calls before navigating so the
        // review page sees the complete finishedCount rather than a stale value.
        await Promise.all(pendingSavesRef.current);
        showToast(t('quiz.finished'));
        if (!isLoggedIn) refreshGuest();
        navigate('/review', { replace: true });
        return;
      }

      const next = wordList[needRetest ? wordList.length - 1 : 1];
      if (!next) return;

      if (autoPronounce) {
        pronounceWord(next.word || next.sentence || '', next.language, speed, volume);
      }
      const delay = autoPronounce ? 1000 : 0;
      if (autoPronounceEn) setTimeout(() => pronounceWord(next.translateEn, 'en', speed, volume), delay);
      if (autoPronounceCh) setTimeout(() => pronounceWord(next.translateCh, 'ch', speed, volume), delay);
      if (autoPronounceSentence) setTimeout(() => pronounceWord(next.sentence || '', next.language, speed, volume), delay);

      if (autoInputFocus) setTimeout(() => inputRef.current?.focus(), 50);
    },
    [
      currentIndex, totalLength, wordList, failWhenMaskOff, enableSentenceMask,
      autoPronounce, autoPronounceEn, autoPronounceCh, autoPronounceSentence,
      autoInputFocus, speed, volume, saveSingleRecord, showToast, navigate,
      isLoggedIn, refreshGuest,
    ]
  );

  const handleKanaClick = useCallback((idx: number) => {
    const word = wordList[0];
    if (!word || jpSuccessFiredRef.current) return;
    const kana = extractKanaAnswer(word.word || '');
    const next = [...builtAnswer, kanaGroups[idx]];
    setBuiltAnswer(next);
    setBuiltAnswerIndices((prev) => [...prev, idx]);
    if (next.join('') === kana) {
      jpSuccessFiredRef.current = true;
      // Reset per-word counters now so that any interaction during the 2-second
      // success flash (e.g. pressing pronounce to hear the word, or clicking skip
      // to skip the wait) does not inflate wrongCount and cause a spurious retest.
      pronounceCountRef.current = 0;
      deleteCountRef.current = 0;
      setShowJpSuccess(true);
      setTimeout(() => {
        // If the word was already advanced (e.g. user tapped skip during the flash),
        // the kana-reset effect will have set jpSuccessFiredRef to false — bail out
        // to prevent a double-goNext that silently drops the next word from the queue.
        if (!jpSuccessFiredRef.current) return;
        setShowJpSuccess(false);
        goNext(word);
      }, 2000);
    }
  }, [wordList, kanaGroups, builtAnswer, goNext]);

  // Number-key (1–9) and Backspace shortcuts for button mode
  useEffect(() => {
    const word = wordList[0];
    if (!word || word.language !== 'jp' || !jpButtonMode || !word.word) return;
    const handler = (e: KeyboardEvent) => {
      if (jpSuccessFiredRef.current) return;
      if (e.key === 'Backspace') {
        e.preventDefault();
        setBuiltAnswer((p) => p.slice(0, -1));
        setBuiltAnswerIndices((p) => p.slice(0, -1));
        return;
      }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= kanaGroups.length) {
        e.preventDefault();
        handleKanaClick(n - 1);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [wordList, jpButtonMode, kanaGroups, handleKanaClick]);

  const handleRevealAnswer = () => {
    // Don't penalise after the word was already answered correctly (success flash showing).
    if (!jpSuccessFiredRef.current) wrongCountRef.current += 5;
    const current = wordList[0];
    if (!current) return;
    let ans = getRawAnswer(current);
    if (japaneseMode && current.language === 'jp') {
      const { ansKanjiFirst, ansKataFirst } = getJpAnswers(ans);
      showToast(t('quiz.correctAnswerJp', { ans1: ansKanjiFirst, ans2: ansKataFirst }), 2000, 'bottom');
    } else {
      showToast(t('quiz.correctAnswer', { answer: ans }), 2000, 'bottom');
    }
    if (autoInputFocus) inputRef.current?.focus();
  };

  const handlePronounce = () => {
    const current = wordList[0];
    if (!current) return;
    pronounceCountRef.current++;
    pronounceWord(current.word || current.sentence || '', current.language, speed, volume);
    if (autoInputFocus) setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleToggleSentenceMask = () => {
    if (enableSentenceMask) wrongCountRef.current++;
    setEnableSentenceMask((v) => !v);
  };

  const handleToggleEnMask = () => {
    if (enableEnMask) wrongCountRef.current++;
    setEnableMaskEn((v) => !v);
  };

  const current = wordList[0];

  // Clear AI panels whenever the word changes
  useEffect(() => {
    aiInsight.clear();
    aiSample.clear();
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAiInsight = () => {
    if (!current) return;
    if (!isLoggedIn) { showAlert(t('llm.loginRequired')); return; }
    aiInsight.run(
      String(current.id),
      () => getWordInsight(current.word || current.sentence || '', current.translateEn || '', current.translateCh || '', i18n.language, current.language || 'en'),
    );
  };

  const handleAiSample = () => {
    if (!current) return;
    if (!isLoggedIn) { showAlert(t('llm.loginRequired')); return; }
    aiSample.run(
      String(current.id),
      () => getSampleSentence(current.word || current.sentence || '', current.translateEn || '', i18n.language, current.language || 'en'),
    );
  };
  // Button mode: JP words only (not sentence-only entries)
  const isJpButtonMode = !!(current?.language === 'jp' && jpButtonMode && current?.word);

  if (!current) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-400 dark:text-gray-500 text-sm">{t('quiz.loading')}</p>
      </div>
    );
  }

  const displaySentence = current.sentence || '';

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header
        title={`${currentIndex + 1} / ${totalLength}`}
        showBack
        rightContent={
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Quiz settings"
          >
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        }
      />

      {/* Progress bar */}
      <div className="h-1 bg-gray-200 dark:bg-gray-700">
        <div
          className="h-1 bg-blue-500 transition-all duration-500"
          style={{ width: `${(currentIndex / totalLength) * 100}%` }}
        />
      </div>

      <main className="flex-1 pb-6 px-4 pt-4 max-w-2xl mx-auto w-full overflow-y-auto">
        {/* Settings panel */}
        {showSettings && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 mb-4 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">{t('quiz.options')}</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: t('quiz.autoPronounce'), val: autoPronounce, set: setAutoPronounce },
                { label: t('quiz.pronounceEn'), val: autoPronounceEn, set: setAutoPronounceEn },
                { label: t('quiz.pronounceCh'), val: autoPronounceCh, set: setAutoPronounceCh },
                { label: t('quiz.pronounceSentence'), val: autoPronounceSentence, set: setAutoPronounceSentence },
                { label: t('quiz.autoFocus'), val: autoInputFocus, set: setAutoInputFocus },
                { label: t('quiz.japaneseMode'), val: japaneseMode, set: setJapaneseMode },
                { label: t('quiz.jpButtonInput'), val: jpButtonMode, set: setJpButtonMode },
                { label: t('quiz.failWithoutMask'), val: failWhenMaskOff, set: setFailWhenMaskOff },
              ].map(({ label, val, set }) => (
                <button
                  key={label}
                  onClick={() => set(!val)}
                  className={`text-xs px-3 py-2 rounded-lg border font-medium transition-colors ${
                    val
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 dark:text-gray-400 w-16">{t('quiz.speed', { value: speed.toFixed(1) })}</span>
                <input
                  type="range" min={0.5} max={2} step={0.1} value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="flex-1 accent-blue-500"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 dark:text-gray-400 w-16">{t('quiz.volume', { value: (volume * 100).toFixed(0) })}</span>
                <input
                  type="range" min={0} max={1} step={0.05} value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="flex-1 accent-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Word card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 mb-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md font-medium uppercase">
              {current.language}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {t('quiz.wrongPronounce', { wrong: wrongCountRef.current, pronounce: pronounceCountRef.current })}
            </span>
          </div>

          <div className="mb-2 min-h-[24px]">
            {enableEnMask ? (
              <button onClick={handleToggleEnMask} className="text-sm text-gray-400 dark:text-gray-500 italic underline">
                {t('quiz.showEnTranslation')}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-sm text-blue-500 font-medium">{current.translateEn}</p>
                <button onClick={handleToggleEnMask} className="text-xs text-gray-300 dark:text-gray-600 hover:text-gray-500" title="Mask EN">
                  👁
                </button>
              </div>
            )}
          </div>

          {current.translateCh && (
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-2">{current.translateCh}</p>
          )}

          {displaySentence && current.word && (
            <div className="mt-2 min-h-[20px]">
              {enableSentenceMask ? (
                <button onClick={handleToggleSentenceMask} className="text-xs text-gray-400 dark:text-gray-500 italic underline">
                  {t('quiz.showSentence')}
                </button>
              ) : (
                <div className="flex items-start gap-2">
                  <SentenceRenderer text={displaySentence} className="text-xs text-gray-500 dark:text-gray-400 italic leading-relaxed flex-1" />
                  <button onClick={handleToggleSentenceMask} className="text-xs text-gray-300 dark:text-gray-600 hover:text-gray-500 flex-shrink-0" title="Mask sentence">
                    👁
                  </button>
                </div>
              )}
            </div>
          )}

          {/* AI buttons */}
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <div className="flex gap-2 mb-2">
              <button
                onClick={handleAiInsight}
                disabled={aiInsight.loading}
                className="flex-1 py-1.5 text-xs font-semibold rounded-xl border border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 disabled:opacity-50 transition-colors"
              >
                {aiInsight.loading ? t('llm.thinking') : t('llm.insight')}
              </button>
              <button
                onClick={handleAiSample}
                disabled={aiSample.loading}
                className="flex-1 py-1.5 text-xs font-semibold rounded-xl border border-cyan-200 dark:border-cyan-800 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 disabled:opacity-50 transition-colors"
              >
                {aiSample.loading ? t('llm.thinking') : t('llm.sampleSentence')}
              </button>
            </div>

            {(aiInsight.text || aiInsight.error) && (
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-2.5 mb-2">
                {aiInsight.error ? (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-red-400 flex-1">{t('llm.error')}</p>
                    <button onClick={() => aiInsight.retry(String(current.id), () => getWordInsight(current.word || current.sentence || '', current.translateEn || '', current.translateCh || '', i18n.language, current.language || 'en'))} className="text-xs text-blue-400 underline">↺</button>
                  </div>
                ) : (
                  <p className="text-xs text-purple-700 dark:text-purple-200 leading-relaxed whitespace-pre-wrap">{aiInsight.text}</p>
                )}
              </div>
            )}

            {(aiSample.text || aiSample.error) && (
              <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-xl p-2.5">
                {aiSample.error ? (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-red-400 flex-1">{t('llm.error')}</p>
                    <button onClick={() => aiSample.retry(String(current.id), () => getSampleSentence(current.word || current.sentence || '', current.translateEn || '', i18n.language, current.language || 'en'))} className="text-xs text-blue-400 underline">↺</button>
                  </div>
                ) : (
                  <p className="text-xs text-cyan-700 dark:text-cyan-200 leading-relaxed whitespace-pre-wrap">{aiSample.text}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Answer input */}
        {isJpButtonMode ? (
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 mb-4 shadow-sm">
            {/* Grid content — always in DOM so height never changes during success flash */}
            <div className={showJpSuccess ? 'invisible' : ''}>
              {/* Built-answer slots */}
              <div className="flex flex-wrap gap-1.5 mb-3 min-h-[2.5rem] items-center">
                {kanaGroups.map((_, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center justify-center min-w-[2.25rem] h-9 px-1.5 rounded-lg text-base font-bold border-2 transition-colors ${
                      i < builtAnswer.length
                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200'
                        : 'border-dashed border-gray-300 dark:border-gray-600 text-transparent select-none'
                    }`}
                  >
                    {i < builtAnswer.length ? builtAnswer[i] : '　'}
                  </span>
                ))}
                {builtAnswer.length > 0 && (
                  <button
                    onClick={() => { setBuiltAnswer((p) => p.slice(0, -1)); setBuiltAnswerIndices((p) => p.slice(0, -1)); }}
                    className="h-9 px-2.5 rounded-lg border-2 border-gray-200 dark:border-gray-600 text-gray-400 hover:text-red-400 hover:border-red-300 transition-colors text-sm font-medium"
                  >⌫</button>
                )}
              </div>
              {/* Shuffled kana buttons labeled 1–9 */}
              {(() => {
                const usedKanaIndices = new Set(builtAnswerIndices);
                return (
                  <div className="grid grid-cols-3 gap-2">
                    {kanaGroups.map((group, i) => (
                      usedKanaIndices.has(i) ? (
                        <div key={i} className="h-12" aria-hidden="true" />
                      ) : (
                        <button
                          key={i}
                          onClick={() => handleKanaClick(i)}
                          className="relative flex items-center justify-center h-12 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 active:scale-95 transition-all"
                        >
                          <span className="absolute top-0.5 left-1.5 text-[10px] font-mono text-gray-400 dark:text-gray-500">{i + 1}</span>
                          <span className="text-lg font-bold text-gray-800 dark:text-gray-100">{group}</span>
                        </button>
                      )
                    ))}
                  </div>
                );
              })()}
            </div>
            {/* 2-second success flash — absolute overlay so container height is unchanged */}
            {showJpSuccess && (
              <div className="absolute inset-0 rounded-2xl bg-white dark:bg-gray-800 flex flex-col items-center justify-center gap-1 pointer-events-none">
                <span className="text-green-500 text-xl font-bold">✓</span>
                <p className="text-2xl font-bold text-gray-800 dark:text-gray-100 tracking-wide">
                  {(current.word || '').replace(/\[.*?\]/g, '').replace(/\s+/g, '')}
                </p>
                <p className="text-sm text-gray-400 dark:text-gray-500 tracking-widest">
                  {extractKanaAnswer(current.word || '')}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 mb-4 shadow-sm">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-2">{t('quiz.yourAnswer')}</label>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={japaneseMode ? t('quiz.placeholderJapanese') : t('quiz.placeholderDefault')}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full text-base border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-400 rounded-xl px-4 py-3 outline-none transition-colors"
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={handlePronounce}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors shadow-sm flex items-center justify-center gap-1.5"
          >
            <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
            </svg>
            {t('quiz.pronounce')}
          </button>

          <button
            onClick={handleRevealAnswer}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors shadow-sm"
          >
            {t('quiz.reveal')}
          </button>

          <button
            onClick={() => goNext(current)}
            className="bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-sm font-bold py-3 rounded-xl transition-colors shadow-md"
          >
            {t('quiz.skip')}
          </button>
        </div>
      </main>
    </div>
  );
};

export default VocabularyQuizPage;
