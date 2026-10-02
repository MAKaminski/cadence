"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { bestPosts, quickFill, saveAbout, saveRhythm, saveVoice } from "./actions";
import { numbersLine, type RankedPost } from "@/lib/activity-posts";
import { defaultsOf, joinList, picksFor, splitList, toggle, type PickKey } from "@/lib/setup-picks";
import { hasContent, readExport, wanted, type LinkedInProfile } from "@/lib/linkedin-export";
import { readTexts } from "@/lib/zip-lite";
import type { SetupSuggestion } from "@/lib/setup-suggest";

type Lists = Record<PickKey, string[]>;
type Initial = Lists & {
  step: number;
  role: string; facts: string; samples: [string, string, string];
  perWeek: number; days: string[]; time: string; model: "claude-sonnet-5" | "claude-opus-5";
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const TITLES = ["About you", "Your voice", "Your rhythm"];
const WHY = [
  "Cadence writes for a specific person and audience. The facts list is the only source of claims it will make on your behalf, so nothing invented reaches your feed.",
  "Pick what you want to be known for, what stays out, and how you sound. Your own posts, if you have some, teach it your voice best.",
  "How often and when you post. Drafts arrive before each slot for you to approve. You can change all of this later on Inputs.",
];
const EXPORT_URL = "https://www.linkedin.com/mypreferences/d/download-my-data";
const ACTIVITY_URL = "https://www.linkedin.com/in/me/recent-activity/all/";
const SOURCE: Record<RankedPost["source"], string> = { activity: "From your Activity page", cadence: "Posted through Cadence", export: "From your export · no numbers" };

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Click to pick as many as fit; type to add your own. */
function Picks({ k, label, hint, options, value, onChange }: {
  k: PickKey; label: string; hint: string; options: string[]; value: string[]; onChange: (v: string[]) => void;
}) {
  const [own, setOwn] = useState("");
  const add = () => { const x = own.trim(); if (x && !value.some((y) => same(x, y))) onChange([...value, x]); setOwn(""); };
  const extra = value.filter((x) => !options.some((o) => same(o, x)));
  return (
    <fieldset className="flex flex-col gap-2" data-testid={`picks-${k}`}>
      <legend className="mb-2 text-sm font-medium leading-none">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {[...options, ...extra].map((o) => {
          const on = value.some((x) => same(x, o));
          return (
            <button type="button" key={o} aria-pressed={on} onClick={() => onChange(toggle(value, o))}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}>
              <span aria-hidden>{on ? "✓ " : "+ "}</span>{o}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Input aria-label={`Add your own: ${label}`} placeholder="Add your own" value={own} className="max-w-sm"
          onChange={(e) => setOwn(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button type="button" variant="outline" onClick={add} disabled={!own.trim()}>Add</Button>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </fieldset>
  );
}

type Example = { role: string; audience: string; goals: string; facts: string; samples: [string, string, string]; topics: string; noGo: string };

const mergeLines = (a: string, b: string[]) => {
  const seen = new Set<string>();
  return [...a.split("\n"), ...b].map((x) => x.trim()).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())).join("\n");
};

export function Stepper({ initial, example, returnToApp }: { initial: Initial; example?: Example; returnToApp?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(Math.min(Math.max(initial.step, 1), 3));
  const [v, setV] = useState(initial);
  // A list nobody has touched shows the defaults for what the person does, and follows it as they type.
  const [touched, setTouched] = useState<Record<PickKey, boolean>>(() => ({
    audience: initial.audience.length > 0, goals: initial.goals.length > 0, topics: initial.topics.length > 0,
    noGo: initial.noGo.length > 0 || initial.step > 2, style: initial.style.length > 0 || initial.step > 2,
  }));
  const [suggested, setSuggested] = useState<Partial<Lists>>({});
  const [li, setLi] = useState<LinkedInProfile | null>(null);
  const [pasted, setPasted] = useState("");
  const [pending, start] = useTransition();
  const [filling, startFill] = useTransition();
  const file = useRef<HTMLInputElement>(null);
  // Step 2: candidates for the three samples, best first, and the ones ticked (at most three).
  const [best, setBest] = useState<RankedPost[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [activity, setActivity] = useState("");
  const set = <K extends keyof Initial>(k: K, val: Initial[K]) => setV((x) => ({ ...x, [k]: val }));

  const picks = useMemo(() => picksFor(v.role, v.audience.join(" ")), [v.role, v.audience]);
  const options = (k: PickKey) => {
    const base = picks[k].map((p) => p.label);
    return [...(suggested[k] ?? []).filter((x) => !base.some((b) => same(b, x))), ...base];
  };
  const list = (k: PickKey) => (touched[k] ? v[k] : defaultsOf(picks[k]));
  const setList = (k: PickKey) => (val: string[]) => { setTouched((t) => ({ ...t, [k]: true })); set(k, val); };

  const apply = (s: SetupSuggestion) => {
    setV((x) => {
      const samples = [...x.samples] as Initial["samples"];
      let i = 0;
      for (const t of s.samples) { while (i < 3 && samples[i].trim()) i++; if (i < 3) samples[i++] = t; }
      return { ...x, role: x.role.trim() ? x.role : s.role, facts: mergeLines(x.facts, s.facts), samples,
        audience: s.audience, goals: s.goals, topics: s.topics, noGo: s.noGo, style: s.style };
    });
    setTouched({ audience: true, goals: true, topics: true, noGo: true, style: true });
    setSuggested({ audience: s.audience, goals: s.goals, topics: s.topics, noGo: s.noGo, style: s.style });
    const what = [s.role && "what you do", s.facts.length && `${s.facts.length} facts`, s.samples.length && `${s.samples.length} of your posts`, "your picks"].filter(Boolean).join(", ");
    toast.success(`Filled in ${what}${s.from.length ? ` from ${s.from.join(" and ")}` : ""}. Check each answer, then save.`);
  };

  const run = async (linkedin: LinkedInProfile | null) => {
    if (!linkedin && !pasted.trim() && !v.role.trim()) { toast.error("Upload your LinkedIn export or paste your profile, or type what you do first."); return; }
    const res = await quickFill({
      linkedin: linkedin ?? undefined, pasted: pasted.trim() || undefined, role: v.role, facts: v.facts,
      audience: touched.audience ? v.audience : [], goals: touched.goals ? v.goals : [],
    });
    if (!res.ok) { toast.error(res.error); return; }
    apply(res.suggestion);
  };
  const fill = () => startFill(() => run(li));

  const upload = (files: FileList | null) => startFill(async () => {
    if (!files?.length) return;
    try {
      const texts: Record<string, string> = {};
      for (const f of Array.from(files)) {
        if (/\.zip$/i.test(f.name)) Object.assign(texts, await readTexts(f, wanted));
        else if (wanted(f.name)) texts[f.name] = await f.text();
      }
      const p = readExport(texts);
      if (!hasContent(p)) { toast.error("No profile, positions, skills or posts in that file. Upload the LinkedIn export .zip as it came."); return; }
      setLi(p);
      await run(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally { if (file.current) file.current.value = ""; }
  });

  const fillSamples = (texts: string[]) => set("samples", [texts[0] ?? "", texts[1] ?? "", texts[2] ?? ""]);
  const findBest = (paste?: string) => startFill(async () => {
    const res = await bestPosts({ pasted: paste?.trim() || undefined, exportPosts: li?.posts.slice(0, 30) ?? [] });
    if (!res.ok) { toast.error(res.error); return; }
    setBest(res.posts);
    if (res.scored) {
      // Deliberate default: the three that did best, in order.
      const top = res.posts.filter((x) => x.score != null).slice(0, 3).map((x) => x.text);
      setPicked(top); fillSamples(top);
      if (paste) toast.success(`Ranked ${res.scored} of your posts by engagement. The top ${top.length} are ticked.`);
    } else if (paste) toast.error("No posts with numbers in that paste. Copy the Posts tab of your Activity page, after scrolling to load them.");
  });
  // On reaching step 2, show what's already known: posts published through Cadence, and the export's.
  useEffect(() => { if (step === 2 && best === null) findBest(); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (text: string) => {
    const on = picked.includes(text);
    if (!on && picked.length >= 3) { toast.error("Three posts at most. Untick one first."); return; }
    const next = on ? picked.filter((x) => x !== text) : [...picked, text];
    const ordered = (best ?? []).map((x) => x.text).filter((t) => next.includes(t)); // keep rank order
    setPicked(ordered); fillSamples(ordered);
  };

  const submit = () => start(async () => {
    const res = step === 1 ? await saveAbout({ role: v.role, audience: joinList("audience", list("audience")), goals: joinList("goals", list("goals")), facts: v.facts })
      : step === 2 ? await saveVoice({ samples: v.samples, style: list("style"), topics: joinList("topics", list("topics")), noGo: joinList("noGo", list("noGo")) })
      : await saveRhythm({ perWeek: v.perWeek, days: v.days as never, time: v.time, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, model: v.model });
    if (!res.ok) { toast.error(res.error); return; }
    if (step < 3) { setStep(step + 1); window.scrollTo({ top: 0 }); }
    else if (returnToApp) { window.location.assign("app.cadence.ios://subscribed"); } // back to the iPhone app
    else { toast.success("You're set up. Your first check-in is next."); router.push("/app"); }
  });

  const fillExample = (e: Example) => {
    if (step === 1) {
      setV((x) => ({ ...x, role: e.role, audience: splitList("audience", e.audience), goals: splitList("goals", e.goals), facts: e.facts }));
      setTouched((t) => ({ ...t, audience: true, goals: true }));
    } else {
      setV((x) => ({ ...x, samples: e.samples, topics: splitList("topics", e.topics), noGo: splitList("noGo", e.noGo) }));
      setTouched((t) => ({ ...t, topics: true, noGo: true }));
    }
  };

  const readFromLi = li && [li.headline && "headline", li.positions.length && `${li.positions.length} roles`, li.skills.length && `${li.skills.length} skills`,
    li.posts.length ? `${li.posts.length} posts` : "no posts (LinkedIn leaves Shares.csv out of the quick archive; you can paste your Activity page on the next step)"].filter(Boolean).join(", ");

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
          <Button type="button" variant="link" className="mt-1 px-0" onClick={() => fillExample(example)}>Fill in the example answers (demo)</Button>
        )}
      </div>

      {step === 1 && (
        <section className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4" data-testid="quick-fill">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-medium">Quick fill from your LinkedIn</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                LinkedIn sign-in shares only your name, email and photo. Add your profile below and Cadence fills in this page and the next:
                what you do, your facts, your posts and your picks.
              </p>
            </div>
            <Button type="button" onClick={fill} disabled={filling}>{filling ? "Filling…" : "Quick fill"}</Button>
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <label className="font-medium" htmlFor="li-export">Upload your LinkedIn export <span className="font-normal text-muted-foreground">(most complete: roles, skills and posts)</span></label>
            <input ref={file} id="li-export" type="file" accept=".zip,.csv" multiple disabled={filling} onChange={(e) => upload(e.target.files)}
              className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm" />
            <p className="text-xs text-muted-foreground">
              Get it from <a href={EXPORT_URL} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-4">LinkedIn → Get a copy of your data</a>:
              choose Profile, Positions, Skills and Shares. LinkedIn emails a link, usually within minutes. Only those files leave your browser.
            </p>
            {readFromLi && <p className="text-xs" data-testid="li-read">Read from your export: {readFromLi}.</p>}
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Or paste your profile <span className="font-normal text-muted-foreground">(instant)</span></summary>
            <p className="my-1 text-xs text-muted-foreground">Open your LinkedIn profile, select all (⌘A or Ctrl+A), copy, paste it here, then press Quick fill.</p>
            <Textarea aria-label="Pasted LinkedIn profile" rows={4} className="max-h-32 overflow-y-auto" value={pasted} onChange={(e) => setPasted(e.target.value)} />
          </details>
          <p className="text-xs text-muted-foreground" data-testid="bring-history">
            Have a ChatGPT or Claude history? <Link href="/onboarding/import" className="font-medium text-primary underline underline-offset-4">Import from ChatGPT or Claude</Link> and
            Cadence suggests facts, topics and posts from it.
          </p>
        </section>
      )}

      {step === 2 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-3 text-sm" data-testid="quick-fill">
          <span className="text-muted-foreground">The ticked picks suit what you do. Change any of them, or let Cadence choose from your answers{li ? " and your LinkedIn export" : ""}.</span>
          <Button type="button" variant="outline" onClick={fill} disabled={filling}>{filling ? "Filling…" : "Quick fill"}</Button>
        </div>
      )}

      <form className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {step === 1 && <>
          <Field id="role" label="What do you do?" hint="In your own words, e.g. Swing trader who teaches options; founder of a property-tech startup">
            <Input id="role" value={v.role} onChange={(e) => set("role", e.target.value)} required />
          </Field>
          <Picks k="audience" label="Who do you want to reach?" hint="Pick as many as fit. The suggestions follow what you do." options={options("audience")} value={list("audience")} onChange={setList("audience")} />
          <Picks k="goals" label="What should posting do for you?" hint="Pick one or two, or add your own if yours is more specific." options={options("goals")} value={list("goals")} onChange={setList("goals")} />
          <Field id="facts" label="Facts Cadence may state about you" hint="One per line: employers, roles, numbers, results, credentials. Anything not here stays out of your posts.">
            <Textarea id="facts" rows={6} value={v.facts} onChange={(e) => set("facts", e.target.value)} placeholder={"Led a 12-person platform team at Acme Bank, 2021–2024\nCut loan processing time from 9 days to 2\nBased in Atlanta"} required />
          </Field>
        </>}

        {step === 2 && <>
          <Picks k="topics" label="Topics you want to be known for" hint="Pick three to five. Add your own for anything specific to you." options={options("topics")} value={list("topics")} onChange={setList("topics")} />
          <Picks k="noGo" label="Never write about" hint="Cadence keeps these out of every draft. The ticked ones suit most people." options={options("noGo")} value={list("noGo")} onChange={setList("noGo")} />
          <Picks k="style" label="How do you sound?" hint="Enough to start on its own. Your own posts below make the match closer." options={options("style")} value={list("style")} onChange={setList("style")} />
          <section className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4" data-testid="best-posts">
            <div>
              <h2 className="font-medium">Your best posts</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Cadence learns your voice from three of your posts, best first. LinkedIn doesn&apos;t share post numbers with apps, so paste your Activity page:
                Cadence ranks your posts by reactions + 2 × comments + 3 × reposts and ticks the top three.
              </p>
            </div>
            <ol className="list-decimal pl-5 text-sm text-muted-foreground">
              <li>Open <a href={ACTIVITY_URL} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-4">your Activity page</a> and scroll until your last ~20 posts have loaded.</li>
              <li>Select all (⌘A or Ctrl+A) and copy.</li>
              <li>Paste it here.</li>
            </ol>
            <Textarea aria-label="Pasted Activity page" rows={3} className="max-h-32 overflow-y-auto" value={activity} onChange={(e) => setActivity(e.target.value)} />
            <div><Button type="button" onClick={() => findBest(activity)} disabled={filling || !activity.trim()}>{filling ? "Ranking…" : "Find my best posts"}</Button></div>
            {best && best.length > 0 && (
              <ul className="flex flex-col gap-2" aria-label="Your posts, best first">
                {best.map((p, i) => {
                  const on = picked.includes(p.text);
                  return (
                    <li key={p.text.slice(0, 80) + i}>
                      <button type="button" aria-pressed={on} data-testid="best-post" onClick={() => pick(p.text)}
                        className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${on ? "border-primary bg-background ring-2 ring-primary/30" : "bg-background hover:bg-muted"}`}>
                        <span className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{on ? "✓ Using this post" : "+ Use this post"}</span>
                          <span data-testid="best-post-numbers">{p.score != null ? `${numbersLine(p)} · score ${p.score.toLocaleString("en-US")}` : SOURCE[p.source]}</span>
                        </span>
                        <span className="mt-1 line-clamp-3 block whitespace-pre-line">{p.text}</span>
                        {p.score != null && <span className="mt-1 block text-xs text-muted-foreground">{SOURCE[p.source]}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          {[0, 1, 2].map((i) => (
            <Field key={i} id={`sample${i}`} label={`A post you've written (${i + 1} of 3)`} hint={i === 0 ? "Filled from the posts you tick above, or paste your own. Optional once you've picked how you sound." : undefined}>
              <Textarea id={`sample${i}`} rows={5} value={v.samples[i]} onChange={(e) => { const s = [...v.samples] as Initial["samples"]; s[i] = e.target.value; set("samples", s); }} />
            </Field>
          ))}
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
          <Button type="submit" size="lg" disabled={pending || filling}>{pending ? "Saving…" : step < 3 ? "Save and continue" : "Finish setup"}</Button>
        </div>
      </form>
    </div>
  );
}
