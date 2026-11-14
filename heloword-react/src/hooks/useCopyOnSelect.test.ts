// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COPY_ON_SELECT_KEY, useCopyOnSelect } from './useCopyOnSelect';

const select = (el: Node) => {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
};

const release = () => {
  document.dispatchEvent(new Event('pointerdown'));
  document.dispatchEvent(new Event('pointerup'));
  vi.advanceTimersByTime(1000);
};

describe('useCopyOnSelect', () => {
  let writeText: ReturnType<typeof vi.fn>;
  let announced: string[];
  const onAnnounce = (e: Event) => announced.push((e as CustomEvent<{ text: string }>).detail.text);

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    announced = [];
    window.addEventListener('hw-chatbot-word-copied', onAnnounce);
    document.body.innerHTML = '<p id="p">  食べる </p><textarea id="t">typed</textarea>';
  });

  afterEach(() => {
    window.removeEventListener('hw-chatbot-word-copied', onAnnounce);
    window.getSelection()?.removeAllRanges();
    vi.useRealTimers();
  });

  it('copies and announces highlighted text once the pointer is released', () => {
    renderHook(() => useCopyOnSelect());
    select(document.getElementById('p')!);
    release();
    expect(writeText).toHaveBeenCalledWith('食べる');
    expect(announced).toEqual(['食べる']);
  });

  it('does not repeat for the same lingering selection', () => {
    renderHook(() => useCopyOnSelect());
    select(document.getElementById('p')!);
    release();
    release();
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it('ignores selections inside editable fields', () => {
    renderHook(() => useCopyOnSelect());
    select(document.getElementById('t')!);
    release();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('does nothing when the setting is off', () => {
    localStorage.setItem(COPY_ON_SELECT_KEY, 'false');
    renderHook(() => useCopyOnSelect());
    select(document.getElementById('p')!);
    release();
    expect(writeText).not.toHaveBeenCalled();
    expect(announced).toEqual([]);
  });
});
