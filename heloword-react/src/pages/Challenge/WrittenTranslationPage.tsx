import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { latexToUnicode } from '../../utils/latexToUnicode';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import { aiAnalyzeTranslation } from '../../services/scramble.service';

// ── Types ──────────────────────────────────────────────────────────────────

interface JpSentence {
  id: string;
  japanese: string;
  chunks: string[];
  translation: string;
  english: string;
  difficulty: string;
  tags: string[];
}

interface EnSentence {
  id: number;
  translate_ch: string;
  sentence: string;
}

type Lang = 'jp' | 'en';
type Difficulty = 'easy' | 'medium' | 'hard';
type SubmitState = 'idle' | 'compared' | 'ai-loading' | 'ai-done' | 'ai-error';

const HINT_COUNTS: Record<Difficulty, number> = { easy: 5, medium: 3, hard: 0 };

// ── Helpers ────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickHints(answer: string, lang: Lang, chunks: string[] | undefined, count: number): string[] {
  if (count === 0) return [];
  const pool = lang === 'jp' && chunks?.length
    ? chunks
    : answer.trim().split(/\s+/).filter(Boolean);
  return shuffle(pool).slice(0, Math.min(count, pool.length));
}

function scoreAnswer(userInput: string, answer: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^\w\s\u3000-\u9fff\u30a0-\u30ff]/g, '').trim();
  const userNorm = normalize(userInput);
  const ansNorm = normalize(answer);
  if (userNorm === ansNorm) return 100;
  // Word-overlap scoring
  const userWords = new Set(userNorm.split(/\s+/).filter(Boolean));
  const ansWords = ansNorm.split(/\s+/).filter(Boolean);
  if (ansWords.length === 0) return 0;
  const matches = ansWords.filter(w => userWords.has(w)).length;
  return Math.round((matches / ansWords.length) * 100);
}

function scoreColor(score: number): string {
  if (score >= 90) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

// ── Sub-components ─────────────────────────────────────────────────────────

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

// ── Main Page ──────────────────────────────────────────────────────────────

const WrittenTranslationPage: React.FC = () => {
  const { t } = useTranslation();
  const { isLoggedIn } = useAuth();
  const location = useLocation();

  const initialLang: Lang = (location.state as { lang?: Lang } | null)?.lang ?? 'jp';
  const [lang, setLang] = useState<Lang>(initialLang);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

  const [currentJp, setCurrentJp] = useState<JpSentence | null>(null);
  const [currentEn, setCurrentEn] = useState<EnSentence | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [userInput, setUserInput] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [aiResult, setAiResult] = useState('');
  const [dataLoading, setDataLoading] = useState(false);

  const jpDataRef = useRef<JpSentence[] | null>(null);
  const enDataRef = useRef<EnSentence[] | null>(null);

  // ── Load sentence ──────────────────────────────────────────────────────

  const loadSentence = useCallback(async () => {
    setUserInput('');
    setScore(null);
    setShowAnswer(false);
    setSubmitState('idle');
    setAiResult('');

    if (lang === 'jp') {
      if (!jpDataRef.current) {
        setDataLoading(true);
        const mod = await import('../../data/scramble-jp.json');
        jpDataRef.current = mod.default as JpSentence[];
        setDataLoading(false);
      }
      const pool = jpDataRef.current;
      const item = pool[Math.floor(Math.random() * pool.length)];
      setCurrentJp(item);
      setCurrentEn(null);
      setHints(pickHints(item.japanese, 'jp', item.chunks, HINT_COUNTS[difficulty]));
    } else {
      if (!enDataRef.current) {
        setDataLoading(true);
        const mod = await import('../../data/scramble-en.json');
        enDataRef.current = mod.default as EnSentence[];
        setDataLoading(false);
      }
      const pool = enDataRef.current;
      const item = pool[Math.floor(Math.random() * pool.length)];
      setCurrentEn(item);
      setCurrentJp(null);
      setHints(pickHints(item.sentence, 'en', undefined, HINT_COUNTS[difficulty]));
    }
  }, [lang, difficulty]);

  useEffect(() => { loadSentence(); }, [loadSentence]);

  // ── Actions ────────────────────────────────────────────────────────────

  const handleCompare = () => {
    const answer = lang === 'jp' ? currentJp?.japanese : currentEn?.sentence;
    if (!answer || !userInput.trim()) return;
    const s = scoreAnswer(userInput, answer);
    setScore(s);
    setShowAnswer(true);
    setSubmitState('compared');
  };

  const handleAiAnalyze = async () => {
    const answer = lang === 'jp' ? currentJp?.japanese : currentEn?.sentence;
    const translation = lang === 'jp' ? currentJp?.translation : currentEn?.translate_ch;
    if (!answer || !userInput.trim()) return;

    setSubmitState('ai-loading');
    setAiResult('');
    setShowAnswer(true);
    try {
      const result = await aiAnalyzeTranslation({ lang, answer, userInput, translation: translation ?? '' });
      setAiResult(result);
      setSubmitState('ai-done');
    } catch {
      setAiResult(t('writtenTranslation.aiError'));
      setSubmitState('ai-error');
    }
  };

  const handleShowAnswer = () => {
    setShowAnswer(true);
  };

  const refreshHints = () => {
    const answer = lang === 'jp' ? currentJp?.japanese : currentEn?.sentence;
    if (!answer) return;
    const chunks = lang === 'jp' ? currentJp?.chunks : undefined;
    setHints(pickHints(answer, lang, chunks, HINT_COUNTS[difficulty]));
  };

  // ── Derived ────────────────────────────────────────────────────────────

  const chineseTranslation = lang === 'jp' ? currentJp?.translation : currentEn?.translate_ch;
  const englishMeaning = lang === 'jp' ? currentJp?.english : null;
  const correctAnswer = lang === 'jp' ? currentJp?.japanese : currentEn?.sentence;

  const difficultyStyles: Record<Difficulty, string> = {
    easy: 'bg-green-500 text-white',
    medium: 'bg-blue-500 text-white',
    hard: 'bg-red-500 text-white',
  };
  const difficultyInactive = 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300';

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title={t('writtenTranslation.title')} showBack />
      <main className="flex-1 pb-24 px-4 pt-4 max-w-2xl mx-auto w-full space-y-3">

        {/* Language toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          {(['jp', 'en'] as Lang[]).map(l => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
                lang === l
                  ? 'bg-blue-500 text-white'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              {l === 'jp' ? '🇯🇵 Japanese' : '🇬🇧 English'}
            </button>
          ))}

          {/* Difficulty */}
          <div className="flex items-center gap-1.5 ml-auto">
            {(['easy', 'medium', 'hard'] as Difficulty[]).map(d => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition-colors ${
                  difficulty === d ? difficultyStyles[d] : difficultyInactive
                }`}
              >
                {t(`writtenTranslation.difficulty.${d}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Question card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          {dataLoading ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">{t('common.loading')}</p>
          ) : (
            <>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{t('writtenTranslation.chinesePrompt')}</p>
              <p className="text-base font-medium text-gray-800 dark:text-gray-100 leading-relaxed">
                {chineseTranslation ?? '…'}
              </p>
              {englishMeaning && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">{englishMeaning}</p>
              )}
            </>
          )}
        </div>

        {/* Hint chips */}
        {hints.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                {t('writtenTranslation.hints')}
              </p>
              <button
                onClick={refreshHints}
                className="text-xs text-blue-400 hover:text-blue-600 transition-colors"
              >
                🔀
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {hints.map((h, i) => (
                <span
                  key={i}
                  className="px-3 py-1 rounded-xl text-sm bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-medium"
                >
                  {h}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Input area */}
        <div>
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5 px-1">
            {lang === 'jp' ? t('writtenTranslation.typeJapanese') : t('writtenTranslation.typeEnglish')}
          </p>
          <textarea
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            placeholder={lang === 'jp' ? t('writtenTranslation.placeholderJp') : t('writtenTranslation.placeholderEn')}
            rows={3}
            className="w-full rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-sm px-4 py-3 resize-none focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors placeholder-gray-300 dark:placeholder-gray-600"
          />
        </div>

        {/* Submit buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleCompare}
            disabled={!userInput.trim() || dataLoading}
            className="py-3 rounded-2xl text-sm font-semibold bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white transition-colors"
          >
            📊 {t('writtenTranslation.compare')}
          </button>
          <div className="relative">
            <button
              onClick={isLoggedIn ? handleAiAnalyze : undefined}
              disabled={submitState === 'ai-loading' || !userInput.trim() || dataLoading}
              className={`w-full py-3 rounded-2xl text-sm font-semibold transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5 ${
                isLoggedIn
                  ? 'text-white'
                  : 'text-white opacity-80 cursor-not-allowed'
              }`}
              style={{ background: 'linear-gradient(135deg, #6c5ce7, #a29bfe)' }}
            >
              <span>✨</span>
              <span>{t('writtenTranslation.aiAnalyze')}</span>
              {!isLoggedIn && (
                <span className="text-[10px] opacity-75 hidden sm:inline">({t('scramble.loginRequired')})</span>
              )}
            </button>
            {!isLoggedIn && (
              <a
                href="/login"
                className="absolute inset-0 flex items-center justify-center rounded-2xl"
                onClick={e => e.stopPropagation()}
              >
                <span className="sr-only">{t('common.login')}</span>
              </a>
            )}
          </div>
        </div>

        {/* Show answer / next controls */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleShowAnswer}
            disabled={showAnswer}
            className="py-2 rounded-xl text-sm font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-900/50 disabled:opacity-40 transition-colors"
          >
            👁 {t('scramble.showAnswer')}
          </button>
          <button
            onClick={loadSentence}
            className="py-2 rounded-xl text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            ⏭ {t('scramble.next')}
          </button>
        </div>

        {/* Not logged in hint for AI button */}
        {!isLoggedIn && (
          <p className="text-xs text-center text-gray-400 dark:text-gray-500">
            ✨ {t('writtenTranslation.aiLoginHint')}{' '}
            <a href="/login" className="text-blue-500 underline">{t('common.login')}</a>
          </p>
        )}

        {/* Result panel */}
        {(showAnswer || submitState !== 'idle') && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4 shadow-sm space-y-3">

            {/* Score (compare mode) */}
            {score !== null && (
              <div className="flex items-center gap-3">
                <div className={`text-3xl font-black ${scoreColor(score)}`}>{score}%</div>
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        score >= 90 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {score >= 90 ? t('writtenTranslation.scoreExcellent')
                      : score >= 60 ? t('writtenTranslation.scoreGood')
                      : t('writtenTranslation.scoreTryAgain')}
                  </p>
                </div>
              </div>
            )}

            {/* Correct answer */}
            {showAnswer && correctAnswer && (
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">
                  {t('writtenTranslation.correctAnswer')}
                </p>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-relaxed bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-3 py-2">
                  {correctAnswer}
                </p>
              </div>
            )}

            {/* AI analysis */}
            {(submitState === 'ai-loading' || submitState === 'ai-done' || submitState === 'ai-error') && (
              <div>
                <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-2">
                  ✨ {t('writtenTranslation.aiAnalysis')}
                </p>
                {submitState === 'ai-loading' ? (
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
          </div>
        )}

      </main>
    </div>
  );
};

export default WrittenTranslationPage;
