import { useEffect } from 'react';

/**
 * Publishes the *visible* viewport height as `--vvh` on <html>.
 *
 * iOS Safari overlays the on-screen keyboard rather than resizing the layout
 * viewport, and ignores `interactive-widget=resizes-content`, so `100dvh` still
 * measures the full screen while the bottom third is covered by the keyboard —
 * a bottom-anchored composer ends up underneath it, invisible exactly while
 * you're typing into it. VisualViewport reports the genuinely visible area, so
 * a full-height layout can size itself against that instead.
 *
 * Also pins the window scroll to the top: iOS scrolls the *page* to reveal a
 * focused input, which would otherwise drag the header off-screen even though
 * the container is already sized to fit.
 */
export function useViewportHeight(enabled = true): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!enabled || !vv) return;

    const apply = () => {
      document.documentElement.style.setProperty('--vvh', `${vv.height}px`);
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };

    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      document.documentElement.style.removeProperty('--vvh');
    };
  }, [enabled]);
}
