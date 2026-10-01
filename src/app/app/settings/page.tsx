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
import { Billing } from "./billing";
import { Profile } from "./profile";
import { avatarFor } from "@/services/avatar";
import { billingFor } from "@/services/billing";
import { AutoPublish } from "./auto-publish";
import { ApiKeys, type KeyRow } from "./api-keys";
import { db } from "@/db";
import { apikey, oauthClient, oauthConsent } from "@/db/schema";
import { Connections, type Connection } from "./connections";
import { DeleteAccount } from "./delete-account";
import { ConnectLinkedIn } from "@/components/connect-linkedin";
import { linkedinConfigured } from "@/lib/linkedin-config";

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
  const [avatar, billing] = await Promise.all([avatarFor(user), billingFor(user.id)]);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Section title="Account">
        <Card id="profile">
          <CardHeader><CardTitle>Profile</CardTitle><CardDescription>Your name and photo, as Cadence shows them. Your LinkedIn photo is used until you upload one.</CardDescription></CardHeader>
          <CardContent><Profile name={user.name} avatar={avatar.src} uploaded={avatar.uploaded} linkedin={avatar.linkedin} /></CardContent>
        </Card>
        <Card id="billing">
          <CardHeader><CardTitle>Billing</CardTitle><CardDescription>{demo ? "Demo mode: switching plans is simulated." : `Signed in as ${user.email}. Invoices, card and cancellation are handled by Stripe.`}</CardDescription></CardHeader>
          <CardContent><Billing billing={billing} demo={demo} /></CardContent>
        </Card>
      </Section>
      <Section title="Writing and posting">
        <Card>
          <CardHeader><CardTitle>Your setup</CardTitle><CardDescription>Who you are, your facts, your voice, your posting rhythm and writing model ({s.p?.model === "claude-opus-5" ? "Claude Opus 5" : "Claude Sonnet 5"}).</CardDescription></CardHeader>
          <CardContent><Button variant="outline" render={<Link href="/onboarding?edit=1" />}>Edit setup</Button></CardContent>
        </Card>
        <Card id="import">
          <CardHeader><CardTitle>Your AI history</CardTitle><CardDescription>Import a ChatGPT or Claude export and review what it suggests for your setup.</CardDescription></CardHeader>
          <CardContent><Button variant="outline" render={<Link href="/app/import" />}>Import your AI history</Button></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Posting</CardTitle><CardDescription>Model use this month: ${s.spent.toFixed(2)} of ${LIMITS.monthlyCapUsd} included.</CardDescription></CardHeader>
          <CardContent><AutoPublish on={s.p?.auto ?? false} unlocked={remaining === 0} remaining={remaining} /></CardContent>
        </Card>
      </Section>
      <Section title="Connections">
        <Card>
          <CardHeader>
            <CardTitle>LinkedIn connection</CardTitle>
            <CardDescription>
              {demo ? "Demo mode: posts are recorded here, never sent to LinkedIn."
                : !linkedinConfigured() ? "Publishing to LinkedIn isn't set up on this server yet. Drafting works; nothing can be published until it is."
                : !s.conn ? "Not connected. Connect LinkedIn so Cadence can publish the posts you approve; drafting works without it."
                : `${s.conn.status === "active" ? "Connected" : s.conn.status === "expiring" ? "Ending soon" : "Disconnected"}${s.conn.expiresAt ? ` · renew before ${s.conn.expiresAt.toDateString()}` : ""}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            {!demo && linkedinConfigured() && <ConnectLinkedIn label={s.conn ? "Reconnect LinkedIn" : "Connect LinkedIn"} />}
            <Link href="/app/channels" className="text-sm underline underline-offset-4">X and other channels</Link>
          </CardContent>
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
      </Section>
      <Section title="Danger zone">
        <Card id="delete">
          <CardHeader><CardTitle>Delete account</CardTitle></CardHeader>
          <CardContent><DeleteAccount /></CardContent>
        </Card>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}
