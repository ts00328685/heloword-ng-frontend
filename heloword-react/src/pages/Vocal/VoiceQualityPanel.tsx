import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Panel from './Panel';
import CycleScope from './CycleScope';
import ClosureTrace, { ZONE_COLORS } from './ClosureTrace';
import { FrameListener, indexAtTime, MicData } from './useMicAnalyser';
import { usePersistedState } from './usePersistedState';
import {
  closureIndex, makeCalibration, medianQuality, QualityCalibration, QualityValues, ZONES, zoneOf,
} from './voiceQuality';

interface Props {
  dataRef: React.MutableRefObject<MicData>;
  isDark: boolean;
  replay: boolean;
  calibration: QualityCalibration;
  isCustomCalibration: boolean;
  onCalibration: (cal: QualityCalibration | null) => void;
  addFrameListener: (fn: FrameListener) => () => void;
  /** Opens the mic (and leaves replay) — calibration needs live input. */
  ensureMic: () => Promise<unknown>;
}

/** Readout = median over this recent window, so it doesn't flicker. */
const READOUT_WINDOW_S = 0.4;
/** Voiced frames needed per calibration step (~2.5 s of singing at 60 fps). */
const CALIBRATION_FRAMES = 150;
const CALIBRATION_TIMEOUT_MS = 25000;

type CalStep = { phase: 'breathy' | 'firm'; progress: number } | { phase: 'error' } | null;

interface Readout {
  values: QualityValues;
  index: number;
  /** True when this is the last reading, held through silence. */
  held: boolean;
}

/**
 * Vocal-fold closure, as far as a microphone can tell: a breathy ↔ firm
 * gauge, the measures behind it, a pitch-locked cycle view, the index over
 * time, and a two-step calibration to the singer's own voice.
 */
const VoiceQualityPanel: React.FC<Props> = ({
  dataRef, isDark, replay, calibration, isCustomCalibration, onCalibration, addFrameListener, ensureMic,
}) => {
  const { t } = useTranslation();
  const [readout, setReadout] = useState<Readout | null>(null);
  const [calStep, setCalStep] = useState<CalStep>(null);
  const [advancedOpen, setAdvancedOpen] = usePersistedState('quality-advanced-open', false);
  const calRef = useRef(calibration);
  calRef.current = calibration;

  // Gauge: ~10×/s, median of the last READOUT_WINDOW_S (at the playhead when replaying)
  useEffect(() => {
    const id = window.setInterval(() => {
      const { quality, now } = dataRef.current;
      const end = indexAtTime(quality, now + 1e-6);
      const recent = quality.slice(indexAtTime(quality, now - READOUT_WINDOW_S), end);
      const m = medianQuality(recent);
      const index = m ? closureIndex(m, calRef.current) : null;
      setReadout((prev) => {
        if (m && index !== null) return { values: m, index, held: false };
        return prev && !prev.held ? { ...prev, held: true } : prev;
      });
    }, 100);
    return () => clearInterval(id);
  }, [dataRef]);

  // Re-score the held reading if the calibration changes
  useEffect(() => {
    setReadout((prev) => {
      const index = prev ? closureIndex(prev.values, calibration) : null;
      return prev && index !== null ? { ...prev, index } : prev;
    });
  }, [calibration]);

  // ── Calibration: breathy sample, then firm sample ──
  const samplesRef = useRef<{ breathy: QualityValues[]; firm: QualityValues[] }>({ breathy: [], firm: [] });
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<number>(0);

  const stopListening = () => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    clearTimeout(timeoutRef.current);
  };
  useEffect(() => stopListening, []);

  const startCalibration = async () => {
    stopListening();
    await ensureMic();
    samplesRef.current = { breathy: [], firm: [] };
    let phase: 'breathy' | 'firm' = 'breathy';
    setCalStep({ phase, progress: 0 });
    const armTimeout = () => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        stopListening();
        setCalStep({ phase: 'error' });
      }, CALIBRATION_TIMEOUT_MS);
    };
    armTimeout();
    unsubscribeRef.current = addFrameListener((_t, _midi, quality) => {
      if (!quality) return;
      const bucket = samplesRef.current[phase];
      bucket.push(quality);
      if (bucket.length < CALIBRATION_FRAMES) {
        // Progress bar doesn't need 60 re-renders a second
        if (bucket.length % 8 === 0) setCalStep({ phase, progress: bucket.length / CALIBRATION_FRAMES });
        return;
      }
      if (phase === 'breathy') {
        phase = 'firm';
        setCalStep({ phase, progress: 0 });
        armTimeout();
        return;
      }
      stopListening();
      const b = medianQuality(samplesRef.current.breathy);
      const f = medianQuality(samplesRef.current.firm);
      if (b && f) onCalibration(makeCalibration(b, f));
      setCalStep(null);
    });
  };

  const cancelCalibration = () => {
    stopListening();
    setCalStep(null);
  };

  // Keep the fold open while calibrating so the step instructions stay visible.
  const showAdvanced = advancedOpen || calStep !== null;
  const zone = readout ? zoneOf(readout.index) : null;
  const zoneLabel = zone ? t(`vocal.quality.zone.${zone}`) : null;
  const chip = 'inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700/60 text-[11px] text-gray-600 dark:text-gray-300 tabular-nums cursor-help';
  const btn = 'h-7 px-2.5 rounded-lg text-[11px] font-semibold transition-colors';
  const idle = 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600';
  const segment = (z: keyof typeof ZONE_COLORS) =>
    ({ breathy: 'bg-sky-200 dark:bg-sky-900/70', balanced: 'bg-emerald-200 dark:bg-emerald-900/70', firm: 'bg-amber-200 dark:bg-amber-900/70' })[z];

  return (
    <Panel
      id="quality"
      title={t('vocal.quality.title')}
      summary={readout ? `${readout.index} · ${zoneLabel}` : undefined}
    >
      <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
        <div>
          {/* Gauge */}
          <div className={`transition-opacity ${readout?.held ? 'opacity-50' : ''}`} title={readout?.held ? t('vocal.quality.held') : undefined}>
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-100 leading-none">
                {readout ? readout.index : '--'}
              </span>
              <span
                className="text-sm font-semibold"
                style={{ color: zone ? ZONE_COLORS[zone].solid : undefined }}
              >
                {zoneLabel ?? t('vocal.quality.waiting')}
              </span>
            </div>
            <div className="relative h-3 rounded-full overflow-hidden flex" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={readout?.index} aria-label={t('vocal.quality.gauge')}>
              <div className={segment('breathy')} style={{ width: `${ZONES.breathyBelow}%` }} />
              <div className={segment('balanced')} style={{ width: `${ZONES.firmAbove - ZONES.breathyBelow}%` }} />
              <div className={segment('firm')} style={{ width: `${100 - ZONES.firmAbove}%` }} />
              {readout && (
                <span
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-5 rounded-full bg-gray-900 dark:bg-white shadow transition-[left] duration-150"
                  style={{ left: `${readout.index}%` }}
                />
              )}
            </div>
            <div className="flex justify-between mt-1 text-[10px] font-semibold">
              <span style={{ color: ZONE_COLORS.breathy.solid }}>← {t('vocal.quality.zone.breathy')}</span>
              <span style={{ color: ZONE_COLORS.balanced.solid }}>{t('vocal.quality.zone.balanced')}</span>
              <span style={{ color: ZONE_COLORS.firm.solid }}>{t('vocal.quality.zone.firm')} →</span>
            </div>
          </div>
        </div>

        {/* Closure over time — beside the gauge on wide screens */}
        <div>
          <p className="mb-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400">{t('vocal.quality.traceTitle')}</p>
          <ClosureTrace dataRef={dataRef} isDark={isDark} calibration={calibration} />
        </div>
      </div>

      {/* Details & calibration — technical extras, folded away by default */}
      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
        <button
          onClick={() => setAdvancedOpen((o) => !o)}
          className="flex items-center justify-between w-full text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500"
          aria-expanded={showAdvanced}
        >
          {t('vocal.quality.advanced')}
          <svg className={`w-4 h-4 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showAdvanced && (
          <div className="mt-3 space-y-4">
            {/* The measures behind the gauge */}
            <div className="flex flex-wrap gap-1.5">
              <span className={chip} title={t('vocal.quality.h1h2Help')}>
                H1–H2 <b>{readout?.values.h1h2 != null ? `${readout.values.h1h2.toFixed(1)} dB` : '—'}</b> ⓘ
              </span>
              <span className={chip} title={t('vocal.quality.hnrHelp')}>
                HNR <b>{readout ? `${readout.values.hnr.toFixed(0)} dB` : '—'}</b> ⓘ
              </span>
              <span className={chip} title={t('vocal.quality.tiltHelp')}>
                {t('vocal.quality.tilt')} <b>{readout ? `${readout.values.tilt.toFixed(0)} dB` : '—'}</b> ⓘ
              </span>
            </div>

            {/* Cycle shape — full width */}
            <div>
              <p className="mb-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400 cursor-help" title={t('vocal.quality.scopeHelp')}>
                {t('vocal.quality.scopeTitle')} ⓘ
              </p>
              <CycleScope dataRef={dataRef} isDark={isDark} replay={replay} />
            </div>

            {/* Calibration */}
            <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
              {calStep && calStep.phase !== 'error' ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-violet-500 text-white text-[10px] font-bold">
                      {calStep.phase === 'breathy' ? '1/2' : '2/2'}
                    </span>
                    <p className="flex-1 text-xs text-gray-700 dark:text-gray-200">
                      {calStep.phase === 'breathy' ? t('vocal.quality.calBreathy') : t('vocal.quality.calFirm')}
                    </p>
                    <button onClick={cancelCalibration} className={`${btn} ${idle}`}>{t('vocal.quality.cancel')}</button>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div className="h-full bg-violet-500 transition-[width]" style={{ width: `${Math.min(1, calStep.progress) * 100}%` }} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  {calStep?.phase === 'error' ? (
                    <span className="text-red-500">{t('vocal.quality.calTimeout')}</span>
                  ) : (
                    <span className={isCustomCalibration ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}>
                      {isCustomCalibration ? t('vocal.quality.calibrated') : t('vocal.quality.notCalibrated')}
                    </span>
                  )}
                  <button onClick={startCalibration} className={`${btn} bg-violet-500 hover:bg-violet-600 text-white`} title={t('vocal.quality.calibrateHelp')}>
                    {isCustomCalibration ? t('vocal.quality.recalibrate') : t('vocal.quality.calibrate')}
                  </button>
                  {isCustomCalibration && (
                    <button onClick={() => onCalibration(null)} className={`${btn} ${idle}`}>{t('vocal.quality.resetCalibration')}</button>
                  )}
                </div>
              )}
            </div>

            {/* How to read this */}
            <div>
              <p className="mb-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400">{t('vocal.quality.tipsTitle')}</p>
              <ul className="space-y-1 list-disc pl-4 text-[11px] text-gray-500 dark:text-gray-400">
                <li>{t('vocal.quality.tipCompare')}</li>
                <li>{t('vocal.quality.tipScope')}</li>
                <li>{t('vocal.quality.tipRelative')}</li>
                <li>{t('vocal.quality.tipHigh')}</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
};

export default VoiceQualityPanel;
