import { randomUUID } from "node:crypto";
import type { PlatformAdapter } from "./types";

/** Demo mode's publisher: records the post, sends nothing anywhere. */
export const mockPlatform: PlatformAdapter = {
  platform: "linkedin",
  async publish() {
    return { externalId: `urn:li:share:demo-${randomUUID().slice(0, 8)}` };
  },
};
