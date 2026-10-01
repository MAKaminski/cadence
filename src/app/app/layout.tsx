import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { asUser } from "@/db";
import { profiles } from "@/db/schema";
import { requireSubscriber } from "@/lib/session";
import { Wordmark } from "@/components/site-chrome";
import { AppNav, PageKind } from "@/components/app-nav";
import { flagOn, isAdmin } from "@/lib/flags";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSubscriber();
  const [p] = await asUser(user.id, (tx) => tx.select({ step: profiles.onboardingStep }).from(profiles).where(eq(profiles.userId, user.id)));
  if (!p || p.step <= 3) redirect("/onboarding");
  const access = { flags: (await flagOn("examples", user)) ? ["examples"] : [], admin: isAdmin(user) };
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="relative border-b md:sticky md:top-0 md:h-dvh md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex flex-col gap-3 px-4 py-3 md:h-full md:gap-8 md:py-6">
          <Wordmark />
          <AppNav access={access} />
        </div>
      </aside>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8 md:py-10"><PageKind />{children}</main>
    </div>
  );
}
