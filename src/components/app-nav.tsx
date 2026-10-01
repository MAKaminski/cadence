"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarClock, Eye, FilePen, Gauge, History, PenLine, Radio, Send, Settings, SlidersHorizontal, Sparkles, SquarePen } from "lucide-react";
import { cn } from "@/lib/utils";
import { AccountNav } from "@/components/account-nav";

/** What you do on a page: change things (act), read (report), or both. Each kind has a colour, an icon
 *  and a label, so the colour is never the only cue. */
export type Kind = "act" | "report" | "both";
export const KINDS: Record<Kind, { label: string; hint: string; icon: typeof Eye; bar: string; chip: string }> = {
  act: { label: "Act", hint: "You change things here", icon: SquarePen, bar: "border-primary", chip: "bg-primary/10 text-primary" },
  report: { label: "Report", hint: "Read only", icon: Eye, bar: "border-sky-600", chip: "bg-sky-600/10 text-sky-800 dark:text-sky-300" },
  both: { label: "Report + edit", hint: "Read, with a few settings", icon: FilePen, bar: "border-amber-500", chip: "bg-amber-500/15 text-amber-900 dark:text-amber-200" },
};

type Item = { href: string; label: string; icon: typeof PenLine; flag?: string; admin?: boolean; children?: Item[] };

/** The signed-in app's sections, grouped by what you do there. Inputs holds the pages where inputs
 *  live (shown under it on desktop; reached from the Inputs page on a phone). Items marked `flag` show
 *  only when that feature is on for the person; `admin` only for operators. */
export const SECTIONS: { kind: Kind; items: Item[] }[] = [
  { kind: "act", items: [
    { href: "/app", label: "This week", icon: PenLine },
    { href: "/app/inputs", label: "Inputs", icon: SlidersHorizontal, children: [
      { href: "/app/plan", label: "Plan", icon: CalendarClock },
      { href: "/app/channels", label: "Channels", icon: Radio },
      { href: "/app/examples", label: "Examples", icon: Sparkles, flag: "examples" },
      { href: "/app/import", label: "AI history", icon: History },
    ] },
  ] },
  // Published reads like a report, but you add each post's numbers there, so it is Report + edit.
  { kind: "both", items: [{ href: "/app/published", label: "Published", icon: Send }] },
  { kind: "report", items: [{ href: "/app/results", label: "Results", icon: BarChart3 }] },
];

/** Account items, pinned to the bottom of the nav. Settings is drawn as the account entry (your photo,
 *  your name and the gear, account-nav.tsx) when the layout passes `account`. */
export const FOOTER: (Item & { kind: Kind })[] = [
  { href: "/app/settings", label: "Settings", icon: Settings, kind: "both" },
  { href: "/app/admin/usage", label: "Usage", icon: Gauge, admin: true, kind: "report" },
];

export type NavAccess = { flags: string[]; admin: boolean };
export type NavAccount = { name: string; avatar: string | null };

const isActive = (path: string, href: string) => (href === "/app" ? path === "/app" : path === href || path.startsWith(`${href}/`));

/** The kind of the page at `path`, from the nav itself. */
export function kindOf(path: string): Kind | null {
  for (const s of SECTIONS) for (const i of s.items) if ([i, ...(i.children ?? [])].some((x) => isActive(path, x.href))) return s.kind;
  return FOOTER.find((i) => isActive(path, i.href))?.kind ?? null;
}

function NavLink({ item, kind, path, child, iconOnlyOnPhone }: { item: Item; kind: Kind; path: string; child?: boolean; iconOnlyOnPhone?: boolean }) {
  const { href, label, icon: Icon } = item, k = KINDS[kind], on = isActive(path, href);
  return (
    <Link href={href} aria-current={on ? "page" : undefined} title={`${k.label}: ${k.hint.toLowerCase()}`} data-kind={kind}
      className={cn("flex shrink-0 items-center gap-2 rounded-r-md border-l-2 px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:px-3 md:py-2",
        k.bar, on && "bg-muted font-medium text-foreground", child && "hidden md:ml-3 md:flex md:py-1.5")}>
      <Icon className={cn("size-4", child && "size-3.5")} aria-hidden />
      <span className={cn(iconOnlyOnPhone && "sr-only md:not-sr-only")}>{label}</span>
    </Link>
  );
}

function KindLabel({ kind, className }: { kind: Kind; className?: string }) {
  const k = KINDS[kind], Icon = k.icon;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", k.chip, className)}>
      <Icon className="size-3.5" aria-hidden />{k.label}
    </span>
  );
}

export function AppNav({ access = { flags: [], admin: false }, account }: { access?: NavAccess; account?: NavAccount }) {
  const path = usePathname();
  const shown = (i: Item) => (!i.flag || access.flags.includes(i.flag)) && (!i.admin || access.admin);
  return (
    // Phone: one row per kind, labels always visible; the account items sit beside the wordmark.
    // Desktop: a column with a heading per kind, a key, and the account items at the bottom.
    <nav aria-label="App" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 md:flex-1 md:flex-col md:flex-nowrap md:items-stretch md:gap-5">
      {SECTIONS.map((s) => (
        <div key={s.kind} role="group" aria-labelledby={`nav-${s.kind}`} className={cn("flex items-center gap-1 md:flex-col md:items-stretch", s.kind === "act" && "basis-full md:basis-auto")}>
          <p id={`nav-${s.kind}`} className="flex w-20 shrink-0 md:w-auto md:px-1 md:pb-1">
            <KindLabel kind={s.kind} /><span className="sr-only">: {KINDS[s.kind].hint}</span>
          </p>
          {s.items.filter(shown).map((i) => (
            <div key={i.href} className="contents md:flex md:flex-col md:gap-0.5">
              <NavLink item={i} kind={s.kind} path={path} />
              {i.children?.filter(shown).map((c) => <NavLink key={c.href} item={c} kind={s.kind} path={path} child />)}
            </div>
          ))}
        </div>
      ))}
      <dl className="hidden gap-1 border-t pt-4 text-xs text-muted-foreground md:mt-auto md:flex md:flex-col" aria-label="Key">
        {(Object.keys(KINDS) as Kind[]).map((k) => (
          <div key={k} className="flex items-center gap-2"><dt><KindLabel kind={k} /></dt><dd>{KINDS[k].hint}</dd></div>
        ))}
      </dl>
      <div className="absolute top-2.5 right-4 flex items-center gap-1 md:static md:flex-col md:items-stretch">
        {FOOTER.filter(shown).map((i) => (i.href === "/app/settings" && account
          ? <AccountNav key={i.href} name={account.name} avatar={account.avatar} kind={KINDS[i.kind]} className={cn("rounded-l-none border-l-2", KINDS[i.kind].bar)} />
          : <NavLink key={i.href} item={i} kind={i.kind} path={path} iconOnlyOnPhone />))}
      </div>
    </nav>
  );
}

/** A small "what you do here" chip at the top of each page, from the same nav groups. */
export function PageKind() {
  const kind = kindOf(usePathname());
  if (!kind) return null;
  return <p className="mb-4 flex items-center gap-2 text-xs text-muted-foreground" data-testid="page-kind"><KindLabel kind={kind} />{KINDS[kind].hint}</p>;
}
