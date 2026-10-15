// @vitest-environment jsdom
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'zh' } }) }));
vi.mock('../i18n', () => ({ default: { t: (key: string) => key } }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ isLoggedIn: false }) }));
vi.mock('../services/analytics.service', () => ({ track: vi.fn() }));
vi.mock('../services/tts.service', () => ({ pronounceWord: vi.fn(), cleanSentenceForTTS: (s: string) => s, toLangCode: () => 'en-US' }));

const getNatural = vi.fn();
vi.mock('../services/llm.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/llm.service')>();
  return {
    ...actual,
    getNatural: (...a: unknown[]) => getNatural(...a),
    getAiQuota: () => Promise.resolve({ guest: true, limit: 10, remaining: 9 }),
  };
});

import ChatBot from './ChatBot';

const openAndType = (text: string) => {
  render(<MemoryRouter initialEntries={['/home']}><ChatBot /></MemoryRouter>);
  fireEvent.click(screen.getAllByLabelText('chatbot.title')[0]);
  fireEvent.change(screen.getByPlaceholderText('chatbot.placeholder'), { target: { value: text } });
};

beforeEach(() => {
  getNatural.mockReset();
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});

describe('ChatBot — natural phrasing', () => {
  it('shows the textbook, natural and casual versions with the note', async () => {
    getNatural.mockResolvedValue({ lang: 'en', natural: "How's it going?", casual: "What's up?", note: '原句較正式，自然說法用於一般問候。' });
    openAndType('How are you?');
    fireEvent.click(screen.getByText('llm.natural'));

    expect(await screen.findByText("How's it going?")).toBeInTheDocument();
    expect(getNatural).toHaveBeenCalledWith('How are you?');
    expect(screen.getByText("What's up?")).toBeInTheDocument();
    expect(screen.getByText('原句較正式，自然說法用於一般問候。')).toBeInTheDocument();
    expect(screen.getByText('llm.naturalOriginal')).toBeInTheDocument();
    // phrase cards don't get the single-word tools
    expect(screen.queryByText('llm.memoryHook')).not.toBeInTheDocument();
  });

  it('rejects Chinese input without calling the server', async () => {
    openAndType('我想喝咖啡');
    fireEvent.click(screen.getByText('llm.natural'));
    expect(await screen.findByText('llm.naturalLangOnly')).toBeInTheDocument();
    expect(getNatural).not.toHaveBeenCalled();
  });

  it('explains a server-side rejection the same way', async () => {
    getNatural.mockRejectedValue(new Error('AI_INVALID_INPUT'));
    openAndType('OK');
    fireEvent.click(screen.getByText('llm.natural'));
    expect(await screen.findByText('llm.naturalLangOnly')).toBeInTheDocument();
  });

  it('shows the guest quota message when out of free uses', async () => {
    getNatural.mockRejectedValue(new Error('AI_QUOTA_EXCEEDED'));
    openAndType('How are you?');
    fireEvent.click(screen.getByText('llm.natural'));
    await waitFor(() => expect(screen.getByText('llm.quotaExceeded')).toBeInTheDocument());
  });
});
