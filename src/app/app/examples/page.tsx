import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSubscriber } from "@/lib/session";
import { flagOn } from "@/lib/flags";
import { EXAMPLES } from "@/lib/catalog";
import { guidance, list } from "@/services/examples";
import { AutoRefresh } from "../auto-refresh";
import { AddExample, ExampleCard, Teaches } from "./examples";
import { InputsLink } from "@/components/inputs-link";

export const metadata: Metadata = { title: "Examples" };

export default async function ExamplesPage() {
  const user = await requireSubscriber();
  if (!(await flagOn("examples", user))) notFound();
  const [items, taught] = await Promise.all([list(user.id), guidance(user.id)]);
  const pending = items.some((e) => e.analysisStatus === "pending");
  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh active={pending} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Examples</h1>
        <p className="mt-1 text-muted-foreground">
          Posts and visuals you think work, or don&apos;t. Paste a link or upload a file (up to {EXAMPLES.maxBytes / 1048576} MB), give it a thumbs up or down,
          and Cadence studies how it&apos;s built so your drafts borrow the technique, never the words.
        </p>
        <p className="mt-2"><InputsLink page="/app/examples" /></p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <AddExample maxMb={EXAMPLES.maxBytes / 1048576} />
        <Teaches g={taught} />
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground" data-testid="examples-empty">
          No examples yet. Start with one post you wish you had written, and one you scrolled straight past.
        </p>
      ) : (
        <section aria-label="Your examples" className="grid items-start gap-4 md:grid-cols-2" data-testid="examples-list">
          {items.map((e) => <ExampleCard key={`${e.id}:${e.rating}:${e.analysisStatus}`} e={e} />)}
        </section>
      )}
    </div>
  );
}
