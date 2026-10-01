import type { Metadata } from "next";
import { requireSubscriber } from "@/lib/session";
import { getPlan } from "@/services/plan";
import { PLANNER } from "@/lib/catalog";
import { Planner } from "./planner";

export const metadata: Metadata = { title: "Plan" };

export default async function PlanPage() {
  const user = await requireSubscriber();
  const plan = await getPlan(user.id);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Plan</h1>
        <p className="mt-1 text-muted-foreground">How much you post and comment, and when. Change a number and Cadence works out the times; drag a time to move just that one.</p>
      </div>
      <Planner plan={plan} limits={{ postsPerWeek: PLANNER.postsPerWeekMax, commentsPerDay: PLANNER.commentsPerDayMax, quiet: [...PLANNER.quietHours] }} />
    </div>
  );
}
