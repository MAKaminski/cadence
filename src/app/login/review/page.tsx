import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-chrome";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "App Review sign-in", robots: { index: false } };

/** For Apple's App Review team: the account in the review notes. Public sign-up is disabled. */
export default async function ReviewLogin({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const next = typeof q.next === "string" && /^\/[a-z]/.test(q.next) ? q.next : "/app";
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl">App Review sign-in</CardTitle>
            <CardDescription>For the review account only. Posts from it are recorded and never sent to LinkedIn.</CardDescription>
          </CardHeader>
          <CardContent><ReviewForm next={next} /></CardContent>
        </Card>
      </main>
    </>
  );
}
