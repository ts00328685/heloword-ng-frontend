import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Panel, { LiveDot } from './Panel';
import { BEAT_OPTIONS, clampBpm, MAX_BPM, MetronomeApi, MIN_BPM } from './useMetronome';

interface Props {
  m: MetronomeApi;
  /** Whether the panel's controls are on screen — the page shows a compact dock when they aren't. */
  onVisibleChange?: (visible: boolean) => void;
}

/** Collapsible metronome panel; state and audio live in useMetronome. */
const Metronome: React.FC<Props> = ({ m, onVisibleChange }) => {
  const { t } = useTranslation();
  const { bpm, setBpm, volume, setVolume, beats, setBeats, playing, currentBeat, start, stop, tap } = m;
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !onVisibleChange) return;
    // A collapsed panel hides this element, which also reports "not visible".
    const io = new IntersectionObserver(([entry]) => onVisibleChange(entry.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [onVisibleChange]);

  const roundBtn = 'w-8 h-8 shrink-0 rounded-full border border-line text-ink-muted hover:bg-ink/5 transition-colors flex items-center justify-center text-lg leading-none';

  return (
    <Panel
      id="metronome"
      title={t('vocal.panel.metronome')}
      indicator={playing && <LiveDot color="bg-success" />}
      summary={t('vocal.metronome.summary', { bpm, beats })}
    >
      <div ref={bodyRef} className="space-y-5">
        {/* Beat dots */}
        {/* Long bars split into two rows (12 → 6+6, 16 → 8+8) so they fit on a phone */}
        <div
          className="grid justify-center gap-3 pt-1"
          style={{ gridTemplateColumns: `repeat(${beats > 9 ? Math.ceil(beats / 2) : beats}, auto)` }}
        >
          {Array.from({ length: beats }, (_, i) => (
            <span
              key={i}
              className={`w-4 h-4 rounded-full transition-colors duration-75 ${
                currentBeat === i
                  ? i === 0 ? 'bg-success scale-125' : 'bg-ink scale-110'
                  : 'bg-ink/10 '
              }`}
            />
          ))}
        </div>

        {/* BPM */}
        <div>
          <p className="text-center text-3xl font-light text-ink mb-3 tabular-nums">
            {bpm} <span className="text-base text-ink-faint">BPM</span>
          </p>
          <div className="flex items-center gap-3">
            <button className={roundBtn} onClick={() => setBpm((b) => clampBpm(b - 1))} aria-label={t('vocal.metronome.decrease')}>−</button>
            <input
              type="range" min={MIN_BPM} max={MAX_BPM} step={1}
              value={bpm}
              onChange={(e) => setBpm(parseInt(e.target.value, 10))}
              className="flex-1 accent-blue-500"
              aria-label="BPM"
            />
            <button className={roundBtn} onClick={() => setBpm((b) => clampBpm(b + 1))} aria-label={t('vocal.metronome.increase')}>+</button>
          </div>
        </div>

        {/* Volume */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-ink-muted">{t('vocal.metronome.volume')}</span>
            <span className="text-xs font-mono text-accent">{Math.round(volume * 100)}%</span>
          </div>
          <input
            type="range" min={0} max={1} step={0.05}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-full accent-blue-500"
            aria-label={t('vocal.metronome.volumeAria')}
          />
        </div>

        {/* Beats per bar */}
        <div>
          <p className="text-xs text-ink-muted mb-2">{t('vocal.metronome.beatsPerBar')}</p>
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
            {BEAT_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => setBeats(n)}
                className={`h-9 rounded-full text-sm font-semibold transition-colors ${
                  beats === n ? 'bg-success text-white' : 'bg-ink/5 text-ink-muted hover:bg-ink/10 '
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-2">
          <button
            onClick={playing ? stop : start}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-paper transition-colors ${
              playing ? 'bg-danger hover:bg-danger/90' : 'bg-ink hover:bg-ink/85'
            }`}
          >
            {playing ? t('vocal.metronome.stop') : t('vocal.metronome.start')}
          </button>
          <button
            onClick={tap}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-ink/5 text-ink hover:bg-ink/10 transition-colors"
          >
            {t('vocal.metronome.tapTempo')}
          </button>
        </div>
      </div>
    </Panel>
  );
};

export default Metronome;
