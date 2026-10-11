import { describe, expect, it } from 'vitest';
import header from '../../components/Header.tsx?raw';
import en from '../../i18n/locales/en';
import ja from '../../i18n/locales/ja';
import zh from '../../i18n/locales/zh';
import { SCALES } from './music';

/** Source text of every Vocal Trainer module (tests excluded), via Vite's raw import. */
const raw = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const sources = Object.entries(raw).map(([path, code]) => ({ file: path.slice(2), code }));

/** Flattened key paths under an object, e.g. "panel.pitch". */
const keyPaths = (obj: object, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keyPaths(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );

/** i18next plural forms (_one/_other) collapse to their base key; languages differ in which forms they need. */
const baseKeys = (obj: object) => new Set(keyPaths(obj).map((k) => k.replace(/_(zero|one|two|few|many|other)$/, '')));

const enKeys = baseKeys(en.vocal);

const exists = (key: string) => {
  const path = key.replace(/^vocal\./, '');
  return enKeys.has(path);
};

describe('Vocal Trainer i18n', () => {
  it('has the same keys in en, zh and ja', () => {
    expect([...baseKeys(zh.vocal)].sort()).toEqual([...enKeys].sort());
    expect([...baseKeys(ja.vocal)].sort()).toEqual([...enKeys].sort());
  });

  it('defines every literal key used in the code', () => {
    const used = [...sources.map((s) => s.code), header]
      .flatMap((code) => [...code.matchAll(/\bt\(\s*'(vocal\.[\w.]+)'/g)].map((m) => m[1]));
    expect(used.length).toBeGreaterThan(50);
    expect(used.filter((k) => !exists(k))).toEqual([]);
  });

  it('defines every dynamic key (scales, shortcuts, import errors)', () => {
    const scaleKeys = SCALES.flatMap((s) => (s ? [`vocal.scales.${s.id}`] : []));
    const page = sources.find((s) => s.file === 'VocalTrainerPage.tsx')!.code;
    const shortcutKeys = [...page.matchAll(/\[\s*'[^']+',\s*'(\w+)'\s*\]/g)].map((m) => `vocal.shortcuts.${m[1]}`);
    const errorKeys = ['invalidFile', 'notTakeFile'].map((c) => `vocal.recorder.${c}`);
    const zoneKeys = (['breathy', 'balanced', 'firm'] as const).map((z) => `vocal.quality.zone.${z}`);
    expect(shortcutKeys.length).toBeGreaterThan(5);
    expect([...scaleKeys, ...shortcutKeys, ...errorKeys, ...zoneKeys].filter((k) => !exists(k))).toEqual([]);
  });

  it('has no hard-coded English in title / aria-label attributes', () => {
    const offenders = sources.flatMap(({ file, code }) =>
      [...code.matchAll(/\b(title|aria-label)="([^"]*[a-z]{3,}[^"]*)"/g)].map((m) => `${file}: ${m[0]}`),
    );
    expect(offenders).toEqual([]);
  });
});
