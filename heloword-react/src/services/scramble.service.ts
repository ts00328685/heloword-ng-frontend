import { doPost } from './api.service';

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
  const res = await doPost<string>('/frontend-api/api/fe/scramble/ai-explain', request);
  if (res.code === '0000' && res.data) return res.data;
  throw new Error(res.message || 'AI explain failed');
}
