import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { cancelPronouncing, speakSentence } from '../../services/tts.service';
import { useAuth } from '../../contexts/AuthContext';
import { aiExplainScramble } from '../../services/scramble.service';
import { latexToUnicode } from '../../utils/latexToUnicode';

// ── Types ──────────────────────────────────────────────────────────────────

interface EnSentence {
  id: number;
  translate_ch: string;
  sentence: string;
}

type GameState = 'loading' | 'ready' | 'tts-ch' | 'tts-en' | 'recording' | 'result';


// ── Helpers ────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeWords(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s]/g, '').trim().split(/\s+/).filter(Boolean);
}

function wordEditDist(a: string[], b: string[]): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function scoreAnswer(spoken: string, correct: string): number {
  const sw = normalizeWords(spoken);
  const cw = normalizeWords(correct);
  if (cw.length === 0) return 0;
  const dist = wordEditDist(sw, cw);
  return Math.max(0, Math.round((1 - dist / Math.max(sw.length, cw.length)) * 100));
}

function scoreInfo(score: number): { labelKey: string; color: string; barColor: string } {
  if (score >= 90) return { labelKey: 'speakingGame.scoreExcellent', color: 'text-green-500', barColor: 'bg-green-400' };
  if (score >= 70) return { labelKey: 'speakingGame.scoreGood',      color: 'text-blue-500',   barColor: 'bg-blue-400' };
  if (score >= 50) return { labelKey: 'speakingGame.scoreKeepUp',    color: 'text-yellow-500', barColor: 'bg-yellow-400' };
  return             { labelKey: 'speakingGame.scoreTryAgain',  color: 'text-red-500',    barColor: 'bg-red-400' };
}

function getPref(key: string, fallback: boolean): boolean {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; }
  catch { return fallback; }
}

// ── AI Markdown renderer ───────────────────────────────────────────────────

const AiMarkdown: React.FC<{ text: string }> = ({ text }) => (
  <ReactMarkdown
    components={{
      p: ({ children }) => <p className="leading-relaxed">{children}</p>,
      h1: ({ children }) => <p className="text-base font-bold text-gray-900 dark:text-gray-100 mt-3">{children}</p>,
      h2: ({ children }) => <p className="text-sm font-bold text-gray-800 dark:text-gray-100 mt-2">{children}</p>,
      h3: ({ children }) => <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mt-2">{children}</p>,
      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      ul: ({ children }) => <ul className="list-disc list-outside pl-5 space-y-1">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal list-outside pl-5 space-y-1">{children}</ol>,
      li: ({ children }) => <li>{children}</li>,
    }}
  >
    {latexToUnicode(text)}
  </ReactMarkdown>
);

// ── Sub-components ─────────────────────────────────────────────────────────

const Toggle: React.FC<{ label: string; sub?: string; checked: boolean; onChange: () => void }> = ({
  label, sub, checked, onChange,
}) => (
  <div className="flex items-center justify-between py-2.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
    <div>
      <p className="text-sm text-gray-700 dark:text-gray-200">{label}</p>
      {sub && <p className="text-[11px] text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
    <button
      onClick={onChange}
      className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${
        checked ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <div
        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  </div>
);

const HighlightedSentence: React.FC<{ sentence: string; spokenSet: Set<string> }> = ({
  sentence, spokenSet,
}) => (
  <>
    {sentence.split(/(\s+)/).map((token, i) => {
      if (/^\s+$/.test(token)) return <span key={i}>{token}</span>;
      const norm = token.toLowerCase().replace(/[^\w]/g, '');
      return (
        <span
          key={i}
          className={
            spokenSet.has(norm)
              ? 'text-green-600 dark:text-green-400 font-medium'
              : 'text-red-500 dark:text-red-400'
          }
        >
          {token}
        </span>
      );
    })}
  </>
);

// ── Main Component ─────────────────────────────────────────────────────────

const SpeakingPracticePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const dataRef = useRef<EnSentence[] | null>(null);

  // Game state
  const [sentences, setSentences] = useState<EnSentence[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [gameState, setGameState] = useState<GameState>('loading');
  const [isListening, setIsListening] = useState(false);
  const [spokenText, setSpokenText] = useState('');
  const [score, setScore] = useState(0);
  const [recError, setRecError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(5);

  // AI state
  const [aiResult, setAiResult] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showLoginHint, setShowLoginHint] = useState(false);

  // Intro modal — shown once on entry
  const [showIntro, setShowIntro] = useState(true);

  // Settings (persisted)
  const [showSettings, setShowSettings] = useState(false);
  const [showEnglish, setShowEnglish]   = useState(() => getPref('hw-sp-show-en', false));
  const [readChinese, setReadChinese]   = useState(() => getPref('hw-sp-read-ch', false));
  const [readEnglish, setReadEnglish]   = useState(() => getPref('hw-sp-read-en', true));
  const [autoRecord, setAutoRecord]     = useState(() => getPref('hw-sp-auto-rec', true));
  const [autoAdvance, setAutoAdvance]   = useState(() => getPref('hw-sp-auto-adv', false));

  const togglePref = (key: string, setter: React.Dispatch<React.SetStateAction<boolean>>) => () =>
    setter(v => { localStorage.setItem(key, JSON.stringify(!v)); return !v; });

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Increment to invalidate any in-flight countdown when the user navigates manually
  const autoAdvanceGenRef = useRef(0);
  // Track latest autoRecord value without it being a dep that re-fires the recording effect
  const autoRecordRef = useRef(autoRecord);
  useEffect(() => { autoRecordRef.current = autoRecord; }, [autoRecord]);

  const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  const hasSpeechRecognition = !!SR;
  const currentSentence = sentences[currentIndex];

  // ── Data loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      if (!dataRef.current) {
        const mod = await import('../../data/scramble-en.json');
        dataRef.current = mod.default as EnSentence[];
      }
      setSentences(shuffle(dataRef.current));
      setGameState('ready');
    };
    load();
    return () => {
      cancelPronouncing();
      recognitionRef.current?.abort();
    };
  }, []);

  // ── TTS sequence ─────────────────────────────────────────────────────────

  const playTTSSequence = useCallback((sentence: EnSentence) => {
    if (!('speechSynthesis' in window) || (!readChinese && !readEnglish)) {
      setGameState('recording');
      return;
    }
    window.speechSynthesis.cancel();

    if (readChinese && readEnglish) {
      setGameState('tts-ch');
      speakSentence(sentence.translate_ch, 'zh-TW', { speed: 0.9 }, () => {
        setGameState('tts-en');
        setTimeout(() => speakSentence(sentence.sentence, 'en-US', { speed: 0.85 }, () => setGameState('recording')), 500);
      });
    } else if (readChinese) {
      setGameState('tts-ch');
      speakSentence(sentence.translate_ch, 'zh-TW', { speed: 0.9 }, () => setGameState('recording'));
    } else {
      setGameState('tts-en');
      speakSentence(sentence.sentence, 'en-US', { speed: 0.85 }, () => setGameState('recording'));
    }
  }, [readChinese, readEnglish]);

  useEffect(() => {
    if (gameState === 'ready' && currentSentence && !showIntro) {
      playTTSSequence(currentSentence);
    }
  }, [gameState, currentSentence, playTTSSequence, showIntro]);

  // ── Recording ─────────────────────────────────────────────────────────────

  const startRecording = useCallback(() => {
    if (!SR || !currentSentence) return;
    setRecError(null);
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;

    rec.onresult = (event: SpeechRecognitionEvent) => {
      const spoken = event.results[0][0].transcript;
      setSpokenText(spoken);
      setScore(scoreAnswer(spoken, currentSentence.sentence));
      setGameState('result');
      setIsListening(false);
    };
    rec.onerror = () => {
      setRecError(t('speakingGame.noSpeechDetected'));
      setIsListening(false);
    };
    rec.onend = () => setIsListening(false);

    rec.start();
    setIsListening(true);
  }, [SR, currentSentence]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  // Auto-record: fires once when entering 'recording' state
  useEffect(() => {
    if (gameState !== 'recording') return;
    if (!autoRecordRef.current || !hasSpeechRecognition) return;
    // Small delay so TTS audio fully stops before mic opens
    const t = setTimeout(startRecording, 350);
    return () => clearTimeout(t);
  }, [gameState, startRecording, hasSpeechRecognition]);

  // ── Navigation ────────────────────────────────────────────────────────────

  const handleAiExplain = async () => {
    if (!isLoggedIn) {
      setShowLoginHint(true);
      setShowAiPanel(true);
      return;
    }
    if (!currentSentence) return;
    setShowAiPanel(true);
    setShowLoginHint(false);
    setAiLoading(true);
    setAiResult('');
    try {
      const result = await aiExplainScramble({ lang: 'en', sentence: currentSentence.sentence, translation: currentSentence.translate_ch });
      setAiResult(result);
    } catch {
      setAiResult(t('scramble.aiError'));
    } finally {
      setAiLoading(false);
    }
  };

  const nextQuestion = useCallback(() => {
    // Invalidate any in-flight countdown interval immediately
    autoAdvanceGenRef.current += 1;
    if (autoAdvanceTimerRef.current !== null) {
      clearInterval(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    cancelPronouncing();
    recognitionRef.current?.abort();
    setIsListening(false);
    setSpokenText('');
    setScore(0);
    setRecError(null);
    setAiResult('');
    setShowAiPanel(false);
    setShowLoginHint(false);
    setCurrentIndex(prev => (prev + 1) % sentences.length);
    setGameState('ready');
  }, [sentences.length]);

  // Auto-advance countdown
  useEffect(() => {
    if (gameState !== 'result' || !autoAdvance) return;
    const gen = autoAdvanceGenRef.current; // snapshot generation for this countdown session
    setCountdown(5);
    let n = 5;
    const id = setInterval(() => {
      // If the user already navigated away, this interval is stale — discard it
      if (autoAdvanceGenRef.current !== gen) { clearInterval(id); return; }
      n -= 1;
      setCountdown(n);
      if (n <= 0) {
        clearInterval(id);
        autoAdvanceTimerRef.current = null;
        nextQuestion();
      }
    }, 1000);
    autoAdvanceTimerRef.current = id;
    return () => {
      clearInterval(id);
      autoAdvanceTimerRef.current = null;
    };
  }, [gameState, autoAdvance, nextQuestion]);

  const replayTTS = useCallback(() => {
    if (currentSentence) playTTSSequence(currentSentence);
  }, [currentSentence, playTTSSequence]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!currentSentence || gameState === 'loading') {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header title={t('speakingGame.enTitle')} showBack />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-[3px] border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const isTtsPlaying = gameState === 'tts-ch' || gameState === 'tts-en';
  const { labelKey, color, barColor } = scoreInfo(score);
  const spokenWordSet = new Set(normalizeWords(spokenText));

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 animate-page-enter">
      <Header title={t('speakingGame.enTitle')} showBack />

      <main className="flex-1 pb-24 px-4 pt-5 max-w-xl mx-auto w-full flex flex-col gap-4">

        {/* Top bar */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            #{currentIndex + 1} / {sentences.length}
          </span>
          <div className="flex items-center gap-2">
            {/* Hide/show English */}
            <button
              onClick={togglePref('hw-sp-show-en', setShowEnglish)}
              className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-2.5 py-1.5 transition-colors hover:border-blue-400"
            >
              <span>{showEnglish ? '👁' : '🙈'}</span>
              <span>{showEnglish ? t('speakingGame.showEnBtn') : t('speakingGame.hideEnBtn')}</span>
            </button>
            {/* Settings gear */}
            <button
              onClick={() => setShowSettings(v => !v)}
              className={`p-1.5 rounded-full border transition-colors ${
                showSettings
                  ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-500'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 hover:border-blue-400'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl px-4 py-1 shadow-sm border border-gray-100 dark:border-gray-700">
            <Toggle
              label={t('speakingGame.toggleReadChinese')}
              sub={t('speakingGame.toggleReadChineseSub')}
              checked={readChinese}
              onChange={togglePref('hw-sp-read-ch', setReadChinese)}
            />
            <Toggle
              label={t('speakingGame.toggleReadEnglish')}
              sub={t('speakingGame.toggleReadEnglishSub')}
              checked={readEnglish}
              onChange={togglePref('hw-sp-read-en', setReadEnglish)}
            />
            <Toggle
              label={t('speakingGame.toggleAutoRecord')}
              sub={t('speakingGame.toggleAutoRecordSub')}
              checked={autoRecord}
              onChange={togglePref('hw-sp-auto-rec', setAutoRecord)}
            />
            <Toggle
              label={t('speakingGame.toggleAutoAdvance')}
              sub={t('speakingGame.toggleAutoAdvanceSub')}
              checked={autoAdvance}
              onChange={togglePref('hw-sp-auto-adv', setAutoAdvance)}
            />
          </div>
        )}

        {/* Chinese translation */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
            {t('speakingGame.sectionChTranslation')}
          </p>
          <p className="text-xl font-medium text-gray-800 dark:text-gray-100 leading-relaxed">
            {currentSentence.translate_ch}
          </p>
        </div>

        {/* English sentence */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">
              {t('speakingGame.sectionEnSentence')}
            </p>
            <button
              onClick={replayTTS}
              disabled={isTtsPlaying || (!readChinese && !readEnglish)}
              title={t('speakingGame.replayTitle')}
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 disabled:opacity-40 transition-colors"
            >
              <svg
                className={`w-4 h-4 ${isTtsPlaying ? 'animate-pulse text-blue-500' : ''}`}
                fill="currentColor" viewBox="0 0 20 20"
              >
                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {showEnglish ? (
            <p className="text-lg font-medium text-blue-600 dark:text-blue-400 leading-relaxed">
              {currentSentence.sentence}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1 items-center">
              {currentSentence.sentence.split(/\s+/).map((_, i) => (
                <div
                  key={i}
                  className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-600"
                  style={{ width: `${20 + (i * 7 + 13) % 18}px` }}
                />
              ))}
              <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">{t('speakingGame.hiddenSentence')}</span>
            </div>
          )}
        </div>

        {/* TTS wave animation */}
        {isTtsPlaying && (
          <div className="flex items-center justify-center gap-2 py-1">
            <div className="flex items-end gap-0.5 h-6">
              {[0, 150, 300, 150, 0].map((delay, i) => (
                <div
                  key={i}
                  className="w-1 bg-blue-400 rounded-full animate-bounce"
                  style={{ height: i % 2 === 0 ? '12px' : '20px', animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
            <span className="text-sm text-blue-500 dark:text-blue-400">
              {gameState === 'tts-ch' ? t('speakingGame.ttsPlayingCh') : t('speakingGame.ttsPlayingEn')}
            </span>
          </div>
        )}

        {/* Recording controls */}
        {!isTtsPlaying && gameState === 'recording' && (
          <div className="flex flex-col items-center gap-3 py-2">
            {!hasSpeechRecognition ? (
              <p className="text-sm text-red-500 text-center">
                {t('speakingGame.noSpeechRecognition')}
              </p>
            ) : (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {isListening ? t('speakingGame.recordingEn') : t('speakingGame.tapToSpeak')}
                </p>
                <button
                  onClick={isListening ? stopRecording : startRecording}
                  className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 ${
                    isListening
                      ? 'bg-red-500 hover:bg-red-600 scale-110'
                      : 'bg-blue-500 hover:bg-blue-600 hover:scale-105'
                  }`}
                >
                  {isListening ? (
                    <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <rect x="5" y="5" width="10" height="10" rx="2" />
                    </svg>
                  ) : (
                    <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
                {isListening && (
                  <div className="flex items-end gap-0.5 h-5">
                    {[0, 100, 200, 300, 400].map((delay, i) => (
                      <div
                        key={i}
                        className="w-1 bg-red-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </div>
                )}
                {recError && <p className="text-xs text-red-500 text-center">{recError}</p>}
              </>
            )}
          </div>
        )}

        {/* Result card */}
        {gameState === 'result' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className={`text-lg font-semibold ${color}`}>{t(labelKey)}</span>
              <span className={`text-3xl font-bold ${color}`}>
                {score}<span className="text-base font-medium ml-0.5">{t('speakingGame.scoreUnit')}</span>
              </span>
            </div>

            <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                style={{ width: `${score}%` }}
              />
            </div>

            <div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1">{t('speakingGame.youSaid')}</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 rounded-xl px-3 py-2 leading-relaxed">
                {spokenText || t('speakingGame.noAudioDetected')}
              </p>
            </div>

            <div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1">{t('speakingGame.correctAnswer')}</p>
              <p className="text-sm bg-gray-50 dark:bg-gray-900 rounded-xl px-3 py-2 leading-relaxed">
                <HighlightedSentence sentence={currentSentence.sentence} spokenSet={spokenWordSet} />
              </p>
            </div>

            <div className="flex gap-2 mt-1">
              <button
                onClick={() => { setGameState('recording'); setSpokenText(''); setScore(0); setRecError(null); }}
                className="flex-1 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {t('speakingGame.retryBtn')}
              </button>
              <button
                onClick={nextQuestion}
                className={`flex-1 py-2.5 text-sm font-medium rounded-xl text-white transition-colors relative overflow-hidden ${
                  autoAdvance ? 'bg-blue-400' : 'bg-blue-500 hover:bg-blue-600'
                }`}
              >
                {autoAdvance ? (
                  <>
                    <div
                      className="absolute inset-0 bg-blue-600 transition-none"
                      style={{ width: `${((5 - countdown) / 5) * 100}%` }}
                    />
                    <span className="relative">{t('speakingGame.nextBtnCountdown', { n: countdown })}</span>
                  </>
                ) : (
                  t('speakingGame.nextBtn')
                )}
              </button>
            </div>
          </div>
        )}

        {/* Skip */}
        {gameState !== 'result' && !isTtsPlaying && (
          <button
            onClick={nextQuestion}
            className="w-full py-2 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            {t('speakingGame.skipBtn')}
          </button>
        )}

        {/* AI Grammar button */}
        <button
          onClick={handleAiExplain}
          disabled={aiLoading}
          className="w-full py-2.5 rounded-2xl text-sm font-semibold text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #6c5ce7, #a29bfe)' }}
        >
          <span>✨</span>
          <span>{t('scramble.aiExplain')}</span>
          {!isLoggedIn && <span className="text-xs opacity-75">({t('scramble.loginRequired')})</span>}
        </button>

        {/* AI panel */}
        {showAiPanel && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 rainbow-glow p-4 shadow-sm">
            <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-2">
              ✨ {t('scramble.aiGrammar')}
            </p>
            {showLoginHint ? (
              <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                <p>{t('scramble.aiLoginHint')}</p>
                <a href="/login" className="text-blue-500 underline text-xs">
                  {t('common.login')} →
                </a>
              </div>
            ) : aiLoading ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">
                {t('scramble.aiThinking')}
              </p>
            ) : (
              <div className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed space-y-2">
                <AiMarkdown text={aiResult} />
              </div>
            )}
          </div>
        )}

      </main>

      {/* Intro modal — portaled to body so it renders above the bottom tabs */}
      {showIntro && ReactDOM.createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full sm:max-w-sm shadow-xl flex flex-col items-center gap-4 mb-4 sm:mb-0">
            {/* Icon */}
            <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-center space-y-3">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
                {t('speakingGame.enTitle')}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed" style={{ whiteSpace: 'pre-line' }}>
                {t('speakingGame.introBody')}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                💡 {t('speakingGame.introSettingsTip')}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                🌐 {t('speakingGame.chromeRecommendation')}
              </p>
            </div>
            <button
              onClick={() => setShowIntro(false)}
              className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
            >
              {t('speakingGame.startBtn')}
            </button>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default SpeakingPracticePage;
