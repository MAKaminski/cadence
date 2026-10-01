import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireSubscriber } from "@/lib/session";
import { isDemo } from "@/lib/mode";
import { PERSONA } from "@/lib/demo-persona";
import { PLANNER } from "@/lib/catalog";
import { advise, GROUPS, INPUTS, strategy, type InputDef } from "@/lib/inputs";
import { signals } from "@/services/inputs";
import { AdviceLine, DirectionChip, DIRECTIONS } from "@/components/direction";
import { CheckinForm } from "../checkin-form";
import { AutoPublish } from "../settings/auto-publish";
import { SeedButton } from "../results/seed-button";
import * as E from "./editors";

export const metadata: Metadata = { title: "Inputs" };

export default async function InputsPage() {
  const user = await requireSubscriber();
  const { signals: s, plan, profile, channels, examplesOn } = await signals(user.id);
  const demo = isDemo();
  const shown = INPUTS.filter((i) => !i.flag || examplesOn);
  const head = strategy(s);
  const live = channels.filter((c) => c.status === "live");

  const editor = (i: InputDef) => {
    const p = profile!;
    switch (i.editor) {
      case "text": return <E.SetupFieldEditor id={i.id} field={i.id as "role"} label={i.label} value={p[i.id as "role"]} />;
      case "lines": {
        const v = p[i.id as "facts" | "topics" | "noGo"];
        return <E.SetupFieldEditor id={i.id} field={i.id as "facts"} label={i.label} value={v.join("\n")} multiline hint={i.id === "noGo" ? "One per line. Optional." : "One per line."} />;
      }
      case "samples": return <E.SamplesEditor value={p.voiceSamples} />;
      case "model": return <E.ModelEditor value={p.model} />;
      case "checkin": return <CheckinForm example={demo ? PERSONA.checkin : undefined} />;
      case "examples": return (
        <p className="text-sm">
          <span className="font-medium tabular-nums">{s.examples?.rated ?? 0}</span> rated examples are steering drafts. Ratings are per example:{" "}
          <Link href="/app/examples" className="text-primary underline-offset-4 hover:underline">rate them on Examples</Link>.
        </p>
      );
      case "posts": return <E.PostsEditor value={plan.posting.perWeek} max={PLANNER.postsPerWeekMax} />;
      case "slots": return <E.SlotsEditor rows={plan.posting.rows} />;
      case "comments": return <E.CommentsEditor value={plan.engage.perDay} max={PLANNER.commentsPerDayMax} />;
      case "window": return <E.WindowEditor perDay={plan.engage.perDay} window={[plan.volume.engage.window[0], plan.volume.engage.window[1]]} gap={plan.volume.engage.min_gap} />;
      case "pause": return <E.PauseEditor paused={s.paused} />;
      case "auto-publish": return <AutoPublish on={s.autoPublish.on} unlocked={s.autoPublish.left === 0} remaining={s.autoPublish.left} />;
      case "channels": return <E.ChannelsEditor channels={live} demo={demo} />;
      case "channel-drafting": return <E.DraftingEditor channels={live} demo={demo} />;
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Inputs</h1>
        <p className="text-muted-foreground">
          Everything you tell Cadence, in one place. Change an input here or on its own page; both save to the same place.
          Each one says what it drives and whether your results say to keep it, raise it or lower it.
        </p>
        <div className="flex flex-col gap-2 rounded-xl border p-4" data-testid="strategy">
          <p className="text-sm font-medium">Current strategy</p>
          <AdviceLine a={head} />
          {demo && !s.weeks.some((w) => w.posts) && <SeedButton />}
        </div>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-label="Direction key">
          {(Object.keys(DIRECTIONS) as (keyof typeof DIRECTIONS)[]).map((d) => <DirectionChip key={d} d={d} />)}
          <span>from your last 4 weeks on Results. Open a rule under each input to see exactly when it changes.</span>
        </p>
        <nav aria-label="Input groups" className="flex flex-wrap gap-2">
          {GROUPS.map((g) => <a key={g.id} href={`#${g.id}`} className="rounded-full border px-3 py-1 text-sm hover:bg-muted">{g.title}</a>)}
        </nav>
      </div>

      {GROUPS.map((g) => {
        const items = shown.filter((i) => i.group === g.id);
        if (!items.length) return null;
        return (
          <section key={g.id} id={g.id} aria-labelledby={`h-${g.id}`} className="flex scroll-mt-6 flex-col gap-3">
            <div>
              <h2 id={`h-${g.id}`} className="text-lg font-semibold">{g.title}</h2>
              <p className="text-sm text-muted-foreground">{g.blurb}</p>
            </div>
            <ul className="flex flex-col gap-3">
              {items.map((i) => {
                const a = advise(i.id, s);
                return (
                  <li key={i.id} id={`input-${i.id}`} data-testid={`input-${i.id}`}
                    className="grid scroll-mt-6 gap-3 rounded-xl border p-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-6">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{i.label}</h3>
                        <DirectionChip d={a.direction} />
                      </div>
                      <p className="text-sm">{i.what}</p>
                      <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Drives:</span> {i.why}</p>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Direction:</span> {a.reason}{" "}
                        <Link href={a.href} className="text-primary underline-offset-4 hover:underline">See why</Link>
                      </p>
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer">How this direction is set</summary>
                        <p className="mt-1">{i.rule}</p>
                      </details>
                      <Link href={i.home.href} className="inline-flex items-center gap-1 self-start text-sm text-primary underline-offset-4 hover:underline">
                        On {i.home.label}<ArrowRight className="size-3.5" aria-hidden />
                      </Link>
                    </div>
                    <div className="min-w-0">{editor(i)}</div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
