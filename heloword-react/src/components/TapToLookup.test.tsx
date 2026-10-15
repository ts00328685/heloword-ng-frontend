// @vitest-environment jsdom
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let tappedOffset: number | null = 0;
vi.mock('../utils/wordLookup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/wordLookup')>();
  return { ...actual, textOffsetFromPoint: () => tappedOffset };
});
// Only what the sheet is asked to show matters here.
vi.mock('./WordLookupSheet', () => ({
  default: ({ tapped, lang, context, onClose }: { tapped: { word: string }; lang: string; context: string; onClose: () => void }) => (
    <div data-testid="sheet" data-word={tapped.word} data-lang={lang} data-context={context}>
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

import TapToLookup from './TapToLookup';

const AI_TEXT = '解釋：表示「舉行」。\n日文例句：会議[かいぎ]を行[おこな]いました。\n英文：They held a meeting.';

const highlights = new Map<string, unknown>();
class FakeHighlight { constructor(public range: Range) {} }

beforeEach(() => {
  highlights.clear();
  window.getSelection()?.removeAllRanges();
  (globalThis as unknown as { CSS: unknown }).CSS = { highlights: { set: (k: string, v: unknown) => highlights.set(k, v), delete: (k: string) => highlights.delete(k) } };
  (globalThis as unknown as { Highlight: unknown }).Highlight = FakeHighlight;
});
afterEach(() => {
  delete (globalThis as unknown as { Highlight?: unknown }).Highlight;
});

const renderInCard = (onCardClick = vi.fn()) => {
  render(
    <div onClick={onCardClick}>
      <p data-testid="panel"><TapToLookup>{AI_TEXT}</TapToLookup></p>
    </div>,
  );
  return { onCardClick, text: () => screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === AI_TEXT) };
};

describe('TapToLookup', () => {
  it('opens the lookup for a Japanese word and highlights it', () => {
    const { text } = renderInCard();
    tappedOffset = AI_TEXT.indexOf('会議');
    fireEvent.click(text());

    const sheet = screen.getByTestId('sheet');
    expect(sheet).toHaveAttribute('data-word', '会議');
    expect(sheet).toHaveAttribute('data-lang', 'ja');
    expect(sheet).toHaveAttribute('data-context', 'ai_text');
    const h = highlights.get('word-lookup') as FakeHighlight;
    expect(h.range.toString()).toBe('会議');
  });

  it('opens an English lookup for Latin words', () => {
    const { text } = renderInCard();
    tappedOffset = AI_TEXT.indexOf('meeting');
    fireEvent.click(text());
    expect(screen.getByTestId('sheet')).toHaveAttribute('data-word', 'meeting');
    expect(screen.getByTestId('sheet')).toHaveAttribute('data-lang', 'en');
  });

  it('ignores the Chinese explanation and lets the click reach the card', () => {
    const { text, onCardClick } = renderInCard();
    tappedOffset = AI_TEXT.indexOf('解釋');
    fireEvent.click(text());
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
    expect(onCardClick).toHaveBeenCalledTimes(1);
  });

  it('does not toggle the surrounding card when a word is tapped', () => {
    const { text, onCardClick } = renderInCard();
    tappedOffset = AI_TEXT.indexOf('会議');
    fireEvent.click(text());
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it('clears the highlight when the sheet closes', () => {
    const { text } = renderInCard();
    tappedOffset = AI_TEXT.indexOf('会議');
    fireEvent.click(text());
    act(() => { screen.getByText('close').click(); });
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
    expect(highlights.has('word-lookup')).toBe(false);
  });

  it('works over nested markup (e.g. rendered markdown)', () => {
    render(<TapToLookup as="div"><p><strong>重點</strong>：</p><ul><li>会議[かいぎ]を<b>開</b>く</li></ul></TapToLookup>);
    const container = screen.getByText('重點').closest('div')!;
    tappedOffset = (container.textContent ?? '').indexOf('会議');
    fireEvent.click(container);
    expect(screen.getByTestId('sheet')).toHaveAttribute('data-word', '会議');
    expect((highlights.get('word-lookup') as FakeHighlight).range.toString()).toBe('会議');
  });

  it('still opens the lookup in browsers without the highlight API', () => {
    delete (globalThis as unknown as { Highlight?: unknown }).Highlight;
    const { text } = renderInCard();
    tappedOffset = AI_TEXT.indexOf('会議');
    fireEvent.click(text());
    expect(screen.getByTestId('sheet')).toBeInTheDocument();
    expect(highlights.size).toBe(0);
  });

  it('does not treat a text selection as a tap', () => {
    const { text } = renderInCard();
    const range = document.createRange();
    range.selectNodeContents(text());
    window.getSelection()!.addRange(range);
    tappedOffset = AI_TEXT.indexOf('会議');
    fireEvent.click(text());
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
  });
});
