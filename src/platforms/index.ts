import { isDemo } from "@/lib/mode";
import { linkedin } from "./linkedin";
import { x } from "./x";
import { mockFor } from "./mock";
import type { PlatformId } from "./registry";
import type { PlatformAdapter } from "./types";

/** The adapter for each live channel in ./registry.ts. */
const ADAPTERS: Partial<Record<PlatformId, PlatformAdapter>> = { linkedin, x };
export const hasAdapter = (p: PlatformId) => p in ADAPTERS;

/** The publisher for a connection. Demo mode and App Review accounts (`platform_data.reviewer`) always
 *  get the recording publisher, so nothing they do can reach a real platform. */
export function adapterFor(platform: PlatformId, account?: { platformData?: unknown } | null): PlatformAdapter {
  if (isDemo() || (account?.platformData as { reviewer?: boolean } | undefined)?.reviewer) return mockFor(platform);
  const a = ADAPTERS[platform];
  if (!a) throw new Error(`No adapter for ${platform}`);
  return a;
}
export { PublishError } from "./types";
