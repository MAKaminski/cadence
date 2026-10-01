"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { seedDemoHistory } from "@/lib/demo";
import { SCENARIOS } from "@/lib/sample-scenarios";

/** Demo only: add a sample history, as one of three stories, so Results and Inputs have something to say. */
export function SeedButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Add sample history (demo)" data-testid="seed-history">
      <span className="text-sm text-muted-foreground">Sample history (demo):</span>
      {SCENARIOS.map((s) => (
        <Button key={s.id} size="sm" variant="outline" title={s.blurb} disabled={pending} onClick={() => start(async () => {
          const r = await seedDemoHistory(s.id);
          if (r.ok) { toast.success(`Added sample history: ${s.label.toLowerCase()}.`); router.refresh(); } else toast.error(r.error);
        })}>{s.label}</Button>
      ))}
    </div>
  );
}
