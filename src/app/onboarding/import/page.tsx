import type { Metadata } from "next";
import Link from "next/link";
import { requireSubscriber } from "@/lib/session";
import { Wordmark } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { ImportPanel } from "@/app/app/import/panel";

export const metadata: Metadata = { title: "Bring your AI history" };

// The optional first step of setup. What's accepted here fills in the setup steps that follow.
export default async function OnboardingImport() {
  const user = await requireSubscriber();
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b"><div className="mx-auto flex h-14 max-w-3xl items-center px-4"><Wordmark /></div></header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Optional · before you start</p>
            <h1 className="text-2xl font-semibold tracking-tight">Bring your AI history</h1>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Upload your ChatGPT or Claude export and Cadence drafts your setup from it: facts, topics, sample posts and what to keep out.
              Accept what&apos;s right; it appears in the next steps, ready to edit.
            </p>
          </div>
          <Button variant="outline" render={<Link href="/onboarding" />}>Continue setup</Button>
        </div>
        <ImportPanel userId={user.id} />
        <div className="mt-8 flex justify-end"><Button size="lg" render={<Link href="/onboarding" />}>Continue setup</Button></div>
      </main>
    </div>
  );
}
