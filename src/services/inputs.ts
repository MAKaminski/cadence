// The signals the Inputs page's direction rules read (src/lib/inputs.ts), gathered from the same
// services Results, Plan, Channels and Examples use, so a direction never disagrees with its evidence.
import { desc, eq, gte, sql } from "drizzle-orm";
import { asUser } from "@/db";
import { drafts, inputs, llmUsage } from "@/db/schema";
import { LIMITS } from "@/lib/catalog";
import { flagOnFor } from "@/lib/flags";
import type { Signals } from "@/lib/inputs";
import { consistency, impact, outreach, whatWorks } from "./stats";
import { getPlan } from "./plan";
import { getProfile } from "./profile";
import { listChannels } from "./channels";
import { autoPublishLeft } from "./drafts";
import { guidance } from "./examples";

const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export async function signals(userId: string) {
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [weeks, month, posts, works, plan, profile, channels, examplesOn] = await Promise.all([
    outreach(userId, 5), consistency(userId), impact(userId, 8), whatWorks(userId), getPlan(userId), getProfile(userId), listChannels(userId), flagOnFor("examples", userId),
  ]);
  const db = await asUser(userId, async (tx) => ({
    left: await autoPublishLeft(tx),
    waiting: (await tx.select({ n: sql<number>`count(*)::int` }).from(drafts).where(eq(drafts.status, "scheduled")))[0].n,
    spent: Number((await tx.select({ usd: sql<string>`coalesce(sum(${llmUsage.costUsd}),0)` }).from(llmUsage).where(gte(llmUsage.createdAt, monthStart)))[0].usd),
    lastCheckin: (await tx.select({ at: inputs.createdAt }).from(inputs).orderBy(desc(inputs.createdAt)).limit(1))[0]?.at ?? null,
  }));
  const rates = posts.filter((p) => p.impressions > 0).map((p) => p.rate);
  const days = works.filter((w) => w.dimension === "weekday" && w.posts >= 2).sort((a, b) => b.rate - a.rate);
  const on = plan.posting.rows.filter((r) => r.mode !== "off");
  const s: Signals = {
    weeks: weeks.slice(0, -1).map((w) => ({ posts: w.posts, target: w.target })),
    target: plan.posting.perWeek,
    rate: rates.length >= 8 ? { recent: mean(rates.slice(4)), earlier: mean(rates.slice(0, 4)) } : { recent: null, earlier: null },
    bestDay: days[0] ? { label: days[0].label, rate: days[0].rate, posts: days[0].posts } : null,
    onDays: DAY.filter((_, i) => on.some((r) => r.days[i] === "1")),
    month: { approved: month.approved, edited: month.edited, held: month.held },
    model: profile?.model ?? "claude-sonnet-5", spentShare: db.spent / LIMITS.monthlyCapUsd,
    autoPublish: { on: profile?.autoPublish ?? false, left: db.left },
    paused: plan.holds.some((h) => h.name === "all"), waiting: db.waiting,
    channels: channels.filter((c) => c.status === "live" && c.id !== "linkedin")
      .map((c) => ({ name: c.name, connected: Boolean(c.connection), connectable: c.connectable, drafting: c.connection ? c.connection.drafting : null })),
    examples: examplesOn ? await guidance(userId).then((g) => ({ rated: g.up + g.down })) : null,
    daysSinceCheckin: db.lastCheckin ? Math.floor((Date.now() - db.lastCheckin.getTime()) / 86_400_000) : null,
  };
  return { signals: s, plan, profile, channels, examplesOn };
}
