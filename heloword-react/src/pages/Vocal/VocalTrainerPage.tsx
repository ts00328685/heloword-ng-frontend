import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { useTheme } from '../../contexts/ThemeContext';
import { midiToFreq } from './pitch';
import { useMicAnalyser } from './useMicAnalyser';
import PitchGraph from './PitchGraph';
import WaveformView from './WaveformView';
import Metronome from './Metronome';

const SPANS = [
  { label: '1 oct', semis: 12 },
  { label: '2 oct', semis: 24 },
  { label: '3 oct', semis: 36 },
];

const card = 'bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm';

/**
 * Standalone singing tools: live pitch trace, input waveform and a metronome.
 * Entirely client-side — nothing is recorded or sent anywhere.
 */
const VocalTrainerPage: React.FC = () => {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const { dataRef, running, error, note, start, stop } = useMicAnalyser();
  const [span, setSpan] = useState(24);
  const [showWave, setShowWave] = useState(true);

  const cents = note?.cents ?? 0;
  const inTune = note !== null && Math.abs(cents) <= 10;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 animate-page-enter">
      <Header title={t('vocal.title', 'Vocal Trainer')} showBack />

      <main className="flex-1 pb-24 px-4 pt-6 max-w-3xl mx-auto w-full space-y-4">
        {/* Pitch */}
        <section className={`${card} p-4 sm:p-5`}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-baseline gap-3 min-w-0">
              <span className={`text-4xl font-bold tabular-nums w-20 ${note ? 'text-gray-900 dark:text-gray-100' : 'text-gray-300 dark:text-gray-600'}`}>
                {note?.name ?? '--'}
              </span>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
                  {note ? `${midiToFreq(note.midi + cents / 100).toFixed(1)} Hz` : '— Hz'}
                </span>
                {/* Cents meter: -50 … +50 */}
                <div className="relative w-28 h-2 rounded-full bg-gray-100 dark:bg-gray-700">
                  <span className="absolute left-1/2 top-0 w-px h-2 bg-gray-300 dark:bg-gray-500" />
                  {note && (
                    <span
                      className={`absolute top-1/2 w-2.5 h-2.5 -mt-[5px] -ml-[5px] rounded-full ${inTune ? 'bg-green-500' : 'bg-amber-500'}`}
                      style={{ left: `${50 + cents}%` }}
                    />
                  )}
                </div>
                <span className={`text-[11px] font-mono ${note ? (inTune ? 'text-green-500' : 'text-amber-500') : 'text-transparent'}`}>
                  {cents > 0 ? '+' : ''}{cents}¢
                </span>
              </div>
            </div>
            <button
              onClick={running ? stop : start}
              className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors ${
                running ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${running ? 'bg-white animate-pulse' : 'bg-white/70'}`} />
              {running ? 'Stop mic' : 'Start mic'}
            </button>
          </div>

          {error && (
            <p className="mb-3 text-xs text-red-500">
              Microphone unavailable: {error}
            </p>
          )}

          <PitchGraph dataRef={dataRef} isDark={isDark} span={span} />

          <div className="flex items-center justify-between mt-3">
            <span className="text-[11px] text-gray-400 dark:text-gray-500">Last 20 seconds · view follows your voice</span>
            <div className="flex gap-1">
              {SPANS.map((s) => (
                <button
                  key={s.semis}
                  onClick={() => setSpan(s.semis)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    span === s.semis ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Waveform */}
        <section className={`${card} p-4 sm:p-5`}>
          <button
            onClick={() => setShowWave((v) => !v)}
            className="flex items-center justify-between w-full"
          >
            <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Waveform</span>
            <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${showWave ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
              <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform duration-200 ${showWave ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </span>
          </button>
          {showWave && (
            <div className="mt-4">
              <WaveformView dataRef={dataRef} isDark={isDark} />
            </div>
          )}
        </section>

        <Metronome />

        <p className="text-center text-[11px] text-gray-400 dark:text-gray-500">
          Audio is analysed in your browser only — nothing is recorded or uploaded. Headphones help keep the metronome out of the pitch trace.
        </p>
      </main>
    </div>
  );
};

export default VocalTrainerPage;
