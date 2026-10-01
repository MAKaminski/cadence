import type { Metadata } from "next";
import { requireSubscriber } from "@/lib/session";
import { isDemo } from "@/lib/mode";
import { listChannels } from "@/services/channels";
import { ChannelCard } from "./channel-card";
import { InputsLink } from "@/components/inputs-link";

export const metadata: Metadata = { title: "Channels" };

export default async function ChannelsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireSubscriber();
  const [channels, { error }] = await Promise.all([listChannels(user.id), searchParams]);
  const live = channels.filter((c) => c.status === "live"), planned = channels.filter((c) => c.status === "planned");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Channels</h1>
        <p className="mt-1 text-muted-foreground">
          Where your posts go. Connect a channel in one click; Cadence writes a version of every post that fits it, and you approve each one.
          No API keys needed.
        </p>
        <p className="mt-2"><InputsLink page="/app/channels" /></p>
      </div>
      {error && <p className="rounded-lg border border-red-300 p-3 text-sm text-red-700" role="alert">That connection didn&apos;t finish ({error}). Try again.</p>}
      <section aria-label="Available" className="grid items-start gap-4 md:grid-cols-2" data-testid="channels-live">
        {live.map((c) => <ChannelCard key={c.id} c={c} demo={isDemo()} />)}
      </section>
      <section aria-labelledby="soon" className="flex flex-col gap-3">
        <h2 id="soon" className="text-lg font-semibold">Coming soon</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="channels-planned">
          {planned.map((c) => (
            <li key={c.id} className="rounded-xl border border-dashed p-4">
              <p className="font-medium">{c.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{c.blurb}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
