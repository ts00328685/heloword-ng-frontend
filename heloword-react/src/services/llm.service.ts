import { doPost } from './api.service';

/**
 * AI feature service — all calls go through the backend, which proxies to the
 * self-hosted LLM tunnel. The tunnel URL is never exposed to the browser.
 *
 * Backend endpoints (Spring Boot, @MemberOnly):
 *   POST /frontend-api/api/fe/ai/word-insight
 *   POST /frontend-api/api/fe/ai/sample-sentence
 *   POST /frontend-api/api/fe/ai/study-coach
 *
 * Each returns CommonResponse<String> with the AI-generated text.
 */

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
  if (res.code === '0000' && res.data) return res.data;
  throw new Error(res.message || 'AI insight failed');
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
  if (res.code === '0000' && res.data) return res.data;
  throw new Error(res.message || 'AI sample sentence failed');
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
  if (res.code === '0000' && res.data) return res.data;
  throw new Error(res.message || 'AI study coach failed');
}
