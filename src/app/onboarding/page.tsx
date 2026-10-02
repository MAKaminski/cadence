import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { asUser } from "@/db";
import { profiles } from "@/db/schema";
import { requireSubscriber } from "@/lib/session";
import { Wordmark } from "@/components/site-chrome";
import { Stepper } from "./stepper";
import { InputsLink } from "@/components/inputs-link";
import { isDemo } from "@/lib/mode";
import { PERSONA } from "@/lib/demo-persona";
import { splitList } from "@/lib/setup-picks";

export const metadata: Metadata = { title: "Set up" };

const str = (x: unknown) => (typeof x === "string" ? x : "");
const list = (x: unknown) => (Array.isArray(x) ? x.map(String) : []);

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const editing = q.edit === "1";
  const fromIos = q.from === "ios";
  const user = await requireSubscriber();
  const [p] = await asUser(user.id, (tx) => tx.select().from(profiles).where(eq(profiles.userId, user.id)));
  if (p && p.onboardingStep > 3 && !editing) redirect(fromIos ? "/checkout/done?from=ios" : "/app");
  const about = (p?.about ?? {}) as Record<string, unknown>;
  const cadence = (p?.cadence ?? {}) as Record<string, unknown>;
  const samples = list(p?.voiceSamples);
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b"><div className="mx-auto flex h-14 max-w-2xl items-center px-4"><Wordmark /></div></header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        {editing && <p className="mb-6"><InputsLink page="/onboarding" /></p>}
        <Stepper returnToApp={fromIos} example={isDemo() ? PERSONA : undefined} initial={{
          step: editing ? Math.min(3, Math.max(1, Number(q.step) || 1)) : (p?.onboardingStep ?? 1),
          role: str(about.role), audience: splitList("audience", str(about.audience)), goals: splitList("goals", str(about.goals)),
          facts: list(p?.facts).join("\n"), style: list(about.style),
          samples: [samples[0] ?? "", samples[1] ?? "", samples[2] ?? ""], topics: list(p?.topics), noGo: list(p?.noGo),
          perWeek: Number(cadence.perWeek ?? 3), days: list(cadence.days).length ? list(cadence.days) : ["Tue", "Wed", "Thu"],
          time: str(cadence.time) || "09:00", model: p?.model ?? "claude-sonnet-5",
        }} />
      </main>
    </div>
  );
}
