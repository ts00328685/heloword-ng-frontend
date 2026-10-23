import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getTTSSettings, setTTSSettings, TTSSettings } from '../services/ttsSettings.service';
import { pronounceWord } from '../services/tts.service';
import { Sheet } from './ui/sheet';

const SAMPLE: Record<string, { text: string; lang: string }> = {
  zh: { text: '今日も一日がんばりましょう', lang: 'jp' },
  ja: { text: '今日も一日がんばりましょう', lang: 'jp' },
  en: { text: 'Practice makes perfect', lang: 'en' },
};

/**
 * Speech speed / volume / pitch sliders. Settings are read by the TTS service at
 * speak time, so changes apply immediately on whatever page is open.
 */
export const AudioSettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [s, setS] = useState<TTSSettings>(getTTSSettings);

  const update = (patch: Partial<TTSSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    setTTSSettings(next);
  };

  const rows: { key: keyof TTSSettings; label: string; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
    { key: 'volume', label: t('common.ttsVolume'), min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'speed', label: t('common.ttsSpeed'), min: 0.5, max: 2, step: 0.1, fmt: (v) => `${v.toFixed(1)}×` },
    { key: 'pitch', label: t('common.ttsPitch'), min: 0.5, max: 2, step: 0.1, fmt: (v) => v.toFixed(1) },
  ];

  const sample = SAMPLE[i18n.language] ?? SAMPLE.en;

  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <label key={r.key} className="block">
          <span className="flex justify-between mb-1.5">
            <span className="text-sm text-ink">{r.label}</span>
            <span className="text-xs tabular-nums text-ink-muted">{r.fmt(s[r.key])}</span>
          </span>
          <input
            type="range" min={r.min} max={r.max} step={r.step}
            value={s[r.key]}
            onChange={(e) => update({ [r.key]: parseFloat(e.target.value) })}
            className="w-full"
          />
        </label>
      ))}
      <button
        onClick={() => pronounceWord(sample.text, sample.lang)}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line text-xs text-ink-muted hover:text-ink hover:border-ink/30 transition-colors"
      >
        <SpeakerIcon className="w-3.5 h-3.5" />
        {t('common.ttsTest')}
      </button>
    </div>
  );
};

export const SpeakerIcon: React.FC<{ className?: string }> = ({ className = 'w-[18px] h-[18px]' }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
  </svg>
);

/** Header button: opens the audio sheet from any page. */
export const AudioButton: React.FC = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded-xl text-ink-muted hover:bg-ink/5 transition-colors"
        aria-label={t('common.audioSettings')}
        title={t('common.audioSettings')}
      >
        <SpeakerIcon />
      </button>
      <Sheet title={t('common.audioSettings')} open={open} onClose={() => setOpen(false)}>
        <AudioSettings />
      </Sheet>
    </>
  );
};

export default AudioSettings;
