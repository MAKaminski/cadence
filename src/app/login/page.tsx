import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, emailSignIn } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { LinkedInButton } from "./linkedin-button";
import { linkedinConfigured } from "@/lib/linkedin-config";
import { missingSignInKeys } from "@/lib/setup-check";
import { DemoButton } from "./demo-button";
import { EmailForm } from "./email-form";
import { isDemo } from "@/lib/mode";
import { OAuthContinue } from "./oauth-continue";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { oauthClient } from "@/db/schema";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const connecting = Boolean(q.sig);
  // Only same-site paths, so `next` can't send anyone elsewhere.
  const next = typeof q.next === "string" && /^\/[a-z]/.test(q.next) ? q.next : null;
  const session = await auth.api.getSession({ headers: await headers() });
  if (session && !connecting) redirect(next ?? "/app");
  const email = emailSignIn();
  // A placeholder LinkedIn app ID would send people to LinkedIn's error page: offer only what works.
  const linkedin = linkedinConfigured();
  const linkFailed = q.error === "link" || q.error === "INVALID_TOKEN" || q.error === "EXPIRED_TOKEN";
  const clientId = typeof q.client_id === "string" ? q.client_id : "";
  const [client] = connecting && clientId ? await db.select({ name: oauthClient.name }).from(oauthClient).where(eq(oauthClient.clientId, clientId)) : [];
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl">Sign in to Cadence</CardTitle>
            <CardDescription>
              {email && !linkedin && !isDemo() ? "Sign in with your email. Cadence emails you a one-time link."
                : email ? "Use your email, or your LinkedIn account. To publish, Cadence needs LinkedIn connected; you can do that during setup."
                : "Cadence uses your LinkedIn account to sign you in and, once you approve a post, to publish it. LinkedIn will ask you to allow both."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {linkFailed && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100" role="alert">That sign-in link has expired or was already used. Ask for a new one below.</p>}
            {connecting && !session && <p className="rounded-lg bg-muted p-3 text-sm">Sign in to connect {client?.name ?? "an app"} to Cadence. You'll choose what it can do next.</p>}
            {session && connecting ? <OAuthContinue /> : <>
            {email && <EmailForm next={connecting ? `/login?${new URLSearchParams(Object.entries(q).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v ? [[k, v]] : []))).toString()}` : next ?? undefined} />}
            {email && (isDemo() || linkedin) && <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>}
            {isDemo() ? <>
              <DemoButton next={next ?? undefined} />
              <p className="text-xs text-muted-foreground">Demo mode: a throwaway account with sample data. Nothing is sent to LinkedIn, Stripe or any AI service. Emailed sign-in links are printed in the server log.</p>
            </> : linkedin ? <LinkedInButton next={next ?? undefined} />
              : !email && <div className="rounded-lg border p-3 text-sm" role="status" data-testid="signin-unavailable">
                <p>Sign-in isn&apos;t set up on this server yet. The operator needs to set one of these in <code>deploy/.env</code> and redeploy:</p>
                <ul className="mt-2 list-disc pl-5 font-mono text-xs">{missingSignInKeys(process.env).map((k) => <li key={k}>{k}</li>)}</ul>
                <p className="mt-2 text-xs text-muted-foreground">Operator: <code>pnpm signin:check</code> on the server lists every setting; <code>pnpm signin:link you@example.com</code> signs you in meanwhile.</p>
              </div>}
            <p className="text-xs text-muted-foreground">
              New here? Signing in creates your account. You'll add a card next for the 7-day free trial.
              By continuing you agree to the <a className="underline" href="/terms">Terms</a> and <a className="underline" href="/privacy">Privacy policy</a>.
            </p>
            <a className="text-center text-xs text-muted-foreground underline-offset-4 hover:underline" href={`/login/review${connecting ? `?${new URLSearchParams(Object.entries(q).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v ? [[k, v]] : []))).toString()}` : next ? `?next=${encodeURIComponent(next)}` : ""}`}>App Review sign-in</a>
            </>}
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}
