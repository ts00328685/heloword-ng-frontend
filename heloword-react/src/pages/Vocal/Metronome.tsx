import React, { useEffect, useRef } from 'react';
import Panel, { LiveDot } from './Panel';
import { BEAT_OPTIONS, clampBpm, MAX_BPM, MetronomeApi, MIN_BPM } from './useMetronome';

interface Props {
  m: MetronomeApi;
  /** Whether the panel's controls are on screen — the page shows a compact dock when they aren't. */
  onVisibleChange?: (visible: boolean) => void;
}

/** Collapsible metronome panel; state and audio live in useMetronome. */
const Metronome: React.FC<Props> = ({ m, onVisibleChange }) => {
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

  const roundBtn = 'w-8 h-8 shrink-0 rounded-full border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-center text-lg leading-none';

  return (
    <Panel
      id="metronome"
      title="Metronome"
      indicator={playing && <LiveDot color="bg-green-500" />}
      summary={`${bpm} BPM · ${beats} beats`}
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
                  ? i === 0 ? 'bg-green-500 scale-125' : 'bg-blue-500 scale-110'
                  : 'bg-gray-200 dark:bg-gray-700'
              }`}
            />
          ))}
        </div>

        {/* BPM */}
        <div>
          <p className="text-center text-3xl font-light text-gray-800 dark:text-gray-100 mb-3 tabular-nums">
            {bpm} <span className="text-base text-gray-400">BPM</span>
          </p>
          <div className="flex items-center gap-3">
            <button className={roundBtn} onClick={() => setBpm((b) => clampBpm(b - 1))} aria-label="Decrease BPM">−</button>
            <input
              type="range" min={MIN_BPM} max={MAX_BPM} step={1}
              value={bpm}
              onChange={(e) => setBpm(parseInt(e.target.value, 10))}
              className="flex-1 accent-blue-500"
              aria-label="BPM"
            />
            <button className={roundBtn} onClick={() => setBpm((b) => clampBpm(b + 1))} aria-label="Increase BPM">+</button>
          </div>
        </div>

        {/* Volume */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-gray-600 dark:text-gray-300">Volume</span>
            <span className="text-xs font-mono text-blue-500">{Math.round(volume * 100)}%</span>
          </div>
          <input
            type="range" min={0} max={1} step={0.05}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-full accent-blue-500"
            aria-label="Metronome volume"
          />
        </div>

        {/* Beats per bar */}
        <div>
          <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">Beats per bar</p>
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
            {BEAT_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => setBeats(n)}
                className={`h-9 rounded-full text-sm font-semibold transition-colors ${
                  beats === n ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
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
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors ${
              playing ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            {playing ? 'Stop' : 'Start'}
          </button>
          <button
            onClick={tap}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Tap tempo
          </button>
        </div>
      </div>
    </Panel>
  );
};

export default Metronome;
