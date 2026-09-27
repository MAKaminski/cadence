import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { LinkedInButton } from "./linkedin-button";
import { DemoButton } from "./demo-button";
import { isDemo } from "@/lib/mode";
import { OAuthContinue } from "./oauth-continue";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const connecting = Boolean(q.sig);
  // Only same-site paths, so `next` can't send anyone elsewhere.
  const next = typeof q.next === "string" && /^\/[a-z]/.test(q.next) ? q.next : null;
  const session = await auth.api.getSession({ headers: await headers() });
  if (session && !connecting) redirect(next ?? "/app");
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl">Sign in to Cadence</CardTitle>
            <CardDescription>
              Cadence uses your LinkedIn account to sign you in and, once you approve a post, to publish it.
              LinkedIn will ask you to allow both.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {connecting && !session && <p className="rounded-lg bg-muted p-3 text-sm">Sign in to connect your AI assistant to Cadence. You'll choose what it can do next.</p>}
            {session && connecting ? <OAuthContinue /> : <>
            {isDemo() ? <>
              <DemoButton next={next ?? undefined} />
              <p className="text-xs text-muted-foreground">Demo mode: a throwaway account with sample data. Nothing is sent to LinkedIn, Stripe or any AI service.</p>
            </> : <LinkedInButton next={next ?? undefined} />}
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
