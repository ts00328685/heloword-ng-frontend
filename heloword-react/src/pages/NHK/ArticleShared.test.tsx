// @vitest-environment jsdom
/**
 * Playback + word-highlight behaviour of the article paragraph cards.
 *
 * The interesting part is the index mapping: the speech engine reports offsets
 * into the *cleaned* text (ruby/bracket annotations stripped), while the
 * highlight has to land on the *displayed* text, annotations included.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NHKParagraph } from '../../services/nhkArticle.service';
import { ParagraphCard, useArticleSpeech } from './ArticleShared';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// ─── Fake speech engine ──────────────────────────────────────────────────────

interface BoundaryEvent { charIndex: number; charLength?: number; name?: string }

class FakeUtterance {
  text: string;
  lang = '';
  rate = 1;
  volume = 1;
  pitch = 1;
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onboundary: ((e: BoundaryEvent) => void) | null = null;
  constructor(text: string) { this.text = text; }
}

let spoken: FakeUtterance[] = [];
const cancel = vi.fn();

beforeEach(() => {
  spoken = [];
  cancel.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
  (globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance =
    FakeUtterance;
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: () => [{ lang: 'ja-JP' }, { lang: 'zh-TW' }],
      speak: (u: FakeUtterance) => { spoken.push(u); },
      cancel,
      addEventListener: vi.fn(),
    },
  });
});

const paragraph = (original: string, zh = ''): NHKParagraph => ({
  original,
  ja: original,
  en: '',
  zh,
  grammar: '',
  vocabulary: [],
});

const Harness: React.FC<{ paragraphs: NHKParagraph[] }> = ({ paragraphs }) => {
  const { speakingKey, speakingMode, spokenRange, triggerSpeak } = useArticleSpeech({
    paragraphs,
    activeLang: 'zh',
  });
  return (
    <>
      {paragraphs.map((p, i) => (
        <ParagraphCard
          key={i}
          paragraph={p}
          activeLang="zh"
          index={i}
          speakingKey={speakingKey}
          speakingMode={speakingMode}
          spokenRange={spokenRange}
          onSpeak={triggerSpeak}
        />
      ))}
    </>
  );
};

const play = (mode: 'nhk.playSequence' | 'nhk.playOnce' | 'nhk.playRepeat', index = 0) =>
  fireEvent.click(screen.getAllByLabelText(mode)[index]);

const boundary = (utterance: FakeUtterance, e: BoundaryEvent) =>
  act(() => { utterance.onboundary?.({ name: 'word', ...e }); });

/** The inner <mark> is the current word; the outer one is the phrase band. */
const marked = () => document.querySelector('mark mark')?.textContent ?? null;
const phrase = () => document.querySelector('mark')?.textContent ?? null;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('article playback', () => {
  it('speaks the cleaned text, without ruby annotations', () => {
    render(<Harness paragraphs={[paragraph('台北[たいぺい]にまた')]} />);
    play('nhk.playOnce');
    expect(spoken).toHaveLength(1);
    expect(spoken[0].text).toBe('台北にまた');
  });

  it('highlights the spoken word in the displayed text', () => {
    render(<Harness paragraphs={[paragraph('Hello (loudly) world')]} />);
    play('nhk.playOnce');
    // "world" starts at index 6 of the cleaned "Hello world"…
    boundary(spoken[0], { charIndex: 6, charLength: 5 });
    // …but at index 15 of the text on screen.
    expect(marked()).toBe('world');
    // The phrase band around it carries the annotation the engine never saw.
    expect(phrase()).toBe('Hello (loudly) world');
  });

  it('maps a highlight back across a stripped annotation', () => {
    render(<Harness paragraphs={[paragraph('台北[たいぺい]にまた')]} />);
    play('nhk.playOnce');
    boundary(spoken[0], { charIndex: 0, charLength: 2 });
    expect(marked()).toBe('台北');
    // A word spanning the annotation keeps the annotation inside the highlight.
    boundary(spoken[0], { charIndex: 1, charLength: 2 });
    expect(marked()).toBe('北[たいぺい]に');
  });

  it('falls back to the next whitespace when the engine omits charLength', () => {
    render(<Harness paragraphs={[paragraph('Hello (loudly) world')]} />);
    play('nhk.playOnce');
    boundary(spoken[0], { charIndex: 0 });
    expect(marked()).toBe('Hello');
  });

  it('clears the highlight when playback stops', () => {
    render(<Harness paragraphs={[paragraph('Hello world')]} />);
    play('nhk.playOnce');
    boundary(spoken[0], { charIndex: 0, charLength: 5 });
    expect(marked()).toBe('Hello');
    fireEvent.click(screen.getAllByLabelText('nhk.stopPlaying')[0]);
    expect(marked()).toBeNull();
  });

  it('sequence mode continues into the next paragraph and re-anchors the highlight', () => {
    render(<Harness paragraphs={[paragraph('First one'), paragraph('Second one')]} />);
    play('nhk.playSequence');
    boundary(spoken[0], { charIndex: 0, charLength: 5 });
    expect(marked()).toBe('First');

    act(() => { spoken[0].onend?.(); });
    expect(spoken).toHaveLength(2);
    expect(spoken[1].text).toBe('Second one');
    expect(marked()).toBeNull();

    boundary(spoken[1], { charIndex: 0, charLength: 6 });
    expect(marked()).toBe('Second');
  });

  it('once mode stops after a single paragraph', () => {
    render(<Harness paragraphs={[paragraph('First one'), paragraph('Second one')]} />);
    play('nhk.playOnce');
    act(() => { spoken[0].onend?.(); });
    expect(spoken).toHaveLength(1);
  });

  it('repeat mode plays the same paragraph again', async () => {
    vi.useFakeTimers();
    try {
      render(<Harness paragraphs={[paragraph('First one'), paragraph('Second one')]} />);
      play('nhk.playRepeat');
      act(() => { spoken[0].onend?.(); });
      act(() => { vi.advanceTimersByTime(600); });
      expect(spoken).toHaveLength(2);
      expect(spoken[1].text).toBe('First one');
    } finally {
      vi.useRealTimers();
    }
  });
});
