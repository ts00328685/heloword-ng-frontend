import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtClock } from './TakeCard';
import { recLabel, RecStatus } from './Recorder';

interface Props {
  status: RecStatus;
  onToggle: () => void;
}

/**
 * Floating record / stop button, so you can start and end a take while
 * watching the charts. The page hides it while the Recorder panel's own
 * button is on screen.
 */
const RecordDock: React.FC<Props> = ({ status, onToggle }) => {
  const { t } = useTranslation();
  const { phase, startedAt } = status;
  const recording = phase === 'recording';
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!recording) return;
    const tick = () => setElapsed((performance.now() - startedAt) / 1000);
    tick();
    const id = window.setInterval(tick, 250);
    return () => clearInterval(id);
  }, [recording, startedAt]);

  return (
    <button
      onClick={onToggle}
      disabled={phase === 'starting' || phase === 'stopping'}
      className={`pointer-events-auto shrink-0 flex items-center gap-2 py-1.5 pl-1.5 pr-3.5 rounded-2xl border shadow-lg text-sm font-semibold transition-colors disabled:opacity-60 ${
        recording
          ? 'border-danger bg-danger text-paper hover:brightness-95'
          : 'border-line bg-surface text-ink hover:bg-paper'
      }`}
      title={recording ? t('vocal.recorder.stopTitle') : t('vocal.recorder.startTitle')}
      aria-pressed={recording}
    >
      <span className={`w-9 h-9 rounded-full flex items-center justify-center ${recording ? 'bg-paper/20' : 'bg-ink'}`}>
        {recording
          ? <span className="w-3 h-3 rounded-sm bg-paper" />
          : <span className="w-3 h-3 rounded-full bg-danger" />}
      </span>
      {recording ? (
        <span className="flex flex-col items-start leading-tight">
          <span className="flex items-center gap-1 font-mono text-xs tabular-nums">
            <span className="w-1.5 h-1.5 rounded-full bg-paper animate-pulse" />
            {fmtClock(elapsed)}
          </span>
          <span className="text-[11px] font-semibold">{t('vocal.recorder.stopSave')}</span>
        </span>
      ) : (
        <span>{recLabel(phase, t('vocal.recorder.dockStart'), t)}</span>
      )}
    </button>
  );
};

export default RecordDock;
