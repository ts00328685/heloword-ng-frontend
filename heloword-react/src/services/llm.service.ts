import { doPost } from './api.service';
import { CommonResponse } from '../models';
import { track } from './analytics.service';

/** Backend AI error codes → stable Error messages the UI can switch on. */
export const AI_QUOTA_EXCEEDED = 'AI_QUOTA_EXCEEDED';
export const AI_BUSY = 'AI_BUSY';
export const AI_INVALID_INPUT = 'AI_INVALID_INPUT';

/** Fired after every AI call so quota badges can refresh. */
export const AI_USED_EVENT = 'hw:ai-used';

/** Outcome label recorded with each AI call, so quota hits (a sign-up opportunity) are visible. */
function aiOutcome(code: string): string {
  switch (code) {
    case '0000': return 'ok';
    case '4004': return 'quota';
    case '4005': return 'busy';
    case '9996': return 'invalid';
    case '4003': return 'not_a_verb';
    default: return 'error';
  }
}

export function unwrapAi<T>(res: CommonResponse<T>, fallback: string): T {
  window.dispatchEvent(new CustomEvent(AI_USED_EVENT));
  if (res.code === '0000' && res.data != null) return res.data;
  if (res.code === '4004') throw new Error(AI_QUOTA_EXCEEDED);
  if (res.code === '4005') throw new Error(AI_BUSY);
  if (res.code === '9996') throw new Error(AI_INVALID_INPUT);
  if (res.code === '4003') throw new Error('NOT_A_VERB');
  throw new Error(res.message || fallback);
}

/**
 * POST to an AI endpoint (`path` is relative to /fe/, e.g. "ai/word-insight") and record one
 * FEATURE analytics event per call — this also covers calls not started by a click (Enter key,
 * chained calls), which click autocapture can't see.
 */
export async function aiPost<T>(path: string, body: unknown, fallback: string): Promise<T> {
  const res = await doPost<T>(`/frontend-api/api/fe/${path}`, body);
  track('FEATURE', path.replace(/\//g, '.').replace(/-/g, '_'), { label: aiOutcome(res.code) });
  return unwrapAi(res, fallback);
}

export interface QuickTranslateResult {
  word: string;
  wordLang: string;
  translateEn: string;
  translateCh: string;
}

/** Auto-detect language and translate a word/phrase. Ultra-slim prompt, fast. */
export async function quickTranslate(text: string): Promise<QuickTranslateResult> {
  return aiPost<QuickTranslateResult>('ai/quick-translate', { text }, 'Quick translate failed');
}

/**
 * AI feature service — all calls go through the backend, which proxies to the
 * self-hosted LLM tunnel. The tunnel URL is never exposed to the browser.
 *
 * Guests get a small shared daily quota (enforced server-side); members get a larger one.
 * Quota/busy errors surface as AI_QUOTA_EXCEEDED / AI_BUSY.
 */

export interface WordFillResult {
  translateEn: string;
  translateCh: string;
  sentence: string;
  /** JLPT N5–N1 or CEFR A1–C2; empty if unknown */
  level: string;
}

/** Structured AI fill for the custom vocab form — language-aware, no label parsing needed. */
export async function getWordFill(word: string, wordLang: string): Promise<WordFillResult> {
  return aiPost<WordFillResult>('ai/word-fill', { word, wordLang }, 'AI fill failed');
}

/** Definition + example sentence for a vocabulary word. */
export async function getWordInsight(
  word: string,
  translateEn: string,
  translateCh: string,
  lang: string,
  wordLang: string,
): Promise<string> {
  return aiPost<string>('ai/word-insight', {
    word,
    translateEn,
    translateCh,
    lang,
    wordLang,
  }, 'AI insight failed');
}

/** One freshly generated example sentence for a word. */
export async function getSampleSentence(
  word: string,
  translateEn: string,
  lang: string,
  wordLang: string,
): Promise<string> {
  return aiPost<string>('ai/sample-sentence', {
    word,
    translateEn,
    lang,
    wordLang,
  }, 'AI sample sentence failed');
}

/** Synonyms / similar words and guidance on when to use each. */
export async function getWordComparison(
  word: string,
  translateEn: string,
  translateCh: string,
  lang: string,
  wordLang: string,
): Promise<string> {
  return aiPost<string>('ai/word-compare', {
    word,
    translateEn,
    translateCh,
    lang,
    wordLang,
  }, 'AI word comparison failed');
}

export interface VerbConjugationResult {
  word: string;
  wordLang: string;
  meaningEn: string;
  meaningZh: string;
  conjugations: string;
}

/** Verb conjugation table for English or Japanese verbs. Throws if not a verb. */
export async function getVerbConjugation(word: string): Promise<VerbConjugationResult> {
  return aiPost<VerbConjugationResult>('ai/verb-conjugation', { word }, 'Verb conjugation failed');
}

/** Personalised study tip based on recent performance. */
export async function getStudyCoach(
  accuracyPct: number,
  wrongCount: number,
  lang: string,
): Promise<string> {
  return aiPost<string>('ai/study-coach', {
    accuracyPct,
    wrongCount,
    lang,
  }, 'AI study coach failed');
}

// ── Quota ────────────────────────────────────────────────────────────────────

export interface AiQuota {
  guest: boolean;
  limit: number;
  remaining: number;
}

/** Remaining AI calls today. Never consumes quota. */
export async function getAiQuota(): Promise<AiQuota | null> {
  const res = await doPost<AiQuota>('/frontend-api/api/fe/ai/quota', {});
  return res.code === '0000' ? res.data : null;
}

// ── Learning tools ───────────────────────────────────────────────────────────

export interface CheckSentenceResult {
  ok: boolean;
  fix: string;
}

/** Checks a sentence the learner wrote with `word`. */
export async function checkSentence(word: string, wordLang: string, sentence: string): Promise<CheckSentenceResult> {
  return aiPost<CheckSentenceResult>('ai/check-sentence', { word, wordLang, sentence }, 'Check sentence failed');
}

/** One-line mnemonic for the word. */
export async function getMemoryHook(word: string, wordLang: string, meaningZh: string): Promise<string> {
  return aiPost<string>('ai/memory-hook', { word, wordLang, meaningZh }, 'Memory hook failed');
}

/** Why the picked multiple-choice answer is wrong. */
export async function explainWrongAnswer(word: string, wordLang: string, picked: string, answer: string): Promise<string> {
  return aiPost<string>('ai/explain-wrong', { word, wordLang, picked, answer }, 'Explain failed');
}

export interface ClozeResult {
  /** Sentence with the word replaced by ____ */
  sentence: string;
  /** Exact (possibly inflected) form that was removed */
  answer: string;
  translation: string;
}

/** Fill-in-the-blank sentence for the word. */
export async function getCloze(word: string, wordLang: string): Promise<ClozeResult> {
  return aiPost<ClozeResult>('ai/cloze', { word, wordLang }, 'Cloze failed');
}

export interface PolitenessResult {
  casual: string;
  polite: string;
  keigo: string;
}

/** Rewrites a Japanese sentence as casual / polite / keigo. */
export async function getPoliteness(sentence: string): Promise<PolitenessResult> {
  return aiPost<PolitenessResult>('ai/politeness', { sentence }, 'Politeness failed');
}

export interface Collocation {
  phrase: string;
  meaning: string;
}

/** Three common pairings for the word. */
export async function getCollocations(word: string, wordLang: string): Promise<Collocation[]> {
  return aiPost<Collocation[]>('ai/collocations', { word, wordLang }, 'Collocations failed');
}

/** JLPT / CEFR level tag (members only). Returns '' when unknown. */
export async function getWordLevel(word: string, wordLang: string): Promise<string> {
  return aiPost<string>('ai/word-level', { word, wordLang }, 'Word level failed');
}

export interface WeeklyStory {
  week: string;
  words: string[];
  /** Empty when there aren't enough missed words yet */
  story: string;
  translation: string;
}

/** This week's story from the member's most-missed words (generated once per week). */
export async function getWeeklyStory(): Promise<WeeklyStory> {
  return aiPost<WeeklyStory>('ai/weekly-story', {}, 'Weekly story failed');
}

export interface LookupResult {
  /** Dictionary form; Japanese carries 漢字[かな] readings */
  word: string;
  meaningZh: string;
  meaningEn: string;
}

/** Meaning of a tapped word as used in its sentence. Already-cached answers cost no quota. */
export async function lookupWord(word: string, sentence: string, wordLang: string): Promise<LookupResult> {
  return aiPost<LookupResult>('ai/lookup', { word, sentence, wordLang }, 'Lookup failed');
}

export interface ExplainSentenceResult {
  /** Meaningful chunks in sentence order; Japanese carries 漢字[かな] readings */
  chunks: { text: string; note: string }[];
  /** Grammar points worth knowing (may be empty) */
  points: { text: string; note: string }[];
  /** Natural Traditional Chinese translation */
  translation: string;
}

/** A sentence broken into chunks, grammar points and a translation. Already-cached answers cost no quota. */
export async function explainSentence(sentence: string): Promise<ExplainSentenceResult> {
  return aiPost<ExplainSentenceResult>('ai/explain-sentence', { sentence }, 'Explain sentence failed');
}

export interface NaturalResult {
  lang: 'jp' | 'en';
  natural: string;
  casual: string;
  /** Traditional Chinese: when the original, natural and casual versions fit */
  note: string;
}

/** How natives actually say a textbook phrase. English or Japanese only; cached answers are free. */
export async function getNatural(phrase: string): Promise<NaturalResult> {
  return aiPost<NaturalResult>('ai/natural', { phrase }, 'Natural phrasing failed');
}
