import { doPost } from './api.service';
import { CommonResponse } from '../models';

/** Backend AI error codes → stable Error messages the UI can switch on. */
export const AI_QUOTA_EXCEEDED = 'AI_QUOTA_EXCEEDED';
export const AI_BUSY = 'AI_BUSY';
export const AI_INVALID_INPUT = 'AI_INVALID_INPUT';

/** Fired after every AI call so quota badges can refresh. */
export const AI_USED_EVENT = 'hw:ai-used';

export function unwrapAi<T>(res: CommonResponse<T>, fallback: string): T {
  window.dispatchEvent(new CustomEvent(AI_USED_EVENT));
  if (res.code === '0000' && res.data != null) return res.data;
  if (res.code === '4004') throw new Error(AI_QUOTA_EXCEEDED);
  if (res.code === '4005') throw new Error(AI_BUSY);
  if (res.code === '9996') throw new Error(AI_INVALID_INPUT);
  if (res.code === '4003') throw new Error('NOT_A_VERB');
  throw new Error(res.message || fallback);
}

export interface QuickTranslateResult {
  word: string;
  wordLang: string;
  translateEn: string;
  translateCh: string;
}

/** Auto-detect language and translate a word/phrase. Ultra-slim prompt, fast. */
export async function quickTranslate(text: string): Promise<QuickTranslateResult> {
  const res = await doPost<QuickTranslateResult>('/frontend-api/api/fe/ai/quick-translate', { text });
  return unwrapAi(res, 'Quick translate failed');
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
  const res = await doPost<WordFillResult>('/frontend-api/api/fe/ai/word-fill', { word, wordLang });
  return unwrapAi(res, 'AI fill failed');
}

/** Definition + example sentence for a vocabulary word. */
export async function getWordInsight(
  word: string,
  translateEn: string,
  translateCh: string,
  lang: string,
  wordLang: string,
): Promise<string> {
  const res = await doPost<string>('/frontend-api/api/fe/ai/word-insight', {
    word,
    translateEn,
    translateCh,
    lang,
    wordLang,
  });
  return unwrapAi(res, 'AI insight failed');
}

/** One freshly generated example sentence for a word. */
export async function getSampleSentence(
  word: string,
  translateEn: string,
  lang: string,
  wordLang: string,
): Promise<string> {
  const res = await doPost<string>('/frontend-api/api/fe/ai/sample-sentence', {
    word,
    translateEn,
    lang,
    wordLang,
  });
  return unwrapAi(res, 'AI sample sentence failed');
}

/** Synonyms / similar words and guidance on when to use each. */
export async function getWordComparison(
  word: string,
  translateEn: string,
  translateCh: string,
  lang: string,
  wordLang: string,
): Promise<string> {
  const res = await doPost<string>('/frontend-api/api/fe/ai/word-compare', {
    word,
    translateEn,
    translateCh,
    lang,
    wordLang,
  });
  return unwrapAi(res, 'AI word comparison failed');
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
  const res = await doPost<VerbConjugationResult>('/frontend-api/api/fe/ai/verb-conjugation', { word });
  return unwrapAi(res, 'Verb conjugation failed');
}

/** Personalised study tip based on recent performance. */
export async function getStudyCoach(
  accuracyPct: number,
  wrongCount: number,
  lang: string,
): Promise<string> {
  const res = await doPost<string>('/frontend-api/api/fe/ai/study-coach', {
    accuracyPct,
    wrongCount,
    lang,
  });
  return unwrapAi(res, 'AI study coach failed');
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
  const res = await doPost<CheckSentenceResult>('/frontend-api/api/fe/ai/check-sentence', { word, wordLang, sentence });
  return unwrapAi(res, 'Check sentence failed');
}

/** One-line mnemonic for the word. */
export async function getMemoryHook(word: string, wordLang: string, meaningZh: string): Promise<string> {
  const res = await doPost<string>('/frontend-api/api/fe/ai/memory-hook', { word, wordLang, meaningZh });
  return unwrapAi(res, 'Memory hook failed');
}

/** Why the picked multiple-choice answer is wrong. */
export async function explainWrongAnswer(word: string, wordLang: string, picked: string, answer: string): Promise<string> {
  const res = await doPost<string>('/frontend-api/api/fe/ai/explain-wrong', { word, wordLang, picked, answer });
  return unwrapAi(res, 'Explain failed');
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
  const res = await doPost<ClozeResult>('/frontend-api/api/fe/ai/cloze', { word, wordLang });
  return unwrapAi(res, 'Cloze failed');
}

export interface PolitenessResult {
  casual: string;
  polite: string;
  keigo: string;
}

/** Rewrites a Japanese sentence as casual / polite / keigo. */
export async function getPoliteness(sentence: string): Promise<PolitenessResult> {
  const res = await doPost<PolitenessResult>('/frontend-api/api/fe/ai/politeness', { sentence });
  return unwrapAi(res, 'Politeness failed');
}

export interface Collocation {
  phrase: string;
  meaning: string;
}

/** Three common pairings for the word. */
export async function getCollocations(word: string, wordLang: string): Promise<Collocation[]> {
  const res = await doPost<Collocation[]>('/frontend-api/api/fe/ai/collocations', { word, wordLang });
  return unwrapAi(res, 'Collocations failed');
}

/** JLPT / CEFR level tag (members only). Returns '' when unknown. */
export async function getWordLevel(word: string, wordLang: string): Promise<string> {
  const res = await doPost<string>('/frontend-api/api/fe/ai/word-level', { word, wordLang });
  return unwrapAi(res, 'Word level failed');
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
  const res = await doPost<WeeklyStory>('/frontend-api/api/fe/ai/weekly-story', {});
  return unwrapAi(res, 'Weekly story failed');
}
