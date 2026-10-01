"use client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

/** The person's photo (uploaded, or their LinkedIn picture), falling back to their initials.
 *  `decorative` when the name is already written next to it. */
export function UserAvatar({ name, src, size = "default", decorative = false, className }: {
  name: string; src: string | null; size?: "default" | "sm" | "lg"; decorative?: boolean; className?: string;
}) {
  return (
    <Avatar size={size} className={className}>
      {/* The LinkedIn picture is on LinkedIn's CDN; don't tell it which Cadence page asked. */}
      {src && <AvatarImage src={src} alt={decorative ? "" : name} referrerPolicy="no-referrer" />}
      <AvatarFallback aria-hidden={decorative || undefined}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
