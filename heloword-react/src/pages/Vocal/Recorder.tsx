import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Panel, { LiveDot } from './Panel';
import { KeySig } from './music';
import { analyseAudio } from './analyseAudio';
import TakeCard, { downloadBlob, fmtClock, safeFileName } from './TakeCard';
import { deleteTake, exportTake, loadTakes, parseExport, requestPersistence, saveTake, StoredTake, Take, TakeFileError } from './takeStore';
import { TakeMeters } from './useMicAnalyser';
import { QualityCalibration } from './voiceQuality';
import { withWebmDuration } from './webmDuration';

interface Props {
  /** Opens the mic if needed and returns its stream (null if denied). */
  getStream: () => Promise<MediaStream | null>;
  /** The mic is already open — starting a take needs no "Opening mic…" step. */
  micOpen: boolean;
  /** Start/stop copying pitch & waveform frames for the take being recorded. */
  beginCapture: () => void;
  endCapture: () => TakeMeters;
  keySig: KeySig | null;
  /** For the per-take closure summary. */
  calibration: QualityCalibration;
  /** Take currently shown in the Pitch/Waveform panels, if any. */
  replayingId: number | null;
  /** Show a take in the meters, synced to its audio element. */
  onReplay: (take: Take, audio: HTMLAudioElement) => void;
  /** A take's A–B loop markers changed. */
  onLoopChange: (id: number, loop: { a: number; b: number } | null) => void;
  onRemove: (id: number) => void;
  /** A take was renamed. */
  onRenamed: (id: number, name: string) => void;
  /** A take's volume changed. */
  onGainChange: (id: number, gain: number) => void;
  /** Recording state, for the floating record button. */
  onStatusChange?: (status: RecStatus) => void;
  /** Whether the panel's record button is on screen — the page floats one when it isn't. */
  onControlsVisibleChange?: (visible: boolean) => void;
}

/** starting = opening the mic, stopping = finishing and saving the take. */
export type RecPhase = 'idle' | 'starting' | 'recording' | 'stopping';
export interface RecStatus {
  phase: RecPhase;
  /** performance.now() when the take started (recording only). */
  startedAt: number;
}

/** Button text for the not-recording phases; `idle` is the caller's own wording. */
export const recLabel = (phase: RecPhase, idle: string, t: (key: string) => string): string =>
  phase === 'starting' ? t('vocal.recorder.starting') : phase === 'stopping' ? t('vocal.recorder.saving') : idle;

export interface RecorderHandle {
  toggleRecording: () => void;
}

/** First format the browser can record: Chrome/Firefox → webm/ogg, Safari → mp4. */
const FORMATS: [mime: string, ext: string][] = [
  ['audio/webm;codecs=opus', 'webm'],
  ['audio/webm', 'webm'],
  ['audio/mp4', 'm4a'],
  ['audio/ogg;codecs=opus', 'ogg'],
];
const pickFormat = () =>
  FORMATS.find(([m]) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? ['', 'webm'];

const withUrl = (t: StoredTake): Take => ({ ...t, url: URL.createObjectURL(t.blob) });
const strip = ({ url: _url, ...t }: Take): StoredTake => t;

/**
 * Records takes from the shared mic stream and keeps them in IndexedDB.
 * Takes can be replayed with their meters, exported with meters, and audio
 * files (or exports) can be imported — plain audio is analysed on import.
 */
const Recorder = forwardRef<RecorderHandle, Props>(({
  getStream, micOpen, beginCapture, endCapture, keySig, calibration, replayingId, onReplay, onLoopChange, onRemove, onGainChange, onRenamed,
  onStatusChange, onControlsVisibleChange,
}, ref) => {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<RecPhase>('idle');
  const recording = phase === 'recording';
  const startedAtRef = useRef(0);
  /**
   * Current phase without waiting for a render — blocks a second start while the
   * mic opens. Only `go` writes it, so it can't drift from what's on screen.
   */
  const phaseRef = useRef<RecPhase>('idle');
  const go = (p: RecPhase) => { phaseRef.current = p; setPhase(p); };
  const busy = phase === 'starting' || phase === 'stopping';
  const [elapsed, setElapsed] = useState(0);
  const [takes, setTakes] = useState<Take[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** False when IndexedDB is unavailable (private mode, blocked storage). */
  const [canPersist, setCanPersist] = useState(true);
  const [importing, setImporting] = useState<{ name: string; progress: number } | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number>(0);
  const lastIdRef = useRef(0);
  const takesRef = useRef(takes);
  takesRef.current = takes;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gainSaveTimers = useRef(new Map<number, number>());

  const controlsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onStatusChange?.({ phase, startedAt: startedAtRef.current });
  }, [phase, onStatusChange]);

  useEffect(() => {
    const el = controlsRef.current;
    if (!el || !onControlsVisibleChange) return;
    // A collapsed panel hides this row, which also reports "not visible".
    const io = new IntersectionObserver(([entry]) => onControlsVisibleChange(entry.isIntersecting), { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [onControlsVisibleChange]);

  /** Unique, increasing ids (ms timestamps). */
  const nextId = () => (lastIdRef.current = Math.max(Date.now(), lastIdRef.current + 1));

  useEffect(() => {
    loadTakes()
      .then(async (stored) => {
        // Older Chrome takes were saved without a duration (player bar stuck at the end) — fix them once.
        const fixed = await Promise.all(stored.map(async (take) => {
          if (take.ext !== 'webm') return take;
          const blob = await withWebmDuration(take.blob, take.seconds);
          if (blob === take.blob) return take;
          const updated = { ...take, blob };
          saveTake(updated).catch(() => {});
          return updated;
        }));
        const loaded = fixed.sort((x, y) => y.createdAt - x.createdAt).map(withUrl);
        lastIdRef.current = Math.max(0, ...loaded.map((take) => take.id));
        // Keep anything recorded while loading.
        setTakes((current) => [...current, ...loaded.filter((take) => !current.some((c) => c.id === take.id))]);
      })
      .catch(() => setCanPersist(false));
    return () => {
      clearInterval(timerRef.current);
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      takesRef.current.forEach((take) => URL.revokeObjectURL(take.url));
    };
  }, []);

  const persist = (take: Take) => {
    saveTake(strip(take))
      .then(() => requestPersistence())
      .catch(() => setCanPersist(false));
  };

  const addTake = (stored: StoredTake) => {
    const take = withUrl(stored);
    setTakes((ts) => [take, ...ts]);
    persist(take);
  };

  const start = async () => {
    if (phaseRef.current !== 'idle') return;
    setError(null);
    // Only say "Opening mic…" when it actually has to open (it may ask for permission).
    if (micOpen) phaseRef.current = 'starting';
    else go('starting');
    const stream = await getStream();
    if (!stream) {
      go('idle');
      setError(t('vocal.mic.unavailableShort'));
      return;
    }
    const [mime, ext] = pickFormat();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { ...(mime && { mimeType: mime }), audioBitsPerSecond: 128000 });
    } catch (e) {
      go('idle');
      setError(e instanceof Error ? e.message : String(e));
      return;
    }

    const chunks: Blob[] = [];
    const startedAt = performance.now();
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    // Meters start when audio actually starts, so their timeline matches the file.
    rec.onstart = beginCapture;
    // Also fires if the mic is switched off mid-take, so nothing is lost.
    rec.onstop = async () => {
      clearInterval(timerRef.current);
      go('stopping');
      recorderRef.current = null;
      const meters = endCapture();
      try {
        if (!chunks.length) return;
        const seconds = (performance.now() - startedAt) / 1000;
        const raw = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
        addTake({
          id: nextId(),
          name: t('vocal.recorder.defaultName', { n: takesRef.current.length + 1 }),
          // Chrome leaves the duration out of webm files; write it in so the player bar works.
          blob: ext === 'webm' ? await withWebmDuration(raw, seconds) : raw,
          ext,
          seconds,
          createdAt: Date.now(),
          meters,
        });
      } finally {
        go('idle');
      }
    };

    rec.start(1000);
    recorderRef.current = rec;
    startedAtRef.current = startedAt;
    go('recording');
    setElapsed(0);
    timerRef.current = window.setInterval(() => setElapsed((performance.now() - startedAt) / 1000), 200);
  };

  /** Shows "Saving…" right away; `onstop` (after the last chunk arrives) saves and returns to idle. */
  const stop = () => {
    const rec = recorderRef.current;
    if (!rec || phaseRef.current !== 'recording') return;
    go('stopping');
    if (rec.state !== 'inactive') rec.stop();
  };
  const toggleRecording = () => { if (phaseRef.current === 'recording') stop(); else start(); };
  useImperativeHandle(ref, () => ({ toggleRecording }));

  const remove = (id: number) => {
    const take = takesRef.current.find((x) => x.id === id);
    if (take) URL.revokeObjectURL(take.url);
    setTakes((ts) => ts.filter((x) => x.id !== id));
    deleteTake(id).catch(() => {});
    onRemove(id);
  };

  const rename = (id: number, name: string) => {
    setTakes((ts) => ts.map((take) => (take.id === id ? { ...take, name } : take)));
    // Persist the new name directly — takesRef won't reflect it until the next render.
    const take = takesRef.current.find((x) => x.id === id);
    if (take) persist({ ...take, name });
    onRenamed(id, name);
  };

  const setGain = (id: number, gain: number) => {
    setTakes((ts) => ts.map((take) => (take.id === id ? { ...take, gain } : take)));
    onGainChange(id, gain);
    // Save once the slider settles rather than on every step of a drag.
    clearTimeout(gainSaveTimers.current.get(id));
    gainSaveTimers.current.set(id, window.setTimeout(() => {
      const take = takesRef.current.find((x) => x.id === id);
      if (take) persist(take);
    }, 400));
  };

  const exportOne = async (take: Take) => {
    try {
      downloadBlob(await exportTake(strip(take)), `${safeFileName(take.name)}.vocal.json`);
    } catch (e) {
      setError(t('vocal.recorder.exportFailed', { error: e instanceof Error ? e.message : String(e) }));
    }
  };

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    for (const file of Array.from(files)) {
      const base = file.name.replace(/\.vocal\.json$|\.[^.]+$/i, '');
      try {
        if (/\.json$/i.test(file.name) || file.type === 'application/json') {
          const imported = await parseExport(file);
          // Exports made before durations were written in — fix them now rather than on the next visit.
          addTake({ ...imported, blob: await withWebmDuration(imported.blob, imported.seconds), id: nextId() });
        } else {
          setImporting({ name: file.name, progress: 0 });
          const { meters, seconds } = await analyseAudio(file, (progress) => setImporting({ name: file.name, progress }));
          addTake({
            id: nextId(),
            name: base.slice(0, 60) || t('vocal.recorder.importedName'),
            // A webm from Chrome's recorder has no duration; write it in (other files come back as-is).
            blob: await withWebmDuration(file, seconds),
            ext: file.name.split('.').pop()?.toLowerCase() || 'audio',
            seconds,
            createdAt: Date.now(),
            meters,
          });
        }
      } catch (e) {
        const reason = e instanceof TakeFileError ? t(`vocal.recorder.${e.code}`) : e instanceof Error ? e.message : String(e);
        setError(t('vocal.recorder.importFailed', { name: file.name, error: reason }));
      } finally {
        setImporting(null);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Panel
      id="recorder"
      defaultOpen={false}
      title={t('vocal.panel.recorder')}
      indicator={recording && <LiveDot color="bg-danger" />}
      summary={recording ? t('vocal.recorder.rec', { time: fmtClock(elapsed) }) : t('vocal.recorder.takes', { count: takes.length })}
    >
      <div ref={controlsRef} className="flex flex-wrap items-center gap-3">
        <button
          onClick={recording ? stop : start}
          disabled={busy}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-paper transition-colors disabled:opacity-60 ${
            recording ? 'bg-danger hover:bg-danger/90' : 'bg-ink hover:bg-ink/85'
          }`}
          title={recording ? t('vocal.recorder.stopTitle') : t('vocal.recorder.startTitle')}
          aria-pressed={recording}
        >
          {recording ? (
            <><span className="w-2.5 h-2.5 rounded-sm bg-current" />{t('vocal.recorder.stopSave')}</>
          ) : (
            <><span className="w-2.5 h-2.5 rounded-full bg-danger" />{recLabel(phase, t('vocal.recorder.start'), t)}</>
          )}
        </button>
        {recording && (
          <span className="flex items-center gap-1.5 text-sm font-mono text-danger tabular-nums" aria-live="off">
            <span className="inline-block w-2 h-2 rounded-full bg-danger animate-pulse" />
            {t('vocal.recorder.rec', { time: fmtClock(elapsed) })}
          </span>
        )}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!!importing}
          className="ml-auto px-3 py-2 rounded-xl text-xs font-semibold bg-ink/5 text-ink-muted hover:bg-ink/10 transition-colors disabled:opacity-50"
          title={t('vocal.recorder.importTitle')}
        >
          {t('vocal.recorder.import')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.json,application/json"
          multiple
          className="hidden"
          onChange={(e) => importFiles(e.target.files)}
        />
      </div>

      {importing && (
        <div className="mt-3">
          <p className="text-xs text-ink-muted mb-1 truncate">
            {t('vocal.recorder.analysing', { name: importing.name, pct: Math.round(importing.progress * 100) })}
          </p>
          <div className="h-1.5 rounded-full bg-ink/5 overflow-hidden">
            <div className="h-full bg-ink transition-[width]" style={{ width: `${importing.progress * 100}%` }} />
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      <p className="mt-3 text-[11px] text-ink-faint">
        {canPersist
          ? t('vocal.recorder.saved')
          : t('vocal.recorder.notSaved')}
      </p>

      {takes.length > 0 && (
        <ul className="mt-3 space-y-3">
          {takes.map((take) => (
            <TakeCard
              key={take.id}
              take={take}
              keySig={keySig}
              calibration={calibration}
              active={replayingId === take.id}
              onActivate={(audio) => onReplay(take, audio)}
              onLoopChange={(loop) => onLoopChange(take.id, loop)}
              onRename={(name) => rename(take.id, name)}
              onExport={() => exportOne(take)}
              onDelete={() => remove(take.id)}
              onGainChange={(gain) => setGain(take.id, gain)}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
});

Recorder.displayName = 'Recorder';

export default Recorder;
