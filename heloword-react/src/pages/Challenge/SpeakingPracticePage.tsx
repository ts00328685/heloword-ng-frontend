import React, { useCallback, useEffect, useRef, useState } from 'react';
import TapToLookup from '../../components/TapToLookup';
import ReactDOM from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { cancelPronouncing, speakSentence } from '../../services/tts.service';
import { useAuth } from '../../contexts/AuthContext';
import { aiExplainScramble } from '../../services/scramble.service';
import { aiErrorMessage } from '../../utils/aiError';
import { useDailyGoal } from '../../contexts/DailyGoalContext';
import { AiDisclosure, PracticeActions, PracticeTopBar, SheetSection, SwitchRow } from '../../components/ui/practice';
import EnDifficultyFilter, { applyEnDifficultyFilter, EN_DIFFICULTIES, EnDifficulty } from '../../components/EnDifficultyFilter';
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
  if (score >= 90) return { labelKey: 'speakingGame.scoreExcellent', color: 'text-success', barColor: 'bg-success' };
  if (score >= 70) return { labelKey: 'speakingGame.scoreGood',      color: 'text-accent',   barColor: 'bg-ink' };
  if (score >= 50) return { labelKey: 'speakingGame.scoreKeepUp',    color: 'text-accent', barColor: 'bg-ink' };
  return             { labelKey: 'speakingGame.scoreTryAgain',  color: 'text-danger',    barColor: 'bg-danger' };
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
      h1: ({ children }) => <p className="text-base font-semibold text-ink mt-3">{children}</p>,
      h2: ({ children }) => <p className="text-sm font-semibold text-ink mt-2">{children}</p>,
      h3: ({ children }) => <p className="text-sm font-semibold text-ink mt-2">{children}</p>,
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
              ? 'text-success font-medium'
              : 'text-danger'
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
  const { incrementProgress } = useDailyGoal();
  const dataRef = useRef<EnSentence[] | null>(null);
  const [enDifficulties, setEnDifficulties] = useState<EnDifficulty[]>([...EN_DIFFICULTIES]);

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

  // Intro modal — shown once on entry
  const [showIntro, setShowIntro] = useState(true);

  // Settings (persisted)
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
      setSentences(shuffle(applyEnDifficultyFilter(dataRef.current, enDifficulties)));
      setCurrentIndex(0);
      setGameState('ready');
    };
    load();
    return () => {
      cancelPronouncing();
      recognitionRef.current?.abort();
    };
  }, [enDifficulties]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── TTS sequence ─────────────────────────────────────────────────────────

  const playTTSSequence = useCallback((sentence: EnSentence) => {
    if (!('speechSynthesis' in window) || (!readChinese && !readEnglish)) {
      setGameState('recording');
      return;
    }
    window.speechSynthesis.cancel();

    if (readChinese && readEnglish) {
      setGameState('tts-ch');
      speakSentence(sentence.translate_ch, 'zh-TW', {}, () => {
        setGameState('tts-en');
        setTimeout(() => speakSentence(sentence.sentence, 'en-US', {}, () => setGameState('recording')), 500);
      });
    } else if (readChinese) {
      setGameState('tts-ch');
      speakSentence(sentence.translate_ch, 'zh-TW', {}, () => setGameState('recording'));
    } else {
      setGameState('tts-en');
      speakSentence(sentence.sentence, 'en-US', {}, () => setGameState('recording'));
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
      const s = scoreAnswer(spoken, currentSentence.sentence);
      setScore(s);
      setGameState('result');
      setIsListening(false);
      incrementProgress('english', 'spokenSentences', s);
    };
    rec.onerror = () => {
      setRecError(t('speakingGame.noSpeechDetected'));
      setIsListening(false);
    };
    rec.onend = () => setIsListening(false);

    rec.start();
    setIsListening(true);
  }, [SR, currentSentence, incrementProgress]);

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
    if (!currentSentence) return;
    setShowAiPanel(true);
    setAiLoading(true);
    setAiResult('');
    try {
      const result = await aiExplainScramble({ lang: 'en', sentence: currentSentence.sentence, translation: currentSentence.translate_ch });
      setAiResult(result);
    } catch (e) {
      setAiResult((e as Error)?.message?.startsWith('AI_') ? aiErrorMessage(e, isLoggedIn) : t('scramble.aiError'));
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
      <div className="flex flex-col min-h-screen bg-paper">
        <Header title={t('speakingGame.enTitle')} showBack />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-[3px] border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const isTtsPlaying = gameState === 'tts-ch' || gameState === 'tts-en';
  const { labelKey, color, barColor } = scoreInfo(score);
  const spokenWordSet = new Set(normalizeWords(spokenText));

  return (
    <div className="flex flex-col min-h-screen bg-paper animate-page-enter">
      <Header title={t('speakingGame.enTitle')} showBack />

      <main className="flex-1 pb-24 px-4 pt-5 max-w-xl mx-auto w-full flex flex-col gap-4">

        <PracticeTopBar
          left={<span className="text-xs text-ink-faint tabular-nums">{currentIndex + 1} / {sentences.length}</span>}
          settings={
            <>
              <SheetSection title={t('common.filters')}>
                <EnDifficultyFilter selected={enDifficulties} onChange={setEnDifficulties} />
              </SheetSection>
              <SheetSection title={t('common.preferences')}>
                <SwitchRow label={t('speakingGame.toggleReadChinese')} sub={t('speakingGame.toggleReadChineseSub')} checked={readChinese} onChange={togglePref('hw-sp-read-ch', setReadChinese)} />
                <SwitchRow label={t('speakingGame.toggleReadEnglish')} sub={t('speakingGame.toggleReadEnglishSub')} checked={readEnglish} onChange={togglePref('hw-sp-read-en', setReadEnglish)} />
                <SwitchRow label={t('speakingGame.toggleAutoRecord')} sub={t('speakingGame.toggleAutoRecordSub')} checked={autoRecord} onChange={togglePref('hw-sp-auto-rec', setAutoRecord)} />
                <SwitchRow label={t('speakingGame.toggleAutoAdvance')} sub={t('speakingGame.toggleAutoAdvanceSub')} checked={autoAdvance} onChange={togglePref('hw-sp-auto-adv', setAutoAdvance)} />
              </SheetSection>
            </>
          }
        />

        {/* Chinese translation */}
        <div className="bg-surface rounded-2xl p-5 shadow-sm border border-line">
          <p className="text-[11px] font-medium text-ink-faint uppercase tracking-wide mb-2">
            {t('speakingGame.sectionChTranslation')}
          </p>
          <p className="text-xl font-medium text-ink leading-relaxed">
            {currentSentence.translate_ch}
          </p>
        </div>

        {/* English sentence */}
        <div className="bg-surface rounded-2xl p-5 shadow-sm border border-line">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-medium text-ink-faint uppercase tracking-wide">
              {t('speakingGame.sectionEnSentence')}
            </p>
            <div className="flex items-center gap-1">
            <button
              onClick={togglePref('hw-sp-show-en', setShowEnglish)}
              className={`p-1.5 rounded-md transition-colors ${showEnglish ? 'text-ink-muted hover:text-ink' : 'text-accent'}`}
              aria-label={showEnglish ? t('speakingGame.hideEnBtn') : t('speakingGame.showEnBtn')}
              title={showEnglish ? t('speakingGame.hideEnBtn') : t('speakingGame.showEnBtn')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
            <button
              onClick={replayTTS}
              disabled={isTtsPlaying || (!readChinese && !readEnglish)}
              title={t('speakingGame.replayTitle')}
              className="p-1.5 rounded-lg text-ink-faint hover:text-accent disabled:opacity-40 transition-colors"
            >
              <svg
                className={`w-4 h-4 ${isTtsPlaying ? 'animate-pulse text-accent' : ''}`}
                fill="currentColor" viewBox="0 0 20 20"
              >
                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
              </svg>
            </button>
            </div>
          </div>

          {showEnglish ? (
            <p className="text-lg font-medium text-accent leading-relaxed">
              {currentSentence.sentence}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1 items-center">
              {currentSentence.sentence.split(/\s+/).map((_, i) => (
                <div
                  key={i}
                  className="h-1.5 rounded-full bg-ink/10"
                  style={{ width: `${20 + (i * 7 + 13) % 18}px` }}
                />
              ))}
              <span className="text-xs text-ink-faint ml-1">{t('speakingGame.hiddenSentence')}</span>
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
                  className="w-1 bg-ink rounded-full animate-bounce"
                  style={{ height: i % 2 === 0 ? '12px' : '20px', animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
            <span className="text-sm text-accent">
              {gameState === 'tts-ch' ? t('speakingGame.ttsPlayingCh') : t('speakingGame.ttsPlayingEn')}
            </span>
          </div>
        )}

        {/* Recording controls */}
        {!isTtsPlaying && gameState === 'recording' && (
          <div className="flex flex-col items-center gap-3 py-2">
            {!hasSpeechRecognition ? (
              <p className="text-sm text-danger text-center">
                {t('speakingGame.noSpeechRecognition')}
              </p>
            ) : (
              <>
                <p className="text-sm text-ink-muted">
                  {isListening ? t('speakingGame.recordingEn') : t('speakingGame.tapToSpeak')}
                </p>
                <button
                  onClick={isListening ? stopRecording : startRecording}
                  className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 ${
                    isListening
                      ? 'bg-danger hover:bg-danger/90 scale-110'
                      : 'bg-ink hover:bg-ink/85 '
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
                        className="w-1 bg-danger rounded-full animate-bounce"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </div>
                )}
                {recError && <p className="text-xs text-danger text-center">{recError}</p>}
              </>
            )}
          </div>
        )}

        {/* Result card */}
        {gameState === 'result' && (
          <div className="bg-surface rounded-2xl p-5 shadow-sm border border-line flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className={`text-lg font-semibold ${color}`}>{t(labelKey)}</span>
              <span className={`text-3xl font-semibold ${color}`}>
                {score}<span className="text-base font-medium ml-0.5">{t('speakingGame.scoreUnit')}</span>
              </span>
            </div>

            <div className="h-2 bg-ink/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                style={{ width: `${score}%` }}
              />
            </div>

            <div>
              <p className="text-[11px] text-ink-faint mb-1">{t('speakingGame.youSaid')}</p>
              <p className="text-sm text-ink bg-paper rounded-xl px-3 py-2 leading-relaxed">
                {spokenText || t('speakingGame.noAudioDetected')}
              </p>
            </div>

            <div>
              <p className="text-[11px] text-ink-faint mb-1">{t('speakingGame.correctAnswer')}</p>
              <p className="text-sm bg-paper rounded-xl px-3 py-2 leading-relaxed">
                <HighlightedSentence sentence={currentSentence.sentence} spokenSet={spokenWordSet} />
              </p>
            </div>

          </div>
        )}

        {!isTtsPlaying && (
          <PracticeActions
            secondary={gameState === 'result'
              ? { label: t('speakingGame.retryBtn'), onClick: () => { setGameState('recording'); setSpokenText(''); setScore(0); setRecError(null); } }
              : undefined}
            primary={gameState === 'result'
              ? { label: autoAdvance ? t('speakingGame.nextBtnCountdown', { n: countdown }) : t('speakingGame.nextBtn'), onClick: nextQuestion }
              : { label: t('common.skip'), onClick: nextQuestion, emphasis: false }}
          />
        )}

        <AiDisclosure
          label={t('scramble.aiExplain')}
          analytics="ai.scramble_explain"
          open={showAiPanel}
          loading={aiLoading}
          loadingText={t('scramble.aiThinking')}
          onToggle={() => (showAiPanel ? setShowAiPanel(false) : aiResult ? setShowAiPanel(true) : handleAiExplain())}
        >
          <div className="text-sm text-ink leading-relaxed space-y-2">
            <TapToLookup as="div"><AiMarkdown text={aiResult} /></TapToLookup>
          </div>
        </AiDisclosure>

      </main>

      {/* Intro modal — portaled to body so it renders above the bottom tabs */}
      {showIntro && ReactDOM.createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4">
          <div className="bg-surface rounded-2xl p-6 w-full sm:max-w-sm shadow-xl flex flex-col items-center gap-4 mb-4 sm:mb-0">
            {/* Icon */}
            <div className="w-16 h-16 rounded-full bg-accent-soft flex items-center justify-center">
              <svg className="w-8 h-8 text-accent" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-center space-y-3">
              <h3 className="text-base font-semibold text-ink">
                {t('speakingGame.enTitle')}
              </h3>
              <p className="text-sm text-ink-muted leading-relaxed" style={{ whiteSpace: 'pre-line' }}>
                {t('speakingGame.introBody')}
              </p>
              <p className="text-xs text-ink-faint">
                {t('speakingGame.introSettingsTip')}
              </p>
              <p className="text-xs text-ink-faint">
                {t('speakingGame.chromeRecommendation')}
              </p>
            </div>
            <button
              onClick={() => setShowIntro(false)}
              className="w-full py-3 rounded-xl bg-ink hover:bg-ink/85 text-paper text-sm font-medium transition-colors"
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
