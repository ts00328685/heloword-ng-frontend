import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { convertToMp3 } from './encodeMp3';
import { KeySig, spellNote } from './music';
import { peakLevel, takeStats } from './stats';
import { QualityCalibration, summariseQuality, zoneOf } from './voiceQuality';
import { ZONE_COLORS } from './ClosureTrace';
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
  calibration: QualityCalibration;
  /** This take is the one shown in the Pitch/Waveform panels. */
  active: boolean;
  /** Play, seek or "Show meters" — show this take in the meters. */
  onActivate: (audio: HTMLAudioElement) => void;
  /** A–B markers changed (null when unset). */
  onLoopChange: (loop: { a: number; b: number } | null) => void;
  /** A finished rename (already trimmed, never empty). */
  onRename: (name: string) => void;
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
const idle = 'bg-ink/5 text-ink-muted hover:bg-ink/10';

/** One recorded or imported take: player, stats, practice-loop controls and actions. */
const TakeCard: React.FC<Props> = ({ take, keySig, calibration, active, onActivate, onLoopChange, onRename, onExport, onDelete, onGainChange }) => {
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
  /** Name being edited, or null when showing the name. */
  const [draftName, setDraftName] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  /** Set by Escape so a blur fired while the input unmounts doesn't save. */
  const cancelNameRef = useRef(false);

  useEffect(() => {
    if (draftName !== null) nameInputRef.current?.select();
    // Only when entering edit mode, not on every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftName !== null]);

  const startRename = () => {
    cancelNameRef.current = false;
    setDraftName(take.name);
  };

  const commitName = () => {
    if (cancelNameRef.current) return;
    const name = (draftName ?? '').trim().slice(0, 60);
    setDraftName(null);
    if (name && name !== take.name) onRename(name);
  };
  /** MP3 conversion progress (0…1), or null when idle. */
  const [mp3Progress, setMp3Progress] = useState<number | null>(null);
  const [mp3Error, setMp3Error] = useState<string | null>(null);

  const stats = useMemo(() => takeStats(take.meters.pitch), [take.meters.pitch]);
  const quality = useMemo(
    () => (take.meters.quality ? summariseQuality(take.meters.quality, calibration) : null),
    [take.meters.quality, calibration],
  );
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
        active ? 'border-accent bg-accent-soft ' : 'border-line '
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        {draftName !== null ? (
          <input
            ref={nameInputRef}
            value={draftName}
            maxLength={60}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                cancelNameRef.current = true;
                setDraftName(null);
              }
            }}
            className="flex-1 min-w-0 px-2 py-1 -my-1 rounded-md border border-accent bg-surface text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-accent"
            aria-label={t('vocal.take.name')}
          />
        ) : (
          <button
            onClick={startRename}
            className="group flex-1 min-w-0 flex items-center gap-1.5 text-left rounded-md px-1 -mx-1 hover:bg-ink/5 transition-colors"
            title={t('vocal.take.rename')}
          >
            <span className="truncate text-sm font-semibold text-ink">{take.name}</span>
            <svg className="w-3.5 h-3.5 shrink-0 text-ink-faint group-hover:text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M4 20h4l10.5-10.5a2.5 2.5 0 00-3.536-3.536L4.5 16.5V20z" />
            </svg>
          </button>
        )}
        <span className="text-[11px] font-mono text-ink-faint shrink-0">
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
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-ink-muted tabular-nums">
          <span>{t('vocal.take.low')} <b className="text-ink">{spellNote(stats.low, keySig)}</b></span>
          <span>{t('vocal.take.high')} <b className="text-ink">{spellNote(stats.high, keySig)}</b></span>
          <span>{t('vocal.take.range')} <b className="text-ink">{t('vocal.take.semitones', { n: stats.range })}</b></span>
          <span title={t('vocal.take.inTuneTitle')}>{t('vocal.take.inTune')} <b className="text-ink">{Math.round(stats.inTune * 100)}%</b></span>
          <span title={t('vocal.take.avgTitle')}>{t('vocal.take.avg')} <b className="text-ink">±{Math.round(stats.avgCents)}¢</b></span>
          {quality?.index != null && (
            <span
              title={t('vocal.take.closureTitle', {
                h1h2: quality.h1h2 !== null ? quality.h1h2.toFixed(1) : '—',
                hnr: quality.hnr.toFixed(0),
              })}
            >
              {t('vocal.take.closure')}{' '}
              <b style={{ color: ZONE_COLORS[zoneOf(quality.index)].solid }}>
                {quality.index} · {t(`vocal.quality.zone.${zoneOf(quality.index)}`)}
              </b>
            </span>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-ink-faint">{hasMeters ? t('vocal.take.noSinging') : t('vocal.take.noMeters')}</p>
      )}

      {/* Volume — applied to playback and the saved MP3 */}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <span className="text-[11px] text-ink-muted">{t('vocal.take.vol')}</span>
        <input
          type="range" min={0} max={MAX_GAIN} step={0.05}
          value={gain}
          onChange={(e) => onGainChange(parseFloat(e.target.value))}
          onDoubleClick={() => onGainChange(1)}
          className="w-32 accent-blue-500"
          aria-label={t('vocal.take.volume')}
          title={t('vocal.take.volumeResetTitle')}
        />
        <span className="text-[11px] font-mono text-ink-muted tabular-nums">
          {Math.round(gain * 100)}% <span className="text-ink-faint">({toDb(gain)})</span>
        </span>
        <button onClick={normalize} disabled={peak <= 0} className={`${btn} ${idle} disabled:opacity-40`} title={t('vocal.take.normalizeTitle')}>
          {t('vocal.take.normalize')}
        </button>
        {gain !== 1 && (
          <button onClick={() => onGainChange(1)} className="text-[11px] text-accent hover:underline">{t('vocal.take.reset')}</button>
        )}
        {clips && (
          <span className="text-[11px] font-semibold text-danger" title={t('vocal.take.clipsTitle')}>
            {t('vocal.take.clips')}
          </span>
        )}
      </div>

      {/* Practice: speed + A–B loop */}
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {SPEEDS.map((s) => (
          <button key={s} onClick={() => setRate(s)} className={`${btn} ${rate === s ? 'bg-ink text-paper' : idle}`} title={t('vocal.take.speedTitle')}>
            {s}×
          </button>
        ))}
        <span className="w-px h-5 bg-ink/10 mx-1" />
        <button onClick={markA} className={`${btn} ${idle}`} title={t('vocal.take.setA')}>A</button>
        <button onClick={markB} className={`${btn} ${idle}`} title={t('vocal.take.setB')}>B</button>
        <button
          onClick={() => setLooping((l) => !l)}
          disabled={!loopRange}
          className={`${btn} ${looping && loopRange ? 'bg-success text-white' : idle} disabled:opacity-40`}
        >
          {t('vocal.take.loop')}
        </button>
        {(a !== null || b !== null) && (
          <>
            <span className="text-[11px] font-mono text-ink-muted">
              {a !== null ? fmtTakeTime(a) : '–'} → {b !== null ? fmtTakeTime(b) : '–'}
            </span>
            <button onClick={clearLoop} className="text-[11px] text-ink-faint hover:text-ink-muted px-1" aria-label={t('vocal.take.clearLoop')}>✕</button>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-2 mt-2">
        {active ? (
          <span className="mr-auto text-[11px] font-semibold text-accent">{t('vocal.take.showing')}</span>
        ) : (
          <button
            onClick={() => { if (audioRef.current) onActivate(audioRef.current); }}
            className="mr-auto px-3 py-1.5 rounded-lg text-xs font-semibold text-accent hover:bg-accent-soft transition-colors disabled:opacity-40"
            disabled={!hasMeters}
            title={hasMeters ? t('vocal.take.showMetersTitle') : t('vocal.take.noMetersTitle')}
          >
            {t('vocal.take.showMeters')}
          </button>
        )}
        <button
          onClick={saveMp3}
          disabled={mp3Progress !== null}
          className={`${btn} bg-ink hover:bg-ink/85 text-paper disabled:opacity-70 tabular-nums`}
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
      {mp3Error && <p className="mt-2 text-[11px] text-danger">{mp3Error}</p>}
    </li>
  );
};

export default TakeCard;
