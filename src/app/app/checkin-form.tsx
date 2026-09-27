"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveCheckin } from "./actions";

export function CheckinForm({ example }: { example?: string }) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); start(async () => {
      const r = await saveCheckin({ body });
      if (!r.ok) { toast.error(r.error); return; }
      setBody(""); toast.success("Check-in saved. Drafts will appear here.");
    }); }}>
      <label htmlFor="checkin" className="sr-only">This week's check-in</label>
      <Textarea id="checkin" rows={6} value={body} onChange={(e) => setBody(e.target.value)}
        placeholder={"What happened this week? What are you working on, what did you learn, what are you reading?\nLinks welcome."} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save check-in"}</Button>
        {example && <Button type="button" variant="link" onClick={() => setBody(example)}>Use example notes (demo)</Button>}
      </div>
    </form>
  );
}
