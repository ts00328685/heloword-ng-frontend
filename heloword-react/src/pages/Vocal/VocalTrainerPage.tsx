import React from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { useTheme } from '../../contexts/ThemeContext';
import { midiToFreq } from './pitch';
import { useMicAnalyser } from './useMicAnalyser';
import PitchGraph from './PitchGraph';
import WaveformView from './WaveformView';
import Metronome from './Metronome';
import Recorder from './Recorder';
import Panel, { LiveDot } from './Panel';

/**
 * Standalone singing tools: live pitch trace, input waveform and a metronome.
 * Entirely client-side — nothing is recorded or sent anywhere.
 */
const VocalTrainerPage: React.FC = () => {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const { dataRef, running, error, note, start, stop } = useMicAnalyser();

  const cents = note?.cents ?? 0;
  const inTune = note !== null && Math.abs(cents) <= 10;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 animate-page-enter">
      <Header title={t('vocal.title', 'Vocal Trainer')} showBack />

      <main className="flex-1 pb-24 px-4 pt-6 max-w-3xl mx-auto w-full space-y-4">
        <Panel
          id="pitch"
          title="Pitch"
          indicator={running && <LiveDot color="bg-blue-500" />}
          summary={note ? `${note.name} ${cents > 0 ? '+' : ''}${cents}¢` : running ? '--' : 'mic off'}
        >
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
              onClick={running ? stop : () => { start(); }}
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

          <PitchGraph dataRef={dataRef} isDark={isDark} />
        </Panel>

        <Panel id="waveform" title="Waveform">
          <WaveformView dataRef={dataRef} isDark={isDark} />
        </Panel>

        <Recorder getStream={start} />

        <Metronome />

        <p className="text-center text-[11px] text-gray-400 dark:text-gray-500">
          Audio stays in your browser — nothing is uploaded. Recordings are only saved when you press Save. Headphones help keep the metronome out of the pitch trace.
        </p>
      </main>
    </div>
  );
};

export default VocalTrainerPage;
