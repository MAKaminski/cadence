// A small zip reader for the browser: reads the central directory from a File, then only the entries it's
// asked for, inflated with the platform's DecompressionStream. Setup uses it so a LinkedIn export never
// leaves the browser whole — only the few CSVs it needs do. (Large server-side imports use src/lib/zip.ts.)

const EOCD = 0x06054b50, CENTRAL = 0x02014b50, LOCAL = 0x04034b50;

export class ZipLiteError extends Error {}

type Entry = { name: string; method: number; compressedSize: number; offset: number; flags: number };

const bytes = async (b: Blob, from: number, to: number) => new DataView(await b.slice(from, to).arrayBuffer());

async function directory(file: Blob): Promise<Entry[]> {
  const tailLen = Math.min(file.size, 22 + 65_535);
  const tail = await bytes(file, file.size - tailLen, file.size);
  let at = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) if (tail.getUint32(i, true) === EOCD) { at = i; break; }
  if (at < 0) throw new ZipLiteError("That file isn't a zip.");
  const count = tail.getUint16(at + 10, true), size = tail.getUint32(at + 12, true), start = tail.getUint32(at + 16, true);
  if (start === 0xffffffff || count === 0xffff) throw new ZipLiteError("That zip is too large to read here.");
  const dir = await bytes(file, start, start + size);
  const out: Entry[] = [];
  const dec = new TextDecoder();
  for (let p = 0, n = 0; n < count && p + 46 <= dir.byteLength; n++) {
    if (dir.getUint32(p, true) !== CENTRAL) break;
    const nameLen = dir.getUint16(p + 28, true), extra = dir.getUint16(p + 30, true), comment = dir.getUint16(p + 32, true);
    out.push({
      flags: dir.getUint16(p + 8, true), method: dir.getUint16(p + 10, true), compressedSize: dir.getUint32(p + 20, true),
      offset: dir.getUint32(p + 42, true), name: dec.decode(new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nameLen)),
    });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

async function text(file: Blob, e: Entry): Promise<string> {
  if (e.flags & 1) throw new ZipLiteError(`${e.name} is encrypted.`);
  const local = await bytes(file, e.offset, e.offset + 30);
  if (local.getUint32(0, true) !== LOCAL) throw new ZipLiteError("That zip is damaged.");
  const start = e.offset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
  const body = file.slice(start, start + e.compressedSize);
  if (e.method === 0) return body.text();
  if (e.method !== 8) throw new ZipLiteError(`${e.name} uses a compression this page can't read.`);
  return new Response(body.stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
}

/** The text of every entry whose path `want` accepts, keyed by path. */
export async function readTexts(file: Blob, want: (path: string) => boolean): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const e of await directory(file)) if (!e.name.endsWith("/") && want(e.name)) out[e.name] = await text(file, e);
  return out;
}
