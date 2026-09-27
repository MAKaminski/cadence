import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { oauthClient } from "@/db/schema";
import { requireUser, hasSubscription } from "@/lib/session";
import { SiteHeader } from "@/components/site-chrome";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConsentForm } from "./consent-form";

export const metadata: Metadata = { title: "Connect an assistant", robots: { index: false } };

export default async function Consent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const user = await requireUser();
  const clientId = String(q.client_id ?? "");
  const [client] = clientId ? await db.select({ name: oauthClient.name, uri: oauthClient.uri }).from(oauthClient).where(eq(oauthClient.clientId, clientId)) : [];
  const requested = String(q.scope ?? "").split(/[ +]/).filter(Boolean);
  const name = client?.name ?? "An assistant";
  const subscribed = await hasSubscription(user.id);
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl">Connect {name} to Cadence?</CardTitle>
            <CardDescription>
              {name} will act as you ({user.email?.endsWith("demo.cadence.local") ? "demo user" : user.email}) with only what you allow below. You can disconnect it any time in Settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!subscribed && <p className="mb-4 rounded-lg bg-muted p-3 text-sm">You don't have an active trial yet. The connection will work once you <a className="underline" href="/checkout">start your 7-day trial</a>.</p>}
            <ConsentForm requested={requested} />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
