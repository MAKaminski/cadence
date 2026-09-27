import { isDemo } from "@/lib/mode";
import { linkedin } from "./linkedin";
import { mockPlatform } from "./mock";
import type { PlatformAdapter } from "./types";

export function adapterFor(platform: "linkedin"): PlatformAdapter {
  if (isDemo()) return mockPlatform;
  if (platform === "linkedin") return linkedin;
  throw new Error(`No adapter for ${platform}`);
}
export { PublishError } from "./types";
