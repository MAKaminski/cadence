import { CircleAlert, RefreshCw, Wrench } from "lucide-react";
import { ADJUSTMENTS, COUNTS, type Item } from "@/lib/catalog";

export function CountsStrip() {
  const cells = [
    [COUNTS.setup, "settings you choose once"],
    [COUNTS.weekly, "things you do each week"],
    [COUNTS.routines, "routines that run for you"],
  ] as const;
  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      {cells.map(([n, label]) => (
        <div key={label} className="rounded-xl border p-5">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-4xl font-semibold tracking-tight">{n}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ItemList({ items }: { items: (Item & { when?: string })[] }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2">
      {items.map((x, i) => (
        <li key={x.name} className="rounded-lg border p-4">
          <p className="font-medium"><span className="mr-2 text-muted-foreground">{i + 1}.</span>{x.name}</p>
          {x.when && <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-primary">{x.when}</p>}
          <p className="mt-1 text-sm text-muted-foreground">{x.what}</p>
        </li>
      ))}
    </ol>
  );
}

const ICON = { fixed: Wrench, rewritten: RefreshCw, held: CircleAlert } as const;

export function Adjustments() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {ADJUSTMENTS.map((a) => {
        const Icon = ICON[a.outcome];
        return (
          <div key={a.outcome} className="rounded-xl border p-5">
            <p className="flex items-center gap-2 font-semibold"><Icon className="size-4 text-primary" aria-hidden />{a.label}</p>
            <ul className="mt-3 flex flex-col gap-1.5 text-sm text-muted-foreground">{a.items.map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
        );
      })}
    </div>
  );
}
