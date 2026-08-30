/**
 * `cleanSentenceForTTSMapped` must produce exactly the text the previous
 * (unmapped) cleaner produced, plus a correct source-index map — the map is
 * what turns speech boundary events into a highlight over the displayed text.
 */
import { describe, it, expect } from 'vitest';
import { cleanSentenceForTTS, cleanSentenceForTTSMapped } from './tts.service';

/** Verbatim copy of the original implementation, used as the oracle. */
function referenceClean(text: string, lang: string): string {
  let cleaned = text
    .replace(/\[.*?\]/g, '')
    .replace(/（.*?）/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/【.*?】/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();

  if (lang === 'jp' || lang === 'ja') {
    const hasKana = /[ぁ-ゖ゠-ヿ]/;
    const lines = cleaned.split('\n');
    if (lines.length > 1) {
      const jpLines = lines.filter((l) => hasKana.test(l));
      if (jpLines.length > 0) cleaned = jpLines.join('\n').trim();
    } else {
      const parts = cleaned.split(/(?<=。)/);
      const jpParts = parts.filter((p) => !p.trim() || hasKana.test(p));
      if (jpParts.length > 0 && jpParts.length < parts.length) {
        cleaned = jpParts.join('').trim();
      }
    }
  }

  return cleaned;
}

const SAMPLES: string[] = [
  '台北[たいぺい]にまた「MRTで行[い]ける」登山[とざん]ルートが一[ひと]つ増[ふ]えました！',
  '  leading and   collapsed   spaces  ',
  'これは日本語です。This is English. これも日本語です。',
  '日本語[にほんご]の行\n中文的一行\nもう一つの日本語[にほんご]の行',
  '全部中文的第一行\n第二行也是中文',
  'A sentence with (a parenthetical) and 【brackets】 and <b>tags</b>.',
  '句子。',
  '。',
  '',
  '   ',
  '\n\n日本語[にほんご]\n\n',
  '絵文字🎉と[ルビ]の混[ま]ざった文[ぶん]です。',
  '未閉じの[かっこ ある文[ぶん]です。',
];

describe('cleanSentenceForTTSMapped', () => {
  for (const lang of ['ja', 'en', 'zh']) {
    it(`matches the reference cleaner for lang=${lang}`, () => {
      for (const sample of SAMPLES) {
        expect(cleanSentenceForTTSMapped(sample, lang).text).toBe(referenceClean(sample, lang));
        expect(cleanSentenceForTTS(sample, lang)).toBe(referenceClean(sample, lang));
      }
    });

    it(`maps every spoken character back to its source index for lang=${lang}`, () => {
      for (const sample of SAMPLES) {
        const { text, map } = cleanSentenceForTTSMapped(sample, lang);
        expect(map).toHaveLength(text.length);
        for (let i = 0; i < text.length; i++) {
          // Newlines re-inserted between kept lines still point at a real newline.
          expect(sample[map[i]]).toBe(text[i]);
          if (i > 0) expect(map[i]).toBeGreaterThan(map[i - 1]);
        }
      }
    });
  }
});
