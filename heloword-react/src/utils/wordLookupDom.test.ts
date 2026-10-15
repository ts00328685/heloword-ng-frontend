// @vitest-environment jsdom
/**
 * textOffsetFromPoint with a fake layout: every character is a 10px-wide box on one line,
 * numbered across the container's text nodes. jsdom has no caret APIs or layout, so both
 * are stubbed; the logic under test is the caret correction and the offset counting.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { textOffsetFromPoint } from './wordLookup';

const CHAR_W = 10;
let container: HTMLElement;

/** Global character index of (node, offset) inside the container. */
function globalIndex(node: Node, offset: number): number {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let total = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n === node) return total + offset;
    total += n.textContent?.length ?? 0;
  }
  return -1;
}

/** Caret like a real browser: lands on the nearest character boundary to x. */
function caretAt(x: number): { node: Node; offset: number } | null {
  const target = Math.round(x / CHAR_W);
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let total = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = n.textContent?.length ?? 0;
    if (target <= total + len) return { node: n, offset: target - total };
    total += len;
  }
  return null;
}

beforeEach(() => {
  container = document.createElement('p');
  container.innerHTML = '東京で<mark>記者</mark>会見';
  document.body.appendChild(container);

  (document as unknown as { caretRangeFromPoint: (x: number, y: number) => Range | null }).caretRangeFromPoint = (x) => {
    const c = caretAt(x);
    if (!c) return null;
    const r = document.createRange();
    r.setStart(c.node, c.offset);
    return r;
  };
  Range.prototype.getBoundingClientRect = function () {
    const i = globalIndex(this.startContainer, this.startOffset);
    return { left: i * CHAR_W, right: (i + 1) * CHAR_W, top: 0, bottom: 20, width: CHAR_W, height: 20, x: i * CHAR_W, y: 0, toJSON: () => ({}) } as DOMRect;
  };
});

afterEach(() => {
  container.remove();
  delete (document as unknown as { caretRangeFromPoint?: unknown }).caretRangeFromPoint;
});

describe('textOffsetFromPoint', () => {
  it('returns the character under a tap on its left half', () => {
    expect(textOffsetFromPoint(container, 0 * CHAR_W + 2, 10)).toBe(0); // 東
  });

  it('corrects the caret when the right half of a character is tapped', () => {
    // caret snaps to the boundary after 京 (offset 2), but the finger is on 京 (offset 1)
    expect(textOffsetFromPoint(container, 1 * CHAR_W + 8, 10)).toBe(1);
  });

  it('counts offsets across highlight elements', () => {
    expect(textOffsetFromPoint(container, 3 * CHAR_W + 2, 10)).toBe(3); // 記 inside <mark>
    expect(textOffsetFromPoint(container, 5 * CHAR_W + 2, 10)).toBe(5); // 会 after </mark>
  });

  it('returns null below the text line or past its end', () => {
    expect(textOffsetFromPoint(container, 2, 40)).toBeNull();
    expect(textOffsetFromPoint(container, 20 * CHAR_W, 10)).toBeNull();
  });

  it('returns null for a caret outside the container', () => {
    const other = document.createElement('p');
    other.textContent = 'elsewhere';
    document.body.appendChild(other);
    (document as unknown as { caretRangeFromPoint: () => Range }).caretRangeFromPoint = () => {
      const r = document.createRange();
      r.setStart(other.firstChild!, 1);
      return r;
    };
    expect(textOffsetFromPoint(container, 2, 10)).toBeNull();
    other.remove();
  });

  it('works with caretPositionFromPoint (Firefox, newer Chrome) too', () => {
    const d = document as unknown as Record<string, unknown>;
    delete d.caretRangeFromPoint;
    d.caretPositionFromPoint = (x: number) => {
      const c = caretAt(x);
      return c ? { offsetNode: c.node, offset: c.offset } : null;
    };
    try {
      expect(textOffsetFromPoint(container, 3 * CHAR_W + 2, 10)).toBe(3);
      expect(textOffsetFromPoint(container, 1 * CHAR_W + 8, 10)).toBe(1);
    } finally {
      delete d.caretPositionFromPoint;
    }
  });
});
