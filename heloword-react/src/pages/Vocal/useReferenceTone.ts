import { useCallback, useEffect, useRef } from 'react';
import { midiToFreq } from './pitch';

interface Drone {
  oscs: OscillatorNode[];
  gain: GainNode;
}

/** Fundamental plus a couple of soft harmonics — reads as a pitch, not a beep. */
const PARTIALS: [ratio: number, type: OscillatorType, level: number][] = [
  [1, 'triangle', 1],
  [2, 'sine', 0.3],
  [3, 'sine', 0.12],
];

/**
 * Reference pitches: `play` strikes a short piano-like note, `setDrone`
 * holds a soft sustained tone. Separate AudioContext from the mic — it is
 * never routed into the analyser (though speakers can still leak into the mic).
 */
export const useReferenceTone = (volume: number) => {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const droneRef = useRef<Drone | null>(null);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const ensure = useCallback(() => {
    if (!ctxRef.current) {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = volumeRef.current;
      master.connect(ctx.destination);
      ctxRef.current = ctx;
      masterRef.current = master;
    }
    ctxRef.current.resume().catch(() => {});
    return { ctx: ctxRef.current, master: masterRef.current! };
  }, []);

  useEffect(() => {
    if (masterRef.current && ctxRef.current) {
      masterRef.current.gain.setTargetAtTime(volume, ctxRef.current.currentTime, 0.02);
    }
  }, [volume]);

  const play = useCallback((midi: number) => {
    const { ctx, master } = ensure();
    const t = ctx.currentTime;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.5, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    env.connect(master);
    for (const [ratio, type, level] of PARTIALS) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = midiToFreq(midi) * ratio;
      g.gain.value = level;
      osc.connect(g).connect(env);
      osc.start(t);
      osc.stop(t + 1.7);
    }
  }, [ensure]);

  const setDrone = useCallback((midi: number | null) => {
    const current = droneRef.current;
    if (midi === null) {
      if (current && ctxRef.current) {
        const t = ctxRef.current.currentTime;
        current.gain.gain.setTargetAtTime(0, t, 0.05);
        current.oscs.forEach((o) => o.stop(t + 0.4));
      }
      droneRef.current = null;
      return;
    }
    const { ctx, master } = ensure();
    const t = ctx.currentTime;
    if (current) {
      current.oscs.forEach((o, i) => o.frequency.setTargetAtTime(midiToFreq(midi) * PARTIALS[i][0], t, 0.03));
      return;
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.setTargetAtTime(0.25, t, 0.08);
    gain.connect(master);
    const oscs = PARTIALS.map(([ratio, type, level]) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = midiToFreq(midi) * ratio;
      g.gain.value = level;
      osc.connect(g).connect(gain);
      osc.start(t);
      return osc;
    });
    droneRef.current = { oscs, gain };
  }, [ensure]);

  useEffect(() => () => {
    ctxRef.current?.close().catch(() => {});
  }, []);

  return { play, setDrone };
};
