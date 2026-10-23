import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { useTheme } from '../../contexts/ThemeContext';
import { freqToNote, midiToFreq, NoteInfo } from './pitch';
import { altName, makeKey, SCALES, spellNote } from './music';
import { tallyTake, TargetMeter, TargetTally } from './stats';
import { Take } from './takeStore';
import { indexAtTime, MicData, useMicAnalyser } from './useMicAnalyser';
import { usePersistedState } from './usePersistedState';
import { useReferenceTone } from './useReferenceTone';
import PitchGraph, { PitchGraphHandle } from './PitchGraph';
import PracticeBar, { TOLERANCES } from './PracticeBar';
import WaveformView from './WaveformView';
import Metronome from './Metronome';
import MetronomeDock from './MetronomeDock';
import { useMetronome } from './useMetronome';
import Recorder, { RecorderHandle } from './Recorder';
import Panel, { LiveDot } from './Panel';
import VoiceQualityPanel from './VoiceQualityPanel';
import { useCalibration } from './useCalibration';

type Loop = { a: number; b: number } | null;

/** Key caps and their i18n keys under `vocal.shortcuts`. */
const SHORTCUTS: [key: string, action: string][] = [
  ['Space', 'space'],
  ['R', 'record'],
  ['M', 'mic'],
  ['↑ ↓', 'scroll'],
  ['+ −', 'zoom'],
  ['F', 'fit'],
  ['T', 'target'],
  ['K', 'metronome'],
  ['H', 'monitor'],
  ['Esc', 'live'],
];

/**
 * Standalone singing tools: live pitch trace, input waveform, recorder and a
 * metronome. Entirely client-side — nothing is uploaded.
 *
 * The Pitch/Waveform panels show either the live mic or a recorded take; in
 * replay mode they read the take's captured meters at the audio's playhead.
 */
const VocalTrainerPage: React.FC = () => {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const {
    dataRef, running, error, note: liveNote, voiced: liveVoiced,
    start, stop, beginCapture, endCapture, addFrameListener, setMonitorLevel, monitorLatencyMs,
  } = useMicAnalyser();

  // ── Monitoring (hear yourself) — always starts off; headphones reminder until acknowledged ──
  const [monitorOn, setMonitorOn] = useState(false);
  const [monitorVolume, setMonitorVolume] = usePersistedState('monitor-volume', 0.8, (v) => v >= 0 && v <= 1.5);
  const [monitorAck, setMonitorAck] = usePersistedState('monitor-headphones-ok', false);
  const [askMonitorAck, setAskMonitorAck] = useState(false);
  useEffect(() => { setMonitorLevel(monitorOn ? monitorVolume : 0); }, [monitorOn, monitorVolume, setMonitorLevel]);

  const metronome = useMetronome();
  /** The full Metronome panel's controls are on screen — hide the dock then. */
  const [metronomeVisible, setMetronomeVisible] = useState(false);
  const [tipsOpen, setTipsOpen] = usePersistedState('tips-open', false);

  const graphRef = useRef<PitchGraphHandle>(null);
  const recorderRef = useRef<RecorderHandle>(null);

  // ── Practice settings (persisted) ──
  const [keyRoot, setKeyRoot] = usePersistedState('key-root', 0, (v) => v >= 0 && v < 12);
  const [keyScale, setKeyScale] = usePersistedState('key-scale', 0, (v) => v >= 0 && v < SCALES.length);
  const keySig = useMemo(() => makeKey(keyRoot, keyScale), [keyRoot, keyScale]);
  const [targetSetting, setTargetSetting] = usePersistedState('target-note', -1, (v) => v === -1 || (v >= 21 && v <= 108));
  const target = targetSetting < 0 ? null : targetSetting;
  const setTarget = (m: number | null) => setTargetSetting(m ?? -1);
  const [tolerance, setTolerance] = usePersistedState('target-tolerance', 25, (v) => TOLERANCES.includes(v));
  const [toneVolume, setToneVolume] = usePersistedState('tone-volume', 0.5, (v) => v >= 0 && v <= 1);
  const [drone, setDroneOn] = useState(false);
  const [frozen, setFrozen] = useState(false);

  const { play, setDrone } = useReferenceTone(toneVolume);
  useEffect(() => { setDrone(drone && target !== null ? target : null); }, [drone, target, setDrone]);
  useEffect(() => { dataRef.current.frozen = frozen; }, [frozen, dataRef]);

  // ── Replay ──
  const [replay, setReplay] = useState<{ take: Take; audio: HTMLAudioElement } | null>(null);
  const [replayNote, setReplayNote] = useState<NoteInfo | null>(null);
  const [replayVoiced, setReplayVoiced] = useState(false);
  const [replayTally, setReplayTally] = useState<TargetTally | null>(null);
  const replayRef = useRef<MicData>({ pitch: [], wave: [], quality: [], now: 0, running: false, paused: false, replay: true, loop: null });
  const { calibration, isCustom: isCustomCalibration, save: saveCalibration } = useCalibration();
  /** A–B loop markers per take, so switching takes shows the right loop. */
  const loopsRef = useRef(new Map<number, Loop>());
  const replayIdRef = useRef<number | null>(null);
  replayIdRef.current = replay?.take.id ?? null;

  // Drive the replay view from the audio element's playhead.
  useEffect(() => {
    // Switching views mid-hover would otherwise leave the live capture paused.
    dataRef.current.paused = false;
    if (!replay) return;
    const d = replayRef.current;
    d.pitch = replay.take.meters.pitch;
    d.wave = replay.take.meters.wave;
    d.quality = replay.take.meters.quality ?? [];
    d.loop = loopsRef.current.get(replay.take.id) ?? null;
    d.gain = replay.take.gain ?? 1;
    let raf = 0;
    let lastKey = '';
    let lastTally = -1;
    const loop = () => {
      d.now = replay.audio.currentTime;
      // Last note sung at or before the playhead (held through silences, like live)
      let i = indexAtTime(d.pitch, d.now) - 1;
      const voicedNow = i >= 0 && d.now - d.pitch[i].t < 0.1 && d.pitch[i].midi !== null;
      while (i >= 0 && d.pitch[i].midi === null) i--;
      const n = i >= 0 ? freqToNote(midiToFreq(d.pitch[i].midi as number)) : null;
      const key = n ? `${n.name}${n.cents}${voicedNow}` : '';
      if (key !== lastKey) {
        lastKey = key;
        setReplayNote(n);
        setReplayVoiced(voicedNow);
      }
      // Time on target so far in the take, ~10×/s
      if (target !== null && Math.abs(d.now - lastTally) > 0.1) {
        lastTally = d.now;
        setReplayTally(tallyTake(d.pitch, target, tolerance, d.now));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [replay, dataRef, target, tolerance]);

  /**
   * Names changed after a take started replaying, for the panel titles. Kept
   * apart from `replay` so renaming doesn't restart the replay effect.
   */
  const [renamedTakes, setRenamedTakes] = useState<Record<number, string>>({});
  const replayName = replay ? renamedTakes[replay.take.id] ?? replay.take.name : '';

  const exitReplay = () => {
    setReplay(null);
    setReplayNote(null);
    setReplayVoiced(false);
    setReplayTally(null);
  };

  // ── Live time-on-target ──
  const [liveTally, setLiveTally] = useState<TargetTally | null>(null);
  const meterRef = useRef<TargetMeter | null>(null);
  const resetLiveTally = () => {
    meterRef.current = target === null ? null : new TargetMeter(target, tolerance);
    setLiveTally(meterRef.current?.tally() ?? null);
  };
  useEffect(() => {
    resetLiveTally();
    const unsubscribe = addFrameListener((time, midi) => meterRef.current?.push(time, midi));
    const id = window.setInterval(() => { if (meterRef.current) setLiveTally(meterRef.current.tally()); }, 100);
    return () => {
      clearInterval(id);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when the target changes
  }, [target, tolerance, addFrameListener]);

  const source = replay ? replayRef : dataRef;
  const note = replay ? replayNote : liveNote;
  /** False when `note` is held from earlier — shown dimmed. */
  const noteVoiced = replay ? replayVoiced : liveVoiced;
  const cents = note?.cents ?? 0;
  const inTune = note !== null && Math.abs(cents) <= 10;
  const noteName = note ? spellNote(note.midi, keySig) : null;
  const noteAlt = note ? altName(note.midi, keySig) : null;

  const toggleMic = () => {
    if (running) stop();
    else { exitReplay(); start(); }
  };
  const playTarget = () => { if (target !== null) play(target); };

  const enableMonitor = () => {
    setAskMonitorAck(false);
    setMonitorOn(true);
    if (!running) { exitReplay(); start(); }
  };
  const toggleMonitor = () => {
    if (monitorOn) setMonitorOn(false);
    else if (monitorAck) enableMonitor();
    else setAskMonitorAck(true);
  };

  // ── Keyboard shortcuts ──
  const shortcutRef = useRef<(e: KeyboardEvent) => void>(() => {});
  shortcutRef.current = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    if (el?.closest('input, textarea, select, audio, [contenteditable="true"]')) return;
    const handled = () => {
      e.preventDefault();
      // A focused button would also "click" on Space/Enter keyup.
      if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
    };
    switch (e.key) {
      case ' ':
        handled();
        if (replay) { if (replay.audio.paused) replay.audio.play().catch(() => {}); else replay.audio.pause(); }
        else setFrozen((f) => !f);
        break;
      case 'r': case 'R': handled(); recorderRef.current?.toggleRecording(); break;
      case 'm': case 'M': handled(); toggleMic(); break;
      case 'ArrowUp': handled(); graphRef.current?.scroll(e.shiftKey ? 12 : 1); break;
      case 'ArrowDown': handled(); graphRef.current?.scroll(e.shiftKey ? -12 : -1); break;
      case '+': case '=': handled(); graphRef.current?.zoom(-1); break;
      case '-': case '_': handled(); graphRef.current?.zoom(1); break;
      case 'f': case 'F': handled(); graphRef.current?.fit(); break;
      case 't': case 'T': handled(); playTarget(); break;
      case 'k': case 'K': handled(); metronome.toggle(); break;
      case 'h': case 'H': handled(); toggleMonitor(); break;
      case 'Escape':
        if (replay) { handled(); exitReplay(); }
        else if (frozen) { handled(); setFrozen(false); }
        break;
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => shortcutRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-paper animate-page-enter">
      <Header title={t('vocal.title')} showBack />

      {/* Extra bottom padding leaves room for the metronome dock */}
      <main className="flex-1 pb-40 px-4 pt-6 max-w-3xl mx-auto w-full space-y-4">
        <Panel
          id="pitch"
          title={replay ? t('vocal.panel.withTake', { panel: t('vocal.panel.pitch'), take: replayName }) : t('vocal.panel.pitch')}
          indicator={running && <LiveDot color="bg-ink" />}
          summary={note ? `${noteName}${noteAlt ? `/${noteAlt}` : ''} ${cents > 0 ? '+' : ''}${cents}¢` : running || replay ? '--' : t('vocal.mic.off')}
        >
          {replay && (
            <div className="flex items-center justify-between gap-3 mb-4 px-3 py-2 rounded-xl bg-accent-soft text-xs text-accent">
              <span className="min-w-0 truncate">
                ▶ {t('vocal.replay.replaying')} <b>{replayName}</b> — {t('vocal.replay.followHint')}
              </span>
              <button onClick={exitReplay} className="shrink-0 font-semibold hover:underline">
                {t('vocal.replay.backToLive')}
              </button>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 mb-4">
            <div
              className={`flex items-center gap-3 min-w-0 transition-opacity ${note && !noteVoiced ? 'opacity-50' : ''}`}
              title={note && !noteVoiced ? t('vocal.lastNote') : undefined}
            >
              <div className="w-24 flex flex-col">
                <span className={`text-4xl font-semibold tabular-nums leading-none ${note ? 'text-ink ' : 'text-ink-faint '}`}>
                  {noteName ?? '--'}
                </span>
                {/* Flat spelling of black keys when no key is set, e.g. C#4 → D♭4 */}
                <span className="h-4 mt-1 text-xs font-semibold text-ink-faint">{noteAlt ?? ''}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono text-ink-faint">
                  {note ? `${midiToFreq(note.midi + cents / 100).toFixed(1)} Hz` : '— Hz'}
                </span>
                {/* Cents meter: -50 … +50 */}
                <div className="relative w-28 h-2 rounded-full bg-ink/5">
                  <span className="absolute left-1/2 top-0 w-px h-2 bg-ink/20" />
                  {note && (
                    <span
                      className={`absolute top-1/2 w-2.5 h-2.5 -mt-[5px] -ml-[5px] rounded-full ${inTune ? 'bg-success' : 'bg-ink'}`}
                      style={{ left: `${50 + cents}%` }}
                    />
                  )}
                </div>
                <span className={`text-[11px] font-mono ${note ? (inTune ? 'text-success' : 'text-accent') : 'text-transparent'}`}>
                  {cents > 0 ? '+' : ''}{cents}¢
                </span>
              </div>
            </div>
            <button
              onClick={toggleMic}
              className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-paper transition-colors ${
                running ? 'bg-danger hover:bg-danger/90' : 'bg-ink hover:bg-ink/85'
              }`}
              title={t('vocal.mic.title')}
            >
              <span className={`w-2 h-2 rounded-full ${running ? 'bg-surface animate-pulse' : 'bg-surface'}`} />
              {running ? t('vocal.mic.stop') : t('vocal.mic.start')}
            </button>
          </div>

          {/* Monitor: hear your mic live through headphones */}
          <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px]">
            <button
              onClick={toggleMonitor}
              className={`h-7 px-2.5 rounded-lg font-semibold transition-colors ${
                monitorOn
                  ? 'bg-ink text-paper'
                  : 'bg-ink/5 text-ink-muted hover:bg-ink/10 '
              }`}
              title={t('vocal.monitor.title')}
              aria-pressed={monitorOn}
            >
              {monitorOn ? t('vocal.monitor.on') : t('vocal.monitor.off')}
            </button>
            {monitorOn && (
              <>
                <input
                  type="range" min={0} max={1.5} step={0.05}
                  value={monitorVolume}
                  onChange={(e) => setMonitorVolume(parseFloat(e.target.value))}
                  className="w-24 accent-violet-500"
                  aria-label={t('vocal.monitor.volume')}
                />
                <span className="font-mono text-ink-muted tabular-nums">{Math.round(monitorVolume * 100)}%</span>
                {monitorLatencyMs !== null && (
                  <span className="text-ink-faint" title={t('vocal.monitor.delayTitle')}>
                    {t('vocal.monitor.delay', { ms: monitorLatencyMs })}
                  </span>
                )}
                <span className="text-accent">{t('vocal.monitor.headphonesOnly')}</span>
              </>
            )}
            {askMonitorAck && (
              <span className="flex flex-wrap items-center gap-2 px-2 py-1 rounded-lg bg-accent-soft text-accent">
                {t('vocal.monitor.ack')}
                <button onClick={() => { setMonitorAck(true); enableMonitor(); }} className="font-semibold underline">{t('vocal.monitor.ackConfirm')}</button>
                <button onClick={() => setAskMonitorAck(false)} className="text-ink-muted hover:underline">{t('vocal.monitor.cancel')}</button>
              </span>
            )}
          </div>

          {error && (
            <p className="mb-3 text-xs text-danger">
              {t('vocal.mic.unavailable', { error })}
            </p>
          )}

          <PitchGraph
            ref={graphRef}
            dataRef={source}
            isDark={isDark}
            keySig={keySig}
            target={target}
            toleranceCents={tolerance}
            onNoteClick={(m) => { play(m); setTarget(m); }}
            frozen={frozen}
            onToggleFreeze={replay ? undefined : () => setFrozen((f) => !f)}
          />

          <PracticeBar
            keyRoot={keyRoot}
            keyScale={keyScale}
            onKeyRoot={setKeyRoot}
            onKeyScale={setKeyScale}
            keySig={keySig}
            target={target}
            onTarget={setTarget}
            tolerance={tolerance}
            onTolerance={setTolerance}
            onPlayTarget={playTarget}
            drone={drone}
            onDrone={setDroneOn}
            toneVolume={toneVolume}
            onToneVolume={setToneVolume}
            tally={replay ? replayTally : liveTally}
            onResetTally={replay ? undefined : resetLiveTally}
          />

          <div className="mt-3 pt-3 border-t border-line">
            <button
              onClick={() => setTipsOpen((o) => !o)}
              className="flex items-center justify-between w-full text-[11px] font-semibold uppercase tracking-wide text-ink-faint"
              aria-expanded={tipsOpen}
            >
              {t('vocal.tips.title')}
              <svg className={`w-4 h-4 transition-transform duration-200 ${tipsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {tipsOpen && (
              <div className="mt-2 space-y-2 text-[11px] text-ink-faint">
                <p>{t('vocal.tips.gestures')}</p>
                <p className="hidden sm:flex flex-wrap gap-x-3 gap-y-1">
                  {SHORTCUTS.map(([key, action]) => (
                    <span key={key}>
                      <kbd className="px-1 py-0.5 rounded border border-line font-mono text-[10px]">{key}</kbd> {t(`vocal.shortcuts.${action}`)}
                    </span>
                  ))}
                </p>
              </div>
            )}
          </div>
        </Panel>

        <VoiceQualityPanel
          dataRef={source}
          isDark={isDark}
          replay={!!replay}
          calibration={calibration}
          isCustomCalibration={isCustomCalibration}
          onCalibration={saveCalibration}
          addFrameListener={addFrameListener}
          ensureMic={() => { if (replay) exitReplay(); return start(); }}
        />

        <Panel id="waveform" title={replay ? t('vocal.panel.withTake', { panel: t('vocal.panel.waveform'), take: replayName }) : t('vocal.panel.waveform')}>
          <WaveformView dataRef={source} isDark={isDark} />
        </Panel>

        <Recorder
          ref={recorderRef}
          getStream={() => { exitReplay(); return start(); }}
          beginCapture={beginCapture}
          endCapture={endCapture}
          keySig={keySig}
          calibration={calibration}
          replayingId={replay?.take.id ?? null}
          onReplay={(take, audio) => { if (take.meters.pitch.length) setReplay({ take, audio }); }}
          onLoopChange={(id, loop) => {
            loopsRef.current.set(id, loop);
            if (replayIdRef.current === id) replayRef.current.loop = loop;
          }}
          onRenamed={(id, name) => setRenamedTakes((m) => ({ ...m, [id]: name }))}
          onGainChange={(id, gain) => {
            if (replayIdRef.current === id) replayRef.current.gain = gain;
          }}
          onRemove={(id) => {
            loopsRef.current.delete(id);
            if (replayIdRef.current === id) exitReplay();
          }}
        />

        <Metronome m={metronome} onVisibleChange={setMetronomeVisible} />

        <p className="text-center text-[11px] text-ink-faint">
          {t('vocal.footer')}
        </p>
      </main>

      {!metronomeVisible && <MetronomeDock m={metronome} />}
    </div>
  );
};

export default VocalTrainerPage;
