// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import FuriganaText from './FuriganaText';
import { setFuriganaMode } from '../utils/furigana';

const SRC = '今日[きょう]は記者会見[きしゃかいけん]がある。注意[note]';

describe('FuriganaText', () => {
  beforeEach(() => localStorage.clear());

  it('renders readings above the kanji by default', () => {
    const { container } = render(<FuriganaText text={SRC} />);
    const rubies = container.querySelectorAll('ruby');
    expect(rubies).toHaveLength(2);
    expect(rubies[1].querySelector('rt')?.textContent).toBe('[きしゃかいけん]');
  });

  it('keeps every source character in the DOM (tap/highlight offsets stay exact)', () => {
    const { container } = render(<FuriganaText text={SRC} />);
    expect(container.textContent).toBe(SRC);
  });

  it('renders readings beside the kanji when chosen, with the same text', () => {
    setFuriganaMode('side');
    const { container } = render(<FuriganaText text={SRC} />);
    expect(container.querySelectorAll('ruby')).toHaveLength(0);
    expect(container.querySelectorAll('.furigana-side')).toHaveLength(2);
    expect(container.textContent).toBe(SRC);
  });

  it('switches live when the preference changes', () => {
    const { container } = render(<FuriganaText text={SRC} />);
    expect(container.querySelectorAll('ruby')).toHaveLength(2);
    act(() => setFuriganaMode('side'));
    expect(container.querySelectorAll('ruby')).toHaveLength(0);
  });

  it('leaves non-kana brackets as plain text', () => {
    const { container } = render(<FuriganaText text="注意[note]" />);
    expect(container.querySelector('ruby')).toBeNull();
    expect(container.textContent).toBe('注意[note]');
  });
});
