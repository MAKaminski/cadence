"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import { saveName } from "./actions";

const PHOTO = "/app/settings/photo";
const MAX = 2 * 1024 * 1024;

export function Profile({ name, avatar, uploaded, linkedin }: { name: string; avatar: string | null; uploaded: boolean; linkedin: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const upload = async (f: File) => {
    if (f.size > MAX) { toast.error("That photo is over the 2 MB limit."); return; }
    setBusy(true);
    const body = new FormData();
    body.set("file", f);
    const res = await fetch(PHOTO, { method: "POST", body }).catch(() => null);
    setBusy(false);
    if (file.current) file.current.value = "";
    if (!res?.ok) { toast.error((await res?.json().catch(() => null))?.error ?? "Couldn't upload that photo. Try again."); return; }
    toast.success("Photo updated.");
    router.refresh();
  };

  const revert = async () => {
    setBusy(true);
    const res = await fetch(PHOTO, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { toast.error("Couldn't remove the photo. Try again."); return; }
    toast.success(linkedin ? "Using your LinkedIn photo." : "Photo removed.");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6 text-sm">
      <div className="flex flex-wrap items-center gap-4">
        <UserAvatar name={value || name} src={avatar} size="lg" className="size-16" />
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground" data-testid="photo-source">
            {uploaded ? "Your uploaded photo." : linkedin ? "Your LinkedIn photo." : "No photo yet: your initials show instead."}
          </p>
          <div className="flex flex-wrap gap-2">
            <input ref={file} id="photo" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Upload a photo"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
            <Button variant="outline" size="sm" disabled={busy} onClick={() => file.current?.click()}>{busy ? "Saving…" : uploaded ? "Replace photo" : "Upload a photo"}</Button>
            {uploaded && <Button variant="ghost" size="sm" disabled={busy} onClick={revert}>{linkedin ? "Use my LinkedIn photo" : "Remove photo"}</Button>}
          </div>
          <p className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 2 MB. Cropped to a square.</p>
        </div>
      </div>
      <form className="flex flex-col gap-2" onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveName(value);
          if (!r.ok) { toast.error(r.error); return; }
          toast.success("Name saved.");
          router.refresh();
        });
      }}>
        <label htmlFor="display-name" className="font-medium">Name</label>
        <div className="flex flex-wrap gap-2">
          <Input id="display-name" className="max-w-xs" value={value} maxLength={80} autoComplete="name" onChange={(e) => setValue(e.target.value)} />
          <Button type="submit" variant="outline" disabled={pending || !value.trim() || value.trim() === name}>{pending ? "Saving…" : "Save name"}</Button>
        </div>
      </form>
    </div>
  );
}
