import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const STEPS = [
  { tourId: 'tab-home',       emoji: '🏠', titleKey: 'tour.home.title',      descKey: 'tour.home.desc' },
  { tourId: 'tab-vocabulary', emoji: '📖', titleKey: 'tour.quiz.title',      descKey: 'tour.quiz.desc' },
  { tourId: 'tab-review',     emoji: '✅', titleKey: 'tour.review.title',    descKey: 'tour.review.desc' },
  { tourId: 'tab-stats',      emoji: '📊', titleKey: 'tour.stats.title',     descKey: 'tour.stats.desc' },
  { tourId: 'tab-social',     emoji: '👥', titleKey: 'tour.social.title',    descKey: 'tour.social.desc' },
  { tourId: 'tab-challenge',  emoji: '⚡', titleKey: 'tour.challenge.title', descKey: 'tour.challenge.desc' },
];

interface SpotlightInfo {
  left: number;
  top: number;
  width: number;
  height: number;
  cardBottom: number;   // px from bottom of viewport to place the card
  arrowLeft: number;    // px from left of viewport for the arrow tip
}

const WalkthroughOverlay: React.FC = () => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const [spot, setSpot] = useState<SpotlightInfo | null>(null);
  const checkRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Show only once — after guest setup completes
  useEffect(() => {
    if (localStorage.getItem('hw-tour-done')) return;

    const tryShow = () => {
      if (localStorage.getItem('hw-guest-name')) {
        if (checkRef.current) clearInterval(checkRef.current);
        setShow(true);
      }
    };

    if (localStorage.getItem('hw-guest-name')) {
      setShow(true);
    } else {
      checkRef.current = setInterval(tryShow, 300);
    }

    return () => { if (checkRef.current) clearInterval(checkRef.current); };
  }, []);

  // Measure the highlighted tab on each step change (and on resize)
  useEffect(() => {
    if (!show) return;

    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${STEPS[step].tourId}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setSpot({
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
        cardBottom: window.innerHeight - r.top + 16,
        arrowLeft: r.left + r.width / 2,
      });
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [show, step]);

  const dismiss = () => {
    localStorage.setItem('hw-tour-done', '1');
    setShow(false);
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else dismiss();
  };

  if (!show || !spot) return null;

  const current = STEPS[step];

  // Compute the arrow's offset within the tooltip card
  // Card: left-4 (16px), max-w-sm (384px), mx-auto
  const cardLeft = Math.max(16, (window.innerWidth - 384) / 2);
  const cardRight = Math.min(window.innerWidth - 16, (window.innerWidth + 384) / 2);
  const cardWidth = cardRight - cardLeft;
  const arrowInCard = Math.max(20, Math.min(cardWidth - 20, spot.arrowLeft - cardLeft));

  return (
    <>
      {/* Click-outside dismissal layer (below spotlight) */}
      <div className="fixed inset-0 z-[48]" onClick={dismiss} />

      {/* Spotlight: transparent box whose box-shadow darkens everything else */}
      <div
        className="fixed pointer-events-none transition-all duration-300"
        style={{
          left: spot.left - 6,
          top: spot.top - 6,
          width: spot.width + 12,
          height: spot.height + 12,
          borderRadius: 14,
          border: '1.5px solid rgb(var(--accent))',
          boxShadow: '0 0 0 2000px rgba(0,0,0,0.65)',
          zIndex: 49,
        }}
      />

      {/* Tooltip card */}
      <div
        className="fixed left-4 right-4 max-w-sm mx-auto z-[50]"
        style={{ bottom: spot.cardBottom }}
      >
        <div className="bg-surface rounded-2xl shadow-2xl overflow-hidden">
          {/* Blue accent bar */}
          <div className="h-1 bg-ink" />

          <div className="p-5">
            {/* Step counter + skip */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-ink-faint tabular-nums">
                {t('tour.stepOf', { current: step + 1, total: STEPS.length })}
              </span>
              <button
                onClick={dismiss}
                className="text-xs text-ink-faint hover:text-ink-muted transition-colors"
              >
                {t('tour.skip')}
              </button>
            </div>

            {/* Icon + title */}
            <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-base font-semibold text-ink">
                {t(current.titleKey)}
              </h3>
            </div>

            {/* Description */}
            <p className="text-sm text-ink-muted leading-relaxed mb-5">
              {t(current.descKey)}
            </p>

            {/* Step dots + next button */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className={`rounded-full transition-all duration-200 ${
                      i === step
                        ? 'w-4 h-2 bg-ink'
                        : i < step
                        ? 'w-2 h-2 bg-accent-soft '
                        : 'w-2 h-2 bg-ink/10 '
                    }`}
                  />
                ))}
              </div>
              <button
                onClick={next}
                className="bg-ink hover:bg-ink/85 active:bg-ink/85 text-paper text-sm font-semibold px-5 py-2 rounded-xl transition-colors"
              >
                {step < STEPS.length - 1 ? t('tour.next') : t('tour.done')}
              </button>
            </div>
          </div>
        </div>

        {/* Down-pointing arrow aligned to the highlighted tab */}
        <div
          className="absolute bottom-0 translate-y-full w-0 h-0 pointer-events-none"
          style={{
            left: arrowInCard - 8,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: '10px solid white',
            filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.1))',
          }}
        />
      </div>
    </>
  );
};

export default WalkthroughOverlay;
