import { describe, expect, it } from "vitest";
import { ACTIVITY_PASTE } from "./fixtures/linkedin-activity";
import { count, isVerbatim, numbersLine, parseActivity, rankPosts, score } from "@/lib/activity-posts";

describe("best posts from the Activity page", () => {
  it("reads each of the person's own posts with its numbers, and leaves out reposts and short ones", () => {
    const posts = parseActivity(ACTIVITY_PASTE);
    expect(posts).toHaveLength(3);
    expect(posts[0]).toMatchObject({ reactions: 42, comments: 12, reposts: 3, score: 42 + 24 + 9, source: "activity" });
    expect(posts[0].text).toBe("Lost 2R on a breakout this week.\n\nThe setup was fine. The size wasn't: I doubled it after two winners. Back to fixed risk per trade, and a note in the journal so I see it next time.");
    expect(posts[1]).toMatchObject({ reactions: 1200, comments: 96, reposts: 40 });
    expect(posts[1].text).not.toMatch(/image|Activate/);
    expect(posts[2]).toMatchObject({ reactions: 230, comments: 4, reposts: null });
    expect(posts.some((p) => p.text.includes("Volatility is not risk"))).toBe(false); // someone else's, reposted
  });
  it("ranks by reactions + 2 × comments + 3 × reposts", () => {
    const ranked = rankPosts(parseActivity(ACTIVITY_PASTE));
    expect(ranked.map((p) => p.score)).toEqual([1200 + 192 + 120, 230 + 8, 42 + 24 + 9]); // 1512, 238, 75
    expect(numbersLine(ranked[0])).toBe("1,200 reactions · 96 comments · 40 reposts");
  });
  it("puts unscored posts after scored ones, longest first, and drops duplicates", () => {
    const t = (s: string) => s.padEnd(100, ".");
    const ranked = rankPosts([
      { text: t("a"), reactions: null, comments: null, reposts: null, score: null, source: "export" },
      { text: t("b") + "longer", reactions: null, comments: null, reposts: null, score: null, source: "export" },
      { text: t("c"), reactions: 5, comments: 0, reposts: 0, score: 5, source: "cadence" },
      { text: t("c"), reactions: 1, comments: 0, reposts: 0, score: 1, source: "activity" },
    ]);
    expect(ranked.map((p) => p.text[0])).toEqual(["c", "b", "a"]);
  });
  it("reads LinkedIn's number formats", () => {
    expect([count("1,204"), count("1.2K"), count("3M"), count("17"), count("x")]).toEqual([1204, 1200, 3_000_000, 17, null]);
    expect(score({ reactions: null, comments: null, reposts: null })).toBeNull();
  });
  it("accepts only text that is in the paste word for word", () => {
    const [p] = parseActivity(ACTIVITY_PASTE);
    expect(isVerbatim(ACTIVITY_PASTE, p.text)).toBe(true);
    expect(isVerbatim(ACTIVITY_PASTE, p.text.replace("doubled", "tripled"))).toBe(false);
  });
});
