// @vitest-environment jsdom
/**
 * Tap-to-look-up wiring on article paragraphs. jsdom has no layout, so the screen-position
 * step (textOffsetFromPoint) is stubbed; word finding itself runs for real.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NHKParagraph } from '../../services/nhkArticle.service';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  // Grammar notes use TapToLookup, whose lookup sheet pulls in the real i18n setup.
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

let tappedOffset: number | null = 0;
vi.mock('../../utils/wordLookup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/wordLookup')>();
  return { ...actual, textOffsetFromPoint: () => tappedOffset };
});

import { ParagraphCard } from './ArticleShared';

const text = '東京[とうきょう]で記者会見[きしゃかいけん]を行[おこな]いました。';
const paragraph: NHKParagraph = {
  original: text,
  ja: text,
  en: '',
  zh: '',
  grammar: '',
  vocabulary: [{ word: '記者会見[きしゃかいけん]', reading: '', meaning_zh: '記者會', meaning_en: 'press conference' }],
};

const card = (props: Partial<React.ComponentProps<typeof ParagraphCard>> = {}) => (
  <ParagraphCard
    paragraph={paragraph}
    activeLang="original"
    index={0}
    speakingKey={null}
    speakingMode={null}
    spokenRange={null}
    onSpeak={vi.fn()}
    {...props}
  />
);

const originalText = () => screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === text);

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.getSelection()?.removeAllRanges();
});

describe('ParagraphCard word tap', () => {
  it('reports the tapped word with its sentence and article vocabulary', () => {
    const onWordTap = vi.fn();
    render(card({ lookupLang: 'ja', onWordTap }));
    tappedOffset = text.indexOf('会見');
    fireEvent.click(originalText());

    expect(onWordTap).toHaveBeenCalledTimes(1);
    const word = onWordTap.mock.calls[0][0];
    expect(word.word).toBe('記者会見');
    expect(word.vocab.meaning_en).toBe('press conference');
    expect(word.sentenceText).toBe('東京で記者会見を行いました。');
  });

  it('does nothing when the tap is on punctuation', () => {
    const onWordTap = vi.fn();
    render(card({ lookupLang: 'ja', onWordTap }));
    tappedOffset = text.indexOf('。');
    fireEvent.click(originalText());
    expect(onWordTap).not.toHaveBeenCalled();
  });

  it('does nothing when the tap misses the text', () => {
    const onWordTap = vi.fn();
    render(card({ lookupLang: 'ja', onWordTap }));
    tappedOffset = null;
    fireEvent.click(originalText());
    expect(onWordTap).not.toHaveBeenCalled();
  });

  it('does not treat a text selection as a tap', () => {
    const onWordTap = vi.fn();
    render(card({ lookupLang: 'ja', onWordTap }));
    const range = document.createRange();
    range.selectNodeContents(originalText());
    window.getSelection()!.addRange(range);
    tappedOffset = text.indexOf('東京');
    fireEvent.click(originalText());
    expect(onWordTap).not.toHaveBeenCalled();
  });

  it('is off unless the page enables it', () => {
    const onWordTap = vi.fn();
    render(card({ onWordTap }));
    tappedOffset = text.indexOf('東京');
    fireEvent.click(originalText());
    expect(onWordTap).not.toHaveBeenCalled();
  });

  it('highlights the selected word, readings included', () => {
    const start = text.indexOf('行');
    const end = text.indexOf('。');
    render(card({
      lookupLang: 'ja',
      onWordTap: vi.fn(),
      selectedWord: { word: '行いました', start, end, sentence: text, sentenceText: '' },
    }));
    const mark = document.querySelector('mark');
    expect(mark).toHaveTextContent('行[おこな]いました');
  });
});
