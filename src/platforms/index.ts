import { isDemo } from "@/lib/mode";
import { linkedin } from "./linkedin";
import { mockPlatform } from "./mock";
import type { PlatformAdapter } from "./types";

/** The publisher for a connection. Demo mode and App Review accounts (`platform_data.reviewer`) always
 *  get the recording publisher, so nothing they do can reach a real platform. */
export function adapterFor(platform: "linkedin", account?: { platformData?: unknown } | null): PlatformAdapter {
  if (isDemo() || (account?.platformData as { reviewer?: boolean } | undefined)?.reviewer) return mockPlatform;
  if (platform === "linkedin") return linkedin;
  throw new Error(`No adapter for ${platform}`);
}
export { PublishError } from "./types";
