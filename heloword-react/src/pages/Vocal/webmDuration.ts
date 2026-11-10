/**
 * Chrome's MediaRecorder writes webm files without a Duration, so `<audio>`
 * reports `Infinity` and its progress bar sits pinned at the end. This writes
 * the known duration into the file's Segment › Info header so every player
 * (and every downloaded copy) sees the real length.
 *
 * Only the first few KB are rewritten; the rest of the blob is reused as-is.
 */

const EBML = 0x1a45dfa3;
const SEGMENT = 0x18538067;
const INFO = 0x1549a966;
const TIMECODE_SCALE = 0x2ad7b1;
const DURATION = 0x4489;
const CLUSTER = 0x1f43b675;

/** Header bytes to inspect — Info always comes well before the first audio cluster. */
const HEAD_BYTES = 64 * 1024;

interface Vint { value: number; length: number; unknown: boolean }

/** EBML variable-length integer at `pos`. `keepMarker` for element IDs. */
const readVint = (b: Uint8Array, pos: number, keepMarker = false): Vint | null => {
  const first = b[pos];
  if (first === undefined || first === 0) return null;
  let length = 1;
  while (!(first & (0x80 >> (length - 1)))) length++;
  if (length > 8 || pos + length > b.length) return null;
  let value = keepMarker ? first : first & (0xff >> length);
  let allOnes = value === (0xff >> length);
  for (let i = 1; i < length; i++) {
    value = value * 256 + b[pos + i];
    if (b[pos + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
};

const readUint = (b: Uint8Array, start: number, size: number) => {
  let v = 0;
  for (let i = 0; i < size; i++) v = v * 256 + b[start + i];
  return v;
};

/** 8-byte size field (0x01 marker + 7 bytes) — always big enough for a header. */
const sizeBytes = (n: number) => {
  const out = new Uint8Array(8);
  out[0] = 0x01;
  for (let i = 7; i >= 1; i--) { out[i] = n % 256; n = Math.floor(n / 256); }
  return out;
};

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

/**
 * Returns the header bytes with a Duration added to Info, or null when the
 * file already has one or isn't laid out as expected (then it's left alone).
 */
export const patchWebmHeader = (head: Uint8Array, seconds: number): Uint8Array | null => {
  if (!(seconds > 0)) return null;
  let pos = 0;
  const ebmlId = readVint(head, pos, true);
  if (ebmlId?.value !== EBML) return null;
  pos += ebmlId.length;
  const ebmlSize = readVint(head, pos);
  if (!ebmlSize || ebmlSize.unknown) return null;
  pos += ebmlSize.length + ebmlSize.value;

  const segId = readVint(head, pos, true);
  if (segId?.value !== SEGMENT) return null;
  pos += segId.length;
  const segSize = readVint(head, pos);
  // A sized Segment would need its size rewritten too; MediaRecorder streams it as unknown.
  if (!segSize || !segSize.unknown) return null;
  pos += segSize.length;

  while (pos < head.length) {
    const id = readVint(head, pos, true);
    if (!id) return null;
    const size = readVint(head, pos + id.length);
    if (!size || size.unknown || id.value === CLUSTER) return null;
    const dataStart = pos + id.length + size.length;
    const dataEnd = dataStart + size.value;
    if (dataEnd > head.length) return null;

    if (id.value === INFO) {
      let scale = 1_000_000;
      for (let p = dataStart; p < dataEnd;) {
        const cid = readVint(head, p, true);
        const csize = cid && readVint(head, p + cid.length);
        if (!cid || !csize || csize.unknown) return null;
        const cdata = p + cid.length + csize.length;
        if (cid.value === DURATION) return null; // already has one
        if (cid.value === TIMECODE_SCALE) scale = readUint(head, cdata, csize.value) || scale;
        p = cdata + csize.value;
      }
      const duration = new Uint8Array(11);
      duration.set([0x44, 0x89, 0x88]); // Duration, 8-byte float
      new DataView(duration.buffer).setFloat64(3, (seconds * 1e9) / scale);
      const body = concat(head.subarray(dataStart, dataEnd), duration);
      return concat(
        head.subarray(0, pos),
        head.subarray(pos, pos + id.length),
        sizeBytes(body.length),
        body,
        head.subarray(dataEnd),
      );
    }
    pos = dataEnd;
  }
  return null;
};

/** The blob with its duration written in, or the same blob if it doesn't need (or allow) it. */
export const withWebmDuration = async (blob: Blob, seconds: number): Promise<Blob> => {
  if (!/webm/i.test(blob.type) && blob.type !== '') return blob;
  try {
    const headLen = Math.min(blob.size, HEAD_BYTES);
    const head = new Uint8Array(await blob.slice(0, headLen).arrayBuffer());
    const patched = patchWebmHeader(head, seconds);
    return patched ? new Blob([patched as Uint8Array<ArrayBuffer>, blob.slice(headLen)], { type: blob.type }) : blob;
  } catch {
    return blob;
  }
};
