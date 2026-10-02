import { existsSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HELP, HELP_GROUPS, videoOf } from "@/lib/help";

// The Help page promises a demo for every topic: each has its recorded video and poster in public/help
// (pnpm help:record), small enough to serve from the app.
describe("help topics", () => {
  it("each has a unique id, a known group, steps and questions", () => {
    expect(new Set(HELP.map((t) => t.id)).size).toBe(HELP.length);
    for (const t of HELP) {
      expect(HELP_GROUPS.map((g) => g.id)).toContain(t.group);
      expect(t.steps.length).toBeGreaterThan(0);
      expect(t.faqs.length).toBeGreaterThan(0);
    }
  });
  it("each has its video and poster, under 2 MB", () => {
    for (const t of HELP) {
      const v = videoOf(t.id);
      for (const f of [v.src, v.poster]) {
        const file = `public${f}`;
        expect(existsSync(file), `${file} (run pnpm help:record ${t.id})`).toBe(true);
        expect(statSync(file).size).toBeLessThan(2 * 1024 * 1024);
      }
    }
  });
});
