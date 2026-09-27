import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { asUser } from "@/db";
import { drafts, inputs } from "@/db/schema";
import { requireSubscriber } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckinForm } from "./checkin-form";

export const metadata: Metadata = { title: "This week" };

export default async function ThisWeek() {
  const user = await requireSubscriber();
  const [recent, pending] = await asUser(user.id, async (tx) => [
    await tx.select().from(inputs).orderBy(desc(inputs.createdAt)).limit(3),
    await tx.select().from(drafts).orderBy(desc(drafts.createdAt)).limit(10),
  ] as const);
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">This week</h1>
        <p className="mt-1 text-muted-foreground">Two minutes of notes in; drafts in your voice out.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Check in</CardTitle>
          <CardDescription>Rough notes are fine. Cadence only uses what you write here and the facts from your setup.</CardDescription>
        </CardHeader>
        <CardContent><CheckinForm /></CardContent>
      </Card>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Drafts</h2>
        {pending.length === 0
          ? <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">{recent.length ? "Your check-in is saved. Drafts appear here once they're written." : "No drafts yet. Save a check-in above to get your first ones."}</p>
          : pending.map((d) => <Card key={d.id}><CardContent className="whitespace-pre-wrap pt-6">{d.body}</CardContent></Card>)}
      </section>
    </div>
  );
}
