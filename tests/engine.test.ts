// The engine's rules, on fictional fixtures. Every threshold comes from src/lib/catalog.ts.
import { describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/catalog";
import { escapeCommentary, formatForLinkedIn } from "@/engine/format";
import { qualityChecks } from "@/engine/gate";
import { unsupportedClaims } from "@/engine/facts";
import { noGoHits, similarity } from "@/engine/suppress";
import { evaluate, pickBest } from "@/engine/evaluate";
import { nextSlots, zoned } from "@/engine/schedule";

const ctx = {
  facts: ["Fractional CFO for three climate-tech startups", "Former controller at Northwind Solar, 2019–2023", "Cut month-end close from 12 days to 4", "CPA"],
  notes: ["This week a founder asked how to model heat-pump subsidies"],
  topics: ["startup finance", "climate tech"],
  noGo: ["Contoso"],
  recent: [] as string[],
};

describe("format", () => {
  it("strips markdown LinkedIn would show raw", () => {
    const r = formatForLinkedIn("# Title\n\n**Bold** and *soft* and `code`\n- one\n- two\n\n\n\nend");
    expect(r.text).toBe("Title\n\nBold and soft and code\n• one\n• two\n\nend");
    expect(r.fixes).toContain("Removed markdown LinkedIn would show as raw symbols");
  });
  it(`caps hashtags at ${LIMITS.maxHashtags}`, () => {
    const r = formatForLinkedIn("Post\n\n#a #b #c #d #e");
    expect(r.text.match(/#\w/g)).toHaveLength(LIMITS.maxHashtags);
  });
  it("escapes LinkedIn's reserved characters, backslash first", () => {
    expect(escapeCommentary("a (b) [c] {d} <e> @f |g ~h _i *j \\k")).toBe("a \\(b\\) \\[c\\] \\{d\\} \\<e\\> \\@f \\|g \\~h \\_i \\*j \\\\k");
  });
  it("leaves plain text alone", () => {
    expect(formatForLinkedIn("Plain post.\n\nSecond line.").fixes).toEqual([]);
  });
});

describe("quality", () => {
  it("flags a long hook, a stock phrase and length", () => {
    const text = `${"x".repeat(LIMITS.hookChars + 1)}\nLet that sink in.\n${"y".repeat(LIMITS.targetChars)}`;
    const out = Object.fromEntries(qualityChecks(text).map((c) => [c.id, c.outcome]));
    expect(out).toEqual({ hook: "rewrite", phrases: "rewrite", length: "rewrite", hard_length: "pass" });
  });
  it("holds anything over LinkedIn's hard limit", () => {
    expect(qualityChecks("z".repeat(LIMITS.hardChars + 1)).find((c) => c.id === "hard_length")?.outcome).toBe("held");
  });
});

describe("facts", () => {
  const sources = [...ctx.facts, ...ctx.notes, ...ctx.topics];
  it("accepts claims that come from the user", () => {
    expect(unsupportedClaims("I cut month-end close from 12 days to 4 at Northwind Solar. As a CPA, here's how.", sources)).toEqual([]);
  });
  it("catches an invented number, company and credential", () => {
    const bad = unsupportedClaims("I saved Fabrikam $2.4M and 38% of spend. As a CFA, I know.", sources);
    expect(bad).toEqual(expect.arrayContaining(["Fabrikam", "$2.4M", "38%", "CFA"]));
  });
  it("ignores single digits and sentence-start capitals", () => {
    expect(unsupportedClaims("Three lessons. Most founders get 2 things wrong.", sources)).toEqual([]);
  });
});

describe("suppression", () => {
  it("scores identical text 1 and unrelated text low", () => {
    expect(similarity("close the books faster", "close the books faster")).toBe(1);
    expect(similarity("close the books faster", "heat pumps in winter")).toBeLessThan(0.2);
  });
  it("finds never-write-about names as whole words", () => {
    expect(noGoHits("We beat contoso on price.", ctx.noGo)).toEqual(["Contoso"]);
    expect(noGoHits("Contosoville is a town.", ctx.noGo)).toEqual([]);
  });
});

describe("evaluate", () => {
  it("passes a clean draft and holds a repeat", () => {
    const text = "Most founders model subsidies last.\n\nThis week a founder asked how to model heat-pump subsidies. Start with the timing, not the amount.";
    expect(evaluate(text, ctx).verdict).toBe("ok");
    expect(evaluate(text, { ...ctx, recent: [text] }).verdict).toBe("held");
  });
  it("prefers the candidate with fewer problems", () => {
    const good = evaluate("Close faster.\n\nI cut month-end close from 12 days to 4.", ctx);
    const bad = evaluate("Close faster.\n\nI cut close by 90% at Fabrikam.", ctx);
    expect(pickBest([bad, good])).toBe(good);
  });
});

describe("schedule", () => {
  const cadence = { perWeek: 2, days: ["Tue", "Thu", "Fri"], time: "09:00", tz: "America/New_York" };
  it("converts wall-clock time across DST", () => {
    expect(zoned(2026, 7, 1, 9, 0, "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(zoned(2026, 12, 1, 9, 0, "America/New_York").toISOString()).toBe("2026-12-01T14:00:00.000Z");
  });
  it("uses the posting days and stops at posts per week", () => {
    const monday = new Date("2026-09-28T12:00:00Z"); // Mon 08:00 New York
    const slots = nextSlots(cadence, monday, [], 3).map((d) => d.toISOString());
    expect(slots).toEqual(["2026-09-29T13:00:00.000Z", "2026-10-01T13:00:00.000Z", "2026-10-06T13:00:00.000Z"]);
  });
  it("skips taken slots", () => {
    const monday = new Date("2026-09-28T12:00:00Z");
    const [s] = nextSlots(cadence, monday, [new Date("2026-09-29T13:00:00Z")]);
    expect(s.toISOString()).toBe("2026-10-01T13:00:00.000Z");
  });
});
