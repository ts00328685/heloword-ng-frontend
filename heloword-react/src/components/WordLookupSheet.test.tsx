// @vitest-environment jsdom
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TappedWord } from '../utils/wordLookup';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const auth = { isLoggedIn: false };
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));

const lookupWord = vi.fn();
vi.mock('../services/llm.service', () => ({
  lookupWord: (...args: unknown[]) => lookupWord(...args),
  AI_QUOTA_EXCEEDED: 'AI_QUOTA_EXCEEDED',
  AI_BUSY: 'AI_BUSY',
  AI_INVALID_INPUT: 'AI_INVALID_INPUT',
}));
vi.mock('../services/analytics.service', () => ({ track: vi.fn() }));
vi.mock('../services/tts.service', () => ({ pronounceWord: vi.fn() }));
vi.mock('../i18n', () => ({ default: { t: (key: string) => key } }));
// The real modal fetches groups; only whether it opens matters here.
vi.mock('./AddToGroupModal', () => ({ default: () => <div data-testid="add-to-group" /> }));

import WordLookupSheet from './WordLookupSheet';

const tap = (over: Partial<TappedWord> = {}): TappedWord => ({
  word: '行いました',
  start: 0,
  end: 5,
  sentence: '会見[かいけん]を行[おこな]いました。',
  sentenceText: '会見を行いました。',
  ...over,
});

beforeEach(() => {
  lookupWord.mockReset();
  sessionStorage.clear();
  auth.isLoggedIn = false;
});

describe('WordLookupSheet', () => {
  it('answers from the article vocabulary without calling the AI', () => {
    render(
      <WordLookupSheet
        tapped={tap({ word: '記者会見', vocab: { word: '記者会見[きしゃかいけん]', reading: '', meaning_zh: '記者會', meaning_en: 'press conference' } })}
        lang="ja"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('記者會')).toBeInTheDocument();
    expect(screen.getByText('press conference')).toBeInTheDocument();
    expect(screen.getByText('wordLookup.fromArticle')).toBeInTheDocument();
    expect(lookupWord).not.toHaveBeenCalled();
  });

  it('asks the AI with the plain sentence and shows the dictionary form', async () => {
    lookupWord.mockResolvedValue({ word: '行[おこな]う', meaningZh: '舉行', meaningEn: 'to hold' });
    render(<WordLookupSheet tapped={tap()} lang="ja" onClose={vi.fn()} />);

    expect(lookupWord).toHaveBeenCalledWith('行いました', '会見を行いました。', 'ja');
    expect(await screen.findByText('舉行')).toBeInTheDocument();
    expect(screen.getByText('wordLookup.fromAi')).toBeInTheDocument();
    // readings (in the word and in the sentence) render as ruby, never as raw brackets
    const readings = screen.getAllByText('おこな');
    expect(readings.length).toBeGreaterThan(0);
    readings.forEach((el) => expect(el.tagName).toBe('RT'));
    expect(screen.queryByText(/\[おこな\]/)).not.toBeInTheDocument();
  });

  it('reuses a cached answer instead of calling the server again', async () => {
    lookupWord.mockResolvedValue({ word: '行[おこな]う', meaningZh: '舉行', meaningEn: 'to hold' });
    const first = render(<WordLookupSheet tapped={tap()} lang="ja" onClose={vi.fn()} />);
    await screen.findByText('舉行');
    first.unmount();

    render(<WordLookupSheet tapped={tap()} lang="ja" onClose={vi.fn()} />);
    expect(await screen.findByText('舉行')).toBeInTheDocument();
    expect(lookupWord).toHaveBeenCalledTimes(1);
  });

  it('shows the quota message when the guest has run out', async () => {
    lookupWord.mockRejectedValue(new Error('AI_QUOTA_EXCEEDED'));
    render(<WordLookupSheet tapped={tap()} lang="ja" onClose={vi.fn()} />);
    expect(await screen.findByText('llm.quotaExceeded')).toBeInTheDocument();
  });

  it('ignores a late answer for a word the reader has moved past', async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    lookupWord
      .mockReturnValueOnce(new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce({ word: '会見[かいけん]', meaningZh: '會見', meaningEn: 'meeting' });

    const { rerender } = render(<WordLookupSheet tapped={tap()} lang="ja" onClose={vi.fn()} />);
    rerender(<WordLookupSheet tapped={tap({ word: '会見', sentenceText: '会見を行いました。 ' })} lang="ja" onClose={vi.fn()} />);
    expect(await screen.findByText('會見')).toBeInTheDocument();

    await act(async () => { resolveFirst({ word: '行[おこな]う', meaningZh: '舉行', meaningEn: 'to hold' }); });
    expect(screen.queryByText('舉行')).not.toBeInTheDocument();
    expect(screen.getByText('會見')).toBeInTheDocument();
  });

  it('offers saving only to members', async () => {
    lookupWord.mockResolvedValue({ word: 'attend', meaningZh: '出席', meaningEn: 'to be present' });
    const guest = render(<WordLookupSheet tapped={tap({ word: 'attend', sentence: 'He will attend.', sentenceText: 'He will attend.' })} lang="en" onClose={vi.fn()} />);
    await screen.findByText('出席');
    expect(screen.queryByText('wordLookup.saveToList')).not.toBeInTheDocument();
    expect(screen.getByText('wordLookup.saveLoginHint')).toBeInTheDocument();
    guest.unmount();

    auth.isLoggedIn = true;
    render(<WordLookupSheet tapped={tap({ word: 'attend', sentence: 'He will attend.', sentenceText: 'He will attend.' })} lang="en" onClose={vi.fn()} />);
    await screen.findByText('出席');
    act(() => { screen.getByText('wordLookup.saveToList').click(); });
    await waitFor(() => expect(screen.getByTestId('add-to-group')).toBeInTheDocument());
    // the sheet steps aside so the modal is not covered
    expect(screen.queryByText('出席')).not.toBeInTheDocument();
  });

  it('closes on Escape and on the close button', () => {
    const onClose = vi.fn();
    render(<WordLookupSheet tapped={tap({ vocab: { word: 'x', reading: '', meaning_zh: 'x', meaning_en: 'x' } })} lang="ja" onClose={onClose} />);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    act(() => { screen.getByLabelText('wordLookup.close').click(); });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
