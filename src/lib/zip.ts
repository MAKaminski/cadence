// Reads a .zip the way an export needs: the central directory first (it sits at the end), then one
// entry at a time as a stream through zlib, so a file of hundreds of megabytes is never in memory.
// Stored and deflated entries, zip64, and data descriptors (their sizes come from the directory).
import { Readable } from "node:stream";
import { createInflateRaw } from "node:zlib";

/** Random access to bytes that may not fit in memory: the upload's chunks in Postgres, or a Buffer in tests. */
export interface ByteSource {
  size: number;
  read(offset: number, length: number): Promise<Buffer>;
  /** `length` bytes from `offset`, in pieces. */
  stream(offset: number, length: number): AsyncIterable<Buffer>;
}

export class ZipError extends Error {}

export type ZipEntry = { name: string; method: number; compressedSize: number; size: number; offset: number; encrypted: boolean };

const EOCD = 0x06054b50, ZIP64_LOCATOR = 0x07064b50, ZIP64_EOCD = 0x06064b50, CENTRAL = 0x02014b50, LOCAL = 0x04034b50;
const MAX_DIRECTORY = 64 * 1024 * 1024;

/** A whole Buffer as a ByteSource. */
export function bufferSource(buf: Buffer, piece = 1 << 20): ByteSource {
  return {
    size: buf.length,
    read: async (o, n) => buf.subarray(o, o + n),
    async *stream(o, n) { for (let at = o; at < o + n; at += piece) yield buf.subarray(at, Math.min(o + n, at + piece)); },
  };
}

/** A zip starts with a local header, or (when empty) with the end record. */
export const isZip = (head: Buffer) => head.length >= 4 && [LOCAL, EOCD].includes(head.readUInt32LE(0));

const big = (b: Buffer, at: number) => { const n = b.readBigUInt64LE(at); if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new ZipError("The zip is too large to read."); return Number(n); };

/** Every entry in the central directory. */
export async function entries(src: ByteSource): Promise<ZipEntry[]> {
  // The end record is 22 bytes plus a comment of up to 65,535; search backwards for its signature.
  const tailLen = Math.min(src.size, 22 + 65_535);
  const tail = await src.read(src.size - tailLen, tailLen);
  let at = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === EOCD) { at = i; break; }
  if (at < 0) throw new ZipError("This doesn't look like a complete zip file. Download the export again and upload it as it came.");
  let count = tail.readUInt16LE(at + 10), dirSize = tail.readUInt32LE(at + 12), dirOffset = tail.readUInt32LE(at + 16);
  if (count === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) {
    const locAt = src.size - tailLen + at - 20;
    const loc = locAt >= 0 ? await src.read(locAt, 20) : Buffer.alloc(0);
    if (loc.length < 20 || loc.readUInt32LE(0) !== ZIP64_LOCATOR) throw new ZipError("The zip's zip64 directory is missing.");
    const rec = await src.read(big(loc, 8), 56);
    if (rec.readUInt32LE(0) !== ZIP64_EOCD) throw new ZipError("The zip's zip64 directory is damaged.");
    count = big(rec, 32); dirSize = big(rec, 40); dirOffset = big(rec, 48);
  }
  if (dirSize > MAX_DIRECTORY || dirOffset + dirSize > src.size) throw new ZipError("The zip's directory is damaged.");
  const dir = await src.read(dirOffset, dirSize);
  const out: ZipEntry[] = [];
  for (let p = 0, n = 0; n < count; n++) {
    if (p + 46 > dir.length || dir.readUInt32LE(p) !== CENTRAL) throw new ZipError("The zip's directory is damaged.");
    const flags = dir.readUInt16LE(p + 8), method = dir.readUInt16LE(p + 10);
    let compressedSize = dir.readUInt32LE(p + 20), size = dir.readUInt32LE(p + 24), offset = dir.readUInt32LE(p + 42);
    const nameLen = dir.readUInt16LE(p + 28), extraLen = dir.readUInt16LE(p + 30), commentLen = dir.readUInt16LE(p + 32);
    const name = dir.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    // The zip64 extra field holds, in order, only the values that overflowed.
    for (let e = p + 46 + nameLen, end = e + extraLen; e + 4 <= end;) {
      const id = dir.readUInt16LE(e), len = dir.readUInt16LE(e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) { size = big(dir, q); q += 8; }
        if (compressedSize === 0xffffffff) { compressedSize = big(dir, q); q += 8; }
        if (offset === 0xffffffff) { offset = big(dir, q); }
      }
      e += 4 + len;
    }
    out.push({ name, method, compressedSize, size, offset, encrypted: (flags & 1) === 1 });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** One entry's uncompressed bytes, as a stream. */
export async function* open(src: ByteSource, e: ZipEntry): AsyncGenerator<Buffer> {
  if (e.encrypted) throw new ZipError(`${e.name} is encrypted. Upload the export as it came, without a password.`);
  if (e.method !== 0 && e.method !== 8) throw new ZipError(`${e.name} uses a compression method Cadence can't read (${e.method}).`);
  const head = await src.read(e.offset, 30);
  if (head.length < 30 || head.readUInt32LE(0) !== LOCAL) throw new ZipError(`The zip entry ${e.name} is damaged.`);
  const start = e.offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
  if (start + e.compressedSize > src.size) throw new ZipError(`The zip entry ${e.name} is cut off. Download the export again.`);
  const raw = src.stream(start, e.compressedSize);
  if (e.method === 0) { yield* raw; return; }
  const inflate = createInflateRaw();
  const input = Readable.from(raw);
  input.on("error", (err) => inflate.destroy(err));
  input.pipe(inflate);
  try {
    for await (const piece of inflate) yield piece as Buffer;
  } catch (err) {
    throw new ZipError(`The zip entry ${e.name} couldn't be unpacked (${(err as Error).message}).`);
  } finally {
    input.destroy();
  }
}
