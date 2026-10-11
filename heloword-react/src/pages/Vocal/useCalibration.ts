import { useCallback, useState } from 'react';
import { DEFAULT_CALIBRATION, QualityCalibration } from './voiceQuality';

const KEY = 'hw-vocal-quality-calibration';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const validValues = (v: unknown) => {
  const o = v as Record<string, unknown> | null;
  return !!o && (o.h1h2 === null || isNum(o.h1h2)) && isNum(o.hnr) && isNum(o.tilt);
};

const load = (): QualityCalibration | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return validValues(parsed?.breathy) && validValues(parsed?.firm) ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * The singer's breathy/firm calibration, kept in localStorage. `calibration`
 * is what to use for scoring (defaults until calibrated); `custom` says
 * whether it's the singer's own.
 */
export const useCalibration = () => {
  const [custom, setCustom] = useState<QualityCalibration | null>(load);

  const save = useCallback((cal: QualityCalibration | null) => {
    setCustom(cal);
    try {
      if (cal) localStorage.setItem(KEY, JSON.stringify(cal));
      else localStorage.removeItem(KEY);
    } catch {
      // Storage blocked — the calibration still applies for this visit.
    }
  }, []);

  return { calibration: custom ?? DEFAULT_CALIBRATION, isCustom: custom !== null, save };
};
