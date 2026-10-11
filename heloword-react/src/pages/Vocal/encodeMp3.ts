import { decodeAudio } from './analyseAudio';

/** CD rate — always valid for MP3, whatever the recording used. */
const MP3_RATE = 44100;
const KBPS = 128;
/** MP3 frame size in samples; feed the encoder whole frames. */
const FRAME = 1152;
/** Frames per encode call between UI yields. */
const FRAMES_PER_CHUNK = 200;

export const toInt16 = (src: Float32Array, start: number, end: number, gain: number): Int16Array => {
  const out = new Int16Array(end - start);
  for (let i = start; i < end; i++) {
    const s = Math.max(-1, Math.min(1, src[i] * gain));
    out[i - start] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
};

/** True if the channels differ — a mic "stereo" track is usually the same signal twice. */
const isRealStereo = (l: Float32Array, r: Float32Array): boolean => {
  const step = Math.max(1, Math.floor(l.length / 5000));
  for (let i = 0; i < l.length; i += step) if (Math.abs(l[i] - r[i]) > 1e-4) return true;
  return false;
};

/**
 * Encodes PCM channels (1 or 2, −1…1 floats) to MP3, scaled by `gain`
 * (samples past full scale are clipped). The encoder library is loaded on
 * first use so it isn't in the page bundle.
 */
export const encodePcmToMp3 = async (
  channels: Float32Array[],
  sampleRate: number,
  onProgress?: (fraction: number) => void,
  gain = 1,
): Promise<Blob> => {
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const stereo = channels.length > 1;
  const encoder = new Mp3Encoder(stereo ? 2 : 1, sampleRate, KBPS);
  const [left, right] = channels;
  /** Copied out of the encoder's reused buffer (plain ArrayBuffer-backed, as Blob requires). */
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const step = FRAME * FRAMES_PER_CHUNK;

  for (let i = 0; i < left.length; i += step) {
    const end = Math.min(left.length, i + step);
    const out = encoder.encodeBuffer(toInt16(left, i, end, gain), stereo ? toInt16(right, i, end, gain) : undefined);
    if (out.length) parts.push(new Uint8Array(out));
    onProgress?.(end / left.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  const tail = encoder.flush();
  if (tail.length) parts.push(new Uint8Array(tail));
  return new Blob(parts, { type: 'audio/mpeg' });
};

/** Converts any browser-playable recording (webm, m4a, ogg, wav…) to a 128 kbps MP3 at the given volume. */
export const convertToMp3 = async (blob: Blob, onProgress?: (fraction: number) => void, gain = 1): Promise<Blob> => {
  const decoded = await decodeAudio(blob, MP3_RATE);
  const l = decoded.getChannelData(0);
  const r = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : null;
  return encodePcmToMp3(r && isRealStereo(l, r) ? [l, r] : [l], MP3_RATE, onProgress, gain);
};
