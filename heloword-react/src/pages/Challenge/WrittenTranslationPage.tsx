import React, { useCallback, useEffect, useRef, useState } from 'react';
import TapToLookup from '../../components/TapToLookup';
import ReactMarkdown from 'react-markdown';
import { latexToUnicode } from '../../utils/latexToUnicode';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import { aiAnalyzeTranslation } from '../../services/scramble.service';
import { aiErrorMessage } from '../../utils/aiError';
import { useDailyGoal } from '../../contexts/DailyGoalContext';
import JpSentenceFilter, { applyJpFilter } from '../../components/JpSentenceFilter';
import { BlockLabel, OptionRow, PracticeActions, PracticeTopBar, Segmented, SheetSection } from '../../components/ui/practice';
import EnDifficultyFilter, { applyEnDifficultyFilter, EN_DIFFICULTIES, EnDifficulty } from '../../components/EnDifficultyFilter';

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

  const hasCJK = /[\u3000-\u9fff]/.test(ansNorm);
  if (hasCJK) {
    // Character-based scoring for Japanese/CJK
    const userChars = new Set(userNorm.split('').filter(Boolean));
    const ansChars = ansNorm.split('').filter(Boolean);
    if (ansChars.length === 0) return 0;
    const matches = ansChars.filter(c => userChars.has(c)).length;
    return Math.round((matches / ansChars.length) * 100);
  } else {
    // Word-based scoring for English
    const userWords = new Set(userNorm.split(/\s+/).filter(Boolean));
    const ansWords = ansNorm.split(/\s+/).filter(Boolean);
    if (ansWords.length === 0) return 0;
    const matches = ansWords.filter(w => userWords.has(w)).length;
    return Math.round((matches / ansWords.length) * 100);
  }
}

function scoreColor(score: number): string {
  if (score >= 90) return 'text-success';
  if (score >= 60) return 'text-accent';
  return 'text-danger';
}

// ── Sub-components ─────────────────────────────────────────────────────────

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

// ── Main Page ──────────────────────────────────────────────────────────────

const WrittenTranslationPage: React.FC = () => {
  const { t } = useTranslation();
  const { isLoggedIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { incrementProgress } = useDailyGoal();
  const hasCountedRef = useRef(false);

  const initialLang: Lang = (location.state as { lang?: Lang } | null)?.lang ?? 'jp';
  const [lang, setLang] = useState<Lang>(initialLang);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

  // JP sentence filters
  const [filterDifficulties, setFilterDifficulties] = useState<string[]>(['easy', 'medium', 'hard']);
  const [selectedGroups, setSelectedGroups] = useState<string[] | null>(null);
  const [selectedJlpt, setSelectedJlpt] = useState<string[] | null>(null);
  // EN sentence filter
  const [enDifficulties, setEnDifficulties] = useState<EnDifficulty[]>([...EN_DIFFICULTIES]);

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
    hasCountedRef.current = false;

    if (lang === 'jp') {
      if (!jpDataRef.current) {
        setDataLoading(true);
        const mod = await import('../../data/scramble-jp.json');
        jpDataRef.current = mod.default as JpSentence[];
        setDataLoading(false);
      }
      const pool = applyJpFilter(jpDataRef.current, filterDifficulties, selectedGroups, selectedJlpt);
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
      const pool = applyEnDifficultyFilter(enDataRef.current, enDifficulties);
      const item = pool[Math.floor(Math.random() * pool.length)];
      setCurrentEn(item);
      setCurrentJp(null);
      setHints(pickHints(item.sentence, 'en', undefined, HINT_COUNTS[difficulty]));
    }
  }, [lang, difficulty, filterDifficulties, selectedGroups, selectedJlpt, enDifficulties]);

  useEffect(() => { loadSentence(); }, [loadSentence]);

  // ── Actions ────────────────────────────────────────────────────────────

  const handleCompare = () => {
    const answer = lang === 'jp' ? currentJp?.japanese : currentEn?.sentence;
    if (!answer || !userInput.trim()) return;
    const s = scoreAnswer(userInput, answer);
    setScore(s);
    setShowAnswer(true);
    setSubmitState('compared');
    if (!hasCountedRef.current) {
      hasCountedRef.current = true;
      incrementProgress(lang === 'jp' ? 'japanese' : 'english', 'writtenSentences');
    }
  };

  const handleAiAnalyze = async () => {
    const answer = lang === 'jp' ? currentJp?.japanese : currentEn?.sentence;
    const translation = lang === 'jp' ? currentJp?.translation : currentEn?.translate_ch;
    if (!answer || !userInput.trim()) return;

    if (!hasCountedRef.current) {
      hasCountedRef.current = true;
      incrementProgress(lang === 'jp' ? 'japanese' : 'english', 'writtenSentences');
    }
    setSubmitState('ai-loading');
    setAiResult('');
    setShowAnswer(true);
    try {
      const result = await aiAnalyzeTranslation({ lang, answer, userInput, translation: translation ?? '' });
      setAiResult(result);
      setSubmitState('ai-done');
    } catch (e) {
      setAiResult((e as Error)?.message?.startsWith('AI_') ? aiErrorMessage(e, isLoggedIn) : t('writtenTranslation.aiError'));
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


  // ── Render ─────────────────────────────────────────────────────────────

  const answered = showAnswer || submitState !== 'idle';

  return (
    <div className="flex flex-col min-h-screen bg-paper">
      <Header title={t('writtenTranslation.title')} showBack />
      <main className="flex-1 pb-24 px-4 pt-4 max-w-2xl mx-auto w-full space-y-4">

        <PracticeTopBar
          left={
            <Segmented
              value={lang}
              onChange={setLang}
              options={[{ value: 'jp', label: '日本語' }, { value: 'en', label: 'English' }]}
            />
          }
          settings={
            <>
              <SheetSection title={t('common.filters')}>
                {lang === 'en' ? (
                  <EnDifficultyFilter selected={enDifficulties} onChange={setEnDifficulties} />
                ) : (
                  <JpSentenceFilter
                    selectedDifficulties={filterDifficulties}
                    onDifficultiesChange={setFilterDifficulties}
                    selectedJlpt={selectedJlpt}
                    onJlptChange={setSelectedJlpt}
                    selectedGroups={selectedGroups}
                    onGroupsChange={setSelectedGroups}
                  />
                )}
              </SheetSection>
              <SheetSection title={t('common.preferences')}>
                <OptionRow
                  label={t('writtenTranslation.hints')}
                  value={difficulty}
                  onChange={setDifficulty}
                  options={(['easy', 'medium', 'hard'] as Difficulty[]).map(d => ({ value: d, label: `${HINT_COUNTS[d]} ${t('writtenTranslation.tips')}` }))}
                />
              </SheetSection>
            </>
          }
        />

        {/* Question card */}
        <div className="bg-surface rounded-2xl border border-line p-4 shadow-sm">
          {dataLoading ? (
            <p className="text-sm text-ink-faint animate-pulse">{t('common.loading')}</p>
          ) : (
            <>
              <p className="text-xs text-ink-faint mb-1">{t('writtenTranslation.chinesePrompt')}</p>
              <p className="text-base font-medium text-ink leading-relaxed">
                {chineseTranslation ?? '…'}
              </p>
              {englishMeaning && (
                <p className="text-sm text-ink-muted mt-1.5">{englishMeaning}</p>
              )}
            </>
          )}
        </div>

        {/* Hint chips */}
        {hints.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">
                {t('writtenTranslation.hints')}
              </p>
              <button
                onClick={refreshHints}
                className="text-xs text-accent hover:text-accent transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {hints.map((h, i) => (
                <span
                  key={i}
                  className="px-3 py-1 rounded-xl text-sm bg-accent-soft text-accent border border-accent/30 font-medium"
                >
                  {h}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Input area */}
        <div>
          <BlockLabel>{lang === 'jp' ? t('writtenTranslation.typeJapanese') : t('writtenTranslation.typeEnglish')}</BlockLabel>
          <textarea
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            placeholder={lang === 'jp' ? t('writtenTranslation.placeholderJp') : t('writtenTranslation.placeholderEn')}
            rows={3}
            className="w-full rounded-md border border-line bg-surface text-ink text-sm px-4 py-3 resize-none focus:outline-none focus:border-accent transition-colors placeholder-ink-faint"
          />
        </div>

        {/* Result panel */}
        {(showAnswer || submitState !== 'idle') && (
          <div className="bg-surface rounded-2xl border-2 border-line p-4 shadow-sm space-y-3">

            {/* Score (compare mode) */}
            {score !== null && (
              <div className="flex items-center gap-3">
                <div className={`text-3xl font-semibold ${scoreColor(score)}`}>{score}%</div>
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-ink/5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        score >= 90 ? 'bg-success' : score >= 60 ? 'bg-ink' : 'bg-danger'
                      }`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  <p className="text-xs text-ink-faint mt-1">
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
                <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-1">
                  {t('writtenTranslation.correctAnswer')}
                </p>
                <p className="text-sm font-medium text-ink leading-relaxed bg-success-soft border border-success/30 rounded-xl px-3 py-2">
                  {correctAnswer}
                </p>
              </div>
            )}

            {/* AI analysis */}
            {(submitState === 'ai-loading' || submitState === 'ai-done' || submitState === 'ai-error') && (
              <div>
                <p className="text-xs font-semibold text-accent mb-2">
                  {t('writtenTranslation.aiAnalysis')}
                </p>
                {submitState === 'ai-loading' ? (
                  <p className="text-sm text-ink-faint animate-pulse">
                    {t('scramble.aiThinking')}
                  </p>
                ) : (
                  <div className="text-sm text-ink leading-relaxed space-y-2">
                    <TapToLookup as="div"><AiMarkdown text={aiResult} /></TapToLookup>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <PracticeActions
          tools={[
            { label: t('scramble.showAnswer'), onClick: handleShowAnswer, disabled: showAnswer },
            {
              label: t('writtenTranslation.aiAnalyze'),
              onClick: handleAiAnalyze,
              disabled: submitState === 'ai-loading' || !userInput.trim() || dataLoading,
              analytics: 'ai.translation_analyze',
            },
          ]}
          secondary={answered ? undefined : { label: t('common.skip'), onClick: loadSentence }}
          primary={answered
            ? { label: t('scramble.next'), onClick: loadSentence }
            : { label: t('writtenTranslation.compare'), onClick: handleCompare, disabled: !userInput.trim() || dataLoading, analytics: 'translation.compare' }}
        />

      </main>
    </div>
  );
};

export default WrittenTranslationPage;
