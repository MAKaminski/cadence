import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { asUser } from "@/db";
import { profiles } from "@/db/schema";
import { requireSubscriber } from "@/lib/session";
import { Wordmark } from "@/components/site-chrome";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSubscriber();
  const [p] = await asUser(user.id, (tx) => tx.select({ step: profiles.onboardingStep }).from(profiles).where(eq(profiles.userId, user.id)));
  if (!p || p.step <= 3) redirect("/onboarding");
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Wordmark />
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/app">This week</Link>
            <Link href="/app/settings">Settings</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">{children}</main>
    </div>
  );
}
