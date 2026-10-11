import React from 'react';
import { useTranslation } from 'react-i18next';
import { clampBpm, MetronomeApi } from './useMetronome';
import { usePersistedState } from './usePersistedState';

/**
 * Compact metronome pinned above the bottom tabs, so the beat stays visible
 * while you watch the charts. The page hides it while the full Metronome
 * panel is on screen.
 */
const MetronomeDock: React.FC<{ m: MetronomeApi }> = ({ m }) => {
  const { t } = useTranslation();
  const [minimized, setMinimized] = usePersistedState('metronome-dock-min', false);
  const { bpm, setBpm, beats, playing, currentBeat, toggle } = m;

  const playBtn = (
    <button
      onClick={toggle}
      className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-white transition-colors ${
        playing ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
      }`}
      aria-label={playing ? t('vocal.metronome.stopAria') : t('vocal.metronome.startAria')}
      title={t('vocal.metronome.dockTitle')}
    >
      {playing ? <span className="w-3 h-3 rounded-sm bg-white" /> : <span className="ml-0.5 w-0 h-0 border-y-[6px] border-y-transparent border-l-[10px] border-l-white" />}
    </button>
  );
  const step = 'w-7 h-7 shrink-0 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 text-base leading-none';
  const shell = 'pointer-events-auto flex items-center rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 backdrop-blur shadow-lg';

  return (
    <div
      className="fixed inset-x-0 z-30 px-4 pointer-events-none"
      style={{ bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="mx-auto max-w-3xl flex justify-end">
        {minimized ? (
          <div className={`${shell} gap-2 pl-1.5 pr-2 py-1.5`}>
            {playBtn}
            <span className={`w-2.5 h-2.5 rounded-full transition-colors duration-75 ${
              currentBeat === -1 ? 'bg-gray-200 dark:bg-gray-700' : currentBeat === 0 ? 'bg-green-500' : 'bg-blue-500'
            }`} />
            <span className="text-xs font-mono text-gray-600 dark:text-gray-300 tabular-nums">{bpm}</span>
            <button onClick={() => setMinimized(false)} className={step} aria-label={t('vocal.metronome.expand')}>▴</button>
          </div>
        ) : (
          <div className={`${shell} w-full gap-2 sm:gap-3 px-2 py-1.5`}>
            {playBtn}
            {/* Beat dots — shrink for long bars */}
            <div className="flex-1 min-w-0 flex items-center justify-center flex-wrap gap-1">
              {Array.from({ length: beats }, (_, i) => (
                <span
                  key={i}
                  className={`${beats > 8 ? 'w-2 h-2' : 'w-3 h-3'} rounded-full transition-colors duration-75 ${
                    currentBeat === i ? (i === 0 ? 'bg-green-500' : 'bg-blue-500') : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center shrink-0">
              <button className={step} onClick={() => setBpm((b) => clampBpm(b - 1))} aria-label={t('vocal.metronome.decrease')}>−</button>
              <span className="w-16 text-center text-sm font-semibold text-gray-700 dark:text-gray-200 tabular-nums">
                {bpm}<span className="ml-0.5 text-[10px] font-normal text-gray-400">BPM</span>
              </span>
              <button className={step} onClick={() => setBpm((b) => clampBpm(b + 1))} aria-label={t('vocal.metronome.increase')}>+</button>
            </div>
            <button onClick={() => setMinimized(true)} className={step} aria-label={t('vocal.metronome.minimise')}>▾</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MetronomeDock;
