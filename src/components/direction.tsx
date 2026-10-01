import Link from "next/link";
import { ArrowDown, ArrowUp, Equal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Advice, Direction } from "@/lib/inputs";

export const DIRECTIONS: Record<Direction, { label: string; icon: typeof Equal; cls: string }> = {
  maintain: { label: "Maintain", icon: Equal, cls: "border-border bg-muted text-foreground" },
  increase: { label: "Increase", icon: ArrowUp, cls: "border-emerald-600/40 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300" },
  decrease: { label: "Decrease", icon: ArrowDown, cls: "border-amber-600/40 bg-amber-500/15 text-amber-900 dark:text-amber-200" },
};

/** A direction as an icon and a word (never colour alone), with its reason linked to the evidence. */
export function DirectionChip({ d }: { d: Direction }) {
  const { label, icon: Icon, cls } = DIRECTIONS[d];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", cls)} data-direction={d}>
      <Icon className="size-3.5" aria-hidden />{label}
    </span>
  );
}

export function AdviceLine({ a, className }: { a: Advice; className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-sm", className)}>
      <DirectionChip d={a.direction} />
      <span className="text-muted-foreground">{a.reason}</span>
      <Link href={a.href} className="text-primary underline-offset-4 hover:underline">See why</Link>
    </p>
  );
}
