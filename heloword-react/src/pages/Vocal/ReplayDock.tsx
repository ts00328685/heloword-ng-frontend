import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtClock } from './TakeCard';
import { LatestTake } from './Recorder';

interface Props {
  latest: LatestTake;
  /** The latest take's own <audio>, so playing it also drives the replay view. */
  getAudio: () => HTMLAudioElement | null;
  /** E.g. while recording — playback would end up in the take. */
  disabled: boolean;
}

/**
 * Floating play / pause for the newest take, between the record button and
 * the metronome, so you can hear what you just sang without scrolling.
 */
const ReplayDock: React.FC<Props> = ({ latest, getAudio, disabled }) => {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);

  // Follow the take's player, whichever button started it.
  useEffect(() => {
    const el = getAudio();
    setPlaying(!!el && !el.paused);
    setTime(el?.currentTime ?? 0);
    if (!el) return;
    const sync = () => { setPlaying(!el.paused); setTime(el.currentTime); };
    const events = ['play', 'pause', 'ended', 'timeupdate', 'seeked'] as const;
    events.forEach((e) => el.addEventListener(e, sync));
    return () => events.forEach((e) => el.removeEventListener(e, sync));
    // The player element changes with the latest take.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest.id]);

  const toggle = () => {
    const el = getAudio();
    if (!el) return;
    // A finished take starts over from the beginning.
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };

  return (
    <button
      onClick={toggle}
      disabled={disabled}
      className="pointer-events-auto shrink-0 flex items-center gap-2 py-1.5 pl-1.5 pr-3.5 rounded-2xl border border-line bg-surface text-ink shadow-lg text-sm font-semibold transition-colors hover:bg-paper disabled:opacity-50"
      title={playing ? t('vocal.recorder.dockPauseTitle') : t('vocal.recorder.dockPlayTitle')}
      aria-pressed={playing}
    >
      <span className="w-9 h-9 rounded-full flex items-center justify-center bg-ink text-paper">
        {playing ? (
          <span className="flex gap-[3px]"><span className="w-[3px] h-3 rounded-sm bg-current" /><span className="w-[3px] h-3 rounded-sm bg-current" /></span>
        ) : (
          <svg className="w-3.5 h-3.5 ml-0.5" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2 1.2v9.6a.6.6 0 0 0 .9.5l8-4.8a.6.6 0 0 0 0-1L2.9.7a.6.6 0 0 0-.9.5z" /></svg>
        )}
      </span>
      <span className="flex flex-col items-start leading-tight">
        <span className="text-[11px] font-semibold">{t('vocal.recorder.dockLatest')}</span>
        <span className="font-mono text-xs text-ink-muted tabular-nums">
          {playing || time > 0 ? `${fmtClock(time)} / ${fmtClock(latest.seconds)}` : fmtClock(latest.seconds)}
        </span>
      </span>
    </button>
  );
};

export default ReplayDock;
