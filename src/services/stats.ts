// Outreach and impact numbers for one user. The Results page, the API and the MCP server all read
// these, so a chart and an API response can never disagree.
import { eq, sql } from "drizzle-orm";
import { asUser } from "@/db";
import { profiles } from "@/db/schema";
import type { PlatformId } from "@/platforms/registry";

export type OutreachWeek = { week: string; posts: number; target: number };
export type Consistency = { streakWeeks: number; approved: number; edited: number; held: number; skipped: number; medianHoursToPost: number | null };
export type ImpactPost = { publicationId: string; publishedAt: string; excerpt: string; impressions: number; engagements: number; rate: number; movingRate: number; sample: boolean };
export type WhatWorks = { dimension: "angle" | "weekday" | "length"; label: string; posts: number; rate: number }[];

async function settings(userId: string) {
  const [p] = await asUser(userId, (tx) => tx.select({ cadence: profiles.cadence }).from(profiles).where(eq(profiles.userId, userId)));
  const c = (p?.cadence ?? {}) as { perWeek?: number; tz?: string };
  return { perWeek: c.perWeek ?? 3, tz: c.tz ?? "UTC" };
}

const rows = <T>(r: unknown) => r as T[];

/** Posts published per week (the user's weeks, Monday start) against their weekly target. */
// Every number is per channel (LinkedIn unless asked): an X version is the same post, so counting it
// would double a week's posts against the target.
export async function outreach(userId: string, weeks = 12, platform: PlatformId = "linkedin"): Promise<OutreachWeek[]> {
  const { perWeek, tz } = await settings(userId);
  const r = rows<{ week: string; posts: number }>(await asUser(userId, (tx) => tx.execute(sql`
    with w as (
      select generate_series(date_trunc('week', (now() at time zone ${tz})) - make_interval(weeks => ${weeks - 1}),
                             date_trunc('week', (now() at time zone ${tz})), interval '1 week') as week)
    select to_char(w.week, 'YYYY-MM-DD') as week, count(p.id)::int as posts
    from w left join publications p
      on p.status = 'published' and p.platform::text = ${platform} and date_trunc('week', p.published_at at time zone ${tz}) = w.week
    group by w.week order by w.week`)));
  return r.map((x) => ({ ...x, target: perWeek }));
}

export async function consistency(userId: string): Promise<Consistency> {
  const weeks = await outreach(userId, 26);
  let streak = 0;
  // The current week isn't over, so it only counts once it's already on target.
  const done = weeks[weeks.length - 1].posts >= weeks[0].target ? weeks : weeks.slice(0, -1);
  for (let i = done.length - 1; i >= 0 && done[i].posts >= done[i].target; i--) streak++;
  const [c] = rows<Omit<Consistency, "streakWeeks">>(await asUser(userId, (tx) => tx.execute(sql`
    select
      count(*) filter (where status in ('scheduled','published'))::int as approved,
      count(*) filter (where version > 1)::int as edited,
      count(*) filter (where status = 'held')::int as held,
      count(*) filter (where status = 'skipped')::int as skipped,
      (select percentile_cont(0.5) within group (order by extract(epoch from p.published_at - i.created_at) / 3600)
         from publications p join drafts d on d.id = p.draft_id
         join inputs i on i.id = (d.input_ids->>0)::uuid
         where p.status = 'published' and p.platform = 'linkedin')::float as "medianHoursToPost"
    from drafts where created_at >= date_trunc('month', now()) and platform = 'linkedin'`)));
  return { streakWeeks: streak, ...c, medianHoursToPost: c.medianHoursToPost == null ? null : Math.round(c.medianHoursToPost * 10) / 10 };
}

/** Latest numbers per published post, oldest first, with a 4-post moving engagement rate. */
export async function impact(userId: string, limit = 30, platform: PlatformId = "linkedin"): Promise<ImpactPost[]> {
  const r = rows<{ publicationId: string; publishedAt: Date; body: string; impressions: number; engagements: number; sample: boolean }>(await asUser(userId, (tx) => tx.execute(sql`
    select * from (
      select distinct on (p.id) p.id as "publicationId", p.published_at as "publishedAt", d.body,
        m.impressions, (coalesce(m.reactions,0) + coalesce(m.comments,0) + coalesce(m.reshares,0))::int as engagements,
        coalesce((m.platform_data->>'sample')::boolean, false) as sample
      from publications p join drafts d on d.id = p.draft_id join metrics m on m.publication_id = p.id
      where p.status = 'published' and p.platform::text = ${platform} order by p.id, m.captured_at desc) latest
    order by "publishedAt" desc limit ${limit}`))).reverse();
  return r.map((x, i) => {
    const rate = x.impressions ? x.engagements / x.impressions : 0;
    const window = r.slice(Math.max(0, i - 3), i + 1);
    const movingRate = window.reduce((a, w) => a + (w.impressions ? w.engagements / w.impressions : 0), 0) / window.length;
    return {
      publicationId: x.publicationId, publishedAt: new Date(x.publishedAt).toISOString(), excerpt: x.body.split("\n")[0].slice(0, 90),
      impressions: x.impressions, engagements: x.engagements, rate, movingRate, sample: x.sample,
    };
  });
}

/** Average engagement rate by angle, weekday and length band. Groups need at least one post. */
export async function whatWorks(userId: string, platform: PlatformId = "linkedin"): Promise<WhatWorks> {
  const { tz } = await settings(userId);
  const r = rows<{ dimension: WhatWorks[number]["dimension"]; label: string; posts: number; rate: number }>(await asUser(userId, (tx) => tx.execute(sql`
    with latest as (
      select distinct on (p.id) p.id, p.published_at, d.body, d.gate->>'angle' as angle, m.impressions,
        coalesce(m.reactions,0) + coalesce(m.comments,0) + coalesce(m.reshares,0) as eng
      from publications p join drafts d on d.id = p.draft_id join metrics m on m.publication_id = p.id
      where p.status = 'published' and p.platform::text = ${platform} and m.impressions > 0 order by p.id, m.captured_at desc)
    select 'angle' as dimension, coalesce(angle, 'Other') as label, count(*)::int as posts, avg(eng::float / impressions) as rate from latest group by 2
    union all
    select 'weekday', to_char(published_at at time zone ${tz}, 'Dy'), count(*)::int, avg(eng::float / impressions) from latest group by 2
    union all
    select 'length', case when length(body) < 600 then 'Short (<600)' when length(body) <= 1000 then 'Medium (600–1,000)' else 'Long (>1,000)' end,
      count(*)::int, avg(eng::float / impressions) from latest group by 2`)));
  return r.map((x) => ({ ...x, rate: Number(x.rate) }));
}
