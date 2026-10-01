"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarClock, Gauge, PenLine, Radio, Send, Settings, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/** The signed-in app's sections, grouped by what you're doing: writing, growing, your account. */
/** Items marked `flag` show only when that feature is on for the person; `admin` only for operators. */
export const SECTIONS = [
  { group: "Write", items: [{ href: "/app", label: "This week", icon: PenLine }, { href: "/app/published", label: "Published", icon: Send }] },
  { group: "Grow", items: [{ href: "/app/plan", label: "Plan", icon: CalendarClock }, { href: "/app/examples", label: "Examples", icon: Sparkles, flag: "examples" }, { href: "/app/results", label: "Results", icon: BarChart3 }] },
  { group: "Account", items: [{ href: "/app/channels", label: "Channels", icon: Radio }, { href: "/app/settings", label: "Settings", icon: Settings }, { href: "/app/admin/usage", label: "Usage", icon: Gauge, admin: true }] },
] as const;

type Item = { href: string; label: string; icon: typeof PenLine; flag?: string; admin?: boolean };
export type NavAccess = { flags: string[]; admin: boolean };

const isActive = (path: string, href: string) => (href === "/app" ? path === "/app" : path === href || path.startsWith(`${href}/`));

export function AppNav({ access = { flags: [], admin: false } }: { access?: NavAccess }) {
  const path = usePathname();
  const shown = (i: Item) => (!i.flag || access.flags.includes(i.flag)) && (!i.admin || access.admin);
  return (
    <nav aria-label="App" className="flex gap-3 overflow-x-auto md:flex-col md:gap-5 md:overflow-visible">
      {SECTIONS.map((s) => (
        <div key={s.group} className="flex gap-1 md:flex-col">
          <p className="hidden px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground md:block">{s.group}</p>
          {(s.items as readonly Item[]).filter(shown).map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={isActive(path, href) ? "page" : undefined}
              className={cn("flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                isActive(path, href) && "bg-muted font-medium text-foreground")}>
              <Icon className="size-4" aria-hidden />{label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
