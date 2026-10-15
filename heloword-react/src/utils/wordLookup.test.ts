import { describe, expect, it } from 'vitest';
import { findTappedWord, findTappedWordInMixedText, stripReadings } from './wordLookup';
import type { NHKVocabItem } from '../services/nhkArticle.service';

/** Offset of the first occurrence of `needle` (plus `into` chars) — taps are written by text, not number. */
const at = (text: string, needle: string, into = 0) => {
  const i = text.indexOf(needle);
  if (i < 0) throw new Error(`"${needle}" not in text`);
  return i + into;
};

const vocab = (word: string, zh = '', en = ''): NHKVocabItem => ({ word, reading: '', meaning_zh: zh, meaning_en: en });

describe('stripReadings', () => {
  it('removes readings and tags and maps back to display positions', () => {
    const display = '首相[しゅしょう]は<b>東京</b>へ';
    const { text, map } = stripReadings(display);
    expect(text).toBe('首相は東京へ');
    expect(map).toHaveLength(text.length);
    [...text].forEach((ch, i) => expect(display[map[i]]).toBe(ch));
  });
});

describe('findTappedWord — Japanese', () => {
  const plain = '日本の首相は昨日、東京で記者会見を行いました。次の会見は来週です。';

  it('finds a noun', () => {
    expect(findTappedWord(plain, at(plain, '首相', 1), 'ja')?.word).toBe('首相');
  });

  it('rejoins a verb with its endings', () => {
    const w = findTappedWord(plain, at(plain, '行'), 'ja');
    expect(w?.word).toBe('行いました');
    // tapping the ending also gets the whole verb
    expect(findTappedWord(plain, at(plain, 'した'), 'ja')?.word).toBe('行いました');
  });

  it('does not swallow a following particle', () => {
    expect(findTappedWord(plain, at(plain, '東京'), 'ja')?.word).toBe('東京');
    expect(findTappedWord(plain, at(plain, '東京で') + 2, 'ja')?.word).toBe('で');
  });

  it('returns only the sentence containing the word', () => {
    const w = findTappedWord(plain, at(plain, '来週'), 'ja');
    expect(w?.word).toBe('来週');
    expect(w?.sentence).toBe('次の会見は来週です。');
  });

  it('keeps copulas off nouns (です / だ / でしょう)', () => {
    const cases: [string, string][] = [
      ['次の会見は来週です。', '来週'],
      ['彼は学生だ。', '学生'],
      ['明日は雨でしょう。', '雨'],
      ['昨日は休みでした。', '休み'],
    ];
    for (const [text, noun] of cases) {
      expect(findTappedWord(text, at(text, noun), 'ja')?.word).toBe(noun);
    }
  });

  it('ignores punctuation and out-of-range taps', () => {
    expect(findTappedWord(plain, at(plain, '、'), 'ja')).toBeNull();
    expect(findTappedWord(plain, -1, 'ja')).toBeNull();
    expect(findTappedWord(plain, plain.length, 'ja')).toBeNull();
    expect(findTappedWord('', 0, 'ja')).toBeNull();
  });

  describe('with 漢字[かな] readings in the text', () => {
    const annotated = '首相[しゅしょう]は東京[とうきょう]で会見[かいけん]を行[おこな]いました。';

    it('looks up the plain word and highlights across the reading', () => {
      const w = findTappedWord(annotated, at(annotated, '首相'), 'ja')!;
      expect(w.word).toBe('首相');
      expect(annotated.slice(w.start, w.end)).toBe('首相');
    });

    it('treats a tap on the reading as a tap on its kanji', () => {
      expect(findTappedWord(annotated, at(annotated, 'とうきょう', 2), 'ja')?.word).toBe('東京');
    });

    it('rejoins a verb split by its reading', () => {
      const w = findTappedWord(annotated, at(annotated, 'いました'), 'ja')!;
      expect(w.word).toBe('行いました');
      expect(annotated.slice(w.start, w.end)).toBe('行[おこな]いました');
    });

    it('keeps readings in the saved sentence but not in the AI sentence', () => {
      const w = findTappedWord(annotated, at(annotated, '会見'), 'ja')!;
      expect(w.sentence).toBe(annotated);
      expect(w.sentenceText).toBe('首相は東京で会見を行いました。');
    });
  });

  describe('article vocabulary', () => {
    const list = [vocab('記者会見[きしゃかいけん]', '記者會', 'press conference'), vocab('会見[かいけん]', '會見', 'meeting')];

    it('prefers the longest vocabulary entry covering the tap', () => {
      const w = findTappedWord(plain, at(plain, '会見'), 'ja', list)!;
      expect(w.word).toBe('記者会見');
      expect(w.vocab?.meaning_en).toBe('press conference');
    });

    it('falls back to segmentation outside vocabulary entries', () => {
      const w = findTappedWord(plain, at(plain, '昨日'), 'ja', list)!;
      expect(w.word).toBe('昨日');
      expect(w.vocab).toBeUndefined();
    });
  });
});

describe('findTappedWord — English', () => {
  const text = "The prime minister didn't attend. The banking sector reacted.";

  it('finds a word with an apostrophe intact', () => {
    expect(findTappedWord(text, at(text, "didn't", 3), 'en')?.word).toBe("didn't");
  });

  it('returns the containing sentence', () => {
    expect(findTappedWord(text, at(text, 'sector'), 'en')?.sentence).toBe('The banking sector reacted.');
  });

  it('matches vocabulary case-insensitively on whole words only', () => {
    const list = [vocab('Prime Minister', '首相', 'head of government'), vocab('bank', '銀行', 'bank')];
    const w = findTappedWord(text, at(text, 'minister'), 'en', list)!;
    expect(w.word).toBe('prime minister');
    expect(w.vocab?.meaning_zh).toBe('首相');
    // "bank" must not match inside "banking"
    const banking = findTappedWord(text, at(text, 'banking'), 'en', list)!;
    expect(banking.word).toBe('banking');
    expect(banking.vocab).toBeUndefined();
  });

  it('ignores spaces', () => {
    expect(findTappedWord(text, at(text, ' prime'), 'en')).toBeNull();
  });
});

describe('findTappedWord — browsers without Intl.Segmenter', () => {
  const original = Intl.Segmenter;
  const withoutSegmenter = (fn: () => void) => {
    const intl = Intl as unknown as Record<string, unknown>;
    delete intl.Segmenter; // simulate an old browser
    try { fn(); } finally { intl.Segmenter = original; }
  };

  it('still finds Japanese words and keeps particles apart', () => withoutSegmenter(() => {
    const text = '東京で会見を行いました。';
    expect(findTappedWord(text, at(text, '行'), 'ja')?.word).toBe('行いました');
    expect(findTappedWord(text, at(text, '東京'), 'ja')?.word).toBe('東京');
    expect(findTappedWord(text, at(text, '会見'), 'ja')?.word).toBe('会見');
    expect(findTappedWord(text, at(text, '。'), 'ja')).toBeNull();
  }));

  it('still finds English words and sentences', () => withoutSegmenter(() => {
    const text = "It didn't rain. Then it poured.";
    const w = findTappedWord(text, at(text, 'poured'), 'en')!;
    expect(w.word).toBe('poured');
    expect(w.sentence).toBe('Then it poured.');
    expect(findTappedWord(text, at(text, "didn't"), 'en')?.word).toBe("didn't");
  }));
});

describe('findTappedWordInMixedText — AI explanations', () => {
  const zhJa = '解釋：表示「舉行」的意思。\n日文例句：会議[かいぎ]を行[おこな]いました。\n中文翻譯：舉行了會議。';

  it('looks up Japanese words in the example (kanji with readings)', () => {
    const w = findTappedWordInMixedText(zhJa, at(zhJa, '会議'))!;
    expect(w.word).toBe('会議');
    expect(w.lang).toBe('ja');
    expect(w.sentenceText).toBe('日文例句：会議を行いました。');
  });

  it('looks up a kana word and a verb in the Japanese example', () => {
    expect(findTappedWordInMixedText(zhJa, at(zhJa, '行['))).toMatchObject({ word: '行いました', lang: 'ja' });
    // the same character inside the Chinese word 舉行 is not tappable
    expect(findTappedWordInMixedText(zhJa, at(zhJa, '舉行', 1))).toBeNull();
    expect(findTappedWordInMixedText(zhJa, at(zhJa, 'を'))).toMatchObject({ word: 'を', lang: 'ja' });
  });

  it('ignores taps on the Chinese explanation', () => {
    expect(findTappedWordInMixedText(zhJa, at(zhJa, '解釋'))).toBeNull();
    expect(findTappedWordInMixedText(zhJa, at(zhJa, '舉行'))).toBeNull();
    expect(findTappedWordInMixedText(zhJa, at(zhJa, '會議'))).toBeNull();
  });

  it('looks up English words with English rules', () => {
    const zhEn = "解釋：表示放棄。\n英文例句：She didn't give up on her dream.\n中文翻譯：她沒有放棄夢想。";
    const w = findTappedWordInMixedText(zhEn, at(zhEn, "didn't", 2))!;
    expect(w).toMatchObject({ word: "didn't", lang: 'en' });
    expect(w.sentenceText).toContain("She didn't give up on her dream.");
    expect(findTappedWordInMixedText(zhEn, at(zhEn, '放棄'))).toBeNull();
  });
});
