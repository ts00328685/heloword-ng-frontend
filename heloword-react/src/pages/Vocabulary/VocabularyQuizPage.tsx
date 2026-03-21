import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import SentenceRenderer from '../../components/SentenceRenderer';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useUI } from '../../contexts/UIContext';
import { QuizSetting, Sentence } from '../../models';
import { doPost } from '../../services/api.service';

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
  const { isLoggedIn } = useAuth();
  const { wordStore, sentenceStore } = useData();
  const { showToast, showAlert } = useUI();

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

  const settingIdMapRef = useRef<Map<string, number>>(new Map());
  const quizSettingsRef = useRef<Record<string, QuizSetting>>({});

  useEffect(() => {
    const quizSettings: Record<string, QuizSetting> = location.state?.quizSettings;
    const finishedIdMap: Record<string, number[]> = location.state?.finishedIdMap || {};

    if (!quizSettings || Object.keys(quizSettings).length === 0) {
      navigate('/home', { replace: true });
      return;
    }

    quizSettingsRef.current = quizSettings;
    showAlert('Note that if you type the wrong answer or reveal the answer in any way, this word will show up again later for a retest!');
    saveQuizSettings(quizSettings);
    initWordList(quizSettings, finishedIdMap);
  }, []);

  useEffect(() => {
    if (autoInputFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentIndex, autoInputFocus]);

  const saveQuizSettings = async (quizSettings: Record<string, QuizSetting>) => {
    if (!isLoggedIn) return;

    const settingList = Object.keys(quizSettings).map((k) => ({ _key: k, ...quizSettings[k] }));
    const alreadyPersisted = settingList.some((s) => !!s.id);
    if (alreadyPersisted) {
      settingList.forEach((s) => settingIdMapRef.current.set(s.tableName, s.id!));
      return;
    }

    try {
      const response = await doPost('/frontend-api/api/fe/quiz/save-setting-records', settingList);
      settingList.forEach((s, idx) => {
        settingIdMapRef.current.set(s.tableName, response.data.ids[idx]);
      });
    } catch {
      // Non-critical
    }
  };

  const saveSingleRecord = useCallback(
    async (word: Sentence) => {
      if (!isLoggedIn || word.recordSaved) return;
      word.recordSaved = true;

      const currentTime = new Date();
      const timeSpent = (currentTime.getTime() - startTimeRef.current.getTime()) / 1000;
      const settingId = settingIdMapRef.current.get(word.tableName || '');

      try {
        await doPost('/frontend-api/api/fe/quiz/save-single-record', {
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
        });
      } catch {
        // Non-critical
      }
    },
    [isLoggedIn, currentIndex]
  );

  const initWordList = (
    quizSettings: Record<string, QuizSetting>,
    finishedIdMap: Record<string, number[]>
  ) => {
    const combined: Record<string, Sentence[]> = { ...wordStore, ...sentenceStore } as any;
    let list: Sentence[] = [];

    Object.keys(quizSettings).forEach((key) => {
      if (!combined[key]) return;
      const s = quizSettings[key];
      const min = (s.min ?? 1) - 1;
      const max = s.max ?? combined[key].length;
      list = [...list, ...combined[key].slice(min, max)];
    });

    list = list.sort(() => Math.random() - 0.5);

    if (list.length === 0) {
      navigate('/home', { replace: true });
      return;
    }

    const hasFinished = Object.keys(finishedIdMap).length > 0;
    if (hasFinished) {
      list = list.filter((word) => {
        const settingId = settingIdMapRef.current.get(word.tableName || '');
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
      showToast(`Correct Answer: ${ans}`, 700, 'bottom');
    }
  };

  const goNext = useCallback(
    (current: Sentence) => {
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
        showToast('Finished! 🎉');
        navigate('/home', { replace: true });
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
    ]
  );

  const handleRevealAnswer = () => {
    wrongCountRef.current += 5;
    const current = wordList[0];
    if (!current) return;
    let ans = getRawAnswer(current);
    if (japaneseMode && current.language === 'jp') {
      const { ansKanjiFirst, ansKataFirst } = getJpAnswers(ans);
      ans = `${ansKanjiFirst} or ${ansKataFirst}`;
    }
    showToast(`Correct Answer: ${ans}`, 2000, 'bottom');
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

  if (!current) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading quiz...</p>
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
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">Quiz Options</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Auto Pronounce', val: autoPronounce, set: setAutoPronounce },
                { label: 'Pronounce EN', val: autoPronounceEn, set: setAutoPronounceEn },
                { label: 'Pronounce CH', val: autoPronounceCh, set: setAutoPronounceCh },
                { label: 'Pronounce Sentence', val: autoPronounceSentence, set: setAutoPronounceSentence },
                { label: 'Auto Focus', val: autoInputFocus, set: setAutoInputFocus },
                { label: 'Japanese Mode', val: japaneseMode, set: setJapaneseMode },
                { label: 'Fail w/o Mask', val: failWhenMaskOff, set: setFailWhenMaskOff },
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
                <span className="text-xs text-gray-500 dark:text-gray-400 w-16">Speed: {speed.toFixed(1)}</span>
                <input
                  type="range" min={0.5} max={2} step={0.1} value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="flex-1 accent-blue-500"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 dark:text-gray-400 w-16">Volume: {(volume * 100).toFixed(0)}%</span>
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
              Wrong: {wrongCountRef.current} · Pronounce: {pronounceCountRef.current}
            </span>
          </div>

          <div className="mb-2 min-h-[24px]">
            {enableEnMask ? (
              <button onClick={handleToggleEnMask} className="text-sm text-gray-400 dark:text-gray-500 italic underline">
                [Show EN translation]
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
                  [Show sentence]
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
        </div>

        {/* Answer input */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 mb-4 shadow-sm">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-2">Your Answer</label>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={japaneseMode ? 'Type in Japanese...' : 'Type your answer...'}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full text-base border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-400 rounded-xl px-4 py-3 outline-none transition-colors"
          />
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={handlePronounce}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors shadow-sm flex items-center justify-center gap-1.5"
          >
            <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
            </svg>
            Pronounce
          </button>

          <button
            onClick={handleRevealAnswer}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors shadow-sm"
          >
            Reveal
          </button>

          <button
            onClick={() => goNext(current)}
            className="bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-sm font-bold py-3 rounded-xl transition-colors shadow-md"
          >
            Skip →
          </button>
        </div>
      </main>
    </div>
  );
};

export default VocabularyQuizPage;
