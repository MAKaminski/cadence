// The operator's view of a feature: who uses it, how, what it stores and what it costs. Reads across
// users, so it runs on the server's own connection (not asUser) and only the admin page calls it.
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { featureFlags } from "@/db/schema";
import { FLAGS } from "@/lib/flags";

const rows = <T>(r: unknown) => r as T[];

/** Every feature that records usage events, with what its three daily series count (SQL `like`
 *  patterns on the action) and their names on the page. */
export const FEATURES = {
  examples: { label: "Examples", series: [["add_%", "Added"], ["rate_%", "Rated"], ["analyze", "Analysed"]] },
  import: { label: "AI history import", series: [["upload_done", "Uploaded"], ["accept_%", "Accepted"], ["distill", "Distilled"]] },
} as const;
export type Feature = keyof typeof FEATURES;
export const isFeature = (f: unknown): f is Feature => typeof f === "string" && f in FEATURES;

export type UsageReport = Awaited<ReturnType<typeof usageReport>>;

export async function usageReport(feature: Feature, days = 30) {
  const since = sql`now() - make_interval(days => ${days})`;
  const flagged = feature in FLAGS;
  const [flag] = flagged ? await db.select().from(featureFlags).where(eq(featureFlags.key, feature)) : [];
  const [a, b, c] = FEATURES[feature].series.map(([pattern]) => pattern);
  const actions = rows<{ action: string; events: number; users: number; bytes: number; cost: number }>(await db.execute(sql`
    select action, count(*)::int as events, count(distinct user_id)::int as users,
           coalesce(sum(bytes), 0)::bigint::float8 as bytes, coalesce(sum(cost_usd), 0)::float8 as cost
    from usage_events where feature = ${feature} and created_at >= ${since}
    group by action order by events desc`));
  const daily = rows<{ day: string; added: number; rated: number; analyzed: number; cost: number }>(await db.execute(sql`
    with d as (select generate_series(date_trunc('day', now()) - make_interval(days => ${days - 1}), date_trunc('day', now()), interval '1 day') as day)
    select to_char(d.day, 'YYYY-MM-DD') as day,
           count(u.id) filter (where u.action like ${a})::int as added,
           count(u.id) filter (where u.action like ${b})::int as rated,
           count(u.id) filter (where u.action like ${c})::int as analyzed,
           coalesce(sum(u.cost_usd), 0)::float8 as cost
    from d left join usage_events u on u.feature = ${feature} and date_trunc('day', u.created_at) = d.day
    group by d.day order by d.day`));
  const [totals] = rows<{ users: number; events: number; cost: number }>(await db.execute(sql`
    select count(distinct user_id)::int as users, count(*)::int as events, coalesce(sum(cost_usd), 0)::float8 as cost
    from usage_events where feature = ${feature} and created_at >= ${since}`));
  const [stored] = feature === "examples" ? rows<{ examples: number; up: number; down: number; files: number; bytes: number; failed: number }>(await db.execute(sql`
    select (select count(*) from examples)::int as examples,
           (select count(*) from examples where rating = 'up')::int as up,
           (select count(*) from examples where rating = 'down')::int as down,
           (select count(*) from example_media)::int as files,
           (select coalesce(sum(bytes), 0) from example_media)::bigint::float8 as bytes,
           (select count(*) from examples where analysis_status = 'failed')::int as failed`)) : [];
  const [imports] = feature === "import" ? rows<{ imports: number; messages: number; pending: number; accepted: number; failed: number }>(await db.execute(sql`
    select (select count(*) from history_imports)::int as imports,
           (select count(*) from history_messages)::int as messages,
           (select count(*) from history_suggestions where status = 'pending')::int as pending,
           (select count(*) from history_suggestions where status = 'accepted')::int as accepted,
           (select count(*) from history_imports where status = 'failed')::int as failed`)) : [];
  const people = rows<{ email: string; events: number; cost: number; last: string }>(await db.execute(sql`
    select u.email, count(e.id)::int as events, coalesce(sum(e.cost_usd), 0)::float8 as cost, to_char(max(e.created_at), 'YYYY-MM-DD') as last
    from usage_events e join "user" u on u.id = e.user_id
    where e.feature = ${feature} and e.created_at >= ${since}
    group by u.email order by events desc limit 10`));
  return {
    feature, days,
    flag: flagged ? { enabledForAll: flag?.enabledForAll ?? false, allowEmails: (flag?.allowEmails as string[] | undefined) ?? [] } : null,
    series: FEATURES[feature].series.map(([, name]) => name),
    totals, actions, daily, stored: stored ?? null, imports: imports ?? null, people,
  };
}
