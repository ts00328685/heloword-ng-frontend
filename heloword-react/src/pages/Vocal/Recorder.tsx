import React, { useEffect, useRef, useState } from 'react';
import Panel, { LiveDot } from './Panel';
import { TakeMeters } from './useMicAnalyser';

interface Props {
  /** Opens the mic if needed and returns its stream (null if denied). */
  getStream: () => Promise<MediaStream | null>;
  /** Start/stop copying pitch & waveform frames for the take being recorded. */
  beginCapture: () => void;
  endCapture: () => TakeMeters;
  /** Take currently shown in the Pitch/Waveform panels, if any. */
  replayingId: number | null;
  /** Show a take in the meters, synced to its audio element. */
  onReplay: (take: Take, audio: HTMLAudioElement) => void;
  onRemove: (id: number) => void;
}

export interface Take {
  id: number;
  name: string;
  url: string;
  ext: string;
  seconds: number;
  createdAt: Date;
  meters: TakeMeters;
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

const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const safeFileName = (s: string) => s.trim().replace(/[\\/:*?"<>|]+/g, '_') || 'recording';

/**
 * Chrome's MediaRecorder writes webm without a duration, so <audio> shows an
 * unseekable "Infinity" bar until played through. Seeking far past the end
 * forces the browser to compute the real duration.
 */
const TakePlayer: React.FC<{
  src: string;
  audioRef: (el: HTMLAudioElement | null) => void;
  /** Play or a user seek — the page switches the meters to this take. */
  onActivate: (audio: HTMLAudioElement) => void;
}> = ({ src, audioRef, onActivate }) => {
  const ref = useRef<HTMLAudioElement | null>(null);
  /** True while the duration workaround is seeking, so it isn't mistaken for the user. */
  const fixingRef = useRef(false);
  const onLoaded = () => {
    const a = ref.current;
    if (!a || Number.isFinite(a.duration)) return;
    fixingRef.current = true;
    const reset = () => {
      a.removeEventListener('timeupdate', reset);
      a.currentTime = 0;
      a.addEventListener('seeked', () => { fixingRef.current = false; }, { once: true });
    };
    a.addEventListener('timeupdate', reset);
    a.currentTime = 1e101;
  };
  return (
    <audio
      ref={(el) => { ref.current = el; audioRef(el); }}
      src={src}
      controls
      preload="metadata"
      onLoadedMetadata={onLoaded}
      onPlay={(e) => onActivate(e.currentTarget)}
      onSeeked={(e) => { if (!fixingRef.current) onActivate(e.currentTarget); }}
      className="w-full h-10"
    />
  );
};

/** Records takes from the shared mic stream; replay inline or download. Takes live in memory only. */
const Recorder: React.FC<Props> = ({ getStream, beginCapture, endCapture, replayingId, onReplay, onRemove }) => {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [takes, setTakes] = useState<Take[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number>(0);
  const nextIdRef = useRef(1);
  const takesRef = useRef(takes);
  takesRef.current = takes;
  const audioEls = useRef(new Map<number, HTMLAudioElement>());

  useEffect(() => () => {
    clearInterval(timerRef.current);
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    takesRef.current.forEach((t) => URL.revokeObjectURL(t.url));
  }, []);

  const start = async () => {
    setError(null);
    const stream = await getStream();
    if (!stream) {
      setError('Microphone unavailable.');
      return;
    }
    const [mime, ext] = pickFormat();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { ...(mime && { mimeType: mime }), audioBitsPerSecond: 128000 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }

    const chunks: Blob[] = [];
    const startedAt = performance.now();
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    // Meters start when audio actually starts, so their timeline matches the file.
    rec.onstart = beginCapture;
    // Also fires if the mic is switched off mid-take, so nothing is lost.
    rec.onstop = () => {
      clearInterval(timerRef.current);
      setRecording(false);
      recorderRef.current = null;
      const meters = endCapture();
      if (!chunks.length) return;
      const id = nextIdRef.current++;
      const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
      setTakes((ts) => [
        { id, name: `Take ${id}`, url: URL.createObjectURL(blob), ext, seconds: (performance.now() - startedAt) / 1000, createdAt: new Date(), meters },
        ...ts,
      ]);
    };

    rec.start(1000);
    recorderRef.current = rec;
    setRecording(true);
    setElapsed(0);
    timerRef.current = window.setInterval(() => setElapsed((performance.now() - startedAt) / 1000), 200);
  };

  const stop = () => recorderRef.current?.stop();

  const remove = (id: number) => {
    setTakes((ts) => {
      const t = ts.find((x) => x.id === id);
      if (t) URL.revokeObjectURL(t.url);
      return ts.filter((x) => x.id !== id);
    });
    onRemove(id);
  };

  const rename = (id: number, name: string) =>
    setTakes((ts) => ts.map((t) => (t.id === id ? { ...t, name: name.slice(0, 60) } : t)));

  return (
    <Panel
      id="recorder"
      title="Recorder"
      indicator={recording && <LiveDot color="bg-red-500" />}
      summary={recording ? `REC ${fmtTime(elapsed)}` : `${takes.length} take${takes.length === 1 ? '' : 's'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {recording && (
            <span className="flex items-center gap-1.5 text-sm font-mono text-red-500 tabular-nums">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {fmtTime(elapsed)}
            </span>
          )}
          <button
            onClick={recording ? stop : start}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              recording
                ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-white'
                : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
          >
            {recording ? (
              <><span className="w-2.5 h-2.5 rounded-sm bg-current" />Stop</>
            ) : (
              <><span className="w-2.5 h-2.5 rounded-full bg-white" />Record</>
            )}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

      {takes.length === 0 ? (
        <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
          Takes appear here. They're kept until you leave or refresh the page, so save the ones you want.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {takes.map((t) => (
            <li
              key={t.id}
              className={`rounded-xl border p-3 transition-colors ${
                replayingId === t.id ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-900/10' : 'border-gray-100 dark:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={t.name}
                  onChange={(e) => rename(t.id, e.target.value)}
                  className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-gray-800 dark:text-gray-100 rounded-md px-1 -mx-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Take name"
                />
                <span className="text-[11px] font-mono text-gray-400 dark:text-gray-500 shrink-0">
                  {fmtTime(t.seconds)} · {t.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <TakePlayer
                src={t.url}
                audioRef={(el) => { if (el) audioEls.current.set(t.id, el); else audioEls.current.delete(t.id); }}
                onActivate={(audio) => onReplay(t, audio)}
              />
              <div className="flex items-center justify-end gap-2 mt-2">
                {replayingId === t.id ? (
                  <span className="mr-auto text-[11px] font-semibold text-blue-500">Showing in meters</span>
                ) : (
                  <button
                    onClick={() => { const a = audioEls.current.get(t.id); if (a) onReplay(t, a); }}
                    className="mr-auto px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    disabled={!t.meters.pitch.length}
                    title={t.meters.pitch.length ? 'Show this take in the Pitch and Waveform panels' : 'No meter data for this take'}
                  >
                    Show meters
                  </button>
                )}
                <a
                  href={t.url}
                  download={`${safeFileName(t.name)}.${t.ext}`}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white transition-colors"
                >
                  Save
                </a>
                <button
                  onClick={() => remove(t.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
};

export default Recorder;
