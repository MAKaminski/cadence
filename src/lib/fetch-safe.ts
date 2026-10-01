// Fetching a URL someone pasted. The server makes the request, so it must not become a way to reach
// the server's own network: only http(s) on ports 80/443, every address checked after DNS resolution
// (at connect time, so a name can't be re-pointed between the check and the request), redirects
// followed by hand and each hop checked again, a size cap and a timeout.
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import { EXAMPLES } from "./catalog";

export class FetchRefused extends Error {}

/** True for loopback, private, link-local, carrier-grade NAT, multicast, reserved and unspecified addresses. */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9")
      || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff") || v.startsWith("64:ff9b:") || v.startsWith("2001:db8");
  }
  return true;
}

/** A URL we are willing to request at all, before DNS. */
export function checkUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new FetchRefused("That isn't a valid URL."); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new FetchRefused("Only http and https links can be added.");
  if (u.username || u.password) throw new FetchRefused("Links with a username or password can't be added.");
  if (u.port && u.port !== "80" && u.port !== "443") throw new FetchRefused("Only links on the standard web ports can be added.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && isPrivateAddress(host)) throw new FetchRefused("That address isn't on the public internet.");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local") || !host.includes(".")) {
    throw new FetchRefused("That address isn't on the public internet.");
  }
  return u;
}

/** dns.lookup that refuses private addresses: used as the socket's lookup, so the check is at connect time. */
function guardedLookup(hostname: string, options: dns.LookupOptions, cb: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, "");
    const list = addresses as dns.LookupAddress[];
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) {
      return cb(Object.assign(new FetchRefused("That address isn't on the public internet."), { code: "EPRIVATE" }), "");
    }
    if (options.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

export type Fetched = { url: string; status: number; contentType: string; body: Buffer };

function once(u: URL, maxBytes: number, signal: AbortSignal): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  const mod = u.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(u, {
      method: "GET", lookup: guardedLookup as unknown as net.LookupFunction, signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; Cadence link preview)", accept: "text/html,image/*,video/*,application/pdf;q=0.9,*/*;q=0.5" },
    }, (res) => {
      const len = Number(res.headers["content-length"] ?? 0);
      if (len > maxBytes) { res.destroy(); return reject(new FetchRefused(`That file is over the ${Math.round(maxBytes / 1048576)} MB limit.`)); }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > maxBytes) { res.destroy(); reject(new FetchRefused(`That file is over the ${Math.round(maxBytes / 1048576)} MB limit.`)); }
        else chunks.push(c);
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

/** GET a public URL, following up to EXAMPLES.maxRedirects redirects, each one checked. */
export async function fetchSafe(raw: string, maxBytes: number = EXAMPLES.maxBytes): Promise<Fetched> {
  let u = checkUrl(raw);
  const signal = AbortSignal.timeout(EXAMPLES.fetchTimeoutMs);
  for (let hop = 0; hop <= EXAMPLES.maxRedirects; hop++) {
    let r;
    try { r = await once(u, maxBytes, signal); }
    catch (e) {
      if (e instanceof FetchRefused) throw e;
      if ((e as { code?: string }).code === "EPRIVATE") throw new FetchRefused("That address isn't on the public internet.");
      if ((e as Error).name === "TimeoutError" || (e as Error).name === "AbortError") throw new FetchRefused("That page took too long to answer.");
      throw new FetchRefused("Couldn't reach that page.");
    }
    if (r.status >= 300 && r.status < 400 && r.headers.location) { u = checkUrl(new URL(r.headers.location, u).toString()); continue; }
    if (r.status >= 400) throw new FetchRefused(`That page answered ${r.status}.`);
    return { url: u.toString(), status: r.status, contentType: String(r.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase(), body: r.body };
  }
  throw new FetchRefused("That link redirects too many times.");
}
