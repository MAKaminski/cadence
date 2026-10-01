"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";

/** The bottom of the sidebar (top right on small screens): who's signed in, and the gear into Settings. */
export function AccountNav({ name, avatar, className }: { name: string; avatar: string | null; className?: string }) {
  const active = usePathname().startsWith("/app/settings");
  return (
    <Link href="/app/settings" aria-current={active ? "page" : undefined} aria-label="Settings" title={`${name}: Settings`} data-testid="account-nav"
      className={cn("flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active && "bg-muted text-foreground", className)}>
      <UserAvatar name={name} src={avatar} size="sm" decorative />
      <span className="hidden min-w-0 flex-1 truncate md:block" data-testid="account-name">{name}</span>
      <Settings className="size-4 shrink-0" aria-hidden />
    </Link>
  );
}
