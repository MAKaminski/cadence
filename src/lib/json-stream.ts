// Splits a JSON document into its top-level array's elements as the bytes arrive, so a
// conversations.json of hundreds of megabytes is parsed one conversation at a time. Structural
// characters are ASCII and UTF-8 continuation bytes never are, so scanning bytes is safe.

export class JsonStreamError extends Error {}

export type SplitReport = { skipped: number; truncated: boolean };

const WS = new Set([0x20, 0x09, 0x0a, 0x0d]);
const BOM = new Set([0xef, 0xbb, 0xbf]); // a UTF-8 byte order mark before the document
const QUOTE = 0x22, BACKSLASH = 0x5c, COMMA = 0x2c;
const OPEN = new Set([0x7b, 0x5b]), CLOSE = new Set([0x7d, 0x5d]);

/**
 * Yields each element of a top-level array (`[{…}, {…}]`), parsed. A top-level object is yielded once,
 * whole. Elements that aren't objects or arrays, or don't parse, are skipped and counted. A document
 * that stops part-way yields what was complete and sets `report.truncated`.
 */
export async function* elements(input: AsyncIterable<Buffer>, maxElementBytes: number, report: SplitReport = { skipped: 0, truncated: false }): AsyncGenerator<unknown> {
  let state: "start" | "array" | "object" | "done" = "start";
  let depth = 0, inStr = false, esc = false, primitive = false, size = 0, yielded = 0;
  let parts: Buffer[] = [];

  const emit = (tail: Buffer) => {
    const text = Buffer.concat([...parts, tail]).toString("utf8");
    parts = []; size = 0;
    try { return { ok: true as const, value: JSON.parse(text) as unknown }; } catch { report.skipped++; return { ok: false as const }; }
  };

  for await (const buf of input) {
    if (state === "done") continue;
    let start = depth > 0 ? 0 : -1;
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      if (inStr) {
        if (esc) esc = false; else if (c === BACKSLASH) esc = true; else if (c === QUOTE) inStr = false;
        continue;
      }
      if (state === "start") {
        if (WS.has(c) || BOM.has(c)) continue;
        if (c === 0x5b) { state = "array"; continue; }
        if (c === 0x7b) { state = "object"; depth = 1; start = i; continue; }
        throw new JsonStreamError("This isn't a conversations file: it should start with [ or {.");
      }
      if (depth === 0) {
        // Between elements of the top-level array.
        if (primitive) {
          if (c === QUOTE) inStr = true;
          else if (c === COMMA) primitive = false;
          else if (c === 0x5d) { state = "done"; break; }
          continue;
        }
        if (WS.has(c) || c === COMMA) continue;
        if (c === 0x5d) { state = "done"; break; }
        if (OPEN.has(c)) { depth = 1; start = i; continue; }
        primitive = true; report.skipped++;
        if (c === QUOTE) inStr = true;
        continue;
      }
      if (c === QUOTE) inStr = true;
      else if (OPEN.has(c)) depth++;
      else if (CLOSE.has(c) && --depth === 0) {
        const r = emit(buf.subarray(start, i + 1));
        start = -1;
        if (r.ok) { yielded++; yield r.value; }
        if (state === "object") { state = "done"; break; }
      }
    }
    if (depth > 0 && state !== "done") {
      const piece = buf.subarray(Math.max(start, 0));
      size += piece.length;
      if (size > maxElementBytes) throw new JsonStreamError(`One conversation is over ${Math.round(maxElementBytes / 1048576)} MB. The file may be damaged.`);
      parts.push(piece);
    }
  }
  if (state === "start") throw new JsonStreamError("The conversations file is empty.");
  if (state !== "done") {
    if (!yielded) throw new JsonStreamError("The conversations file stops part-way through. Download the export again.");
    report.truncated = true;
  }
}
