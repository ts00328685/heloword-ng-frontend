import { describe, expect, it } from 'vitest';
import { findRecallTargets } from './ArticleRecall';

const v = (word: string) => ({ word, reading: '', meaning_zh: '', meaning_en: '' });

describe('findRecallTargets', () => {
  it('covers the whole 漢字[かな] unit of a Japanese word', () => {
    const text = '京都[きょうと]の紅葉[こうよう]は綺麗です。';
    const [t] = findRecallTargets(text, [v('紅葉[こうよう]')], 'ja', 0);
    expect(text.slice(t.start, t.end)).toBe('紅葉[こうよう]');
    expect(t.key).toBe('0:0');
  });

  it('falls back to the kanji stem for conjugated Japanese words', () => {
    const text = '会見[かいけん]を開催[かいさい]しました。';
    const [t] = findRecallTargets(text, [v('開催[かいさい]する')], 'ja', 2);
    expect(text.slice(t.start, t.end)).toBe('開催[かいさい]');
  });

  it('matches English whole words only, case-insensitively', () => {
    const text = 'Banks lend money. The bank opened.';
    const targets = findRecallTargets(text, [v('bank')], 'en', 0);
    expect(targets.map((t) => text.slice(t.start, t.end))).toEqual(['bank']);
  });

  it('keeps the longer word when occurrences overlap', () => {
    const text = '一週間[いっしゅうかん]遅[おそ]く';
    const targets = findRecallTargets(text, [v('週間'), v('一週間[いっしゅうかん]')], 'ja', 0);
    expect(targets).toHaveLength(1);
    expect(targets[0].key).toBe('0:1');
  });
});
