import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { convertToMp3 } from './encodeMp3';
import { KeySig, spellNote } from './music';
import { peakLevel, takeStats } from './stats';
import { Take } from './takeStore';
import { fmtTakeTime } from './useMicAnalyser';

const SPEEDS = [0.5, 0.75, 1];
/** Volume slider range: up to +9.5 dB of boost for quiet takes. */
const MAX_GAIN = 3;
/** Normalize brings the loudest moment to this level (≈ −1 dBFS) so it doesn't clip. */
const NORMALIZE_PEAK = 0.89;

const toDb = (gain: number) => (gain <= 0 ? '−∞ dB' : `${gain >= 1 ? '+' : ''}${(20 * Math.log10(gain)).toFixed(1)} dB`);

/**
 * One AudioContext for all take players. A player is routed through it only
 * once its volume leaves 100% — `<audio>.volume` can't go above 1, a GainNode can.
 */
let playbackCtx: AudioContext | null = null;
const getPlaybackCtx = () => (playbackCtx ??= new AudioContext());

interface Props {
  take: Take;
  keySig: KeySig | null;
  /** This take is the one shown in the Pitch/Waveform panels. */
  active: boolean;
  /** Play, seek or "Show meters" — show this take in the meters. */
  onActivate: (audio: HTMLAudioElement) => void;
  /** A–B markers changed (null when unset). */
  onLoopChange: (loop: { a: number; b: number } | null) => void;
  onRename: (name: string) => void;
  /** Name edit finished — persist it. */
  onRenameCommit: () => void;
  onExport: () => void;
  onDelete: () => void;
  /** Volume changed — used for playback and for the saved MP3. */
  onGainChange: (gain: number) => void;
}

export const fmtClock = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
export const safeFileName = (s: string) => s.trim().replace(/[\\/:*?"<>|]+/g, '_') || 'recording';

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const btn = 'px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors';
const idle = 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600';

/** One recorded or imported take: player, stats, practice-loop controls and actions. */
const TakeCard: React.FC<Props> = ({ take, keySig, active, onActivate, onLoopChange, onRename, onRenameCommit, onExport, onDelete, onGainChange }) => {
  const { t, i18n } = useTranslation();
  /** Dates follow the app language (Traditional Chinese for zh). */
  const dateLocale = i18n.language === 'zh' ? 'zh-TW' : i18n.language;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** True while the duration workaround is seeking, so it isn't mistaken for the user. */
  const fixingRef = useRef(false);
  const [rate, setRate] = useState(1);
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const [looping, setLooping] = useState(false);
  /** MP3 conversion progress (0…1), or null when idle. */
  const [mp3Progress, setMp3Progress] = useState<number | null>(null);
  const [mp3Error, setMp3Error] = useState<string | null>(null);

  const stats = useMemo(() => takeStats(take.meters.pitch), [take.meters.pitch]);
  const hasMeters = take.meters.pitch.length > 0;

  // ── Volume ──
  const gain = take.gain ?? 1;
  const peak = useMemo(() => peakLevel(take.meters.wave), [take.meters.wave]);
  const clips = peak > 0 && peak * gain > 1;
  const gainNodeRef = useRef<GainNode | null>(null);

  /** Route this player through a GainNode (once — an element can only be captured one time). */
  const ensureGainNode = () => {
    const el = audioRef.current;
    if (gainNodeRef.current || !el) return gainNodeRef.current;
    const ctx = getPlaybackCtx();
    const node = ctx.createGain();
    node.gain.value = gain;
    ctx.createMediaElementSource(el).connect(node).connect(ctx.destination);
    gainNodeRef.current = node;
    return node;
  };

  useEffect(() => {
    if (gain === 1 && !gainNodeRef.current) return; // untouched takes play directly
    const node = ensureGainNode();
    node?.gain.setTargetAtTime(gain, node.context.currentTime, 0.02);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gain]);

  const normalize = () => {
    if (peak <= 0) return;
    onGainChange(Math.min(MAX_GAIN, Math.round((NORMALIZE_PEAK / peak) * 100) / 100));
  };

  /**
   * Chrome's MediaRecorder writes webm without a duration, so <audio> shows an
   * unseekable "Infinity" bar until played through. Seeking far past the end
   * forces the browser to compute the real duration.
   */
  const onLoaded = () => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = el.defaultPlaybackRate = rate;
    if (Number.isFinite(el.duration)) return;
    fixingRef.current = true;
    const reset = () => {
      el.removeEventListener('timeupdate', reset);
      el.currentTime = 0;
      el.addEventListener('seeked', () => { fixingRef.current = false; }, { once: true });
    };
    el.addEventListener('timeupdate', reset);
    el.currentTime = 1e101;
  };

  // Slow-down keeps the pitch (browsers default to preservesPitch = true; set it explicitly anyway).
  useEffect(() => {
    const el = audioRef.current as (HTMLAudioElement & { webkitPreservesPitch?: boolean }) | null;
    if (!el) return;
    el.preservesPitch = true;
    el.webkitPreservesPitch = true;
    el.playbackRate = el.defaultPlaybackRate = rate;
  }, [rate]);

  const loopRange = a !== null && b !== null && b > a ? { a, b } : null;

  useEffect(() => {
    onLoopChange(loopRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the markers change
  }, [loopRange?.a, loopRange?.b]);

  // Enforce the A–B loop with a frame loop — `timeupdate` only fires ~4×/s and overshoots.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !looping || !loopRange) return;
    if (el.currentTime < loopRange.a || el.currentTime >= loopRange.b) el.currentTime = loopRange.a;
    let raf = 0;
    const tick = () => {
      if (!el.paused && el.currentTime >= loopRange.b) el.currentTime = loopRange.a;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [looping, loopRange?.a, loopRange?.b]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = () => audioRef.current?.currentTime ?? 0;
  const markA = () => {
    const t = now();
    setA(t);
    if (b !== null && b <= t) { setB(null); setLooping(false); }
  };
  const markB = () => {
    const t = now();
    if (t <= (a ?? 0)) return;
    if (a === null) setA(0);
    setB(t);
  };
  const clearLoop = () => { setA(null); setB(null); setLooping(false); };

  const saveMp3 = async () => {
    const filename = `${safeFileName(take.name)}.mp3`;
    if (take.ext === 'mp3' && gain === 1) {
      downloadBlob(take.blob, filename);
      return;
    }
    setMp3Error(null);
    setMp3Progress(0);
    try {
      downloadBlob(await convertToMp3(take.blob, setMp3Progress, gain), filename);
    } catch (e) {
      setMp3Error(t('vocal.take.mp3Failed', { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setMp3Progress(null);
    }
  };

  return (
    <li
      className={`rounded-xl border p-3 transition-colors ${
        active ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-900/10' : 'border-gray-100 dark:border-gray-700'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <input
          value={take.name}
          onChange={(e) => onRename(e.target.value.slice(0, 60))}
          onBlur={onRenameCommit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-gray-800 dark:text-gray-100 rounded-md px-1 -mx-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={t('vocal.take.name')}
        />
        <span className="text-[11px] font-mono text-gray-400 dark:text-gray-500 shrink-0">
          {fmtClock(take.seconds)} · {new Date(take.createdAt).toLocaleString(dateLocale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <audio
        ref={audioRef}
        src={take.url}
        controls
        preload="metadata"
        onLoadedMetadata={onLoaded}
        onPlay={(e) => {
          // Playing is a user gesture — the moment the browser lets a suspended AudioContext start.
          if (gainNodeRef.current) playbackCtx?.resume().catch(() => {});
          onActivate(e.currentTarget);
        }}
        onSeeked={(e) => { if (!fixingRef.current) onActivate(e.currentTarget); }}
        className="w-full h-10"
      />

      {/* Stats */}
      {stats ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
          <span>{t('vocal.take.low')} <b className="text-gray-700 dark:text-gray-200">{spellNote(stats.low, keySig)}</b></span>
          <span>{t('vocal.take.high')} <b className="text-gray-700 dark:text-gray-200">{spellNote(stats.high, keySig)}</b></span>
          <span>{t('vocal.take.range')} <b className="text-gray-700 dark:text-gray-200">{t('vocal.take.semitones', { n: stats.range })}</b></span>
          <span title={t('vocal.take.inTuneTitle')}>{t('vocal.take.inTune')} <b className="text-gray-700 dark:text-gray-200">{Math.round(stats.inTune * 100)}%</b></span>
          <span title={t('vocal.take.avgTitle')}>{t('vocal.take.avg')} <b className="text-gray-700 dark:text-gray-200">±{Math.round(stats.avgCents)}¢</b></span>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">{hasMeters ? t('vocal.take.noSinging') : t('vocal.take.noMeters')}</p>
      )}

      {/* Volume — applied to playback and the saved MP3 */}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <span className="text-[11px] text-gray-500 dark:text-gray-400">{t('vocal.take.vol')}</span>
        <input
          type="range" min={0} max={MAX_GAIN} step={0.05}
          value={gain}
          onChange={(e) => onGainChange(parseFloat(e.target.value))}
          onDoubleClick={() => onGainChange(1)}
          className="w-32 accent-blue-500"
          aria-label={t('vocal.take.volume')}
          title={t('vocal.take.volumeResetTitle')}
        />
        <span className="text-[11px] font-mono text-gray-600 dark:text-gray-300 tabular-nums">
          {Math.round(gain * 100)}% <span className="text-gray-400">({toDb(gain)})</span>
        </span>
        <button onClick={normalize} disabled={peak <= 0} className={`${btn} ${idle} disabled:opacity-40`} title={t('vocal.take.normalizeTitle')}>
          {t('vocal.take.normalize')}
        </button>
        {gain !== 1 && (
          <button onClick={() => onGainChange(1)} className="text-[11px] text-blue-500 hover:underline">{t('vocal.take.reset')}</button>
        )}
        {clips && (
          <span className="text-[11px] font-semibold text-red-500" title={t('vocal.take.clipsTitle')}>
            {t('vocal.take.clips')}
          </span>
        )}
      </div>

      {/* Practice: speed + A–B loop */}
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {SPEEDS.map((s) => (
          <button key={s} onClick={() => setRate(s)} className={`${btn} ${rate === s ? 'bg-blue-500 text-white' : idle}`} title={t('vocal.take.speedTitle')}>
            {s}×
          </button>
        ))}
        <span className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
        <button onClick={markA} className={`${btn} ${idle}`} title={t('vocal.take.setA')}>A</button>
        <button onClick={markB} className={`${btn} ${idle}`} title={t('vocal.take.setB')}>B</button>
        <button
          onClick={() => setLooping((l) => !l)}
          disabled={!loopRange}
          className={`${btn} ${looping && loopRange ? 'bg-emerald-500 text-white' : idle} disabled:opacity-40`}
        >
          {t('vocal.take.loop')}
        </button>
        {(a !== null || b !== null) && (
          <>
            <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400">
              {a !== null ? fmtTakeTime(a) : '–'} → {b !== null ? fmtTakeTime(b) : '–'}
            </span>
            <button onClick={clearLoop} className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-1" aria-label={t('vocal.take.clearLoop')}>✕</button>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-2 mt-2">
        {active ? (
          <span className="mr-auto text-[11px] font-semibold text-blue-500">{t('vocal.take.showing')}</span>
        ) : (
          <button
            onClick={() => { if (audioRef.current) onActivate(audioRef.current); }}
            className="mr-auto px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-40"
            disabled={!hasMeters}
            title={hasMeters ? t('vocal.take.showMetersTitle') : t('vocal.take.noMetersTitle')}
          >
            {t('vocal.take.showMeters')}
          </button>
        )}
        <button
          onClick={saveMp3}
          disabled={mp3Progress !== null}
          className={`${btn} bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-70 tabular-nums`}
          title={t('vocal.take.saveMp3Title')}
        >
          {mp3Progress !== null ? t('vocal.take.converting', { pct: Math.round(mp3Progress * 100) }) : t('vocal.take.saveMp3')}
        </button>
        {take.ext !== 'mp3' && (
          <a
            href={take.url}
            download={`${safeFileName(take.name)}.${take.ext}`}
            className={`${btn} ${idle}`}
            title={t('vocal.take.originalTitle', { ext: take.ext })}
          >
            {t('vocal.take.original')}
          </a>
        )}
        <button onClick={onExport} className={`${btn} ${idle}`} title={t('vocal.take.exportTitle')}>
          {t('vocal.take.export')}
        </button>
        <button onClick={onDelete} className={`${btn} ${idle}`}>
          {t('vocal.take.delete')}
        </button>
      </div>
      {mp3Error && <p className="mt-2 text-[11px] text-red-500">{mp3Error}</p>}
    </li>
  );
};

export default TakeCard;
