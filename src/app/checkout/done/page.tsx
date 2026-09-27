import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { SiteHeader } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "You're subscribed", robots: { index: false } };

/** Where web checkout lands. From the iOS app, one tap returns to it (app.cadence.ios://subscribed). */
export default async function Done({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const fromIos = (await searchParams).from === "ios";
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CheckCircle2 className="size-8 text-primary" aria-hidden />
            <CardTitle className="text-xl">Your trial has started</CardTitle>
            <CardDescription>{fromIos ? "Head back to the app to finish setting up." : "Next, a few minutes of setup."}</CardDescription>
          </CardHeader>
          <CardContent>
            {fromIos
              ? <Button size="lg" className="w-full" render={<a href="app.cadence.ios://subscribed" />}>Return to the Cadence app</Button>
              : <Button size="lg" className="w-full" render={<Link href="/onboarding" />}>Continue to setup</Button>}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
