export interface TTSSettings {
  speed: number;
  volume: number;
  pitch: number;
}

const STORAGE_KEY = 'hw-tts-settings';

const DEFAULTS: TTSSettings = { speed: 0.9, volume: 1.0, pitch: 1.0 };

export function getTTSSettings(): TTSSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setTTSSettings(settings: Partial<TTSSettings>): void {
  const current = getTTSSettings();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...settings }));
}
