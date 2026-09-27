"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { seedDemoHistory } from "@/lib/demo";

export function SeedButton() {
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" disabled={pending} onClick={() => start(async () => {
      const r = await seedDemoHistory();
      if (r.ok) toast.success("Added 8 weeks of sample history."); else toast.error(r.error);
    })}>{pending ? "Adding…" : "Add 8 weeks of sample history (demo)"}</Button>
  );
}
