/**
 * Singing statistics: per-take summaries and time-on-target tracking.
 * Pure — unit-tested in stats.test.ts.
 */
import type { PitchPoint } from './useMicAnalyser';

/** Within this many cents of the nearest semitone counts as "in tune". */
export const IN_TUNE_CENTS = 10;
/** A frame never counts for more than this, so detection gaps don't inflate times. */
const MAX_FRAME_S = 0.1;
/** Dropouts shorter than this don't break a held note. */
const HOLD_GAP_S = 0.2;

export interface TakeStats {
  /** Robust extremes (1st / 99th percentile) so a stray glitch can't set them. */
  low: number;
  high: number;
  /** Semitones between low and high. */
  range: number;
  /** Share of sung time within ±IN_TUNE_CENTS of a semitone, 0…1. */
  inTune: number;
  /** Mean absolute deviation from the nearest semitone, in cents. */
  avgCents: number;
  /** Seconds with a detected pitch. */
  sung: number;
}

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))];

export const takeStats = (pitch: PitchPoint[]): TakeStats | null => {
  const voiced: number[] = [];
  let sung = 0;
  let inTuneTime = 0;
  let centsSum = 0;
  for (let i = 0; i < pitch.length; i++) {
    const m = pitch[i].midi;
    if (m === null) continue;
    const dt = i + 1 < pitch.length ? Math.min(MAX_FRAME_S, pitch[i + 1].t - pitch[i].t) : 1 / 60;
    const cents = Math.abs(m - Math.round(m)) * 100;
    voiced.push(m);
    sung += dt;
    centsSum += cents * dt;
    if (cents <= IN_TUNE_CENTS) inTuneTime += dt;
  }
  if (!voiced.length || sung === 0) return null;
  voiced.sort((a, b) => a - b);
  const low = percentile(voiced, 0.01);
  const high = percentile(voiced, 0.99);
  return {
    low,
    high,
    range: Math.round(high) - Math.round(low),
    inTune: inTuneTime / sung,
    avgCents: centsSum / sung,
    sung,
  };
};

export const isOnTarget = (midi: number | null, target: number, toleranceCents: number): boolean =>
  midi !== null && Math.abs(midi - target) * 100 <= toleranceCents;

export interface TargetTally {
  /** Seconds on target in total. */
  total: number;
  /** Longest unbroken hold, in seconds. */
  longest: number;
  /** The hold in progress (0 when off target). */
  current: number;
}

/**
 * Incremental time-on-target counter. Feed it frames in time order; short
 * dropouts (< HOLD_GAP_S) don't break a hold, so a held note survives a
 * missed detection or two.
 */
export class TargetMeter {
  total = 0;
  longest = 0;
  current = 0;
  private lastT: number | null = null;
  private lastOnT: number | null = null;

  constructor(private target: number, private toleranceCents: number) {}

  push(t: number, midi: number | null): void {
    const dt = this.lastT === null ? 0 : Math.min(MAX_FRAME_S, Math.max(0, t - this.lastT));
    this.lastT = t;
    const holding = this.lastOnT !== null && t - this.lastOnT <= HOLD_GAP_S;
    if (isOnTarget(midi, this.target, this.toleranceCents)) {
      // Only time between two on-target frames counts — dropout time is bridged, not credited.
      if (holding) {
        this.current += dt;
        this.total += dt;
      } else {
        this.current = 0;
      }
      this.lastOnT = t;
      if (this.current > this.longest) this.longest = this.current;
    } else if (!holding) {
      this.current = 0;
    }
  }

  tally(): TargetTally {
    return { total: this.total, longest: this.longest, current: this.current };
  }
}

/** Tally for a recorded take up to `until` (seconds into the take). */
export const tallyTake = (pitch: PitchPoint[], target: number, toleranceCents: number, until = Infinity): TargetTally => {
  const meter = new TargetMeter(target, toleranceCents);
  for (const p of pitch) {
    if (p.t > until) break;
    meter.push(p.t, p.midi);
  }
  return meter.tally();
};

/** Loudest sample magnitude in a take's waveform meters (0…1), or 0 if none. */
export const peakLevel = (wave: { min: number; max: number }[]): number => {
  let peak = 0;
  for (const w of wave) peak = Math.max(peak, -w.min, w.max);
  return peak;
};
