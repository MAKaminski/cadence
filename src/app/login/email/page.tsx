import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeNext, verifyHref } from "@/lib/magic-link";

export const metadata: Metadata = { title: "Finish signing in", robots: { index: false } };

/** Where an emailed link lands. Signing in takes a click, so a mail scanner opening the link can't spend it. */
export default async function FinishEmailSignIn({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const token = typeof q.token === "string" ? q.token : "";
  if (!token) redirect("/login");
  const next = safeNext(typeof q.next === "string" ? q.next : null);
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl">Finish signing in</CardTitle>
            <CardDescription>One click and you're in. The link works once.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="lg" className="w-full" render={<a href={verifyHref(token, next)} data-testid="finish-sign-in" />}>Sign in to Cadence</Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
