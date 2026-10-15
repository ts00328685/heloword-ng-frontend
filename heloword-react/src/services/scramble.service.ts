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
