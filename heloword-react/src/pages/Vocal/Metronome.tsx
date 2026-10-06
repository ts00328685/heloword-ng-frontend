import React, { useCallback, useEffect, useRef, useState } from 'react';

const MIN_BPM = 30;
const MAX_BPM = 240;
const BEAT_OPTIONS = [2, 3, 4, 5, 6, 7];
/** Look-ahead scheduler (Chris Wilson, "A Tale of Two Clocks"). */
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;

const clampBpm = (n: number) => Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(n)));

/**
 * Collapsible metronome. Clicks are scheduled on the Web Audio clock so the
 * timing stays tight even when the main thread is busy drawing graphs.
 */
const Metronome: React.FC = () => {
  const [open, setOpen] = useState(true);
  const [bpm, setBpm] = useState(100);
  const [volume, setVolume] = useState(0.7);
  const [beats, setBeats] = useState(4);
  const [playing, setPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(-1);

  const bpmRef = useRef(bpm);
  const beatsRef = useRef(beats);
  bpmRef.current = bpm;
  beatsRef.current = beats;

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const timerRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const nextTimeRef = useRef(0);
  const beatIdxRef = useRef(0);
  const queueRef = useRef<{ beat: number; time: number }[]>([]);
  const tapsRef = useRef<number[]>([]);

  useEffect(() => {
    if (masterRef.current && ctxRef.current) {
      masterRef.current.gain.setTargetAtTime(volume, ctxRef.current.currentTime, 0.01);
    }
  }, [volume]);

  const click = (ctx: AudioContext, dest: AudioNode, time: number, accent: boolean) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.frequency.value = accent ? 1500 : 1000;
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(1, time + 0.001);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(env).connect(dest);
    osc.start(time);
    osc.stop(time + 0.06);
  };

  const stop = useCallback(() => {
    clearInterval(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    queueRef.current = [];
    setPlaying(false);
    setCurrentBeat(-1);
  }, []);

  const start = useCallback(async () => {
    if (!ctxRef.current) {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      ctxRef.current = ctx;
      masterRef.current = master;
    }
    const ctx = ctxRef.current;
    const master = masterRef.current!;
    await ctx.resume();

    beatIdxRef.current = 0;
    nextTimeRef.current = ctx.currentTime + 0.05;
    queueRef.current = [];

    const schedule = () => {
      while (nextTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_S) {
        const beat = beatIdxRef.current % beatsRef.current;
        click(ctx, master, nextTimeRef.current, beat === 0);
        queueRef.current.push({ beat, time: nextTimeRef.current });
        nextTimeRef.current += 60 / bpmRef.current;
        beatIdxRef.current = beat + 1;
      }
    };
    schedule();
    timerRef.current = window.setInterval(schedule, LOOKAHEAD_MS);

    const draw = () => {
      const q = queueRef.current;
      let latest = -1;
      while (q.length && q[0].time <= ctx.currentTime) latest = q.shift()!.beat;
      if (latest !== -1) setCurrentBeat(latest);
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    setPlaying(true);
  }, [volume]);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    ctxRef.current?.close().catch(() => {});
  }, []);

  const tap = () => {
    const now = performance.now();
    const taps = tapsRef.current.filter((t) => now - t < 2500);
    taps.push(now);
    tapsRef.current = taps.slice(-6);
    if (tapsRef.current.length >= 2) {
      const ts = tapsRef.current;
      const avg = (ts[ts.length - 1] - ts[0]) / (ts.length - 1);
      setBpm(clampBpm(60000 / avg));
    }
  };

  const roundBtn = 'w-8 h-8 shrink-0 rounded-full border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-center text-lg leading-none';

  return (
    <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full px-5 py-4"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300">
          Metronome
          {playing && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
        </span>
        <span className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          {!open && <span className="font-mono">{bpm} BPM · {beats} beats</span>}
          <svg className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5">
          {/* Beat dots */}
          <div className="flex justify-center gap-3 pt-1">
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
            <div className="flex justify-between gap-2">
              {BEAT_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setBeats(n)}
                  className={`flex-1 h-9 rounded-full text-sm font-semibold transition-colors ${
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
      )}
    </section>
  );
};

export default Metronome;
