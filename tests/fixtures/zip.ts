// A minimal zip writer for tests: stored or deflated entries, optionally forced to zip64, optionally
// using data descriptors. Only what the reader in src/lib/zip.ts has to cope with.
import { deflateRawSync } from "node:zlib";

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b: Buffer) => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };

export type Entry = { name: string; data: Buffer | string; method?: 0 | 8 };

export function makeZip(files: Entry[], opts: { zip64?: boolean; descriptor?: boolean; encrypted?: string } = {}): Buffer {
  const out: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data);
    const method = f.method ?? 8;
    const body = method === 8 ? deflateRawSync(raw) : raw;
    const name = Buffer.from(f.name);
    const crc = crc32(raw);
    const flags = (opts.descriptor ? 8 : 0) | (opts.encrypted === f.name ? 1 : 0);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(opts.descriptor ? 0 : crc, 14);
    local.writeUInt32LE(opts.descriptor ? 0 : body.length, 18); local.writeUInt32LE(opts.descriptor ? 0 : raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    out.push(local, name, body);
    if (opts.descriptor) { const d = Buffer.alloc(16); d.writeUInt32LE(0x08074b50, 0); d.writeUInt32LE(crc, 4); d.writeUInt32LE(body.length, 8); d.writeUInt32LE(raw.length, 12); out.push(d); }

    const extra = opts.zip64 ? Buffer.alloc(28) : Buffer.alloc(0);
    if (opts.zip64) {
      extra.writeUInt16LE(0x0001, 0); extra.writeUInt16LE(24, 2);
      extra.writeBigUInt64LE(BigInt(raw.length), 4); extra.writeBigUInt64LE(BigInt(body.length), 12); extra.writeBigUInt64LE(BigInt(offset), 20);
    }
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(45, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(flags, 8); c.writeUInt16LE(method, 10);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(opts.zip64 ? 0xffffffff : body.length, 20); c.writeUInt32LE(opts.zip64 ? 0xffffffff : raw.length, 24);
    c.writeUInt16LE(name.length, 28); c.writeUInt16LE(extra.length, 30);
    c.writeUInt32LE(opts.zip64 ? 0xffffffff : offset, 42);
    central.push(c, name, extra);
    offset += local.length + name.length + body.length + (opts.descriptor ? 16 : 0);
  }
  const dir = Buffer.concat(central);
  const tail: Buffer[] = [];
  if (opts.zip64) {
    const rec = Buffer.alloc(56);
    rec.writeUInt32LE(0x06064b50, 0); rec.writeBigUInt64LE(BigInt(44), 4); rec.writeUInt16LE(45, 12); rec.writeUInt16LE(45, 14);
    rec.writeBigUInt64LE(BigInt(files.length), 24); rec.writeBigUInt64LE(BigInt(files.length), 32);
    rec.writeBigUInt64LE(BigInt(dir.length), 40); rec.writeBigUInt64LE(BigInt(offset), 48);
    const loc = Buffer.alloc(20);
    loc.writeUInt32LE(0x07064b50, 0); loc.writeBigUInt64LE(BigInt(offset + dir.length), 8); loc.writeUInt32LE(1, 16);
    tail.push(rec, loc);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(opts.zip64 ? 0xffff : files.length, 8); end.writeUInt16LE(opts.zip64 ? 0xffff : files.length, 10);
  end.writeUInt32LE(opts.zip64 ? 0xffffffff : dir.length, 12); end.writeUInt32LE(opts.zip64 ? 0xffffffff : offset, 16);
  return Buffer.concat([...out, dir, ...tail, end]);
}
