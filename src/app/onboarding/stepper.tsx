"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { saveAbout, saveRhythm, saveVoice } from "./actions";

type Initial = {
  step: number;
  role: string; audience: string; goals: string; facts: string;
  samples: [string, string, string]; topics: string; noGo: string;
  perWeek: number; days: string[]; time: string; model: "claude-sonnet-5" | "claude-opus-5";
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const TITLES = ["About you", "Your voice", "Your rhythm"];
const WHY = [
  "Cadence writes for a specific person and audience. The facts list is the only source of claims it will make on your behalf, so nothing invented reaches your feed.",
  "Your own posts teach it how you sound: sentence length, tone, what you never say. Topics steer what it writes about; the no-go list keeps it away from the rest.",
  "How often and when you post. Drafts arrive before each slot for you to approve. You can change all of this later on Inputs.",
];

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

type Example = { role: string; audience: string; goals: string; facts: string; samples: [string, string, string]; topics: string; noGo: string };

export function Stepper({ initial, example, returnToApp }: { initial: Initial; example?: Example; returnToApp?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(Math.min(Math.max(initial.step, 1), 3));
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const set = <K extends keyof Initial>(k: K, val: Initial[K]) => setV((x) => ({ ...x, [k]: val }));

  const submit = () => start(async () => {
    const res = step === 1 ? await saveAbout({ role: v.role, audience: v.audience, goals: v.goals, facts: v.facts })
      : step === 2 ? await saveVoice({ samples: v.samples, topics: v.topics, noGo: v.noGo })
      : await saveRhythm({ perWeek: v.perWeek, days: v.days as never, time: v.time, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, model: v.model });
    if (!res.ok) { toast.error(res.error); return; }
    if (step < 3) { setStep(step + 1); window.scrollTo({ top: 0 }); }
    else if (returnToApp) { window.location.assign("app.cadence.ios://subscribed"); } // back to the iPhone app
    else { toast.success("You're set up. Your first check-in is next."); router.push("/app"); }
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Step {step} of 3 · saved as you go</p>
        <Progress value={(step - 1) * 33.4 + 33.3} aria-label="Setup progress" />
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{TITLES[step - 1]}</h1>
        <p className="mt-2 text-muted-foreground">{WHY[step - 1]}</p>
        {example && step < 3 && (
          <Button type="button" variant="link" className="mt-1 px-0" onClick={() => setV((x) => step === 1
            ? { ...x, role: example.role, audience: example.audience, goals: example.goals, facts: example.facts }
            : { ...x, samples: example.samples, topics: example.topics, noGo: example.noGo })}>
            Fill in the example answers (demo)
          </Button>
        )}
      </div>

      <form className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {step === 1 && <>
          <Field id="role" label="What do you do?" hint="e.g. Founder of a property-tech startup, ex-banker">
            <Input id="role" value={v.role} onChange={(e) => set("role", e.target.value)} required />
          </Field>
          <Field id="audience" label="Who do you want to reach?" hint="e.g. CFOs at mid-size lenders; engineers who build AI agents">
            <Input id="audience" value={v.audience} onChange={(e) => set("audience", e.target.value)} required />
          </Field>
          <Field id="goals" label="What should posting do for you?" hint="e.g. Find design partners, get hired, build a following in my niche">
            <Textarea id="goals" rows={2} value={v.goals} onChange={(e) => set("goals", e.target.value)} required />
          </Field>
          <Field id="facts" label="Facts Cadence may state about you" hint="One per line: employers, roles, numbers, results, credentials. Anything not here stays out of your posts.">
            <Textarea id="facts" rows={6} value={v.facts} onChange={(e) => set("facts", e.target.value)} placeholder={"Led a 12-person platform team at Acme Bank, 2021–2024\nCut loan processing time from 9 days to 2\nBased in Atlanta"} required />
          </Field>
        </>}

        {step === 2 && <>
          {[0, 1, 2].map((i) => (
            <Field key={i} id={`sample${i}`} label={`A post you've written (${i + 1} of 3)`} hint={i === 0 ? "Paste the full text. Posts that did well are best; any three of yours will do." : undefined}>
              <Textarea id={`sample${i}`} rows={5} value={v.samples[i]} onChange={(e) => { const s = [...v.samples] as Initial["samples"]; s[i] = e.target.value; set("samples", s); }} />
            </Field>
          ))}
          <Field id="topics" label="Topics you want to be known for" hint="Comma-separated or one per line">
            <Textarea id="topics" rows={2} value={v.topics} onChange={(e) => set("topics", e.target.value)} required />
          </Field>
          <Field id="nogo" label="Never write about" hint="Optional: employers you can't mention, politics, anything off-limits">
            <Textarea id="nogo" rows={2} value={v.noGo} onChange={(e) => set("noGo", e.target.value)} />
          </Field>
        </>}

        {step === 3 && <>
          <Field id="perweek" label="Posts per week">
            <div className="flex gap-2" role="radiogroup" aria-label="Posts per week">
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} role="radio" aria-checked={v.perWeek === n} onClick={() => set("perWeek", n)}
                  className={`size-10 rounded-lg border text-sm font-medium ${v.perWeek === n ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{n}</button>
              ))}
            </div>
          </Field>
          <Field id="days" label="Days you post" hint="Posts go out on these days, spread out, up to your weekly number.">
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => {
                const on = v.days.includes(d);
                return (
                  <button type="button" key={d} aria-pressed={on} onClick={() => set("days", on ? v.days.filter((x) => x !== d) : [...v.days, d])}
                    className={`rounded-lg border px-3 py-2 text-sm ${on ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}>{d}</button>
                );
              })}
            </div>
          </Field>
          <Field id="time" label="Time of day" hint="In your local time zone.">
            <Input id="time" type="time" className="w-36" value={v.time} onChange={(e) => set("time", e.target.value)} required />
          </Field>
          <Field id="model" label="Writing model">
            <div className="grid gap-3 sm:grid-cols-2">
              {([["claude-sonnet-5", "Claude Sonnet 5", "Recommended. Fast, strong writing; your monthly allowance goes furthest."],
                 ["claude-opus-5", "Claude Opus 5", "Richer, more careful drafts. Uses your monthly allowance about 2.5× faster."]] as const).map(([id, name, desc]) => (
                <button type="button" key={id} role="radio" aria-checked={v.model === id} onClick={() => set("model", id)}
                  className={`rounded-lg border p-3 text-left ${v.model === id ? "border-primary ring-2 ring-primary/30" : "hover:bg-muted"}`}>
                  <span className="block font-medium">{name}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{desc}</span>
                </button>
              ))}
            </div>
          </Field>
          <p className="rounded-lg bg-muted p-3 text-sm">Every draft waits for your approval before it posts. You can turn on automatic posting later, once you trust it.</p>
        </>}

        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" disabled={step === 1 || pending} onClick={() => setStep(step - 1)}>Back</Button>
          <Button type="submit" size="lg" disabled={pending}>{pending ? "Saving…" : step < 3 ? "Save and continue" : "Finish setup"}</Button>
        </div>
      </form>
    </div>
  );
}
