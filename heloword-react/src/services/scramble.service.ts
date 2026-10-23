import { aiPost } from './llm.service';

export interface ScrambleAiRequest {
  lang: 'jp' | 'en';
  sentence: string;
  translation: string;
}

/**
 * Calls the backend AI endpoint (MEMBER only) to get a grammar explanation.
 * Returns the plain text explanation string.
 */
export async function aiExplainScramble(request: ScrambleAiRequest): Promise<string> {
  return aiPost<string>('scramble/ai-explain', request, 'AI explain failed');
}

export interface TranslationAnalyzeRequest {
  lang: 'jp' | 'en';
  answer: string;
  userInput: string;
  translation: string;
}

/**
 * Calls the backend AI endpoint (MEMBER only) to analyze user's written translation.
 * Returns succinct feedback (≤7 sentences) on errors and corrections.
 */
export async function aiAnalyzeTranslation(request: TranslationAnalyzeRequest): Promise<string> {
  return aiPost<string>('translation/ai-analyze', request, 'AI analyze failed');
}

// ── Sentence-scramble AI helpers ─────────────────────────────────────────────

/** Why a fully placed answer is in the wrong order. `attempt` = chunks joined with " / ". */
export async function aiScrambleWrongOrder(request: {
  lang: 'jp' | 'en'; sentence: string; attempt: string; translation: string;
}): Promise<string> {
  return aiPost<string>('scramble/ai-wrong-order', request, 'AI wrong-order failed');
}

/** One grammar nudge toward the next chunk. `placed` = correctly placed chunks joined with " / ". */
export async function aiScrambleHint(request: {
  lang: 'jp' | 'en'; sentence: string; placed: string; translation: string;
}): Promise<string> {
  return aiPost<string>('scramble/ai-hint', request, 'AI hint failed');
}

export interface SimilarSentence {
  sentence: string;
  /** The sentence split into chunks, in the correct order (Japanese). */
  chunks: string[];
  translation: string;
  english: string;
}

/** A new playable sentence with the same grammar pattern. */
export async function aiScrambleSimilar(request: ScrambleAiRequest): Promise<SimilarSentence> {
  return aiPost<SimilarSentence>('scramble/ai-similar', request, 'AI similar failed');
}

/** Up to 3 grammar points behind the sentences the learner struggled with today. */
export async function aiScrambleRecap(request: {
  lang: 'jp' | 'en'; items: { sentence: string; translation: string }[];
}): Promise<string> {
  return aiPost<string>('scramble/ai-recap', request, 'AI recap failed');
}
