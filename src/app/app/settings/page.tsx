import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { asUser } from "@/db";
import { drafts, llmUsage, platformAccounts, profiles } from "@/db/schema";
import { requireSubscriber } from "@/lib/session";
import { LIMITS } from "@/lib/catalog";
import { isDemo } from "@/lib/mode";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BillingButton } from "./billing-button";
import { AutoPublish } from "./auto-publish";
import { ApiKeys, type KeyRow } from "./api-keys";
import { db } from "@/db";
import { apikey, oauthClient, oauthConsent } from "@/db/schema";
import { Connections, type Connection } from "./connections";

export const metadata: Metadata = { title: "Settings" };

export default async function Settings() {
  const user = await requireSubscriber();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const s = await asUser(user.id, async (tx) => ({
    p: (await tx.select({ auto: profiles.autoPublish, model: profiles.model }).from(profiles).where(eq(profiles.userId, user.id)))[0],
    clean: (await tx.select({ n: sql<number>`count(*)::int` }).from(drafts).where(and(inArray(drafts.status, ["scheduled", "published"]), sql`${drafts.gate}->>'verdict' = 'ok'`)))[0].n,
    conn: (await tx.select().from(platformAccounts).where(eq(platformAccounts.platform, "linkedin")).limit(1))[0],
    spent: Number((await tx.select({ usd: sql<string>`coalesce(sum(${llmUsage.costUsd}),0)` }).from(llmUsage).where(gte(llmUsage.createdAt, monthStart)))[0].usd),
  }));
  const keys: KeyRow[] = (await db.select().from(apikey).where(eq(apikey.referenceId, user.id))).map((k) => ({
    id: k.id, name: k.name, start: k.start, lastUsed: k.lastRequest?.toISOString() ?? null, createdAt: k.createdAt.toISOString(),
    scopes: ((JSON.parse(k.permissions ?? "{}") as Record<string, string[]>).cadence ?? ["read"]),
  }));
  const connections: Connection[] = (await db.select({ clientId: oauthConsent.clientId, name: oauthClient.name, scopes: oauthConsent.scopes, since: oauthConsent.createdAt })
    .from(oauthConsent).innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId)).where(eq(oauthConsent.userId, user.id)))
    .map((c) => ({ ...c, name: c.name ?? "Assistant", since: c.since.toISOString() }));
  const remaining = Math.max(0, LIMITS.autoPublishAfter - s.clean);
  const demo = isDemo();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Card>
        <CardHeader><CardTitle>Your setup</CardTitle><CardDescription>Who you are, your facts, your voice, your posting rhythm and writing model ({s.p?.model === "claude-opus-5" ? "Claude Opus 5" : "Claude Sonnet 5"}).</CardDescription></CardHeader>
        <CardContent><Button variant="outline" render={<Link href="/onboarding?edit=1" />}>Edit setup</Button></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Posting</CardTitle><CardDescription>Model use this month: ${s.spent.toFixed(2)} of ${LIMITS.monthlyCapUsd} included.</CardDescription></CardHeader>
        <CardContent><AutoPublish on={s.p?.auto ?? false} unlocked={remaining === 0} remaining={remaining} /></CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>LinkedIn connection</CardTitle>
          <CardDescription>
            {demo ? "Demo mode: posts are recorded here, never sent to LinkedIn."
              : !s.conn ? "Not connected. Sign in with LinkedIn to connect."
              : `${s.conn.status === "active" ? "Connected" : s.conn.status === "expiring" ? "Ending soon" : "Disconnected"}${s.conn.expiresAt ? ` · renews by signing in before ${s.conn.expiresAt.toDateString()}` : ""}.`}
          </CardDescription>
        </CardHeader>
        {!demo && <CardContent><Button variant="outline" render={<a href="/login" />}>Reconnect LinkedIn</Button></CardContent>}
      </Card>
      <Card id="assistants">
        <CardHeader>
          <CardTitle>Connected assistants</CardTitle>
          <CardDescription>AI assistants you've connected over MCP, and what each may do. Disconnecting takes effect immediately.</CardDescription>
        </CardHeader>
        <CardContent><Connections items={connections} /></CardContent>
      </Card>
      <Card id="api">
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>
            For the <a className="underline" href="/docs/api">Cadence API</a> and CLI. Each key allows 60 requests a minute. Keys can never publish immediately;
            approved posts go out on your schedule.
          </CardDescription>
        </CardHeader>
        <CardContent><ApiKeys keys={keys} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Billing</CardTitle><CardDescription>{demo ? "Demo mode: no card, no charges." : `Signed in as ${user.email}. Invoices, card and cancellation are handled by Stripe.`}</CardDescription></CardHeader>
        {!demo && <CardContent><BillingButton /></CardContent>}
      </Card>
    </div>
  );
}
