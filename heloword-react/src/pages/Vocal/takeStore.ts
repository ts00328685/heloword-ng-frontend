/**
 * Take persistence: IndexedDB for this browser, plus a portable
 * `.vocal.json` export (audio + meters) that can be imported back.
 */
import type { TakeMeters } from './useMicAnalyser';

export interface StoredTake {
  id: number;
  name: string;
  blob: Blob;
  ext: string;
  seconds: number;
  /** Epoch ms. */
  createdAt: number;
  meters: TakeMeters;
  /** Playback / MP3 volume multiplier (1 = as recorded). Missing on older takes. */
  gain?: number;
}

/** A take in memory: the stored record plus an object URL for playback. */
export interface Take extends StoredTake {
  url: string;
}

const DB_NAME = 'hw-vocal';
const STORE = 'takes';

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    // Let a later call retry if this one failed (e.g. storage blocked).
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
};

const run = async <T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = op(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export const loadTakes = () => run<StoredTake[]>('readonly', (s) => s.getAll());
export const saveTake = (take: StoredTake) => run('readwrite', (s) => s.put(take));
export const deleteTake = (id: number) => run('readwrite', (s) => s.delete(id));

/** Ask the browser not to evict saved takes under storage pressure (best effort). */
export const requestPersistence = () => navigator.storage?.persist?.().catch(() => false);

// ── Export / import ──────────────────────────────────────────────────────

const FORMAT = 'heloword-vocal-take';

interface ExportFile {
  format: typeof FORMAT;
  version: 1;
  name: string;
  createdAt: number;
  seconds: number;
  ext: string;
  mime: string;
  gain?: number;
  /** Base64 audio. */
  audio: string;
  /** Compact meters: pitch [t, midi|null], wave [t, min, max]. */
  pitch: [number, number | null][];
  wave: [number, number, number][];
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  // Chunked — spreading a multi-MB array into fromCharCode would overflow the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

const base64ToBlob = (b64: string, mime: string): Blob => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

export const exportTake = async (take: StoredTake): Promise<Blob> => {
  const file: ExportFile = {
    format: FORMAT,
    version: 1,
    name: take.name,
    createdAt: take.createdAt,
    seconds: take.seconds,
    ext: take.ext,
    mime: take.blob.type,
    gain: take.gain,
    audio: await blobToBase64(take.blob),
    pitch: take.meters.pitch.map((p) => [r3(p.t), p.midi === null ? null : r3(p.midi)]),
    wave: take.meters.wave.map((p) => [r3(p.t), r3(p.min), r3(p.max)]),
  };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
};

/** Parses a `.vocal.json` export; throws with a readable message if it isn't one. */
export const parseExport = async (file: Blob): Promise<Omit<StoredTake, 'id'>> => {
  let data: Partial<ExportFile>;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('Not a valid take file.');
  }
  if (data.format !== FORMAT || !data.audio || !Array.isArray(data.pitch) || !Array.isArray(data.wave)) {
    throw new Error('Not a Vocal Trainer take file.');
  }
  return {
    name: String(data.name ?? 'Imported take').slice(0, 60),
    blob: base64ToBlob(data.audio, data.mime || 'audio/webm'),
    ext: data.ext || 'webm',
    seconds: Number(data.seconds) || 0,
    createdAt: Number(data.createdAt) || Date.now(),
    gain: typeof data.gain === 'number' && data.gain >= 0 ? data.gain : undefined,
    meters: {
      pitch: data.pitch.map(([t, midi]) => ({ t, midi })),
      wave: data.wave.map(([t, min, max]) => ({ t, min, max })),
    },
  };
};
